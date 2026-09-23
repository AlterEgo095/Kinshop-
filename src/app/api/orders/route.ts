import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
// Phase E — ledger en mode ombre (double écriture financière non bloquante)
import { recordVendorPaymentEntry } from "@/lib/finance"
import {
  PAYMENT_LABELS,
  buildOrderMessage,
  buildWhatsAppLink,
  computeCouponDiscount,
  computeOrderTotals,
  normalizePhone,
  type CouponType,
  type OrderItem,
  type PaymentMethod,
} from "@/lib/kinshop"
import { notifyNewOrder, notifyOrderEvent } from "@/lib/notifier"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { getEnabledPayments, getConfigValue, isFeatureOn } from "@/lib/config-registry"
import { resolveProvider } from "@/lib/payments"
import { isPaymentSimulationEnabled } from "@/lib/simulation"
import { getActiveInstruction, expireOverdueDeclarations } from "@/lib/direct-payments"
import { makeSequentialOrderRef } from "@/lib/invoice-integrity"
import { logAudit, actorFromUser } from "@/lib/audit"
import { canTransitionOrder, ORDER_STATUSES } from "@/lib/order-workflow"
import { restoreOrderStock } from "@/lib/stock"

// LOT 1 — signal interne de conflit de stock (course entre deux commandes) :
// la commande concurrente est refusée 400 sans contaminer les flux d'erreur 500.
class StockConflictError extends Error {}

// POST /api/orders — Créer une commande (calcul 100 % serveur + traçabilité V10)
// V10 : compte client OBLIGATOIRE (flag feature.orderAccounts) ; la commande est
// liée au compte ; référence séquentielle CMD-YYYY-NNNNNN ; événements historisés.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const customerName = String(body.customerName || "").trim()
    const customerPhone = String(body.customerPhone || "").trim()

    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })

    // V10 — Identité client : le backend est l'autorité (jamais le frontend).
    const requireAccounts = await isFeatureOn("orderAccounts")
    const user = await getUserFromRequest(req)
    if (requireAccounts && !user) {
      return unauthorized("Crée un compte ou connecte-toi pour finaliser ta commande.")
    }
    if (!customerName) return NextResponse.json({ error: "Votre nom est requis." }, { status: 400 })
    if (normalizePhone(customerPhone).length < 9) {
      return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })
    // Gouvernance : une boutique suspendue par l'admin ne peut plus recevoir de commandes
    if (store.status !== "active") {
      return NextResponse.json({ error: "Cette boutique est momentanément indisponible." }, { status: 403 })
    }

    // Valider les articles contre la base (jamais faire confiance au client)
    const requested: { productId: string; qty: number }[] = Array.isArray(body.items) ? body.items : []
    if (requested.length === 0) {
      return NextResponse.json({ error: "Votre panier est vide." }, { status: 400 })
    }

    const dbProducts = await db.product.findMany({ where: { storeId: store.id } })
    const map = new Map(dbProducts.map((p) => [p.id, p]))

    // Quantité max par article : règle métier paramétrable côté admin
    const maxQty = await getConfigValue<number>("business.orderMaxQtyPerItem")
    const items: OrderItem[] = []
    let subtotalRaw = 0
    for (const r of requested) {
      const p = map.get(String(r.productId))
      if (!p) continue
      const qty = Math.max(1, Math.min(maxQty, Number(r.qty) || 1))
      // LOT 1 — disponibilité : un produit épuisé ne se commande pas et la
      // quantité demandée ne dépasse jamais le stock réel (anti-survente).
      if (p.stock <= 0) {
        return NextResponse.json({ error: `${p.name} est en rupture de stock.` }, { status: 400 })
      }
      if (qty > p.stock) {
        return NextResponse.json(
          { error: `Stock insuffisant pour ${p.name} : ${p.stock} disponible(s).` },
          { status: 400 },
        )
      }
      items.push({ productId: p.id, name: p.name, emoji: p.emoji, priceUSD: p.priceUSD, qty })
      subtotalRaw += p.priceUSD * qty
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Produits invalides ou introuvables." }, { status: 400 })
    }
    const subtotalUSD = Math.round(subtotalRaw * 100) / 100

    // V6 — Zone de livraison tarifée (si le vendeur en a configuré et qu'une zone est choisie)
    let zoneName = String(body.zone || "").slice(0, 80)
    let deliveryFeeFC = 0
    const zoneId = String(body.zoneId || "")
    // LOT 2 — retrait différencié : une zone de kind « pickup » fait de la
    // commande un RETRAIT en boutique (pas une livraison). Le point de retrait
    // est la boutique — la zone ne sert que de libellé (frais éventuels
    // conservés, calculés côté serveur comme pour une livraison).
    let fulfillment: "delivery" | "pickup" = "delivery"
    if (zoneId) {
      const zone = await db.deliveryZone.findFirst({ where: { id: zoneId, storeId: store.id, active: true } })
      if (zone) {
        zoneName = zone.name
        deliveryFeeFC = zone.feeFC
        if (zone.kind === "pickup") fulfillment = "pickup"
      }
    }
    // V10 — Adresse de livraison libre (complète la zone).
    // LOT 2 : une commande retrait n'a pas d'adresse de livraison — le serveur
    // écrase toute valeur reçue (jamais d'adresse factice sur un retrait).
    const deliveryAddress = fulfillment === "pickup" ? "" : String(body.deliveryAddress || "").slice(0, 200)

    // V6 — Code promo : validation serveur (jamais faire confiance au client)
    let discountUSD = 0
    let couponCode = ""
    const requestedCode = String(body.couponCode || "").trim().toUpperCase()
    if (requestedCode) {
      const coupon = await db.coupon.findUnique({
        where: { storeId_code: { storeId: store.id, code: requestedCode } },
      })
      if (!coupon || !coupon.active || (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses)) {
        return NextResponse.json({ error: `Code promo ${requestedCode} invalide ou expiré.` }, { status: 400 })
      }
      const d = computeCouponDiscount(
        { type: coupon.type as CouponType, value: coupon.value, minTotalUSD: coupon.minTotalUSD },
        subtotalUSD,
      )
      if (d <= 0) {
        return NextResponse.json(
          { error: `Ce code demande un panier minimum de $${coupon.minTotalUSD.toFixed(2)}.` },
          { status: 400 },
        )
      }
      discountUSD = d
      couponCode = coupon.code
    }

    // V6 — Totaux calculés côté serveur (FC d'abord, USD dérivé) — LE CLIENT NE DÉCIDE JAMAIS DU PRIX
    const { totalUSD, totalFC } = computeOrderTotals({
      subtotalUSD,
      discountUSD,
      deliveryFeeFC,
      rate: store.rateFC,
    })

    // V10 — Paiement via l'abstraction PaymentProvider (méthode active = autorité serveur)
    const enabledPayments = await getEnabledPayments()
    if (enabledPayments.length === 0) {
      return NextResponse.json(
        { error: "Aucun moyen de paiement n'est disponible pour le moment." },
        { status: 503 },
      )
    }
    const requestedMethod = String(body.paymentMethod || "")
    const method: PaymentMethod = enabledPayments.includes(requestedMethod as PaymentMethod)
      ? (requestedMethod as PaymentMethod)
      : enabledPayments[0]
    const provider = await resolveProvider(method)
    if (!provider) {
      return NextResponse.json({ error: "Moyen de paiement indisponible." }, { status: 400 })
    }

    // Référence séquentielle CMD-YYYY-NNNNNN (compteur atomique)
    const ref = await makeSequentialOrderRef()
    const actor = actorFromUser(user, "customer")

    // LOT 1 — décrément ATOMIQUE du stock dans la MÊME transaction que la
    // création de la commande : updateMany conditionnel (stock >= qty) — deux
    // commandes concurrentes ne peuvent pas vendre la même unité. En cas de
    // course, la commande perdante est refusée 400 et RIEN n'est écrit.
    let stockConflictMsg = ""
    const order = await db
      .$transaction(async (tx) => {
        for (const it of items) {
          const res = await tx.product.updateMany({
            where: { id: it.productId, stock: { gte: it.qty } },
            data: { stock: { decrement: it.qty } },
          })
          if (res.count === 0) {
            stockConflictMsg = `Stock insuffisant pour ${it.name} : la commande n'a pas été enregistrée.`
            throw new StockConflictError(stockConflictMsg)
          }
        }
        return tx.order.create({
          data: {
            ref,
            storeId: store.id,
        // V10 — lien compte client (null seulement si flag orderAccounts désactivé)
        userId: user?.id ?? null,
        customerName: customerName.slice(0, 80),
        customerPhone: normalizePhone(customerPhone),
        zone: zoneName,
        items: JSON.stringify(items),
        totalUSD,
        totalFC,
        // V6 — récap commerce détaillé
        couponCode,
        discountUSD,
        deliveryZone: zoneName,
        deliveryFeeFC,
        deliveryAddress,
        // LOT 2 — mode de fulfillment inscrit à la création (jamais réécrit ensuite)
        fulfillment,
        paymentMethod: method,
            // V10 — état initial via le fournisseur (espèces = cash_pending, jamais « payée »)
            paymentStatus: provider.kind === "cash" ? "cash_pending" : "unpaid",
            note: String(body.note || "").slice(0, 300),
            status: "new",
          },
        })
      })
      .catch((e: unknown) => {
        if (e instanceof StockConflictError) return null
        throw e
      })
    if (!order) {
      return NextResponse.json({ error: stockConflictMsg || "Stock insuffisant." }, { status: 400 })
    }

    // Initiation provider (référence agrégateur / instructions espèces)
    const initiation = await provider.initiate({
      orderRef: ref,
      payerPhone: normalizePhone(customerPhone),
      totalFC,
    })
    // P6 — pas de référence SIM- trompeuse : tant que l'agrégateur réel n'est
    // pas branché (clés MOMO absentes) et que la simulation n'est pas
    // explicitement activée, la commande MM reste sans paymentRef — la vraie
    // référence arrivera du webhook (live) ou de la déclaration de l'acheteur
    // (parcours direct, Phase C). L'espèces garde son marqueur COD-<ref>.
    const momoLive = Boolean(process.env.MOMO_TOKEN?.trim() && process.env.MOMO_MERCHANT?.trim())
    const recordProviderRef = method === "cash" || momoLive || isPaymentSimulationEnabled()
    if (recordProviderRef) {
      await db.order.update({
        where: { id: order.id },
        data: { paymentRef: initiation.providerRef },
      })
    }

    // P1 (Phase C) — SNAPSHOT immuable des coordonnées de paiement direct du
    // vendeur pour les moyens Mobile Money : copie des coordonnées actives de
    // la boutique au moment de la création. Une commande historique conserve
    // à jamais les coordonnées utilisées à sa création, même si le vendeur
    // change de numéro ensuite. Aucune commande MM ne part sans ce snapshot
    // quand le vendeur les a configurées (sinon : parcours WhatsApp inchangé).
    let directPayment: { provider: string; accountName: string; accountNumber: string; network: string; instructions: string } | undefined
    if (provider.kind === "mobile_money") {
      const active = getActiveInstruction(store.paymentSettings, method)
      if (active) {
        const instruction = await db.orderPaymentInstruction.create({
          data: {
            orderId: order.id,
            provider: method,
            accountName: active.accountName,
            accountNumber: active.accountNumber,
            network: active.network || active.provider,
            instructions: active.instructions,
          },
        })
        directPayment = {
          provider: instruction.provider,
          accountName: instruction.accountName,
          accountNumber: instruction.accountNumber,
          network: instruction.network,
          instructions: instruction.instructions,
        }
      }
    }

    // V10 — Historique immuable : création + sélection paiement
    await db.orderEvent.createMany({
      data: [
        {
          orderId: order.id,
          type: "created",
          actorType: actor.actorType,
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          newValue: ref,
          reason: `Commande créée — ${items.length} article(s), total ${totalFC} FC`,
        },
        {
          orderId: order.id,
          type: "payment_selected",
          actorType: actor.actorType,
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          newValue: method,
          reason: PAYMENT_LABELS[method],
        },
      ],
    })

    // Journal d'audit global
    await logAudit({
      action: "order.created",
      target: `order:${ref}`,
      detail: `${customerName} — ${totalFC} FC — ${store.name}`,
      actorType: actor.actorType,
      actorId: actor.actorId,
      entityType: "order",
      entityId: order.id,
    })

    const message = buildOrderMessage({
      storeName: store.name,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      zone: order.zone,
      items,
      totalUSD,
      totalFC,
      paymentMethod: method,
      note: order.note,
      discountUSD,
      couponCode,
      deliveryFeeFC,
      fulfillment,
    })

    // V2 — Notification SMS vendeur + client (jamais bloquante, simulée si fournisseur absent)
    await notifyNewOrder({
      storeId: store.id,
      storeName: store.name,
      storeWhatsapp: store.whatsapp,
      orderId: order.id,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      zone: order.zone,
      items,
      totalFC,
      paymentLabel: PAYMENT_LABELS[method],
    })

    // V6 — Incrémenter le compteur d'utilisation du code promo (jamais bloquant)
    if (couponCode) {
      db.coupon
        .update({ where: { storeId_code: { storeId: store.id, code: couponCode } }, data: { uses: { increment: 1 } } })
        .catch((err) => console.error("coupon uses increment", err))
    }

    return NextResponse.json(
      {
        order: { ...order, paymentRef: recordProviderRef ? initiation.providerRef : null },
        paymentInstructions: recordProviderRef ? initiation.instructions : undefined,
        // P1 (Phase C) — snapshot des coordonnées directes (l'acheteur paie
        // lui-même sur le numéro du vendeur puis déclare son paiement).
        directPayment,
        whatsappUrl: buildWhatsAppLink(store.whatsapp, message),
      },
      { status: 201 },
    )
  } catch (e) {
    console.error("POST /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/orders?slug=xxx — Commandes d'une boutique (V8 : propriétaire uniquement)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const orders = await db.order.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    // P8 (Phase C) — expiration paresseuse des déclarations au-delà du délai
    // configuré (pattern des boosts : appliquée aux points de lecture).
    await expireOverdueDeclarations(orders)

    return NextResponse.json({ orders })
  } catch (e) {
    console.error("GET /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/orders — Workflow SÉCURISÉ (V10)
// - changement de statut : transitions validées par le graphe serveur + événement historisé
// - confirmation d'encaissement espèces : owner/admin UNIQUEMENT, uniquement pour paymentMethod=cash
//   (un client ne peut JAMAIS passer paymentStatus=paid lui-même)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const confirmCash = body.confirmCash === true
    // P1 (Phase C) — confirmation d'un encaissement Mobile Money direct :
    // symétrique de confirmCash (mêmes gardes, vocabulaire MM).
    const confirmDirect = body.confirmDirect === true
    const reason = String(body.reason || "").slice(0, 300)

    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    // LOT 3 — informations boutique requises pour les notifications d'événements
    const order = await db.order.findUnique({
      where: { id },
      include: { store: { select: { name: true, whatsapp: true } } },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // Autorisation : soit le propriétaire de la boutique (dérivé serveur), soit l'admin.
    const user = await getUserFromRequest(req)
    const isAdmin = user?.role === "admin" // (réservé : aujourd'hui la gouvernance passe par le PIN admin)
    if (!user) return unauthorized()
    if (!isAdmin) {
      const guard = await requireStoreOwner(req, { id: order.storeId })
      if (!guard.ok) return guard.response
    }
    const actorType = isAdmin ? "admin" : "owner"
    const actorLabel = user.name || user.email

    const data: { status?: string; paymentStatus?: string; paidAt?: Date } = {}
    const events: {
      orderId: string
      type: string
      actorType: string
      actorId: string
      actorLabel: string
      oldValue: string
      newValue: string
      reason?: string
    }[] = []

    // Confirmation d'encaissement espèces (paiement à la livraison)
    if (confirmCash) {
      if (order.paymentMethod !== "cash") {
        return NextResponse.json(
          { error: "L'encaissement manuel ne s'applique qu'aux paiements en espèces à la livraison." },
          { status: 400 },
        )
      }
      if (["paid", "refunded"].includes(order.paymentStatus)) {
        return NextResponse.json({ error: "Cette commande est déjà payée." }, { status: 400 })
      }
      // Garde-fou anti-fraude : on n'encaisse qu'une commande confirmée au minimum
      // (jamais une commande toute nouvelle, annulée, retournée ou remboursée).
      if (["new", "paid", "cancelled", "returned", "refunded", "disputed"].includes(order.status)) {
        return NextResponse.json(
          { error: "Encaissement impossible à ce stade du workflow (commande non confirmée ou clôturée)." },
          { status: 400 },
        )
      }
      data.paymentStatus = "paid"
      data.paidAt = new Date()
      events.push({
        orderId: order.id,
        type: "payment_confirmed",
        actorType,
        actorId: user.id,
        actorLabel: actorLabel,
        oldValue: order.paymentStatus,
        newValue: "paid",
        reason: `Encaissement espèces confirmé par ${actorLabel}${reason ? ` — ${reason}` : ""}`,
      })
    }

    // Confirmation d'encaissement MOBILE MONEY DIRECT (P1 — Phase C) :
    // le vendeur (ou l'admin) vérifie dans son compte opérateur que le montant
    // déclaré par l'acheteur est bien arrivé, puis confirme. La déclaration de
    // l'acheteur (declared) n'a JAMAIS confirmé quoi que ce soit par elle-même.
    // Les quatre vérifications existantes de confirmCash sont conservées à
    // l'identique (vendeur authentifié, boutique propriétaire, commande
    // appartenant à la boutique, statut compatible) — pour le cash, le
    // comportement actuel reste strictement inchangé.
    if (confirmDirect) {
      if (!confirmCash && !["mpesa", "airtel", "orange"].includes(order.paymentMethod)) {
        return NextResponse.json(
          { error: "La confirmation directe s'applique uniquement aux paiements Mobile Money." },
          { status: 400 },
        )
      }
      if (["paid", "refunded"].includes(order.paymentStatus)) {
        return NextResponse.json({ error: "Cette commande est déjà payée." }, { status: 400 })
      }
      // Même garde-fou anti-fraude que l'espèces : au minimum « confirmed ».
      if (["new", "paid", "cancelled", "returned", "refunded", "disputed"].includes(order.status)) {
        return NextResponse.json(
          { error: "Confirmation impossible à ce stade du workflow (commande non confirmée ou clôturée)." },
          { status: 400 },
        )
      }
      const declaredRef = order.paymentRef || "référence non fournie"
      data.paymentStatus = "paid"
      data.paidAt = new Date()
      events.push({
        orderId: order.id,
        type: "payment_confirmed",
        actorType,
        actorId: user.id,
        actorLabel: actorLabel,
        oldValue: order.paymentStatus,
        newValue: "paid",
        reason: `Encaissement Mobile Money direct confirmé par ${actorLabel} (réf déclarée : ${declaredRef})${reason ? ` — ${reason}` : ""}`,
      })
    }

    // Changement de statut avec validation de transition (jamais d'écrasement silencieux)
    if (status) {
      if (!ORDER_STATUSES.includes(status as never)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
      }
      if (status !== order.status) {
        if (!canTransitionOrder(order.status, status)) {
          return NextResponse.json(
            { error: `Transition interdite : ${order.status} → ${status}.` },
            { status: 400 },
          )
        }
        // LOT 2 — cohérence fulfillment : une commande retrait ne part JAMAIS
        // « en livraison » — la remise en main propre passe par delivered.
        if (order.fulfillment === "pickup" && status === "out_for_delivery") {
          return NextResponse.json(
            { error: "Commande en retrait en boutique : la mise en livraison ne s'applique pas — marquez-la « Remise » lors de la remise en main propre." },
            { status: 400 },
          )
        }
        // Cohérence livraison : livrée ⇒ livraison livrée ; retour ⇒ livraison retournée
        if (status === "delivered" && order.deliveryStatus !== "delivered") {
          await db.order.update({ where: { id }, data: { deliveryStatus: "delivered" } })
          events.push({
            orderId: order.id,
            type: "delivery_updated",
            actorType,
            actorId: user.id,
            actorLabel: actorLabel,
            oldValue: order.deliveryStatus,
            newValue: "delivered",
            reason: "Alignement automatique (commande livrée)",
          })
        }
        if (status === "returned" && order.deliveryStatus !== "returned") {
          await db.order.update({ where: { id }, data: { deliveryStatus: "returned" } })
          events.push({
            orderId: order.id,
            type: "delivery_returned",
            actorType,
            actorId: user.id,
            actorLabel: actorLabel,
            oldValue: order.deliveryStatus,
            newValue: "returned",
            reason: "Alignement automatique (commande retournée)",
          })
        }
        data.status = status
        events.push({
          orderId: order.id,
          type: "status_changed",
          actorType,
          actorId: user.id,
          actorLabel: actorLabel,
          oldValue: order.status,
          newValue: status,
          reason: reason || undefined,
        })
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    const updated = await db.order.update({ where: { id }, data })
    if (events.length > 0) {
      await db.orderEvent.createMany({ data: events })
    }

    // LOT 1 — restitution du stock : annulation ou retour ⇒ les articles
    // repassent en stock (idempotent : un seul événement stock_restored par
    // commande, re-vérifié en transaction par le helper partagé).
    if (data.status === "cancelled" || data.status === "returned") {
      await restoreOrderStock(
        id,
        { type: actorType, id: user.id, label: actorLabel },
        data.status === "cancelled" ? "Stock restitué (commande annulée)" : "Stock restitué (commande retournée)",
      )
    }

    // Phase E — Ledger (mode ombre) : double écriture financière de
    // l'encaissement CONFIRMÉ (le fait d'argent est déjà vérifié ci-dessus).
    // Idempotent (une commande = une écriture) et JAMAIS bloquant : un échec
    // est journalisé serveur (réconciliation admin) sans affecter la réponse.
    if (data.paymentStatus === "paid") {
      if (confirmCash) {
        await recordVendorPaymentEntry({
          storeId: order.storeId,
          orderId: order.id,
          type: "DELIVERY_CASH",
          amountFC: order.totalFC,
          orderRef: order.ref,
          declaredRef: order.paymentRef,
          actorLabel,
        })
      } else if (confirmDirect) {
        await recordVendorPaymentEntry({
          storeId: order.storeId,
          orderId: order.id,
          type: "SALE",
          amountFC: order.totalFC,
          orderRef: order.ref,
          declaredRef: order.paymentRef,
          actorLabel,
        })
      }
    }

    // P4 (F4-6) — Cohérence commande ↔ facture : une commande annulée,
    // retournée ou remboursée ne peut pas laisser une facture ACTIVE
    // (justificatif de dette) — les factures actives sont annulées
    // automatiquement avec trace (document comptable jamais écrasé).
    if (["cancelled", "returned", "refunded"].includes(status)) {
      const activeInvoices = await db.invoice.findMany({
        where: { orderId: id, status: { notIn: ["cancelled", "credited"] } },
        select: { id: true, number: true, note: true, status: true },
      })
      for (const inv of activeInvoices) {
        await db.invoice.update({
          where: { id: inv.id },
          data: {
            status: "cancelled",
            note: `[ANNULÉE AUTO — commande ${status} par ${actorLabel}] ${inv.note}`.trim().slice(0, 300),
          },
        })
        await db.orderEvent.create({
          data: {
            orderId: id,
            type: "invoice_cancelled",
            actorType,
            actorId: user.id,
            actorLabel,
            oldValue: inv.status,
            newValue: "cancelled",
            reason: `Facture ${inv.number} annulée automatiquement (commande ${status})`,
          },
        })
        await logAudit({
          action: "invoice.cancelled_order",
          target: `invoice:${inv.number}`,
          detail: `Facture ${inv.number} annulée automatiquement — commande ${order.ref} ${status} (par ${actorLabel})`,
          actorType,
          actorId: user.id,
          entityType: "invoice",
          entityId: inv.id,
        })
      }
    }

    await logAudit({
      action: confirmCash || confirmDirect ? "order.payment_confirmed" : "order.status",
      target: `order:${order.ref}`,
      detail:
        (confirmCash ? `Encaissement espèces ${order.ref} (par ${actorLabel}). ` : "") +
        (confirmDirect ? `Encaissement Mobile Money direct ${order.ref} (par ${actorLabel}). ` : "") +
        (status ? `Statut ${order.status} → ${status}` : "") +
        (reason ? ` — ${reason}` : ""),
      actorType,
      actorId: user.id,
      entityType: "order",
      entityId: order.id,
    })

    // LOT 3 — Notifications d'événements (§20) : chaque transition métier
    // notifie ses destinataires. Jamais bloquant (les erreurs sont journalisées
    // par le notifieur, jamais remontées à la requête).
    const notifyCtx = {
      storeId: order.storeId,
      storeName: order.store.name,
      storeWhatsapp: order.store.whatsapp,
      orderId: order.id,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalFC: order.totalFC,
      paymentStatus: data.paymentStatus ?? order.paymentStatus,
      actorType,
    }
    if (data.paymentStatus === "paid") {
      await notifyOrderEvent("payment_confirmed", { ...notifyCtx, reason: order.paymentRef })
    }
    if (data.status) {
      if (data.status === "confirmed") await notifyOrderEvent("order_confirmed", notifyCtx)
      else if (data.status === "ready") await notifyOrderEvent("order_ready", notifyCtx)
      else if (data.status === "ready_for_pickup") await notifyOrderEvent("order_ready_for_pickup", notifyCtx)
      else if (data.status === "out_for_delivery") await notifyOrderEvent("order_out_for_delivery", notifyCtx)
      else if (data.status === "delivered") {
        // LOT 2 : un retrait remis en main propre = ORDER_PICKED_UP ; une
        // livraison remise = ORDER_DELIVERED.
        await notifyOrderEvent(order.fulfillment === "pickup" ? "order_picked_up" : "order_delivered", notifyCtx)
      } else if (data.status === "cancelled") await notifyOrderEvent("order_cancelled", notifyCtx)
      else if (data.status === "returned") await notifyOrderEvent("order_returned", notifyCtx)
    }

    return NextResponse.json({ order: updated })
  } catch (e) {
    console.error("PATCH /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

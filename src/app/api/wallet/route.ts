// KinShop — Portefeuille vendeur : solde ledger + demandes de retrait (Cycle 3 / LOT 2)
//
// Solde : JAMAIS stocké — agrégation des écritures du ledger (lib/finance.ts),
// source de vérité unique (rapport financier ch. 9-13) :
//   disponible = Σ(SALE + DELIVERY_CASH) − Σ(commission) + Σ(COMMISSION_REVERSAL)
//                + Σ(REFUND) + Σ(ADJUSTMENT) + Σ(WITHDRAWAL, négatif)
// Retrait (ch. 16 du rapport financier) :
//   • demande vendeur (coordonnées Mobile Money FIGÉES au moment de la demande) ;
//   • approbation admin = débit réversible (écriture WITHDRAWAL) — le disponible
//     est re-vérifié à ce moment (anti-race) ;
//   • PAID irréversible avec preuve ; échec → déblocage automatique (ADJUSTMENT) ;
//   • UN SEUL retrait actif par boutique (requested ou approved) ;
//   • montant minimum, frais (fixe USD + %) et plafond journalier administrables
//     (clés finance.withdrawal*, converties FC au taux plateforme defaultRateFC).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner } from "@/lib/auth"
import { getConfigValue } from "@/lib/config-registry"
import { parseStorePaymentSettings } from "@/lib/direct-payments"
import { getWalletSummary, fcPerUSD } from "@/lib/finance"

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })
    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response!

    const summary = await getWalletSummary(guard.store.id)
    const withdrawals = await db.withdrawal.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    const activeSettings = parseStorePaymentSettings(guard.store.paymentSettings)
      .filter((s) => s.active)
      .map((s) => ({
        provider: s.provider,
        accountName: s.accountName,
        accountNumber: s.accountNumber,
        network: s.network,
      }))
    const minUsd = Number(await getConfigValue<number>("finance.withdrawalMinUSD")) || 0
    const rate = await fcPerUSD()
    const hasActive = withdrawals.some((w) => w.status === "requested" || w.status === "approved")

    return NextResponse.json({
      summary,
      minWithdrawFC: Math.round(minUsd * rate),
      hasActive,
      withdrawals,
      activeSettings,
    })
  } catch (e) {
    console.error("GET /api/wallet", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const amount = Math.round((Number(body.amountFC) || 0) * 100) / 100
    const method = String(body.method || "").slice(0, 20)
    const note = String(body.note || "").slice(0, 300)
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })
    if (amount <= 0) return NextResponse.json({ error: "Montant invalide." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response!

    // Coordonnées actives : la méthode demandée doit exister et être active —
    // le bénéficiaire est FIGÉ dans la demande (jamais modifiable ensuite).
    const settings = parseStorePaymentSettings(guard.store.paymentSettings).filter((s) => s.active)
    const target = settings.find((s) => s.provider === method)
    if (!target) {
      return NextResponse.json(
        { error: "Aucune coordonnée Mobile Money active pour ce moyen. Configure d'abord tes coordonnées de paiement." },
        { status: 400 }
      )
    }

    // Un seul retrait actif par boutique (anti double-retrait, ch. 16).
    const active = await db.withdrawal.findFirst({
      where: { storeId: guard.store.id, status: { in: ["requested", "approved"] } },
      select: { id: true },
    })
    if (active) {
      return NextResponse.json(
        { error: "Un retrait est déjà en cours pour cette boutique (demande ou approuvé)." },
        { status: 400 }
      )
    }

    // Montant minimum + disponible re-vérifié (le disponible ne peut jamais
    // devenir négatif à cause d'une demande).
    const rate = await fcPerUSD()
    const minUsd = Number(await getConfigValue<number>("finance.withdrawalMinUSD")) || 0
    const minFC = Math.round(minUsd * rate)
    if (amount < minFC) {
      return NextResponse.json(
        { error: `Montant minimum : ${minFC.toLocaleString("fr-FR")} FC.` },
        { status: 400 }
      )
    }
    const summary = await getWalletSummary(guard.store.id)
    if (amount > summary.availableFC) {
      return NextResponse.json(
        { error: `Montant supérieur au disponible (${Math.round(summary.availableFC).toLocaleString("fr-FR")} FC).` },
        { status: 400 }
      )
    }

    // Plafond journalier (fusible anti-abus ; 0 = désactivé).
    const capUsd = Number(await getConfigValue<number>("finance.dailyWithdrawalCapUSD")) || 0
    if (capUsd > 0) {
      const dayStart = new Date()
      dayStart.setUTCHours(0, 0, 0, 0)
      const already = await db.withdrawal.aggregate({
        _sum: { amount: true },
        where: {
          storeId: guard.store.id,
          createdAt: { gte: dayStart },
          status: { in: ["requested", "approved", "paid"] },
        },
      })
      const capFC = Math.round(capUsd * rate)
      if ((already._sum.amount ?? 0) + amount > capFC) {
        return NextResponse.json(
          { error: `Plafond journalier atteint (${capFC.toLocaleString("fr-FR")} FC).` },
          { status: 400 }
        )
      }
    }

    // Frais (fixe USD + %) — affichés avant confirmation, figés sur la demande.
    const feeUsdFixed = Number(await getConfigValue<number>("finance.withdrawalFeeUSD")) || 0
    const feePercent = Number(await getConfigValue<number>("finance.withdrawalFeePercent")) || 0
    const fee = Math.round((feeUsdFixed * rate + (amount * feePercent) / 100) * 100) / 100
    const netAmount = Math.round((amount - fee) * 100) / 100
    if (netAmount <= 0) {
      return NextResponse.json({ error: "Montant net nul après frais." }, { status: 400 })
    }

    const created = await db.withdrawal.create({
      data: {
        storeId: guard.store.id,
        amount,
        fee,
        netAmount,
        currency: "FC",
        status: "requested",
        method: target.provider,
        accountName: target.accountName.slice(0, 80),
        accountNumber: target.accountNumber.slice(0, 40),
        network: target.network.slice(0, 40),
        note,
        requestedBy: guard.user.email || guard.user.name || "vendeur",
      },
    })
    return NextResponse.json({ withdrawal: created }, { status: 201 })
  } catch (e) {
    console.error("POST /api/wallet", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

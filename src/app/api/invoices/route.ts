import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  sanitizeInvoiceItems,
  sumInvoiceItems,
  type InvoiceItem,
} from "@/lib/kinfacture"
import { requireStoreOwner, forbidden, quotaExceeded, conflict } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas, isFeatureOn } from "@/lib/config-registry"
import { withStoreQuotaWrite } from "@/lib/quota-guard"
import { invoiceHashV2, makeSequentialKinfactureNumber } from "@/lib/invoice-integrity"
import { logAudit } from "@/lib/audit"

// P4 (F4-4) — Graphe de transitions des factures libres KinFacture.
// Une facture ÉMISE ne se modifie jamais silencieusement : rectification =
// annulation tracée (motif obligatoire) + nouvelle facture.
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
  credited: [],
}
const TRANSITION_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
  credited: "Avoir",
}

// POST /api/invoices — Créer une facture (V8 : propriétaire + quota mensuel du plan)
// P4 (F4-1/F4-2) : numéro séquentiel KF-YYYY-NNNNNN (compteur atomique, jamais
// réutilisé) + empreinte d'intégrité V2 couvrant tout le contenu facturé.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const clientName = String(body.clientName || "").trim()

    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })
    if (!clientName) return NextResponse.json({ error: "Le nom du client est requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const { store } = guard
    const plan = planOf(store)

    // ── Feature flag KinFacture (serveur, paramétrable admin) ──
    if (!(await isFeatureOn("invoices"))) {
      return forbidden("KinFacture est momentanément désactivé sur la plateforme.")
    }

    // ── Quota mensuel KinFacture (mois civile UTC — pré-check UX, vérification FAIS FOI atomique ci-dessous) ──
    const quotas = await getPlanQuotas(plan.id)
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const monthCount = await db.invoice.count({
      where: { storeId: store.id, createdAt: { gte: monthStart } },
    })
    if (monthCount >= quotas.maxInvoicesPerMonth) {
      return quotaExceeded(
        plan.id === "free"
          ? `Quota du plan Free atteint (${quotas.maxInvoicesPerMonth} factures ce mois). Passe Premium pour émettre davantage de factures.`
          : `Quota de ${quotas.maxInvoicesPerMonth} factures par mois atteint.`,
      )
    }

    const items: InvoiceItem[] = sanitizeInvoiceItems(body.items)
    if (items.length === 0) {
      return NextResponse.json({ error: "Ajoutez au moins une ligne valide (description requise)." }, { status: 400 })
    }

    const totalFC = sumInvoiceItems(items)
    if (totalFC <= 0) {
      return NextResponse.json({ error: "Le total de la facture doit être supérieur à 0 FC." }, { status: 400 })
    }
    const totalUSD = Math.round((totalFC / store.rateFC) * 100) / 100

    // F-07 (audit) — quota mensuel revérifié + création dans UNE transaction
    // atomique (mutex boutique + transaction Prisma) : pas de dépassement possible.
    // P4 : la numérotation séquentielle et le hash V2 partagent la même
    // transaction — pas de trou de séquence en cas d'échec.
    const clientPhone = String(body.clientPhone || "").replace(/\D/g, "").slice(0, 15)
    const note = String(body.note || "").slice(0, 300)
    const dueDate = String(body.dueDate || "").slice(0, 10)
    const result = await withStoreQuotaWrite(store.id, async (tx) => {
      const n = await tx.invoice.count({
        where: { storeId: store.id, createdAt: { gte: monthStart } },
      })
      if (n >= quotas.maxInvoicesPerMonth) return { overQuota: true as const, invoice: null }
      const number = await makeSequentialKinfactureNumber(tx)
      const now = new Date()
      const itemsJson = JSON.stringify(items)
      const hash = invoiceHashV2({
        number,
        orderId: "",
        storeId: store.id,
        totalUSD,
        totalFC,
        issuedAt: now.toISOString(),
        itemsJson,
        clientName: clientName.slice(0, 80),
        clientPhone,
        dueDate,
        note,
      })
      const invoice = await tx.invoice.create({
        data: {
          number,
          storeId: store.id,
          clientName: clientName.slice(0, 80),
          clientPhone,
          items: itemsJson,
          totalFC,
          totalUSD,
          note,
          dueDate,
          status: "draft",
          hash,
          version: 2,
          createdAt: now,
        },
      })
      return { overQuota: false as const, invoice }
    })
    if (result.overQuota) {
      return quotaExceeded(
        plan.id === "free"
          ? `Quota du plan Free atteint (${quotas.maxInvoicesPerMonth} factures ce mois). Passe Premium pour émettre davantage de factures.`
          : `Quota de ${quotas.maxInvoicesPerMonth} factures par mois atteint.`,
      )
    }

    await logAudit({
      action: "invoice.created",
      target: `invoice:${result.invoice.number}`,
      detail: `Facture libre ${result.invoice.number} — ${totalFC} FC — ${items.length} ligne(s)`,
      actorType: "owner",
      actorId: guard.user.id,
      entityType: "invoice",
      entityId: result.invoice.id,
    })

    return NextResponse.json({ invoice: result.invoice }, { status: 201 })
  } catch (e) {
    console.error("POST /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/invoices?slug=xxx — Factures d'une boutique (V8 : propriétaire uniquement)
// GET /api/invoices?number=KF-XXX — Facture publique par numéro (lien de partage client)
export async function GET(req: NextRequest) {
  try {
    const number = req.nextUrl.searchParams.get("number")
    if (number) {
      // Lecture publique par numéro — le numéro fait office de clé de partage (comme un lien non listé)
      const invoice = await db.invoice.findUnique({
        where: { number: number.toUpperCase().trim() },
        include: { store: { select: { name: true, logoEmoji: true, whatsapp: true, city: true, rateFC: true, slug: true } } },
      })
      if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })
      return NextResponse.json({ invoice })
    }

    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug ou number requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const invoices = await db.invoice.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return NextResponse.json({ invoices })
  } catch (e) {
    console.error("GET /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/invoices — Transitions de statut (V8 propriétaire uniquement, anti-IDOR)
// P4 (F4-4) : graphe de transitions serveur — draft→sent→paid, annulation
// possible depuis tout état actif AVEC motif obligatoire ; cancelled/credited
// sont terminaux ; chaque transition est tracée dans le journal d'audit.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const reason = String(body.reason || "").trim()

    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: invoice.storeId })
    if (!guard.ok) return guard.response

    if (!status) return NextResponse.json({ error: "Statut requis." }, { status: 400 })

    const allowed = INVOICE_TRANSITIONS[invoice.status] ?? []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        {
          error: `Transition impossible : une facture ${TRANSITION_LABELS[invoice.status] ?? invoice.status} ne peut pas devenir ${TRANSITION_LABELS[status] ?? status}.`,
        },
        { status: 400 },
      )
    }

    if (status === "cancelled") {
      if (reason.length < 4) {
        return NextResponse.json(
          { error: "Un motif d'annulation d'au moins 4 caractères est requis (traçabilité)." },
          { status: 400 },
        )
      }
      if (invoice.orderId) {
        return NextResponse.json(
          { error: "Cette facture est rattachée à une commande : passez par le workflow de la commande (annulation / remboursement) plutôt que d'annuler la facture directement." },
          { status: 400 },
        )
      }
    }

    const data: { status?: string; paidAt?: Date | null; note?: string } = {}
    if (status === "paid") data.paidAt = new Date()
    if (status === "sent" && invoice.status !== "paid") data.paidAt = null
    if (status === "cancelled") {
      // La note d'origine est conservée : le motif s'ajoute en préfixe (trace immuable du document).
      data.note = `[ANNULÉE — motif : ${reason.slice(0, 200)}] ${invoice.note}`.trim().slice(0, 300)
    }

    const updated = await db.invoice.update({ where: { id }, data: { status, ...data } })

    await logAudit({
      action: "invoice.status_changed",
      target: `invoice:${invoice.number}`,
      detail: `${invoice.status} → ${status}${status === "cancelled" ? ` — motif : ${reason.slice(0, 160)}` : ""}`,
      actorType: "owner",
      actorId: guard.user.id,
      entityType: "invoice",
      entityId: invoice.id,
    })

    return NextResponse.json({ invoice: updated })
  } catch (e) {
    console.error("PATCH /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/invoices?id=xxx — Supprimer un BROUILLON (V8 : propriétaire uniquement)
// P4 (F4-3) : une facture émise (sent/paid/cancelled/credited) n'est JAMAIS
// supprimable — elle constitue un justificatif pour le client et une pièce
// comptable. Rectification = annulation tracée (PATCH) puis nouvelle facture.
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: invoice.storeId })
    if (!guard.ok) return guard.response

    if (invoice.status !== "draft") {
      return conflict(
        `La facture ${invoice.number} est ${TRANSITION_LABELS[invoice.status] ?? invoice.status} : elle ne peut plus être supprimée (justificatif client + pièce comptable). Annulez-la avec motif si nécessaire.`,
      )
    }

    await db.invoice.delete({ where: { id } })

    await logAudit({
      action: "invoice.draft_deleted",
      target: `invoice:${invoice.number}`,
      detail: `Brouillon ${invoice.number} supprimé (${invoice.totalFC} FC)`,
      actorType: "owner",
      actorId: guard.user.id,
      entityType: "invoice",
      entityId: invoice.id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

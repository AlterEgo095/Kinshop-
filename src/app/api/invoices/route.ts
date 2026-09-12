import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  makeInvoiceNumber,
  sanitizeInvoiceItems,
  sumInvoiceItems,
  type InvoiceItem,
} from "@/lib/kinfacture"
import { requireStoreOwner, quotaExceeded } from "@/lib/auth"
import { planOf, PLANS } from "@/lib/plans"

const VALID_STATUSES = ["draft", "sent", "paid"]

// POST /api/invoices — Créer une facture (V8 : propriétaire + quota mensuel du plan)
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

    // ── Quota mensuel KinFacture (mois civile UTC) ──
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const monthCount = await db.invoice.count({
      where: { storeId: store.id, createdAt: { gte: monthStart } },
    })
    if (monthCount >= plan.maxInvoicesPerMonth) {
      return quotaExceeded(
        plan.id === "free"
          ? `Quota du plan Free atteint (${PLANS.free.maxInvoicesPerMonth} factures ce mois). Passe Premium pour émettre davantage de factures.`
          : `Quota de ${plan.maxInvoicesPerMonth} factures par mois atteint.`,
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

    const invoice = await db.invoice.create({
      data: {
        number: makeInvoiceNumber(),
        storeId: store.id,
        clientName: clientName.slice(0, 80),
        clientPhone: String(body.clientPhone || "").replace(/\D/g, "").slice(0, 15),
        items: JSON.stringify(items),
        totalFC,
        totalUSD,
        note: String(body.note || "").slice(0, 300),
        dueDate: String(body.dueDate || "").slice(0, 10),
        status: "draft",
      },
    })

    return NextResponse.json({ invoice }, { status: 201 })
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

// PATCH /api/invoices — Changer le statut (V8 : propriétaire uniquement, anti-IDOR)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")

    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: invoice.storeId })
    if (!guard.ok) return guard.response

    const data: { status?: string; paidAt?: Date | null } = {}
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
      }
      data.status = status
      data.paidAt = status === "paid" ? new Date() : null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    const updated = await db.invoice.update({ where: { id }, data })
    return NextResponse.json({ invoice: updated })
  } catch (e) {
    console.error("PATCH /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/invoices?id=xxx — Supprimer une facture (V8 : propriétaire uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const invoice = await db.invoice.findUnique({ where: { id } })
    if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: invoice.storeId })
    if (!guard.ok) return guard.response

    await db.invoice.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/invoices", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

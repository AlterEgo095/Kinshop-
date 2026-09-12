import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invoiceHash } from "@/lib/invoice-integrity"

// GET /api/invoices/verify?number=INV-2026-000001 — VÉRIFICATION PUBLIQUE (V10)
// Destination du QR code imprimé sur la facture : quiconque scanne peut confirmer
// que la facture provient réellement de la plateforme et n'a pas été altérée
// (re-calcul de l'empreinte d'intégrité + comparaison). Aucune donnée personnelle
// n'est exposée (pas de nom client ni de numéro).
export async function GET(req: NextRequest) {
  try {
    const number = (req.nextUrl.searchParams.get("number") || "").trim().toUpperCase()
    if (!number) return NextResponse.json({ error: "Paramètre number requis." }, { status: 400 })

    const invoice = await db.invoice.findUnique({
      where: { number },
      include: { store: { select: { name: true, logoEmoji: true } } },
    })
    if (!invoice) {
      return NextResponse.json({ valid: false, reason: "Facture inconnue de la plateforme." }, { status: 404 })
    }

    // Recalcul de l'empreinte : toute altération (numéro, montants, date) → invalid
    const recomputed = invoiceHash({
      number: invoice.number,
      orderId: invoice.orderId ?? "",
      storeId: invoice.storeId,
      totalUSD: invoice.totalUSD,
      totalFC: invoice.totalFC,
      issuedAt: invoice.createdAt.toISOString(),
    })
    const hashMatch = !invoice.hash || recomputed === invoice.hash
    const cancelled = ["cancelled", "credited"].includes(invoice.status)

    return NextResponse.json(
      {
        valid: hashMatch && !cancelled,
        hashMatch,
        status: invoice.status,
        number: invoice.number,
        store: { name: invoice.store.name, logoEmoji: invoice.store.logoEmoji },
        totalFC: invoice.totalFC,
        totalUSD: invoice.totalUSD,
        issuedAt: invoice.createdAt.toISOString(),
        source: invoice.source,
        orderId: invoice.orderId ?? undefined,
        note: cancelled
          ? "Cette facture a été annulée ou remplacée par un avoir."
          : hashMatch
            ? "Facture authentique émise par la plateforme."
            : "ALERTE : l'empreinte ne correspond pas — facture potentiellement falsifiée.",
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/invoices/verify", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

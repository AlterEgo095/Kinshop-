import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { expectedInvoiceHash } from "@/lib/invoice-integrity"

// GET /api/invoices/verify?number=INV-2026-000001 — VÉRIFICATION PUBLIQUE (V10, renforcée P4)
// Destination du QR code imprimé sur la facture (page /#/verifier/{number}) :
// quiconque scanne peut confirmer que la facture provient réellement de la
// plateforme et n'a pas été altérée (re-calcul de l'empreinte d'intégrité +
// comparaison). Aucune donnée personnelle n'est exposée (pas de nom client ni
// de numéro de téléphone).
//
// P4 :
// - version ≥ 2 → empreinte V2 (totaux + lignes + client + échéance + note)
// - version 1   → empreinte V1 historique (totaux, factures de commande pré-P4)
// - sans empreinte (héritée) → legacy: true, facture "authentique par
//   plateforme mais non vérifiable cryptographiquement" (émission antérieure).
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

    // Recalcul de l'empreinte selon la version du document : toute altération
    // (numéro, montants, lignes, client, date) → hashMatch=false.
    const expected = expectedInvoiceHash(invoice)
    const legacy = !invoice.hash
    const hashMatch = legacy ? false : expected === invoice.hash
    const cancelled = ["cancelled", "credited"].includes(invoice.status)

    const note = cancelled
      ? "Cette facture a été annulée ou remplacée par un avoir."
      : legacy
        ? "Facture authentique émise par la plateforme (héritée : émise avant la vérification d'intégrité renforcée)."
        : hashMatch
          ? "Facture authentique émise par la plateforme — contenu intégral vérifié."
          : "ALERTE : l'empreinte ne correspond pas — facture potentiellement falsifiée."

    return NextResponse.json(
      {
        valid: hashMatch && !cancelled,
        hashMatch,
        legacy,
        cancelled,
        status: invoice.status,
        number: invoice.number,
        store: { name: invoice.store.name, logoEmoji: invoice.store.logoEmoji },
        totalFC: invoice.totalFC,
        totalUSD: invoice.totalUSD,
        issuedAt: invoice.createdAt.toISOString(),
        source: invoice.source,
        orderId: invoice.orderId ?? undefined,
        note,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/invoices/verify", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

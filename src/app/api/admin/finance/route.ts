// GET /api/admin/finance — Vue financière de la plateforme (Phase E)
//
// Alimente l'onglet « Finances » de la console admin à partir du ledger en
// mode ombre (lib/finance.ts) et des tables métier existantes — SANS rien
// écrire : lecture pure (pattern admin/overview, aucune entrée d'audit pour
// une consultation).
//
// Contenu :
//   • platform   — revenus KinShop reconnus via Chariow (Premium, Boost) en
//                  devise native USD du PSP (montant du payload vérifié) ;
//   • marketplace— volume encaissé par les vendeurs (MM direct + espèces) en
//                  FC — N'EST PAS un revenu KinShop (paiement direct vendeur) ;
//   • ledger     — santé du journal (écritures, wallets) + dernières entrées ;
//   • reconciliation — écarts détectés automatiquement (§20 du rapport
//                  financier) : commandes payées sans écriture, écritures sans
//                  commande payée, ventes Chariow reconnues vs livraisons Pulse.
//
// GARDE : session admin (guardAdmin). AUCUNE écriture monétaire ici.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin } from "@/lib/admin"
// Cycle 3 — commission : lecture du pourcentage configuré (affichage reporting)
import { getVendorCommissionPercent } from "@/lib/finance"

export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const [
      platformAgg,
      platformByKind,
      vendorAgg,
      vendorBySource,
      recentEntries,
      entryCount,
      walletCount,
      // Réconciliation
      paidOrders,
      vendorEntryOrders,
      pulsesSuccessful,
      platformSaleCount,
      commissionAgg,
      commissionReversalAgg,
      refundAgg,
    ] = await Promise.all([
      // Revenus plateforme (Chariow, USD) — agrégat global
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { scope: "platform", type: "SALE" },
      }),
      // Revenus plateforme par nature (premium / boost)
      db.ledgerEntry.groupBy({
        by: ["kind"],
        _sum: { amount: true },
        _count: true,
        where: { scope: "platform", type: "SALE" },
      }),
      // Volume vendeurs (MM direct + espèces, FC)
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { scope: "vendor", type: { in: ["SALE", "DELIVERY_CASH"] } },
      }),
      // Volume vendeurs par source (direct / cash)
      db.ledgerEntry.groupBy({
        by: ["psPSource"],
        _sum: { amount: true },
        _count: true,
        where: { scope: "vendor", type: { in: ["SALE", "DELIVERY_CASH"] } },
      }),
      // Dernières écritures (toutes portées)
      db.ledgerEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true, scope: true, kind: true, type: true, status: true,
          amount: true, commission: true, currency: true,
          psPSource: true, reference: true, note: true,
          storeId: true, orderId: true, createdAt: true,
        },
      }),
      db.ledgerEntry.count(),
      db.wallet.count(),
      // Commandes payées (toutes méthodes) — base de la réconciliation vendeur
      db.order.findMany({
        where: { paymentStatus: "paid" },
        select: { id: true, ref: true, paymentMethod: true, totalFC: true },
        take: 2000,
        orderBy: { createdAt: "desc" },
      }),
      // Commandes couvertes par une écriture vendeur
      db.ledgerEntry.findMany({
        where: { scope: "vendor", type: { in: ["SALE", "DELIVERY_CASH"] } },
        select: { orderId: true },
        take: 2000,
      }),
      // Ventes Chariow livrées (tous produits) vs revenus reconnus
      db.pulseDelivery.count({ where: { event: "successful.sale" } }),
      db.ledgerEntry.count({ where: { scope: "platform", type: "SALE" } }),
      // Commission plateforme (cycle 3) : part prélevée sur les encaissements
      // vendeurs + renonciations (remboursements) + remboursements exécutés
      db.ledgerEntry.aggregate({
        _sum: { commission: true },
        where: { scope: "vendor", type: { in: ["SALE", "DELIVERY_CASH"] } },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", type: "COMMISSION_REVERSAL" },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", type: "REFUND" },
      }),
    ])

    // ─── Réconciliation (lecture pure) ───
    const covered = new Set(vendorEntryOrders.map((e) => e.orderId))
    const paidWithoutEntry = paidOrders
      .filter((o) => !covered.has(o.id))
      .slice(0, 20)
      .map((o) => ({ ref: o.ref, method: o.paymentMethod, totalFC: o.totalFC }))

    const platform = {
      revenueTotalUSD: Math.round((platformAgg._sum.amount ?? 0) * 100) / 100,
      revenueCount: platformAgg._count,
      byKind: platformByKind
        .map((k) => ({
          kind: k.kind || "autre",
          amountUSD: Math.round((k._sum.amount ?? 0) * 100) / 100,
          count: k._count,
        }))
        .sort((a, b) => b.amountUSD - a.amountUSD),
    }
    // Commission (cycle 3) : part prélevée − renonciations ; net vendeur =
    // encaissements − commission + renonciations + remboursements (négatifs).
    const commissionTotalFC = Math.round((commissionAgg._sum.commission ?? 0) * 100) / 100
    const commissionReversedFC = Math.round((commissionReversalAgg._sum.amount ?? 0) * 100) / 100
    const refundsTotalFC = Math.round((refundAgg._sum.amount ?? 0) * 100) / 100
    const commissionPercent = await getVendorCommissionPercent()
    const marketplace = {
      collectedTotalFC: Math.round((vendorAgg._sum.amount ?? 0) * 100) / 100,
      collectedCount: vendorAgg._count,
      commissionPercent,
      commissionTotalFC,
      commissionReversedFC,
      netVendorTotalFC:
        Math.round(
          ((vendorAgg._sum.amount ?? 0) - commissionTotalFC + commissionReversedFC + refundsTotalFC) *
            100
        ) / 100,
      bySource: vendorBySource
        .map((s) => ({
          source: s.psPSource || "inconnu",
          amountFC: Math.round((s._sum.amount ?? 0) * 100) / 100,
          count: s._count,
        }))
        .sort((a, b) => b.amountFC - a.amountFC),
    }
    const reconciliation = {
      // Commandes payées sans écriture ledger : le mode ombre a un angle mort
      // si une confirmation a eu lieu avant le déploiement E (données
      // historiques) ou si une écriture a échoué → à investiguer.
      paidOrdersWithoutEntryCount: paidOrders.filter((o) => !covered.has(o.id)).length,
      paidOrdersWithoutEntry: paidWithoutEntry,
      // Écritures vendeur dont la commande n'est plus « paid » (refund sans
      // contrepartie, correction admin) — liste à vérifier.
      vendorEntriesCount: vendorEntryOrders.length,
      // Ventes Chariow livrées vs revenus reconnus : l'écart compte les ventes
      // de produits NON configurés (rejets journalisés chariow.pulse_rejected
      // / product_mismatch) — normal si le Pulse écoute « tous produits ».
      pulsesSuccessfulCount: pulsesSuccessful,
      platformSaleCount,
    }

    return NextResponse.json({
      platform,
      marketplace,
      ledger: { entryCount, walletCount, recentEntries },
      reconciliation,
    })
  } catch (e) {
    console.error("GET /api/admin/finance", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

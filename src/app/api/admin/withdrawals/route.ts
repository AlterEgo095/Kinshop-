// KinShop — Administration des retraits vendeurs (Cycle 3 / LOT 2, ch. 16 du rapport financier)
//
// Machine d'états : requested → approved → paid ; requested → rejected ;
// approved → failed (déblocage automatique). Le DÉBIT du ledger (écriture
// WITHDRAWAL négative) est posé à l'APPROBATION — verrou réversible : un échec
// écrit une contrepartie ADJUSTMENT positive (jamais de perte silencieuse) ;
// PAID est irréversible et exige une référence de preuve.
// Aucune suppression ni modification d'écriture (append-only).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import { recordWithdrawalEntry, recordWithdrawalUnlockEntry, getWalletSummary } from "@/lib/finance"

const ACTIONS = ["approve", "reject", "mark_paid", "mark_failed"] as const

// GET /api/admin/withdrawals — Tous les retraits (Super Admin)
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const withdrawals = await db.withdrawal.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    const stores = await db.store.findMany({
      select: { id: true, name: true, slug: true },
    })
    return NextResponse.json({ withdrawals, stores })
  } catch (e) {
    console.error("GET /api/admin/withdrawals", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/withdrawals — Décision admin
// Body : { id, action, reference?, proofNote?, failReason? }
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const action = String(body.action || "")
    if (!id || !ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return NextResponse.json(
        { error: "Paramètres requis : id + action (approve|reject|mark_paid|mark_failed)." },
        { status: 400 }
      )
    }
    const w = await db.withdrawal.findUnique({ where: { id } })
    if (!w) return NextResponse.json({ error: "Retrait introuvable." }, { status: 404 })

    if (action === "approve") {
      if (w.status !== "requested") {
        return NextResponse.json(
          { error: `Action impossible depuis le statut « ${w.status} ».` },
          { status: 400 }
        )
      }
      // Anti-race (ch. 16) : le disponible est RE-VÉRIFIÉ à l'approbation —
      // pas seulement à la demande.
      const summary = await getWalletSummary(w.storeId)
      if (w.amount > summary.availableFC) {
        return NextResponse.json(
          {
            error: `Disponible insuffisant (${Math.round(summary.availableFC).toLocaleString("fr-FR")} FC) pour approuver ${Math.round(w.amount).toLocaleString("fr-FR")} FC.`,
          },
          { status: 400 }
        )
      }
      // Verrou réversible : écriture WITHDRAWAL négative (idempotente par retrait).
      const written = await recordWithdrawalEntry({
        storeId: w.storeId,
        withdrawalId: w.id,
        amountFC: w.amount,
        feeFC: w.fee,
        method: w.method,
        accountName: w.accountName,
        accountNumber: w.accountNumber,
      })
      if (!written) {
        return NextResponse.json(
          { error: "Débit déjà enregistré (retrait déjà approuvé)." },
          { status: 400 }
        )
      }
      const updated = await db.withdrawal.update({
        where: { id },
        data: { status: "approved", processedBy: "Super Admin (console)" },
      })
      await logAdminAction(
        "withdrawal.approved",
        `withdrawal:${w.id}`,
        `Retrait approuvé — ${w.netAmount} FC nets vers ${w.accountName} (${w.method})`
      )
      return NextResponse.json({ withdrawal: updated })
    }

    if (action === "reject") {
      if (w.status !== "requested") {
        return NextResponse.json(
          { error: `Action impossible depuis le statut « ${w.status} » (aucun débit posé).` },
          { status: 400 }
        )
      }
      const updated = await db.withdrawal.update({
        where: { id },
        data: {
          status: "rejected",
          processedBy: "Super Admin (console)",
          proofNote: String(body.proofNote || "").slice(0, 300),
        },
      })
      await logAdminAction("withdrawal.rejected", `withdrawal:${w.id}`, `Retrait refusé — ${w.amount} FC`)
      return NextResponse.json({ withdrawal: updated })
    }

    if (action === "mark_paid") {
      if (w.status !== "approved") {
        return NextResponse.json(
          { error: `Action impossible depuis le statut « ${w.status} » (le retrait doit être approuvé).` },
          { status: 400 }
        )
      }
      const reference = String(body.reference || "").slice(0, 100)
      if (!reference) {
        return NextResponse.json(
          { error: "Référence de preuve requise pour marquer un retrait payé." },
          { status: 400 }
        )
      }
      const updated = await db.withdrawal.update({
        where: { id },
        data: {
          status: "paid",
          reference,
          proofNote: String(body.proofNote || "").slice(0, 300),
          processedBy: "Super Admin (console)",
          processedAt: new Date(),
        },
      })
      await logAdminAction(
        "withdrawal.paid",
        `withdrawal:${w.id}`,
        `Retrait payé — ${w.netAmount} FC (réf ${reference})`
      )
      return NextResponse.json({ withdrawal: updated })
    }

    // mark_failed — échec d'exécution : déblocage automatique (ch. 16 —
    // jamais de perte silencieuse : contrepartie ADJUSTMENT positive).
    if (w.status !== "approved") {
      return NextResponse.json(
        { error: `Action impossible depuis le statut « ${w.status} ».` },
        { status: 400 }
      )
    }
    const failReason = String(body.failReason || "").slice(0, 300)
    if (!failReason) {
      return NextResponse.json({ error: "Motif d'échec requis." }, { status: 400 })
    }
    await recordWithdrawalUnlockEntry({
      storeId: w.storeId,
      withdrawalId: w.id,
      netFC: w.netAmount,
      failReason,
    })
    const updated = await db.withdrawal.update({
      where: { id },
      data: {
        status: "failed",
        failReason,
        processedBy: "Super Admin (console)",
        processedAt: new Date(),
      },
    })
    await logAdminAction(
      "withdrawal.failed",
      `withdrawal:${w.id}`,
      `Retrait en échec — ${w.netAmount} FC débloqués (${failReason})`
    )
    return NextResponse.json({ withdrawal: updated })
  } catch (e) {
    console.error("PATCH /api/admin/withdrawals", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

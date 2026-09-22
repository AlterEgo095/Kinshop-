import { db } from "@/lib/db"

// ─────────────────────────────────────────────────────────────────────────────
// LOT 1 (cycle 2) — Stock opérationnel : restitution à l'annulation / au retour
// ─────────────────────────────────────────────────────────────────────────────
// Les articles sont retirés du stock À LA CRÉATION de la commande (anti-survente
// atomique : updateMany conditionnel stock >= qty dans la transaction de création,
// côté POST /api/orders). Lorsque la commande est annulée ou retournée, le stock
// est restitué ici. La restitution est IDEMPOTENTE : l'existence de l'événement
// immuable stock_restored est re-vérifiée DANS la transaction avant tout
// incrément — un replay (double annulation, retour après annulation, course
// d'instances) ne peut jamais incrémenter deux fois. JAMAIS bloquant : un échec
// est journalisé serveur sans interrompre le flux métier de l'annulation.
export async function restoreOrderStock(
  orderId: string,
  actor: { type: string; id: string; label: string },
  reason: string,
): Promise<boolean> {
  try {
    const restored = await db.$transaction(async (tx) => {
      const already = await tx.orderEvent.findFirst({
        where: { orderId, type: "stock_restored" },
        select: { id: true },
      })
      if (already) return false
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { items: true },
      })
      if (!order) return false
      let items: { productId?: string; qty?: number }[] = []
      try {
        items = JSON.parse(order.items || "[]")
      } catch {
        items = []
      }
      for (const it of items) {
        const qty = Math.max(0, Math.floor(Number(it?.qty) || 0))
        if (it?.productId && qty > 0) {
          await tx.product.updateMany({
            where: { id: it.productId },
            data: { stock: { increment: qty } },
          })
        }
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          type: "stock_restored",
          actorType: actor.type,
          actorId: actor.id,
          actorLabel: actor.label,
          oldValue: "",
          newValue: `${items.length} ligne(s) restituée(s)`,
          reason,
        },
      })
      return true
    })
    return restored
  } catch (e) {
    console.error("restoreOrderStock", e)
    return false
  }
}

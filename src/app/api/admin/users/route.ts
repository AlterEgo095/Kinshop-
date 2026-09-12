import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/users — Vue globale des utilisateurs (Super Admin)
// JAMAIS de hash de mot de passe ni de données de session dans la réponse.
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        email: true,
        name: true,
        whatsapp: true,
        role: true,
        createdAt: true,
        stores: { select: { name: true, slug: true, status: true, verificationStatus: true, isPremium: true, premiumUntil: true } },
        _count: { select: { orders: true, reports: true } },
      },
    })

    const owners = users.filter((u) => u.stores.length > 0).length

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        premiumActive:
          u.stores.length > 0 &&
          u.stores.some(
            (s) => s.isPremium && s.premiumUntil && new Date(s.premiumUntil).getTime() > Date.now(),
          ),
      })),
      stats: {
        total: users.length,
        owners,
        customers: users.length - owners,
      },
    })
  } catch (e) {
    console.error("GET /api/admin/users", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/users — Rôle (réservé : user | admin) — action sensible, journalisée
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const role = String(body.role || "")
    if (!id || !["user", "admin"].includes(role)) {
      return NextResponse.json({ error: "Paramètres requis : id + role (user|admin)." }, { status: 400 })
    }
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 })

    const updated = await db.user.update({ where: { id }, data: { role } })
    await logAdminAction("user.role", `user:${user.email}`, `Rôle ${user.role} → ${role}`)
    return NextResponse.json({ ok: true, role: updated.role })
  } catch (e) {
    console.error("PATCH /api/admin/users", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

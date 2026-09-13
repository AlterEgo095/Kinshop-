import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/users — Vue globale des utilisateurs (Super Admin)
// JAMAIS de hash de mot de passe ni de données de session dans la réponse.
// P5 (F5-7) : recherche serveur q (email/nom/WhatsApp) + statut du compte.
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").toLowerCase().trim()

    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        email: true,
        name: true,
        whatsapp: true,
        role: true,
        status: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        stores: { select: { name: true, slug: true, status: true, verificationStatus: true, isPremium: true, premiumUntil: true } },
        _count: { select: { orders: true, reports: true } },
      },
    })

    const filtered = q
      ? users.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            u.whatsapp.includes(q.replace(/\D/g, "") || "␀"),
        )
      : users

    const owners = filtered.filter((u) => u.stores.length > 0).length

    return NextResponse.json({
      users: filtered.map((u) => ({
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
        suspended: users.filter((u) => u.status === "suspended").length,
      },
    })
  } catch (e) {
    console.error("GET /api/admin/users", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/users — Gouvernance des comptes (Super Admin)
// Body : { id, role? } | { id, action: "suspend"|"unsuspend", reason? }
// P5 (F5-3/F5-7) :
//  - suspension : sessions détruites immédiatement (déconnexion partout),
//    connexion refusée, toute requête authentifiée retombe en non-authentifié ;
//  - gardes : jamais suspendre/rétrograder un admin, jamais s'auto-cible ;
//  - le DERNIER compte admin ne peut pas être rétrogradé (anti-lockout console).
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const action = String(body.action || "role")
    if (!id) {
      return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })
    }
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 })

    if (action === "role") {
      const role = String(body.role || "")
      if (!["user", "admin"].includes(role)) {
        return NextResponse.json({ error: "Paramètre role requis (user|admin)." }, { status: 400 })
      }
      if (role === user.role) {
        return NextResponse.json({ error: "Ce compte a déjà ce rôle." }, { status: 409 })
      }
      // P5 (F5-7) — gardes anti-lockout : ne pas rétrograder le dernier admin
      if (user.role === "admin" && role === "user") {
        const adminCount = await db.user.count({ where: { role: "admin", status: "active" } })
        if (adminCount <= 1) {
          return NextResponse.json(
            { error: "Impossible de rétrograder le dernier compte admin (anti-lockout)." },
            { status: 409 },
          )
        }
      }
      const updated = await db.user.update({ where: { id }, data: { role } })
      await logAdminAction("user.role", `user:${user.email}`, `Rôle ${user.role} → ${role}`)
      return NextResponse.json({ ok: true, role: updated.role })
    }

    if (action === "suspend") {
      if (user.role === "admin") {
        return NextResponse.json(
          { error: "Un compte administrateur ne peut pas être suspendu." },
          { status: 409 },
        )
      }
      if (user.status === "suspended") {
        return NextResponse.json({ error: "Ce compte est déjà suspendu." }, { status: 409 })
      }
      const reason = String(body.reason || "").slice(0, 300)
      if (reason.trim().length < 4) {
        return NextResponse.json(
          { error: "Un motif de suspension est obligatoire (4 caractères min)." },
          { status: 400 },
        )
      }
      // Déconnexion immédiate partout + statut suspendu (atomique)
      await db.$transaction([
        db.user.update({
          where: { id },
          data: { status: "suspended", suspendedAt: new Date(), suspendedReason: reason },
        }),
        db.session.deleteMany({ where: { userId: id } }),
      ])
      await logAdminAction(
        "user.suspend",
        `user:${user.email}`,
        `Compte suspendu — motif : ${reason} — sessions révoquées`,
      )
      return NextResponse.json({ ok: true, status: "suspended" })
    }

    if (action === "unsuspend") {
      if (user.status !== "suspended") {
        return NextResponse.json({ error: "Ce compte n'est pas suspendu." }, { status: 409 })
      }
      await db.user.update({
        where: { id },
        data: { status: "active", suspendedAt: null, suspendedReason: "" },
      })
      await logAdminAction("user.unsuspend", `user:${user.email}`, "Suspension levée — le compte peut se reconnecter")
      return NextResponse.json({ ok: true, status: "active" })
    }

    return NextResponse.json({ error: "Action inconnue (role|suspend|unsuspend)." }, { status: 400 })
  } catch (e) {
    console.error("PATCH /api/admin/users", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

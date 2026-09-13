import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth"
import { getAdminUser, logAdminAction, noteAdminFailure, adminRateLimitedResponse } from "@/lib/admin"

// Authentification administrateur — EMAIL + MOT DE PASSE (fini le code PIN).
//
//   POST   /api/admin/auth  → connexion { email, password } (session cookie HttpOnly)
//   GET    /api/admin/auth  → état de la session courante (pour l'UI console)
//   DELETE /api/admin/auth  → déconnexion (session détruite côté serveur + cookie)
//
// Défenses conservées de l'audit (F-05) : 5 échecs / 15 min / IP → 429.
// Anti-énumération : message d'erreur unique + temps de calcul uniformisé
// (un hash factice est vérifié quand l'email est inconnu).

const SESSION_COOKIE = "kinshop_session"

// Hash scrypt factice (d'un mot de passe aléatoire jamais utilisé) : garantit
// qu'une tentative sur un email inconnu coûte le même temps CPU qu'une
// tentative sur le vrai compte — anti-canal auxiliaire (timing).
const DUMMY_HASH =
  "s1$32179e82995d87798e806d622fa51e81$c841bd1071bd9783e32e20379976b4ba940e66f23e99c3f72509a9a8198c5d7fe195cbc43274b6573b9e8c8caafb01424caeb2002be776aad013526bd08da781"

/** GET — état de la session admin courante (200 même déconnecté, pour l'UI). */
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminUser(req)
    return NextResponse.json({
      authenticated: Boolean(admin),
      email: admin?.email ?? null,
      name: admin?.name ?? null,
    })
  } catch (e) {
    console.error("GET /api/admin/auth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

/** POST — connexion administrateur : email + mot de passe. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis." },
        { status: 400 },
      )
    }

    // F-05 : anti brute-force — 5 échecs / 15 min / IP (échec = identifiants
    // invalides ; une connexion réussie ne compte jamais).
    const failure = () => {
      if (!noteAdminFailure(req)) return adminRateLimitedResponse()
      return NextResponse.json(
        { error: "Identifiants administrateur invalides." },
        { status: 401 },
      )
    }

    const user = await db.user.findUnique({ where: { email } })

    // Vérification à temps uniforme : le hash factice est utilisé si l'email
    // est inconnu — jamais d'oracle de timing sur l'existence du compte.
    const passwordOk = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !passwordOk) return failure()

    // Autorisation : rôle admin explicite ET compte actif (fail-closed).
    if (user.role !== "admin" || user.status !== "active") return failure()

    // Hygiène : purge des sessions expirées (opportuniste, non bloquant).
    await db.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {})

    const { token, expiresAt } = await createSession(user.id)

    await logAdminAction(
      "admin.login",
      "console",
      `Connexion administrateur — ${email}`,
    )

    const res = NextResponse.json({
      ok: true,
      email: user.email,
      name: user.name,
    })
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (e) {
    console.error("POST /api/admin/auth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

/** DELETE — déconnexion : destruction serveur de la session + effacement cookie. */
export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (token) await destroySession(token)

    const admin = await getAdminUser(req)
    if (admin) {
      await logAdminAction("admin.logout", "console", `Déconnexion administrateur — ${admin.email}`)
    }

    const res = NextResponse.json({ ok: true })
    clearSessionCookie(res)
    return res
  } catch (e) {
    console.error("DELETE /api/admin/auth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

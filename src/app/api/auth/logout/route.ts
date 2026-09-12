// POST /api/auth/logout — Déconnexion (supprime la session côté serveur)

import { NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, destroySession } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const token = req.cookies.get("kinshop_session")?.value
  if (token) await destroySession(token)

  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}

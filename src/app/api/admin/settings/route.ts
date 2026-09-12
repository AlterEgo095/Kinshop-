import { NextRequest, NextResponse } from "next/server"
import {
  guardAdmin,
  logAdminAction,
  getPlatformSettings,
  setPlatformSetting,
  SETTING_KEYS,
} from "@/lib/admin"
import { db } from "@/lib/db"

// GET /api/admin/settings — Paramètres globaux de la plateforme
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const settings = await getPlatformSettings()
    return NextResponse.json({ settings })
  } catch (e) {
    console.error("GET /api/admin/settings", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/settings — Modifier les paramètres globaux
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const changes: string[] = []

    if (body.maintenance === true || body.maintenance === "on") {
      await setPlatformSetting(SETTING_KEYS.maintenance, "on")
      changes.push("mode maintenance activé")
    } else if (body.maintenance === false || body.maintenance === "off") {
      await setPlatformSetting(SETTING_KEYS.maintenance, "off")
      changes.push("mode maintenance désactivé")
    }

    if (typeof body.announcement === "string") {
      const text = body.announcement.trim().slice(0, 280)
      await setPlatformSetting(SETTING_KEYS.announcement, text)
      changes.push(text ? `annonce : « ${text} »` : "annonce retirée")
    }

    if (Number(body.defaultRateFC) > 0) {
      const rate = Math.round(Number(body.defaultRateFC))
      // Taux actuellement en vigueur (avant modification) — base de la synchronisation
      const previous = (await getPlatformSettings()).defaultRateFC
      await setPlatformSetting(SETTING_KEYS.defaultRateFC, String(rate))
      // Synchronisation temps réel : les boutiques alignées sur l'ancien taux par
      // défaut suivent immédiatement le nouveau. Les boutiques ayant un taux
      // personnalisé (fixé par le vendeur) ne sont pas touchées.
      let cascaded = 0
      if (previous !== rate) {
        const res = await db.store.updateMany({
          where: { rateFC: previous },
          data: { rateFC: rate },
        })
        cascaded = res.count
      }
      changes.push(
        cascaded > 0
          ? `taux par défaut : ${rate} FC/$ (${cascaded} boutique${cascaded > 1 ? "s" : ""} synchronisée${cascaded > 1 ? "s" : ""})`
          : `taux par défaut : ${rate} FC/$`,
      )
    }

    if (changes.length === 0) {
      return NextResponse.json({ error: "Aucun paramètre valide fourni." }, { status: 400 })
    }

    await logAdminAction("settings.update", "platform", changes.join(" · "))
    const settings = await getPlatformSettings()

    return NextResponse.json({ settings })
  } catch (e) {
    console.error("PATCH /api/admin/settings", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

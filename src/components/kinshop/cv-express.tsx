"use client"

// CV Express RDC — Générateur de CV au format A4 pour le remploi congolais.
// Formulaire en 3 étapes → rendu canvas 1240×1754 (A4 @150 dpi) → export PNG/PDF + partage WhatsApp.
// Outil d'acquisition 100 % côté client (aucune route API, aucune base de données) :
// le brouillon reste dans le localStorage du téléphone (« kinshop_cv_draft »).
// Pattern rendu/exports inspiré de status-studio.tsx (helpers wrapText, roundRect, toBlob/share).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatPhoneDisplay, slugify } from "@/lib/kinshop"

/* ═══════════════ Types (exportés pour réutilisation) ═══════════════ */

export type CvTemplate = "classique" | "moderne"

export type CvExperience = { role: string; company: string; period: string; detail: string }
export type CvFormation = { degree: string; school: string; year: string }
export type CvLanguage = { name: string; level: "Notions" | "Intermédiaire" | "Courant" | "Bilingue" }

export type CvData = {
  fullName: string
  jobTitle: string
  phone: string
  email: string
  city: string
  pitch: string
  experiences: CvExperience[]
  formations: CvFormation[]
  skills: string[]
  languages: CvLanguage[]
  refName: string
  refContact: string
  photoDataUrl: string // dataURL carré (recadré à l'upload), dessiné en cercle — optionnel
  template: CvTemplate
}

/* ═══════════════ Constantes métier ═══════════════ */

const CV_DRAFT_KEY = "kinshop_cv_draft"
const MAX_EXPERIENCES = 5
const MAX_FORMATIONS = 4
const MAX_SKILLS = 10
const MAX_LANGUAGES = 6
const PITCH_MAX = 280

const LEVELS: CvLanguage["level"][] = ["Notions", "Intermédiaire", "Courant", "Bilingue"]

// Communes de Kinshasa (datalist du champ ville)
const KIN_COMMUNES = [
  "Gombe", "Lingwala", "Kalamu", "Limete", "Ngaliema", "Matete", "Lemba", "Kasavubu",
  "Bandalungwa", "Kintambo", "Barumbu", "Ngaba", "Makala", "Selembao", "Masina",
  "Kimbanseke", "N'djili", "Bumbu",
]

const EMPTY_CV: CvData = {
  fullName: "",
  jobTitle: "",
  phone: "",
  email: "",
  city: "",
  pitch: "",
  experiences: [],
  formations: [],
  skills: [],
  languages: [
    { name: "Français", level: "Courant" },
    { name: "Lingala", level: "Bilingue" },
    { name: "Anglais", level: "Notions" },
  ],
  refName: "",
  refContact: "",
  photoDataUrl: "",
  template: "classique",
}

/** Profil congolais réaliste pour le bouton « Remplir un exemple ». */
const EXAMPLE_CV: CvData = {
  fullName: "Grace Mbala",
  jobTitle: "Attachée commerciale",
  phone: "+243 82 345 6789",
  email: "grace.mbala@gmail.com",
  city: "Gombe, Kinshasa",
  pitch:
    "Dynamique et souriante, je maîtrise la vente, l'accueil client et l'encaissement mobile money. Je cherche un poste d'attachée commerciale pour développer les ventes d'une entreprise kinoise.",
  experiences: [
    {
      role: "Vendeuse",
      company: "Boutique Divine Mode",
      period: "2022 – 2024",
      detail:
        "Accueil clients, gestion du stock et encaissement mobile money (M-Pesa, Airtel Money).",
    },
    {
      role: "Caissière",
      company: "Supermarché Kin Mart",
      period: "2020 – 2022",
      detail: "Encaissement quotidienne, contrôle de caisse et service client.",
    },
  ],
  formations: [{ degree: "Licence en Commercialité", school: "UNIKIN", year: "2020" }],
  skills: [
    "Vente",
    "Service client",
    "Encaissement mobile money",
    "Gestion de stock",
    "Excel",
    "Lingala & Français",
  ],
  languages: [
    { name: "Français", level: "Courant" },
    { name: "Lingala", level: "Bilingue" },
    { name: "Anglais", level: "Notions" },
  ],
  refName: "Mme Ngo Bala",
  refContact: "Gérante, Boutique Divine Mode — +243 812 345 678",
  photoDataUrl: "",
  template: "classique",
}

const TEMPLATES: { id: CvTemplate; label: string }[] = [
  { id: "classique", label: "Kin Classique" },
  { id: "moderne", label: "Kin Moderne" },
]

const STEPS = [
  { n: 1, label: "Identité" },
  { n: 2, label: "Parcours" },
  { n: 3, label: "Compétences" },
] as const

/* ═══════════════ Rendu canvas — constantes & helpers ═══════════════ */

const W = 1240 // A4 @150 dpi
const H = 1754
const M = 64 // marge

const EMERALD_900 = "#064e3b"
const EMERALD_600 = "#059669"
const EMERALD_500 = "#10b981"
const AMBER_LIGHT = "#fcd34d"
const AMBER_ACCENT = "#f59e0b"
const AMBER_DARK = "#b45309"
const INK = "#111827"
const BODY = "#374151"
const MUTED = "#6b7280"
const FOOTER_INK = "rgba(55, 65, 81, 0.4)"
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif"

/** police canvas compacte : F(800, 74) → "800 74px system-ui, …" */
const F = (weight: number, size: number) => `${weight} ${size}px ${SANS}`

/**
 * Découpe un texte en lignes tenant dans maxWidth. maxLines limite verticalement :
 * la dernière ligne est tronquée proprement avec « … » si des mots restent dehors.
 * Signature minimale : wrapText(ctx, text, maxWidth) — maxLines optionnel.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = Number.POSITIVE_INFINITY,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const lines: string[] = []
  let current = ""
  let hasMore = false
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) {
        hasMore = true
        break
      }
    } else {
      current = test
    }
  }
  if (!hasMore && current) lines.push(current)
  if (lines.length > maxLines) {
    lines.length = maxLines
    hasMore = true
  }
  if (hasMore && lines.length > 0) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = `${last.trimEnd()}…`
  }
  return lines
}

/** Tronque une ligne unique avec « … » si trop large (chips, métadonnées). */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r)
  } else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

/** Charge une image depuis un dataURL (null si vide/illisible — jamais bloquant). */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Photo dessinée en cercle : save → clip → drawImage cover → liseré ambre. */
function drawCirclePhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  const ratio = Math.max((2 * r) / img.width, (2 * r) / img.height)
  const dw = img.width * ratio
  const dh = img.height * ratio
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)"
  ctx.lineWidth = 5
  ctx.stroke()
}

/** Chips flow-wrap (compétences). Retourne la nouvelle y + flag troncature. */
function flowChips(
  ctx: CanvasRenderingContext2D,
  items: string[],
  opts: {
    x: number
    maxWidth: number
    y: number
    chipH: number
    variant: "light" | "dark"
    maxBottom: number
    gapX?: number
    gapY?: number
  },
): { y: number; truncated: boolean } {
  const gapX = opts.gapX ?? 12
  const gapY = opts.gapY ?? 14
  ctx.font = F(600, opts.variant === "light" ? 24 : 23)
  // Le helper assume textAlign="left" — on isole l'état du contexte (la sidebar moderne centre ses titres).
  const prevAlign = ctx.textAlign
  ctx.textAlign = "left"
  let cx = opts.x
  let cy = opts.y
  let truncated = false
  for (const raw of items) {
    const label = truncateText(ctx, raw.trim(), opts.maxWidth - 36)
    if (!label) continue
    const tw = ctx.measureText(label).width
    const w = tw + 36
    if (cx + w > opts.x + opts.maxWidth && cx > opts.x) {
      cx = opts.x
      cy += opts.chipH + gapY
    }
    if (cy + opts.chipH > opts.maxBottom) {
      truncated = true
      break
    }
    const fill = opts.variant === "light" ? "#f3f4f6" : "rgba(255, 255, 255, 0.14)"
    const stroke = opts.variant === "light" ? "rgba(17, 24, 39, 0.08)" : "rgba(255, 255, 255, 0.22)"
    const ink = opts.variant === "light" ? "#1f2937" : "#ffffff"
    ctx.fillStyle = fill
    roundRect(ctx, cx, cy, w, opts.chipH, 12)
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    roundRect(ctx, cx, cy, w, opts.chipH, 12)
    ctx.stroke()
    ctx.fillStyle = ink
    ctx.fillText(label, cx + 18, cy + opts.chipH / 2 + 8)
    cx += w + gapX
  }
  ctx.textAlign = prevAlign
  return { y: cy + opts.chipH, truncated }
}

/** Timeline moderne : pastille emerald + trait vertical, contenu décalé. */
function drawTimeline(
  ctx: CanvasRenderingContext2D,
  exps: CvExperience[],
  o: { x: number; width: number; y: number; bottom: number },
): number {
  const contentX = o.x + 44
  const contentW = o.width - 44
  const dotX = o.x + 10
  let y = o.y
  let prevDotY = -1
  for (const e of exps) {
    ctx.font = F(700, 27)
    const roleLines = wrapText(ctx, e.role.trim() || e.company.trim(), contentW, 2)
    const metaParts = [e.company.trim(), e.period.trim()]
    const roleUsed = e.role.trim() || e.company.trim()
    const meta = metaParts
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
      .filter((v) => v !== roleUsed)
      .join(" — ")
    ctx.font = F(600, 24)
    const metaLines = meta ? wrapText(ctx, meta, contentW, 1) : []
    ctx.font = F(400, 24)
    const detLines = e.detail.trim() ? wrapText(ctx, e.detail.trim(), contentW, 2) : []
    const blockH =
      roleLines.length * 36 +
      (metaLines.length ? 30 : 0) +
      (detLines.length ? 6 + detLines.length * 32 : 0) +
      26
    if (y + blockH > o.bottom) {
      ctx.fillStyle = MUTED
      ctx.font = F(700, 28)
      ctx.fillText("…", contentX, Math.min(y + 24, o.bottom))
      break
    }
    // Pastille + trait de liaison
    const dotY = y - 8
    ctx.fillStyle = EMERALD_500
    ctx.beginPath()
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2)
    ctx.fill()
    if (prevDotY >= 0) {
      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(dotX, prevDotY + 14)
      ctx.lineTo(dotX, dotY - 16)
      ctx.stroke()
    }
    prevDotY = dotY
    // Contenu
    let ty = y
    ctx.fillStyle = INK
    ctx.font = F(700, 27)
    for (const line of roleLines) {
      ctx.fillText(line, contentX, ty)
      ty += 36
    }
    if (metaLines.length) {
      ctx.fillStyle = EMERALD_600
      ctx.font = F(600, 24)
      ctx.fillText(metaLines[0], contentX, ty)
      ty += 30
    }
    if (detLines.length) {
      ty += 6
      ctx.fillStyle = BODY
      ctx.font = F(400, 24)
      for (const line of detLines) {
        ctx.fillText(line, contentX, ty)
        ty += 32
      }
    }
    y = ty + 26
  }
  return y
}

function drawCanvasFooter(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts?: { x?: number; y?: number; align?: CanvasTextAlign },
) {
  ctx.save()
  ctx.fillStyle = FOOTER_INK
  ctx.font = F(500, 24)
  ctx.textAlign = opts?.align ?? "center"
  ctx.fillText(text, opts?.x ?? W / 2, opts?.y ?? H - 42)
  ctx.restore()
}

/* ─────────── Modèle « Kin Classique » ─────────── */

function renderClassic(
  ctx: CanvasRenderingContext2D,
  d: CvData,
  photo: HTMLImageElement | null,
) {
  /* 1. Bandeau emerald (hauteur mesurée avant dessin) */
  ctx.textAlign = "center"
  ctx.font = F(800, 74)
  const nameLines = wrapText(ctx, d.fullName.trim() || " ", W - 160, 2)
  ctx.font = F(600, 36)
  const titleLines = d.jobTitle.trim() ? wrapText(ctx, d.jobTitle.trim(), W - 220, 2) : []
  const contactText = [formatPhoneDisplay(d.phone), d.email.trim(), d.city.trim()]
    .filter(Boolean)
    .join("    ·    ")
  ctx.font = F(400, 27)
  const contactLines = contactText ? wrapText(ctx, contactText, W - 260, 2) : []

  const PHOTO_R = 86
  let headH: number
  if (photo) {
    headH =
      96 +
      PHOTO_R * 2 +
      64 +
      nameLines.length * 86 +
      (titleLines.length ? 8 + titleLines.length * 46 : 0) +
      12 +
      contactLines.length * 38 +
      36
  } else {
    headH = Math.max(
      300,
      120 +
        nameLines.length * 86 +
        (titleLines.length ? 8 + titleLines.length * 46 : 0) +
        12 +
        contactLines.length * 38 +
        36,
    )
  }

  ctx.fillStyle = EMERALD_900
  ctx.fillRect(0, 0, W, headH)
  ctx.fillStyle = AMBER_ACCENT
  ctx.fillRect(0, headH, W, 6)

  let y: number
  if (photo) {
    drawCirclePhoto(ctx, photo, W / 2, 96 + PHOTO_R, PHOTO_R)
    y = 96 + PHOTO_R * 2 + 64
  } else {
    y = 120
  }
  ctx.fillStyle = "#ffffff"
  ctx.font = F(800, 74)
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y)
    y += 86
  }
  if (titleLines.length) {
    y += 8
    ctx.fillStyle = AMBER_LIGHT
    ctx.font = F(600, 36)
    for (const line of titleLines) {
      ctx.fillText(line, W / 2, y)
      y += 46
    }
  }
  if (contactLines.length) {
    y += 12
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)"
    ctx.font = F(400, 27)
    for (const line of contactLines) {
      ctx.fillText(line, W / 2, y)
      y += 38
    }
  }

  /* 2. Corps colonne unique */
  const bottom = H - 96
  y = headH + 56
  ctx.textAlign = "left"
  let ellipsed = false

  /** Garde-fou vertical : dessine un « … » unique et stoppe si ça déborde. */
  const ensure = (needed: number): boolean => {
    if (y + needed <= bottom) return true
    if (!ellipsed) {
      ellipsed = true
      ctx.fillStyle = MUTED
      ctx.font = F(700, 30)
      ctx.fillText("…", M, Math.min(y + 26, bottom))
    }
    return false
  }

  const sectionTitle = (label: string): boolean => {
    if (!ensure(80)) return false
    ctx.fillStyle = EMERALD_900
    ctx.font = F(800, 27)
    ctx.fillText(label.toUpperCase(), M, y)
    ctx.fillStyle = EMERALD_500
    ctx.fillRect(M, y + 12, 76, 4)
    ctx.fillStyle = "rgba(16, 185, 129, 0.18)"
    ctx.fillRect(M + 84, y + 14, W - M * 2 - 84, 2)
    y += 48
    return true
  }

  const finish = () => drawCanvasFooter(ctx, "Créé avec KinShop — kinshop.cd")

  // Profil
  const pitch = d.pitch.trim()
  if (pitch) {
    if (!sectionTitle("Profil")) return finish()
    ctx.font = F(400, 26)
    const lines = wrapText(ctx, pitch, W - M * 2, 5)
    ctx.fillStyle = BODY
    for (const line of lines) {
      if (!ensure(38)) return finish()
      ctx.fillText(line, M, y)
      y += 38
    }
    y += 20
  }

  // Expérience
  const exps = d.experiences.filter((e) => e.role.trim() || e.company.trim() || e.detail.trim())
  if (exps.length) {
    if (!sectionTitle("Expérience professionnelle")) return finish()
    for (const e of exps) {
      const period = e.period.trim()
      ctx.font = F(500, 25)
      const periodW = period ? ctx.measureText(period).width : 0
      const roleMax = W - M * 2 - (periodW ? periodW + 28 : 0)
      const roleText = e.role.trim() || e.company.trim()
      ctx.font = F(700, 28)
      const roleLines = wrapText(ctx, roleText, roleMax, 1)
      const companyText = e.company.trim() && e.company.trim() !== roleText ? e.company.trim() : ""
      ctx.font = F(400, 24)
      const detLines = e.detail.trim() ? wrapText(ctx, e.detail.trim(), W - M * 2, 2) : []
      const blockH =
        38 + (companyText ? 34 : 0) + (detLines.length ? 8 + detLines.length * 34 : 0) + 20
      if (!ensure(blockH)) return finish()
      if (period) {
        ctx.save()
        ctx.textAlign = "right"
        ctx.fillStyle = MUTED
        ctx.font = F(500, 25)
        ctx.fillText(period, W - M, y)
        ctx.restore()
      }
      let ly = y
      ctx.fillStyle = INK
      ctx.font = F(700, 28)
      ctx.fillText(roleLines[0], M, ly)
      ly += 38
      if (companyText) {
        ctx.fillStyle = EMERALD_600
        ctx.font = F(600, 26)
        ctx.fillText(companyText, M, ly)
        ly += 34
      }
      if (detLines.length) {
        ly += 8
        ctx.fillStyle = BODY
        ctx.font = F(400, 24)
        for (const line of detLines) {
          ctx.fillText(line, M, ly)
          ly += 34
        }
      }
      y = ly + 20
    }
    y += 4
  }

  // Formation
  const forms = d.formations.filter((f) => f.degree.trim() || f.school.trim())
  if (forms.length) {
    if (!sectionTitle("Formation")) return finish()
    for (const f of forms) {
      const degree = f.degree.trim() || f.school.trim()
      const year = f.year.trim()
      if (!ensure(year ? 76 : 44)) return finish()
      if (year) {
        ctx.save()
        ctx.textAlign = "right"
        ctx.fillStyle = MUTED
        ctx.font = F(500, 25)
        ctx.fillText(year, W - M, y)
        ctx.restore()
      }
      ctx.fillStyle = INK
      ctx.font = F(600, 27)
      ctx.fillText(truncateText(ctx, degree, W - M * 2), M, y)
      y += 36
      const school = f.school.trim()
      if (school && school !== degree) {
        if (!ensure(34)) return finish()
        ctx.fillStyle = MUTED
        ctx.font = F(400, 25)
        ctx.fillText(truncateText(ctx, school, W - M * 2), M, y)
        y += 32
      }
      y += 12
    }
  }

  // Compétences (badges rectangulaires gris clair, flow-wrap)
  const skills = d.skills.filter((s) => s.trim())
  if (skills.length) {
    if (!sectionTitle("Compétences")) return finish()
    if (!ensure(58)) return finish()
    const res = flowChips(ctx, skills, {
      x: M,
      maxWidth: W - M * 2,
      y,
      chipH: 48,
      variant: "light",
      maxBottom: bottom,
    })
    if (res.truncated) {
      if (!ellipsed) {
        ellipsed = true
        ctx.fillStyle = MUTED
        ctx.font = F(700, 28)
        ctx.fillText("…", M, Math.min(res.y + 20, bottom))
      }
      return finish()
    }
    y = res.y + 24
  }

  // Langues — une seule ligne « Français — Courant · Lingala — Bilingue »
  const langs = d.languages.filter((l) => l.name.trim())
  if (langs.length) {
    if (!sectionTitle("Langues")) return finish()
    if (!ensure(42)) return finish()
    const line = langs.map((l) => `${l.name.trim()} — ${l.level}`).join("    ·    ")
    ctx.fillStyle = BODY
    ctx.font = F(500, 26)
    ctx.fillText(wrapText(ctx, line, W - M * 2, 1)[0] ?? "", M, y)
    y += 42
  }

  // Référence
  if (d.refName.trim() || d.refContact.trim()) {
    if (!sectionTitle("Référence")) return finish()
    if (!ensure(d.refContact.trim() ? 76 : 42)) return finish()
    ctx.fillStyle = INK
    ctx.font = F(600, 27)
    ctx.fillText(
      truncateText(ctx, d.refName.trim() || d.refContact.trim(), W - M * 2),
      M,
      y,
    )
    y += 36
    if (d.refContact.trim()) {
      if (!ensure(34)) return finish()
      ctx.fillStyle = MUTED
      ctx.font = F(400, 25)
      ctx.fillText(wrapText(ctx, d.refContact.trim(), W - M * 2, 1)[0] ?? "", M, y)
      y += 34
    }
  }

  finish()
}

/* ─────────── Modèle « Kin Moderne » ─────────── */

function renderModern(
  ctx: CanvasRenderingContext2D,
  d: CvData,
  photo: HTMLImageElement | null,
) {
  const sideW = Math.round(W * 0.38)
  const bottom = H - 84
  const SCX = sideW / 2
  const SW = sideW - 88

  // Fond + sidebar emerald + liseré ambre
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = EMERALD_900
  ctx.fillRect(0, 0, sideW, H)
  ctx.fillStyle = AMBER_ACCENT
  ctx.fillRect(sideW - 5, 0, 5, H)

  let sy: number
  if (photo) {
    drawCirclePhoto(ctx, photo, SCX, 92 + 92, 92)
    sy = 92 + 184 + 56
  } else {
    sy = 104
  }

  ctx.textAlign = "center"

  const sideTitle = (label: string): boolean => {
    if (sy + 46 > bottom) return false
    ctx.fillStyle = AMBER_LIGHT
    ctx.font = F(800, 23)
    ctx.fillText(label.toUpperCase(), SCX, sy)
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)"
    ctx.fillRect(SCX - 28, sy + 10, 56, 2)
    sy += 44
    return true
  }

  /** Coupe la sidebar proprement (truncation silencieuse, jamais de débordement). */
  const sideStop = () => drawCanvasFooter(ctx, "Créé avec KinShop", { x: W - 48, y: H - 40, align: "right" })

  // CONTACTS
  const contactItems = [formatPhoneDisplay(d.phone), d.email.trim(), d.city.trim()].filter(Boolean)
  if (contactItems.length) {
    if (!sideTitle("Contacts")) return sideStop()
    ctx.font = F(500, 25)
    for (const item of contactItems) {
      const lines = wrapText(ctx, item, SW, 2)
      if (sy + lines.length * 34 + 8 > bottom) break
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)"
      for (const line of lines) {
        ctx.fillText(line, SCX, sy)
        sy += 34
      }
      sy += 8
    }
    sy += 22
  }

  // COMPÉTENCES — chips sombres
  const skills = d.skills.filter((s) => s.trim())
  if (skills.length) {
    if (!sideTitle("Compétences")) return sideStop()
    const res = flowChips(ctx, skills, {
      x: 44,
      maxWidth: sideW - 88,
      y: sy,
      chipH: 44,
      variant: "dark",
      maxBottom: bottom,
      gapY: 12,
    })
    sy = res.y + 26
  }

  // LANGUES
  const langs = d.languages.filter((l) => l.name.trim())
  if (langs.length) {
    if (!sideTitle("Langues")) return sideStop()
    ctx.font = F(500, 25)
    for (const l of langs) {
      if (sy + 34 > bottom) break
      ctx.fillStyle = "#ffffff"
      ctx.fillText(
        `${truncateText(ctx, l.name.trim(), SW - 110)} — ${l.level}`,
        SCX,
        sy,
      )
      sy += 34
    }
    sy += 22
  }

  // RÉFÉRENCE
  if (d.refName.trim() || d.refContact.trim()) {
    if (!sideTitle("Référence")) return sideStop()
    ctx.font = F(600, 25)
    const refMain = d.refName.trim() || d.refContact.trim()
    const mainLines = wrapText(ctx, refMain, SW, 2)
    if (sy + mainLines.length * 34 + 8 > bottom) return sideStop()
    ctx.fillStyle = "#ffffff"
    for (const line of mainLines) {
      ctx.fillText(line, SCX, sy)
      sy += 34
    }
    const contact = d.refContact.trim()
    if (contact && contact !== refMain) {
      const cLines = wrapText(ctx, contact, SW, 3)
      if (sy + cLines.length * 30 + 6 <= bottom) {
        sy += 6
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)"
        ctx.font = F(400, 23)
        for (const line of cLines) {
          ctx.fillText(line, SCX, sy)
          sy += 30
        }
      }
    }
  }

  /* Corps droit */
  const BX = sideW + 56
  const BW = W - sideW - 112
  let by = 104
  ctx.textAlign = "left"

  ctx.fillStyle = EMERALD_900
  ctx.font = F(800, 56)
  const nameLines = wrapText(ctx, d.fullName.trim() || " ", BW, 2)
  for (const line of nameLines) {
    ctx.fillText(line, BX, by)
    by += 64
  }
  if (d.jobTitle.trim()) {
    by += 6
    ctx.fillStyle = AMBER_DARK
    ctx.font = F(600, 31)
    ctx.fillText(wrapText(ctx, d.jobTitle.trim(), BW, 1)[0] ?? "", BX, by)
    by += 46
  }
  const pitch = d.pitch.trim()
  if (pitch) {
    by += 8
    ctx.fillStyle = BODY
    ctx.font = F(400, 26)
    const pLines = wrapText(ctx, pitch, BW, 5)
    for (const line of pLines) {
      ctx.fillText(line, BX, by)
      by += 38
    }
    by += 8
  }

  // EXPÉRIENCE PROFESSIONNELLE (timeline)
  const exps = d.experiences.filter((e) => e.role.trim() || e.company.trim() || e.detail.trim())
  if (exps.length) {
    by += 16
    if (by + 80 > bottom) {
      ctx.fillStyle = MUTED
      ctx.font = F(700, 28)
      ctx.fillText("…", BX, Math.min(by + 24, bottom))
      return sideStop()
    }
    ctx.fillStyle = EMERALD_600
    ctx.font = F(800, 26)
    ctx.fillText("EXPÉRIENCE PROFESSIONNELLE", BX, by)
    ctx.fillStyle = "rgba(16, 185, 129, 0.2)"
    ctx.fillRect(BX, by + 12, BW, 2)
    by += 50
    by = drawTimeline(ctx, exps, { x: BX, width: BW, y: by, bottom })
  }

  // FORMATION (timeline légère)
  const forms = d.formations.filter((f) => f.degree.trim() || f.school.trim())
  if (forms.length) {
    by += 14
    if (by + 80 > bottom) {
      ctx.fillStyle = MUTED
      ctx.font = F(700, 28)
      ctx.fillText("…", BX, Math.min(by + 24, bottom))
      return sideStop()
    }
    ctx.fillStyle = EMERALD_600
    ctx.font = F(800, 26)
    ctx.fillText("FORMATION", BX, by)
    ctx.fillStyle = "rgba(16, 185, 129, 0.2)"
    ctx.fillRect(BX, by + 12, BW, 2)
    by += 50
    for (const f of forms) {
      const degree = f.degree.trim() || f.school.trim()
      if (by + 40 > bottom) {
        ctx.fillStyle = MUTED
        ctx.font = F(700, 26)
        ctx.fillText("…", BX + 40, Math.min(by + 22, bottom))
        return sideStop()
      }
      ctx.fillStyle = EMERALD_500
      ctx.beginPath()
      ctx.arc(BX + 10, by - 9, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(BX + 10, by + 4)
      ctx.lineTo(BX + 10, by + 44)
      ctx.stroke()
      ctx.fillStyle = INK
      ctx.font = F(600, 27)
      ctx.fillText(truncateText(ctx, degree, BW - 52), BX + 40, by)
      by += 34
      const metaParts = [f.school.trim(), f.year.trim()]
      const meta = metaParts
        .filter((v, i, arr) => v && arr.indexOf(v) === i)
        .filter((v) => v !== degree)
        .join(" — ")
      if (meta) {
        if (by + 32 > bottom) return sideStop()
        ctx.fillStyle = MUTED
        ctx.font = F(400, 25)
        ctx.fillText(truncateText(ctx, meta, BW - 52), BX + 40, by)
        by += 32
      }
      by += 18
    }
  }

  sideStop()
}

/* ═══════════════ Sanitisation du brouillon localStorage ═══════════════ */

function sanitizeCv(raw: unknown): CvData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<CvData>
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : ""
  const isLevel = (v: unknown): v is CvLanguage["level"] =>
    typeof v === "string" && (LEVELS as string[]).includes(v)
  return {
    fullName: str(r.fullName, 80),
    jobTitle: str(r.jobTitle, 80),
    phone: str(r.phone, 24),
    email: str(r.email, 80),
    city: str(r.city, 60),
    pitch: str(r.pitch, PITCH_MAX),
    experiences: Array.isArray(r.experiences)
      ? r.experiences.slice(0, MAX_EXPERIENCES).map((e) => {
          const x = (e ?? {}) as Partial<CvExperience>
          return {
            role: str(x.role, 70),
            company: str(x.company, 90),
            period: str(x.period, 40),
            detail: str(x.detail, 220),
          }
        })
      : [],
    formations: Array.isArray(r.formations)
      ? r.formations.slice(0, MAX_FORMATIONS).map((f) => {
          const x = (f ?? {}) as Partial<CvFormation>
          return {
            degree: str(x.degree, 90),
            school: str(x.school, 90),
            year: str(x.year, 12),
          }
        })
      : [],
    skills: Array.isArray(r.skills)
      ? r.skills.filter((s): s is string => typeof s === "string").slice(0, MAX_SKILLS)
      : [],
    languages: Array.isArray(r.languages)
      ? r.languages.slice(0, MAX_LANGUAGES).map((l) => {
          const x = (l ?? {}) as Partial<CvLanguage>
          return { name: str(x.name, 30), level: isLevel(x.level) ? x.level : "Courant" }
        })
      : [],
    refName: str(r.refName, 80),
    refContact: str(r.refContact, 120),
    // ~300 Ko max : la photo est déjà recadrée/redimensionnée à l'upload
    photoDataUrl: str(r.photoDataUrl, 400_000),
    template: r.template === "moderne" ? "moderne" : "classique",
  }
}

/* ═══════════════ Sous-composants UI ═══════════════ */

function Stepper({ step, onStep }: { step: 1 | 2 | 3; onStep: (s: 1 | 2 | 3) => void }) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2 mb-7" aria-label="Étapes du CV">
      {STEPS.map((s, i) => {
        const done = step > s.n
        const active = step === s.n
        return (
          <Fragment key={s.n}>
            {i > 0 && <li aria-hidden className="h-px flex-1 bg-border min-w-3" />}
            <li className="flex-none">
              <button
                type="button"
                onClick={() => onStep(s.n)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 min-h-[44px] px-1.5 rounded-xl transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                    done
                      ? "bg-primary border-primary text-white"
                      : active
                        ? "border-primary text-primary ring-2 ring-primary/25 bg-primary/5"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="w-5 h-5" /> : s.n}
                </span>
                <span className={`text-xs sm:text-sm ${active ? "font-semibold" : "font-medium"}`}>
                  {s.label}
                </span>
              </button>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

function LevelSelect({
  value,
  onValueChange,
  id,
}: {
  value: CvLanguage["level"]
  onValueChange: (v: CvLanguage["level"]) => void
  id?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as CvLanguage["level"])}>
      <SelectTrigger id={id} className="w-[132px] sm:w-[150px] h-11 shrink-0" aria-label="Niveau de langue">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVELS.map((l) => (
          <SelectItem key={l} value={l}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Miniature CSS des deux modèles (sélecteur radio de l'aperçu). */
function TemplateThumb({ id }: { id: CvTemplate }) {
  if (id === "classique") {
    return (
      <div className="aspect-[3/4] rounded-lg overflow-hidden border bg-white flex flex-col">
        <div className="h-[26%] bg-emerald-900 flex flex-col items-center justify-center gap-1.5">
          <div className="w-10 h-1.5 rounded-full bg-white/90" />
          <div className="w-8 h-1 rounded-full bg-amber-300" />
          <div className="w-11 h-0.5 rounded-full bg-white/50" />
        </div>
        <div className="flex-1 p-2.5 space-y-1.5">
          <div className="w-1/2 h-1.5 rounded-full bg-emerald-700/70" />
          <div className="w-full h-0.5 rounded-full bg-muted" />
          <div className="w-11/12 h-0.5 rounded-full bg-muted" />
          <div className="w-2/3 h-0.5 rounded-full bg-muted" />
          <div className="w-2/5 h-1.5 rounded-full bg-emerald-700/70 mt-2" />
          <div className="w-full h-0.5 rounded-full bg-muted" />
          <div className="w-5/6 h-0.5 rounded-full bg-muted" />
          <div className="flex gap-1 pt-1">
            <div className="w-6 h-2.5 rounded bg-gray-200" />
            <div className="w-8 h-2.5 rounded bg-gray-200" />
            <div className="w-5 h-2.5 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="aspect-[3/4] rounded-lg overflow-hidden border bg-white flex">
      <div className="w-[38%] bg-emerald-900 p-2 space-y-1.5">
        <div className="w-7 h-7 rounded-full bg-white/25 mx-auto" />
        <div className="w-7 h-1 rounded-full bg-amber-300 mx-auto" />
        <div className="w-full h-0.5 rounded-full bg-white/50" />
        <div className="w-5/6 h-0.5 rounded-full bg-white/50" />
        <div className="w-4/5 h-0.5 rounded-full bg-white/35" />
        <div className="w-9 h-2.5 rounded bg-white/20 mt-2" />
        <div className="w-7 h-2.5 rounded bg-white/20" />
        <div className="w-8 h-2.5 rounded bg-white/20" />
      </div>
      <div className="flex-1 p-2.5 space-y-1.5">
        <div className="w-3/4 h-1.5 rounded-full bg-emerald-800/80" />
        <div className="w-1/2 h-1 rounded-full bg-amber-500/80" />
        <div className="w-full h-0.5 rounded-full bg-muted mt-1" />
        <div className="w-11/12 h-0.5 rounded-full bg-muted" />
        <div className="w-5/6 h-0.5 rounded-full bg-muted" />
        <div className="w-2/5 h-1.5 rounded-full bg-emerald-700/70 mt-2" />
        <div className="flex gap-1.5 pt-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <div className="flex-1 space-y-1">
            <div className="w-full h-0.5 rounded-full bg-muted" />
            <div className="w-2/3 h-0.5 rounded-full bg-muted" />
          </div>
        </div>
        <div className="flex gap-1.5 pt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <div className="flex-1 space-y-1">
            <div className="w-full h-0.5 rounded-full bg-muted" />
            <div className="w-1/2 h-0.5 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ Composant principal ═══════════════ */

export default function CvExpress({
  onHome,
  onCreateStore,
}: {
  onHome?: () => void
  onCreateStore?: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [view, setView] = useState<"wizard" | "preview">("wizard")
  const [data, setData] = useState<CvData>(EMPTY_CV)
  const [hydrated, setHydrated] = useState(false)
  const [exported, setExported] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [busy, setBusy] = useState<"png" | "pdf" | "share" | null>(null)
  const [skillInput, setSkillInput] = useState("")
  const [newLangName, setNewLangName] = useState("")
  const [newLangLevel, setNewLangLevel] = useState<CvLanguage["level"]>("Courant")

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const renderSeq = useRef(0)

  /* ── Brouillon : chargement au mount (async IIFE → jamais de setState synchrone d'effet) ── */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      try {
        const raw = localStorage.getItem(CV_DRAFT_KEY)
        if (raw) setData(sanitizeCv(JSON.parse(raw)))
      } catch {
        // brouillon corrompu → on repart du formulaire vide
      }
      if (!cancelled) setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Brouillon : sauvegarde à chaque modification (après hydratation) ── */
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(CV_DRAFT_KEY, JSON.stringify(data))
    } catch {
      // quota dépassé (photo trop lourde) → on ignore silencieusement
    }
  }, [data, hydrated])

  /* ── Rendu canvas : à chaque changement de données / modèle / retour en aperçu ── */
  const renderCanvas = useCallback(async (d: CvData) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const seq = ++renderSeq.current
    const photo = await loadImage(d.photoDataUrl)
    if (seq !== renderSeq.current) return
    setRendering(true)
    try {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, W, H)
      ctx.textBaseline = "alphabetic"
      if (d.template === "moderne") renderModern(ctx, d, photo)
      else renderClassic(ctx, d, photo)
    } finally {
      setRendering(false)
    }
  }, [])

  useEffect(() => {
    if (view !== "preview") return
    // AnimatePresence mode="wait" : l'écran preview se monte ~280 ms après le changement
    // de vue — on attend que canvasRef soit attaché avant de dessiner.
    let raf = 0
    let tries = 0
    const attempt = () => {
      if (canvasRef.current) {
        void renderCanvas(data)
        return
      }
      if (tries++ < 60) raf = requestAnimationFrame(attempt)
    }
    attempt()
    return () => cancelAnimationFrame(raf)
  }, [view, data, renderCanvas])

  /* ── Dérivés ── */
  const fileNameBase = useMemo(() => {
    const slug = slugify(data.fullName.trim()) || "cv"
    return `cv-${slug}`
  }, [data.fullName])

  const phoneHint = useMemo(() => {
    if (!data.phone.trim()) return "Format : +243 8XX XXX XXX"
    const formatted = formatPhoneDisplay(data.phone)
    return formatted !== data.phone.trim() ? `Numéro normalisé : ${formatted}` : "Numéro enregistré."
  }, [data.phone])

  const exportsDisabled = rendering || busy !== null

  /* ── Mise à jour du formulaire ── */
  const patch = (p: Partial<CvData>) => setData((d) => ({ ...d, ...p }))

  const updateExperience = (idx: number, p: Partial<CvExperience>) =>
    setData((d) => ({
      ...d,
      experiences: d.experiences.map((e, i) => (i === idx ? { ...e, ...p } : e)),
    }))

  const addExperience = () => {
    if (data.experiences.length >= MAX_EXPERIENCES) {
      toast.error(`${MAX_EXPERIENCES} expériences maximum — garde l'essentiel.`)
      return
    }
    setData((d) => ({
      ...d,
      experiences: [...d.experiences, { role: "", company: "", period: "", detail: "" }],
    }))
  }

  const updateFormation = (idx: number, p: Partial<CvFormation>) =>
    setData((d) => ({
      ...d,
      formations: d.formations.map((f, i) => (i === idx ? { ...f, ...p } : f)),
    }))

  const addFormation = () => {
    if (data.formations.length >= MAX_FORMATIONS) {
      toast.error(`${MAX_FORMATIONS} formations maximum.`)
      return
    }
    setData((d) => ({ ...d, formations: [...d.formations, { degree: "", school: "", year: "" }] }))
  }

  const addSkill = () => {
    const s = skillInput.trim()
    if (!s) return
    if (data.skills.length >= MAX_SKILLS) {
      toast.error(`${MAX_SKILLS} compétences maximum.`)
      return
    }
    if (data.skills.some((k) => k.toLowerCase() === s.toLowerCase())) {
      toast.error("Cette compétence est déjà ajoutée.")
      return
    }
    setData((d) => ({ ...d, skills: [...d.skills, s] }))
    setSkillInput("")
  }

  const addLanguage = () => {
    const name = newLangName.trim()
    if (!name) return
    if (data.languages.length >= MAX_LANGUAGES) {
      toast.error(`${MAX_LANGUAGES} langues maximum.`)
      return
    }
    setData((d) => ({ ...d, languages: [...d.languages, { name, level: newLangLevel }] }))
    setNewLangName("")
    setNewLangLevel("Courant")
  }

  /* ── Photo : recadrée carrée 320×320 (JPEG) pour un localStorage léger ── */
  const handlePhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // permet de re-sélectionner le même fichier
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const S = 320
      const c = document.createElement("canvas")
      c.width = S
      c.height = S
      const cctx = c.getContext("2d")
      if (cctx) {
        const ratio = Math.max(S / img.width, S / img.height)
        const dw = img.width * ratio
        const dh = img.height * ratio
        cctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh)
        const dataUrl = c.toDataURL("image/jpeg", 0.85)
        setData((d) => ({ ...d, photoDataUrl: dataUrl }))
        toast.success("Photo ajoutée ✅")
      }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error("Photo illisible — essaie une autre image.")
    }
    img.src = url
  }

  const removePhoto = () => setData((d) => ({ ...d, photoDataUrl: "" }))

  /* ── Navigation ── */
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" })
  const goToStep = (s: 1 | 2 | 3) => {
    setStep(s)
    scrollTop()
  }
  const openPreview = () => {
    setView("preview")
    scrollTop()
  }
  const backToWizard = () => {
    setView("wizard")
    scrollTop()
  }
  const fillExample = () => {
    // On remplace tout le profil mais on garde la photo et le modèle déjà choisis
    setData((d) => ({ ...EXAMPLE_CV, photoDataUrl: d.photoDataUrl, template: d.template }))
    toast.success("Exemple rempli ! Personnalise chaque champ avec tes infos ✍️")
  }

  /* ── Marqueur « premier export réussi » ── */
  const markExported = () => setExported(true)

  /* ── Exports ── */
  const downloadPng = () => {
    const canvas = canvasRef.current
    if (!canvas || exportsDisabled) return
    setBusy("png")
    canvas.toBlob(
      (blob) => {
        setBusy(null)
        if (!blob) {
          toast.error("Génération de l'image impossible.")
          return
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${fileNameBase}.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("CV téléchargé ! 🎉")
        markExported()
      },
      "image/png",
      0.95,
    )
  }

  const downloadPdf = async () => {
    const canvas = canvasRef.current
    if (!canvas || exportsDisabled) return
    setBusy("pdf")
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      doc.addImage(dataUrl, "PNG", 0, 0, 210, 297)
      doc.save(`${fileNameBase}.pdf`)
      toast.success("CV PDF téléchargé ! 📄")
      markExported()
    } catch {
      toast.error("Impossible de générer le PDF.")
    } finally {
      setBusy(null)
    }
  }

  const shareCv = async () => {
    const canvas = canvasRef.current
    if (!canvas || exportsDisabled) return
    setBusy("share")
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.95),
      )
      if (!blob) throw new Error("blob")
      const file = new File([blob], `${fileNameBase}.png`, { type: "image/png" })
      if (navigator.canShare?.({ files: [file] })) {
        const text = `Voici mon CV : ${data.fullName.trim() || "—"}${
          data.jobTitle.trim() ? ` — ${data.jobTitle.trim()}` : ""
        } 🇨🇩 (créé gratuitement sur KinShop)`
        await navigator.share({ files: [file], title: `CV — ${data.fullName.trim()}`, text })
        toast.success("CV partagé ! 🚀")
        markExported()
      } else {
        // Fallback desktop : téléchargement + consigne claire
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${fileNameBase}.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.info(
          "Le partage direct n'est pas disponible ici — le CV a été téléchargé, envoie-le via WhatsApp 📲",
        )
        markExported()
      }
    } catch (err) {
      // AbortError = l'utilisateur a fermé la feuille de partage (n'est pas une erreur)
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Partage annulé ou non supporté.")
      }
    } finally {
      setBusy(null)
    }
  }

  /* ═══════════════ Rendu ═══════════════ */

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 to-background">
      {/* Header sticky */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {onHome && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onHome}
                aria-label="Retour à l'accueil"
                className="h-10 w-10 shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <h1 className="font-bold text-lg tracking-tight truncate">CV Express RDC 🇨🇩</h1>
          </div>
          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 font-semibold shrink-0">
            100 % gratuit
          </Badge>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:py-10">
        <AnimatePresence mode="wait" initial={false}>
          {view === "wizard" ? (
            /* ═══════════ WIZARD 3 ÉTAPES ═══════════ */
            <motion.div
              key="wizard"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
              className="max-w-2xl mx-auto"
            >
              <Stepper step={step} onStep={goToStep} />

              <AnimatePresence mode="wait" initial={false}>
                {/* ─── Étape 1 : Identité ─── */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Ton identité 👤</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
                        Les informations qui apparaissent en haut de ton CV.
                      </p>
                    </div>
                    <Card className="border-2">
                      <CardContent className="p-5 sm:p-6 space-y-5">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="cv-fullname">Nom complet *</Label>
                            <Input
                              id="cv-fullname"
                              placeholder="Ex : Grace Mbala"
                              value={data.fullName}
                              onChange={(e) => patch({ fullName: e.target.value })}
                              maxLength={80}
                              className="h-11"
                              autoComplete="name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cv-jobtitle">Métier recherché</Label>
                            <Input
                              id="cv-jobtitle"
                              placeholder="Ex : Attachée commerciale"
                              value={data.jobTitle}
                              onChange={(e) => patch({ jobTitle: e.target.value })}
                              maxLength={80}
                              className="h-11"
                            />
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="cv-phone">Téléphone</Label>
                            <Input
                              id="cv-phone"
                              type="tel"
                              inputMode="tel"
                              placeholder="082 345 6789"
                              value={data.phone}
                              onChange={(e) => patch({ phone: e.target.value })}
                              maxLength={24}
                              className="h-11"
                              autoComplete="tel"
                            />
                            <p className="text-xs text-muted-foreground">{phoneHint}</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cv-email">Email</Label>
                            <Input
                              id="cv-email"
                              type="email"
                              inputMode="email"
                              placeholder="exemple@gmail.com"
                              value={data.email}
                              onChange={(e) => patch({ email: e.target.value })}
                              maxLength={80}
                              className="h-11"
                              autoComplete="email"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cv-city">Ville / commune</Label>
                          <Input
                            id="cv-city"
                            list="cv-communes"
                            placeholder="Ex : Gombe, Kinshasa"
                            value={data.city}
                            onChange={(e) => patch({ city: e.target.value })}
                            maxLength={60}
                            className="h-11"
                          />
                          <datalist id="cv-communes">
                            {KIN_COMMUNES.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                          <p className="text-xs text-muted-foreground">Commune de Kinshasa ou autre ville.</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="cv-pitch">Présentation (pitch)</Label>
                            <span
                              className={`text-xs tabular-nums ${
                                data.pitch.length >= PITCH_MAX ? "text-amber-600 font-semibold" : "text-muted-foreground"
                              }`}
                            >
                              {data.pitch.length}/{PITCH_MAX}
                            </span>
                          </div>
                          <Textarea
                            id="cv-pitch"
                            placeholder="2 lignes qui donnent envie de te rencontrer : tes forces, ce que tu cherches…"
                            value={data.pitch}
                            onChange={(e) => patch({ pitch: e.target.value })}
                            rows={3}
                            maxLength={PITCH_MAX}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 mt-6">
                      <Button
                        variant="outline"
                        onClick={fillExample}
                        className="h-11 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Remplir un exemple
                      </Button>
                      <Button
                        onClick={() => goToStep(2)}
                        disabled={!data.fullName.trim()}
                        className="h-11 min-w-40"
                      >
                        Continuer
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                    {!data.fullName.trim() && (
                      <p className="text-xs text-muted-foreground mt-3 sm:text-right">
                        Ton nom complet est requis pour continuer.
                      </p>
                    )}
                  </motion.div>
                )}

                {/* ─── Étape 2 : Parcours ─── */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Ton parcours 💼</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
                        Même les petits boulots comptent — chaque expérience a de la valeur.
                      </p>
                    </div>

                    {/* Expériences */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">Expériences professionnelles</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addExperience}
                          disabled={data.experiences.length >= MAX_EXPERIENCES}
                          className="h-10"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Ajouter
                        </Button>
                      </div>

                      {data.experiences.length === 0 && (
                        <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4 text-center">
                          💡 Aucune expérience ajoutée. Vendeuse, caissière, aide familial, stage…
                          tout se raconte sur un CV.
                        </p>
                      )}

                      {data.experiences.map((exp, i) => (
                        <Card key={`exp-${i}`} className="border-2">
                          <CardContent className="p-4 sm:p-5 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-muted-foreground">Expérience {i + 1}</Label>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setData((d) => ({
                                    ...d,
                                    experiences: d.experiences.filter((_, j) => j !== i),
                                  }))
                                }
                                aria-label={`Supprimer l'expérience ${i + 1}`}
                                className="h-10 w-10 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor={`exp-role-${i}`}>Poste</Label>
                                <Input
                                  id={`exp-role-${i}`}
                                  placeholder="Ex : Vendeuse"
                                  value={exp.role}
                                  onChange={(e) => updateExperience(i, { role: e.target.value })}
                                  maxLength={70}
                                  className="h-11"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`exp-company-${i}`}>Entreprise</Label>
                                <Input
                                  id={`exp-company-${i}`}
                                  placeholder="Ex : Boutique Divine Mode"
                                  value={exp.company}
                                  onChange={(e) => updateExperience(i, { company: e.target.value })}
                                  maxLength={90}
                                  className="h-11"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`exp-period-${i}`}>Période</Label>
                              <Input
                                id={`exp-period-${i}`}
                                placeholder="Ex : 2022 – 2024"
                                value={exp.period}
                                onChange={(e) => updateExperience(i, { period: e.target.value })}
                                maxLength={40}
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`exp-detail-${i}`}>Ce que tu faisais</Label>
                              <Textarea
                                id={`exp-detail-${i}`}
                                placeholder="Ex : Accueil clients, gestion du stock et encaissement mobile money"
                                value={exp.detail}
                                onChange={(e) => updateExperience(i, { detail: e.target.value })}
                                rows={2}
                                maxLength={220}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Formations */}
                    <div className="space-y-3 mt-9">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">Formations</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addFormation}
                          disabled={data.formations.length >= MAX_FORMATIONS}
                          className="h-10"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Ajouter
                        </Button>
                      </div>

                      {data.formations.length === 0 && (
                        <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4 text-center">
                          🎓 Diplôme, formation professionnelle, atelier… ou laisse vide.
                        </p>
                      )}

                      {data.formations.map((f, i) => (
                        <Card key={`form-${i}`} className="border-2">
                          <CardContent className="p-4 sm:p-5 space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-muted-foreground">Formation {i + 1}</Label>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setData((d) => ({
                                    ...d,
                                    formations: d.formations.filter((_, j) => j !== i),
                                  }))
                                }
                                aria-label={`Supprimer la formation ${i + 1}`}
                                className="h-10 w-10 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`form-degree-${i}`}>Diplôme / formation</Label>
                              <Input
                                id={`form-degree-${i}`}
                                placeholder="Ex : Licence en Commercialité"
                                value={f.degree}
                                onChange={(e) => updateFormation(i, { degree: e.target.value })}
                                maxLength={90}
                                className="h-11"
                              />
                            </div>
                            <div className="grid sm:grid-cols-[1fr_130px] gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor={`form-school-${i}`}>École / université</Label>
                                <Input
                                  id={`form-school-${i}`}
                                  placeholder="Ex : UNIKIN"
                                  value={f.school}
                                  onChange={(e) => updateFormation(i, { school: e.target.value })}
                                  maxLength={90}
                                  className="h-11"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`form-year-${i}`}>Année</Label>
                                <Input
                                  id={`form-year-${i}`}
                                  placeholder="2020"
                                  value={f.year}
                                  onChange={(e) => updateFormation(i, { year: e.target.value })}
                                  maxLength={12}
                                  className="h-11"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-7">
                      <Button variant="ghost" onClick={() => goToStep(1)} className="h-11">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Retour
                      </Button>
                      <Button onClick={() => goToStep(3)} className="h-11 min-w-40">
                        Continuer
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ─── Étape 3 : Compétences ─── */}
                {step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mb-6">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Compétences &amp; plus ✨</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
                        Ce que tu sais faire, tes langues et une personne qui peut te recommander.
                      </p>
                    </div>

                    {/* Compétences */}
                    <Card className="border-2">
                      <CardContent className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">Compétences</h3>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {data.skills.length}/{MAX_SKILLS}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            id="cv-skill"
                            placeholder="Ex : Encaissement mobile money"
                            value={skillInput}
                            onChange={(e) => setSkillInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addSkill()
                              }
                            }}
                            maxLength={40}
                            className="h-11"
                          />
                          <Button variant="outline" onClick={addSkill} className="h-11 shrink-0">
                            <Plus className="w-4 h-4 mr-1" />
                            Ajouter
                          </Button>
                        </div>
                        {data.skills.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {data.skills.map((s, i) => (
                              <Badge
                                key={`${s}-${i}`}
                                className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border border-emerald-200 pl-3 pr-1.5 py-1.5 text-sm gap-1"
                              >
                                {s}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setData((d) => ({ ...d, skills: d.skills.filter((_, j) => j !== i) }))
                                  }
                                  aria-label={`Retirer la compétence ${s}`}
                                  className="rounded-full p-1 hover:bg-emerald-200 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Astuce : mets des compétences concrètes (M-Pesa, Excel, vente…) — appuie sur Entrée pour ajouter.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Langues */}
                    <Card className="border-2 mt-5">
                      <CardContent className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">Langues</h3>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {data.languages.length}/{MAX_LANGUAGES}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {data.languages.map((lang, i) => (
                            <div key={`lang-${i}`} className="flex gap-2 items-center">
                              <Input
                                value={lang.name}
                                onChange={(e) =>
                                  setData((d) => ({
                                    ...d,
                                    languages: d.languages.map((l, j) =>
                                      j === i ? { ...l, name: e.target.value } : l,
                                    ),
                                  }))
                                }
                                placeholder="Langue"
                                maxLength={30}
                                aria-label={`Nom de la langue ${i + 1}`}
                                className="h-11"
                              />
                              <LevelSelect
                                value={lang.level}
                                onValueChange={(v) =>
                                  setData((d) => ({
                                    ...d,
                                    languages: d.languages.map((l, j) =>
                                      j === i ? { ...l, level: v } : l,
                                    ),
                                  }))
                                }
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setData((d) => ({
                                    ...d,
                                    languages: d.languages.filter((_, j) => j !== i),
                                  }))
                                }
                                aria-label={`Retirer la langue ${lang.name || i + 1}`}
                                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {data.languages.length < MAX_LANGUAGES ? (
                          <div className="flex gap-2 items-center border-t border-dashed pt-4">
                            <Input
                              placeholder="Ajouter une langue…"
                              value={newLangName}
                              onChange={(e) => setNewLangName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  addLanguage()
                                }
                              }}
                              maxLength={30}
                              aria-label="Nom de la nouvelle langue"
                              className="h-11"
                            />
                            <LevelSelect value={newLangLevel} onValueChange={setNewLangLevel} />
                            <Button
                              variant="outline"
                              onClick={addLanguage}
                              disabled={!newLangName.trim()}
                              aria-label="Ajouter la langue"
                              className="h-11 w-11 p-0 shrink-0"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">{MAX_LANGUAGES} langues maximum.</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Référence */}
                    <Card className="border-2 mt-5">
                      <CardContent className="p-5 sm:p-6 space-y-4">
                        <h3 className="font-semibold">Référence (optionnel)</h3>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="cv-refname">Nom de la personne</Label>
                            <Input
                              id="cv-refname"
                              placeholder="Ex : Mme Ngo Bala"
                              value={data.refName}
                              onChange={(e) => patch({ refName: e.target.value })}
                              maxLength={80}
                              className="h-11"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cv-refcontact">Fonction &amp; contact</Label>
                            <Input
                              id="cv-refcontact"
                              placeholder="Ex : Gérante, Boutique Divine Mode — +243 812 345 678"
                              value={data.refContact}
                              onChange={(e) => patch({ refContact: e.target.value })}
                              maxLength={120}
                              className="h-11"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Un ancien chef ou collègue qui peut confirmer ton travail — demande-lui d&apos;abord son accord 😉
                        </p>
                      </CardContent>
                    </Card>

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 mt-7">
                      <Button variant="ghost" onClick={() => goToStep(2)} className="h-11">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Retour
                      </Button>
                      <Button onClick={openPreview} className="h-11 min-w-44 shadow-lg shadow-primary/25">
                        <FileText className="w-4 h-4 mr-2" />
                        Voir mon CV
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* ═══════════ VUE APERÇU ═══════════ */
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
              className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start"
            >
              {/* Colonne gauche : canvas + carte CTA bas d'aperçu */}
              <div className="space-y-5 min-w-0">
                <Card className="overflow-hidden">
                  <CardContent className="p-2.5 sm:p-6 bg-muted/40 flex justify-center">
                    <div className="relative w-full max-w-3xl">
                      <canvas
                        ref={canvasRef}
                        width={W}
                        height={H}
                        role="img"
                        aria-label={`Aperçu du CV de ${data.fullName.trim() || "…"} (modèle ${data.template === "moderne" ? "Kin Moderne" : "Kin Classique"})`}
                        className="w-full h-auto rounded-lg border shadow-xl bg-white"
                      />
                      {rendering && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-lg">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                            <p className="text-xs text-muted-foreground">Génération du CV…</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Carte CTA en bas de l'aperçu */}
                {onCreateStore && (
                  <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50/80 to-emerald-50/60">
                    <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
                      <span className="text-4xl shrink-0">🛍️</span>
                      <div className="flex-1 text-center sm:text-left">
                        <p className="font-semibold">Vous vendez aussi ?</p>
                        <p className="text-sm text-muted-foreground">
                          Créez votre boutique KinShop en 5 min — catalogue, WhatsApp, mobile money.
                        </p>
                      </div>
                      <Button
                        onClick={onCreateStore}
                        className="w-full sm:w-auto h-11 bg-amber-500 hover:bg-amber-600 text-white shrink-0 shadow-md"
                      >
                        Créer ma boutique
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Colonne droite : contrôles */}
              <div className="space-y-4 lg:sticky lg:top-24">
                {/* Sélecteur de modèle */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-semibold">Modèle</p>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Choisir le modèle de CV">
                      {TEMPLATES.map((t) => {
                        const selected = data.template === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => patch({ template: t.id })}
                            className={`rounded-xl border-2 p-2 pb-2.5 transition-all min-h-[44px] ${
                              selected
                                ? "border-primary ring-2 ring-primary/25 scale-[1.02]"
                                : "border-border opacity-80 hover:opacity-100 hover:border-primary/40"
                            }`}
                          >
                            <TemplateThumb id={t.id} />
                            <span className="block text-xs font-medium mt-2">{t.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Photo optionnelle */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-amber-500" />
                      Photo (optionnel)
                    </p>
                    <div className="flex items-center gap-3">
                      {data.photoDataUrl ? (
                        <img
                          src={data.photoDataUrl}
                          alt="Photo choisie pour le CV"
                          className="w-14 h-14 rounded-full object-cover border-2 border-primary/40"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center leading-tight">
                          Sans
                          <br />
                          photo
                        </div>
                      )}
                      <div className="flex-1 flex flex-col gap-1.5">
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhoto}
                          aria-label="Choisir une photo pour le CV"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => photoInputRef.current?.click()}
                          className="h-10"
                        >
                          {data.photoDataUrl ? "Changer la photo" : "Ajouter une photo"}
                        </Button>
                        {data.photoDataUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removePhoto}
                            className="h-9 text-destructive"
                          >
                            Retirer
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recadrée en cercle automatiquement — reste sur ton téléphone.
                    </p>
                  </CardContent>
                </Card>

                {/* Exports */}
                <Card className="border-primary/25 bg-primary/5">
                  <CardContent className="p-4 space-y-2.5">
                    <Button onClick={downloadPng} disabled={exportsDisabled} className="w-full h-12 text-base">
                      {busy === "png" ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5 mr-2" />
                      )}
                      Télécharger PNG
                    </Button>
                    <Button
                      variant="outline"
                      onClick={downloadPdf}
                      disabled={exportsDisabled}
                      className="w-full h-11"
                    >
                      {busy === "pdf" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4 mr-2" />
                      )}
                      Télécharger PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={shareCv}
                      disabled={exportsDisabled}
                      className="w-full h-11"
                    >
                      {busy === "share" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Share2 className="w-4 h-4 mr-2" />
                      )}
                      Partager
                    </Button>
                    <p className="text-xs text-muted-foreground text-center pt-1">
                      Envoie le CV aux employeurs par WhatsApp ou postule en personne 🇨🇩
                    </p>
                  </CardContent>
                </Card>

                <Button variant="outline" onClick={backToWizard} className="w-full h-11">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Modifier mes infos
                </Button>

                {/* CTA post-premier-export (fade-in) */}
                <AnimatePresence>
                  {exported && onCreateStore && (
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-emerald-50 shadow-md">
                        <CardContent className="p-5 space-y-3 text-center">
                          <p className="font-semibold text-base">🛍️ Vous vendez aussi quelque chose ?</p>
                          <p className="text-sm text-muted-foreground">
                            Créez votre boutique KinShop en 5 minutes — comme des centaines de vendeurs à Kin.
                          </p>
                          <Button
                            onClick={onCreateStore}
                            className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white shadow-md"
                          >
                            Créer ma boutique en 5 min
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t bg-muted/30 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground">
            CV Express — un outil gratuit KinShop 🔒 Ton brouillon reste sur ton téléphone, rien n&apos;est envoyé en ligne.
          </p>
        </div>
      </footer>
    </div>
  )
}

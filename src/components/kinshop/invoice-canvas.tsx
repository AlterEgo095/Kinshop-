'use client'

// KinFacture — Rendu canvas A4 de la facture + exports PNG / PDF / partage (V3)
// Pattern repris du Statut Studio : canvas haute résolution, export toBlob, jspdf dynamique.

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { InvoiceData } from '@/lib/kinfacture'
import { buildPaymentQrText, type InvoiceItem } from '@/lib/kinfacture'
import { formatFC, formatUSD, formatPhoneDisplay, type StoreData } from '@/lib/kinshop'

const W = 1240
const H = 1754
const M = 64 // marge
const EMERALD_DARK = '#064e3b'
const EMERALD = '#059669'
const EMERALD_SOFT = '#ecfdf5'
const AMBER = '#f59e0b'
const AMBER_SOFT = '#fffbeb'
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'

interface InvoiceStoreInfo {
  name: string
  logoEmoji: string
  whatsapp: string
  city: string
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 99): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth) {
      current = test
    } else {
      if (current) lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function parseItems(invoice: Pick<InvoiceData, 'items'>): InvoiceItem[] {
  try {
    const arr = JSON.parse(invoice.items)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function fmtDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function renderInvoiceCanvas(
  invoice: Pick<InvoiceData, 'number' | 'clientName' | 'clientPhone' | 'totalFC' | 'totalUSD' | 'note' | 'dueDate' | 'status' | 'createdAt' | 'items' | 'paidAt'>,
  store: InvoiceStoreInfo,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Fond
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const items = parseItems({ items: invoice.items })
  const statusLabel = invoice.status === 'paid' ? 'PAYÉE' : invoice.status === 'sent' ? 'ENVOYÉE' : 'BROUILLON'
  const statusColor = invoice.status === 'paid' ? EMERALD : invoice.status === 'sent' ? AMBER : MUTED

  // ─── Bandeau header ───
  const headerH = 190
  ctx.fillStyle = EMERALD_DARK
  ctx.fillRect(0, 0, W, headerH)
  ctx.fillStyle = AMBER
  ctx.fillRect(0, headerH, W, 8)

  ctx.fillStyle = '#ffffff'
  ctx.font = '600 34px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${store.logoEmoji} ${store.name}`, M, 92)
  ctx.font = '400 22px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(`Kinshasa, RDC · ${formatPhoneDisplay(store.whatsapp)}`, M, 132)

  ctx.font = '800 52px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'right'
  ctx.fillText('FACTURE', W - M, 88)
  ctx.font = '700 30px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = AMBER
  ctx.fillText(invoice.number, W - M, 132)
  ctx.textAlign = 'left'

  // Badge statut
  ctx.font = '700 20px system-ui, -apple-system, sans-serif'
  const stW = ctx.measureText(statusLabel).width + 36
  ctx.fillStyle = statusColor
  roundRect(ctx, W - M - stW, headerH - 34, stW, 0, 0) // placeholder no-op (garde le font metrics)
  ctx.textAlign = 'right'
  ctx.fillStyle = statusColor
  ctx.font = '700 22px system-ui, -apple-system, sans-serif'
  ctx.fillText(`● ${statusLabel}`, W - M, headerH + 44)
  ctx.textAlign = 'left'

  // ─── Émetteur / Client ───
  let y = headerH + 90
  const colW = (W - M * 2 - 40) / 2

  ctx.font = '700 18px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText('ÉMETTEUR', M, y)
  ctx.fillText('FACTURÉ À', M + colW + 40, y)
  y += 36

  ctx.font = '700 26px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = INK
  ctx.fillText(store.name, M, y)
  ctx.fillText(invoice.clientName || '—', M + colW + 40, y)
  y += 32

  ctx.font = '400 21px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText(`Tél : ${formatPhoneDisplay(store.whatsapp)}`, M, y)
  ctx.fillText(invoice.clientPhone ? `Tél : ${formatPhoneDisplay(invoice.clientPhone)}` : 'Tél : —', M + colW + 40, y)
  y += 30
  ctx.fillText(`Ville : ${store.city}`, M, y)

  // Dates alignées à droite (sous tout le bloc émetteur/client — zéro chevauchement)
  let dy = headerH + 222
  ctx.textAlign = 'right'
  ctx.font = '400 21px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText(`Date d'émission : ${fmtDate(invoice.createdAt)}`, W - M, dy)
  dy += 30
  if (invoice.dueDate) {
    ctx.fillStyle = INK
    ctx.fillText(`Échéance : ${invoice.dueDate}`, W - M, dy)
    dy += 30
  }
  if (invoice.status === 'paid' && invoice.paidAt) {
    ctx.fillStyle = EMERALD
    ctx.fillText(`Payée le ${fmtDate(invoice.paidAt)}`, W - M, dy)
  }
  ctx.textAlign = 'left'

  y = Math.max(y + 34, dy + 28)

  // ─── Tableau des lignes ───
  const colDesc = M + 16
  const colQty = M + 640
  const colUnit = M + 780
  const colTotal = W - M - 16

  ctx.fillStyle = EMERALD_SOFT
  roundRect(ctx, M, y, W - M * 2, 56, 10)
  ctx.fill()
  ctx.font = '700 19px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = EMERALD_DARK
  ctx.fillText('DÉSIGNATION', colDesc, y + 36)
  ctx.fillText('QTÉ', colQty, y + 36)
  ctx.fillText('PRIX UNIT.', colUnit, y + 36)
  ctx.textAlign = 'right'
  ctx.fillText('TOTAL', colTotal, y + 36)
  ctx.textAlign = 'left'

  y += 56

  const rowH = 58
  const maxRows = Math.max(3, Math.floor((1010 - y) / rowH))
  let hiddenRows = 0
  const shown = items.slice(0, maxRows)
  if (items.length > maxRows) hiddenRows = items.length - maxRows

  shown.forEach((it, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = '#f9fafb'
      ctx.fillRect(M, y, W - M * 2, rowH)
    }
    ctx.font = '400 21px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = INK
    const lines = wrapText(ctx, it.desc, colQty - colDesc - 12, 2)
    ctx.fillText(lines[0] ?? '', colDesc, y + 36)
    ctx.fillStyle = MUTED
    ctx.fillText(String(it.qty), colQty, y + 36)
    ctx.fillText(it.unitFC ? formatFC(it.unitFC) : '—', colUnit, y + 36)
    ctx.textAlign = 'right'
    ctx.fillStyle = INK
    ctx.font = '600 21px system-ui, -apple-system, sans-serif'
    ctx.fillText(formatFC(it.unitFC * it.qty), colTotal, y + 36)
    ctx.textAlign = 'left'
    y += rowH
    // 2e ligne si description wrap
    if (lines[1]) {
      ctx.font = '400 18px system-ui, -apple-system, sans-serif'
      ctx.fillStyle = MUTED
      ctx.fillText(lines[1], colDesc, y - 14)
    }
  })

  if (hiddenRows > 0) {
    ctx.font = 'italic 400 19px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = MUTED
    ctx.fillText(`… + ${hiddenRows} autre${hiddenRows > 1 ? 's' : ''} ligne${hiddenRows > 1 ? 's' : ''} (incluse${hiddenRows > 1 ? 's' : ''} dans le total)`, colDesc, y + 8)
    y += 34
  }

  // Filet + totaux (à droite)
  y += 16
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(M + 620, y)
  ctx.lineTo(W - M, y)
  ctx.stroke()
  y += 44

  ctx.textAlign = 'right'
  ctx.font = '400 21px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText('Sous-total', W - M - 260, y)
  ctx.fillStyle = INK
  ctx.fillText(formatFC(invoice.totalFC), W - M, y)
  y += 40

  ctx.fillStyle = EMERALD_DARK
  roundRect(ctx, W - M - 460, y - 6, 460, 78, 12)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '600 19px system-ui, -apple-system, sans-serif'
  ctx.fillText('TOTAL À PAYER', W - M - 436, y + 24)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 34px system-ui, -apple-system, sans-serif'
  ctx.fillText(formatFC(invoice.totalFC), W - M - 24, y + 58)
  ctx.font = '500 20px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = AMBER
  ctx.fillText(`≈ ${formatUSD(invoice.totalUSD)}`, W - M - 24, y + 96)
  ctx.textAlign = 'left'
  y += 140

  // ─── Bloc paiement mobile money avec QR ───
  const payH = 300
  ctx.fillStyle = AMBER_SOFT
  roundRect(ctx, M, y, W - M * 2, payH, 16)
  ctx.fill()
  ctx.strokeStyle = AMBER
  ctx.setLineDash([8, 6])
  ctx.stroke()
  ctx.setLineDash([])

  const qrSize = 240
  const qrX = M + 28
  const qrY = y + 30
  try {
    const qrData = await QRCode.toDataURL(buildPaymentQrText({
      storeName: store.name,
      number: invoice.number,
      totalFC: invoice.totalFC,
      whatsapp: store.whatsapp,
    }), { margin: 1, width: 480, color: { dark: EMERALD_DARK, light: '#ffffff' } })
    const img = new Image()
    img.src = qrData
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      setTimeout(resolve, 1500)
    })
    if (img.complete && img.naturalWidth > 0) {
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 12)
      ctx.fill()
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize)
    }
  } catch {
    // QR indisponible : le bloc texte reste lisible seul
  }

  const tx = qrX + qrSize + 48
  ctx.fillStyle = EMERALD_DARK
  ctx.font = '800 26px system-ui, -apple-system, sans-serif'
  ctx.fillText('💳 Paiement par mobile money', tx, y + 52)
  ctx.font = '500 21px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = INK
  let py = y + 96
  for (const op of ['M-Pesa (Vodacom)', 'Airtel Money', 'Orange Money']) {
    ctx.fillText(`✔  ${op}`, tx, py)
    py += 34
  }
  ctx.font = '700 24px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = EMERALD_DARK
  ctx.fillText(`Payez au ${formatPhoneDisplay(store.whatsapp)}`, tx, py + 6)
  ctx.font = '400 20px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText(`Scannez le QR ou indiquez la référence ${invoice.number} lors du paiement.`, tx, py + 42)

  y += payH + 44

  // ─── Note ───
  if (invoice.note) {
    ctx.font = 'italic 400 21px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = MUTED
    const noteLines = wrapText(ctx, `Note : ${invoice.note}`, W - M * 2, 2)
    for (const l of noteLines) {
      ctx.fillText(l, M, y)
      y += 30
    }
    y += 8
  }

  // ─── Footer viral ───
  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.moveTo(M, H - 92)
  ctx.lineTo(W - M, H - 92)
  ctx.stroke()
  ctx.font = '600 20px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText(`${store.name} · Merci pour votre confiance !`, M, H - 56)
  ctx.textAlign = 'right'
  ctx.fillStyle = EMERALD
  ctx.fillText('⚡ Facture générée par KinShop — kinshop.cd', W - M, H - 56)
  ctx.textAlign = 'left'

  return canvas
}

function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'kinshop'
}

export function invoiceFileName(invoice: Pick<InvoiceData, 'number' | 'clientName'>): string {
  return `facture-${invoice.number.toLowerCase()}-${slugifyName(invoice.clientName)}`
}

export async function downloadInvoicePNG(canvas: HTMLCanvasElement, invoice: Pick<InvoiceData, 'number' | 'clientName'>): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceFileName(invoice)}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      resolve(true)
    }, 'image/png')
  })
}

export async function exportInvoicePDF(canvas: HTMLCanvasElement, invoice: Pick<InvoiceData, 'number' | 'clientName'>): Promise<boolean> {
  try {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297)
    doc.save(`${invoiceFileName(invoice)}.pdf`)
    return true
  } catch {
    return false
  }
}

export async function shareInvoiceCanvas(canvas: HTMLCanvasElement, invoice: Pick<InvoiceData, 'number' | 'clientName'>): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return 'downloaded'
    const file = new File([blob], `${invoiceFileName(invoice)}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `Facture ${invoice.number}`, text: `Facture ${invoice.number}`, files: [file] })
      return 'shared'
    }
    await downloadInvoicePNG(canvas, invoice)
    return 'downloaded'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    await downloadInvoicePNG(canvas, invoice)
    return 'downloaded'
  }
}

/* ─────────── Composant d'affichage (aperçu écran) ─────────── */

export function InvoiceCanvas({
  invoice,
  store,
  onRendered,
}: {
  invoice: Pick<InvoiceData, 'number' | 'clientName' | 'clientPhone' | 'totalFC' | 'totalUSD' | 'note' | 'dueDate' | 'status' | 'createdAt' | 'items' | 'paidAt'>
  store: InvoiceStoreInfo
  onRendered?: (canvas: HTMLCanvasElement | null) => void
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    let cancelled = false
    ;(async () => {
      const rendered = await renderInvoiceCanvas(invoice, store)
      if (cancelled || seq !== seqRef.current) return
      const target = ref.current
      if (target) {
        const ctx = target.getContext('2d')!
        target.width = rendered.width
        target.height = rendered.height
        ctx.drawImage(rendered, 0, 0)
      }
      setReady(true)
      onRendered?.(rendered)
    })()
    return () => {
      cancelled = true
    }
  }, [invoice.number, invoice.status, invoice.items, store.name])

  return (
    <div className="relative w-full">
      <canvas ref={ref} className="h-auto w-full rounded-xl border shadow-sm" width={W} height={H} aria-label={`Facture ${invoice.number}`} role="img" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

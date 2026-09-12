"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Truck,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PAYMENT_LABELS,
  buildWhatsAppLink,
  formatFC,
  formatUSD,
  type TrackOrderData,
} from "@/lib/kinshop"
import { DELIVERY_STATUS_LABELS, EVENT_TYPE_LABELS, ORDER_STATUS_LABELS, type OrderEventType } from "@/lib/order-workflow"

interface TrackOrderViewProps {
  initialRef: string
  onHome: () => void
}

const STEPS: { status: string; label: string; desc: string; emoji: string }[] = [
  { status: "new", label: "Commande reçue", desc: "Le vendeur a été notifié", emoji: "📦" },
  { status: "confirmed", label: "Confirmée", desc: "En préparation par le vendeur", emoji: "✅" },
  { status: "delivered", label: "Livrée", desc: "Commande remise au client", emoji: "🎉" },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  new: { label: "Reçue", className: "bg-amber-100 text-amber-800 border-amber-300" },
  paid: { label: "Payée en ligne", className: "bg-emerald-50 text-emerald-700 border-emerald-400" },
  confirmed: { label: "Confirmée", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  delivered: { label: "Livrée", className: "bg-emerald-600 text-white border-emerald-600" },
  cancelled: { label: "Annulée", className: "bg-red-100 text-red-700 border-red-300" },
}

export function TrackOrderView({ initialRef, onHome }: TrackOrderViewProps) {
  const [refInput, setRefInput] = useState(initialRef)
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState<TrackOrderData | null>(null)
  const [error, setError] = useState("")
  // V10 — Frise d'événements publique (types sûrs uniquement, sans données internes)
  const [events, setEvents] = useState<{ type: string; newValue?: string; reason?: string; at: string }[]>([])

  const lookup = useCallback(async (ref: string) => {
    const clean = ref.trim().toUpperCase()
    if (!clean) {
      setError("Entre ta référence de commande (ex : CMD-2026-000001).")
      return
    }
    setLoading(true)
    setError("")
    setOrder(null)
    setEvents([])
    try {
      const res = await fetch(`/api/orders/track?ref=${encodeURIComponent(clean)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Commande introuvable.")
      setOrder(data.order)
      if (Array.isArray(data.events)) setEvents(data.events)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }, [])

  // Recherche automatique si une référence est fournie dans le lien (#/suivi/KIN-XXXX)
  useEffect(() => {
    if (initialRef.trim()) {
      lookup(initialRef)
    }
  }, [initialRef, lookup])

  const stepIndex = order ? STEPS.findIndex((s) => s.status === order.status) : -1

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/50 to-background">
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onHome}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            KinShop
          </Button>
          <Badge variant="outline" className="text-xs">
            Suivi de commande
          </Badge>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center space-y-2"
        >
          <p className="text-5xl">🔎</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Suivre ma commande</h1>
          <p className="text-sm text-muted-foreground">
            Entre la référence reçue après ta commande (ex : <span className="font-mono font-semibold">KIN-XXXX</span>).
          </p>
        </motion.section>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            lookup(refInput)
          }}
          className="flex gap-2"
        >
          <Input
            value={refInput}
            onChange={(e) => setRefInput(e.target.value.toUpperCase())}
            placeholder="KIN-XXXX"
            maxLength={12}
            className="flex-1 h-12 font-mono text-base uppercase"
            aria-label="Référence de commande"
          />
          <Button type="submit" size="lg" className="h-12 px-5" disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5 mr-1" />}
            Chercher
          </Button>
        </form>

        {error && (
          <Card className="border-red-200 bg-red-50/60">
            <CardContent className="p-4 text-sm text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </CardContent>
          </Card>
        )}

        {order && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* En-tête commande */}
            <Card>
              <CardContent className="p-5 space-y-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-mono font-extrabold text-lg">{order.ref}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span>{order.store.logoEmoji}</span>
                      {order.store.name}
                    </p>
                  </div>
                  <Badge variant="outline" className={STATUS_BADGE[order.status]?.className || ""}>
                    {STATUS_BADGE[order.status]?.label || order.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Passée le{" "}
                  {new Date(order.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </CardContent>
            </Card>

            {/* Timeline de statut */}
            {order.status === "cancelled" ? (
              <Card className="border-red-200 bg-red-50/60">
                <CardContent className="p-5 text-center space-y-1.5">
                  <XCircle className="w-8 h-8 text-red-600 mx-auto" />
                  <p className="font-bold text-red-700">Commande annulée</p>
                  <p className="text-sm text-red-600/80">
                    Contacte le vendeur sur WhatsApp si tu as une question.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-5">
                  <ol className="space-y-0">
                    {STEPS.map((step, i) => {
                      const done = stepIndex >= i
                      const current = stepIndex === i
                      return (
                        <li key={step.status} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            {done ? (
                              <CheckCircle2
                                className={`w-6 h-6 ${current ? "text-emerald-600" : "text-emerald-500"}`}
                              />
                            ) : (
                              <Circle className="w-6 h-6 text-muted-foreground/30" />
                            )}
                            {i < STEPS.length - 1 && (
                              <span
                                className={`w-0.5 flex-1 min-h-8 my-1 rounded ${stepIndex > i ? "bg-emerald-500" : "bg-border"}`}
                              />
                            )}
                          </div>
                          <div className="pb-6">
                            <p className={`font-semibold text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>
                              {step.emoji} {step.label}
                              {current && (
                                <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                                  étape actuelle
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{step.desc}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  {order.paymentStatus === "paid" && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
                      <BadgeCheck className="w-4 h-4 shrink-0" />
                      Paiement mobile money confirmé en ligne ✅
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* V10 — Historique détaillé (frise publique, immuable) */}
            {events.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <p className="font-bold text-sm mb-3 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-primary" /> Historique de la commande
                  </p>
                  <ol className="relative border-l-2 border-primary/20 ml-2 space-y-4">
                    {events.map((ev, i) => (
                      <li key={`${ev.type}-${ev.at}-${i}`} className="ml-4">
                        <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-primary/70" aria-hidden="true" />
                        <p className="text-sm font-semibold">
                          {EVENT_TYPE_LABELS[ev.type as OrderEventType] ?? ev.type}
                          {ev.newValue && ORDER_STATUS_LABELS[ev.newValue] ? ` · ${ORDER_STATUS_LABELS[ev.newValue]}` : ""}
                          {ev.newValue && !ORDER_STATUS_LABELS[ev.newValue] && DELIVERY_STATUS_LABELS[ev.newValue] ? ` · ${DELIVERY_STATUS_LABELS[ev.newValue]}` : ""}
                        </p>
                        {ev.reason && <p className="text-xs text-muted-foreground">{ev.reason}</p>}
                        <p className="text-[11px] text-muted-foreground/70">
                          {new Date(ev.at).toLocaleString("fr-FR")}
                        </p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Détail de la commande */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-primary" />
                  Détail de la commande
                </p>
                <div className="space-y-1.5">
                  {order.items.map((it) => (
                    <div key={it.productId} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {it.emoji} {it.qty} × {it.name}
                      </span>
                      <span className="font-medium">{formatUSD(it.priceUSD * it.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-2.5 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span>{formatUSD(order.subtotalUSD)}</span>
                  </div>
                  {order.discountUSD > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>🏷️ Code {order.couponCode}</span>
                      <span>−{formatUSD(order.discountUSD)}</span>
                    </div>
                  )}
                  {order.deliveryFeeFC > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        Livraison {order.deliveryZone && `— ${order.deliveryZone}`}
                      </span>
                      <span>{formatFC(order.deliveryFeeFC)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-base pt-1">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatFC(order.totalFC)}{" "}
                      <span className="text-xs font-medium text-muted-foreground">({formatUSD(order.totalUSD)})</span>
                    </span>
                  </div>
                </div>
                <div className="border-t pt-2.5 grid gap-1.5 text-sm">
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    Paiement : {PAYMENT_LABELS[order.paymentMethod]}
                  </p>
                  {order.zone && (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      Zone : {order.zone}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Client : {order.customerName}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button size="lg" variant="outline" className="w-full" asChild>
              <a
                href={buildWhatsAppLink(
                  order.store.whatsapp,
                  `Bonjour ${order.store.name}, je renseigne ma commande ${order.ref} 🙏`,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Contacter le vendeur sur WhatsApp
              </a>
            </Button>
          </motion.section>
        )}
      </main>
    </div>
  )
}

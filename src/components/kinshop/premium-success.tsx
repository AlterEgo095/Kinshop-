"use client"

// Écran de retour après paiement Premium (redirect_url Chariow : /#/premium/succes)
// Vérifie l'état réel de l'abonnement côté base de données.
//
// MODE POPUP (paiement « sans quitter la plateforme ») : quand la page est
// ouverte dans la fenêtre de paiement lancée depuis le tableau de bord, elle
// prévient la fenêtre principale (postMessage) puis se ferme automatiquement
// une fois le Premium confirmé — l'utilisateur ne quitte jamais KinShop.

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, Clock, LayoutDashboard, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface PremiumSuccessProps {
  ownerSlug: string | null
  onGoDashboard: (slug: string) => void
  onGoHome: () => void
}

export function PremiumSuccess({ ownerSlug, onGoDashboard, onGoHome }: PremiumSuccessProps) {
  const [checking, setChecking] = useState(true)
  const [premium, setPremium] = useState<{ active: boolean; until: string | null; name?: string }>({
    active: false,
    until: null,
  })
  // Mode popup : fenêtre de paiement ouverte par le tableau de bord
  const [inPopup] = useState(
    () => typeof window !== "undefined" && Boolean(window.opener && window.opener !== window),
  )

  const check = useCallback(async () => {
    if (!ownerSlug) {
      setChecking(false)
      return
    }
    setChecking(true)
    try {
      const res = await fetch(`/api/stores?slug=${encodeURIComponent(ownerSlug)}`)
      const data = await res.json()
      if (res.ok && data.store) {
        setPremium({
          active: Boolean(data.store.isPremium),
          until: data.store.premiumUntil,
          name: data.store.name,
        })
      }
    } catch {
      // silencieux : on affiche l'état en attente
    } finally {
      setChecking(false)
      // Popup : on prévient la fenêtre principale qu'elle peut revérifier
      if (inPopup && window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: "kinshop:premium_paid" }, window.location.origin)
        } catch {
          // silencieux
        }
      }
    }
  }, [ownerSlug, inPopup])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) void check()
    })()
    return () => {
      cancelled = true
    }
  }, [check])

  // Popup + Premium confirmé → fermeture automatique (retour fluide au dashboard)
  useEffect(() => {
    if (!inPopup || !premium.active) return
    const t = setTimeout(() => window.close(), 3500)
    return () => clearTimeout(t)
  }, [inPopup, premium.active])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-950 via-emerald-900 to-background">
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Card className="border-emerald-200 shadow-2xl">
            <CardContent className="p-8 text-center space-y-5">
              {checking ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Vérification de ton paiement…</p>
                </div>
              ) : premium.active ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
                    className="mx-auto w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-11 h-11 text-emerald-600" />
                  </motion.div>
                  <div className="space-y-2">
                    <h1 className="text-2xl font-extrabold text-emerald-900">
                      Bienvenue chez les Premium ! ✨
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {premium.name ? `« ${premium.name} »` : "Ta boutique"} est maintenant une boutique
                      Premium. Merci pour ta confiance ! 🇨🇩
                    </p>
                    {premium.until && (
                      <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 inline-block">
                        Premium actif jusqu&apos;au{" "}
                        {new Date(premium.until).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                  {inPopup ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Cette fenêtre va se fermer toute seule — retourne sur ton tableau de bord.
                      </p>
                      <Button
                        variant="outline"
                        className="w-full h-11"
                        onClick={() => window.close()}
                      >
                        Fermer cette fenêtre
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="w-full h-12 text-base"
                      onClick={() => ownerSlug && onGoDashboard(ownerSlug)}
                    >
                      <LayoutDashboard className="w-5 h-5 mr-2" />
                      Ouvrir mon tableau de bord
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="w-11 h-11 text-amber-600" />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl font-extrabold">Paiement en cours de confirmation</h1>
                    <p className="text-sm text-muted-foreground">
                      Dès que Chariow confirme ton paiement mobile money, ton Premium s&apos;active
                      automatiquement — c&apos;est instantané dans la plupart des cas.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button className="w-full h-12" onClick={() => void check()}>
                      J&apos;ai payé — Vérifier maintenant
                    </Button>
                    {inPopup ? (
                      <Button variant="outline" className="w-full" onClick={() => window.close()}>
                        Fermer et revenir sur KinShop
                      </Button>
                    ) : (
                      ownerSlug && (
                        <Button variant="outline" className="w-full" onClick={() => onGoDashboard(ownerSlug)}>
                          Retour au tableau de bord
                        </Button>
                      )
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
      <footer className="pb-6 text-center">
        <button onClick={onGoHome} className="text-xs text-emerald-200/70 hover:text-emerald-100 underline underline-offset-4">
          ← Retour à l&apos;accueil KinShop
        </button>
      </footer>
    </div>
  )
}

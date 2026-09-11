"use client"

// KinShop V4 — Couche PWA : enregistrement du service worker,
// carte d'installation (Android/Chrome + iOS) et toasts connexion.

import { useEffect, useState } from "react"
import { Download, Share, Smartphone, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "kinshop_pwa_dismiss_ts"
const DISMISS_DAYS = 7

function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  if (typeof window === "undefined") return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 24 * 3600 * 1000
  } catch {
    return false
  }
}

export function PwaLayer({ visible = true }: { visible?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [online, setOnline] = useState(true)

  // Enregistrement du service worker (une seule fois)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // silencieux : la PWA ne doit jamais casser l'app
      })
    }
  }, [])

  // Détection install + iOS + état connexion
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setShowIosHint(false)
      toast.success("KinShop installé ! Retrouve-le sur ton écran d'accueil 🎉")
    }
    const goOnline = () => {
      setOnline(true)
      toast.success("Connexion rétablie ✅")
    }
    const goOffline = () => {
      setOnline(false)
      toast.error("Tu es hors ligne — les pages déjà visitées restent accessibles.")
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    // état initial : sans setState synchrone dans l'effet (règle react-hooks)
    Promise.resolve().then(() => setOnline(navigator.onLine))

    // iOS : pas de beforeinstallprompt → carte d'instructions
    if (isIos() && !isStandalone() && !recentlyDismissed()) {
      const t = setTimeout(() => setShowIosHint(true), 4000)
      return () => {
        clearTimeout(t)
        window.removeEventListener("beforeinstallprompt", onBeforeInstall)
        window.removeEventListener("appinstalled", onInstalled)
        window.removeEventListener("online", goOnline)
        window.removeEventListener("offline", goOffline)
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // silencieux
    }
    setDeferredPrompt(null)
    setShowIosHint(false)
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === "dismissed") dismiss()
    setDeferredPrompt(null)
  }

  if (!visible || !online || isStandalone()) return null
  if (!deferredPrompt && !showIosHint) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-50 sm:max-w-xs animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border bg-white shadow-xl shadow-emerald-900/10 p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-emerald-900">Installer KinShop</p>
            {deferredPrompt ? (
              <>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Accède à ta boutique en 1 tap depuis l&apos;écran d&apos;accueil, même avec un réseau faible.
                </p>
                <Button size="sm" className="mt-2.5 w-full h-10" onClick={install}>
                  <Download className="w-4 h-4 mr-1.5" />
                  Installer l&apos;application
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed flex items-start gap-1.5">
                <Share className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                <span>
                  Sur iPhone : touche <strong className="text-emerald-800">Partager</strong> en bas de Safari, puis{" "}
                  <strong className="text-emerald-800">Sur l&apos;écran d&apos;accueil</strong>.
                </span>
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Fermer la carte d'installation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Landing } from "@/components/kinshop/landing"
import { CreateWizard } from "@/components/kinshop/create-wizard"
import { Dashboard } from "@/components/kinshop/dashboard"
import { StoreView } from "@/components/kinshop/store-view"
import { PremiumSuccess } from "@/components/kinshop/premium-success"
import { AdminConsole } from "@/components/kinshop/admin-console"
import CvExpress from "@/components/kinshop/cv-express"
import { InvoicePublicView } from "@/components/kinshop/facture-view"
import { TrackOrderView } from "@/components/kinshop/track-order"
import { PwaLayer } from "@/components/kinshop/pwa"
import { PLATFORM_DOMAIN } from "@/lib/domain"
import type { StoreData } from "@/lib/kinshop"
import { Button } from "@/components/ui/button"

type View =
  | { name: "landing" }
  | { name: "create" }
  | { name: "dashboard"; slug: string }
  | { name: "store"; slug: string }
  | { name: "premium-success" }
  | { name: "admin" }
  | { name: "cv" }
  | { name: "invoice-public"; number: string }
  | { name: "track"; ref: string }

const OWNER_KEY = "kinshop_owner_slug"
const DEMO_SLUG = "maman-ngo"

interface PlatformStatus {
  maintenance: boolean
  announcement: string
}

const PLATFORM_STATUS_DEFAULT: PlatformStatus = { maintenance: false, announcement: "" }

type HashTarget =
  | { type: "store"; slug: string }
  | { type: "premium" }
  | { type: "admin" }
  | { type: "cv" }
  | { type: "invoice"; number: string }
  | { type: "track"; ref: string }
  | null

function parseHash(): HashTarget {
  if (typeof window === "undefined") return null
  const store = window.location.hash.match(/^#\/boutique\/([a-z0-9-]+)/i)
  if (store) return { type: "store", slug: store[1] }
  if (/^#\/premium\/succes/i.test(window.location.hash)) return { type: "premium" }
  if (/^#\/admin/i.test(window.location.hash)) return { type: "admin" }
  if (/^#\/cv/i.test(window.location.hash)) return { type: "cv" }
  const invoice = window.location.hash.match(/^#\/facture\/([A-Za-z0-9-]+)/)
  if (invoice) return { type: "invoice", number: invoice[1] }
  // V6 — Suivi public de commande (#/suivi/KIN-XXXX)
  const track = window.location.hash.match(/^#\/suivi\/([A-Za-z0-9-]+)/i)
  if (track) return { type: "track", ref: track[1] }
  return null
}

export function KinShopApp({ initialSlug }: { initialSlug?: string }) {
  // V7 — Domaine personnalisé : si le serveur a résolu une boutique pour ce Host,
  // on ouvre directement sa vitrine (mode domaine : URL propre, sans hash).
  const isCustomDomain = Boolean(initialSlug)
  const [view, setView] = useState<View>(
    initialSlug ? { name: "store", slug: initialSlug } : { name: "landing" },
  )
  const [ownerSlug, setOwnerSlug] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  // Maintenance globale + annonce (paramètres console admin) — surveillés en continu
  const [platform, setPlatform] = useState<PlatformStatus>(PLATFORM_STATUS_DEFAULT)

  // Hydratation : session vendeur + deep-link boutique (#/boutique/slug)
  // (async IIFE : évite un setState synchrone dans l'effet → rendus en cascade)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      const saved = localStorage.getItem(OWNER_KEY)
      if (saved) setOwnerSlug(saved)
      const hashTarget = parseHash()
      if (hashTarget?.type === "store") setView({ name: "store", slug: hashTarget.slug })
      else if (hashTarget?.type === "premium") setView({ name: "premium-success" })
      else if (hashTarget?.type === "admin") setView({ name: "admin" })
      else if (hashTarget?.type === "cv") setView({ name: "cv" })
      else if (hashTarget?.type === "invoice") setView({ name: "invoice-public", number: hashTarget.number })
      else if (hashTarget?.type === "track") setView({ name: "track", ref: hashTarget.ref })
      setHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Synchroniser le hash avec la vue boutique / succès premium (liens partageables)
  useEffect(() => {
    if (!hydrated) return
    if (view.name === "store") {
      const target = `#/boutique/${view.slug}`
      // Mode domaine personnalisé : la vitrine d'origine reste à la racine (URL propre)
      if (isCustomDomain && view.slug === initialSlug) return
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "premium-success") {
      const target = "#/premium/succes"
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "admin") {
      const target = "#/admin"
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "cv") {
      const target = "#/cv"
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "invoice-public") {
      const target = `#/facture/${view.number}`
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "track") {
      const target = `#/suivi/${view.ref}`
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (
      window.location.hash.startsWith("#/boutique/") ||
      window.location.hash.startsWith("#/premium/") ||
      window.location.hash.startsWith("#/admin") ||
      window.location.hash.startsWith("#/facture/") ||
      window.location.hash.startsWith("#/suivi/") ||
      window.location.hash.startsWith("#/cv")
    ) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [view, hydrated, isCustomDomain, initialSlug])

  // Bouton retour navigateur pendant qu'on est dans une boutique
  useEffect(() => {
    const onPop = () => {
      const hashTarget = parseHash()
      if (hashTarget?.type === "store") setView({ name: "store", slug: hashTarget.slug })
      else if (hashTarget?.type === "premium") setView({ name: "premium-success" })
      else if (hashTarget?.type === "admin") setView({ name: "admin" })
      else if (hashTarget?.type === "cv") setView({ name: "cv" })
      else if (hashTarget?.type === "invoice") setView({ name: "invoice-public", number: hashTarget.number })
      else if (hashTarget?.type === "track") setView({ name: "track", ref: hashTarget.ref })
      else
        setView((v) =>
          v.name === "store" || v.name === "premium-success" || v.name === "admin" || v.name === "cv" || v.name === "invoice-public" || v.name === "track"
            ? { name: "landing" }
            : v,
        )
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Scroll en haut à chaque changement de vue
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  const handleCreated = useCallback((slug: string) => {
    localStorage.setItem(OWNER_KEY, slug)
    setOwnerSlug(slug)
    setView({ name: "dashboard", slug })
  }, [])

  const openStore = useCallback((slug: string) => {
    setView({ name: "store", slug })
  }, [])

  // Sur un domaine personnalisé, « retour accueil » renvoie vers la plateforme KinShop
  const goHome = useCallback(() => {
    if (isCustomDomain) {
      window.location.href = `https://${PLATFORM_DOMAIN}`
      return
    }
    setView({ name: "landing" })
  }, [isCustomDomain])

  const openDashboard = useCallback((slug: string) => {
    setView({ name: "dashboard", slug })
  }, [])

  // Préchargement silencieux de la démo pour éviter l'écran vide si non seedée
  const openDemo = useCallback(async () => {
    try {
      const res = await fetch(`/api/stores?slug=${DEMO_SLUG}`)
      const data = await res.json()
      if (res.ok && (data as { store: StoreData }).store) {
        openStore(DEMO_SLUG)
      } else {
        setView({ name: "create" })
      }
    } catch {
      setView({ name: "create" })
    }
  }, [openStore])

  // Mode maintenance global : surveillance /api/platform (polling 30 s + refetch au focus)
  // → l'overlay couvre TOUTES les vues publiques ; seule la console admin (#/admin) reste
  //   accessible afin de pouvoir désactiver le mode.
  const refreshPlatform = useCallback(async () => {
    try {
      const res = await fetch("/api/platform", { cache: "no-store" })
      const data = (await res.json()) as Partial<PlatformStatus> | null
      if (data && typeof data.maintenance === "boolean") {
        setPlatform({ maintenance: data.maintenance, announcement: data.announcement || "" })
      }
    } catch {
      // réseau indisponible : on conserve l'état courant, on ne bloque jamais l'affichage
    }
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const onFocus = () => {
      refreshPlatform()
    }
    // Différé d'un tick : la première vérification part juste après le montage
    // (le state est mis à jour de façon asynchrone → compatible react-hooks)
    const initial = setTimeout(refreshPlatform, 0)
    interval = setInterval(refreshPlatform, 30_000)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      clearTimeout(initial)
      if (interval) clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refreshPlatform])

  let content: React.ReactNode
  switch (view.name) {
    case "create":
      content = <CreateWizard onCreated={handleCreated} onCancel={goHome} />
      break
    case "dashboard":
      content = <Dashboard slug={view.slug} onBack={goHome} onViewStore={openStore} />
      break
    case "store":
      content = <StoreView slug={view.slug} onBack={goHome} />
      break
    case "premium-success":
      content = <PremiumSuccess ownerSlug={ownerSlug} onGoDashboard={openDashboard} onGoHome={goHome} />
      break
    case "admin":
      content = <AdminConsole onBack={goHome} onOpenStore={openStore} />
      break
    case "cv":
      content = <CvExpress onHome={goHome} onCreateStore={() => setView({ name: "create" })} />
      break
    case "invoice-public":
      content = <InvoicePublicView number={view.number} onHome={goHome} />
      break
    case "track":
      content = <TrackOrderView initialRef={view.ref} onHome={goHome} />
      break
    default:
      content = (
        <Landing
          ownerSlug={ownerSlug}
          onCreateStore={() => setView({ name: "create" })}
          onDemo={openDemo}
          onOpenDashboard={openDashboard}
          onCvExpress={() => setView({ name: "cv" })}
          announcement={platform.announcement}
        />
      )
  }

  // Mode maintenance plateforme : écran plein pour toutes les vues publiques.
  // La console admin (#/admin, accès sans trace côté utilisateur) reste disponible
  // pour permettre à l'administrateur de désactiver le mode.
  if (platform.maintenance && view.name !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-emerald-50/50 to-background">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-6xl" aria-hidden="true">🛠️</p>
          <h1 className="text-2xl font-bold">KinShop en maintenance</h1>
          <p className="text-muted-foreground">
            La plateforme est momentanément en maintenance. Reviens dans quelques minutes —
            toutes les boutiques seront de retour très vite&nbsp;!
          </p>
          <Button onClick={refreshPlatform} variant="outline">
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  // PWA V4 : couche installation + hors-ligne (masquée dans la boutique publique pour ne pas gêner le panier)
  return (
    <>
      {content}
      <PwaLayer visible={view.name !== "store"} />
    </>
  )
}

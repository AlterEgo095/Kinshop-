"use client"

import { useCallback, useEffect, useState } from "react"
import { Landing } from "@/components/kinshop/landing"
import { CreateWizard } from "@/components/kinshop/create-wizard"
import { Dashboard } from "@/components/kinshop/dashboard"
import { StoreView } from "@/components/kinshop/store-view"
import { PremiumSuccess } from "@/components/kinshop/premium-success"
import type { StoreData } from "@/lib/kinshop"

type View =
  | { name: "landing" }
  | { name: "create" }
  | { name: "dashboard"; slug: string }
  | { name: "store"; slug: string }
  | { name: "premium-success" }

const OWNER_KEY = "kinshop_owner_slug"
const DEMO_SLUG = "maman-ngo"

type HashTarget = { type: "store"; slug: string } | { type: "premium" } | null

function parseHash(): HashTarget {
  if (typeof window === "undefined") return null
  const store = window.location.hash.match(/^#\/boutique\/([a-z0-9-]+)/i)
  if (store) return { type: "store", slug: store[1] }
  if (/^#\/premium\/succes/i.test(window.location.hash)) return { type: "premium" }
  return null
}

export function KinShopApp() {
  const [view, setView] = useState<View>({ name: "landing" })
  const [ownerSlug, setOwnerSlug] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

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
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "premium-success") {
      const target = "#/premium/succes"
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (
      window.location.hash.startsWith("#/boutique/") ||
      window.location.hash.startsWith("#/premium/")
    ) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [view, hydrated])

  // Bouton retour navigateur pendant qu'on est dans une boutique
  useEffect(() => {
    const onPop = () => {
      const hashTarget = parseHash()
      if (hashTarget?.type === "store") setView({ name: "store", slug: hashTarget.slug })
      else if (hashTarget?.type === "premium") setView({ name: "premium-success" })
      else
        setView((v) =>
          v.name === "store" || v.name === "premium-success" ? { name: "landing" } : v,
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

  const goHome = useCallback(() => setView({ name: "landing" }), [])

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

  switch (view.name) {
    case "create":
      return <CreateWizard onCreated={handleCreated} onCancel={goHome} />
    case "dashboard":
      return <Dashboard slug={view.slug} onBack={goHome} onViewStore={openStore} />
    case "store":
      return <StoreView slug={view.slug} onBack={goHome} />
    case "premium-success":
      return <PremiumSuccess ownerSlug={ownerSlug} onGoDashboard={openDashboard} onGoHome={goHome} />
    default:
      return (
        <Landing
          ownerSlug={ownerSlug}
          onCreateStore={() => setView({ name: "create" })}
          onDemo={openDemo}
          onOpenDashboard={openDashboard}
        />
      )
  }
}

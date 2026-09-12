"use client"

import { useCallback, useEffect, useState } from "react"
import { Landing } from "@/components/kinshop/landing"
import { AuthView, type AuthMode } from "@/components/kinshop/auth-view"
import { CreateWizard } from "@/components/kinshop/create-wizard"
import { Dashboard } from "@/components/kinshop/dashboard"
import { StoreView } from "@/components/kinshop/store-view"
import { PremiumSuccess } from "@/components/kinshop/premium-success"
import { AdminConsole } from "@/components/kinshop/admin-console"
import CvExpress from "@/components/kinshop/cv-express"
import { InvoicePublicView } from "@/components/kinshop/facture-view"
import { InvoiceVerifyView } from "@/components/kinshop/verify-view"
import { TrackOrderView } from "@/components/kinshop/track-order"
import { MyOrdersView } from "@/components/kinshop/my-orders"
import { PwaLayer } from "@/components/kinshop/pwa"
import { PLATFORM_DOMAIN } from "@/lib/domain"
import { DEFAULT_RATE_FC, type StoreData } from "@/lib/kinshop"
import { CONFIG_DEFAULTS, configBool, configNum, configStr, type PublicConfig } from "@/lib/config-defaults"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

type View =
  | { name: "landing" }
  | { name: "auth"; mode: AuthMode; next?: "create" | "dashboard" }
  | { name: "create" }
  | { name: "dashboard"; slug: string }
  | { name: "store"; slug: string }
  | { name: "premium-success" }
  | { name: "admin" }
  | { name: "cv" }
  | { name: "invoice-public"; number: string }
  | { name: "invoice-verify"; number: string }
  | { name: "track"; ref: string }
  | { name: "orders" } // V10 — historique client

// V8 — Clé legacy de l'ancienne « session vendeur » (slug en localStorage) :
// supprimée au profit de la vraie session serveur (cookie HttpOnly).
const LEGACY_OWNER_KEY = "kinshop_owner_slug"

interface AuthUser {
  id: string
  email: string
  name: string
  whatsapp: string
}

interface UserStoreInfo {
  id: string
  slug: string
  name: string
  logoEmoji: string
  plan: "free" | "premium"
}

interface PlatformStatus {
  maintenance: boolean
  announcement: string
  /** Taux FC pour 1 $ défini par l'admin — synchronisé en temps réel sur toute l'app */
  defaultRateFC: number
  /** V9 — Configuration dynamique (feature flags, plans, catalogue, paiements, contenus) */
  config: PublicConfig
}

const PLATFORM_STATUS_DEFAULT: PlatformStatus = {
  maintenance: false,
  announcement: "",
  defaultRateFC: DEFAULT_RATE_FC,
  config: { ...CONFIG_DEFAULTS },
}

type HashTarget =
  | { type: "store"; slug: string }
  | { type: "premium" }
  | { type: "admin" }
  | { type: "cv" }
  | { type: "orders" }
  | { type: "invoice"; number: string }
  | { type: "verify"; number: string }
  | { type: "track"; ref: string }
  | null

function parseHash(): HashTarget {
  if (typeof window === "undefined") return null
  const store = window.location.hash.match(/^#\/boutique\/([a-z0-9-]+)/i)
  if (store) return { type: "store", slug: store[1] }
  if (/^#\/premium\/succes/i.test(window.location.hash)) return { type: "premium" }
  if (/^#\/admin/i.test(window.location.hash)) return { type: "admin" }
  if (/^#\/cv/i.test(window.location.hash)) return { type: "cv" }
  if (/^#\/commandes/i.test(window.location.hash)) return { type: "orders" }
  const invoice = window.location.hash.match(/^#\/facture\/([A-Za-z0-9-]+)/)
  if (invoice) return { type: "invoice", number: invoice[1] }
  // P4 — Vérification publique d'authenticité (destination du QR de facture)
  const verify = window.location.hash.match(/^#\/verifier\/([A-Za-z0-9-]+)/)
  if (verify) return { type: "verify", number: verify[1] }
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
  // V8 — Identité de l'utilisateur connecté (session serveur) + sa boutique
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [userStore, setUserStore] = useState<UserStoreInfo | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // Maintenance globale + annonce (paramètres console admin) — surveillés en continu
  const [platform, setPlatform] = useState<PlatformStatus>(PLATFORM_STATUS_DEFAULT)

  // Récupère l'état d'authentification réel côté serveur (jamais faire confiance
  // au localStorage). Retourne l'état pour les transitions immédiates.
  const refreshMe = useCallback(async (): Promise<{ user: AuthUser | null; store: UserStoreInfo | null }> => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = (await res.json()) as { user: AuthUser | null; store: UserStoreInfo | null }
      setAuthUser(data.user ?? null)
      setUserStore(data.store ?? null)
      return { user: data.user ?? null, store: data.store ?? null }
    } catch {
      return { user: null, store: null }
    } finally {
      setAuthReady(true)
    }
  }, [])

  // Hydratation : session utilisateur + deep-link boutique (#/boutique/slug)
  // (async IIFE : évite un setState synchrone dans l'effet → rendus en cascade)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      // Migration : l'ancienne « session » localStorage n'a plus aucune valeur
      localStorage.removeItem(LEGACY_OWNER_KEY)
      await refreshMe()
      if (cancelled) return
      const hashTarget = parseHash()
      if (hashTarget?.type === "store") setView({ name: "store", slug: hashTarget.slug })
      else if (hashTarget?.type === "premium") setView({ name: "premium-success" })
      else if (hashTarget?.type === "admin") setView({ name: "admin" })
      else if (hashTarget?.type === "cv") setView({ name: "cv" })
      else if (hashTarget?.type === "orders") setView({ name: "orders" })
      else if (hashTarget?.type === "invoice") setView({ name: "invoice-public", number: hashTarget.number })
      else if (hashTarget?.type === "verify") setView({ name: "invoice-verify", number: hashTarget.number })
      else if (hashTarget?.type === "track") setView({ name: "track", ref: hashTarget.ref })
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  // Synchroniser le hash avec la vue boutique / succès premium (liens partageables)
  useEffect(() => {
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
    } else if (view.name === "orders") {
      // V10 — historique client partageable
      const target = "#/commandes"
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "invoice-public") {
      const target = `#/facture/${view.number}`
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "invoice-verify") {
      const target = `#/verifier/${view.number}`
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (view.name === "track") {
      const target = `#/suivi/${view.ref}`
      if (window.location.hash !== target) {
        window.history.pushState(null, "", target)
      }
    } else if (
      // Nettoyage du hash APRÈS hydratation uniquement : sinon ce replaceState
      // court-circuite le parseHash du montage et casse les deep-links (#/admin,
      // #/boutique/…) sur un chargement à froid (course d'effets corrigée V9).
      authReady &&
      (window.location.hash.startsWith("#/boutique/") ||
      window.location.hash.startsWith("#/premium/") ||
      window.location.hash.startsWith("#/admin") ||
      window.location.hash.startsWith("#/facture/") ||
      window.location.hash.startsWith("#/verifier/") ||
      window.location.hash.startsWith("#/suivi/") ||
      window.location.hash.startsWith("#/commandes") ||
      window.location.hash.startsWith("#/cv"))
    ) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [view, isCustomDomain, initialSlug, authReady])

  // Bouton retour navigateur pendant qu'on est dans une boutique
  useEffect(() => {
    const onPop = () => {
      const hashTarget = parseHash()
      if (hashTarget?.type === "store") setView({ name: "store", slug: hashTarget.slug })
      else if (hashTarget?.type === "premium") setView({ name: "premium-success" })
      else if (hashTarget?.type === "admin") setView({ name: "admin" })
      else if (hashTarget?.type === "cv") setView({ name: "cv" })
      else if (hashTarget?.type === "orders") setView({ name: "orders" })
      else if (hashTarget?.type === "invoice") setView({ name: "invoice-public", number: hashTarget.number })
      else if (hashTarget?.type === "verify") setView({ name: "invoice-verify", number: hashTarget.number })
      else if (hashTarget?.type === "track") setView({ name: "track", ref: hashTarget.ref })
      else
        setView((v) =>
          v.name === "store" || v.name === "premium-success" || v.name === "admin" || v.name === "cv" || v.name === "invoice-public" || v.name === "invoice-verify" || v.name === "track" || v.name === "orders"
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

  /* ─────────── Transitions d'authentification (V8) ─────────── */

  // Après inscription/connexion réussies (session posée par le serveur) :
  // on relit /api/auth/me puis on emmène l'utilisateur à sa destination.
  const handleAuthed = useCallback(
    async (next?: "create" | "dashboard") => {
      const me = await refreshMe()
      if (next === "dashboard") {
        if (me.store) setView({ name: "dashboard", slug: me.store.slug })
        else setView({ name: "create" }) // connecté sans boutique → création guidée
      } else if (next === "create") {
        setView({ name: "create" })
      } else {
        setView(me.store ? { name: "dashboard", slug: me.store.slug } : { name: "landing" })
      }
    },
    [refreshMe],
  )

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // silencieux : la session expirera naturellement
    }
    await refreshMe()
    setView({ name: "landing" })
  }, [refreshMe])

  // Boutique créée : le serveur l'a liée au compte — on relit l'état puis dashboard
  const handleCreated = useCallback(
    async (slug: string) => {
      await refreshMe()
      setView({ name: "dashboard", slug })
    },
    [refreshMe],
  )

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

  const openDashboard = useCallback(
    (slug: string) => {
      // V8 : ouvrir un dashboard exige une session valide — sinon écran de connexion
      if (authReady && !authUser) {
        setView({ name: "auth", mode: "login", next: "dashboard" })
        return
      }
      setView({ name: "dashboard", slug })
    },
    [authReady, authUser],
  )

  // Préchargement silencieux de la démo (slug administrable — Configuration · Contenus)
  const openDemo = useCallback(async () => {
    const demoSlug = configStr(platform.config, "content.demoSlug") || "maman-ngo"
    try {
      const res = await fetch(`/api/stores?slug=${encodeURIComponent(demoSlug)}`)
      const data = await res.json()
      if (res.ok && (data as { store: StoreData }).store) {
        openStore(demoSlug)
      } else {
        setView({ name: "create" })
      }
    } catch {
      setView({ name: "create" })
    }
  }, [openStore, platform.config])

  // Mode maintenance global : surveillance /api/platform (polling 30 s + refetch au focus)
  // → l'overlay couvre TOUTES les vues publiques ; seule la console admin (#/admin) reste
  //   accessible afin de pouvoir désactiver le mode.
  const refreshPlatform = useCallback(async () => {
    try {
      const res = await fetch("/api/platform", { cache: "no-store" })
      const data = (await res.json()) as (Partial<PlatformStatus> & { config?: PublicConfig }) | null
      if (data && typeof data.maintenance === "boolean") {
        const rate = Number(data.defaultRateFC)
        setPlatform((prev) => ({
          maintenance: data.maintenance ?? false,
          announcement: data.announcement || "",
          defaultRateFC:
            Number.isFinite(rate) && rate > 0 ? rate : PLATFORM_STATUS_DEFAULT.defaultRateFC,
          // Fusion conservatrice : les clés non exposées publiquement gardent leur défaut
          config: { ...prev.config, ...(data.config ?? {}) },
        }))
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

  /* ─────────── Garde de routes (V8) ───────────
     L'écran d'attente évite un « flash » de formulaire d'authentification
     pendant la vérification de session au montage. */

  let content: React.ReactNode
  switch (view.name) {
    case "auth":
      content = (
        <AuthView
          key={`${view.mode}-${view.next ?? "none"}`}
          initialMode={view.mode}
          next={view.next}
          onAuthed={() => handleAuthed(view.next)}
          onCancel={goHome}
          onSwitchMode={(mode) => setView((v) => (v.name === "auth" ? { ...v, mode } : v))}
        />
      )
      break
    case "create":
      if (!authReady) {
        content = <AuthGateLoader />
      } else if (!authUser) {
        // Parcours cible : visiteur → compte → boutique (jamais de boutique sans identité)
        content = (
          <AuthView
            initialMode="register"
            next="create"
            onAuthed={() => handleAuthed("create")}
            onCancel={goHome}
            onSwitchMode={(mode) => setView({ name: "auth", mode, next: "create" })}
          />
        )
      } else if (userStore) {
        // Un compte = une boutique : si elle existe déjà, on va au dashboard
        content = <Dashboard slug={userStore.slug} onBack={goHome} onViewStore={openStore} platformRate={platform.defaultRateFC} onLogout={handleLogout} config={platform.config} />
      } else {
        content = <CreateWizard onCreated={handleCreated} onCancel={goHome} platformRate={platform.defaultRateFC} user={authUser} config={platform.config} />
      }
      break
    case "dashboard":
      if (!authReady) {
        content = <AuthGateLoader />
      } else if (!authUser) {
        content = (
          <AuthView
            initialMode="login"
            next="dashboard"
            onAuthed={() => handleAuthed("dashboard")}
            onCancel={goHome}
            onSwitchMode={(mode) => setView({ name: "auth", mode, next: "dashboard" })}
          />
        )
      } else {
        content = <Dashboard slug={view.slug} onBack={goHome} onViewStore={openStore} platformRate={platform.defaultRateFC} onLogout={handleLogout} config={platform.config} />
      }
      break
    case "store":
      content = (
        <StoreView
          slug={view.slug}
          onBack={goHome}
          platformRate={platform.defaultRateFC}
          config={platform.config}
          authUser={authUser}
          onAuthed={refreshMe}
        />
      )
      break
    case "orders":
      // V10 — Historique client : accès réservé aux comptes authentifiés
      if (!authReady) {
        content = <AuthGateLoader />
      } else if (!authUser) {
        content = (
          <AuthView
            initialMode="login"
            onAuthed={() => handleAuthed()}
            onCancel={goHome}
            onSwitchMode={(mode) => setView({ name: "auth", mode })}
          />
        )
      } else {
        content = <MyOrdersView onHome={goHome} />
      }
      break
    case "premium-success":
      content = <PremiumSuccess ownerSlug={userStore?.slug ?? null} onGoDashboard={openDashboard} onGoHome={goHome} />
      break
    case "admin":
      content = <AdminConsole onBack={goHome} onOpenStore={openStore} />
      break
    case "cv":
      // Feature flag : CV Express désactivable depuis la console admin (Configuration · Fonctionnalités)
      content = configBool(platform.config, "feature.cvExpress") ? (
        <CvExpress onHome={goHome} onCreateStore={() => setView({ name: "create" })} />
      ) : (
        <FeatureDisabledView onBack={goHome} />
      )
      break
    case "invoice-public":
      content = <InvoicePublicView number={view.number} onHome={goHome} />
      break
    case "invoice-verify":
      content = <InvoiceVerifyView initialNumber={view.number} onHome={goHome} />
      break
    case "track":
      content = <TrackOrderView initialRef={view.ref} onHome={goHome} />
      break
    default:
      content = (
        <Landing
          user={authUser}
          userStore={userStore}
          onCreateStore={() => setView({ name: "create" })}
          onAuth={(mode, next) => setView({ name: "auth", mode, next })}
          onLogout={handleLogout}
          onDemo={openDemo}
          onOpenDashboard={openDashboard}
          onCvExpress={() => setView({ name: "cv" })}
          onOpenStore={openStore}
          announcement={platform.announcement}
          config={platform.config}
        />
      )
  }

  // Mode maintenance plateforme : écran plein pour toutes les vues publiques.
  // Titre et message administrables (Configuration · Contenus). La console admin
  // (#/admin, accès sans trace côté utilisateur) reste disponible pour désactiver le mode.
  if (platform.maintenance && view.name !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-b from-emerald-50/50 to-background">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-6xl" aria-hidden="true">🛠️</p>
          <h1 className="text-2xl font-bold">
            {configStr(platform.config, "content.maintenanceTitle") || "KinShop en maintenance"}
          </h1>
          <p className="text-muted-foreground">
            {configStr(platform.config, "content.maintenanceMessage")}
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

/** Petit écran d'attente pendant la vérification de session au montage. */
function AuthGateLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm">Vérification de ta session…</p>
      </div>
    </div>
  )
}

/** Écran « fonctionnalité désactivée » (feature flag administrable). */
function FeatureDisabledView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="text-center space-y-4 max-w-md">
        <p className="text-5xl" aria-hidden="true">🔒</p>
        <h1 className="text-xl font-bold">Fonctionnalité momentanément indisponible</h1>
        <p className="text-muted-foreground">
          Cet outil est désactivé pour le moment. Reviens plus tard&nbsp;!
        </p>
        <Button onClick={onBack} variant="outline">
          Retour à l&apos;accueil
        </Button>
      </div>
    </div>
  )
}

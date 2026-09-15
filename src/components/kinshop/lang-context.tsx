"use client"

// KinShop — Contexte de langue FR/EN (vague 2 premium international).
// SSR sûr : le rendu serveur initial est TOUJOURS fr (marché historique) ;
// le cookie/navigateur n'est lu qu'après hydratation (useEffect) — zéro mismatch.
// Le sélecteur persiste le choix 365 j (cookie kinshop_lang, SameSite=Lax) et
// met à jour <html lang> sans rechargement.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  LANG_COOKIE,
  langFromCookieValue,
  makeTr,
  normalizeLangTag,
  type DictKey,
  type Lang,
} from "@/lib/i18n"

interface LangContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  tr: (key: DictKey) => string
}

const LangContext = createContext<LangContextValue | null>(null)

function readLangCookie(): Lang | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`))
  return match ? langFromCookieValue(decodeURIComponent(match[1])) : null
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr")

  useEffect(() => {
    // 1. Choix explicite mémorisé → on suit le cookie.
    const fromCookie = readLangCookie()
    if (fromCookie) {
      setLangState(fromCookie)
      return
    }
    // 2. Première visite : détection de la langue du navigateur (premium international).
    if (normalizeLangTag(navigator.language) === "en") {
      setLangState("en")
      document.cookie = `${LANG_COOKIE}=en; path=/; max-age=31536000; samesite=lax`
    }
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = next
  }, [])

  const tr = useMemo(() => makeTr(lang), [lang])

  const value = useMemo<LangContextValue>(() => ({ lang, setLang, tr }), [lang, setLang, tr])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error("useLang doit être utilisé dans <LangProvider>")
  return ctx
}

/** Sélecteur compact FR | EN — placé dans le header de la landing. */
export function LangSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div
      className="flex items-center rounded-full border bg-muted/50 p-0.5 text-xs font-semibold shrink-0"
      role="group"
      aria-label="Langue / Language"
    >
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === "fr" ? "Français" : "English"}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            lang === l ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

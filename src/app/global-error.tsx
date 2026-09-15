"use client"

// Vague 3 — Dernier rempart : erreur atteignant le layout racine lui-même.
// global-error remplace TOUT (layout inclus) : il doit rendre <html> et <body>.
// Styles inline volontaires (le CSS global n'est pas garanti ici) et textes
// bilingues statiques FR/EN (aucune dépendance au contexte de langue).

import { useEffect } from "react"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[kinshop] erreur globale:", error)
  }, [error])

  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)",
          color: "#064e3b",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 56, margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "16px 0 8px" }}>
            Oups, une erreur est survenue
          </h1>
          <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.6, margin: "0 0 4px" }}>
            Oops, something went wrong
          </p>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
            Réessaie — si le problème persiste, recharge la page.
            <br />
            Try again — if it persists, reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#059669",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            Réessayer / Try again
          </button>
          <p style={{ marginTop: 20, fontSize: 12, color: "#9ca3af" }}>Propulsé par KinShop 🇨🇩</p>
        </div>
      </body>
    </html>
  )
}

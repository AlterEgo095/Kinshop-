"use client"

// KinShop — Page /reset-password : réinitialisation effective du mot de passe
// (mission sécurité 2026-09-15). Accessible depuis le lien de l'email.
//
// Comportement :
// 1. Lecture du token depuis l'URL (useSearchParams) → validation serveur.
// 2. Si valide : le token est RETIRÉ de l'URL (history.replaceState — le token
//    ne reste ni dans la barre d'adresse, ni dans le Referer, ni dans les
//    analytics) et conservé uniquement en mémoire (état React).
// 3. Formulaire nouveau mot de passe + confirmation → POST /api/auth/reset-password.
// 4. Succès : panneau de confirmation + retour connexion (toutes les sessions
//    de l'utilisateur ont été révoquées côté serveur).
// 5. Token invalide/expiré/utilisé : message professionnel sans information
//    sur le compte + proposition de demander un nouveau lien.
//
// i18n : embarque son propre LangProvider (même contrat que auth-view).

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LangProvider, useLang } from "@/components/kinshop/lang-context"

type Step = "checking" | "invalid" | "form" | "submitting" | "done"

function ResetPasswordViewInner() {
  const { tr } = useLang()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") || ""

  const [step, setStep] = useState<Step>("checking")
  // Le token brut vit UNIQUEMENT en mémoire — jamais réaffiché ni re-loggé
  const [tokenRef] = useState<string>(token)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!tokenRef) {
        if (!cancelled) setStep("invalid")
        return
      }
      try {
        const res = await fetch("/api/auth/reset-password/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenRef }),
        })
        const data = await res.json()
        if (!cancelled && data.valid) {
          // Le token quitte l'URL immédiatement après validation réussie :
          // ni la barre d'adresse, ni le Referer d'un éventuel chargement
          // tiers, ni les analytics ne le voient. Il reste en mémoire React.
          try {
            window.history.replaceState(null, "", "/reset-password")
          } catch {
            /* environnement sans history — le token reste dans l'URL, sans risque accru */
          }
          setStep("form")
        } else {
          setStep("invalid")
        }
      } catch {
        if (!cancelled) setStep("invalid")
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [tokenRef])

  const submitReset = async () => {
    if (password.length < 8) {
      toast.error(tr("auth.tResetMin"))
      return
    }
    if (password !== confirm) {
      toast.error(tr("auth.tResetMismatch"))
      return
    }
    setStep("submitting")
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tr("auth.tResetFail"))
      setStep("done")
      // Hygiène : vider les champs sensibles de la mémoire du formulaire
      setPassword("")
      setConfirm("")
    } catch (e) {
      setStep("form")
      toast.error(e instanceof Error ? e.message : tr("auth.tResetFail"))
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 to-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <button onClick={() => router.push("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-lg">🛍️</div>
            <span className="font-bold text-lg">Kin<span className="text-primary">Shop</span></span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-10 md:py-16">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {step === "done" ? tr("auth.resetDone") : step === "invalid" ? tr("auth.resetInvalidTitle") : tr("auth.resetTitle")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {step === "invalid" ? tr("auth.resetInvalidSub") : tr("auth.resetSub")}
            </p>
          </div>

          <Card className="border-2">
            <CardContent className="p-6 space-y-5">
              {step === "checking" && (
                <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">…</span>
                </div>
              )}

              {step === "invalid" && (
                <>
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-900 leading-relaxed">{tr("auth.resetInvalidSub")}</p>
                  </div>
                  <Button variant="outline" onClick={() => router.push("/")} className="w-full h-11">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {tr("auth.resetNewLink")}
                  </Button>
                </>
              )}

              {(step === "form" || step === "submitting") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="newPw">{tr("auth.resetNewPw")}</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="newPw"
                        type={showPw ? "text" : "password"}
                        className="pl-9 pr-10"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={72}
                        autoComplete="new-password"
                        disabled={step === "submitting"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPw ? tr("auth.hidePw") : tr("auth.showPw")}
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPw">{tr("auth.resetConfirmPw")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPw"
                        type={showPw ? "text" : "password"}
                        className="pl-9"
                        placeholder="••••••••"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        maxLength={72}
                        autoComplete="new-password"
                        disabled={step === "submitting"}
                      />
                    </div>
                  </div>

                  <Button onClick={submitReset} disabled={step === "submitting"} className="w-full h-12 text-base">
                    {step === "submitting" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {tr("auth.resetting")}
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 mr-2" />
                        {tr("auth.resetBtn")}
                      </>
                    )}
                  </Button>
                </>
              )}

              {step === "done" && (
                <>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-emerald-900 leading-relaxed">{tr("auth.resetDoneSub")}</p>
                  </div>
                  <Button onClick={() => router.push("/")} className="w-full h-12 text-base">
                    <Lock className="w-4 h-4 mr-2" />
                    {tr("auth.resetGoLogin")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export function ResetPasswordView() {
  return (
    <LangProvider>
      <ResetPasswordViewInner />
    </LangProvider>
  )
}

"use client"

// V8 — Inscription / Connexion : la porte d'entrée obligatoire vers la gestion
// d'une boutique. La sécurité réelle reste côté serveur (session HttpOnly) ;
// cette vue ne fait qu'orchestrer le parcours utilisateur.
//
// Vague 3 — i18n premium : vue entièrement bilingue FR/EN. Cette vue est rendue
// par kinshop-app.tsx, HORS du LangProvider de la landing : elle embarque donc
// son propre LangProvider (cookie kinshop_lang lu après hydratation — rendu
// serveur initial en fr, zéro mismatch, même contrat que la landing).
//
// Mission sécurité 2026-09-15 — « Mot de passe oublié ? » : nouveau mode
// "forgot" (additif) : demande d'email → envoi d'un lien réel de
// réinitialisation. La réponse serveur est générique (anti-énumération) et
// est affichée telle quelle.

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, LogIn, Mail, MailCheck, Phone, User, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LangProvider, useLang } from "@/components/kinshop/lang-context"

export type AuthMode = "login" | "register" | "forgot"

interface AuthViewProps {
  initialMode: AuthMode
  /** Destination après authentification : "create" = wizard, "dashboard" = tableau de bord */
  next?: "create" | "dashboard"
  onAuthed: () => void
  onCancel: () => void
  onSwitchMode: (mode: AuthMode) => void
}

function AuthViewInner({ initialMode, next, onAuthed, onCancel, onSwitchMode }: AuthViewProps) {
  const { tr } = useLang()
  const [mode, setMode] = useState<AuthMode>(initialMode)

  // Inscription
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // Connexion
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Mot de passe oublié
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSent, setForgotSent] = useState(false)

  const [loading, setLoading] = useState(false)

  /** "create" | "dashboard" → libellé traduit (auth.next.*). */
  const nextLabel = (n: NonNullable<AuthViewProps["next"]>) =>
    tr(n === "create" ? "auth.next.create" : "auth.next.dashboard")

  const submitRegister = async () => {
    if (name.trim().length < 2) {
      toast.error(tr("auth.tNameReq"))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error(tr("auth.tEmailBad"))
      return
    }
    if (password.length < 8) {
      toast.error(tr("auth.tPwMin"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, whatsapp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tr("auth.tRegFail"))
      toast.success(tr("auth.welcome").replace("{name}", data.user.name))
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("auth.tUnknown"))
    } finally {
      setLoading(false)
    }
  }

  const submitLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      toast.error(tr("auth.tLoginReq"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || tr("auth.tLoginFail"))
      toast.success(tr("auth.welcomeBack").replace("{name}", data.user.name))
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("auth.tUnknown"))
    } finally {
      setLoading(false)
    }
  }

  const submitForgot = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      toast.error(tr("auth.tEmailBad"))
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json()
      // Réponse générique par design (anti-énumération) : le succès affiche le
      // message neutre, quelle que soit l'existence du compte.
      if (!res.ok) throw new Error(data.message || tr("auth.forgotFail"))
      setForgotSent(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("auth.forgotFail"))
    } finally {
      setLoading(false)
    }
  }

  const switchTo = (m: AuthMode) => {
    setMode(m)
    if (m === "forgot") {
      setForgotSent(false)
      // Pré-remplir avec l'email de connexion si déjà saisi (confort)
      setForgotEmail(loginEmail)
    }
    onSwitchMode(m)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 to-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={onCancel} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-lg">🛍️</div>
            <span className="font-bold text-lg">Kin<span className="text-primary">Shop</span></span>
          </button>
          {mode === "login" ? (
            <Button variant="outline" size="sm" onClick={() => switchTo("register")}>
              <UserPlus className="w-4 h-4 mr-1.5" />
              {tr("auth.createAccount")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => switchTo("login")}>
              <LogIn className="w-4 h-4 mr-1.5" />
              {tr("auth.login")}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-10 md:py-16">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === "register" ? tr("auth.regTitle") : mode === "forgot" ? tr("auth.forgotTitle") : tr("auth.loginTitle")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {mode === "register"
                ? tr("auth.regSub")
                : mode === "forgot"
                  ? tr("auth.forgotSub")
                  : next
                    ? tr("auth.loginFor").replace("{next}", nextLabel(next))
                    : tr("auth.loginSub")}
            </p>
          </div>

          <Card className="border-2">
            <CardContent className="p-6 space-y-5">
              {mode === "register" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="authName">{tr("auth.name")}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authName"
                        className="pl-9"
                        placeholder={tr("auth.namePh")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authEmail">{tr("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authEmail"
                        type="email"
                        className="pl-9"
                        placeholder={tr("auth.emailPh")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        maxLength={120}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authWhatsapp">{tr("auth.whatsapp")}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authWhatsapp"
                        type="tel"
                        className="pl-9"
                        placeholder="081 234 5678"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        maxLength={20}
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authPassword">{tr("auth.passwordReg")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authPassword"
                        type={showPassword ? "text" : "password"}
                        className="pl-9 pr-10"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={72}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? tr("auth.hidePw") : tr("auth.showPw")}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={submitRegister} disabled={loading} className="w-full h-12 text-base">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {tr("auth.creating")}
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        {tr("auth.createBtn")}
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    {tr("auth.hasAccount")}{" "}
                    <button onClick={() => switchTo("login")} className="text-primary font-medium hover:underline">
                      {tr("auth.login")}
                    </button>
                  </p>
                </>
              ) : mode === "forgot" ? (
                forgotSent ? (
                  <>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
                      <MailCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-emerald-900 leading-relaxed">{tr("auth.forgotDone")}</p>
                    </div>
                    <Button variant="outline" onClick={() => switchTo("login")} className="w-full h-11">
                      <LogIn className="w-4 h-4 mr-2" />
                      {tr("auth.forgotBack")}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="forgotEmail">{tr("auth.email")}</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="forgotEmail"
                          type="email"
                          className="pl-9"
                          placeholder={tr("auth.emailPh")}
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          maxLength={120}
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <Button onClick={submitForgot} disabled={loading} className="w-full h-12 text-base">
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {tr("auth.forgotSending")}
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          {tr("auth.forgotBtn")}
                        </>
                      )}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      <button onClick={() => switchTo("login")} className="text-primary font-medium hover:underline">
                        {tr("auth.forgotBack")}
                      </button>
                    </p>
                  </>
                )
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="loginEmail">{tr("auth.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="loginEmail"
                        type="email"
                        className="pl-9"
                        placeholder={tr("auth.emailPh")}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        maxLength={120}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="loginPassword">{tr("auth.password")}</Label>
                      <button
                        type="button"
                        onClick={() => switchTo("forgot")}
                        className="text-xs text-primary font-medium hover:underline"
                      >
                        {tr("auth.forgot")}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="loginPassword"
                        type={showPassword ? "text" : "password"}
                        className="pl-9 pr-10"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        maxLength={72}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? tr("auth.hidePw") : tr("auth.showPw")}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={submitLogin} disabled={loading} className="w-full h-12 text-base">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {tr("auth.logging")}
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        {tr("auth.login")}
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    {tr("auth.noAccount")}{" "}
                    <button onClick={() => switchTo("register")} className="text-primary font-medium hover:underline">
                      {tr("auth.registerFree")}
                    </button>
                  </p>
                </>
              )}

              <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {tr("auth.secureNote")}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("auth.backHome")}
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

export function AuthView(props: AuthViewProps) {
  return (
    <LangProvider>
      <AuthViewInner {...props} />
    </LangProvider>
  )
}

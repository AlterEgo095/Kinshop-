"use client"

// V8 — Inscription / Connexion : la porte d'entrée obligatoire vers la gestion
// d'une boutique. La sécurité réelle reste côté serveur (session HttpOnly) ;
// cette vue ne fait qu'orchestrer le parcours utilisateur.

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, LogIn, Mail, Phone, User, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type AuthMode = "login" | "register"

interface AuthViewProps {
  initialMode: AuthMode
  /** Destination après authentification : "create" = wizard, "dashboard" = tableau de bord */
  next?: "create" | "dashboard"
  onAuthed: () => void
  onCancel: () => void
  onSwitchMode: (mode: AuthMode) => void
}

const NEXT_LABEL: Record<NonNullable<AuthViewProps["next"]>, string> = {
  create: "créer ta boutique",
  dashboard: "gérer ta boutique",
}

export function AuthView({ initialMode, next, onAuthed, onCancel, onSwitchMode }: AuthViewProps) {
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

  const [loading, setLoading] = useState(false)

  const submitRegister = async () => {
    if (name.trim().length < 2) {
      toast.error("Ton nom est requis (2 caractères minimum).")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Adresse email invalide.")
      return
    }
    if (password.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.")
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
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création du compte.")
      toast.success(`Bienvenue ${data.user.name} ! 🎉`)
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  const submitLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      toast.error("Email et mot de passe requis.")
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
      if (!res.ok) throw new Error(data.error || "Erreur lors de la connexion.")
      toast.success(`Content de te revoir, ${data.user.name} ! 👋`)
      onAuthed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  const switchTo = (m: AuthMode) => {
    setMode(m)
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
              Créer un compte
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => switchTo("login")}>
              <LogIn className="w-4 h-4 mr-1.5" />
              Se connecter
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
              {mode === "register" ? "Crée ton compte 🎉" : "Content de te revoir 👋"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {mode === "register"
                ? "Gratuit, en français — ta boutique sera prête en 5 minutes."
                : next
                  ? `Connecte-toi pour ${NEXT_LABEL[next]}.`
                  : "Connecte-toi pour gérer ta boutique."}
            </p>
          </div>

          <Card className="border-2">
            <CardContent className="p-6 space-y-5">
              {mode === "register" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="authName">Ton nom *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authName"
                        className="pl-9"
                        placeholder="Ex : Ngo Mputu"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authEmail">Adresse email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="authEmail"
                        type="email"
                        className="pl-9"
                        placeholder="toi@exemple.cd"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        maxLength={120}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="authWhatsapp">Numéro WhatsApp (optionnel)</Label>
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
                    <Label htmlFor="authPassword">Mot de passe * (8 caractères minimum)</Label>
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
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={submitRegister} disabled={loading} className="w-full h-12 text-base">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Création du compte…
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Créer mon compte
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Tu as déjà un compte ?{" "}
                    <button onClick={() => switchTo("login")} className="text-primary font-medium hover:underline">
                      Se connecter
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="loginEmail">Adresse email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="loginEmail"
                        type="email"
                        className="pl-9"
                        placeholder="toi@exemple.cd"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        maxLength={120}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="loginPassword">Mot de passe</Label>
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
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button onClick={submitLogin} disabled={loading} className="w-full h-12 text-base">
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connexion…
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        Se connecter
                      </>
                    )}
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button onClick={() => switchTo("register")} className="text-primary font-medium hover:underline">
                      Créer un compte gratuitement
                    </button>
                  </p>
                </>
              )}

              <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Ton mot de passe est chiffré (scrypt) et la connexion s&apos;appuie sur une session
                sécurisée HttpOnly. Personne ne peut gérer ta boutique sans ton compte.
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour à l&apos;accueil
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

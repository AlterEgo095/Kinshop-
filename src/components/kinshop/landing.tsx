"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import {
  ShoppingBag,
  MessageCircle,
  ArrowRight,
  Smartphone,
  Package,
  BarChart3,
  Share2,
  Coins,
  CheckCircle2,
  Store,
  MapPin,
  Sparkles,
  Eye,
  FileText,
  Receipt,
  LogIn,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { configNum, configStr, type PublicConfig } from "@/lib/config-defaults"
import { buildWhatsAppLink, formatPhoneDisplay } from "@/lib/kinshop"

interface LandingProps {
  /** Utilisateur connecté (session serveur) — null = visiteur */
  user: { id: string; name: string; email: string } | null
  /** Boutique de l'utilisateur connecté (null si visiteur ou compte sans boutique) */
  userStore: { slug: string; name: string; logoEmoji: string } | null
  onCreateStore: () => void
  onAuth: (mode: "login" | "register", next?: "create" | "dashboard") => void
  onLogout: () => void
  onDemo: () => void
  onOpenDashboard: (slug: string) => void
  onCvExpress: () => void
  /** Bandeau d'annonce globale défini dans la console d'administration (vide = aucun) */
  announcement?: string
  /** V9 — Configuration dynamique (feature flags, contenus, paiements, prix premium) */
  config?: PublicConfig
}

export function Landing({ user, userStore, onCreateStore, onAuth, onLogout, onDemo, onOpenDashboard, onCvExpress, announcement = "", config = {} }: LandingProps) {
  // V9 — Feature flags & contenus administrables (fallbacks = valeurs par défaut)
  const cvEnabled = config["feature.cvExpress"] !== false
  const invoicesEnabled = config["feature.invoices"] !== false
  const demoEnabled = config["feature.demoStore"] !== false
  const footerTagline = configStr(config, "content.footerTagline")
  const supportWhatsapp = configStr(config, "general.supportWhatsapp")
  const premiumPrice = configNum(config, "plan.premium.priceUSD") || 3
  const activePayments = [
    { id: "mpesa", label: configStr(config, "payment.mpesa.label") || "M-Pesa", cls: "border-2 border-red-500/60 text-red-600 font-semibold" },
    { id: "airtel", label: configStr(config, "payment.airtel.label") || "Airtel Money", cls: "border-2 border-red-600/60 text-red-700 font-semibold" },
    { id: "orange", label: configStr(config, "payment.orange.label") || "Orange Money", cls: "border-2 border-orange-500/60 text-orange-600 font-semibold" },
    { id: "cash", label: configStr(config, "payment.cash.label") || "💵 Espèces", cls: "font-semibold" },
  ].filter((p) => config[`payment.${p.id}.enabled`] !== false)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Bandeau d'annonce globale (console admin) */}
      {announcement && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 text-center font-medium">
          📣 {announcement}
        </div>
      )}
      {/* Header sticky */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-lg shadow-md">
              🛍️
            </div>
            <span className="font-bold text-xl tracking-tight">
              Kin<span className="text-primary">Shop</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#comment" className="hover:text-foreground transition-colors">Comment ça marche</a>
            <a href="#fonctions" className="hover:text-foreground transition-colors">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-foreground transition-colors">Tarifs</a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                {userStore && (
                  <Button variant="outline" size="sm" onClick={() => onOpenDashboard(userStore.slug)} aria-label="Mon tableau de bord" className="px-2 sm:px-3">
                    <BarChart3 className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">Mon tableau de bord</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Déconnexion" className="px-2">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">Sortir</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onAuth("login", "dashboard")} className="px-2 sm:px-3">
                <LogIn className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Se connecter</span>
              </Button>
            )}
            <Button size="sm" onClick={userStore ? () => onOpenDashboard(userStore.slug) : onCreateStore} className="shadow-md">
              {userStore ? (
                <>
                  <BarChart3 className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Ma boutique</span>
                </>
              ) : (
                <>
                  Créer<span className="hidden sm:inline">&nbsp;ma boutique</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-40 -left-24 w-80 h-80 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 grid lg:grid-cols-2 gap-10 items-center relative">
            <div className="space-y-6">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Badge variant="secondary" className="px-3 py-1.5 text-sm font-medium gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  100% conçu pour les vendeurs de Kin 🇨🇩
                </Badge>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight"
              >
                Transforme ton statut WhatsApp en{" "}
                <span className="text-primary">vraie boutique</span> en 5 minutes
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="text-lg text-muted-foreground max-w-xl"
              >
                Crée ton catalogue, partage ton lien, reçois tes commandes directement
                sur WhatsApp et encaisse par <strong>M-Pesa</strong>, <strong>Airtel Money</strong> ou{" "}
                <strong>Orange Money</strong>. Gratuit pour commencer.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <Button size="lg" onClick={userStore ? () => onOpenDashboard(userStore.slug) : onCreateStore} className="text-base h-12 shadow-lg shadow-primary/25">
                  <Store className="w-5 h-5 mr-2" />
                  {userStore ? "Gérer ma boutique" : "Créer ma boutique gratuitement"}
                </Button>
                {demoEnabled && (
                  <Button size="lg" variant="outline" onClick={onDemo} className="text-base h-12">
                    <Eye className="w-5 h-5 mr-2" />
                    Voir une boutique démo
                  </Button>
                )}
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.45 }}
                className="flex flex-wrap gap-x-8 gap-y-3 pt-2"
              >
                <div>
                  <p className="text-2xl font-bold text-primary">0 FC</p>
                  <p className="text-xs text-muted-foreground">pour créer ta boutique</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">5 min</p>
                  <p className="text-xs text-muted-foreground">pour être en ligne</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">3×</p>
                  <p className="text-xs text-muted-foreground">mobile money accepté</p>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative"
            >
              <div className="rounded-3xl overflow-hidden border shadow-2xl shadow-primary/10">
                <Image
                  src="/images/hero-kinshop.png"
                  alt="Vendeuse congolaise gérant sa boutique en ligne KinShop depuis son téléphone"
                  width={1344}
                  height={768}
                  priority
                  className="w-full h-auto object-cover"
                />
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="absolute -bottom-4 -left-2 md:left-6 bg-white rounded-2xl shadow-xl border px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Nouvelle commande !</p>
                  <p className="text-xs text-muted-foreground">2 × Pagne wax • 68 400 FC</p>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 ml-1" />
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Paiements */}
        <section className="border-y bg-muted/40">
          <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap items-center justify-center gap-3">
            <span className="text-sm text-muted-foreground mr-2">Encaisse avec :</span>
            {activePayments.map((p) => (
              <Badge key={p.id} variant="outline" className={`px-4 py-1.5 text-sm ${p.cls}`}>
                {p.label}
              </Badge>
            ))}
          </div>
        </section>

        {/* Problème → Solution */}
        <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-3 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Marre de vendre « à l&apos;ancienne » ?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Des milliers de vendeurs à Kinshasa utilisent déjà WhatsApp et Facebook.
              KinShop leur donne enfin les outils d&apos;un vrai commerce.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                before: "Photos de produits perdues dans tes statuts",
                after: "Un catalogue pro, toujours à jour",
                icon: <Package className="w-6 h-6" />,
              },
              {
                before: "Commandes mélangées avec les discussions",
                after: "Chaque commande enregistrée et suivie",
                icon: <ShoppingBag className="w-6 h-6" />,
              },
              {
                before: "« C'est combien déjà ? » répété 50 fois par jour",
                after: "Prix clairs en FC et USD sur ton lien",
                icon: <Coins className="w-6 h-6" />,
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="h-full border-2 hover:border-primary/40 transition-colors">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      {item.icon}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground line-through decoration-red-400">{item.before}</p>
                      <p className="font-semibold text-foreground flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        {item.after}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Comment ça marche */}
        <section id="comment" className="bg-muted/40 border-y">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="text-center space-y-3 mb-12">
              <Badge className="px-3 py-1">Simple comme bonjour</Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">3 étapes, c&apos;est tout</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: 1,
                  title: "Crée ta boutique",
                  desc: "Nom, emoji, numéro WhatsApp. Pas besoin de carte bancaire ni de gros téléphone.",
                  icon: <Store className="w-7 h-7" />,
                },
                {
                  step: 2,
                  title: "Ajoute tes produits",
                  desc: "Photo ou emoji, prix en FC et USD convertis automatiquement. Modifiable à tout moment.",
                  icon: <Package className="w-7 h-7" />,
                },
                {
                  step: 3,
                  title: "Partage ton lien",
                  desc: "Ton lien dans ton statut WhatsApp et ta page Facebook. Les clients commandent tout seuls.",
                  icon: <Share2 className="w-7 h-7" />,
                },
              ].map((s, i) => (
                <motion.div
                  key={s.step}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.12 }}
                  className="relative bg-white rounded-3xl border-2 p-7 shadow-sm"
                >
                  <div className="absolute -top-4 left-6 w-9 h-9 rounded-full bg-primary text-white font-bold flex items-center justify-center shadow-md">
                    {s.step}
                  </div>
                  <div className="pt-4 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      {s.icon}
                    </div>
                    <h3 className="font-bold text-lg">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctions" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-3 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Tout ce qu&apos;il te faut pour vendre</h2>
            <p className="text-muted-foreground">Conçu pour la réalité de Kinshasa : data limitée, mobile d&apos;abord, mobile money partout.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <Smartphone className="w-5 h-5" />, title: "Léger & rapide", desc: "Fonctionne même avec 3G et petit forfait data. Aucune app à installer." },
              { icon: <MessageCircle className="w-5 h-5" />, title: "WhatsApp intégré", desc: "Chaque commande t'arrive par WhatsApp avec le récapitulatif complet." },
              { icon: <Coins className="w-5 h-5" />, title: "FC & USD", desc: "Prix affichés en francs congolais et dollars, conversion automatique." },
              { icon: <ShoppingBag className="w-5 h-5" />, title: "Panier client", desc: "Tes clients ajoutent plusieurs produits avant de commander, comme sur Jumia." },
              { icon: <BarChart3 className="w-5 h-5" />, title: "Suivi des commandes", desc: "Nouvelle, confirmée, livrée : tu sais toujours où en est chaque vente." },
              { icon: <Share2 className="w-5 h-5" />, title: "Lien magique", desc: "Un seul lien à coller dans ton statut, tes statuts font le marketing pour toi." },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.06 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="p-5 flex gap-4">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      {f.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{f.title}</h3>
                      <p className="text-sm text-muted-foreground">{f.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Démo (masquée si fonctionnalité désactivée par l'admin) */}
        {demoEnabled && (
        <section className="max-w-6xl mx-auto px-4 pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <Card className="overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-emerald-50 to-amber-50">
              <CardContent className="p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
                <div className="text-7xl">🥑</div>
                <div className="flex-1 text-center md:text-left space-y-2">
                  <h3 className="text-2xl font-bold">Découvre la boutique démo de Maman Ngo</h3>
                  <p className="text-muted-foreground">
                    Voilà ce que tes clients verront. Fais un essai complet : ajoute au panier,
                    passe commande — elle arrivera directement dans le tableau de bord démo.
                  </p>
                </div>
                <Button size="lg" onClick={onDemo} className="shrink-0">
                  Visiter la démo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </section>
        )}

        {/* Outils gratuits (V3) */}
        <section className="max-w-6xl mx-auto px-4 pb-16 md:pb-24">
          <div className="text-center space-y-3 mb-10">
            <Badge variant="secondary" className="px-3 py-1.5 gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Nouveauté V3 — outils gratuits
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Bien plus qu&apos;une boutique</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              KinShop t&apos;accompagne dans tout ton business : décroche ton prochain job avec un CV pro,
              facture tes clients entreprises en un clic.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {cvEnabled && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <Card className="h-full border-2 border-emerald-200 hover:border-emerald-400 transition-colors">
                <CardContent className="p-6 md:p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <FileText className="w-7 h-7" />
                    </div>
                    <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-950">100 % gratuit</Badge>
                  </div>
                  <h3 className="text-xl font-bold">CV Express RDC 🇨🇩</h3>
                  <p className="text-sm text-muted-foreground">
                    Crée un CV professionnel en 5 minutes, depuis ton téléphone : 2 modèles modernes,
                    export PDF et image, prêt à envoyer sur WhatsApp aux employeurs.
                  </p>
                  <ul className="text-sm space-y-1.5 text-foreground/90">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Modèles « Kin Classique » et « Kin Moderne »</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Photo, compétences, langues, expériences</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> PDF A4 + PNG partageable instantanément</li>
                  </ul>
                  <Button size="lg" className="w-full sm:w-auto" onClick={onCvExpress}>
                    <FileText className="w-5 h-5 mr-2" />
                    Créer mon CV maintenant
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
            )}
            {invoicesEnabled && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Card className="h-full border-2 border-amber-200 hover:border-amber-400 transition-colors">
                <CardContent className="p-6 md:p-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Receipt className="w-7 h-7" />
                    </div>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Inclus dans ta boutique</Badge>
                  </div>
                  <h3 className="text-xl font-bold">KinFacture 🧾</h3>
                  <p className="text-sm text-muted-foreground">
                    Factures professionnelles avec QR de paiement mobile money : idéal pour tes clients
                    entreprises, ONG et commandes en gros. Partage par WhatsApp, PDF ou image.
                  </p>
                  <ul className="text-sm space-y-1.5 text-foreground/90">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Lignes détaillées, totaux FC &amp; USD automatiques</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> QR de paiement M-Pesa / Airtel / Orange intégré</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> Lien de facture publique à envoyer au client</li>
                  </ul>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto border-amber-300 hover:bg-amber-50"
                    onClick={() => (userStore ? onOpenDashboard(userStore.slug) : onCreateStore())}
                  >
                    <Receipt className="w-5 h-5 mr-2" />
                    {userStore ? "Ouvrir mes factures" : "Créer ma boutique pour facturer"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
            )}
          </div>
        </section>

        {/* Témoignages */}
        <section className="bg-muted/40 border-y">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <div className="grid md:grid-cols-3 gap-5">
              {[
                { name: "Maman Ngo", shop: "Boutique Maman Ngo, Gombe", text: "Avant je perdais des commandes dans mes messages. Maintenant tout est clair, même mes clientes de Lubumbashi commandent !" },
                { name: "Jean-Marc", shop: "JM Électronique, Limete", text: "Mon lien est dans mon statut WhatsApp. En une semaine, 40 nouvelles commandes. Franchement, ça a changé mon business." },
                { name: "Chantal", shop: "Beauty Zen, Ngaliema", text: "Simple, en français, et je vois tout ce qui reste en stock. Mes clientes adorent le panier." },
              ].map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.1 }}
                >
                  <Card className="h-full">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-1 text-amber-500 text-lg">★★★★★</div>
                      <p className="text-sm italic text-foreground/90">« {t.text} »</p>
                      <div>
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {t.shop}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Tarifs / FAQ */}
        <section id="tarifs" className="max-w-3xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-3 mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Questions fréquentes</h2>
            <p className="text-muted-foreground">Tout ce que les vendeurs nous demandent avant de se lancer.</p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {[
              {
                q: "C'est vraiment gratuit ?",
                a: `Oui ! Créer ta boutique, ajouter tes produits et recevoir tes commandes est 100% gratuit. Une option Premium à ${premiumPrice} $/mois apporte un nom de domaine perso, des statistiques avancées et des quotas élargis — mais l'essentiel reste toujours gratuit.`,
              },
              {
                q: "Mes clients ont-ils besoin d'une application ?",
                a: "Non. Tes clients ouvrent simplement ton lien dans leur navigateur, même avec un petit téléphone et une connexion 3G. La commande part ensuite sur ton WhatsApp.",
              },
              {
                q: "Comment je reçois l'argent ?",
                a: "Le client choisit M-Pesa, Airtel Money, Orange Money ou le paiement à la livraison. Il voit ton numéro de paiement au moment de la commande, et toi tu confirmes la réception avant d'expédier.",
              },
              {
                q: "Je peux vendre depuis une autre ville que Kinshasa ?",
                a: "Bien sûr ! KinShop marche à Lubumbashi, Goma, Bukavu, Matadi... partout en RDC et même en dehors si tu as un numéro WhatsApp.",
              },
            ].map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-2 rounded-2xl px-5">
                <AccordionTrigger className="font-semibold text-base hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA final */}
        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 text-white p-10 md:p-14 text-center space-y-5 shadow-xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-amber-300/20 blur-2xl" />
            <h2 className="text-3xl md:text-4xl font-bold relative">Prêt à vendre plus, aujourd&apos;hui ?</h2>
            <p className="text-emerald-50/90 max-w-xl mx-auto relative">
              Rejoins les vendeurs congolais qui digitalisent leur business. Ton lien sera prêt dans 5 minutes.
            </p>
            <Button size="lg" variant="secondary" onClick={onCreateStore} className="text-base h-12 relative shadow-lg">
              <Store className="w-5 h-5 mr-2" />
              Créer ma boutique maintenant
            </Button>
          </div>
        </section>
      </main>

      {/* Footer sticky */}
      <footer className="mt-auto border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm">🛍️</div>
            <span className="font-bold">Kin<span className="text-primary">Shop</span></span>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            {footerTagline || "Fait avec ❤️ à Kinshasa pour les entrepreneurs de la RDC"}
          </p>
          <div className="flex flex-col items-center sm:items-end gap-1">
            {supportWhatsapp && (
              <a
                href={buildWhatsAppLink(supportWhatsapp, "Bonjour KinShop, j'ai besoin d'aide.")}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                💬 Support WhatsApp : {formatPhoneDisplay(supportWhatsapp)}
              </a>
            )}
            <p className="text-xs text-muted-foreground">© 2025 KinShop · M-Pesa, Airtel Money et Orange Money sont des marques de leurs propriétaires</p>
          </div>
        </div>
      </footer>
    </div>
  )
}


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
import { MarketplaceHome } from "@/components/kinshop/marketplace-home"
import { buildWhatsAppLink, formatPhoneDisplay } from "@/lib/kinshop"
import { LangProvider, LangSwitch, useLang } from "@/components/kinshop/lang-context"

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
  /** V10 — Ouvrir une boutique du marketplace (optionnel : mode domaine) */
  onOpenStore?: (slug: string) => void
  /** Bandeau d'annonce globale défini dans la console d'administration (vide = aucun) */
  announcement?: string
  /** V9 — Configuration dynamique (feature flags, contenus, paiements, prix premium) */
  config?: PublicConfig
}

export function Landing(props: LandingProps) {
  // Vague 2 i18n : le choix FR/EN vit dans un contexte client (cookie kinshop_lang) ;
  // le rendu serveur initial reste en français (zéro mismatch d'hydratation).
  return (
    <LangProvider>
      <LandingInner {...props} />
    </LangProvider>
  )
}

function LandingInner({ user, userStore, onCreateStore, onAuth, onLogout, onDemo, onOpenDashboard, onCvExpress, onOpenStore, announcement = "", config = {} }: LandingProps) {
  const { tr } = useLang()
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
    { id: "cash", label: configStr(config, "payment.cash.label") || tr("pay.cash"), cls: "font-semibold" },
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
            <a href="#comment" className="hover:text-foreground transition-colors">{tr("nav.how")}</a>
            <a href="#fonctions" className="hover:text-foreground transition-colors">{tr("nav.features")}</a>
            <a href="#tarifs" className="hover:text-foreground transition-colors">{tr("nav.pricing")}</a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <LangSwitch />
            {user ? (
              <>
                {userStore && (
                  <Button variant="outline" size="sm" onClick={() => onOpenDashboard(userStore.slug)} aria-label={tr("hdr.dashboard")} className="px-2 sm:px-3">
                    <BarChart3 className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">{tr("hdr.dashboard")}</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onLogout} aria-label={tr("hdr.logout")} className="px-2">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">{tr("hdr.logout")}</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onAuth("login", "dashboard")} className="px-2 sm:px-3">
                <LogIn className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">{tr("hdr.login")}</span>
              </Button>
            )}
            <Button size="sm" onClick={userStore ? () => onOpenDashboard(userStore.slug) : onCreateStore} className="shadow-md">
              {userStore ? (
                <>
                  <BarChart3 className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">{tr("hdr.myShop")}</span>
                </>
              ) : (
                <>
                  {tr("hdr.createShort")}<span className="hidden sm:inline">&nbsp;{tr("hdr.createLong")}</span>
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
                  {tr("hero.badge")}
                </Badge>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight"
              >
                {tr("hero.h1a")}{" "}
                <span className="text-primary">{tr("hero.h1b")}</span> {tr("hero.h1c")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="text-lg text-muted-foreground max-w-xl"
              >
                {tr("hero.p1")}
                <strong>M-Pesa</strong>{tr("hero.sep")}
                <strong>Airtel Money</strong>{tr("hero.or")}{" "}
                <strong>Orange Money</strong>
                {tr("hero.pEnd")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <Button size="lg" onClick={userStore ? () => onOpenDashboard(userStore.slug) : onCreateStore} className="text-base h-12 shadow-lg shadow-primary/25">
                  <Store className="w-5 h-5 mr-2" />
                  {userStore ? tr("cta.manage") : tr("cta.createFree")}
                </Button>
                {demoEnabled && (
                  <Button size="lg" variant="outline" onClick={onDemo} className="text-base h-12">
                    <Eye className="w-5 h-5 mr-2" />
                    {tr("cta.demo")}
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
                  <p className="text-xs text-muted-foreground">{tr("stat.create")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">5 min</p>
                  <p className="text-xs text-muted-foreground">{tr("stat.online")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">3×</p>
                  <p className="text-xs text-muted-foreground">{tr("stat.mm")}</p>
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
                  alt={tr("hero.imgAlt")}
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
                  <p className="text-sm font-semibold">{tr("float.order")}</p>
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
            <span className="text-sm text-muted-foreground mr-2">{tr("pay.accept")}</span>
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
              {tr("pb.title")}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{tr("pb.body")}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                before: tr("pb.b1"),
                after: tr("pb.a1"),
                icon: <Package className="w-6 h-6" />,
              },
              {
                before: tr("pb.b2"),
                after: tr("pb.a2"),
                icon: <ShoppingBag className="w-6 h-6" />,
              },
              {
                before: tr("pb.b3"),
                after: tr("pb.a3"),
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
              <Badge className="px-3 py-1">{tr("how.badge")}</Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{tr("how.title")}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  step: 1,
                  title: tr("how.s1t"),
                  desc: tr("how.s1d"),
                  icon: <Store className="w-7 h-7" />,
                },
                {
                  step: 2,
                  title: tr("how.s2t"),
                  desc: tr("how.s2d"),
                  icon: <Package className="w-7 h-7" />,
                },
                {
                  step: 3,
                  title: tr("how.s3t"),
                  desc: tr("how.s3d"),
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
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{tr("ft.title")}</h2>
            <p className="text-muted-foreground">{tr("ft.sub")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <Smartphone className="w-5 h-5" />, title: tr("ft.f1t"), desc: tr("ft.f1d") },
              { icon: <MessageCircle className="w-5 h-5" />, title: tr("ft.f2t"), desc: tr("ft.f2d") },
              { icon: <Coins className="w-5 h-5" />, title: tr("ft.f3t"), desc: tr("ft.f3d") },
              { icon: <ShoppingBag className="w-5 h-5" />, title: tr("ft.f4t"), desc: tr("ft.f4d") },
              { icon: <BarChart3 className="w-5 h-5" />, title: tr("ft.f5t"), desc: tr("ft.f5d") },
              { icon: <Share2 className="w-5 h-5" />, title: tr("ft.f6t"), desc: tr("ft.f6d") },
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

        {/* V10 — Marketplace : sponsorisés (Boost), populaires (visites réelles), nouveautés */}
        <MarketplaceHome onOpenStore={onOpenStore ?? (() => {})} />

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
                  <h3 className="text-2xl font-bold">{tr("demo.title")}</h3>
                  <p className="text-muted-foreground">{tr("demo.body")}</p>
                </div>
                <Button size="lg" onClick={onDemo} className="shrink-0">
                  {tr("demo.cta")}
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
              {tr("tools.badge")}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{tr("tools.title")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{tr("tools.body")}</p>
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
                    <Badge className="bg-amber-400 hover:bg-amber-400 text-amber-950">{tr("cv.free")}</Badge>
                  </div>
                  <h3 className="text-xl font-bold">CV Express RDC 🇨🇩</h3>
                  <p className="text-sm text-muted-foreground">{tr("cv.body")}</p>
                  <ul className="text-sm space-y-1.5 text-foreground/90">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("cv.li1")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("cv.li2")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("cv.li3")}</li>
                  </ul>
                  <Button size="lg" className="w-full sm:w-auto" onClick={onCvExpress}>
                    <FileText className="w-5 h-5 mr-2" />
                    {tr("cv.cta")}
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
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">{tr("kf.badge")}</Badge>
                  </div>
                  <h3 className="text-xl font-bold">KinFacture 🧾</h3>
                  <p className="text-sm text-muted-foreground">{tr("kf.body")}</p>
                  <ul className="text-sm space-y-1.5 text-foreground/90">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("kf.li1")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("kf.li2")}</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> {tr("kf.li3")}</li>
                  </ul>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto border-amber-300 hover:bg-amber-50"
                    onClick={() => (userStore ? onOpenDashboard(userStore.slug) : onCreateStore())}
                  >
                    <Receipt className="w-5 h-5 mr-2" />
                    {userStore ? tr("kf.ctaIn") : tr("kf.ctaCreate")}
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
                { name: "Maman Ngo", shop: "Boutique Maman Ngo, Gombe", text: tr("tm1") },
                { name: "Jean-Marc", shop: "JM Électronique, Limete", text: tr("tm2") },
                { name: "Chantal", shop: "Beauty Zen, Ngaliema", text: tr("tm3") },
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
                      <p className="text-sm italic text-foreground/90">{tr("tm.open")}{t.text}{tr("tm.close")}</p>
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
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{tr("faq.title")}</h2>
            <p className="text-muted-foreground">{tr("faq.sub")}</p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {[
              {
                q: tr("faq.q1"),
                a: tr("faq.a1").replace("{price}", String(premiumPrice)),
              },
              {
                q: tr("faq.q2"),
                a: tr("faq.a2"),
              },
              {
                q: tr("faq.q3"),
                a: tr("faq.a3"),
              },
              {
                q: tr("faq.q4"),
                a: tr("faq.a4"),
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
            <h2 className="text-3xl md:text-4xl font-bold relative">{tr("ctaF.title")}</h2>
            <p className="text-emerald-50/90 max-w-xl mx-auto relative">{tr("ctaF.body")}</p>
            <Button size="lg" variant="secondary" onClick={onCreateStore} className="text-base h-12 relative shadow-lg">
              <Store className="w-5 h-5 mr-2" />
              {tr("ctaF.btn")}
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
            {footerTagline || tr("footer.tagline")}
          </p>
          <div className="flex flex-col items-center sm:items-end gap-1">
            {supportWhatsapp && (
              <a
                href={buildWhatsAppLink(supportWhatsapp, tr("footer.waMsg"))}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                💬 {tr("footer.support")} {formatPhoneDisplay(supportWhatsapp)}
              </a>
            )}
            <p className="text-xs text-muted-foreground">{tr("footer.copy")}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}


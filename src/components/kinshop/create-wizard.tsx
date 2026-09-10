"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, Plus, Store, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CATEGORIES,
  STORE_EMOJIS,
  formatFC,
  slugify,
  usdToFC,
  type StoreData,
} from "@/lib/kinshop"

interface DraftProduct {
  name: string
  emoji: string
  priceUSD: string
  category: string
}

interface CreateWizardProps {
  onCreated: (slug: string) => void
  onCancel: () => void
}

export function CreateWizard({ onCreated, onCancel }: CreateWizardProps) {
  const [step, setStep] = useState(1)

  // Étape 1 : infos boutique
  const [name, setName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [description, setDescription] = useState("")
  const [slug, setSlug] = useState("")
  const [logoEmoji, setLogoEmoji] = useState("🛍️")
  const [city, setCity] = useState("Kinshasa")

  // Étape 2 : produits initiaux
  const [products, setProducts] = useState<DraftProduct[]>([])
  const [draft, setDraft] = useState<DraftProduct>({ name: "", emoji: "📦", priceUSD: "", category: "Divers" })

  // État d'envoi
  const [loading, setLoading] = useState(false)
  const [createdStore, setCreatedStore] = useState<StoreData | null>(null)
  const [copied, setCopied] = useState(false)

  const finalSlug = useMemo(() => slugify(slug || name), [slug, name])

  const slugAvailableHint = finalSlug.length < 3
    ? "3 caractères minimum"
    : "ton lien KinShop"

  const addProduct = () => {
    if (!draft.name.trim()) {
      toast.error("Donne un nom à ton produit.")
      return
    }
    const price = Number(draft.priceUSD.replace(",", "."))
    if (!price || price <= 0) {
      toast.error("Indique un prix en dollars ($).")
      return
    }
    setProducts((p) => [...p, { ...draft, name: draft.name.trim(), priceUSD: String(price) }])
    setDraft({ name: "", emoji: "📦", priceUSD: "", category: draft.category })
    toast.success("Produit ajouté ✅")
  }

  const removeProduct = (idx: number) => setProducts((p) => p.filter((_, i) => i !== idx))

  const validateStep1 = () => {
    if (name.trim().length < 2) return "Le nom de la boutique est requis."
    if (!ownerName.trim()) return "Ton nom est requis."
    if (whatsapp.replace(/\D/g, "").length < 9) return "Numéro WhatsApp invalide."
    if (finalSlug.length < 3) return "L'adresse de la boutique doit faire 3 caractères minimum."
    return null
  }

  const goStep2 = () => {
    const err = validateStep1()
    if (err) {
      toast.error(err)
      return
    }
    setStep(2)
  }

  const submit = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ownerName,
          whatsapp,
          description,
          slug: finalSlug,
          logoEmoji,
          city,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création.")
      const store: StoreData = data.store

      // Créer les produits initiaux
      for (const p of products) {
        await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: store.id,
            name: p.name,
            emoji: p.emoji,
            priceUSD: Number(p.priceUSD),
            category: p.category,
          }),
        })
      }

      setCreatedStore(store)
      setStep(3)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  const copyLink = async () => {
    if (!createdStore) return
    const link = `${window.location.origin}/#/boutique/${createdStore.slug}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success("Lien copié ! Colle-le dans ton statut WhatsApp 🚀")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Impossible de copier le lien.")
    }
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
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${s === step ? "w-8 bg-primary" : s < step ? "w-2 bg-emerald-400" : "w-2 bg-muted"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 md:py-12">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">Créons ta boutique 🏪</h1>
              <p className="text-muted-foreground mt-2">2 minutes chrono. Aucune carte bancaire demandée.</p>
            </div>
            <Card className="border-2">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="storeName">Nom de la boutique *</Label>
                  <Input
                    id="storeName"
                    placeholder="Ex : Boutique Maman Ngo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Choisis ton logo (emoji)</Label>
                  <div className="flex flex-wrap gap-2">
                    {STORE_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setLogoEmoji(e)}
                        className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center border-2 transition-all ${
                          logoEmoji === e
                            ? "border-primary bg-primary/10 scale-110"
                            : "border-border hover:border-primary/40 hover:scale-105"
                        }`}
                        aria-label={`Logo ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">Ton nom *</Label>
                    <Input
                      id="ownerName"
                      placeholder="Ex : Ngo Mputu"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">Numéro WhatsApp *</Label>
                    <Input
                      id="whatsapp"
                      type="tel"
                      placeholder="081 234 5678"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      maxLength={20}
                    />
                    <p className="text-xs text-muted-foreground">Les commandes arriveront sur ce numéro.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Adresse de ta boutique</Label>
                  <div className="flex items-center rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-ring">
                    <span className="pl-3 pr-1 text-sm text-muted-foreground whitespace-nowrap">kinshop.cd/</span>
                    <Input
                      id="slug"
                      className="border-0 focus-visible:ring-0 shadow-none"
                      placeholder="maman-ngo"
                      value={slug}
                      onChange={(e) => setSlug(slugify(e.target.value))}
                      maxLength={30}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {slugAvailableHint} — laisse vide pour utiliser le nom de ta boutique.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">Ville</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={40} />
                  </div>
                  <div className="space-y-2">
                    <Label>Taux de change (FC pour 1 $)</Label>
                    <Input value="2 850 FC" disabled />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Décris ta boutique (optionnel)</Label>
                  <Textarea
                    id="description"
                    placeholder="Ex : Pagnes wax authentiques, livraison dans tout Kin. Bienvenue !"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={300}
                  />
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={onCancel}>
                    Annuler
                  </Button>
                  <Button onClick={goStep2} className="min-w-36">
                    Continuer
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">Ajoute tes premiers produits 📦</h1>
              <p className="text-muted-foreground mt-2">
                Commence avec 1 à 5 produits. Tu pourras en ajouter d&apos;autres à tout moment.
              </p>
            </div>

            <Card className="border-2 mb-5">
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-[70px_1fr] sm:grid-cols-[70px_1fr_130px_150px] gap-3">
                  <div className="space-y-2">
                    <Label>Emoji</Label>
                    <Input
                      className="text-center text-xl"
                      value={draft.emoji}
                      onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom du produit</Label>
                    <Input
                      placeholder="Ex : Pagne wax premium"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prix ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="12"
                      value={draft.priceUSD}
                      onChange={(e) => setDraft({ ...draft, priceUSD: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Catégorie</Label>
                    <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {draft.priceUSD && Number(draft.priceUSD) > 0
                      ? `≈ ${formatFC(usdToFC(Number(draft.priceUSD)))}`
                      : "Le prix en FC sera calculé automatiquement."}
                  </p>
                  <Button variant="outline" onClick={addProduct}>
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter ce produit
                  </Button>
                </div>
              </CardContent>
            </Card>

            {products.length > 0 && (
              <div className="space-y-2 mb-6 max-h-64 overflow-y-auto scrollbar-thin">
                {products.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <span className="text-2xl">{p.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm">${Number(p.priceUSD).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{formatFC(usdToFC(Number(p.priceUSD)))}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeProduct(idx)} aria-label="Retirer">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {products.length === 0 && (
              <p className="text-center text-sm text-muted-foreground mb-6">
                💡 Tu peux aussi sauter cette étape et ajouter tes produits plus tard.
              </p>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour
              </Button>
              <Button onClick={submit} disabled={loading} className="min-w-44">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création…
                  </>
                ) : (
                  <>
                    <Store className="w-4 h-4 mr-2" />
                    Créer ma boutique
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && createdStore && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="text-center pt-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
              className="w-24 h-24 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-5xl mb-6"
            >
              🎉
            </motion.div>
            <h1 className="text-3xl font-bold">Félicitations, {createdStore.ownerName} !</h1>
            <p className="text-muted-foreground mt-2">
              Ta boutique <strong className="text-foreground">{createdStore.logoEmoji} {createdStore.name}</strong> est en ligne.
              Maintenant, fais-la connaître !
            </p>

            <Card className="mt-8 text-left">
              <CardContent className="p-6 space-y-4">
                <Label>Ton lien de boutique — à coller dans ton statut WhatsApp</Label>
                <div className="flex gap-2">
                  <Input readOnly value={`${window.location.origin}/#/boutique/${createdStore.slug}`} className="font-mono text-sm" />
                  <Button onClick={copyLink} className="shrink-0">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copied ? "Copié !" : "Copier"}
                  </Button>
                </div>
                <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">💡 Astuce pour te faire connaître :</p>
                  Publie ton lien dans ton statut WhatsApp avec une belle photo de produit,
                  puis renouvelle chaque matin. Chaque personne qui clique voit ta boutique complète —
                  et son lien à elle, si elle crée la sienne, fera ta publicité aussi !
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
              <Button size="lg" onClick={() => onCreated(createdStore.slug)}>
                <Store className="w-5 h-5 mr-2" />
                Aller à mon tableau de bord
              </Button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}

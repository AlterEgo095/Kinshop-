// KinShop i18n — fondations bilingues FR/EN (vague 2 premium international)
// ⚠️ Fichier partagé client + serveur : AUCUN secret ici.
//
// Principe : dictionnaire plat typé, sans dépendance externe. La langue
// choisie vit dans le cookie kinshop_lang (365 j) ; le serveur le lit dans
// layout.tsx (generateMetadata + <html lang>) et le client via LangProvider
// (src/components/kinshop/lang-context.tsx). Défaut : fr (marché historique).
// Vague 3 : auth-view traduite, pages d'erreur bilingues, OG social premium.
// Reste sur la roadmap : store-view + dashboard, puis routage /en pour hreflang
// (les URL distinctes sont un prérequis SEO hreflang).

export type Lang = "fr" | "en"

/** Cookie de persistance du choix de langue (SameSite=Lax, pas httpOnly : côté client). */
export const LANG_COOKIE = "kinshop_lang"

export const DICT = {
  /* ─── Navigation (header landing) ─── */
  "nav.how": { fr: "Comment ça marche", en: "How it works" },
  "nav.features": { fr: "Fonctionnalités", en: "Features" },
  "nav.pricing": { fr: "Tarifs", en: "Pricing" },
  "hdr.dashboard": { fr: "Mon tableau de bord", en: "My dashboard" },
  "hdr.logout": { fr: "Sortir", en: "Log out" },
  "hdr.login": { fr: "Se connecter", en: "Log in" },
  "hdr.myShop": { fr: "Ma boutique", en: "My shop" },
  "hdr.createShort": { fr: "Créer", en: "Create" },
  "hdr.createLong": { fr: "ma boutique", en: "my shop" },

  /* ─── Hero ─── */
  "hero.badge": { fr: "100% conçu pour les vendeurs de Kin 🇨🇩", en: "100% built for Kin sellers 🇨🇩" },
  "hero.h1a": { fr: "Transforme ton statut WhatsApp en", en: "Turn your WhatsApp status into a" },
  "hero.h1b": { fr: "vraie boutique", en: "real shop" },
  "hero.h1c": { fr: "en 5 minutes", en: "in 5 minutes" },
  "hero.p1": {
    fr: "Crée ton catalogue, partage ton lien, reçois tes commandes directement sur WhatsApp et encaisse par ",
    en: "Create your catalog, share your link, receive orders straight on WhatsApp and get paid with ",
  },
  "hero.sep": { fr: ", ", en: ", " },
  "hero.or": { fr: " ou ", en: " or " },
  "hero.pEnd": { fr: ". Gratuit pour commencer.", en: ". Free to get started." },
  "cta.manage": { fr: "Gérer ma boutique", en: "Manage my shop" },
  "cta.createFree": { fr: "Créer ma boutique gratuitement", en: "Create your shop for free" },
  "cta.demo": { fr: "Voir une boutique démo", en: "See a demo shop" },
  "stat.create": { fr: "pour créer ta boutique", en: "to create your shop" },
  "stat.online": { fr: "pour être en ligne", en: "to get online" },
  "stat.mm": { fr: "mobile money accepté", en: "mobile money options" },
  "float.order": { fr: "Nouvelle commande !", en: "New order!" },
  "hero.imgAlt": {
    fr: "Vendeuse congolaise gérant sa boutique en ligne KinShop depuis son téléphone",
    en: "Congolese seller managing her KinShop online shop from her phone",
  },

  /* ─── Bandeau paiements ─── */
  "pay.accept": { fr: "Encaisse avec :", en: "Accepted payments:" },
  "pay.cash": { fr: "💵 Espèces", en: "💵 Cash" },

  /* ─── Problème → solution ─── */
  "pb.title": { fr: "Marre de vendre « à l'ancienne » ?", en: "Tired of selling the old way?" },
  "pb.body": {
    fr: "Des milliers de vendeurs à Kinshasa utilisent déjà WhatsApp et Facebook. KinShop leur donne enfin les outils d'un vrai commerce.",
    en: "Thousands of sellers in Kinshasa already use WhatsApp and Facebook. KinShop finally gives them the tools of a real business.",
  },
  "pb.b1": { fr: "Photos de produits perdues dans tes statuts", en: "Product photos lost in your status updates" },
  "pb.a1": { fr: "Un catalogue pro, toujours à jour", en: "A professional catalog, always up to date" },
  "pb.b2": { fr: "Commandes mélangées avec les discussions", en: "Orders mixed up with chats" },
  "pb.a2": { fr: "Chaque commande enregistrée et suivie", en: "Every order recorded and tracked" },
  "pb.b3": { fr: "« C'est combien déjà ? » répété 50 fois par jour", en: "“How much was it again?” repeated 50 times a day" },
  "pb.a3": { fr: "Prix clairs en FC et USD sur ton lien", en: "Clear prices in FC and USD on your link" },

  /* ─── Comment ça marche ─── */
  "how.badge": { fr: "Simple comme bonjour", en: "Easy as can be" },
  "how.title": { fr: "3 étapes, c'est tout", en: "3 steps, that's all" },
  "how.s1t": { fr: "Crée ta boutique", en: "Create your shop" },
  "how.s1d": {
    fr: "Nom, emoji, numéro WhatsApp. Pas besoin de carte bancaire ni de gros téléphone.",
    en: "Name, emoji, WhatsApp number. No bank card or fancy phone needed.",
  },
  "how.s2t": { fr: "Ajoute tes produits", en: "Add your products" },
  "how.s2d": {
    fr: "Photo ou emoji, prix en FC et USD convertis automatiquement. Modifiable à tout moment.",
    en: "Photo or emoji, prices in FC and USD converted automatically. Edit anytime.",
  },
  "how.s3t": { fr: "Partage ton lien", en: "Share your link" },
  "how.s3d": {
    fr: "Ton lien dans ton statut WhatsApp et ta page Facebook. Les clients commandent tout seuls.",
    en: "Your link in your WhatsApp status and Facebook page. Customers order on their own.",
  },

  /* ─── Fonctionnalités ─── */
  "ft.title": { fr: "Tout ce qu'il te faut pour vendre", en: "Everything you need to sell" },
  "ft.sub": {
    fr: "Conçu pour la réalité de Kinshasa : data limitée, mobile d'abord, mobile money partout.",
    en: "Designed for Kinshasa's reality: limited data, mobile first, mobile money everywhere.",
  },
  "ft.f1t": { fr: "Léger & rapide", en: "Light & fast" },
  "ft.f1d": {
    fr: "Fonctionne même avec 3G et petit forfait data. Aucune app à installer.",
    en: "Works even on 3G with a small data plan. No app to install.",
  },
  "ft.f2t": { fr: "WhatsApp intégré", en: "WhatsApp built-in" },
  "ft.f2d": {
    fr: "Chaque commande t'arrive par WhatsApp avec le récapitulatif complet.",
    en: "Every order reaches you on WhatsApp with the full summary.",
  },
  "ft.f3t": { fr: "FC & USD", en: "FC & USD" },
  "ft.f3d": {
    fr: "Prix affichés en francs congolais et dollars, conversion automatique.",
    en: "Prices shown in Congolese francs and dollars, automatic conversion.",
  },
  "ft.f4t": { fr: "Panier client", en: "Customer cart" },
  "ft.f4d": {
    fr: "Tes clients ajoutent plusieurs produits avant de commander, comme sur Jumia.",
    en: "Your customers add several products before ordering, just like on Jumia.",
  },
  "ft.f5t": { fr: "Suivi des commandes", en: "Order tracking" },
  "ft.f5d": {
    fr: "Nouvelle, confirmée, livrée : tu sais toujours où en est chaque vente.",
    en: "New, confirmed, delivered: you always know where each sale stands.",
  },
  "ft.f6t": { fr: "Lien magique", en: "Magic link" },
  "ft.f6d": {
    fr: "Un seul lien à coller dans ton statut, tes statuts font le marketing pour toi.",
    en: "One link to paste in your status — your statuses do the marketing for you.",
  },

  /* ─── Démo ─── */
  "demo.title": { fr: "Découvre la boutique démo de Maman Ngo", en: "Discover Maman Ngo's demo shop" },
  "demo.body": {
    fr: "Voilà ce que tes clients verront. Fais un essai complet : ajoute au panier, passe commande — elle arrivera directement dans le tableau de bord démo.",
    en: "This is what your customers will see. Give it a full try: add to cart, place an order — it lands right in the demo dashboard.",
  },
  "demo.cta": { fr: "Visiter la démo", en: "Visit the demo" },

  /* ─── Outils gratuits ─── */
  "tools.badge": { fr: "Nouveauté V3 — outils gratuits", en: "New in V3 — free tools" },
  "tools.title": { fr: "Bien plus qu'une boutique", en: "Much more than a shop" },
  "tools.body": {
    fr: "KinShop t'accompagne dans tout ton business : décroche ton prochain job avec un CV pro, facture tes clients entreprises en un clic.",
    en: "KinShop supports your whole business: land your next job with a pro CV, and invoice corporate clients in one click.",
  },
  "cv.free": { fr: "100 % gratuit", en: "100% free" },
  "cv.body": {
    fr: "Crée un CV professionnel en 5 minutes, depuis ton téléphone : 2 modèles modernes, export PDF et image, prêt à envoyer sur WhatsApp aux employeurs.",
    en: "Create a professional CV in 5 minutes from your phone: 2 modern templates, PDF and image export, ready to send to employers on WhatsApp.",
  },
  "cv.li1": { fr: "Modèles « Kin Classique » et « Kin Moderne »", en: "“Kin Classique” and “Kin Moderne” templates" },
  "cv.li2": { fr: "Photo, compétences, langues, expériences", en: "Photo, skills, languages, experience" },
  "cv.li3": { fr: "PDF A4 + PNG partageable instantanément", en: "A4 PDF + instantly shareable PNG" },
  "cv.cta": { fr: "Créer mon CV maintenant", en: "Create my CV now" },
  "kf.badge": { fr: "Inclus dans ta boutique", en: "Included in your shop" },
  "kf.body": {
    fr: "Factures professionnelles avec QR de paiement mobile money : idéal pour tes clients entreprises, ONG et commandes en gros. Partage par WhatsApp, PDF ou image.",
    en: "Professional invoices with mobile money payment QR codes: ideal for corporate clients, NGOs and bulk orders. Share via WhatsApp, PDF or image.",
  },
  "kf.li1": { fr: "Lignes détaillées, totaux FC & USD automatiques", en: "Detailed lines, automatic FC & USD totals" },
  "kf.li2": { fr: "QR de paiement M-Pesa / Airtel / Orange intégré", en: "Built-in M-Pesa / Airtel / Orange payment QR" },
  "kf.li3": { fr: "Lien de facture publique à envoyer au client", en: "Public invoice link to send to your customer" },
  "kf.ctaIn": { fr: "Ouvrir mes factures", en: "Open my invoices" },
  "kf.ctaCreate": { fr: "Créer ma boutique pour facturer", en: "Create your shop to invoice" },

  /* ─── Témoignages ─── */
  "tm.open": { fr: "« ", en: "“" },
  "tm.close": { fr: " »", en: "”" },
  "tm1": {
    fr: "Avant je perdais des commandes dans mes messages. Maintenant tout est clair, même mes clientes de Lubumbashi commandent !",
    en: "I used to lose orders in my messages. Now everything is clear — even my customers in Lubumbashi order!",
  },
  "tm2": {
    fr: "Mon lien est dans mon statut WhatsApp. En une semaine, 40 nouvelles commandes. Franchement, ça a changé mon business.",
    en: "My link is in my WhatsApp status. In one week, 40 new orders. Honestly, it changed my business.",
  },
  "tm3": {
    fr: "Simple, en français, et je vois tout ce qui reste en stock. Mes clientes adorent le panier.",
    en: "Simple, and I can see everything left in stock. My customers love the cart.",
  },

  /* ─── FAQ ─── */
  "faq.title": { fr: "Questions fréquentes", en: "Frequently asked questions" },
  "faq.sub": { fr: "Tout ce que les vendeurs nous demandent avant de se lancer.", en: "Everything sellers ask us before getting started." },
  "faq.q1": { fr: "C'est vraiment gratuit ?", en: "Is it really free?" },
  "faq.a1": {
    fr: "Oui ! Créer ta boutique, ajouter tes produits et recevoir tes commandes est 100% gratuit. Une option Premium à {price} $/mois apporte un nom de domaine perso, des statistiques avancées et des quotas élargis — mais l'essentiel reste toujours gratuit.",
    en: "Yes! Creating your shop, adding products and receiving orders is 100% free. A Premium option at {price} $/month adds a custom domain, advanced stats and larger quotas — the essentials always stay free.",
  },
  "faq.q2": { fr: "Mes clients ont-ils besoin d'une application ?", en: "Do my customers need an app?" },
  "faq.a2": {
    fr: "Non. Tes clients ouvrent simplement ton lien dans leur navigateur, même avec un petit téléphone et une connexion 3G. La commande part ensuite sur ton WhatsApp.",
    en: "No. Your customers simply open your link in their browser, even on a small phone over 3G. The order then lands on your WhatsApp.",
  },
  "faq.q3": { fr: "Comment je reçois l'argent ?", en: "How do I receive the money?" },
  "faq.a3": {
    fr: "Le client choisit M-Pesa, Airtel Money, Orange Money ou le paiement à la livraison. Il voit ton numéro de paiement au moment de la commande, et toi tu confirmes la réception avant d'expédier.",
    en: "The customer picks M-Pesa, Airtel Money, Orange Money or cash on delivery. They see your payment number when ordering, and you confirm receipt before shipping.",
  },
  "faq.q4": { fr: "Je peux vendre depuis une autre ville que Kinshasa ?", en: "Can I sell from a city other than Kinshasa?" },
  "faq.a4": {
    fr: "Bien sûr ! KinShop marche à Lubumbashi, Goma, Bukavu, Matadi... partout en RDC et même en dehors si tu as un numéro WhatsApp.",
    en: "Of course! KinShop works in Lubumbashi, Goma, Bukavu, Matadi... anywhere in the DRC and even abroad if you have a WhatsApp number.",
  },

  /* ─── CTA final ─── */
  "ctaF.title": { fr: "Prêt à vendre plus, aujourd'hui ?", en: "Ready to sell more, today?" },
  "ctaF.body": {
    fr: "Rejoins les vendeurs congolais qui digitalisent leur business. Ton lien sera prêt dans 5 minutes.",
    en: "Join Congolese sellers digitizing their business. Your link will be ready in 5 minutes.",
  },
  "ctaF.btn": { fr: "Créer ma boutique maintenant", en: "Create my shop now" },

  /* ─── Footer ─── */
  "footer.tagline": { fr: "Fait avec ❤️ à Kinshasa pour les entrepreneurs de la RDC", en: "Made with ❤️ in Kinshasa for DRC entrepreneurs" },
  "footer.waMsg": { fr: "Bonjour KinShop, j'ai besoin d'aide.", en: "Hello KinShop, I need help." },
  "footer.support": { fr: "Support WhatsApp :", en: "WhatsApp support:" },
  "footer.copy": {
    fr: "© 2025 KinShop · M-Pesa, Airtel Money et Orange Money sont des marques de leurs propriétaires",
    en: "© 2025 KinShop · M-Pesa, Airtel Money and Orange Money are trademarks of their respective owners",
  },

  /* ─── Pages d'erreur (vague 3) ─── */
  "err.404.title": { fr: "Page introuvable", en: "Page not found" },
  "err.404.body": {
    fr: "Cette page n'existe pas ou a été déplacée. Reviens à l'accueil, tout est encore là.",
    en: "This page doesn't exist or has moved. Head back home — everything is still there.",
  },
  "err.404.cta": { fr: "Retour à la boutique", en: "Back to the shop" },
  "err.500.title": { fr: "Oups, une erreur est survenue", en: "Oops, something went wrong" },
  "err.500.body": {
    fr: "Une erreur inattendue est survenue. Réessaie — si le problème persiste, recharge la page.",
    en: "An unexpected error occurred. Try again — if it persists, reload the page.",
  },
  "err.500.cta": { fr: "Réessayer", en: "Try again" },
  "err.500.home": { fr: "Aller à l'accueil", en: "Go home" },

  /* ─── Auth : inscription / connexion (vague 3) ─── */
  "auth.createAccount": { fr: "Créer un compte", en: "Create an account" },
  "auth.login": { fr: "Se connecter", en: "Log in" },
  "auth.regTitle": { fr: "Crée ton compte 🎉", en: "Create your account 🎉" },
  "auth.loginTitle": { fr: "Content de te revoir 👋", en: "Welcome back 👋" },
  "auth.regSub": {
    fr: "Gratuit, en français — ta boutique sera prête en 5 minutes.",
    en: "Free and simple — your shop will be ready in 5 minutes.",
  },
  "auth.loginFor": { fr: "Connecte-toi pour {next}.", en: "Log in to {next}." },
  "auth.next.create": { fr: "créer ta boutique", en: "create your shop" },
  "auth.next.dashboard": { fr: "gérer ta boutique", en: "manage your shop" },
  "auth.loginSub": { fr: "Connecte-toi pour gérer ta boutique.", en: "Log in to manage your shop." },
  "auth.name": { fr: "Ton nom *", en: "Your name *" },
  "auth.namePh": { fr: "Ex : Ngo Mputu", en: "E.g.: Ngo Mputu" },
  "auth.email": { fr: "Adresse email *", en: "Email address *" },
  "auth.emailPh": { fr: "toi@exemple.cd", en: "you@example.com" },
  "auth.whatsapp": { fr: "Numéro WhatsApp (optionnel)", en: "WhatsApp number (optional)" },
  "auth.passwordReg": { fr: "Mot de passe * (8 caractères minimum)", en: "Password * (8 characters minimum)" },
  "auth.password": { fr: "Mot de passe", en: "Password" },
  "auth.showPw": { fr: "Afficher le mot de passe", en: "Show password" },
  "auth.hidePw": { fr: "Masquer le mot de passe", en: "Hide password" },
  "auth.creating": { fr: "Création du compte…", en: "Creating account…" },
  "auth.createBtn": { fr: "Créer mon compte", en: "Create my account" },
  "auth.logging": { fr: "Connexion…", en: "Logging in…" },
  "auth.hasAccount": { fr: "Tu as déjà un compte ?", en: "Already have an account?" },
  "auth.noAccount": { fr: "Pas encore de compte ?", en: "No account yet?" },
  "auth.registerFree": { fr: "Créer un compte gratuitement", en: "Create a free account" },
  "auth.secureNote": {
    fr: "Ton mot de passe est chiffré (scrypt) et la connexion s'appuie sur une session sécurisée HttpOnly. Personne ne peut gérer ta boutique sans ton compte.",
    en: "Your password is hashed (scrypt) and login relies on a secure HttpOnly session. Nobody can manage your shop without your account.",
  },
  "auth.backHome": { fr: "Retour à l'accueil", en: "Back to home" },
  "auth.tNameReq": { fr: "Ton nom est requis (2 caractères minimum).", en: "Your name is required (2 characters minimum)." },
  "auth.tEmailBad": { fr: "Adresse email invalide.", en: "Invalid email address." },
  "auth.tPwMin": { fr: "Le mot de passe doit contenir au moins 8 caractères.", en: "Password must be at least 8 characters." },
  "auth.tLoginReq": { fr: "Email et mot de passe requis.", en: "Email and password are required." },
  "auth.tRegFail": { fr: "Erreur lors de la création du compte.", en: "Error creating your account." },
  "auth.tLoginFail": { fr: "Erreur lors de la connexion.", en: "Error logging in." },
  "auth.tUnknown": { fr: "Erreur inconnue", en: "Unknown error" },
  "auth.welcome": { fr: "Bienvenue {name} ! 🎉", en: "Welcome {name}! 🎉" },
  "auth.welcomeBack": { fr: "Content de te revoir, {name} ! 👋", en: "Welcome back, {name}! 👋" },

  /* ─── Mission sécurité 2026-09-15 — Mot de passe oublié / réinitialisation ─── */
  "auth.forgot": { fr: "Mot de passe oublié ?", en: "Forgot your password?" },
  "auth.forgotTitle": { fr: "Récupérer ton accès 🔑", en: "Recover your access 🔑" },
  "auth.forgotSub": {
    fr: "Entre ton adresse email : si un compte lui est associé, tu recevras un lien de réinitialisation.",
    en: "Enter your email: if an account is linked to it, you will receive a reset link.",
  },
  "auth.forgotBtn": { fr: "Envoyer le lien de réinitialisation", en: "Send reset link" },
  "auth.forgotSending": { fr: "Envoi en cours…", en: "Sending…" },
  "auth.forgotDone": {
    fr: "Si un compte est associé à cette adresse email, un lien de réinitialisation t'a été envoyé. Vérifie ta boîte de réception (et tes spams). Le lien est valable 60 minutes.",
    en: "If an account is linked to this email address, a reset link has been sent to you. Check your inbox (and spam folder). The link is valid for 60 minutes.",
  },
  "auth.forgotBack": { fr: "Retour à la connexion", en: "Back to login" },
  "auth.forgotFail": {
    fr: "Erreur lors de l'envoi. Réessaie dans quelques instants.",
    en: "Error while sending. Please try again in a few moments.",
  },
  "auth.resetTitle": { fr: "Nouveau mot de passe 🔐", en: "New password 🔐" },
  "auth.resetSub": {
    fr: "Choisis un mot de passe solide (8 caractères minimum) que tu n'utilises pas ailleurs.",
    en: "Choose a strong password (8 characters minimum) you don't use elsewhere.",
  },
  "auth.resetNewPw": { fr: "Nouveau mot de passe *", en: "New password *" },
  "auth.resetConfirmPw": { fr: "Confirmer le nouveau mot de passe *", en: "Confirm new password *" },
  "auth.resetBtn": { fr: "Réinitialiser mon mot de passe", en: "Reset my password" },
  "auth.resetting": { fr: "Réinitialisation…", en: "Resetting…" },
  "auth.resetDone": { fr: "Mot de passe réinitialisé ✅", en: "Password reset ✅" },
  "auth.resetDoneSub": {
    fr: "Ton mot de passe a été modifié et toutes tes sessions ont été déconnectées. Tu peux maintenant te connecter avec ton nouveau mot de passe.",
    en: "Your password has been changed and all your sessions have been logged out. You can now log in with your new password.",
  },
  "auth.resetGoLogin": { fr: "Me connecter", en: "Log in" },
  "auth.resetInvalidTitle": { fr: "Lien invalide ou expiré", en: "Invalid or expired link" },
  "auth.resetInvalidSub": {
    fr: "Ce lien de réinitialisation est invalide, expiré ou a déjà été utilisé. Depuis l'écran de connexion, demande un nouveau lien pour retrouver ton accès.",
    en: "This reset link is invalid, expired or has already been used. From the login screen, request a new link to recover your access.",
  },
  "auth.resetNewLink": { fr: "Retour à l'accueil", en: "Back to home" },
  "auth.tResetMin": {
    fr: "Le mot de passe doit contenir au moins 8 caractères.",
    en: "Password must be at least 8 characters.",
  },
  "auth.tResetMismatch": {
    fr: "Les deux mots de passe ne correspondent pas.",
    en: "The two passwords do not match.",
  },
  "auth.tResetFail": {
    fr: "Erreur lors de la réinitialisation. Réessaie.",
    en: "Error while resetting. Please try again.",
  },
} as const

export type DictKey = keyof typeof DICT

export function makeTr(lang: Lang): (key: DictKey) => string {
  return (key: DictKey) => DICT[key][lang]
}

/** Valeur du cookie → langue sûre (tout ce qui n'est pas "en" retombe sur fr). */
export function langFromCookieValue(value: string | undefined | null): Lang {
  return value === "en" ? "en" : "fr"
}

/** Balise navigateur (navigator.language / accept-language) → langue supportée. */
export function normalizeLangTag(tag: string | undefined | null): Lang {
  return typeof tag === "string" && tag.toLowerCase().startsWith("en") ? "en" : "fr"
}

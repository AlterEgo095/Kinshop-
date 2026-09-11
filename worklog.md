# Worklog — Projet KinShop

---
Task ID: 1
Agent: Z.ai Code (principal)
Task: Analyse marché numérique RDC + conception et construction de la V1 de KinShop (boutique WhatsApp-native pour vendeurs RDC)

Work Log:
- Recherche web approfondie (8 requêtes) : marché numérique RDC 2025 (34M internautes, Vodacom/Airtel/Orange), mobile money (M-Pesa 43,8%, Airtel Money 41,3%), réseaux sociaux (Facebook 73% des kinois, TikTok en explosion chez les jeunes), écosystème startups (300+ startups, Kinshasa classée mondiale), friction paiements freelances africains (5-15% perdus), e-commerce WhatsApp/Facebook en RDC.
- Recommandation stratégique formulée : KinShop = créateur de boutiques WhatsApp avec boucle virale intégrée (chaque lien de boutique partagé recrute de nouveaux vendeurs).
- Schéma Prisma créé (prisma/schema.prisma) : models Store, Product, Order (items stockés en JSON string car SQLite/Prisma sans type liste) + `bun run db:push` réussi.
- Image hero générée par IA (public/images/hero-kinshop.png, 1344x768, vendeuse congolaise + smartphone, palette emerald/amber).
- Helpers partagés (src/lib/kinshop.ts) : types StoreData/ProductData/OrderData, formatFC/formatUSD, usdToFC, normalizePhone (format 243), buildWhatsAppLink, buildOrderMessage (récap commande FR complet), slugify, makeOrderRef (KIN-XXXX), CATEGORIES, timeAgo.
- API routes backend :
  - src/app/api/stores/route.ts : POST (création, slug unique auto), GET ?slug (boutique + produits), PATCH (réglages).
  - src/app/api/products/route.ts : POST (ajout), DELETE ?id.
  - src/app/api/orders/route.ts : POST (création commande avec recalcul serveur des totaux depuis la DB — jamais confiance au client — + génération du lien wa.me avec message complet), GET ?slug (liste commandes), PATCH (statut new/confirmed/delivered/cancelled).
- Frontend (composants client src/components/kinshop/) :
  - landing.tsx : header sticky, hero (badge RDC, titre, image IA, carte flottante animation), bande paiement (M-Pesa/Airtel/Orange/espèces), problème→solution (3 cartes), 3 étapes, 6 fonctionnalités, carte démo, témoignages, FAQ accordéon, CTA final dégradé emerald, footer sticky (mt-auto). Animations framer-motion whileInView.
  - create-wizard.tsx : 3 étapes (infos boutique + emoji picker + slug éditable → ajout produits initiaux avec conversion FC live → écran succès avec lien copiable + astuce virale).
  - dashboard.tsx : stats (produits, nouvelles commandes avec highlight ambre, volume FC), onglets Produits (grid + dialog ajout + suppression AlertDialog), Commandes (badges statut, actions Confirmer/Livrée/Annuler, bouton Contacter sur WhatsApp avec message prérempli), Réglages (PATCH), dialog Partage (lien + message prêt à publier).
  - store-view.tsx : boutique publique (header boutique, recherche, filtres catégories chips, grid produits prix FC/USD), barre panier collante fixe, Sheet panier avec steppers, Dialog checkout (nom, tél, zone avec datalist communes de Kin, 4 moyens paiement en cartes, note) → POST /api/orders → écran succès (réf, instructions paiement mobile money, gros bouton "Confirmer sur WhatsApp" via wa.me).
  - kinshop-app.tsx : machine à états de vues (landing/create/dashboard/store), deep-link partageable via hash #/boutique/{slug} (pushState + popstate), session vendeur persistée localStorage (kinshop_owner_slug), scroll-to-top par vue.
- page.tsx réécrit (rend KinShopApp uniquement — single route contrainte respectée), layout.tsx : metadata FR/SEO RDC, lang="fr", viewport themeColor, Toaster sonner.
- globals.css : thème emerald (--primary oklch 0.596 0.145 163.225), secondary ambre, scrollbar custom (.scrollbar-thin), ::selection ambre.
- Seed (scripts/seed-kinshop.ts, exécuté) : boutique démo « Boutique Maman Ngo » (slug maman-ngo, 12 produits, 2 commandes d'exemple KIN-DEMO01/02).
- Lint passé propre après corrections (react-hooks/set-state-in-effect corrigé via async IIFE dans l'effet d'hydratation ; directives eslint img inutiles retirées).
- Vérification E2E Agent Browser complète :
  - Landing desktop + mobile 375px : rendu OK, animations au scroll OK, header responsive corrigé (labels courts mobile).
  - Deep-link #/boutique/maman-ngo : survit au reload ✅.
  - Parcours client complet testé : démo → ajout 3 produits → panier sheet (total exact 171 000 FC/$60) → checkout (formulaire rempli) → commande KIN-DTHT5H créée → écran succès avec instructions M-Pesa (+243 812 345 678) → lien wa.me vérifié (message récap complet encodé).
  - Commande visible dans dashboard Maman Ngo (stats 359 100 FC = somme exacte) → action Confirmer OK (badge 2→1, statut Confirmée).
  - Parcours vendeur testé : wizard complet → création « Chez JM Électronique » (2 produits, conversions FC exactes) → dashboard OK → dialog partage OK.
  - Accessibilité corrigée : DialogTitle/DialogDescription ajoutés au dialog checkout/succès, aria-describedby sur Sheet panier → console propre à froid (session neuve).
  - Mobile boutique : grille 2 colonnes, barre panier collante OK.
  - L'« Issue » Next dev tools restante identifiée comme artefact HMR (session à froide propre) — non présente pour un visiteur réel.

Stage Summary:
- KinShop V1 est EN LIGNE et fonctionnel de bout en bout : landing marketing FR → création de boutique en 2 min → dashboard vendeur (produits/commandes/réglages/partage) → boutique publique partageable (#/boutique/slug) → commande client avec panier → notification WhatsApp + enregistrement DB.
- Décisions clés : navigation par vues dans une seule route (contrainte sandbox, deep-link par hash), prix stockés en USD et convertis en FC (taux paramétrable par boutique, défaut 2850), totaux commandes recalculés côté serveur, contact WhatsApp via wa.me (pas d'API WhatsApp nécessaire), palette emerald/ambre (pas de bleu).
- Base de données : db/custom.db (SQLite), 2 boutiques (maman-ngo démo avec 12 produits/3 commandes ; jm-electronique de test avec 2 produits).
- Artifacts : prisma/schema.prisma, src/lib/kinshop.ts, src/app/api/{stores,products,orders}/route.ts, src/components/kinshop/{kinshop-app,landing,create-wizard,dashboard,store-view}.tsx, public/images/hero-kinshop.png, scripts/seed-kinshop.ts.
- Piste V2 : intégration paiement mobile money réel, domaines perso, stats avancées, partage image statut WhatsApp générée.

---
Task ID: 2
Agent: Z.ai Code (principal)
Task: Intégration paiement réel Chariow (mobile money) + générateur d'image statut WhatsApp

Work Log:
- Identification du service : « Charow » = Chariow (chariow.com), plateforme e-commerce créateurs africains. Docs API lues via llms.txt Mintlify : init checkout (POST api.chariow.com/v1/checkout, Bearer sk_live_), réponse data.payment.checkout_url, webhooks « Pulses » (HMAC-SHA256 du raw body, secret whsec_, x-chariow-signature, idempotence x-pulse-delivery-id, event successful.sale, payload sale.custom_metadata).
- Prisma : Store +isPremium/premiumUntil/chariowEmail/chariowPhone/chariowSaleId ; nouvelle table PulseDelivery (deliveryId unique pour l'idempotence). db:push OK.
- src/lib/chariow.ts : getChariowConfig (.env : CHARIOW_API_KEY/CHARIOW_PRODUCT_ID/CHARIOW_PULSE_SECRET/APP_URL), isChariowLive, initiateCheckout (custom_metadata max 10 clés, phone {number, country_code:"CD"}), verifyPulseSignature (HMAC timingSafeEqual sur raw body), buildPremiumRedirectUrl.
- API routes : POST /api/premium/checkout (validation email/tél, mémorise facturation, mode live → checkout_url Chariow, mode sim sinon), POST /api/premium/simulate-confirm (refusé 403 si clés configurées, active premium +30j prolongeable), POST /api/chariow/pulse (signature HMAC obligatoire → 401, idempotence, successful.sale : store_slug → premium +30j prolongé depuis la fin actuelle ; order_ref → commande status "paid"). GET /api/stores assaini (champs chariow masqués).
- Types : OrderStatus + "paid", StoreData +isPremium/premiumUntil.
- Statut Studio (src/components/kinshop/status-studio.tsx) : canvas 1080×1920, 3 fonds IA générés (public/status/fond-1/2/3.png, 768×1344, cover), voile dégradé, badge « Propulsé par KinShop », pastille emoji, nom boutique (wrap 2 lignes), slogan, pastille WhatsApp, carte QR (lib qrcode, vert #065f46), footer prix FC/USD + mobile money. Download PNG (toBlob) + navigator.share avec fichier. Layout vertical recalculé pour zéro chevauchement (vérifié en pleine résolution via export toDataURL).
- Dashboard : bandeau Premium (CTA ambre si non premium / carte active + date si premium), badge couronne header, onglet « Statut », dialogs formulaire premium (pré-rempli ownerName/whatsapp) + paiement simulé, refreshStore, STATUS_CONFIG + paid « Payée en ligne ».
- Router : vue premium-success + deep-link #/premium/succes (parseHash HashTarget union, hash sync, popstate).
- PremiumSuccess : fetch état réel, écran « Bienvenue chez les Premium » avec date d'expiration, ou état « en attente de confirmation » avec bouton vérifier.
- .env : config Chariow documentée (valeurs vides par défaut → mode simulation). README à jour.
- Tests E2E Agent Browser : landing OK, session vendeur démo, dialog premium pré-rempli, checkout sim → dialog simulation → activation (badge Crown + bandeau « Premium actif jusqu'au 11 octobre 2026 »), statut studio rendu parfait, webhook testé via curl : signature valide → premium prolongé 11/10→10/11/2026 + chariowSaleId enregistré, duplicate → duplicate:true, signature invalide → 401, order_ref KIN-DEMO01 → status paid (vérifié en DB). Vue succès avec données réelles. Mobile 375px OK. Lint propre. Démo réinitialisée après tests.

Stage Summary:
- Parcours de paiement complet opérationnel en mode simulation ; passage en réel par simple remplissage de CHARIOW_API_KEY + CHARIOW_PRODUCT_ID (+ APP_URL, + Pulse whsec_ vers /api/chariow/pulse dans le dashboard Chariow).
- Boucle virale renforcée : image statut QR code générée en 1 clic, téléchargeable/partageable, prête pour le statut WhatsApp.
- Sécurité webhook : HMAC strict sur raw body + idempotence DB. Aucune donnée Chariow exposée côté public.

---
Task ID: 3
Agent: Z.ai Code (principal)
Task: Implémentation de la console d'administration (admin) gérant la globalité de la plateforme KinShop

Work Log:
- Schéma Prisma étendu : Store.status ("active"|"suspended", défaut "active") + 2 nouvelles tables PlatformSetting (key/value) et AdminAction (journal d'audit). `bun run db:push` OK.
- src/lib/admin.ts (server-only) : getAdminPin (env ADMIN_PIN, défaut démo 243243), guardAdmin/isAdminRequest (header x-admin-pin), adminUnauthorized, logAdminAction (audit non bloquant), getPlatformSettings/setPlatformSetting (maintenance, announcement, defaultRateFC).
- 7 nouvelles routes API /api/admin/* toutes protégées par PIN serveur : auth (POST, valide + journalise la connexion), overview (GET : KPIs, série 14 j, byPayment, topStores, recentOrders/Stores, expiringPremium, GMV, webhooks), stores (GET filtres q/status/premium + compteurs & CA par boutique ; PATCH suspend|activate|grant-premium (30/90/365 j cumulables)|revoke-premium ; DELETE cascade), orders (GET filtres, PATCH statut, DELETE), products (GET filtres, PATCH stock/prix, DELETE), settings (GET/PATCH avec journalisation), logs (?type=pulse|audit). Bug corrigé en cours de route : variable day7 non définie dans overview (500) → fix + redémarrage serveur.
- Nouvelle route publique GET /api/platform : { maintenance, announcement } — consommée par la boutique publique.
- POST /api/stores : le taux FC par défaut des nouvelles boutiques vient maintenant de PlatformSetting.defaultRateFC (paramétrable depuis l'admin).
- store-view.tsx : fetch parallèle /api/platform → écran « Boutique indisponible » si status=suspended, écran « KinShop en maintenance » si maintenance=on, bandeau ambre d'annonce globale au-dessus du header. StoreData +status.
- kinshop-app.tsx : vue "admin" + deep-link #/admin (parseHash, hash sync, popstate) — cohérent avec les deep-links boutique/premium existants.
- landing.tsx : lien discret « Espace admin » dans le footer (onAdmin prop).
- admin-console.tsx (~1600 lignes) : écran login PIN (auto-vérification de session localStorage kinshop_admin_pin, hint PIN démo), onglets : Vue d'ensemble (6 KPI cards + alerte premium expirant < 7 j + graphique barres commandes 14 j + répartition paiements + top boutiques cliquables + dernières commandes/boutiques), Boutiques (recherche debouncée, filtres statut/premium, dropdown Actions complet), Commandes (filtres, Select statut inline, dialogue détail avec items JSON parsés + contact WhatsApp client), Produits (filtres boutique/catégorie, stepper stock +/− avec commit onBlur, suppression), Paramètres (switch maintenance avec avertissement, annonce 280 car., taux FC, journal d'audit + webhooks Chariow en ScrollArea). Tous les écritures → maj optimiste locale + toast + entrée d'audit.
- .env : ADMIN_PIN=243243 documenté. README : section « Console d'administration » + sécurité + roadmap à jour.
- scripts/seed-admin-demo.ts (additif, idempotent, exécuté) : 3 boutiques (Diva Mode Kin premium exp. +20 j→ajusté +5 j pour l'alerte, Kin Tech Gadgets premium, Frais & Bon Kin gratuite), 27 produits, 32 commandes KIN-ADMxxx réparties sur 14 jours (statuts/paiements variés), PlatformSetting par défaut, audit initial. Total DB : 5 boutiques · 27 produits · 35 commandes.
- Tests E2E Agent Browser complets : login mauvais PIN (erreur affichée) → login 243243 OK ; KPIs exacts (5/2/27/24/$749) ; alerte Diva Mode expirant ; suspension Frais & Bon Kin (toast + KPI Suspendues=1 + écran public « Boutique indisponible » vérifié) puis réactivation ; détail commande KIN-ADM008 + statut → Livrée (synchronisé dialog+table+toast) ; stock 25→26 (audit enregistré) ; annonce publiée → bandeau ambre visible sur #/boutique/maman-ngo ; maintenance ON → écran public vérifié → OFF ; annonce vidée ; reload #/admin (session persistée) ; lien footer « Espace admin » → console ; mobile 375px OK (KPIs 2 col., tabs scrollables, tableaux scroll horizontal) ; logout OK. Session à froid : console navigateur propre (artefact HMR radis IDs seulement, connu). Lint final : 0 erreur.
- Réglages remis à l'état neutre après tests (maintenance off, annonce vide, taux 2850).

Stage Summary:
- La Console Admin ( accessible via #/admin ou le lien footer, PIN 243243 par défaut modifiable via ADMIN_PIN) gère la globalité de KinShop : KPIs plateforme, modération des boutiques (suspend/réactiver/supprimer), gestion Premium manuelle (+30/90/365 j ou révocation), supervision de toutes les commandes et produits, maintenance globale, annonces, taux de change par défaut, journal d'audit intégral et suivi des webhooks Chariow.
- Décisions clés : auth par PIN simple (header x-admin-pin vérifié à CHAQUE requête serveur, jamais de role en base — une vraie table AdminUser avec hash pourrait remplacer plus tard), audit log systématique côté serveur, actions admin jamais exposées côté vendeur/public (status=suspended géré par la vue publique), maintenance/annonce centralisées dans PlatformSetting.
- Artifacts : prisma/schema.prisma (Store.status, PlatformSetting, AdminAction), src/lib/admin.ts, src/app/api/admin/{auth,overview,stores,orders,products,settings,logs}/route.ts, src/app/api/platform/route.ts, src/components/kinshop/admin-console.tsx, scripts/seed-admin-demo.ts, README.md mis à jour.

---
Task ID: 4
Agent: Z.ai Code (principal)
Task: Publication sur GitHub du commit contenant la console d'administration

Work Log:
- État vérifié : branche main en avance de 1 sur origin/main — commit local 83f880c (message UUID auto-généré) contenant l'intégralité de la console admin (19 fichiers, +3055 lignes) ; working tree propre ; Chariow + Statut Studio déjà poussés (d192682).
- Vérification navigateur post-session : landing rendue OK, #/admin → login PIN 243243 OK, Vue d'ensemble avec KPIs exacts (5 boutiques, 2 premium, 27 produits, 35 commandes, $749 GMV), alerte premium expirant, graphique 14 j, répartition paiements — zéro erreur page/console.
- Message de commit amendé (UUID → message descriptif « feat: console d'administration globale ») avec worklog inclus.
- Push effectué sur origin/main via URL inline avec PAT (aucune persistance du token dans .git/config ou ~/.git-credentials).

Stage Summary:
- origin/main synchronisé avec la V1 complète : boutiques WhatsApp + Chariow premium + Statut Studio + console admin.
- Rappel sécurité : PAT affiché en clair dans le chat → à révoquer depuis GitHub Settings après usage.

---
Task ID: 5
Agent: Z.ai Code (principal)
Task: Version V2 — paiement mobile money en ligne des commandes + finalisation stats vendeur + notifications SMS

Work Log:
- Reprise du travail V2 laissé inachevé par la session précédente (commit local 73037b3 non poussé, message UUID, sans entrée worklog) : le backend existait (routes /api/stats, /api/analytics/visit, /api/notifications, lib/notifier.ts) mais l'UI dashboard n'avait AUCUN onglet (imports BarChart3/Trophy/Users inutilisés) et le paiement en ligne des commandes n'était pas commencé.
- Prisma : Order étendu avec paymentStatus (unpaid|pending|paid|failed), paymentRef, payerPhone, paidAt. db:push OK. Redémarrage du dev server requis (Prisma Client chargé avant le push → "Unknown field paymentStatus", résolu).
- src/lib/mobile-money.ts : abstraction agrégateur RDC (pattern FlexPay flexpay.cd) — initiateMomoPayment (push USSD type 1, callbackUrl, Bearer token), isMomoLive (MOMO_TOKEN+MOMO_MERCHANT), isWebhookAuthorized (MOMO_CALLBACK_TOKEN). Mode SIMULATION par défaut.
- 4 routes /api/payments : initiate (marque pending + push), status (polling), webhook (code "0" → paid + order.status="paid", idempotent, sinon failed), simulate-confirm (403 en mode live). PATCH /api/orders : le vendeur peut marquer paymentStatus "paid" (espèces reçues, uniquement cash).
- kinshop.ts : types PaymentStatus + OrderData étendu, PAYMENT_STATUS_LABELS, detectOperator (préfixes Vodacom/Orange/Airtel/Africell), OPERATOR_LABELS.
- store-view.tsx (~200 lignes) : écran de paiement complet dans le dialog checkout — idle (montant, numéro à débiter prérempli, CTA "Payer X FC", repli "Payer plus tard via WhatsApp") → waiting (carte push animée, instructions PIN, polling 4 s, bouton démo "J'ai validé le PIN (démo)" en simulation) → paid ("Paiement confirmé ! 🎉" + suivi livraison WhatsApp) / failed (réessayer / modifier numéro). Espèces → écran succès classique inchangé.
- dashboard.tsx : onglet "Stats" (4 KPI cards vues/tendance/conversion/fidélité, graphique double barres vues vs commandes 14 j, produits stars, entonnoir statuts, répartition paiements, panier moyen) + onglet "Alertes" (journal SMS vendeur/client avec badges Simulé/Envoyé/Échec, badge non-lues) + Tabs passé en contrôlé (activeTab/handleTabChange) + badges paiement sur commandes (Payée/Paiement en cours/Échoué/À la livraison/Non payée) + bouton "Paiement reçu" (cash).
- admin-console.tsx : filtre "Tous les paiements" (bug corrigé au passage : ordersPay absent des deps de loadOrders → filtre inerte), badge statut paiement dans la colonne Paiement, détail enrichi (payeur, date paiement), bouton "Paiement OK" (confirmation manuelle admin, journalisée order.payment).
- API admin orders : filtre pay=, PATCH paymentStatus (paid → order.status "paid" si new, log d'audit).
- Conversion vendeur plafonnée à 100 % (1 vue seedée vs 14 commandes seedées affichait 1300 %).
- .env documenté (MOMO_*, SMS_*), README : section "Fonctionnalités V2" + "Paiement mobile money des commandes" (modes simulation/live), roadmap V2 cochée.
- Tests E2E Agent Browser complets : boutique → checkout M-Pesa → écran paiement (37 050 FC) → push USSD (instructions PIN, numéro +243 formaté) → bouton démo → "Paiement confirmé ! 🎉" + toast ; webhook curl (code 0 → paid, idempotence duplicate:true, statut final paid) ; notification SMS vendeur+client simulées ; dashboard Stats (KPIs, graphique, produits stars, entonnoir) ; Alertes (SMS journalisés, badge non-lues effacé) ; Commandes (badge ✅ Payée) ; admin (filtre paiement, détail, confirmation manuelle → Payée en ligne) ; parcours espèces intact (KIN-HQ5NF7) ; mobile 375 px push/paid OK ; console navigateur propre.
- Nettoyage : commandes de test supprimées via console admin (KIN-0WP2DD, KIN-2PFF5Q, KIN-HQ5NF7, KIN-IRMB36), conservée KIN-5MR3KP comme démo payée réaliste.

Stage Summary:
- KinShop V2 est complète : le client peut PAYER sa commande en ligne par push USSD mobile money (M-Pesa/Airtel/Orange) avec confirmation automatique webhook + polling, le vendeur voit les stats avancées (vues, conversion, produits stars, fidélité) et reçoit des alertes SMS (simulées tant que SMS_API_KEY est vide), l'admin supervise les paiements (filtre, badges, confirmation manuelle auditée).
- Passage en production : remplir MOMO_TOKEN + MOMO_MERCHANT (+ MOMO_CALLBACK_TOKEN, APP_URL) pour le push USSD réel via agrégateur FlexPay-compatible — la simulation est alors automatiquement désactivée (403). SMS réels via SMS_API_URL/SMS_API_KEY (format Africa's Talking).
- Décisions clés : webhook agrégateur au pattern FlexPay (reference=notre réf commande, code "0"=succès), idempotence par état paymentStatus, paymentRef distinct de la réf commande, polling client 4 s (pas de WebSocket — simplicité 3G), la commande payée passe automatiquement status="paid" côté vendeur.
- Artifacts : prisma/schema.prisma (Order.payment*), src/lib/mobile-money.ts, src/app/api/payments/{initiate,status,webhook,simulate-confirm}/route.ts, store-view.tsx (écran paiement), dashboard.tsx (tabs Stats/Alertes + badges), admin-console.tsx (filtre/badge/confirmation), README.md, .env.
- Git : commit local UUID 73037b3 (backend V2 session précédente) fusionné par soft reset dans le commit V2 propre de cette session.

---
Task ID: 6-b
Agent: frontend-styling-expert
Task: V3 — composant CV Express RDC (cv-express.tsx)

Work Log:
- Lecture du contexte complet : worklog V1/V2 (boutiques WhatsApp, Chariow premium, console admin, mobile money + stats), status-studio.tsx (pattern canvas + exports), landing.tsx / create-wizard.tsx (style UI), lib/kinshop.ts (slugify, formatPhoneDisplay réutilisés).
- Création d'UN SEUL fichier : src/components/kinshop/cv-express.tsx (~2250 lignes, default export CvExpress({ onHome, onCreateStore })). Aucun autre fichier modifié, aucune route API, aucun package ajouté.
- Types exportés : CvTemplate, CvExperience, CvFormation, CvLanguage, CvData.
- Wizard 3 étapes (Identité / Parcours / Compétences) : stepper cliquable (complété = check emerald, actif = ring, séparateurs), transitions AnimatePresence (fade + slide), header sticky avec bouton ArrowLeft (onHome) + badge ambre « 100 % gratuit ».
- Étape 1 : fullName* (Continuer désactivé si vide), jobTitle, phone (hint live « Numéro normalisé : +243 … » via formatPhoneDisplay), email, city avec datalist 18 communes de Kinshasa, pitch Textarea max 280 avec compteur.
- Étape 2 : expériences répétables (cards, Trash2 aria-label, max 5) + formations (max 4), champs Poste/Entreprise/Période/Détail et Diplôme/École/Année.
- Étape 3 : skills en chips Badge emerald avec X (Input + Entrée/bouton, max 10, anti-doublon), langues éditables (Français/Lingala/Anglais préremplies + « Ajouter une langue » avec Select niveau, max 6, toutes supprimables), référence optionnelle (nom + fonction/contact).
- Bouton « Remplir un exemple » (Sparkles, ambre, étape 1) : profil complet « Grace Mbala, Attachée commerciale » (2 expériences Divine Mode/Kin Mart, UNIKIN 2020, 6 compétences, 3 langues, référence Mme Ngo Bala) — préserve photo et modèle déjà choisis.
- Vue aperçu : canvas A4 1240×1754 responsive (w-full h-auto max-w-3xl) dans card, colonne contrôles sticky (lg) : sélecteur de modèle en cards radio avec miniatures CSS (role=radiogroup), photo optionnelle (input file caché → recadrée carrée 320×320 JPEG en canvas avant stockage, aperçu rond, retirer), 3 exports, « Modifier mes infos ».
- Rendu canvas : renderCanvas(cvData) async pure (charge la photo via Promise, garde-fou renderSeq anti race), helpers module wrapText(ctx,text,maxWidth,maxLines?) avec « … » propre, truncateText, roundRect (fallback arcTo), drawCirclePhoto (save+clip+drawImage cover+liseré ambre), flowChips (chips flow-wrap claires/sombres), drawTimeline (pastille emerald + trait vertical), drawCanvasFooter. Troncature verticale par garde-fou ensure() qui dessine un « … » unique ; sections vides masquées (0 expérience/0 compétence).
- Modèle « Kin Classique » : bandeau emerald-900 à hauteur mesurée (photo cercle → bandeau plus haut), liseré ambre, nom 800 74px blanc, titre ambre clair, contacts blanc 80 %, corps colonne unique : titres de section majuscules emerald + filet dégradé, profil, expériences (rôle gras + période alignée droite grisé, entreprise emerald, détail 2 lignes max), formation, compétences en badges gris clair flow-wrap, langues sur une ligne « Français — Courant · … », référence. Footer centré « Créé avec KinShop — kinshop.cd » gris 40 %.
- Modèle « Kin Moderne » : sidebar gauche 38 % emerald-900 + liseré ambre : photo cercle, CONTACTS / COMPÉTENCES (chips translucides) / LANGUES / RÉFÉRENCE en blanc titrés ambre ; corps droit : nom emerald-900, titre ambre foncé, pitch, EXPÉRIENCE PROFESSIONNELLE + FORMATION en timeline (pastilles emerald reliées), footer droit « Créé avec KinShop ». Sidebar tronquée proprement sans jamais déborder.
- Exports (pattern status-studio) : PNG canvas.toBlob → download cv-{slug}.png (slugify du nom) + toast « CV téléchargé ! 🎉 » ; PDF import dynamique jspdf v4 → doc A4 portrait 210×297 mm addImage PNG plein format → cv-{slug}.pdf ; Partage navigator.canShare?.({files}) → navigator.share({files,title,text}), sinon fallback téléchargement + toast.info explicite, AbortError du share ignorée (annulation utilisateur).
- CTA conversion : après le PREMIER export réussi (les 3 voies marquent exported), carte framer-motion fade-in « 🛍️ Vous vendez aussi quelque chose ? » avec bouton ambre onCreateStore ; carte CTA permanente en bas de l'aperçu.
- État : brouillon localStorage kinshop_cv_draft — chargement au mount via async IIFE (aucun setState synchrone d'effet, pattern kinshop-app), sanitisation défensive complète (sanitizeCv : types, longueurs, niveaux de langue, template), sauvegarde useEffect après hydratation, try/catch quota.
- Qualité : mobile-first (touch targets ≥44 px : h-11/h-12, boutons icônes h-10), palette emerald/ambre uniquement, labels sur tous les inputs, aria-label sur boutons icônes/radios/canvas, Loader2 pendant rendu et busy par export.
- Corrections post-écriture : drawCanvasFooter opts rendu optionnel (tsc strict), directive eslint-disable img inutile retirée, classes Tailwind dupliquées nettoyées. bun run lint : 0 erreur / 0 warning ; tsc --noEmit : aucune erreur sur cv-express.tsx (les erreurs résiduelles sont préexistantes dans examples/, skills/, api/payments/webhook, lib/notifier.ts — hors périmètre) ; dev.log : aucune erreur de compilation.

Stage Summary:
- CV Express RDC est prêt à être branché dans le routeur : un import + une vue suffisent (<CvExpress onHome={...} onCreateStore={...} /> — aucun câblage backend, aucune route API).
- Un remploi congolais remplit 3 étapes (ou clique « Remplir un exemple »), voit son CV A4 rendu en haute résolution dans 2 modèles (Kin Classique bandeau emerald / Kin Moderne sidebar 38 % avec timeline), ajoute une photo optionnelle recadrée en cercle, puis exporte en PNG/PDF ou partage nativement vers WhatsApp — 100 % côté client, brouillon persisté localement (kinshop_cv_draft).
- Décisions clés : canvas 1240×1754 (A4 @150 dpi) avec bandeau/sidebar à hauteur calculée et troncature « … » garantissant zéro débordement quel que soit le contenu ; photo recadrée 320×320 JPEG avant localStorage (quota) ; garde-fou renderSeq contre les re-rendus concurrents ; réutilisation de slugify/formatPhoneDisplay de lib/kinshop ; CTA boutique ambre déclenché au premier export réussi (boucle d'acquisition CV → boutique).
- Artefact : src/components/kinshop/cv-express.tsx (types exportés CvData/CvExperience/CvFormation/CvLanguage/CvTemplate réutilisables). Worklog : seule cette section a été ajoutée.

---
Task ID: 6-a / 6-c / 6-c2 / 6-d (principal)
Agent: Z.ai Code (principal)
Task: Version V3 — CV Express RDC + KinFacture (factures pro avec QR de paiement)

Work Log:
- Périmètre V3 lu dans la roadmap README : générateur de CV Express RDC + KinFacture (factures pro QR paiement). Working tree d'entrée propre (artefact fileMode neutralisé via git config core.fileMode false).
- jspdf installé (bun add, import dynamique client). Prisma : nouvelle table Invoice (number unique KF-XXXXXX, client, items JSON [{desc,qty,unitFC}], totalFC/totalUSD, note, dueDate, status draft|sent|paid, paidAt) + relation Store.invoices. db:push OK.
- src/lib/kinfacture.ts : types InvoiceItem/InvoiceStatus/InvoiceData, makeInvoiceNumber, sumInvoiceItems (recalcul serveur), sanitizeInvoiceItems (plafonds 30 lignes/999 qté), buildPaymentQrText (QR texte universel marchand+montant+référence), buildInvoiceMessage (message WhatsApp avec lien public).
- src/app/api/invoices/route.ts : POST (totaux recalculés serveur depuis rateFC boutique), GET ?slug (dashboard) & ?number (lecture publique par numéro — le numéro sert de clé de partage), PATCH statut (paidAt auto), DELETE.
- src/components/kinshop/invoice-canvas.tsx : rendu canvas A4 1240×1754 (bandeau emerald+liseré ambre, émetteur/client, dates, tableau zébré, total FC/USD, bloc paiement encadré ambre avec QR généré via lib qrcode, note, footer viral « Facture générée par KinShop »), composant InvoiceCanvas (anti-race, spinner), helpers downloadInvoicePNG / exportInvoicePDF (jsPDF A4) / shareInvoiceCanvas. 2 fixes visuels après revue navigateur : décalage des dates (chevauchement badge statut puis nom client) → dy = headerH+222.
- dashboard.tsx : onglet « Factures » (liste cards avec badges statut, aperçu, WhatsApp, marquer payée, suppression), dialog création (client/tél/échéance, lignes dynamiques + « Importer du catalogue » avec conversion USD→FC automatique, total live FC/USD, note), dialog aperçu (canvas + WhatsApp/PDF/PNG/partage/marquer envoyée/payée). loadInvoices branché au mount. Lint : ternaires d'effet convertis en if/else.
- src/components/kinshop/facture-view.tsx : vue publique #/facture/{number} — header boutique, badge statut, canvas, section « Comment payer cette facture » (4 étapes, montant, numéro, référence), bandeau « déjà payée », boutons WhatsApp/PDF/PNG, empty state 404 propre, footer sticky « Propulsé par KinShop ».
- kinshop-app.tsx : vues "cv" + "invoice-public", parseHash #/cv et #/facture/{number}, sync hash, popstate, Landing +prop onCvExpress.
- landing.tsx : section « Outils gratuits (V3) » — carte CV Express (100 % gratuit → #/cv) + carte KinFacture (inclus boutique → dashboard si session, sinon création).
- scripts/seed-v3-demo.ts (idempotent) : facture KF-DEMO01 (ONG Lumière Kinshasa, 699 000 FC, statut sent) sur maman-ngo. Seeds démo relancés (la DB ne contenait que la boutique utilisateur « AENEWS » — préservée) : 5 boutiques, 25 produits, 28 commandes.
- Correctif bloquant trouvé en E2E : import { CvExpress } vs default export → corrigé en import par défaut. Correctif CV : le rendu canvas ne se déclenchait pas au montage de l'aperçu (AnimatePresence mode="wait" retarde le montage du canvas ~280 ms) → retry requestAnimationFrame dans l'effet ; chips de la sidebar Moderne dessinées en textAlign center hérité → isolation prevAlign dans flowChips. Redémarrage du dev server requis après db:push (Prisma Client stale → "Cannot read properties of undefined (reading 'create')", déjà vu en V2).
- Tests E2E Agent Browser complets : landing (section outils), CV (wizard 3 étapes, exemple Grace Mbala, aperçu 2 modèles vérifié pixel par pixel, chips alignées, brouillon persisté), KinFacture (création facture riz 5×79 800 + huile catalogue 25 650 FC, aperçu complet avec QR, marquer payée → toast + badges + canvas « PAYÉE + Payée le… », export PDF sans erreur), vue publique KF-DEMO01 (statut synchronisé, instructions paiement, 404 facture inexistante), mobile 375 px (facture, CV, boutique). Session à froid finale : zéro erreur page/console (le badge « 1 Issue » récurrent = artefact HMR connu). Facture démo remise à l'état « sent » après tests, KF-WSJE66G (draft) conservée comme 2e exemple.

Stage Summary:
- KinShop V3 est complète : deux nouveaux métiers sur la plateforme — CV Express RDC (outil gratuit d'acquisition virale : demandeurs d'emploi → vendeurs) et KinFacture (facturation pro B2B avec QR de paiement mobile money et lien de facture publique partageable WhatsApp).
- Décisions clés : rendu canvas A4 (pattern Statut Studio) plutôt que html2canvas (incompatible oklch/Tailwind 4), QR « texte universel » (marchand+montant+référence) — pas de standard QR mobile money en RDC, numéro de facture = clé d'accès publique (lien non listé), totaux facture TOUJOURS recalculés serveur, statuts draft/sent/paid avec paidAt.
- Artifacts : prisma/schema.prisma (Invoice), src/lib/kinfacture.ts, src/app/api/invoices/route.ts, src/components/kinshop/{invoice-canvas,facture-view,cv-express,dashboard,kinshop-app,landing}.tsx, scripts/seed-v3-demo.ts, README.md.
- Rappel sécurité récurrent : le PAT GitHub affiché en clair dans le chat doit être révoqué (GitHub → Settings → Developer settings).

---
Task ID: 7
Agent: Z.ai Code (principal)
Task: Version V4 — PWA installable (hors-ligne) + multi-images produits (le domaine personnalisé reporté à la V5)

Work Log:
- Périmètre confirmé par l'utilisateur : « PWA et le multi image, le domaine vient après ». État d'entrée : working tree propre, V2/V3 déjà poussées (9f4a158 sur origin/main).
- Prisma : Product +champ images (JSON string[], défaut "[]"), imageUrl conservé = image principale (rétrocompatibilité). db:push OK + redémarrage serveur (setsid pour survie shell).
- Assets générés par IA (z-ai CLI) : icône app 1024 (→ icon-192/512/180 + icon-maskable-512 via sharp, fond émeraude pleine zone) + 6 photos produits (sneakers ×2 angles, robe pagne ×2, smartphone/écouteurs, riz) optimisées JPEG 800 px (~25-145 Ko).
- src/lib/kinshop.ts : ProductData +images string[], MAX_PRODUCT_IMAGES=5, normalizeImages (JSON string | array | fallback imageUrl, plafond 400 Ko/image).
- src/lib/images.ts : compressImageFile (canvas, max 900 px, JPEG q0.72, data URL) + dataUrlSize.
- API : POST /api/products accepte images[] (imageUrl synchronisé = images[0]) ; NOUVEAU PATCH /api/products (galerie remplacée + name/price/stock/emoji/category, vérif storeId → 403) ; GET /api/stores normalise products.images (fallback imageUrl).
- product-images-editor.tsx : upload multiple compressé + ajout par lien (validation https?://|data:) + réordre ‹ › + badge « Principale » + compteur n/5 + retrait.
- dashboard.tsx : dialog « Nouveau produit » avec éditeur ; NOUVEAU bouton crayon par carte → dialog « Modifier le produit » (infos + galerie) → PATCH ; carte produit = image principale + badge nombre de photos (icône Images).
- store-view.tsx : cartes cliquables → fiche produit (dialog) : grande image animée (AnimatePresence), flèches ‹ ›, compteur 1/n, miniatures, prix FC/USD, « Ajouter au panier » ; badge photos sur cartes ; sr-only DialogTitle (fix a11y console).
- PWA : src/app/manifest.ts (standalone, icônes maskable, thème #059669) ; public/sw.js (network-first API+pages → cache → offline.html, cache-first /icons /images /status, skip HMR) ; public/offline.html FR stylé ; pwa.tsx (register SW, carte installation Android via beforeinstallprompt + carte iOS « Partager → Sur l'écran d'accueil », dismiss 7 j, toasts online/offline) ; layout.tsx (manifest, icons, appleWebApp, viewportFit cover) ; kinshop-app.tsx monte <PwaLayer> global (masqué sur la vue boutique pour ne pas gêner le panier).
- scripts/seed-v4-images.ts (idempotent) : galeries sur 6 produits démo (maman-ngo ×3 dont pagne 2 photos, diva-mode ×2 dont sandales 2 photos, kin-tech ×1). Corrigé au passage 3 erreurs TS préexistantes (paidAt dans les Pick<InvoiceData> d'invoice-canvas, body null webhook payments, statut "simulated" notifier.ts).
- Tests E2E Agent Browser : manifest 200 + SW actif ; galerie boutique (fiche 1/2 → flèches → miniatures → ajout panier + toast) ; dashboard (ajout produit 2 photos par lien, réordre, création → badge 2 ; édition → retrait 1 photo → PATCH → DB vérifiée imageUrl=images[0]) ; upload fichier réel → data URL compressée 73 Ko ; carte installation (event simulé) visible + dismiss ; OFFLINE : reload boutique en mode offline → contenu servi depuis cache SW ; mobile 375 px fiche produit parfaite (screenshot) ; console admin Produits OK ; produit test supprimé (DB propre, 6 produits avec galerie) ; console navigateur propre après fix DialogTitle ; tsc 0 erreur (hors exemples), lint 0 erreur ; dev.log sans erreur.

Stage Summary:
- KinShop V4 est complète : l'app est une PWA installable (Android/iOS) avec consultation hors-ligne des boutiques déjà visitées, et chaque produit supporte jusqu'à 5 photos (upload compressé 3G-friendly, galerie publique fluide, édition complète) — la boucle virale statut WhatsApp s'enrichit de visuels produits pro.
- Décisions clés : galerie stockée en JSON string (SQLite sans liste) avec imageUrl gardé = images[0] pour rétrocompat (Statut Studio, admin, seeds) ; compression client canvas (900 px/JPEG 0.72) avant stockage data URL ; SW network-first partout sauf images locales (cache-first) pour compat dev/HMR ; carte d'installation masquée dans la boutique publique (panier) ; domaine personnalisé explicitement repoussé V5 dans la roadmap README.
- Artifacts : prisma/schema.prisma (Product.images), src/lib/{kinshop,images}.ts, src/app/api/products/route.ts (PATCH), src/app/api/stores/route.ts, src/app/manifest.ts, public/{sw.js,offline.html,icons/*,images/products/*}, src/components/kinshop/{product-images-editor,pwa,dashboard,store-view,kinshop-app}.tsx, scripts/seed-v4-images.ts, README.md.
- Rappel sécurité récurrent : le PAT GitHub affiché en clair dans le chat doit être révoqué (GitHub → Settings → Developer settings).

---
Task ID: 6
Agent: Z.ai Code (principal)
Task: V6 — « Confiance & Croissance » : avis clients, codes promo, zones de livraison tarifées, suivi de commande public (le domaine personnalisé reste différé)

Work Log:
- Lecture du worklog + audit git (historique V1→V4 + fix PWA à jour, working tree propre) et cartographie complète du code (store-view, dashboard, routeur SPA, API, notifier, seeds) avant toute modification.
- Schéma Prisma V6 : nouveaux modèles Review (modération vendeur, orderId optionnel pour badge « Commande vérifiée »), Coupon (type percent|fixed, minTotalUSD, maxUses/uses, @@unique([storeId, code])), DeliveryZone (feeFC, active, @@unique([storeId, name])) + Order enrichi (couponCode, discountUSD, deliveryZone, deliveryFeeFC) ; `bun run db:push` OK.
- lib/kinshop.ts : types CouponData/DeliveryZoneData/ReviewData/ReviewStats/TrackOrderData, helpers couponLabel, couponCondition, computeCouponDiscount, computeOrderTotals (calcul centré FC, USD dérivé → zéro écart vitrine/serveur), buildOrderMessage enrichi (remise + livraison, params optionnels rétrocompatibles).
- 5 routes API : /api/coupons (CRUD vendeur, validations code A-Z0-9 3-16, %1-90, $0.10-1000, limite 30), /api/coupons/validate (public, vérifie active/maxUses/minTotal), /api/delivery-zones (GET public + CRUD, limite 25, 0 = gratuit), /api/reviews (GET public avec stats avg/count/dist, all=1 pour modération ; POST public avec liaison commande optionnelle + anti-doublon ; PATCH masquer/restaurer ; DELETE), /api/orders/track?ref (public, ne renvoie JAMAIS le numéro du client).
- POST /api/orders enrichi : zoneId → zone active de la boutique (nom + frais), couponCode revalidé côté serveur (jamais confiance au client), totaux via computeOrderTotals, incrément uses du coupon non-bloquant.
- Vitrine (store-view.tsx) : badge ⭐ moyenne (nb avis) dans l'en-tête, section « Avis clients » (3 derniers + dialog tous les avis + formulaire étoiles cliquables + réf optionnelle), checkout avec radios de zones tarifées (max-h-44 scrollable) quand le vendeur en a configuré, champ code promo (appliquer/retirer + avertissement panier minimum), récap Sous-total / Remise / Livraison / Total, bouton « 🔎 Suivre ma commande (REF) » sur les écrans succès et payé → #/suivi/REF.
- Dashboard vendeur : onglet « Croissance » (CRUD zones avec masquer/activer + CRUD codes promo avec Select %/fixe, panier min, max uses, compteur d'utilisations) et onglet « Avis » (moyenne, badges vérifié/masqué, restaurer/supprimer), chargement paresseux à l'ouverture d'onglet, TabsList avec overflow-x pour 9 onglets.
- Nouvelle vue publique TrackOrderView (#/suivi/REF) : champ réf prérempli + recherche, timeline Reçue → Confirmée → Livrée (état « étape actuelle », cas annulée), détail complet (articles, sous-total, remise, livraison, total, paiement, zone), lien WhatsApp vendeur prérempli ; intégrée au routeur (parseHash, sync hash, popstate).
- Seed scripts/seed-v6-demo.ts (idempotent) : 5 zones (Gombe 500, Ngaliema 800, Limete 1000, Masina 1500, centre-ville gratuit), 2 coupons (BIENVENUE10 −10%, NGOMA2 −$2 dès $15), 4 avis dont 1 vérifié.
- Correctifs en cours de route : import CvExpress redevenu défaut (erreur 500 SSR), double déclaration totalUSD renommée subtotalRaw, cache Turbopack purgé + dev server redémarré proprement.
- Vérification : lint 0 erreur ; tests API (validate coupon insensible à la casse, commande 10.50$ −1.05$ + 500 FC = 27 432 FC exact, track sans fuite de numéro, coupon inexistant rejeté, avis vérifié lié à une commande, doublon refusé) ; Agent Browser E2E complet (badge note vitrine, section avis, panier→checkout zones+promo+récap, commande KIN-I5C5NP, écran succès, page suivi avec timeline et détail exact, dashboard onglets Croissance/Avis avec ajout de zone Kintambo en direct et modération masquer/restaurer, publication d'avis public avec moyenne recalculée 4.7/6 avis) ; mobile 390px et footer vérifiés ; zéro erreur console.

Stage Summary:
- KinShop V6 livrée : la boucle de confiance (avis vérifiés, suivi de commande public) et la boucle commerciale (codes promo validés serveur, zones de livraison tarifées FC-first) sont opérationnelles et testées de bout en bout ; les totaux serveur et vitrine sont garantis identiques (calcul FC d'abord).
- Décisions clés : prix total centré FC (devise d'affichage RDC) avec USD dérivé ; validation coupon autoritaire côté serveur au POST (la prévalidation checkout n'est qu'indicative) ; avis modérables par le vendeur avec badge « Commande vérifiée » ancré sur une vraie commande ; page suivi publique sans données sensibles ; domaine personnalisé toujours différé (prochaine étape possible).
- Artifacts : prisma/schema.prisma, src/lib/kinshop.ts, src/app/api/{coupons,coupons/validate,delivery-zones,reviews,orders,orders/track}/route.ts, src/components/kinshop/{store-view,dashboard,kinshop-app,track-order}.tsx, scripts/seed-v6-demo.ts.
- Rappel sécurité récurrent : le PAT GitHub affiché en clair dans le chat doit être révoqué (GitHub → Settings → Developer settings).

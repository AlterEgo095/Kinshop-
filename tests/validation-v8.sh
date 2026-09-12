#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VALIDATION V8 — KinShop : parcours & sécurité post-refonte
# Parcours 1 (visiteur) · 2 (FREE) · 3 (PREMIUM) · 4 (IDOR) · 5 (contournement)
# Usage : bash tests/validation-v8.sh  (serveur dev requis sur :3000)
# ═══════════════════════════════════════════════════════════════
B="http://localhost:3000"
T=$(mktemp -d)
JAR_A="$T/a.txt"; JAR_B="$T/b.txt"; JAR_C="$T/c.txt"
PASS=0; FAIL=0
RUN=$RANDOM  # emails uniques par exécution (les comptes persistent en base)
ck() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 → $3"
  else FAIL=$((FAIL+1)); echo "  ❌ $1 → obtenu $3, attendu $2"; fi
}

# ═══ PARCOURS 1 — VISITEUR : rien sans identité ═══
echo ""
echo "═══ PARCOURS 1 — VISITEUR (aucune session) ═══"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/stores" -H "Content-Type: application/json" -d '{"name":"Pirate","ownerName":"X","whatsapp":"0899999999"}')
ck "Créer boutique sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/stores" -H "Content-Type: application/json" -d '{"slug":"maman-ngo","name":"Hack"}')
ck "Modifier boutique sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/products" -H "Content-Type: application/json" -d '{"storeId":"x","name":"Hack","priceUSD":1}')
ck "Ajouter produit sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/orders?slug=maman-ngo")
ck "Lire commandes sans compte (PII)" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/stats?slug=maman-ngo")
ck "Lire stats sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/notifications?slug=maman-ngo")
ck "Lire journal SMS sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/reviews?slug=maman-ngo&all=1")
ck "Avis masqués sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/invoices?slug=maman-ngo")
ck "Lire factures sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/coupons?slug=maman-ngo")
ck "Lire coupons sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/premium/simulate-confirm" -H "Content-Type: application/json" -d '{"slug":"maman-ngo"}')
ck "Premium gratuit sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/stores/domain?slug=maman-ngo")
ck "Jeton domaine sans compte" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$B/api/products?id=x")
ck "Supprimer produit inexistant sans compte (401/404 refusés)" "404" "$code"
# Public préservé :
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/stores?slug=maman-ngo")
ck "[public OK] Vitrine" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/reviews?slug=maman-ngo")
ck "[public OK] Avis publics" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/delivery-zones?slug=maman-ngo")
ck "[public OK] Zones livraison" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/platform")
ck "[public OK] Paramètres plateforme" 200 "$code"

# ═══ PARCOURS 2 — COMPTE FREE : quotas réels ═══
echo ""
echo "═══ PARCOURS 2 — INSCRIPTION + COMPTE FREE ═══"
code=$(curl -s -c $JAR_A -o "$T/regA.json" -w "%{http_code}" -X POST "$B/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Alice Kabila\",\"email\":\"alice-$RUN@test.cd\",\"password\":\"motdepasse8\",\"whatsapp\":\"0811111111\"}")
ck "Inscription Alice" 201 "$code"
code=$(curl -s -b $JAR_A -o "$T/meA.json" -w "%{http_code}" "$B/api/auth/me")
ck "GET /api/auth/me (session)" 200 "$code"
STORE_SLUG_A=$(grep -o '"slug":"[^"]*"' "$T/meA.json" | head -1 | cut -d'"' -f4)
echo "     → boutique d'Alice : $STORE_SLUG_A"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Alice 2\",\"email\":\"alice-$RUN@test.cd\",\"password\":\"motdepasse8\"}")
ck "Email déjà utilisé → 409" 409 "$code"
STORE_ID_A_RAW=$(curl -s -b $JAR_A -X POST "$B/api/stores" -H "Content-Type: application/json" \
  -d "{\"name\":\"Chez Alice\",\"ownerName\":\"Alice\",\"whatsapp\":\"0811111111\",\"slug\":\"chez-alice-$RANDOM\"}")
STORE_ID_A=$(echo "$STORE_ID_A_RAW" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
STORE_SLUG_A=$(echo "$STORE_ID_A_RAW" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "     → boutique d'Alice : $STORE_SLUG_A ($STORE_ID_A)"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/stores" -H "Content-Type: application/json" \
  -d '{"name":"Deuxième boutique","ownerName":"Alice","whatsapp":"0811111111"}')
ck "2e boutique interdite (1 compte = 1 boutique)" 409 "$code"
for i in $(seq 1 20); do
  curl -s -b $JAR_A -o /dev/null -X POST "$B/api/products" -H "Content-Type: application/json" \
    -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"Produit $i\",\"priceUSD\":$i}"
done
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"Produit 21\",\"priceUSD\":21}")
ck "Quota 20 produits (Free) → 21e refusé" 402 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"Galerie\",\"priceUSD\":5,\"images\":[\"a\",\"b\"]}")
ck "2 photos/produit refusées en Free" 402 "$code"
for c in AAA BBB CCC; do curl -s -b $JAR_A -o /dev/null -X POST "$B/api/coupons" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"code\":\"$c\",\"type\":\"percent\",\"value\":10}"; done
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/coupons" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"code\":\"DDD\",\"type\":\"percent\",\"value\":10}")
ck "Quota 3 coupons (Free) → 4e refusé" 402 "$code"
for i in 1 2 3 4 5; do curl -s -b $JAR_A -o /dev/null -X POST "$B/api/delivery-zones" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"name\":\"Zone $i\",\"feeFC\":500}"; done
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/delivery-zones" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"name\":\"Zone 6\",\"feeFC\":500}")
ck "Quota 5 zones (Free) → 6e refusé" 402 "$code"
DAYS=$(curl -s -b $JAR_A "$B/api/stats?slug=$STORE_SLUG_A&days=30" | grep -o '"day":"[^"]*"' | sort -u | wc -l)
ck "Stats Free plafonnées à 7 jours (demandé 30)" 7 "$DAYS"

# ═══ PARCOURS 3 — PREMIUM ═══
echo ""
echo "═══ PARCOURS 3 — PASSAGE PREMIUM (propriétaire) ═══"
code=$(curl -s -b $JAR_A -o /dev/null -w "%{http_code}" -X POST "$B/api/premium/simulate-confirm" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\"}")
ck "Premium activé par la propriétaire" 200 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"Produit 21 premium\",\"priceUSD\":21}")
ck "Post-premium : 21e produit accepté" 201 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST "$B/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"Galerie premium\",\"priceUSD\":5,\"images\":[\"a\",\"b\",\"c\",\"d\",\"e\"]}")
ck "Post-premium : 5 photos acceptées" 201 "$code"
DAYS=$(curl -s -b $JAR_A "$B/api/stats?slug=$STORE_SLUG_A&days=30" | grep -o '"day":"[^"]*"' | sort -u | wc -l)
ck "Post-premium : stats 30 jours acceptées" 30 "$DAYS"

# ═══ PARCOURS 4 — IDOR HORIZONTAL (A vs B) ═══
echo ""
echo "═══ PARCOURS 4 — IDOR : Bob tente d'accéder à la boutique d'Alice ═══"
curl -s -c $JAR_B -o /dev/null -X POST "$B/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Bob Mbala\",\"email\":\"bob-$RUN@test.cd\",\"password\":\"motdepasse8\",\"whatsapp\":\"0822222222\"}"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X POST "$B/api/stores" -H "Content-Type: application/json" \
  -d "{\"name\":\"Chez Bob\",\"ownerName\":\"Bob\",\"whatsapp\":\"0822222222\",\"slug\":\"chez-bob-$RANDOM\"}")
ck "Bob → crée sa propre boutique (légitime)" 201 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X PATCH "$B/api/stores" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"description\":\"PIRATÉ\"}")
ck "Bob → modifier boutique d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X POST "$B/api/products" -H "Content-Type: application/json" -d "{\"storeId\":\"$STORE_ID_A\",\"name\":\"FRAUDE\",\"priceUSD\":1}")
ck "Bob → injecter produit chez Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/orders?slug=$STORE_SLUG_A")
ck "Bob → lire les commandes d'Alice (PII)" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/stats?slug=$STORE_SLUG_A")
ck "Bob → stats d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/notifications?slug=$STORE_SLUG_A")
ck "Bob → journal SMS d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/coupons?slug=$STORE_SLUG_A")
ck "Bob → coupons d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/reviews?slug=$STORE_SLUG_A&all=1")
ck "Bob → avis masqués d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/invoices?slug=$STORE_SLUG_A")
ck "Bob → factures d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B "$B/api/stores/domain?slug=$STORE_SLUG_A")
ck "Bob → jeton de domaine d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X POST "$B/api/premium/simulate-confirm" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\"}")
ck "Bob → activer Premium pour Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X POST "$B/api/premium/checkout" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"email\":\"b@b.cd\",\"firstName\":\"B\",\"phone\":\"0822222222\"}")
ck "Bob → payer Premium pour Alice" 403 "$code"
PID_A=$(curl -s -b $JAR_A "$B/api/stores?slug=$STORE_SLUG_A" | grep -o '"id":"[^"]*"' | sed -n 2p | cut -d'"' -f4)
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X PATCH "$B/api/products" -H "Content-Type: application/json" -d "{\"id\":\"$PID_A\",\"storeId\":\"$STORE_ID_B\",\"priceUSD\":0.01,\"name\":\"PIRATÉ\"}")
ck "Bob → modifier produit d'Alice (storeId falsifié)" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X DELETE "$B/api/products?id=$PID_A")
ck "Bob → supprimer produit d'Alice" 403 "$code"
OID_A=$(curl -s -b $JAR_A "$B/api/orders?slug=$STORE_SLUG_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$OID_A" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X PATCH "$B/api/orders" -H "Content-Type: application/json" -d "{\"id\":\"$OID_A\",\"status\":\"cancelled\"}")
  ck "Bob → annuler commande d'Alice" 403 "$code"
else echo "  ⚠️ pas de commande chez Alice — créé une pour le test"; fi
# commande réelle passée en client public sur la boutique d'Alice (flux client préservé)
PRODUCT_A=$(curl -s "$B/api/stores?slug=$STORE_SLUG_A" | grep -o '"id":"[^"]*"' | sed -n 2p | cut -d'"' -f4)
ORDER=$(curl -s -X POST "$B/api/orders" -H "Content-Type: application/json" -d "{\"slug\":\"$STORE_SLUG_A\",\"customerName\":\"Client Test\",\"customerPhone\":\"0833333333\",\"items\":[{\"productId\":\"$PRODUCT_A\",\"qty\":1}],\"paymentMethod\":\"cash\"}")
ORDER_REF=$(echo "$ORDER" | grep -o '"ref":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "     → commande client créée (flux public préservé) : $ORDER_REF"
OID_A=$(curl -s -b $JAR_A "$B/api/orders?slug=$STORE_SLUG_A" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_B -X PATCH "$B/api/orders" -H "Content-Type: application/json" -d "{\"id\":\"$OID_A\",\"status\":\"cancelled\"}")
ck "Bob → annuler commande d'Alice" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X PATCH "$B/api/orders" -H "Content-Type: application/json" -d "{\"id\":\"$OID_A\",\"status\":\"confirmed\"}")
ck "Alice → confirmer sa propre commande" 200 "$code"

# ═══ PARCOURS 5 — CONTOURNEMENTS ═══
echo ""
echo "═══ PARCOURS 5 — CONTOURNEMENTS ═══"
code=$(curl -s -b $JAR_B -o /dev/null -w "%{http_code}" -X PATCH "$B/api/stores" -H "Content-Type: application/json" -d '{"slug":"maman-ngo","description":"PIRATÉ"}')
ck "Bob → modifier boutique orpheline (maman-ngo)" 403 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/stores")
ck "Admin sans PIN" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"alice-$RUN@test.cd\",\"password\":\"mauvais\"}")
ck "Login mot de passe incorrect" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"alice-$RUN@test.cd\",\"password\":\"motdepasse8\"}")
ck "Login correct" 200 "$code"
curl -s -c $JAR_C -o /dev/null -X POST "$B/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"alice-$RUN@test.cd\",\"password\":\"motdepasse8\"}"
code=$(curl -s -b $JAR_C -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/logout")
ck "Logout" 200 "$code"
code=$(curl -s -b $JAR_C -o /dev/null -w "%{http_code}" "$B/api/orders?slug=$STORE_SLUG_A")
ck "Session détruite après logout" 401 "$code"

echo ""
echo "══════════════════════════════════════════"
echo "RÉSULTAT : $PASS succès / $FAIL échecs"
echo "══════════════════════════════════════════"
rm -rf "$T"

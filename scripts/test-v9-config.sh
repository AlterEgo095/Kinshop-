#!/bin/bash
# KinShop V9 — Tests du centre de contrôle dynamique (configuration administrable)
# À exécuter avec le serveur de dev actif sur :3000
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
ko()   { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3 ($1)"; else ko "$3 — attendu $2, obtenu $1"; fi; }

ADMIN_PIN="${ADMIN_PIN:?Auth PIN retirée en prod — variable requise}"
AH=(-H "x-admin-pin: $ADMIN_PIN" -H "Content-Type: application/json")

echo "── 1. SÉCURITÉ : /api/admin/config sans/avec PIN ──"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/config")
check "$code" "401" "GET config sans PIN → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/admin/config" -H "Content-Type: application/json" -d '{"values":{"feature.reviews":false}}')
check "$code" "401" "PATCH config sans PIN → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/config" -H "x-admin-pin: mauvaisPIN")
check "$code" "401" "GET config mauvais PIN → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" "${AH[@]}" "$BASE/api/admin/config")
check "$code" "200" "GET config avec bon PIN → 200"

echo "── 2. VALIDATIONS SERVEUR (valeurs invalides refusées) ──"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"plan.free.maxProducts":0}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "quota maxProducts=0 (sous le min 1) → 400"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"plan.free.maxProducts":99999999}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "quota maxProducts=99999999 (au-dessus du max) → 400"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"cle.inconnue":1}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "clé inconnue → 400"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"general.supportWhatsapp":"0123456789012345678901234567890123456789"}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "chaîne trop longue (maxLength) → 400"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"feature.reviews":"oui"}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "booléen invalide → 400"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"business.maxStoresPerUser":"abc"}}' -o /dev/null -w "%{http_code}")
check "$code" "400" "nombre invalide → 400"

echo "── 3. MODIFICATION RÉELLE + PERSISTANCE + PROPAGATION PUBLIQUE ──"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"plan.free.maxProducts":5}}' -o /dev/null -w "%{http_code}")
check "$code" "200" "PATCH plan.free.maxProducts=5 → 200"
pub=$(curl -s "$BASE/api/platform" | python3 -c "import sys,json;print(json.load(sys.stdin)['config']['plan.free.maxProducts'])")
check "$pub" "5" "valeur exposée publiquement via /api/platform = 5"
val=$(curl -s "${AH[@]}" "$BASE/api/admin/config" | python3 -c "import sys,json;print(json.load(sys.stdin)['values']['plan.free.maxProducts'])")
check "$val" "5" "persistance en base (relecture admin) = 5"

echo "── 4. QUOTA APPLIQUÉ CÔTÉ SERVEUR (parcours FREE) ──"
EMAIL="quota-test-$RANDOM@kinshop.cd"
curl -s -c /tmp/v9_cookies.txt -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"test1234\",\"name\":\"Test Quota\",\"whatsapp\":\"0812345678\"}" > /dev/null
SLUG="quota-test-$RANDOM"
code=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/stores" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Quota\",\"ownerName\":\"Test\",\"whatsapp\":\"0812345678\",\"slug\":\"$SLUG\"}" -o /dev/null -w "%{http_code}")
check "$code" "201" "création boutique test → 201"
STORE_ID=$(curl -s "$BASE/api/stores?slug=$SLUG" | python3 -c "import sys,json;print(json.load(sys.stdin)['store']['id'])")
allgood=1
for i in 1 2 3 4 5; do
  c=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/products" -H "Content-Type: application/json" \
    -d "{\"storeId\":\"$STORE_ID\",\"name\":\"Produit $i\",\"priceUSD\":1}" -o /dev/null -w "%{http_code}")
  [ "$c" = "201" ] || { allgood=0; echo "    (produit $i → $c attendu 201)"; }
done
[ "$allgood" = "1" ] && ok "5 produits acceptés (quota admin = 5)" || ko "les 5 produits auraient dû passer"
code=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID\",\"name\":\"Produit 6\",\"priceUSD\":1}" -o /dev/null -w "%{http_code}")
check "$code" "402" "6e produit → 402 quota (quota admin pris en compte)"
msg6=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID\",\"name\":\"Produit 6\",\"priceUSD\":1}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
echo "$msg6" | grep -q "(5 produits)" && ok "message d'erreur cite le quota admin « (5 produits) »" || ko "message quota inattendu : $msg6"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"plan.free.maxProducts":20}}' -o /dev/null
code=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/products" -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID\",\"name\":\"Produit 6\",\"priceUSD\":1}" -o /dev/null -w "%{http_code}")
check "$code" "201" "après retour quota=20, le 6e produit passe → 201 (dynamique !)"

echo "── 5. FEATURE FLAG : coupons désactivés → 403 serveur ──"
code=$(curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"feature.coupons":false}}' -o /dev/null -w "%{http_code}")
check "$code" "200" "PATCH feature.coupons=false → 200"
code=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/coupons" -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"code\":\"TESTV9\",\"type\":\"percent\",\"value\":10}" -o /dev/null -w "%{http_code}")
check "$code" "403" "POST /api/coupons avec flag OFF → 403 (enforcement serveur)"
pub=$(curl -s "$BASE/api/platform" | python3 -c "import sys,json;print(json.load(sys.stdin)['config']['feature.coupons'])")
check "$pub" "False" "flag propagé publiquement (frontend masquera l'UI)"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"feature.coupons":true}}' -o /dev/null
code=$(curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/coupons" -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"code\":\"TESTV9\",\"type\":\"percent\",\"value\":10}" -o /dev/null -w "%{http_code}")
check "$code" "201" "flag réactivé → création coupon OK (201)"

echo "── 6. PAIEMENTS : opérateur désactivé → fallback serveur ──"
PID=$(curl -s "$BASE/api/stores?slug=$SLUG" | python3 -c "import sys,json;print(json.load(sys.stdin)['store']['products'][0]['id'])")
# V10 : commande = compte obligatoire → session vendeur requise (401 sinon, comportement voulu)
curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/orders" -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"customerName\":\"Client V9\",\"customerPhone\":\"0898765432\",\"paymentMethod\":\"orange\",\"items\":[{\"productId\":\"$PID\",\"qty\":1}]}" > /tmp/v9_o1.json
m1=$(python3 -c "import json;print(json.load(open('/tmp/v9_o1.json'))['order']['paymentMethod'])" 2>/dev/null)
check "$m1" "orange" "paiement orange actif → commande en orange"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"payment.orange.enabled":false}}' -o /dev/null
curl -s -b /tmp/v9_cookies.txt -X POST "$BASE/api/orders" -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"customerName\":\"Client V9\",\"customerPhone\":\"0898765432\",\"paymentMethod\":\"orange\",\"items\":[{\"productId\":\"$PID\",\"qty\":1}]}" > /tmp/v9_o2.json
m2=$(python3 -c "import json;print(json.load(open('/tmp/v9_o2.json'))['order']['paymentMethod'])" 2>/dev/null)
check "$m2" "mpesa" "orange désactivé → repli serveur sur mpesa (1er actif)"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"payment.orange.enabled":true}}' -o /dev/null

echo "── 7. CASCADE TAUX via config (hook métier) ──"
RATE_BEFORE=$(curl -s "$BASE/api/stores?slug=$SLUG" | python3 -c "import sys,json;print(json.load(sys.stdin)['store']['rateFC'])")
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"defaultRateFC":3210}}' -o /dev/null
RATE_AFTER=$(curl -s "$BASE/api/stores?slug=$SLUG" | python3 -c "import sys,json;print(json.load(sys.stdin)['store']['rateFC'])")
check "$RATE_AFTER" "3210" "boutique alignée suit le nouveau taux admin (cascade) : $RATE_BEFORE → $RATE_AFTER"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"defaultRateFC":2850}}' -o /dev/null

echo "── 8. CATALOGUE : catégories administrables + garde « Divers » ──"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"catalog.categories":"Sapas\nChaussures\nProduits laitiers"}}' -o /dev/null
CATS=$(curl -s "$BASE/api/platform" | python3 -c "import sys,json;print('|'.join(json.load(sys.stdin)['config']['catalog.categories']))")
check "$CATS" "Sapas|Chaussures|Produits laitiers|Divers" "nouvelles catégories exposées + « Divers » garanti"
curl -s -X PATCH "$BASE/api/admin/config" "${AH[@]}" -d '{"values":{"catalog.categories":"Mode & Vêtements\nÉlectronique\nAlimentation\nBeauté & Cosmétiques\nMaison & Cuisine\nDivers"}}' -o /dev/null

echo "── 9. NETTOYAGE ──"
curl -s -X DELETE "$BASE/api/admin/stores?id=$STORE_ID" "${AH[@]}" -o /dev/null
echo "  (boutique de test supprimée)"
echo ""
echo "════════ RÉSULTAT : $PASS réussis / $FAIL échoués ════════"

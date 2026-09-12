#!/usr/bin/env python3
# KinShop V10 — Tests E2E marketplace (scénarios A-H de la mission)
# Usage : python3 scripts/test-v10-marketplace.py [base_url]
import json, subprocess, sys, time, re, random, string

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
PIN = "243243"  # PIN dev local
JAR = {}  # cookie jars par "utilisateur"

results = {"pass": 0, "fail": 0, "details": []}

def check(name, cond, detail=""):
    if cond:
        results["pass"] += 1
        results["details"].append(f"✅ {name}")
    else:
        results["fail"] += 1
        results["details"].append(f"❌ {name} — {detail}")
        print(f"❌ {name} — {detail}")

def req(method, path, body=None, session=None, headers=None, raw=False):
    cmd = ["curl", "-s", "-X", method, f"{BASE}{path}", "-o", "/tmp/kin_test_out.json", "-w", "%{http_code}",
           "-H", "content-type: application/json"]
    hdrs = dict(headers or {})
    if session:
        tok = JAR.get(session)
        if tok:
            hdrs["Cookie"] = f"kinshop_session={tok}"
    for k, v in hdrs.items():
        cmd += ["-H", f"{k}: {v}"]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    subprocess.run(cmd, capture_output=True, text=True)
    out = open("/tmp/kin_test_out.json").read()
    # retrouver le code
    proc = subprocess.run(cmd[:-3] + ["-o", "/dev/null", "-w", "%{http_code}"], capture_output=True, text=True) if False else None
    code = 0
    # refaire proprement pour lire le status
    return code, out

# Implémentation plus simple : via urllib
import urllib.request, urllib.error, http.cookiejar

def api(method, path, body=None, session=None, headers=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("content-type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    if session and session in JAR:
        r.add_header("Cookie", f"kinshop_session={JAR[session]}")
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        setc = resp.headers.get("Set-Cookie")
        if setc and session:
            m = re.search(r"kinshop_session=([^;]+)", setc)
            if m:
                JAR[session] = m.group(1)
        return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}

def register(sess, name):
    email = f"v10_{sess}_{random.randint(1000,9999)}@test.cd"
    code, data = api("POST", "/api/auth/register", {"email": email, "password": "motdepasse8", "name": name}, session=sess)
    return code, data, email

def find_store():
    code, data = api("GET", "/api/platform")
    slug = data.get("config", {}).get("content.demoSlug", "maman-ngo")
    code, data = api("GET", f"/api/stores?slug={slug}")
    return data.get("store")

# ══════════ SCÉNARIO A — VISITEUR ══════════
print("\n═══ A — VISITEUR : consultation libre, commande refusée sans compte ═══")
store = find_store()
check("A1 boutique publique consultable", store is not None and store.get("slug"))
prod = (store.get("products") or [])[0] if store else None
check("A2 produits consultables", prod is not None)

code, data = api("POST", "/api/orders", {"slug": store["slug"], "customerName": "Ano", "customerPhone": "0812345678", "items": [{"productId": prod["id"], "qty": 1}], "paymentMethod": "cash"})
check("A3 commande anonyme → 401 (compte obligatoire)", code == 401, f"got {code} {data}")

code, data = api("GET", "/api/orders/mine")
check("A4 mes commandes anonyme → 401", code == 401, f"got {code}")

code, data = api("GET", "/api/home")
check("A5 home marketplace public", code == 200)

code, data = api("POST", "/api/reports", {"targetType": "store", "targetId": "x", "reason": "arnaque", "details": "test anonyme 123"})
check("A6 signalement anonyme → 401", code == 401, f"got {code}")

# ══════════ SCÉNARIO B — CLIENT : compte → commande → paiement → facture → suivi ══════════
print("\n═══ B — CLIENT : achat complet avec compte ═══")
code, creg, cemail = register("client", "Cliente Test V10")
check("B1 inscription client", code == 200 or code == 201, f"got {code} {creg}")

code, data = api("POST", "/api/orders", {
    "slug": store["slug"], "customerName": "Cliente Test V10", "customerPhone": "0822334455",
    "items": [{"productId": prod["id"], "qty": 2}], "paymentMethod": "cash",
    "zone": "Gombe", "deliveryAddress": "av. du test 12", "note": "test B"
}, session="client")
check("B2 commande créée avec compte (201)", code == 201, f"got {code} {data}")
order = data.get("order", {})
check("B3 référence séquentielle CMD-", bool(re.match(r"^CMD-\d{4}-\d{6}$", order.get("ref", ""))), order.get("ref"))
check("B4 paymentStatus espèces = cash_pending", order.get("paymentStatus") == "cash_pending", order.get("paymentStatus"))
check("B5 prix recalculé serveur = 2×prix produit", abs(order.get("totalUSD", 0) - 2 * prod["priceUSD"]) < 0.01, f"{order.get('totalUSD')} vs {2*prod['priceUSD']}")
oref = order.get("ref")
oid = order.get("id")

# Manipulation de prix : le serveur ignore le prix envoyé
code, data = api("POST", "/api/orders", {
    "slug": store["slug"], "customerName": "Cliente Test V10", "customerPhone": "0822334455",
    "items": [{"productId": prod["id"], "qty": 1, "priceUSD": 0.01}], "paymentMethod": "cash"
}, session="client")
check("B6 PRIX manipulé ignoré (recalcul serveur)", code == 201 and abs(data["order"]["totalUSD"] - prod["priceUSD"]) < 0.01, f"{code} {data.get('order', {}).get('totalUSD')}")
order2id = data.get("order", {}).get("id")

code, data = api("GET", "/api/orders/mine", session="client")
check("B7 historique mes commandes", code == 200 and data.get("orders") and len(data["orders"]) >= 2, f"{code} n={len(data.get('orders', []))}")
mine = data.get("orders", [])[0]
check("B8 déduplication statuts dans l'historique", "deliveryStatus" in mine, mine.get("deliveryStatus"))

# suivi public avec frise
code, data = api("GET", f"/api/orders/track?ref={oref}")
check("B9 suivi public 200", code == 200)
check("B10 frise d'événements publique (created)", any(e.get("type") == "created" for e in data.get("events", [])), f"n={len(data.get('events', []))}")

# ══════════ SCÉNARIO C — VENDEUR : boutique → catégorie → produit → workflow → stats ══════════
print("\n═══ C — VENDEUR : gestion complète + workflow ═══")
code, vreg, vemail = register("vendor", "Vendeur Test V10")
check("C1 inscription vendeur", code in (200, 201), f"got {code}")

# créer une boutique via wizard API ? On teste avec la boutique démo non possédée → 403 attendu
code, data = api("PATCH", "/api/store-categories", {"id": "fake", "name": "X"}, session="vendor")
check("C2 catégorie : ressource inexistante → 404 (pas d'échappée de données)", code == 404, f"got {code}")

# Le vendeur doit avoir SA boutique — créer via l'API interne du wizard
code, data = api("POST", "/api/stores", {"name": "V10 Vendor Shop", "ownerName": "Vendeur Test V10", "whatsapp": "0811112223", "city": "Kinshasa", "colorTheme": "emerald", "logoEmoji": "🛍️"}, session="vendor")
if code not in (200, 201):
    # le wizard passe peut-être par un autre schéma — récupérer via auth/me
    code, me = api("GET", "/api/auth/me", session="vendor")
    vstore = me.get("store")
else:
    vstore = data.get("store")
check("C3 boutique vendeur liée au compte", vstore is not None, f"{code}")
if not vstore:
    print("Impossible de continuer le scénario C sans boutique → abort C/D")
else:
    vslug = vstore["slug"]
    code, data = api("GET", f"/api/stores?slug={vslug}", session="vendor")
    vstoreFull = data.get("store", {})
    vprod = (vstoreFull.get("products") or [])

    # catégories boutique
    code, data = api("POST", "/api/store-categories", {"slug": vslug, "name": "Smartphones"}, session="vendor")
    check("C4 catégorie boutique créée", code == 201, f"{code} {data}")
    cat_id = data.get("category", {}).get("id")
    code, data = api("POST", "/api/store-categories", {"slug": vslug, "name": "Smartphones"}, session="vendor")
    check("C5 doublon refusé (409)", code == 409, f"got {code}")
    code, data = api("POST", "/api/store-categories", {"slug": "maman-ngo", "name": "Hack"}, session="vendor")
    check("C6 IDOR : catégorie chez autrui → 403", code == 403, f"got {code}")

    # produit dans la catégorie
    code, data = api("POST", "/api/products", {"storeId": vstore["id"], "name": "Test Phone V10", "priceUSD": 25, "category": "Téléphones", "storeCategoryId": cat_id}, session="vendor")
    check("C7 produit lié à la catégorie", code == 201 and data.get("product", {}).get("storeCategoryId") == cat_id, f"{code}")
    vpid = data.get("product", {}).get("id")

    # catégorie d'une AUTRE boutique refusée sur produit
    code, data = api("GET", "/api/categories")
    gid = data["global"][0]["id"]
    check("C8 catégories globales exposées", code == 200 and len(data.get("global", [])) >= 12, f"n={len(data.get('global', []))}")

    # ── workflow commande sur la boutique du vendeur (le client achète chez le vendeur)
    code, data = api("POST", "/api/orders", {
        "slug": vslug, "customerName": "Cliente Test V10", "customerPhone": "0822334455",
        "items": [{"productId": vpid, "qty": 1}], "paymentMethod": "cash", "zone": "Limete", "deliveryAddress": "test 1"
    }, session="client")
    check("C9 commande client chez vendeur (201)", code == 201, f"{code} {data}")
    vorder = data["order"]
    void_id = vorder["id"]

    # transitions invalides refusées
    code, data = api("PATCH", "/api/orders", {"id": void_id, "status": "delivered"}, session="vendor")
    check("C10 transition interdite new→delivered (400)", code == 400, f"got {code}")
    code, data = api("PATCH", "/api/orders", {"id": void_id, "status": "refunded"}, session="vendor")
    check("C11 transition interdite new→refunded (400)", code == 400, f"got {code}")

    # IDOR : le CLIENT ne peut pas changer le statut
    code, data = api("PATCH", "/api/orders", {"id": void_id, "status": "confirmed"}, session="client")
    check("C12 IDOR : client modifie statut → 403", code == 403, f"got {code}")

    # workflow complet du vendeur
    flow = ["confirmed", "processing", "ready"]
    ok = True
    for st in flow:
        code, data = api("PATCH", "/api/orders", {"id": void_id, "status": st}, session="vendor")
        ok = ok and code == 200
    check("C13 workflow confirm→processing→ready", ok)

    # encaissement espèces trop tôt refusé ? (statut ready → autorisé à ce stade)
    code, data = api("PATCH", "/api/orders", {"id": void_id, "confirmCash": True}, session="vendor")
    check("C14 encaissement espèces (owner) accepté au stade prêt", code == 200 and data["order"]["paymentStatus"] == "paid", f"{code} {data.get('order', {}).get('paymentStatus')}")

    # livraison
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "assigned"}, session="vendor")
    check("C15 livraison assignée", code == 200, f"{code} {data}")
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "failed"}, session="vendor")
    check("C16 échec SANS motif → 400 (motif obligatoire)", code == 400, f"got {code}")
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "failed", "reason": "client_absent", "reasonNote": "2 appels sans réponse"}, session="vendor")
    check("C17 échec avec motif OK", code == 200 and data["order"]["deliveryStatus"] == "failed", f"{code}")
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "assigned"}, session="vendor")
    check("C18 relance tracée (attempts=1)", code == 200 and data["order"]["deliveryAttempts"] == 1, f"{code} attempts={data.get('order', {}).get('deliveryAttempts')}")
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "in_transit"}, session="vendor")
    check("C19 in_transit", code == 200)
    code, data = api("PATCH", "/api/orders/delivery", {"id": void_id, "deliveryStatus": "delivered"}, session="vendor")
    check("C20 livraison délivrée → commande livrée", code == 200 and data["order"]["status"] == "delivered", data.get("order", {}).get("status"))

    # événements
    code, data = api("GET", f"/api/orders/events?orderId={void_id}", session="vendor")
    types = [e["type"] for e in data.get("events", [])]
    check("C21 historique immuable complet (delivery_failed + retry + status)", "delivery_failed" in types and "delivery_retry" in types and "payment_confirmed" in types, str(types))
    code, data = api("GET", f"/api/orders/events?orderId={void_id}", session="client")
    check("C22 événements : client d'une autre boutique → 403", code == 403, f"got {code}")

    # facture de commande
    code, data = api("POST", "/api/orders/invoice", {"orderId": void_id}, session="vendor")
    check("C23 facture INV- générée", code == 201 and data.get("invoice", {}).get("number", "").startswith("INV-"), f"{code} {data.get('invoice', {}).get('number')}")
    invnum = data.get("invoice", {}).get("number")
    check("C24 hash d'intégrité présent", bool(data.get("invoice", {}).get("hash")))
    code, data = api("POST", "/api/orders/invoice", {"orderId": void_id}, session="vendor")
    check("C25 double facture active → 409", code == 409, f"got {code}")
    code, data = api("GET", f"/api/invoices/verify?number={invnum}")
    check("C26 vérification publique QR : valide", code == 200 and data.get("valid") is True, f"{code} {data}")

    # ══════════ SCÉNARIO D — LIVRAISON ÉCHOUÉE → RETOUR (2e commande) ══════════
    print("\n═══ D — LIVRAISON ÉCHOUÉE → RETOUR → REMBOURSEMENT ═══")
    code, data = api("POST", "/api/orders", {
        "slug": vslug, "customerName": "Cliente Test V10", "customerPhone": "0822334455",
        "items": [{"productId": vpid, "qty": 1}], "paymentMethod": "mpesa"
    }, session="client")
    dorder = data["order"]
    # paiement mobile money simulé
    code, data = api("POST", "/api/payments/simulate-confirm", {"ref": dorder["ref"]})
    check("D1 paiement mobile money confirmé", code == 200, f"{code}")
    code, data = api("GET", f"/api/orders/track?ref={dorder['ref']}")
    # workflow vendeur
    for st in ["confirmed", "ready", ]:
        api("PATCH", "/api/orders", {"id": dorder["id"], "status": st}, session="vendor")
    api("PATCH", "/api/orders/delivery", {"id": dorder["id"], "deliveryStatus": "assigned"}, session="vendor")
    api("PATCH", "/api/orders/delivery", {"id": dorder["id"], "deliveryStatus": "in_transit"}, session="vendor")
    api("PATCH", "/api/orders/delivery", {"id": dorder["id"], "deliveryStatus": "out_for_delivery"}, session="vendor")
    code, data = api("PATCH", "/api/orders/delivery", {"id": dorder["id"], "deliveryStatus": "failed", "reason": "refus_client"}, session="vendor")
    check("D2 échec motif refus_client", code == 200, f"{code}")
    code, data = api("PATCH", "/api/orders/delivery", {"id": dorder["id"], "deliveryStatus": "returned"}, session="vendor")
    check("D3 retour au vendeur", code == 200 and data["order"]["deliveryStatus"] == "returned", f"{code}")
    check("D4 commande passée en returned", data["order"]["status"] == "returned", data["order"]["status"])

    # remboursement : client demande
    code, data = api("POST", "/api/refunds", {"orderId": dorder["id"], "reason": "Colis retourné, je veux mon argent"}, session="client")
    check("D5 demande de remboursement client (201)", code == 201, f"{code} {data}")
    rid = data.get("refund", {}).get("id")

# ══════════ SCÉNARIO E — SÉCURITÉ / IDOR ══════════
print("\n═══ E — SÉCURITÉ : IDOR, permissions, contournements ═══")
void_id = locals().get("void_id")
oid = locals().get("oid")
prod = locals().get("prod")
vpid = locals().get("vpid")
vslug = locals().get("vslug")
store = locals().get("store")
if store and prod and void_id and vpid and vslug:
    code, data = api("PATCH", "/api/orders", {"id": "n'importe-quoi", "status": "confirmed"}, session="client")
    check("E1 id inexistant → 404", code == 404, f"got {code}")
    code, data = api("PATCH", "/api/orders", {"id": oid, "status": "confirmed"}, session="vendor")
    check("E2 vendeur ≠ boutique de la commande → 403", code == 403, f"got {code}")
    # transition livrée → nouvelle interdite
    code, data = api("PATCH", "/api/orders", {"id": void_id, "status": "new"}, session="vendor")
    check("E3 delivered→new interdit", code == 400, f"got {code}")
    # client tente d'encaisser
    code, data = api("POST", "/api/orders", {"slug": vslug, "customerName": "X", "customerPhone": "0822334455", "items": [{"productId": vpid, "qty": 1}], "paymentMethod": "cash"}, session="client")
    c2id = data["order"]["id"]
    code, data = api("PATCH", "/api/orders", {"id": c2id, "confirmCash": True}, session="client")
    check("E4 client tente encaissement espèces → 403", code == 403, f"got {code}")
    # admin PIN invalide
    code, data = api("GET", "/api/admin/users", headers={"x-admin-pin": "000000"})
    check("E5 admin mauvais PIN → 401", code == 401, f"got {code}")

# ══════════ SCÉNARIO F — QUOTAS FREE ══════════
print("\n═══ F — QUOTAS (catégories boutique) ═══")
# créer 10 catégories free (quota défaut 10) → 11e refusée
if vstore:
    made = 0
    blocked = False
    for i in range(12):
        code, data = api("POST", "/api/store-categories", {"slug": vslug, "name": f"Cat libre {i}"}, session="vendor")
        if code == 201:
            made += 1
        elif code == 402:
            blocked = True
            break
    check("F1 quota catégories FREE appliqué côté serveur", blocked, f"créées={made}, blocked={blocked}")

# ══════════ SCÉNARIO G — BOOST / PROMOTION ══════════
print("\n═══ G — PROMOTION (Boost ≠ Premium) ═══")
code, data = api("POST", "/api/boost", {"slug": vslug, "days": 7}, session="vendor")
check("G1 campagne créée (paiement en attente)", code == 201 and data["campaign"]["status"] == "pending_payment", f"{code}")
bid = data.get("campaign", {}).get("id")
code, data = api("POST", "/api/boost", {"slug": vslug, "days": 999}, session="vendor")
check("G2 durée invalide → 400", code == 400, f"got {code}")
code, data = api("POST", "/api/boost", {"slug": "maman-ngo", "days": 7}, session="vendor")
check("G3 IDOR boost boutique autrui → 403", code == 403, f"got {code}")
code, data = api("PATCH", "/api/boost", {"id": bid}, session="vendor")
check("G4 paiement campagne → active", code == 200 and data["campaign"]["status"] == "active", f"{code}")
code, data = api("GET", "/api/home")
check("G5 home : boutique en section sponsorisée", any(s["slug"] == vslug for s in data.get("sponsored", [])), str([s.get("slug") for s in data.get("sponsored", [])]))
code, data = api("POST", "/api/boost/click", {"id": bid})
check("G6 clic tracké", code == 200)
code, data = api("GET", "/api/boost", headers={})  # sans session → 401
# admin clore
code, data = api("PATCH", "/api/admin/boost", {"id": bid, "action": "end"}, headers={"x-admin-pin": PIN})
check("G7 admin clôture la campagne", code == 200 and data["campaign"]["status"] == "ended", f"{code}")
code, data = api("GET", "/api/home")
check("G8 fin de campagne → disparition automatique de l'accueil", all(s["slug"] != vslug for s in data.get("sponsored", [])))

# ══════════ SCÉNARIO H — SUPER ADMIN ══════════
print("\n═══ H — SUPER ADMIN : vision globale + gouvernance ═══")
H = {"x-admin-pin": PIN}
code, data = api("GET", "/api/admin/users", headers=H)
check("H1 vue utilisateurs globale", code == 200 and data.get("stats"), f"{code}")
check("H2 pas de hash de mot de passe exposé", users_clean := all("passwordHash" not in json.dumps(u) for u in data.get("users", [])))
code, data = api("GET", "/api/admin/overview", headers=H)
check("H3 overview étendu (users/reports/boost/refunds)", code == 200 and "usersTotal" in data and "reportsOpen" in data and "boostsActive" in data, f"{code}")
code, data = api("GET", "/api/admin/orders", headers=H)
check("H4 commandes globales visibles", code == 200 and data.get("orders"))
code, data = api("GET", "/api/admin/refunds", headers=H)
check("H5 remboursements visibles", code == 200 and isinstance(data.get("refunds"), list))
# approuver puis exécuter le remboursement D
if results and locals().get("rid"):
    code, data = api("PATCH", "/api/admin/refunds", {"id": rid, "action": "approve"}, headers=H)
    check("H6 admin approuve le remboursement", code == 200 and data["refund"]["status"] == "approved", f"{code}")
    code, data = api("PATCH", "/api/admin/refunds", {"id": rid, "action": "execute", "reference": "MP-TEST-001"}, headers=H)
    check("H7 admin exécute → commande refunded", code == 200 and data["refund"]["status"] == "executed", f"{code}")
# vérification boutique
if vstore:
    code, data = api("PATCH", "/api/admin/stores", {"id": vstore["id"], "action": "verify", "verificationStatus": "verified"}, headers=H)
    check("H8 vérification boutique (admin)", code == 200 and data["store"]["verificationStatus"] == "verified", f"{code} {data}")
    code, data = api("PATCH", "/api/admin/stores", {"id": vstore["id"], "action": "verify", "verificationStatus": "hacked"}, headers=H)
    check("H9 verificationStatus invalide → 400", code == 400, f"got {code}")
# signalement E2E : le client signale la boutique
code, data = api("POST", "/api/reports", {"targetType": "store", "targetId": vstore["id"], "reason": "comportement", "details": "test de signalement automatisé V10"}, session="client")
check("H10 signalement client créé", code == 201, f"{code} {data}")
code, data = api("POST", "/api/reports", {"targetType": "store", "targetId": vstore["id"], "reason": "comportement", "details": "doublon refusé test"}, session="client")
check("H11 doublon de signalement → 409", code == 409, f"got {code}")
code, data = api("GET", "/api/admin/reports", headers=H)
check("H12 admin voit le signalement", code == 200 and any(r["targetId"] == vstore["id"] for r in data.get("reports", [])))
# journal global
code, data = api("GET", "/api/admin/logs?type=audit&limit=50", headers=H)
actions = [l["action"] for l in data.get("logs", [])]
check("H13 journal : événements order.created traçables", "order.created" in actions, str(actions[:8]))
check("H14 journal : refund.executed tracé", "refund.executed" in actions)
# suppression commandes réglées interdite
code, data = api("DELETE", f"/api/admin/orders?id={void_id}&reason=test+suppression", headers=H)
check("H15 DELETE commande payée → 409 (trace protégée)", code == 409, f"got {code}")

# ══════════ RÉSULTATS ══════════
print(f"\n{'='*60}\nRÉSULTATS : {results['pass']} ✅ / {results['fail']} ❌\n{'='*60}")
for d in results["details"]:
    if d.startswith("❌"):
        print(d)
sys.exit(1 if results["fail"] else 0)

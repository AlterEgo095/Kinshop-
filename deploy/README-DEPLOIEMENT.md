# 🚀 Déploiement KinShop sur kinshop.aenews.digital

Guide complet pour mettre la plateforme en production sur ton serveur
(**95.111.226.63**) avec le domaine **kinshop.aenews.digital**.

> ✅ DNS déjà vérifié : `kinshop.aenews.digital → 95.111.226.63` (A, « DNS uniquement »,
> visible publiquement, TTL 300 s). Caddy obtiendra le certificat HTTPS automatiquement.

---

## 1. Prérequis sur le VPS (Ubuntu/Debian)

```bash
# Mises à jour + outils de base
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git

# Bun (runtime JS utilisé par KinShop)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Caddy (serveur web + HTTPS automatique)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Ouvrir les ports web :

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 22/tcp
sudo ufw enable   # si le pare-feu est inactif
```

## 2. Récupérer le code

```bash
sudo mkdir -p /opt/kinshop && sudo chown $USER /opt/kinshop
git clone https://github.com/AlterEgo095/Kinshop-.git /opt/kinshop
cd /opt/kinshop
```

## 3. Premier déploiement (automatisé)

```bash
bash deploy/deploy.sh
```

Le script :
1. crée le fichier `.env` (PIN admin, base de données, domaine plateforme) ;
2. installe les dépendances et génère le client Prisma ;
3. crée/synchronise la base SQLite (`db/custom.db`) ;
4. build l'application (sortie standalone) ;
5. installe et démarre le service **systemd** `kinshop` (redémarrage auto en cas de crash/reboot).

Vérifier :

```bash
curl -I http://127.0.0.1:3000        # → HTTP/1.1 200 OK
```

## 4. Activer HTTPS avec Caddy

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Patienter ~30 s puis tester : **https://kinshop.aenews.digital** 🎉

> 💡 Le Caddyfile active le **TLS à la demande** : chaque domaine de boutique vérifié
> reçoit son certificat automatiquement, sans toucher au serveur.

## 5. Console d'administration

- URL : `https://kinshop.aenews.digital/#/admin`
- PIN : celui défini dans `.env` (`ADMIN_PIN` — par défaut `243243`, **change-le !**)

```bash
# Changer le PIN :
nano /opt/kinshop/.env       # modifier ADMIN_PIN
sudo systemctl restart kinshop
```

## 6. Domaines personnalisés des boutiques (fonctionnalité Premium)

Chaque boutique **Premium** peut relier son propre domaine depuis
**Tableau de bord → onglet « Domaine »** :

1. Le vendeur saisit son domaine (ex. `maboutique.cd`) → KinShop génère un **jeton de vérification** ;
2. Le vendeur ajoute chez son registrar :
   - `TXT  _kinshop-verify.maboutique.cd  →  kinshop-verify=<jeton>` (propriété),
   - `A    @  →  95.111.226.63` ou `CNAME www → kinshop.aenews.digital` (routage) ;
3. Le vendeur clique **« Vérifier maintenant »** → KinShop contrôle le TXT en DNS-over-HTTPS ;
4. Une fois vérifié : la vitrine s'affiche sur `https://maboutique.cd` avec HTTPS automatique,
   et le domaine apparaît dans la **console admin** (validation manuelle possible, déliaison possible).

Côté serveur, **rien à configurer** : Caddy demande l'autorisation à
`/api/domain-check` avant d'émettre chaque certificat.

## 7. Mises à jour

```bash
cd /opt/kinshop
bash deploy/deploy.sh --update     # git pull + rebuild + restart
```

## 8. Dépannage

| Symptôme | Commande / action |
|---|---|
| Le site ne répond pas | `sudo systemctl status kinshop` · `tail -50 /var/log/kinshop.err.log` |
| Erreur 502 (Caddy ↔ app) | L'app est-elle lancée ? `curl -I http://127.0.0.1:3000` |
| Pas de HTTPS | `sudo journalctl -u caddy --since "10 min ago"` — vérifier les ports 80/443 |
| Certificat d'un domaine vendeur absent | Le domaine doit être **vérifié** (TXT) et pointer (A/CNAME) vers le serveur |
| Base de données | `sqlite3 /opt/kinshop/db/custom.db` (sauvegarde : `cp db/custom.db db/backup-$(date +%F).db`) |

## 9. Sauvegardes recommandées (cron)

```bash
crontab -e
# Sauvegarde quotidienne de la base à 3 h du matin :
0 3 * * * cp /opt/kinshop/db/custom.db /opt/kinshop/db/backup-$(date +\%F).db
```

---

🇨🇩 **KinShop** — ta boutique WhatsApp en 5 minutes. Propulsé par KinShop.

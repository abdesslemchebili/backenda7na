# Checklist go-live — Nour Academy

Guide de mise en production pour **backenda7na** (API) et **lingua-learn-hub** (frontend).

---

## 1. Variables d'environnement — Backend

Copier `.env.example` vers `.env` et renseigner :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NODE_ENV` | Oui | `production` |
| `PORT` | Oui | Port d'écoute (ex. `5000`) |
| `MONGODB_URI` | Oui | URI MongoDB Atlas ou serveur dédié |
| `JWT_SECRET` | Oui | Chaîne aléatoire ≥ 32 caractères (**rotée à chaque déploiement sensible**) |
| `JWT_EXPIRES_IN` | Oui | Ex. `1h` |
| `FRONTEND_URL` | Oui | URL publique du frontend (CORS) |
| `API_URL` | Oui | URL publique de l'API |
| `APP_URL` | Oui | Même URL que le frontend (liens email) |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_FROM` | Recommandé | SMTP pour vérification email, reset mot de passe, notifications |
| `BCRYPT_ROUNDS` | Non | Défaut `12` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | Non | Limitation globale API |
| `AUTH_RATE_LIMIT_MAX` | Non | Limitation routes `/api/auth/*` |
| `APP_VERSION` | Non | Affiché dans `/api/health` |
| `JITSI_DOMAIN` | Optionnel | Domaine Jitsi self-hosted (défaut : meet.jit.si côté frontend) |

**Ne jamais** committer `.env` ni exposer `JWT_SECRET` dans le frontend.

---

## 2. Variables d'environnement — Frontend

Copier `.env.example` vers `.env` :

| Variable | Production | Description |
|----------|------------|-------------|
| `VITE_API_BASE_URL` | Oui | URL complète de l'API (ex. `https://api.nouracademy.ma`) |

En développement, Vite proxifie `/api` vers `http://localhost:5000`.

---

## 2b. Déploiement Render (Web Service)

### Erreurs fréquentes

| Log Render | Cause | Correction |
|------------|-------|------------|
| `Running 'npm run dev'` + nodemon | Mauvaise **Start Command** | Mettre `npm start` (pas `npm run dev`) |
| `ECONNREFUSED 127.0.0.1:27017` | Pas de base MongoDB distante | Définir `MONGODB_URI` (MongoDB Atlas) |
| `No open ports detected` | L'app crash avant d'écouter | Corriger MongoDB + Start Command ci-dessus |

### Paramètres du service (dashboard Render)

| Champ | Valeur |
|-------|--------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Health Check Path** | `/api/health` |

Render injecte automatiquement `PORT` — ne pas le fixer manuellement sauf besoin particulier.

### Variables d'environnement (obligatoires sur Render)

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/language_school
JWT_SECRET=<chaîne aléatoire ≥ 32 caractères>
FRONTEND_URL=https://votre-frontend.vercel.app
APP_URL=https://votre-frontend.vercel.app
API_URL=https://votre-service.onrender.com
```

### MongoDB Atlas (gratuit)

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → cluster M0 free.
2. **Database Access** : utilisateur + mot de passe.
3. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`) pour que Render puisse se connecter.
4. **Connect** → driver Node → copier l'URI et remplacer `<password>`.

### Après déploiement

```bash
curl https://VOTRE-SERVICE.onrender.com/api/health
# Attendu : {"status":"ok",...}
```

Le tier gratuit Render met le service en veille ; le premier appel peut prendre ~30 s.

Un fichier `render.yaml` à la racine du repo documente la même config (Blueprint ou référence manuelle).

---

## 3. Santé & monitoring

- **Health check** : `GET /api/health`
  - `200` + `"status":"ok"` si MongoDB connecté
  - `503` + `"status":"degraded"` si DB indisponible
- Configurer un probe (Kubernetes, Railway, Render, etc.) sur cette route.
- Les erreurs **5xx** sont loguées en JSON structuré (method, path, userId, message).

---

## 4. Backup MongoDB

### Atlas (recommandé)
- Activer **Continuous Cloud Backup** ou snapshots planifiés (quotidien minimum).
- Rétention : 7–30 jours selon contrat.

### Self-hosted
```bash
# Dump quotidien (cron)
mongodump --uri="$MONGODB_URI" --out=/backups/nour-$(date +%Y%m%d)
# Rétention locale : supprimer dossiers > 14 jours
find /backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \;
```

Tester une restauration sur un environnement staging **avant** le go-live.

---

## 5. Rétention uploads

Les fichiers (preuves de paiement, documents cours) sont stockés sous `uploads/` sur le serveur API.

| Type | Politique suggérée |
|------|-------------------|
| Preuves paiement validées | Conserver 7 ans (comptabilité) ou selon conseil juridique |
| Preuves rejetées | 90 jours puis archivage/suppression |
| Documents cours | Durée vie du programme + 1 an |

Automatiser avec un cron qui supprime les fichiers orphelins (sans référence en base) après 30 jours.

---

## 6. Checklist pré-déploiement

- [ ] `JWT_SECRET` et mots de passe SMTP rotés (pas de valeurs dev)
- [ ] `FRONTEND_URL` = domaine prod (CORS strict, pas de `localhost` seul)
- [ ] HTTPS activé (API + frontend)
- [ ] `/uploads` **non** exposé en statique public (URLs signées uniquement)
- [ ] Comptes seed dev **supprimés** ou mots de passe changés en prod
- [ ] `npm test` backend vert
- [ ] `npx playwright test` frontend vert (avec API + UI démarrées)
- [ ] Emails transactionnels testés (inscription, reset, paiement)
- [ ] Jitsi : domaine et config vérifiés pour les sessions live

---

## 7. Comptes de démonstration (staging uniquement)

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| Admin | `admin@languageschool.com` | `admin123` |
| Professeur | `sarah.johnson@languageschool.com` | `prof123` |
| Étudiant (reglo) | `marie.dubois@example.com` | `student123` |

Créés via `npm run seed` — **ne pas utiliser en production**.

---

## 8. Runbook incident (résumé)

| Symptôme | Action |
|----------|--------|
| `/api/health` → 503 | Vérifier MongoDB (connexion, quota, IP whitelist) |
| Pics 5xx | Consulter logs JSON ; redémarrer process Node si fuite mémoire |
| Uploads échouent | Vérifier espace disque + permissions `uploads/` |
| CORS errors | Aligner `FRONTEND_URL` avec l'origine réelle du navigateur |
| Emails non reçus | Tester SMTP ; vérifier SPF/DKIM du domaine expéditeur |

Contact escalade : responsable technique + hébergeur MongoDB.

---

## 9. Commandes utiles

```bash
# Backend
cd backenda7na
npm install
npm run seed      # staging/dev only
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/nour_academy_test npm test
npm start

# Frontend
cd lingua-learn-hub
npm install
npm run build
npm run preview   # test build prod localement
npx playwright test
```

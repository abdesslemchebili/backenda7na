# 🏫 Plateforme d'École de Langues en Ligne

Une plateforme complète d'apprentissage des langues construite avec Node.js, Express.js et MongoDB, supportant les cours en direct et préenregistrés avec un système d'authentification robuste et un support multilingue.

## ✨ Fonctionnalités

### 🔐 Système d'Authentification
- **Connexion uniquement** (pas d'inscription publique)
- **Invitation par email** par les administrateurs
- **Vérification d'email** obligatoire
- **JWT** pour l'authentification sécurisée
- **Gestion des tentatives de connexion** avec verrouillage automatique
- **Réinitialisation de mot de passe** par email

### 👥 Rôles Utilisateurs
- **Étudiants** : Accès aux cours après confirmation de paiement ("reglo")
- **Professeurs** : Création et gestion de cours
- **Administrateurs** : 3 niveaux (super, content, support)

### 📚 Gestion des Cours
- **Cours multilingues** (EN, FR, AR) avec titres et descriptions
- **Classes en direct** et **préenregistrées**
- **Système d'inscription** avec suivi de progression
- **Évaluations** et **certifications**
- **Prix et remises** configurables

### 🎓 Système de Candidatures
- **Candidatures de professeurs** avec évaluation
- **Processus d'approbation** par les admins
- **Tests et entretiens** programmables

### 🌍 Support Multilingue
- **Interface** en anglais, français et arabe
- **Contenu des cours** multilingue
- **Emails** dans les 3 langues

## 🛠️ Technologies Utilisées

- **Backend** : Node.js, Express.js
- **Base de données** : MongoDB avec Mongoose
- **Authentification** : JWT, bcryptjs
- **Emails** : Nodemailer
- **Sécurité** : Helmet, CORS, Rate Limiting
- **Validation** : Joi
- **Développement** : Nodemon

## 📁 Structure du Projet

```
backenda7na/
├── models/                 # Modèles Mongoose
│   ├── User.js            # Modèle utilisateur
│   ├── Course.js          # Modèle cours
│   ├── Class.js           # Modèle classe
│   └── Application.js     # Modèle candidature
├── controllers/           # Contrôleurs
│   └── authController.js  # Contrôleur d'authentification
├── routes/               # Routes Express
│   └── auth.js           # Routes d'authentification
├── middleware/           # Middlewares
│   └── auth.js           # Middleware d'authentification
├── utils/                # Utilitaires
│   └── emailService.js   # Service d'envoi d'emails
├── scripts/              # Scripts utilitaires
│   └── seed.js           # Script de seeding
├── server.js             # Point d'entrée principal
├── package.json          # Dépendances
├── env.example           # Variables d'environnement
└── README.md             # Documentation
```

## 🚀 Installation et Configuration

### Prérequis
- Node.js (v14 ou supérieur)
- MongoDB (local ou cloud)
- Compte email SMTP (Gmail recommandé)

### 1. Cloner le projet
```bash
git clone <repository-url>
cd backenda7na
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration des variables d'environnement
```bash
cp env.example .env
```

Éditer le fichier `.env` avec vos configurations :

```env
# Configuration du serveur
PORT=5000
NODE_ENV=development

# Configuration MongoDB
MONGODB_URI=mongodb://localhost:27017/language_school

# Configuration JWT
JWT_SECRET=votre_jwt_secret_tres_securise
JWT_EXPIRES_IN=7d

# Configuration Email (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_mot_de_passe_app
EMAIL_FROM=votre_email@gmail.com

# Configuration de l'application
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

### 4. Initialiser la base de données
```bash
npm run seed
```

### 5. Démarrer le serveur
```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## 🔑 Comptes de Test

Après avoir exécuté le script de seed, vous pouvez utiliser ces comptes :

### Administrateurs
- **Super Admin** : `admin@languageschool.com` / `admin123`
- **Content Admin** : `content@languageschool.com` / `content123`
- **Support Admin** : `support@languageschool.com` / `support123`

### Professeurs
- **Sarah Johnson** : `sarah.johnson@languageschool.com` / `prof123`
- **Ahmed Al-Mansouri** : `ahmed.almansouri@languageschool.com` / `prof123`

### Étudiants
- **Marie Dubois** (reglo) : `marie.dubois@example.com` / `student123`
- **Youssef Benali** (pending) : `youssef.benali@example.com` / `student123`
- **Emma Wilson** (invited) : `emma.wilson@example.com` / `student123`

## 📡 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion utilisateur
- `POST /api/auth/invite` - Inviter un utilisateur (admin)
- `GET /api/auth/verify/:token` - Vérifier email
- `POST /api/auth/request-password-reset` - Demander réinitialisation
- `POST /api/auth/reset-password` - Réinitialiser mot de passe
- `POST /api/auth/resend-verification` - Renvoyer email de vérification
- `GET /api/auth/profile` - Profil utilisateur connecté

### Santé
- `GET /api/health` - Statut du serveur

## 🔒 Sécurité

- **Helmet** pour les en-têtes de sécurité
- **CORS** configuré pour le frontend
- **Rate Limiting** pour prévenir les attaques
- **Validation JWT** avec expiration
- **Hachage bcrypt** pour les mots de passe
- **Verrouillage de compte** après échecs de connexion

## 📧 Système d'Emails

Le système envoie automatiquement :
- **Emails d'invitation** avec mot de passe temporaire
- **Emails de vérification** pour confirmer l'adresse
- **Emails de réinitialisation** de mot de passe
- **Notifications de statut** de paiement

## 🌐 Support Multilingue

### Langues Supportées
- **Anglais** (en)
- **Français** (fr)
- **Arabe** (ar)

### Contenu Multilingue
- Titres et descriptions des cours
- Messages d'erreur et de succès
- Templates d'emails
- Interface utilisateur

## 📊 Statuts Utilisateurs

### Étudiants
- `invited` - Invité mais pas encore connecté
- `pending` - En attente de paiement
- `verified` - Email vérifié
- `reglo` - Paiement confirmé (accès complet)
- `suspended` - Compte suspendu

### Professeurs
- `invited` - Invité
- `verified` - Email vérifié
- `reglo` - Approuvé et actif
- `suspended` - Compte suspendu

## 🎯 Prochaines Étapes

### Fonctionnalités à Implémenter
1. **Contrôleurs et routes** pour les cours et classes
2. **Gestion des fichiers** (upload de vidéos, documents)
3. **Système de paiement** intégré
4. **Notifications en temps réel** (WebSocket)
5. **Tests unitaires** et d'intégration
6. **Documentation API** complète (Swagger)
7. **Dashboard admin** pour la gestion
8. **Système de rapports** et statistiques

### Améliorations Techniques
1. **Cache Redis** pour les performances
2. **Logging** avancé avec Winston
3. **Monitoring** avec PM2
4. **CI/CD** pipeline
5. **Docker** containerisation

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 Licence

Ce projet est sous licence ISC. Voir le fichier `LICENSE` pour plus de détails.

## 📞 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Contacter l'équipe de développement

---

**Développé avec ❤️ pour l'apprentissage des langues** 
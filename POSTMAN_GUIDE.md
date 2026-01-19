# 🚀 Guide d'Utilisation Postman - API École de Langues

## 📋 Table des Matières
- [Installation et Configuration](#installation-et-configuration)
- [Importation des Fichiers](#importation-des-fichiers)
- [Structure de la Collection](#structure-de-la-collection)
- [Tests Automatisés](#tests-automatisés)
- [Variables d'Environnement](#variables-denvironnement)
- [Workflow de Test](#workflow-de-test)
- [Dépannage](#dépannage)

## 🔧 Installation et Configuration

### Prérequis
- **Postman** installé sur votre machine
- **Serveur backend** en cours d'exécution (`npm run dev`)
- **MongoDB** connecté et fonctionnel
- **Script de seed** exécuté (`npm run seed`)

### Fichiers à Importer
1. `postman_collection.json` - Collection principale
2. `postman_environment.json` - Variables d'environnement

## 📥 Importation des Fichiers

### Étape 1 : Importer la Collection
1. Ouvrez **Postman**
2. Cliquez sur **"Import"** (bouton en haut à gauche)
3. Glissez-déposez le fichier `postman_collection.json`
4. Cliquez sur **"Import"**

### Étape 2 : Importer l'Environnement
1. Cliquez sur **"Import"** à nouveau
2. Glissez-déposez le fichier `postman_environment.json`
3. Cliquez sur **"Import"**

### Étape 3 : Sélectionner l'Environnement
1. Dans le sélecteur d'environnement (en haut à droite)
2. Choisissez **"🏫 Language School - Local"**

## 📁 Structure de la Collection

### 🔐 Authentification
- **Connexion Utilisateur** - Test de connexion avec différents comptes
- **Inviter un Utilisateur** - Créer de nouveaux utilisateurs (admin)
- **Vérifier Email** - Confirmer l'email d'un utilisateur
- **Réinitialisation Mot de Passe** - Gestion des mots de passe oubliés
- **Profil Utilisateur** - Récupérer les informations du profil

### 🏥 Santé
- **Vérifier Statut du Serveur** - Test de santé de l'API

### 👥 Utilisateurs (À implémenter)
- **Lister Tous les Utilisateurs** - Récupérer la liste des utilisateurs
- **Obtenir Utilisateur par ID** - Détails d'un utilisateur spécifique

### 📚 Cours (À implémenter)
- **Lister Tous les Cours** - Récupérer tous les cours disponibles
- **Obtenir Cours par ID** - Détails d'un cours spécifique
- **Créer un Nouveau Cours** - Créer un nouveau cours

### 🎓 Classes (À implémenter)
- **Lister Toutes les Classes** - Récupérer toutes les classes
- **Obtenir Classe par ID** - Détails d'une classe spécifique

### 📝 Candidatures (À implémenter)
- **Lister Toutes les Candidatures** - Voir les candidatures (admin)
- **Soumettre une Candidature** - Postuler comme professeur

### 🧪 Tests de Sécurité
- **Accès sans Token** - Tester la protection des endpoints
- **Token Invalide** - Tester la validation des tokens
- **Rate Limiting Test** - Tester les limites de taux

## ⚡ Tests Automatisés

### Tests Globaux
Chaque requête inclut automatiquement :
- **Temps de réponse** < 2000ms
- **Format JSON** valide

### Tests Spécifiques
- **Connexion** : Sauvegarde automatique du token
- **Santé** : Vérification de la structure de réponse
- **Sécurité** : Vérification des codes d'erreur 401

### Scripts de Test
```javascript
// Exemple de test automatique
pm.test('Status code is 200', function () {
    pm.response.to.have.status(200);
});

// Sauvegarde automatique du token
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set('auth_token', response.token);
}
```

## 🔧 Variables d'Environnement

### Variables Principales
| Variable | Description | Exemple |
|----------|-------------|---------|
| `base_url` | URL de base de l'API | `http://localhost:5000` |
| `auth_token` | Token JWT d'authentification | `eyJhbGciOiJIUzI1NiIs...` |
| `user_id` | ID de l'utilisateur connecté | `507f1f77bcf86cd799439011` |
| `user_role` | Rôle de l'utilisateur | `admin`, `professor`, `student` |

### Variables de Test
| Variable | Description | Exemple |
|----------|-------------|---------|
| `admin_email` | Email de l'admin de test | `admin@languageschool.com` |
| `admin_password` | Mot de passe de l'admin | `admin123` |
| `student_email` | Email de l'étudiant de test | `marie.dubois@example.com` |
| `student_password` | Mot de passe de l'étudiant | `student123` |

## 🔄 Workflow de Test

### 1. Test Initial
```bash
# 1. Démarrer le serveur
npm run dev

# 2. Exécuter le script de seed
npm run seed

# 3. Tester la santé de l'API
GET {{base_url}}/api/health
```

### 2. Test d'Authentification
```bash
# 1. Connexion admin
POST {{base_url}}/api/auth/login
{
  "email": "{{admin_email}}",
  "password": "{{admin_password}}"
}

# 2. Vérifier le profil
GET {{base_url}}/api/auth/profile
Authorization: Bearer {{auth_token}}
```

### 3. Test des Rôles
```bash
# 1. Connexion étudiant
POST {{base_url}}/api/auth/login
{
  "email": "{{student_email}}",
  "password": "{{student_password}}"
}

# 2. Tester l'accès aux endpoints protégés
GET {{base_url}}/api/users
Authorization: Bearer {{auth_token}}
```

### 4. Test de Sécurité
```bash
# 1. Test sans token
GET {{base_url}}/api/auth/profile

# 2. Test avec token invalide
GET {{base_url}}/api/auth/profile
Authorization: Bearer invalid_token
```

## 🎯 Scénarios de Test Recommandés

### Scénario 1 : Workflow Complet Admin
1. **Connexion Admin** → Sauvegarde du token
2. **Vérifier Profil** → Confirmer les permissions
3. **Inviter Utilisateur** → Créer un nouvel utilisateur
4. **Lister Utilisateurs** → Voir tous les utilisateurs

### Scénario 2 : Workflow Étudiant
1. **Connexion Étudiant** → Test avec statut 'reglo'
2. **Connexion Étudiant Pending** → Test de refus d'accès
3. **Vérifier Profil** → Confirmer les restrictions

### Scénario 3 : Tests de Sécurité
1. **Accès sans Token** → Vérifier la protection
2. **Token Invalide** → Vérifier la validation
3. **Rate Limiting** → Tester les limites

## 🔍 Dépannage

### Erreurs Communes

#### ❌ "Cannot connect to server"
**Solution :**
```bash
# Vérifier que le serveur fonctionne
npm run dev

# Vérifier le port dans .env
PORT=5000
```

#### ❌ "MongoDB connection failed"
**Solution :**
```bash
# Vérifier MongoDB
mongod --version

# Vérifier la connexion dans .env
MONGODB_URI=mongodb://localhost:27017/language_school
```

#### ❌ "401 Unauthorized"
**Solution :**
1. Vérifier que le token est valide
2. Refaire une connexion pour obtenir un nouveau token
3. Vérifier les permissions de l'utilisateur

#### ❌ "429 Too Many Requests"
**Solution :**
- Attendre quelques minutes
- Vérifier les paramètres de rate limiting dans `.env`

### Vérification des Données
```bash
# Vérifier que les données de test existent
npm run seed

# Vérifier les comptes créés
# Admin: admin@languageschool.com / admin123
# Étudiant: marie.dubois@example.com / student123
# Professeur: sarah.johnson@example.com / professor123
```

## 📊 Monitoring et Tests

### Tests Automatisés
```bash
# Exécuter les tests Node.js
node test-api.js

# Vérifier les logs du serveur
npm run dev
```

### Vérification des Endpoints
| Endpoint | Statut | Description |
|----------|--------|-------------|
| `GET /api/health` | ✅ Fonctionnel | Santé du serveur |
| `POST /api/auth/login` | ✅ Fonctionnel | Connexion utilisateur |
| `GET /api/auth/profile` | ✅ Fonctionnel | Profil utilisateur |
| `POST /api/auth/invite` | ✅ Fonctionnel | Invitation utilisateur |
| `GET /api/users` | ⏳ Placeholder | Liste utilisateurs |
| `GET /api/courses` | ⏳ Placeholder | Liste cours |

## 🎉 Prochaines Étapes

1. **Implémenter les contrôleurs manquants**
2. **Ajouter des tests unitaires**
3. **Créer des tests d'intégration**
4. **Optimiser les performances**
5. **Ajouter la documentation Swagger**

---

## 📞 Support

Pour toute question ou problème :
1. Vérifiez les logs du serveur
2. Consultez la documentation API
3. Testez avec les comptes de démonstration
4. Vérifiez la configuration MongoDB

**Bonne utilisation de votre API ! 🚀** 
# 📚 Documentation API - Plateforme d'École de Langues

## 🌐 Base URL
```
http://localhost:5000/api
```

## 🔐 Authentification

L'API utilise JWT (JSON Web Tokens) pour l'authentification. Incluez le token dans l'en-tête `Authorization` :

```
Authorization: Bearer <votre_token_jwt>
```

## 📋 Endpoints

### 🔑 Authentification

#### POST /auth/login
Connexion utilisateur.

**Corps de la requête :**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Réponse réussie (200) :**
```json
{
  "message": "Connexion réussie",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "role": "student",
    "status": "reglo",
    "emailVerified": true,
    "fullName": "John Doe"
  }
}
```

**Réponses d'erreur :**
- `400` - Données manquantes
- `401` - Identifiants invalides
- `403` - Email non vérifié ou paiement requis
- `423` - Compte verrouillé

#### POST /auth/invite
Inviter un utilisateur (Admin seulement).

**Corps de la requête :**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "role": "student",
  "adminLevel": null,
  "language": "en"
}
```

**Réponse réussie (201) :**
```json
{
  "message": "Utilisateur invité avec succès",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "role": "student",
    "status": "invited"
  }
}
```

#### GET /auth/verify/:token
Vérifier l'email avec un token.

**Réponse réussie (200) :**
```json
{
  "message": "Email vérifié avec succès",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "role": "student",
    "status": "verified",
    "emailVerified": true
  }
}
```

#### POST /auth/request-password-reset
Demander une réinitialisation de mot de passe.

**Corps de la requête :**
```json
{
  "email": "user@example.com",
  "language": "en"
}
```

#### POST /auth/reset-password
Réinitialiser le mot de passe.

**Corps de la requête :**
```json
{
  "token": "reset_token_here",
  "newPassword": "newpassword123"
}
```

#### POST /auth/resend-verification
Renvoyer l'email de vérification.

**Corps de la requête :**
```json
{
  "email": "user@example.com",
  "language": "en"
}
```

#### GET /auth/profile
Obtenir le profil de l'utilisateur connecté.

**Réponse réussie (200) :**
```json
{
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@example.com",
    "role": "student",
    "adminLevel": null,
    "status": "reglo",
    "emailVerified": true,
    "avatar": null,
    "preferences": {
      "language": "en",
      "notifications": {
        "email": true,
        "push": true
      }
    },
    "fullName": "Jane Smith",
    "studentInfo": {
      "level": "beginner",
      "languages": [
        {
          "language": "english",
          "level": "beginner"
        }
      ],
      "enrolledCourses": []
    },
    "bio": {
      "en": "Student bio",
      "fr": "Bio étudiante",
      "ar": "السيرة الذاتية للطالب"
    },
    "phone": "+1234567890",
    "timezone": "UTC",
    "lastLogin": "2024-01-15T10:30:00.000Z"
  }
}
```

### 🏥 Santé

#### GET /health
Vérifier le statut du serveur.

**Réponse réussie (200) :**
```json
{
  "status": "OK",
  "message": "Serveur de l'école de langues opérationnel",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 👥 Utilisateurs (À implémenter)

#### GET /users
Lister tous les utilisateurs (Admin seulement).

#### GET /users/:id
Obtenir un utilisateur par ID.

#### PUT /users/:id
Mettre à jour un utilisateur.

#### DELETE /users/:id
Supprimer un utilisateur (Admin seulement).

### 📚 Cours (À implémenter)

#### GET /courses
Lister tous les cours publics.

#### GET /courses/:id
Obtenir un cours par ID.

#### POST /courses
Créer un nouveau cours (Professeur/Admin).

#### PUT /courses/:id
Mettre à jour un cours.

#### DELETE /courses/:id
Supprimer un cours.

### 🎓 Classes (À implémenter)

#### GET /classes
Lister toutes les classes.

#### GET /classes/:id
Obtenir une classe par ID.

#### POST /classes
Créer une nouvelle classe.

#### PUT /classes/:id
Mettre à jour une classe.

#### DELETE /classes/:id
Supprimer une classe.

### 📝 Candidatures (À implémenter)

#### GET /applications
Lister toutes les candidatures (Admin seulement).

#### GET /applications/:id
Obtenir une candidature par ID.

#### POST /applications
Soumettre une candidature.

#### PUT /applications/:id
Mettre à jour une candidature.

## 🔒 Codes de Statut HTTP

- `200` - Succès
- `201` - Créé avec succès
- `400` - Requête invalide
- `401` - Non authentifié
- `403` - Accès refusé
- `404` - Ressource non trouvée
- `423` - Compte verrouillé
- `500` - Erreur serveur

## 📊 Rôles et Permissions

### 👨‍🎓 Étudiant
- Accès aux cours après statut "reglo"
- Inscription aux cours
- Suivi de progression
- Accès aux classes

### 👨‍🏫 Professeur
- Création et gestion de cours
- Gestion des classes
- Suivi des étudiants
- Accès aux matériaux

### 👨‍💼 Administrateur
- **Super Admin** : Accès complet
- **Content Admin** : Gestion du contenu
- **Support Admin** : Support utilisateur

## 🌍 Support Multilingue

L'API supporte 3 langues :
- `en` - Anglais
- `fr` - Français  
- `ar` - Arabe

Spécifiez la langue dans les requêtes :
```json
{
  "language": "fr"
}
```

## 📧 Système d'Emails

Les emails sont envoyés automatiquement pour :
- Invitations d'utilisateurs
- Vérification d'email
- Réinitialisation de mot de passe
- Notifications de statut

## 🔧 Configuration

### Variables d'environnement requises :
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/language_school
JWT_SECRET=votre_secret_jwt
JWT_EXPIRES_IN=7d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_mot_de_passe_app
EMAIL_FROM=votre_email@gmail.com
```

## 🧪 Tests

Exécutez les tests de l'API :
```bash
node test-api.js
```

## 📈 Prochaines Étapes

1. Implémenter les contrôleurs manquants
2. Ajouter la validation des données (Joi)
3. Implémenter la gestion des fichiers
4. Ajouter les tests unitaires
5. Documenter avec Swagger/OpenAPI
6. Implémenter le système de paiement
7. Ajouter les notifications en temps réel

---

**Développé avec ❤️ pour l'apprentissage des langues** 
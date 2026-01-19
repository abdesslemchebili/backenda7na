const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { 
  sendUserInvitation, 
  sendEmailVerification, 
  sendPasswordReset,
  generateVerificationToken,
  generatePasswordResetToken,
  generateTempPassword
} = require('../utils/emailService');

// Générer un token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Connexion utilisateur
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation des données
    if (!email || !password) {
      return res.status(400).json({
        error: 'Données manquantes',
        message: 'Email et mot de passe sont requis'
      });
    }

    // Rechercher l'utilisateur
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Identifiants invalides',
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Vérifier si le compte est verrouillé
    if (user.isLocked) {
      return res.status(423).json({
        error: 'Compte verrouillé',
        message: 'Votre compte est temporairement verrouillé. Veuillez réessayer plus tard.'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Incrémenter les tentatives de connexion
      await user.incrementLoginAttempts();
      
      return res.status(401).json({
        error: 'Identifiants invalides',
        message: 'Email ou mot de passe incorrect'
      });
    }

    // Réinitialiser les tentatives de connexion
    await user.resetLoginAttempts();

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // Vérifier si l'email est vérifié (sauf pour les admins)
    if (user.role !== 'admin' && !user.emailVerified) {
      return res.status(403).json({
        error: 'Email non vérifié',
        message: 'Veuillez vérifier votre adresse email avant de vous connecter',
        requiresVerification: true
      });
    }

    // Vérifier le statut pour les étudiants
    if (user.role === 'student' && user.status !== 'reglo') {
      return res.status(403).json({
        error: 'Paiement requis',
        message: 'Votre paiement doit être confirmé pour accéder à la plateforme',
        paymentRequired: true,
        status: user.status
      });
    }

    // Générer le token
    const token = generateToken(user._id);

    // Préparer la réponse
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      adminLevel: user.adminLevel,
      status: user.status,
      emailVerified: user.emailVerified,
      avatar: user.avatar,
      preferences: user.preferences,
      fullName: user.fullName
    };

    // Ajouter les informations spécifiques au rôle
    if (user.role === 'student') {
      userResponse.studentInfo = user.studentInfo;
    } else if (user.role === 'professor') {
      userResponse.professorInfo = user.professorInfo;
    }

    res.json({
      message: 'Connexion réussie',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la connexion'
    });
  }
};

// Inviter un utilisateur (admin seulement)
const inviteUser = async (req, res) => {
  try {
    const { firstName, lastName, email, role, adminLevel, language = 'en' } = req.body;

    // Validation des données
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({
        error: 'Données manquantes',
        message: 'Prénom, nom, email et rôle sont requis'
      });
    }

    // Vérifier si l'email existe déjà
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        error: 'Email déjà utilisé',
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }

    // Validation du rôle et niveau d'admin
    if (role === 'admin' && !adminLevel) {
      return res.status(400).json({
        error: 'Niveau d\'admin requis',
        message: 'Le niveau d\'administrateur est requis pour les admins'
      });
    }

    // Générer un mot de passe temporaire
    const tempPassword = generateTempPassword();

    // Créer l'utilisateur
    const userData = {
      firstName,
      lastName,
      email,
      password: tempPassword,
      role,
      adminLevel: role === 'admin' ? adminLevel : null,
      status: 'invited',
      emailVerified: false,
      emailVerificationToken: generateVerificationToken(null), // Sera mis à jour après création
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 heures
    };

    const user = new User(userData);
    await user.save();

    // Mettre à jour le token avec l'ID de l'utilisateur
    user.emailVerificationToken = generateVerificationToken(user._id);
    await user.save();

    // Envoyer l'email d'invitation
    try {
      await sendUserInvitation(user, tempPassword, language);
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      // Supprimer l'utilisateur si l'email n'a pas pu être envoyé
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        error: 'Erreur d\'envoi d\'email',
        message: 'L\'utilisateur n\'a pas pu être invité en raison d\'une erreur d\'envoi d\'email'
      });
    }

    res.status(201).json({
      message: 'Utilisateur invité avec succès',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        adminLevel: user.adminLevel,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Erreur lors de l\'invitation:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de l\'invitation de l\'utilisateur'
    });
  }
};

// Vérifier l'email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Token manquant',
        message: 'Le token de vérification est requis'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'email_verification') {
      return res.status(400).json({
        error: 'Token invalide',
        message: 'Le token de vérification est invalide'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur associé à ce token n\'existe pas'
      });
    }

    // Vérifier si l'email est déjà vérifié
    if (user.emailVerified) {
      return res.status(400).json({
        error: 'Email déjà vérifié',
        message: 'Cet email a déjà été vérifié'
      });
    }

    // Vérifier si le token a expiré
    if (user.emailVerificationExpires < new Date()) {
      return res.status(400).json({
        error: 'Token expiré',
        message: 'Le token de vérification a expiré'
      });
    }

    // Marquer l'email comme vérifié
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    user.status = user.status === 'invited' ? 'verified' : user.status;
    await user.save();

    res.json({
      message: 'Email vérifié avec succès',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        error: 'Token invalide',
        message: 'Le token de vérification est invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        error: 'Token expiré',
        message: 'Le token de vérification a expiré'
      });
    }

    console.error('Erreur lors de la vérification d\'email:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la vérification de l\'email'
    });
  }
};

// Demander une réinitialisation de mot de passe
const requestPasswordReset = async (req, res) => {
  try {
    const { email, language = 'en' } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email requis',
        message: 'L\'adresse email est requise'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findByEmail(email);
    if (!user) {
      // Ne pas révéler si l'email existe ou non pour des raisons de sécurité
      return res.json({
        message: 'Si l\'email existe dans notre système, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = generatePasswordResetToken(user._id);
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
    await user.save();

    // Envoyer l'email de réinitialisation
    try {
      await sendPasswordReset(user, language);
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      return res.status(500).json({
        error: 'Erreur d\'envoi d\'email',
        message: 'Impossible d\'envoyer l\'email de réinitialisation'
      });
    }

    res.json({
      message: 'Si l\'email existe dans notre système, un lien de réinitialisation a été envoyé'
    });

  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la demande de réinitialisation'
    });
  }
};

// Réinitialiser le mot de passe
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Données manquantes',
        message: 'Token et nouveau mot de passe sont requis'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'password_reset') {
      return res.status(400).json({
        error: 'Token invalide',
        message: 'Le token de réinitialisation est invalide'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur associé à ce token n\'existe pas'
      });
    }

    // Vérifier si le token a expiré
    if (user.passwordResetExpires < new Date()) {
      return res.status(400).json({
        error: 'Token expiré',
        message: 'Le token de réinitialisation a expiré'
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({
      message: 'Mot de passe réinitialisé avec succès'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        error: 'Token invalide',
        message: 'Le token de réinitialisation est invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        error: 'Token expiré',
        message: 'Le token de réinitialisation a expiré'
      });
    }

    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la réinitialisation du mot de passe'
    });
  }
};

// Renvoyer l'email de vérification
const resendVerificationEmail = async (req, res) => {
  try {
    const { email, language = 'en' } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email requis',
        message: 'L\'adresse email est requise'
      });
    }

    // Trouver l'utilisateur
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'Aucun utilisateur trouvé avec cet email'
      });
    }

    // Vérifier si l'email est déjà vérifié
    if (user.emailVerified) {
      return res.status(400).json({
        error: 'Email déjà vérifié',
        message: 'Cet email a déjà été vérifié'
      });
    }

    // Générer un nouveau token
    user.emailVerificationToken = generateVerificationToken(user._id);
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 heures
    await user.save();

    // Envoyer l'email
    try {
      await sendEmailVerification(user, language);
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      return res.status(500).json({
        error: 'Erreur d\'envoi d\'email',
        message: 'Impossible d\'envoyer l\'email de vérification'
      });
    }

    res.json({
      message: 'Email de vérification renvoyé avec succès'
    });

  } catch (error) {
    console.error('Erreur lors du renvoi de l\'email de vérification:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors du renvoi de l\'email de vérification'
    });
  }
};

// Obtenir le profil de l'utilisateur connecté
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        error: 'Utilisateur non trouvé',
        message: 'L\'utilisateur n\'existe plus'
      });
    }

    res.json({
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        adminLevel: user.adminLevel,
        status: user.status,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        preferences: user.preferences,
        fullName: user.fullName,
        studentInfo: user.studentInfo,
        professorInfo: user.professorInfo,
        bio: user.bio,
        phone: user.phone,
        timezone: user.timezone,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la récupération du profil'
    });
  }
};

module.exports = {
  login,
  inviteUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
  getProfile
}; 
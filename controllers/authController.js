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

const crypto = require('crypto');

// Générer un token JWT (access token)
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

const getExpiresInSeconds = () => {
  const expires = process.env.JWT_EXPIRES_IN || '1h';
  if (expires.endsWith('d')) return parseInt(expires) * 24 * 3600;
  if (expires.endsWith('h')) return parseInt(expires) * 3600;
  if (expires.endsWith('m')) return parseInt(expires) * 60;
  return 3600;
};

// Generate refresh token (opaque, stored in DB)
const generateRefreshToken = () => crypto.randomBytes(40).toString('hex');

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
        error: 'Locked',
        message: 'Account temporarily locked due to too many failed attempts.'
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
        error: 'Forbidden',
        message: 'Please verify your email before signing in.',
        requiresVerification: true
      });
    }

    // Étudiants et professeurs : bloquer pending/suspended (pas encore approuvés)
    if (['student', 'professor'].includes(user.role) && ['pending', 'suspended'].includes(user.status)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: user.status === 'suspended'
          ? 'Your account has been suspended.'
          : user.role === 'professor'
            ? 'Your teacher account is pending approval.'
            : 'Your enrollment is pending approval.',
        status: user.status
      });
    }

    // Générer les tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken();
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    user.refreshTokenExpires = refreshExpires;
    await user.save();

    const isActive = user.role === 'student' ? user.status === 'reglo' : true;

    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username || undefined,
      role: user.role,
      status: user.status,
      paymentStatus: user.paymentStatus || undefined,
      mustChangePassword: user.mustChangePassword || false,
      phone: user.phone || undefined,
      country: user.country || undefined,
      avatar: user.avatar || undefined,
      bio: user.bio || { en: '', fr: '', ar: '' },
      studentInfo: user.studentInfo || undefined,
      preferences: user.preferences || {
        language: 'en',
        notifications: { email: true, push: true }
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      token,
      refreshToken,
      expiresIn: getExpiresInSeconds(),
      user: userResponse,
      mustChangePassword: user.mustChangePassword || false,
      placementTestRequired: user.role === 'student' && !user.studentInfo?.placementTestCompleted,
      paymentRequired: user.role === 'student' && user.status !== 'reglo',
      isActive
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

    // Email best-effort — ne bloque plus la création si SMTP échoue
    let emailSent = false;
    try {
      await sendUserInvitation(user, tempPassword, language);
      emailSent = true;
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email:', emailError);
    }

    // Compte utilisable même sans email (admin peut transmettre le mot de passe)
    user.emailVerified = true;
    user.mustChangePassword = true;
    if (role === 'professor' || role === 'admin') {
      user.status = role === 'admin' ? 'reglo' : 'verified';
    } else if (user.status === 'invited') {
      user.status = 'verified';
    }
    await user.save();

    res.status(201).json({
      message: emailSent
        ? 'Invitation sent successfully'
        : 'User created; email could not be sent — share the temporary password manually',
      user: { _id: user._id, email: user.email, role: user.role, status: user.status },
      temporaryPassword: tempPassword,
      emailSent,
    });

  } catch (error) {
    console.error('Erreur lors de l\'invitation:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de l\'invitation de l\'utilisateur'
    });
  }
};

// Vérifier l'email (token depuis params ou query : /verify/:token ou /verify?token=...)
const verifyEmail = async (req, res) => {
  try {
    const token = req.params.token || req.query.token;

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

    const payload = {
      message: 'Email verified successfully. You can now sign in.',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified
      }
    };

    // Clic depuis l'email (navigateur) : page HTML de succès (fonctionne même si le frontend est arrêté)
    const acceptsHtml = req.get('Accept') && req.get('Accept').includes('text/html');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (acceptsHtml) {
      const html = `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Email vérifié</title></head>
        <body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;">
          <h1 style="color:#27ae60;">✓ Email vérifié</h1>
          <p>Votre adresse email a été vérifiée. Vous pouvez maintenant vous connecter.</p>
          <p><a href="${frontendUrl}/login" style="color:#3498db;">Aller à la page de connexion</a></p>
        </body></html>`;
      return res.type('html').send(html);
    }
    res.json(payload);

  } catch (error) {
    const acceptsHtml = req.get('Accept') && req.get('Accept').includes('text/html');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const sendErrorHtml = (title, message, code) => {
      if (acceptsHtml) {
        const html = `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><title>${title}</title></head>
          <body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center;">
            <h1 style="color:#e74c3c;">${title}</h1>
            <p>${message}</p>
            <p><a href="${frontendUrl}/login" style="color:#3498db;">Aller à la page de connexion</a></p>
          </body></html>`;
        return res.status(code).type('html').send(html);
      }
      return null;
    };

    if (error.name === 'JsonWebTokenError') {
      if (sendErrorHtml('Lien invalide', 'Le lien de vérification est invalide.', 400)) return;
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid or expired verification token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      if (sendErrorHtml('Lien expiré', 'Le lien de vérification a expiré. Demandez un nouvel email depuis la page de connexion.', 400)) return;
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid or expired verification token'
      });
    }

    console.error('Erreur lors de la vérification d\'email:', error);
    if (sendErrorHtml('Erreur', 'Une erreur est survenue. Réessayez plus tard.', 500)) return;
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

    const user = await User.findByEmail(email);
    if (user) {
      const resetToken = generatePasswordResetToken(user._id);
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      try {
        await sendPasswordReset(user, language);
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      }
    }

    res.status(200).json({
      message: 'If an account exists with this email, you will receive a password reset link.'
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
      message: 'Password has been reset. You can now sign in.'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid or expired reset token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid or expired reset token'
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

    const user = await User.findByEmail(email);
    if (user && !user.emailVerified) {
      user.emailVerificationToken = generateVerificationToken(user._id);
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      try {
        await sendEmailVerification(user, language);
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      }
    }

    res.status(200).json({
      message: 'If the account is unverified, a new verification email has been sent.'
    });

  } catch (error) {
    console.error('Erreur lors du renvoi de l\'email de vérification:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors du renvoi de l\'email de vérification'
    });
  }
};

// Refresh access token
const refreshTokenHandler = async (req, res) => {
  try {
    const { refreshToken: tokenFromBody } = req.body;
    const token = tokenFromBody || req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
    }

    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      refreshToken: hashed,
      refreshTokenExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
    }

    const accessToken = generateToken(user._id);
    res.json({
      token: accessToken,
      expiresIn: getExpiresInSeconds()
    });
  } catch (error) {
    console.error('Erreur refresh token:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue'
    });
  }
};

// Logout - invalidate refresh token
const logout = async (req, res) => {
  try {
    if (req.user && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $unset: { refreshToken: 1, refreshTokenExpires: 1 }
      });
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue'
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

    // Format de réponse selon la spécification API
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username || undefined,
      role: user.role,
      status: user.status,
      paymentStatus: user.paymentStatus || undefined,
      mustChangePassword: user.mustChangePassword || false,
      phone: user.phone || undefined,
      country: user.country || undefined,
      avatar: user.avatar || undefined,
      bio: user.bio || { en: '', fr: '', ar: '' },
      studentInfo: user.studentInfo || undefined,
      professorInfo: user.professorInfo || undefined,
      preferences: user.preferences || {
        language: 'en',
        notifications: { email: true, push: true }
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json(userResponse);

  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la récupération du profil'
    });
  }
};

// Enregistrer un nouvel utilisateur
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, role } = req.body;

    // Validation des données
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      return res.status(400).json({
        error: 'Données manquantes',
        message: 'Tous les champs sont requis'
      });
    }

    // Vérifier que les mots de passe correspondent
    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Mots de passe non correspondants',
        message: 'Les mots de passe ne correspondent pas'
      });
    }

    // Vérifier la longueur du mot de passe
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Mot de passe trop court',
        message: 'Le mot de passe doit contenir au moins 6 caractères'
      });
    }

    // Vérifier le rôle — inscription professeur réservée à l'admin
    if (role === 'professor') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Les comptes enseignant sont créés par l\'administration. Utilisez le formulaire « Devenir enseignant ».'
      });
    }

    if (role && !['student', 'professor'].includes(role)) {
      return res.status(400).json({
        error: 'Rôle invalide',
        message: 'Le rôle doit être "student" ou "professor"'
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

    // Créer l'utilisateur
    const userData = {
      firstName,
      lastName,
      email,
      password,
      role: role || 'student',
      status: 'pending',
      emailVerified: false,
      emailVerificationToken: generateVerificationToken(null),
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 heures
    };

    const user = new User(userData);
    await user.save();

    // Mettre à jour le token avec l'ID de l'utilisateur
    user.emailVerificationToken = generateVerificationToken(user._id);
    await user.save();

    // Envoyer l'email de vérification
    try {
      await sendEmailVerification(user, user.preferences?.language || 'en');
    } catch (emailError) {
      console.error('Erreur lors de l\'envoi de l\'email:', emailError);
      // Ne pas bloquer la création si l'email échoue
    }

    const response = {
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        _id: user._id,
        email: user.email,
        role: user.role
      }
    };
    // En dev uniquement : exposer le lien de vérification pour tester sans ouvrir l'email
    if (process.env.NODE_ENV === 'development') {
      const apiBase = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
      response._devVerificationLink = `${apiBase}/api/auth/verify?token=${user.emailVerificationToken}`;
    }
    res.status(201).json(response);

  } catch (error) {
    console.error('Erreur lors de l\'enregistrement:', error);
    
    // Gérer les erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Erreur de validation',
        message: errors.join(', ')
      });
    }

    // Gérer les erreurs de duplication
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Email déjà utilisé',
        message: 'Un utilisateur avec cet email existe déjà'
      });
    }

    res.status(500).json({
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de l\'enregistrement'
    });
  }
};

// Changer le mot de passe (première connexion ou utilisateur connecté)
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'newPassword and confirmPassword are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'currentPassword is required' });
      }
      const valid = await user.comparePassword(currentPassword);
      if (!valid) return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('changePassword:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
};

module.exports = {
  login,
  register,
  logout,
  refreshTokenHandler,
  inviteUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
  getProfile,
  changePassword
}; 
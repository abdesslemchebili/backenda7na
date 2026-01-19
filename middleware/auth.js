const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour vérifier le token JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Token d\'accès requis',
        message: 'Veuillez vous connecter pour accéder à cette ressource'
      });
    }

    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Récupérer l'utilisateur
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Token invalide',
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si l'utilisateur est suspendu
    if (user.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Compte suspendu',
        message: 'Votre compte a été suspendu. Veuillez contacter l\'administrateur.'
      });
    }

    // Vérifier si l'utilisateur est verrouillé
    if (user.isLocked) {
      return res.status(423).json({ 
        error: 'Compte verrouillé',
        message: 'Votre compte est temporairement verrouillé en raison de trop nombreuses tentatives de connexion échouées.'
      });
    }

    // Ajouter l'utilisateur à la requête
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token invalide',
        message: 'Le token d\'accès est invalide'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expiré',
        message: 'Le token d\'accès a expiré. Veuillez vous reconnecter.'
      });
    }

    console.error('Erreur d\'authentification:', error);
    return res.status(500).json({ 
      error: 'Erreur d\'authentification',
      message: 'Une erreur est survenue lors de la vérification de l\'authentification'
    });
  }
};

// Middleware pour vérifier les rôles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: 'Vous n\'avez pas les permissions nécessaires pour accéder à cette ressource'
      });
    }

    next();
  };
};

// Middleware pour vérifier les niveaux d'admin
const authorizeAdminLevels = (...levels) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: 'Cette ressource est réservée aux administrateurs'
      });
    }

    if (!levels.includes(req.user.adminLevel)) {
      return res.status(403).json({ 
        error: 'Niveau d\'accès insuffisant',
        message: 'Votre niveau d\'administrateur ne vous permet pas d\'accéder à cette ressource'
      });
    }

    next();
  };
};

// Middleware pour vérifier le statut de l'utilisateur
const checkStatus = (...statuses) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    if (!statuses.includes(req.user.status)) {
      return res.status(403).json({ 
        error: 'Statut invalide',
        message: 'Votre compte n\'a pas le statut requis pour accéder à cette ressource'
      });
    }

    next();
  };
};

// Middleware spécial pour les étudiants (doit être "reglo")
const requireStudentStatus = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Non authentifié',
      message: 'Vous devez être connecté pour accéder à cette ressource'
    });
  }

  if (req.user.role !== 'student') {
    return res.status(403).json({ 
      error: 'Rôle invalide',
      message: 'Cette ressource est réservée aux étudiants'
    });
  }

  if (req.user.status !== 'reglo') {
    return res.status(403).json({ 
      error: 'Paiement requis',
      message: 'Votre paiement doit être confirmé pour accéder à cette ressource. Veuillez contacter l\'administrateur.'
    });
  }

  next();
};

// Middleware pour vérifier si l'utilisateur est le propriétaire de la ressource (pour les cours/classes)
const requireOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Non authentifié',
          message: 'Vous devez être connecté pour accéder à cette ressource'
        });
      }

      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ 
          error: 'Ressource non trouvée',
          message: 'La ressource demandée n\'existe pas'
        });
      }

      // Vérifier si l'utilisateur est le propriétaire ou un admin
      const isOwner = resource.professor && resource.professor.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ 
          error: 'Accès refusé',
          message: 'Vous n\'êtes pas autorisé à accéder à cette ressource'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Erreur lors de la vérification de propriété:', error);
      return res.status(500).json({ 
        error: 'Erreur serveur',
        message: 'Une erreur est survenue lors de la vérification des permissions'
      });
    }
  };
};

// Middleware pour vérifier si l'utilisateur accède à son propre profil ou est admin
const requireUserOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    const userId = req.params.id;
    const isOwner = userId === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ 
        error: 'Accès refusé',
        message: 'Vous n\'êtes pas autorisé à accéder à cette ressource'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de propriété:', error);
    return res.status(500).json({ 
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la vérification des permissions'
    });
  }
};

// Middleware pour vérifier si l'utilisateur est inscrit au cours
const requireCourseEnrollment = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Non authentifié',
        message: 'Vous devez être connecté pour accéder à cette ressource'
      });
    }

    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        error: 'Rôle invalide',
        message: 'Cette ressource est réservée aux étudiants'
      });
    }

    const courseId = req.params.courseId || req.params.id;
    const Course = require('../models/Course');
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ 
        error: 'Cours non trouvé',
        message: 'Le cours demandé n\'existe pas'
      });
    }

    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({ 
        error: 'Non inscrit',
        message: 'Vous devez être inscrit à ce cours pour y accéder'
      });
    }

    req.course = course;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification d\'inscription:', error);
    return res.status(500).json({ 
      error: 'Erreur serveur',
      message: 'Une erreur est survenue lors de la vérification de l\'inscription'
    });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeAdminLevels,
  checkStatus,
  requireStudentStatus,
  requireOwnership,
  requireUserOwnership,
  requireCourseEnrollment
}; 
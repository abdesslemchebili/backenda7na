const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { GERMAN_SUB_LEVELS, GERMAN_LEVELS, PAYMENT_STATUSES } = require('../constants/germanLevels');

const userSchema = new mongoose.Schema({
  // Informations de base
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom de famille est requis'],
    trim: true,
    maxlength: [50, 'Le nom de famille ne peut pas dépasser 50 caractères']
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Veuillez entrer un email valide']
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Veuillez entrer un numéro de téléphone valide']
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true
  },
  country: {
    type: String,
    trim: true,
    default: ''
  },
  dateOfBirth: {
    type: Date,
    default: null,
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  paymentStatus: {
    type: String,
    enum: PAYMENT_STATUSES,
    default: 'PENDING_PAYMENT'
  },

  // Rôles et statuts
  role: {
    type: String,
    enum: ['student', 'professor', 'admin'],
    default: 'student',
    required: true
  },
  adminLevel: {
    type: String,
    enum: ['super', 'content', 'support', 'full'],
    default: null
  },
  status: {
    type: String,
    enum: ['invited', 'pending', 'verified', 'reglo', 'suspended'],
    default: 'invited'
  },

  // Informations multilingues
  bio: {
    en: { type: String, maxlength: [500, 'La bio ne peut pas dépasser 500 caractères'] },
    fr: { type: String, maxlength: [500, 'La bio ne peut pas dépasser 500 caractères'] },
    ar: { type: String, maxlength: [500, 'La bio ne peut pas dépasser 500 caractères'] }
  },

  // Informations spécifiques aux étudiants
  studentInfo: {
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    germanSubLevel: {
      type: String,
      enum: GERMAN_SUB_LEVELS,
      default: null
    },
    placementLevel: {
      type: String,
      enum: GERMAN_LEVELS,
      default: null
    },
    placementTestCompleted: {
      type: Boolean,
      default: false
    },
    classGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup',
      default: null
    },
    education: {
      type: String,
      trim: true,
      default: ''
    },
    languages: [{
      language: {
        type: String,
        enum: ['english', 'french', 'arabic', 'spanish', 'german', 'italian']
      },
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced']
      }
    }],
    enrolledGroups: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassGroup'
    }],
    gamification: {
      totalXp: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastActivityDate: { type: Date, default: null },
      gamesPlayed: { type: Number, default: 0 },
      exercisesCompleted: { type: Number, default: 0 },
      badges: [{
        code: { type: String, required: true },
        earnedAt: { type: Date, default: Date.now },
      }],
    }
  },

  // Informations spécifiques aux professeurs
  professorInfo: {
    hourlyRate: {
      type: Number,
      min: 0,
      default: 0
    },
    /** Langues enseignées (catalogue Language) */
    teachingLanguages: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Language',
    }],
    specialties: [{
      language: {
        type: String,
        enum: ['english', 'french', 'arabic', 'spanish', 'german', 'italian']
      },
      level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced', 'all']
      }
    }],
    experience: {
      type: Number,
      min: [0, 'L\'expérience ne peut pas être négative']
    },
    education: {
      type: String,
      maxlength: [200, 'L\'éducation ne peut pas dépasser 200 caractères']
    }
  },

  // Authentification et sécurité
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  refreshToken: String,
  refreshTokenExpires: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,

  // Métadonnées
  avatar: {
    type: String,
    default: null
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  preferences: {
    language: {
      type: String,
      enum: ['en', 'fr', 'ar'],
      default: 'en'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'studentInfo.enrolledGroups': 1 });
userSchema.index({ 'studentInfo.classGroupId': 1 });

// Virtual pour le nom complet
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual pour vérifier si l'utilisateur est verrouillé
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Méthodes d'instance
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hashPassword = async function() {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
  }
};

userSchema.methods.incrementLoginAttempts = function() {
  // Si nous avons un verrou précédent qui a expiré
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Verrouiller le compte après 5 tentatives échouées
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 heures
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    await this.hashPassword();
  }
  next();
});

// Méthodes statiques
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findStudentsByStatus = function(status) {
  return this.find({ role: 'student', status });
};

userSchema.statics.findProfessors = function() {
  return this.find({ role: 'professor', status: { $in: ['verified', 'reglo'] } });
};

module.exports = mongoose.model('User', userSchema); 
const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  // Informations du candidat
  applicant: {
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
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Veuillez entrer un email valide']
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[1-9][\d]{0,15}$/, 'Veuillez entrer un numéro de téléphone valide']
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'La date de naissance est requise']
    },
    nationality: {
      type: String,
      required: [true, 'La nationalité est requise']
    }
  },

  // Informations professionnelles
  education: {
    degree: {
      type: String,
      required: [true, 'Le diplôme est requis'],
      maxlength: [100, 'Le diplôme ne peut pas dépasser 100 caractères']
    },
    institution: {
      type: String,
      required: [true, 'L\'institution est requise'],
      maxlength: [200, 'L\'institution ne peut pas dépasser 200 caractères']
    },
    graduationYear: {
      type: Number,
      required: [true, 'L\'année de diplôme est requise'],
      min: [1950, 'L\'année de diplôme doit être après 1950'],
      max: [new Date().getFullYear(), 'L\'année de diplôme ne peut pas être dans le futur']
    },
    field: {
      type: String,
      required: [true, 'Le domaine d\'étude est requis'],
      maxlength: [100, 'Le domaine d\'étude ne peut pas dépasser 100 caractères']
    }
  },

  // Expérience d'enseignement
  teachingExperience: {
    years: {
      type: Number,
      required: [true, 'Le nombre d\'années d\'expérience est requis'],
      min: [0, 'L\'expérience ne peut pas être négative'],
      max: [50, 'L\'expérience ne peut pas dépasser 50 ans']
    },
    description: {
      en: {
        type: String,
        required: [true, 'La description de l\'expérience en anglais est requise'],
        maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
      },
      fr: {
        type: String,
        required: [true, 'La description de l\'expérience en français est requise'],
        maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
      },
      ar: {
        type: String,
        required: [true, 'La description de l\'expérience en arabe est requise'],
        maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
      }
    },
    previousInstitutions: [{
      name: String,
      position: String,
      duration: String,
      description: String
    }]
  },

  // Langues et spécialités
  languages: [{
    language: {
      type: String,
      enum: ['english', 'french', 'arabic', 'spanish', 'german', 'italian'],
      required: true
    },
    proficiency: {
      type: String,
      enum: ['native', 'fluent', 'advanced', 'intermediate'],
      required: true
    },
    teachingLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'all'],
      required: true
    },
    certifications: [{
      name: String,
      issuingBody: String,
      dateObtained: Date,
      expiryDate: Date
    }]
  }],

  // Motivations et objectifs
  motivation: {
    en: {
      type: String,
      required: [true, 'La motivation en anglais est requise'],
      maxlength: [1000, 'La motivation ne peut pas dépasser 1000 caractères']
    },
    fr: {
      type: String,
      required: [true, 'La motivation en français est requise'],
      maxlength: [1000, 'La motivation ne peut pas dépasser 1000 caractères']
    },
    ar: {
      type: String,
      required: [true, 'La motivation en arabe est requise'],
      maxlength: [1000, 'La motivation ne peut pas dépasser 1000 caractères']
    }
  },

  // Disponibilité
  availability: {
    schedule: {
      type: String,
      enum: ['full-time', 'part-time', 'flexible'],
      required: true
    },
    timezone: {
      type: String,
      required: true
    },
    preferredHours: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      startTime: String,
      endTime: String
    }],
    startDate: {
      type: Date,
      required: true
    }
  },

  // Documents et références
  documents: {
    cv: {
      url: String,
      filename: String,
      uploadedAt: Date
    },
    coverLetter: {
      url: String,
      filename: String,
      uploadedAt: Date
    },
    certificates: [{
      url: String,
      filename: String,
      description: String,
      uploadedAt: Date
    }],
    references: [{
      name: String,
      position: String,
      institution: String,
      email: String,
      phone: String,
      relationship: String
    }]
  },

  // Statut de la candidature
  status: {
    type: String,
    enum: ['pending', 'under_review', 'shortlisted', 'approved', 'rejected', 'withdrawn'],
    default: 'pending'
  },

  // Évaluation
  evaluation: {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    criteria: {
      education: { type: Number, min: 0, max: 25 },
      experience: { type: Number, min: 0, max: 25 },
      languages: { type: Number, min: 0, max: 20 },
      motivation: { type: Number, min: 0, max: 15 },
      availability: { type: Number, min: 0, max: 15 }
    },
    notes: {
      en: String,
      fr: String,
      ar: String
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date
  },

  // Communication
  communication: [{
    type: {
      type: String,
      enum: ['email', 'phone', 'interview', 'test', 'other']
    },
    subject: String,
    message: String,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    isInternal: {
      type: Boolean,
      default: false
    }
  }],

  // Tests et entretiens
  tests: [{
    type: {
      type: String,
      enum: ['language_test', 'teaching_demo', 'written_test', 'interview']
    },
    scheduledAt: Date,
    completedAt: Date,
    score: Number,
    feedback: String,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'passed', 'failed', 'cancelled'],
      default: 'scheduled'
    }
  }],

  // Métadonnées
  source: {
    type: String,
    enum: ['website', 'referral', 'job_board', 'social_media', 'other'],
    default: 'website'
  },
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
applicationSchema.index({ 'applicant.email': 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ 'evaluation.reviewedBy': 1 });
applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ priority: 1, status: 1 });

// Virtual pour le nom complet du candidat
applicationSchema.virtual('applicant.fullName').get(function() {
  return `${this.applicant.firstName} ${this.applicant.lastName}`;
});

// Virtual pour l'âge du candidat
applicationSchema.virtual('applicant.age').get(function() {
  if (!this.applicant.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.applicant.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Virtual pour vérifier si la candidature est en cours de traitement
applicationSchema.virtual('isActive').get(function() {
  return ['pending', 'under_review', 'shortlisted'].includes(this.status);
});

// Méthodes d'instance
applicationSchema.methods.updateStatus = function(newStatus, reviewedBy = null, notes = null) {
  this.status = newStatus;
  
  if (reviewedBy) {
    this.evaluation.reviewedBy = reviewedBy;
    this.evaluation.reviewedAt = new Date();
  }
  
  if (notes) {
    this.evaluation.notes = notes;
  }
  
  return this.save();
};

applicationSchema.methods.addCommunication = function(type, subject, message, sentBy, isInternal = false) {
  this.communication.push({
    type,
    subject,
    message,
    sentBy,
    isInternal
  });
  
  return this.save();
};

applicationSchema.methods.scheduleTest = function(type, scheduledAt) {
  this.tests.push({
    type,
    scheduledAt,
    status: 'scheduled'
  });
  
  return this.save();
};

// Méthodes statiques
applicationSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('evaluation.reviewedBy', 'firstName lastName email');
};

applicationSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: 1 });
};

applicationSchema.statics.findByReviewer = function(reviewerId) {
  return this.find({ 'evaluation.reviewedBy': reviewerId });
};

applicationSchema.statics.findByEmail = function(email) {
  return this.findOne({ 'applicant.email': email.toLowerCase() });
};

module.exports = mongoose.model('Application', applicationSchema); 
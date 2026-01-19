const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  // Informations de base multilingues
  title: {
    en: {
      type: String,
      required: [true, 'Le titre en anglais est requis'],
      trim: true,
      maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères']
    },
    fr: {
      type: String,
      required: [true, 'Le titre en français est requis'],
      trim: true,
      maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères']
    },
    ar: {
      type: String,
      required: [true, 'Le titre en arabe est requis'],
      trim: true,
      maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères']
    }
  },
  description: {
    en: {
      type: String,
      required: [true, 'La description en anglais est requise'],
      maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
    },
    fr: {
      type: String,
      required: [true, 'La description en français est requise'],
      maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
    },
    ar: {
      type: String,
      required: [true, 'La description en arabe est requise'],
      maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
    }
  },
  shortDescription: {
    en: {
      type: String,
      maxlength: [200, 'La description courte ne peut pas dépasser 200 caractères']
    },
    fr: {
      type: String,
      maxlength: [200, 'La description courte ne peut pas dépasser 200 caractères']
    },
    ar: {
      type: String,
      maxlength: [200, 'La description courte ne peut pas dépasser 200 caractères']
    }
  },

  // Informations du cours
  language: {
    type: String,
    enum: ['english', 'french', 'arabic', 'spanish', 'german', 'italian'],
    required: true
  },
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  category: {
    type: String,
    enum: ['grammar', 'conversation', 'business', 'academic', 'culture', 'exam_prep'],
    required: true
  },
  duration: {
    type: Number, // en heures
    required: true,
    min: [1, 'La durée doit être d\'au moins 1 heure']
  },
  maxStudents: {
    type: Number,
    default: 20,
    min: [1, 'Le nombre maximum d\'étudiants doit être d\'au moins 1']
  },

  // Professeur et participants
  professor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enrolledStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    completed: {
      type: Boolean,
      default: false
    }
  }],

  // Contenu du cours
  syllabus: [{
    week: {
      type: Number,
      required: true
    },
    title: {
      en: String,
      fr: String,
      ar: String
    },
    description: {
      en: String,
      fr: String,
      ar: String
    },
    objectives: [{
      en: String,
      fr: String,
      ar: String
    }],
    materials: [{
      type: {
        type: String,
        enum: ['video', 'document', 'audio', 'link']
      },
      title: {
        en: String,
        fr: String,
        ar: String
      },
      url: String,
      duration: Number // pour les vidéos/audio en minutes
    }]
  }],

  // Évaluations et certifications
  assessments: [{
    type: {
      type: String,
      enum: ['quiz', 'assignment', 'presentation', 'exam']
    },
    title: {
      en: String,
      fr: String,
      ar: String
    },
    description: {
      en: String,
      fr: String,
      ar: String
    },
    weight: {
      type: Number,
      min: 0,
      max: 100
    },
    dueDate: Date
  }],

  // Prix et paiement
  price: {
    type: Number,
    required: true,
    min: [0, 'Le prix ne peut pas être négatif']
  },
  currency: {
    type: String,
    enum: ['USD', 'EUR', 'MAD'],
    default: 'MAD'
  },
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    validUntil: Date
  },

  // Statut et visibilité
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'suspended'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  featured: {
    type: Boolean,
    default: false
  },

  // Métadonnées
  thumbnail: {
    type: String,
    default: null
  },
  tags: [{
    en: String,
    fr: String,
    ar: String
  }],
  prerequisites: [{
    en: String,
    fr: String,
    ar: String
  }],

  // Statistiques
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  views: {
    type: Number,
    default: 0
  },
  enrollments: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
courseSchema.index({ professor: 1 });
courseSchema.index({ language: 1, level: 1 });
courseSchema.index({ status: 1, isPublic: 1 });
courseSchema.index({ featured: 1, status: 1 });
courseSchema.index({ 'enrolledStudents.student': 1 });

// Virtual pour le prix avec remise
courseSchema.virtual('finalPrice').get(function() {
  if (this.discount && this.discount.percentage > 0 && 
      (!this.discount.validUntil || this.discount.validUntil > new Date())) {
    return this.price * (1 - this.discount.percentage / 100);
  }
  return this.price;
});

// Virtual pour le nombre d'étudiants inscrits
courseSchema.virtual('enrolledCount').get(function() {
  return this.enrolledStudents.length;
});

// Virtual pour vérifier si le cours est complet
courseSchema.virtual('isFull').get(function() {
  return this.enrolledStudents.length >= this.maxStudents;
});

// Méthodes d'instance
courseSchema.methods.enrollStudent = function(studentId) {
  if (this.isFull) {
    throw new Error('Le cours est complet');
  }
  
  const alreadyEnrolled = this.enrolledStudents.some(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (alreadyEnrolled) {
    throw new Error('L\'étudiant est déjà inscrit à ce cours');
  }
  
  this.enrolledStudents.push({
    student: studentId,
    enrolledAt: new Date()
  });
  
  this.enrollments += 1;
  return this.save();
};

courseSchema.methods.unenrollStudent = function(studentId) {
  const enrollmentIndex = this.enrolledStudents.findIndex(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (enrollmentIndex === -1) {
    throw new Error('L\'étudiant n\'est pas inscrit à ce cours');
  }
  
  this.enrolledStudents.splice(enrollmentIndex, 1);
  this.enrollments = Math.max(0, this.enrollments - 1);
  return this.save();
};

courseSchema.methods.updateStudentProgress = function(studentId, progress) {
  const enrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (!enrollment) {
    throw new Error('L\'étudiant n\'est pas inscrit à ce cours');
  }
  
  enrollment.progress = Math.max(0, Math.min(100, progress));
  enrollment.completed = enrollment.progress >= 100;
  
  return this.save();
};

// Méthodes statiques
courseSchema.statics.findByLanguageAndLevel = function(language, level) {
  return this.find({ 
    language, 
    level, 
    status: 'published', 
    isPublic: true 
  });
};

courseSchema.statics.findByProfessor = function(professorId) {
  return this.find({ professor: professorId });
};

courseSchema.statics.findFeatured = function() {
  return this.find({ 
    featured: true, 
    status: 'published', 
    isPublic: true 
  });
};

module.exports = mongoose.model('Course', courseSchema); 
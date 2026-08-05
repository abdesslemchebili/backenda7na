const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
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
      maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
    },
    fr: {
      type: String,
      maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
    },
    ar: {
      type: String,
      maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
    }
  },

  // Informations de la classe
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  /** Optional cohort link (scheduled session for a class group) */
  classGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassGroup',
    default: null
  },
  professor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['live', 'recorded'],
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled'
  },

  // Planification pour les cours en direct
  schedule: {
    startTime: {
      type: Date,
      required: function() { return this.type === 'live'; }
    },
    endTime: {
      type: Date,
      required: function() { return this.type === 'live'; }
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    recurrence: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none'
    },
    recurrenceEndDate: Date
  },

  // Contenu pour les cours préenregistrés
  content: {
    videoUrl: String,
    videoDuration: Number, // en minutes
    documents: [{
      title: {
        en: String,
        fr: String,
        ar: String
      },
      url: String,
      type: {
        type: String,
        enum: ['pdf', 'doc', 'ppt', 'image', 'other']
      },
      size: Number // en bytes
    }],
    audioUrl: String,
    audioDuration: Number, // en minutes
    transcript: {
      en: String,
      fr: String,
      ar: String
    }
  },

  // Participants
  enrolledStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    attended: {
      type: Boolean,
      default: false
    },
    attendanceTime: Date,
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    completed: {
      type: Boolean,
      default: false
    },
    completionTime: Date
  }],

  // Limites et capacités
  maxStudents: {
    type: Number,
    default: 20,
    min: [1, 'Le nombre maximum d\'étudiants doit être d\'au moins 1']
  },
  minStudents: {
    type: Number,
    default: 1,
    min: [1, 'Le nombre minimum d\'étudiants doit être d\'au moins 1']
  },

  // Configuration pour les cours en direct
  liveConfig: {
    platform: {
      type: String,
      enum: ['zoom', 'teams', 'meet', 'custom'],
      default: 'zoom'
    },
    meetingUrl: String,
    meetingId: String,
    meetingPassword: String,
    waitingRoom: {
      type: Boolean,
      default: true
    },
    recording: {
      type: Boolean,
      default: false
    },
    recordingStarted: Boolean,
    recordingUrl: String,
    sessionStartedAt: Date,
    sessionEndedAt: Date
  },

  // Matériaux et ressources
  materials: [{
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
    type: {
      type: String,
      enum: ['document', 'video', 'audio', 'link', 'quiz']
    },
    url: String,
    isRequired: {
      type: Boolean,
      default: false
    },
    isPublic: {
      type: Boolean,
      default: true
    }
  }],

  // Notes et commentaires
  notes: {
    en: String,
    fr: String,
    ar: String
  },
  objectives: [{
    en: String,
    fr: String,
    ar: String
  }],

  // Évaluations
  assessments: [{
    type: {
      type: String,
      enum: ['quiz', 'assignment', 'participation']
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
    dueDate: Date,
    isRequired: {
      type: Boolean,
      default: false
    }
  }],

  // Métadonnées
  thumbnail: String,
  tags: [{
    en: String,
    fr: String,
    ar: String
  }],

  // Statistiques
  views: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour améliorer les performances
classSchema.index({ course: 1 });
classSchema.index({ professor: 1 });
classSchema.index({ type: 1, status: 1 });
classSchema.index({ 'schedule.startTime': 1 });
classSchema.index({ 'enrolledStudents.student': 1 });

// Virtual pour vérifier si la classe est en cours
classSchema.virtual('isOngoing').get(function() {
  if (this.type !== 'live' || this.status !== 'ongoing') return false;
  const now = new Date();
  return this.schedule.startTime <= now && this.schedule.endTime >= now;
});

// Virtual pour vérifier si la classe est complète
classSchema.virtual('isFull').get(function() {
  return this.enrolledStudents.length >= this.maxStudents;
});

// Virtual pour le nombre d'étudiants inscrits
classSchema.virtual('enrolledCount').get(function() {
  return this.enrolledStudents.length;
});

// Virtual pour la durée de la classe
classSchema.virtual('duration').get(function() {
  if (this.type === 'live' && this.schedule.startTime && this.schedule.endTime) {
    return (this.schedule.endTime - this.schedule.startTime) / (1000 * 60); // en minutes
  }
  if (this.type === 'recorded') {
    return this.content.videoDuration || this.content.audioDuration || 0;
  }
  return 0;
});

// Méthodes d'instance
classSchema.methods.enrollStudent = function(studentId) {
  if (this.isFull) {
    throw new Error('La classe est complète');
  }
  
  const alreadyEnrolled = this.enrolledStudents.some(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (alreadyEnrolled) {
    throw new Error('L\'étudiant est déjà inscrit à cette classe');
  }
  
  this.enrolledStudents.push({
    student: studentId,
    enrolledAt: new Date()
  });
  
  return this.save();
};

classSchema.methods.markAttendance = function(studentId) {
  const enrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (!enrollment) {
    throw new Error('L\'étudiant n\'est pas inscrit à cette classe');
  }
  
  enrollment.attended = true;
  enrollment.attendanceTime = new Date();
  
  return this.save();
};

classSchema.methods.updateProgress = function(studentId, progress) {
  const enrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (!enrollment) {
    throw new Error('L\'étudiant n\'est pas inscrit à cette classe');
  }
  
  enrollment.progress = Math.max(0, Math.min(100, progress));
  enrollment.completed = enrollment.progress >= 100;
  
  if (enrollment.completed && !enrollment.completionTime) {
    enrollment.completionTime = new Date();
  }
  
  return this.save();
};

// Méthodes statiques
classSchema.statics.findByCourse = function(courseId) {
  return this.find({ course: courseId }).populate('professor', 'firstName lastName email');
};

classSchema.statics.findLiveClasses = function() {
  return this.find({ 
    type: 'live', 
    status: { $in: ['scheduled', 'ongoing'] } 
  });
};

classSchema.statics.findUpcomingClasses = function() {
  const now = new Date();
  return this.find({
    type: 'live',
    status: 'scheduled',
    'schedule.startTime': { $gt: now }
  });
};

module.exports = mongoose.model('Class', classSchema); 
const Application = require('../models/Application');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');

// @desc    Récupérer toutes les candidatures (avec filtres)
// @route   GET /api/applications
// @access  Admins seulement
const getAllApplications = async (req, res) => {
  try {
    const { 
      status, 
      language, 
      search, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
    if (status) filters.status = status;
    if (language) filters.languages = language;
    if (search) {
      filters.$or = [
        { 'applicant.firstName': { $regex: search, $options: 'i' } },
        { 'applicant.lastName': { $regex: search, $options: 'i' } },
        { 'applicant.email': { $regex: search, $options: 'i' } },
        { 'motivation.en': { $regex: search, $options: 'i' } },
        { 'motivation.fr': { $regex: search, $options: 'i' } },
        { 'motivation.ar': { $regex: search, $options: 'i' } }
      ];
    }

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const applications = await Application.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('evaluation.reviewedBy', 'firstName lastName email');

    const total = await Application.countDocuments(filters);

    res.json({
      data: applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllApplications:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des candidatures' 
    });
  }
};

// @desc    Récupérer une candidature par ID
// @route   GET /api/applications/:id
// @access  Admin ou candidat propriétaire
const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id)
      .populate('evaluation.reviewedBy', 'firstName lastName email');

    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role !== 'admin' && application.applicant.email !== req.user.email) {
      return res.status(403).json({ 
        success: false, 
        error: 'Accès non autorisé à cette candidature' 
      });
    }

    res.json(application);
  } catch (error) {
    console.error('Erreur getApplicationById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération de la candidature' 
    });
  }
};

// @desc    Créer une nouvelle candidature
// @route   POST /api/applications
// @access  Public
const createApplication = async (req, res) => {
  try {
    const applicationData = req.body;

    // Vérifier si une candidature existe déjà pour cet email
    const existingApplication = await Application.findByEmail(applicationData.applicant?.email || applicationData.email);

    if (existingApplication) {
      return res.status(400).json({ 
        success: false, 
        error: 'Une candidature existe déjà pour cet email' 
      });
    }

    const application = new Application(applicationData);
    await application.save();

    // Envoyer un email de confirmation
    await sendEmail(
      application.applicant.email,
      'Candidature reçue',
      'candidature_recue',
      { 
        firstName: application.applicant.firstName,
        applicationId: application._id
      }
    );

    // Envoyer une notification aux admins
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await sendEmail(
        admin.email,
        'Nouvelle candidature de professeur',
        'nouvelle_candidature',
        { 
          adminName: admin.firstName,
          candidateName: `${application.applicant.firstName} ${application.applicant.lastName}`,
          candidateEmail: application.applicant.email,
          applicationId: application._id
        }
      );
    }

    res.status(201).json(application);
  } catch (error) {
    console.error('Erreur createApplication:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la soumission de la candidature' 
    });
  }
};

// @desc    Mettre à jour une candidature
// @route   PUT /api/applications/:id
// @access  Admin seulement
const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    const updatedApplication = await Application.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('evaluatedBy', 'firstName lastName email');

    res.json({
      _id: updatedApplication._id,
      applicant: {
        firstName: updatedApplication.applicant.firstName,
        lastName: updatedApplication.applicant.lastName,
        email: updatedApplication.applicant.email
      },
      status: updatedApplication.status,
      priority: updatedApplication.priority,
      tags: updatedApplication.tags,
      updatedAt: updatedApplication.updatedAt
    });
  } catch (error) {
    console.error('Erreur updateApplication:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour de la candidature' 
    });
  }
};

// @desc    Mettre à jour le statut d'une candidature
// @route   PATCH /api/applications/:id/status
// @access  Admin seulement
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, notes } = req.body;

    const validStatuses = ['pending', 'under_review', 'shortlisted', 'approved', 'rejected', 'withdrawn'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Statut invalide' 
      });
    }

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    // Utiliser la méthode du modèle pour mettre à jour le statut
    const notesObj = notes ? { en: notes, fr: notes, ar: notes } : null;
    await application.updateStatus(status, req.user._id, notesObj);

    // Envoyer un email de notification
    let emailTemplate = '';
    let emailSubject = '';

    switch (status) {
      case 'approved':
        emailTemplate = 'candidature_approuvee';
        emailSubject = 'Candidature approuvée';
        break;
      case 'rejected':
        emailTemplate = 'candidature_rejetee';
        emailSubject = 'Candidature rejetée';
        break;
      case 'interview_scheduled':
        emailTemplate = 'entretien_programme';
        emailSubject = 'Entretien programmé';
        break;
      case 'under_review':
        emailTemplate = 'candidature_en_revue';
        emailSubject = 'Candidature en cours d\'examen';
        break;
    }

    if (emailTemplate) {
      await sendEmail(
        application.email,
        emailSubject,
        emailTemplate,
        { 
          firstName: application.firstName,
          reason: reason || '',
          notes: notes || ''
        }
      );
    }

    const populatedApplication = await Application.findById(id)
      .populate('evaluation.reviewedBy', 'firstName lastName email');

    res.json({
      _id: populatedApplication._id,
      applicant: {
        firstName: populatedApplication.applicant.firstName,
        lastName: populatedApplication.applicant.lastName,
        email: populatedApplication.applicant.email
      },
      status: populatedApplication.status,
      updatedAt: populatedApplication.updatedAt
    });
  } catch (error) {
    console.error('Erreur updateStatus:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du statut' 
    });
  }
};

// @desc    Ajouter une communication à une candidature
// @route   POST /api/applications/:id/communication
// @access  Admin seulement
const addCommunication = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, message, scheduledAt } = req.body;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    // Utiliser la méthode du modèle pour ajouter une communication
    const subject = `Communication - ${type}`;
    await application.addCommunication(type, subject, message, req.user._id, false);

    // Envoyer l'email si c'est immédiat
    if (!scheduledAt) {
      await sendEmail(
        application.applicant.email,
        subject,
        'communication_candidature',
        { 
          firstName: application.applicant.firstName,
          message,
          type
        }
      );
    }

    res.json({ 
      message: 'Communication added successfully'
    });
  } catch (error) {
    console.error('Erreur addCommunication:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'ajout de la communication' 
    });
  }
};

// @desc    Programmer un test pour une candidature
// @route   POST /api/applications/:id/test
// @access  Admin seulement
const scheduleTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { testType, scheduledAt, duration, instructions } = req.body;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    // Utiliser la méthode du modèle pour programmer un test
    await application.scheduleTest(testType, new Date(scheduledAt));

    // Envoyer un email de notification
    await sendEmail(
      application.applicant.email,
      'Test programmé',
      'test_programme',
      { 
        firstName: application.applicant.firstName,
        testType,
        scheduledAt: new Date(scheduledAt),
        duration,
        instructions
      }
    );

    res.json({ 
      message: 'Test scheduled successfully'
    });
  } catch (error) {
    console.error('Erreur scheduleTest:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la programmation du test' 
    });
  }
};

// @desc    Évaluer une candidature
// @route   POST /api/applications/:id/evaluate
// @access  Admin seulement
const evaluateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      overallScore, 
      technicalScore, 
      communicationScore, 
      experienceScore,
      strengths,
      weaknesses,
      recommendation,
      finalDecision 
    } = req.body;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        error: 'Candidature non trouvée' 
      });
    }

    // Mettre à jour l'évaluation (structure unique dans le modèle)
    application.evaluation.score = overallScore || 0;
    application.evaluation.criteria = {
      education: technicalScore || 0,
      experience: experienceScore || 0,
      languages: communicationScore || 0,
      motivation: 0,
      availability: 0
    };
    application.evaluation.notes = {
      en: `${strengths || ''}\n${weaknesses || ''}\n${recommendation || ''}`,
      fr: `${strengths || ''}\n${weaknesses || ''}\n${recommendation || ''}`,
      ar: `${strengths || ''}\n${weaknesses || ''}\n${recommendation || ''}`
    };
    application.evaluation.reviewedBy = req.user._id;
    application.evaluation.reviewedAt = new Date();
    
    // Mettre à jour le statut si une décision finale est fournie
    if (finalDecision && ['approved', 'rejected'].includes(finalDecision)) {
      application.status = finalDecision;
    }
    
    await application.save();

    const populatedApplication = await Application.findById(id)
      .populate('evaluation.reviewedBy', 'firstName lastName email');

    res.json({ 
      message: 'Evaluation submitted successfully'
    });
  } catch (error) {
    console.error('Erreur evaluateApplication:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'évaluation de la candidature' 
    });
  }
};

// @desc    Obtenir les statistiques des candidatures
// @route   GET /api/applications/stats/overview
// @access  Admin seulement
const getApplicationStats = async (req, res) => {
  try {
    const stats = await Application.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          under_review: {
            $sum: { $cond: [{ $eq: ['$status', 'under_review'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
          shortlisted: {
            $sum: { $cond: [{ $eq: ['$status', 'shortlisted'] }, 1, 0] }
          },
          withdrawn: {
            $sum: { $cond: [{ $eq: ['$status', 'withdrawn'] }, 1, 0] }
          }
        }
      }
    ]);

    // Statistiques par mois (derniers 6 mois)
    const monthlyStats = await Application.aggregate([
      {
        $match: {
          createdAt: { 
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) 
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    const overview = stats[0] || {
      total: 0,
      pending: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      shortlisted: 0,
      withdrawn: 0
    };

    res.json({
      total: overview.total,
      pending: overview.pending,
      underReview: overview.under_review,
      approved: overview.approved,
      rejected: overview.rejected
    });
  } catch (error) {
    console.error('Erreur getApplicationStats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des statistiques' 
    });
  }
};

module.exports = {
  getAllApplications,
  getApplicationById,
  createApplication,
  updateApplication,
  updateStatus,
  addCommunication,
  scheduleTest,
  evaluateApplication,
  getApplicationStats
}; 
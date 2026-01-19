const User = require('../models/User');
const Course = require('../models/Course');
const { sendEmail } = require('../utils/emailService');

// @desc    Récupérer tous les utilisateurs (avec filtres)
// @route   GET /api/users
// @access  Admin seulement
const getAllUsers = async (req, res) => {
  try {
    const { 
      role, 
      status, 
      search, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
    if (role) filters.role = role;
    if (status) filters.status = status;
    if (search) {
      filters.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filters)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('studentInfo.enrolledCourses', 'title')
      .populate('professorInfo.courses', 'title');

    const total = await User.countDocuments(filters);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllUsers:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des utilisateurs' 
    });
  }
};

// @desc    Récupérer un utilisateur par ID
// @route   GET /api/users/:id
// @access  Admin ou propriétaire du profil
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('studentInfo.enrolledCourses', 'title description')
      .populate('professorInfo.courses', 'title description');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Erreur getUserById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération de l\'utilisateur' 
    });
  }
};

// @desc    Mettre à jour un utilisateur
// @route   PUT /api/users/:id
// @access  Admin ou propriétaire du profil
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Empêcher la modification de certains champs sensibles
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData.adminLevel;
    delete updateData.emailVerified;
    delete updateData.loginAttempts;
    delete updateData.lockUntil;

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }

    res.json({ 
      success: true, 
      data: user,
      message: 'Utilisateur mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur updateUser:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour de l\'utilisateur' 
    });
  }
};

// @desc    Supprimer un utilisateur
// @route   DELETE /api/users/:id
// @access  Admin seulement
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'utilisateur n'est pas un admin super
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }

    if (user.role === 'admin' && user.adminLevel === 'super') {
      return res.status(403).json({ 
        success: false, 
        error: 'Impossible de supprimer un administrateur super' 
      });
    }

    await User.findByIdAndDelete(id);

    res.json({ 
      success: true, 
      message: 'Utilisateur supprimé avec succès' 
    });
  } catch (error) {
    console.error('Erreur deleteUser:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la suppression de l\'utilisateur' 
    });
  }
};

// @desc    Mettre à jour le statut d'un utilisateur
// @route   PATCH /api/users/:id/status
// @access  Admin seulement
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const validStatuses = ['invited', 'pending', 'verified', 'reglo', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Statut invalide' 
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    ).select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }

    // Envoyer un email de notification si le statut change
    if (status === 'reglo') {
      await sendEmail(
        user.email,
        'Compte activé',
        'votre_compte_est_active',
        { 
          firstName: user.firstName,
          status: 'reglo',
          reason: reason || 'Paiement confirmé'
        }
      );
    } else if (status === 'suspended') {
      await sendEmail(
        user.email,
        'Compte suspendu',
        'compte_suspendu',
        { 
          firstName: user.firstName,
          reason: reason || 'Violation des conditions d\'utilisation'
        }
      );
    }

    res.json({ 
      success: true, 
      data: user,
      message: `Statut de l'utilisateur mis à jour vers ${status}`
    });
  } catch (error) {
    console.error('Erreur updateUserStatus:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du statut' 
    });
  }
};

// @desc    Obtenir les statistiques des utilisateurs
// @route   GET /api/users/stats/overview
// @access  Admin seulement
const getUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          students: {
            $sum: { $cond: [{ $eq: ['$role', 'student'] }, 1, 0] }
          },
          professors: {
            $sum: { $cond: [{ $eq: ['$role', 'professor'] }, 1, 0] }
          },
          admins: {
            $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
          },
          reglo: {
            $sum: { $cond: [{ $eq: ['$status', 'reglo'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          invited: {
            $sum: { $cond: [{ $eq: ['$status', 'invited'] }, 1, 0] }
          },
          suspended: {
            $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
          }
        }
      }
    ]);

    // Statistiques par mois (derniers 6 mois)
    const monthlyStats = await User.aggregate([
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

    res.json({
      success: true,
      data: {
        overview: stats[0] || {
          total: 0,
          students: 0,
          professors: 0,
          admins: 0,
          reglo: 0,
          pending: 0,
          invited: 0,
          suspended: 0
        },
        monthly: monthlyStats
      }
    });
  } catch (error) {
    console.error('Erreur getUserStats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des statistiques' 
    });
  }
};

// @desc    Obtenir le profil de l'utilisateur connecté
// @route   GET /api/users/profile
// @access  Utilisateur connecté
const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('studentInfo.enrolledCourses', 'title description')
      .populate('professorInfo.courses', 'title description');

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Erreur getMyProfile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération du profil' 
    });
  }
};

// @desc    Mettre à jour le profil de l'utilisateur connecté
// @route   PUT /api/users/profile
// @access  Utilisateur connecté
const updateMyProfile = async (req, res) => {
  try {
    const updateData = req.body;

    // Empêcher la modification de certains champs sensibles
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData.adminLevel;
    delete updateData.status;
    delete updateData.emailVerified;
    delete updateData.loginAttempts;
    delete updateData.lockUntil;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -emailVerificationToken -passwordResetToken');

    res.json({ 
      success: true, 
      data: user,
      message: 'Profil mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur updateMyProfile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du profil' 
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  getUserStats,
  getMyProfile,
  updateMyProfile
}; 
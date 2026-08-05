const User = require('../models/User');
const Course = require('../models/Course');
const { sendPaymentStatusUpdate } = require('../utils/emailService');
const { enrollStudentFromAssignedClassGroup } = require('../utils/courseEnrollment');
const { writeAuditLog } = require('../utils/auditLog');

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
        error: 'NotFound', 
        message: 'User not found' 
      });
    }

    res.json(user);
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
        error: 'NotFound', 
        message: 'User not found' 
      });
    }

    res.json(user);
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
        error: 'NotFound', 
        message: 'User not found' 
      });
    }

    if (user.role === 'admin' && (user.adminLevel === 'super' || user.adminLevel === 'full')) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Cannot delete super admin' 
      });
    }

    await User.findByIdAndDelete(id);

    res.json({ 
      message: 'User deleted successfully' 
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
        error: 'BadRequest', 
        message: 'Invalid status' 
      });
    }

    const update = { status };
    if (status === 'reglo') update.paymentStatus = 'PAYMENT_APPROVED';

    const user = await User.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ 
        error: 'NotFound', 
        message: 'User not found' 
      });
    }

    if (status === 'reglo') {
      try {
        await sendPaymentStatusUpdate(user, 'ACTIVE', user.preferences?.language || 'fr');
      } catch (emailErr) {
        console.error('Status email failed:', emailErr.message);
      }
      if (user.role === 'student') {
        await enrollStudentFromAssignedClassGroup(user._id);
      }
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt
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
          verified: {
            $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] }
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

    const overview = stats[0] || {
      total: 0,
      students: 0,
      professors: 0,
      admins: 0,
      reglo: 0,
      pending: 0,
      invited: 0,
      verified: 0,
      suspended: 0
    };

    res.json({
      total: overview.total,
      students: overview.students,
      professors: overview.professors,
      admins: overview.admins,
      byStatus: {
        invited: overview.invited,
        pending: overview.pending,
        verified: overview.verified,
        reglo: overview.reglo,
        suspended: overview.suspended
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

// @desc    Change user role (admin only)
// @route   PATCH /api/users/:id/role
// @access  Admin only
const changeUserRole = async (req, res) => {
  try {
    if (req.user.adminLevel !== 'super') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only super administrators can change user roles'
      });
    }

    const { id } = req.params;
    const { role, adminLevel } = req.body;

    const validRoles = ['student', 'professor', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Valid role is required (student, professor, admin)'
      });
    }

    if (role === 'admin' && !adminLevel) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'adminLevel is required when assigning admin role'
      });
    }

    const target = await User.findById(id).select('role adminLevel email firstName lastName');
    if (!target) {
      return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    }

    const update = {
      role,
      adminLevel: role === 'admin' ? adminLevel : null
    };

    const user = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .select('-password -emailVerificationToken -passwordResetToken');

    await writeAuditLog(req, {
      action: 'user.role_change',
      targetType: 'User',
      targetId: user._id,
      details: {
        previousRole: target.role,
        previousAdminLevel: target.adminLevel,
        newRole: role,
        newAdminLevel: update.adminLevel,
        targetEmail: target.email
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Erreur changeUserRole:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du changement de rôle'
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

    res.json(user);
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

    res.json(user);
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
  changeUserRole,
  getUserStats,
  getMyProfile,
  updateMyProfile
}; 
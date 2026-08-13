const User = require('../models/User');
const Course = require('../models/Course');
const Language = require('../models/Language');
const {
  sendPaymentStatusUpdate,
  sendUserInvitation,
  generateTempPassword,
} = require('../utils/emailService');
const { enrollStudentFromAssignedClassGroup } = require('../utils/courseEnrollment');
const { writeAuditLog } = require('../utils/auditLog');

const SPECIALTY_BY_CODE = {
  en: 'english',
  eng: 'english',
  english: 'english',
  fr: 'french',
  fra: 'french',
  french: 'french',
  ar: 'arabic',
  ara: 'arabic',
  arabic: 'arabic',
  es: 'spanish',
  spa: 'spanish',
  spanish: 'spanish',
  de: 'german',
  ger: 'german',
  deu: 'german',
  german: 'german',
  it: 'italian',
  ita: 'italian',
  italian: 'italian',
};

function parseDateOfBirth(raw) {
  if (raw == null || raw === '') return { value: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { error: 'Date de naissance invalide' };
  }
  const today = new Date();
  if (date > today) {
    return { error: 'La date de naissance ne peut pas être dans le futur' };
  }
  const min = new Date();
  min.setFullYear(min.getFullYear() - 120);
  if (date < min) {
    return { error: 'Date de naissance invalide' };
  }
  return { value: date };
}

async function resolveTeachingLanguages(rawIds) {
  const ids = [...new Set(
    (Array.isArray(rawIds) ? rawIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];
  if (!ids.length) {
    return { error: 'Au moins une langue enseignée est requise pour un professeur' };
  }
  const languages = await Language.find({ _id: { $in: ids }, active: true }).select('_id code name');
  if (languages.length !== ids.length) {
    return { error: 'Une ou plusieurs langues sont invalides ou inactives' };
  }
  const specialties = languages
    .map((lang) => SPECIALTY_BY_CODE[String(lang.code || '').toLowerCase()])
    .filter(Boolean)
    .map((language) => ({ language, level: 'all' }));
  return {
    teachingLanguages: languages.map((l) => l._id),
    specialties,
  };
}

// @desc    Créer un utilisateur (étudiant / professeur / admin)
// @route   POST /api/users
// @access  Admin (super, full)
const createUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      role = 'student',
      adminLevel,
      password,
      language = 'fr',
      sendInviteEmail = true,
      markStudentPaid = false,
      teachingLanguageIds,
      dateOfBirth,
    } = req.body || {};

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Prénom, nom et email sont requis',
      });
    }

    const dob = parseDateOfBirth(dateOfBirth);
    if (dob.error) {
      return res.status(400).json({
        error: 'ValidationError',
        message: dob.error,
      });
    }

    if (!['student', 'professor', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Rôle invalide (student, professor, admin)',
      });
    }

    if (role === 'admin' && !adminLevel) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Le niveau admin est requis pour un compte admin',
      });
    }

    let professorInfo;
    if (role === 'professor') {
      const resolved = await resolveTeachingLanguages(teachingLanguageIds);
      if (resolved.error) {
        return res.status(400).json({
          error: 'ValidationError',
          message: resolved.error,
        });
      }
      professorInfo = {
        teachingLanguages: resolved.teachingLanguages,
        specialties: resolved.specialties,
      };
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Un utilisateur avec cet email existe déjà',
      });
    }

    const tempPassword =
      typeof password === 'string' && password.trim().length >= 6
        ? password.trim()
        : generateTempPassword();

    let status = 'verified';
    if (role === 'student') {
      status = markStudentPaid ? 'reglo' : 'verified';
    } else if (role === 'professor') {
      status = 'verified';
    } else if (role === 'admin') {
      status = 'reglo';
    }

    const user = new User({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      password: tempPassword,
      role,
      adminLevel: role === 'admin' ? adminLevel : null,
      status,
      dateOfBirth: dob.value,
      emailVerified: true,
      mustChangePassword: true,
      paymentStatus: role === 'student' && markStudentPaid ? 'PAYMENT_APPROVED' : undefined,
      ...(professorInfo ? { professorInfo } : {}),
    });
    await user.save();

    let emailSent = false;
    if (sendInviteEmail) {
      try {
        await sendUserInvitation(user, tempPassword, language);
        emailSent = true;
      } catch (emailErr) {
        console.warn('createUser invitation email failed:', emailErr.message || emailErr);
      }
    }

    await writeAuditLog(req, {
      action: 'user.create',
      targetType: 'User',
      targetId: user._id,
      details: {
        role,
        emailSent,
        status,
        teachingLanguageIds: professorInfo?.teachingLanguages || undefined,
      },
    });

    const populated = await User.findById(user._id)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('professorInfo.teachingLanguages', 'name code nativeName icon');

    res.status(201).json({
      message: emailSent
        ? 'Utilisateur créé et invitation envoyée'
        : 'Utilisateur créé (email non envoyé — communiquez le mot de passe manuellement)',
      user: populated || {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      temporaryPassword: tempPassword,
      emailSent,
      mustChangePassword: true,
    });
  } catch (error) {
    console.error('createUser:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Impossible de créer l’utilisateur',
    });
  }
};

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
      .populate('professorInfo.courses', 'title')
      .populate('professorInfo.teachingLanguages', 'name code nativeName icon');

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
      .populate('professorInfo.courses', 'title description')
      .populate('professorInfo.teachingLanguages', 'name code nativeName icon');

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
    const body = { ...(req.body || {}) };
    const isAdmin = req.user.role === 'admin';

    const existing = await User.findById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'User not found',
      });
    }

    // Never allow these via this endpoint
    delete body.emailVerified;
    delete body.loginAttempts;
    delete body.lockUntil;
    delete body.refreshToken;
    delete body.emailVerificationToken;
    delete body.passwordResetToken;

    const update = {};

    if (typeof body.firstName === 'string' && body.firstName.trim()) {
      update.firstName = body.firstName.trim();
    }
    if (typeof body.lastName === 'string' && body.lastName.trim()) {
      update.lastName = body.lastName.trim();
    }
    if (typeof body.phone === 'string') {
      const phone = body.phone.trim();
      // Only set when non-empty (empty string fails the phone regex)
      if (phone) update.phone = phone;
    }
    if (typeof body.country === 'string') {
      update.country = body.country.trim();
    }
    if (body.dateOfBirth !== undefined) {
      const dob = parseDateOfBirth(body.dateOfBirth);
      if (dob.error) {
        return res.status(400).json({
          error: 'ValidationError',
          message: dob.error,
        });
      }
      update.dateOfBirth = dob.value;
    }

    if (isAdmin) {
      if (typeof body.email === 'string' && body.email.trim()) {
        const nextEmail = body.email.trim().toLowerCase();
        if (nextEmail !== existing.email) {
          const clash = await User.findByEmail(nextEmail);
          if (clash && clash._id.toString() !== id) {
            return res.status(400).json({
              error: 'Conflict',
              message: 'Cet email est déjà utilisé par un autre compte',
            });
          }
          update.email = nextEmail;
        }
      }

      if (body.status) {
        const validStatuses = ['invited', 'pending', 'verified', 'reglo', 'suspended'];
        if (!validStatuses.includes(body.status)) {
          return res.status(400).json({ error: 'BadRequest', message: 'Statut invalide' });
        }
        update.status = body.status;
        if (body.status === 'reglo') update.paymentStatus = 'PAYMENT_APPROVED';
      }

      if (body.role) {
        const validRoles = ['student', 'professor', 'admin'];
        if (!validRoles.includes(body.role)) {
          return res.status(400).json({ error: 'BadRequest', message: 'Rôle invalide' });
        }
        // Changing roles: super or full admin
        if (!['super', 'full'].includes(req.user.adminLevel || '')) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Niveau admin insuffisant pour changer le rôle',
          });
        }
        update.role = body.role;
        if (body.role === 'admin') {
          update.adminLevel = body.adminLevel || existing.adminLevel || 'full';
        } else {
          update.adminLevel = null;
        }
        if (body.role !== 'professor') {
          update['professorInfo.teachingLanguages'] = [];
        }
      } else if (body.adminLevel != null && existing.role === 'admin') {
        update.adminLevel = body.adminLevel;
      }

      const nextRole = update.role || existing.role;
      if (nextRole === 'professor' && body.teachingLanguageIds !== undefined) {
        const resolved = await resolveTeachingLanguages(body.teachingLanguageIds);
        if (resolved.error) {
          return res.status(400).json({
            error: 'ValidationError',
            message: resolved.error,
          });
        }
        update['professorInfo.teachingLanguages'] = resolved.teachingLanguages;
        update['professorInfo.specialties'] = resolved.specialties;
      } else if (update.role === 'professor' && body.teachingLanguageIds === undefined) {
        const existingIds = existing.professorInfo?.teachingLanguages || [];
        if (!existingIds.length) {
          return res.status(400).json({
            error: 'ValidationError',
            message: 'Au moins une langue enseignée est requise pour un professeur',
          });
        }
      }

      if (typeof body.password === 'string' && body.password.trim().length >= 6) {
        existing.password = body.password.trim();
        existing.mustChangePassword =
          body.mustChangePassword !== undefined ? !!body.mustChangePassword : true;
        Object.entries(update).forEach(([key, value]) => {
          existing.set(key, value);
        });
        await existing.save(); // triggers password hash pre-save
        await existing.populate('professorInfo.teachingLanguages', 'name code nativeName icon');
        const sanitized = existing.toObject();
        delete sanitized.password;
        delete sanitized.emailVerificationToken;
        delete sanitized.passwordResetToken;
        await writeAuditLog(req, {
          action: 'user.update',
          targetType: 'User',
          targetId: existing._id,
          details: { fields: Object.keys(update).concat(['password']) },
        });
        return res.json(sanitized);
      }

      if (body.mustChangePassword !== undefined) {
        update.mustChangePassword = !!body.mustChangePassword;
      }
    } else {
      // Non-admin owners cannot change auth-sensitive fields here
      delete body.password;
      delete body.email;
      delete body.role;
      delete body.adminLevel;
      delete body.status;
    }

    const user = await User.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    })
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('professorInfo.teachingLanguages', 'name code nativeName icon');

    if (!user) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'User not found',
      });
    }

    if (isAdmin) {
      await writeAuditLog(req, {
        action: 'user.update',
        targetType: 'User',
        targetId: user._id,
        details: { fields: Object.keys(update) },
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Erreur updateUser:', error);
    if (error?.code === 11000) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Email déjà utilisé',
      });
    }
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de l\'utilisateur',
      message: error.message,
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
    if (!['super', 'full'].includes(req.user.adminLevel || '')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only full/super administrators can change user roles'
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
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  changeUserRole,
  getUserStats,
  getMyProfile,
  updateMyProfile
}; 
const Class = require('../models/Class');
const Course = require('../models/Course');
const User = require('../models/User');
const ClassGroup = require('../models/ClassGroup');
const Recording = require('../models/Recording');
const mongoose = require('mongoose');
const {
  generateLiveMeetingCredentials,
  canHostStartSession,
  assertLiveJoinAccess,
  canProfessorHostClass,
  ensureLiveConfigCredentials,
  sanitizeClassLiveConfig,
  isWithinJoinWindow
} = require('../utils/liveSession');
const { findProfessorScheduleConflicts } = require('../utils/scheduleConflicts');
const {
  upsertSessionRecording,
  attachRecordingToClass,
  attachRecordingsToClasses,
} = require('../utils/recordingHelper');
const {
  isLiveKitConfigured,
  getLiveKitConfig,
  createLiveKitToken,
} = require('../utils/livekit');
const {
  isEgressConfigured,
  startRoomRecording,
  stopRoomRecording,
} = require('../utils/livekitEgress');
const {
  getStudentVisibleClassFilter,
  enrollClassGroupStudentsInSession,
  syncStudentCohortSessions,
  buildStudentScheduleMongoFilter,
  completeExpiredLiveSessions,
} = require('../utils/studentClassVisibility');
const { notifyUser } = require('../utils/notifyUser');

function formatControllerError(error) {
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((e) => e.message);
    return { status: 400, message: details.join(' ') || error.message };
  }
  if (error.name === 'CastError') {
    return { status: 400, message: `Identifiant invalide: ${error.path}` };
  }
  return null;
}

// @desc    Récupérer toutes les classes (avec filtres)
// @route   GET /api/classes
// @access  Public (avec restrictions selon le rôle)
const getAllClasses = async (req, res) => {
  try {
    const { 
      course, 
      type, 
      status, 
      professor,
      search, 
      page = 1, 
      limit = 10,
      sortBy = 'schedule.startTime',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    let filters = {};
    if (course) filters.course = course;
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (professor) filters.professor = professor;
    if (search) {
      filters.$or = [
        { 'title.en': { $regex: search, $options: 'i' } },
        { 'title.fr': { $regex: search, $options: 'i' } },
        { 'title.ar': { $regex: search, $options: 'i' } },
        { 'description.en': { $regex: search, $options: 'i' } },
        { 'description.fr': { $regex: search, $options: 'i' } },
        { 'description.ar': { $regex: search, $options: 'i' } }
      ];
    }

    // Restrictions selon le rôle
    if (req.user && req.user.role === 'student') {
      const visibility = await getStudentVisibleClassFilter(req.user._id);
      const base = { ...filters };
      filters = Object.keys(base).length ? { $and: [base, visibility] } : visibility;
    } else if (req.user && req.user.role === 'professor') {
      // Les professeurs voient leurs propres classes et celles des cours publics
      const publicCourses = await Course.find({ status: 'published' }).select('_id');
      const myCourses = await Course.find({ professor: req.user._id }).select('_id');
      
      filters.$or = [
        { course: { $in: publicCourses.map(c => c._id) } },
        { course: { $in: myCourses.map(c => c._id) } },
        { professor: req.user._id }
      ];
    }
    // Les admins voient toutes les classes

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const classes = await Class.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('course', 'title')
      .populate('professor', 'firstName lastName email')
      .populate('chapterId', 'title displayTitle order')
      .populate('enrolledStudents.student', 'firstName lastName email');

    const total = await Class.countDocuments(filters);
    let withRecordings;
    try {
      withRecordings = await attachRecordingsToClasses(classes);
    } catch (recErr) {
      console.error('attachRecordingsToClasses:', recErr);
      withRecordings = classes.map((c) => (c.toObject ? c.toObject() : { ...c }));
    }

    res.json({
      data: withRecordings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllClasses:', error);
    const formatted = formatControllerError(error);
    if (formatted) {
      return res.status(formatted.status).json({ success: false, error: formatted.message });
    }
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des classes',
      ...(process.env.NODE_ENV !== 'production' && { details: error.message }),
    });
  }
};

// @desc    Récupérer une classe par ID
// @route   GET /api/classes/:id
// @access  Public (avec restrictions selon le rôle)
const getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Identifiant de session invalide',
      });
    }

    const classItem = await Class.findById(id)
      .populate('course', 'title description')
      .populate('professor', 'firstName lastName email bio')
      .populate('chapterId', 'title displayTitle order pageStart pageEnd')
      .populate('enrolledStudents.student', 'firstName lastName email');

    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'student') {
      const { studentCanAccessClass } = require('../utils/studentClassVisibility');
      const canAccess = await studentCanAccessClass(req.user._id, classItem);
      if (!canAccess) {
        return res.status(403).json({
          success: false,
          error: 'Accès non autorisé à cette classe',
        });
      }
    } else if (req.user.role === 'professor') {
      const profId = classItem.professor?.toString?.();
      if (profId !== req.user._id.toString()) {
        const course = await Course.findById(classItem.course);
        const courseProfId = course?.professor?.toString?.();
        if (!courseProfId || courseProfId !== req.user._id.toString()) {
          return res.status(403).json({ 
            success: false, 
            error: 'Accès non autorisé à cette classe' 
          });
        }
      }
    }

    const isHost = await canProfessorHostClass(req.user, classItem);
    const sanitized = sanitizeClassLiveConfig(classItem, isHost);
    const withRecording = await attachRecordingToClass(sanitized);
    res.json(withRecording);
  } catch (error) {
    console.error('Erreur getClassById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération de la classe' 
    });
  }
};

// @desc    Créer une nouvelle classe
// @route   POST /api/classes
// @access  Professeurs et admins seulement
const createClass = async (req, res) => {
  try {
    const classData = { ...req.body };
    let cohortForEnroll = null;

    if (classData.classGroupId) {
      const cg = await ClassGroup.findById(classData.classGroupId);
      cohortForEnroll = cg;
      if (!cg) {
        return res.status(400).json({ error: 'BadRequest', message: 'Cohorte introuvable' });
      }
      if (!cg.professorId) {
        return res.status(400).json({ error: 'BadRequest', message: 'La cohorte n\'a pas de professeur assigné' });
      }
      if (!classData.course && cg.courseId) {
        classData.course = cg.courseId;
      }
      if (!classData.course) {
        return res.status(400).json({ error: 'BadRequest', message: 'Cours requis pour planifier une session' });
      }
      if (cg.courseId && classData.course.toString() !== cg.courseId.toString()) {
        return res.status(400).json({ error: 'BadRequest', message: 'Le cours ne correspond pas à la cohorte' });
      }
      if (req.user.role === 'professor') {
        if (cg.professorId.toString() !== req.user._id.toString()) {
          return res.status(403).json({
            success: false,
            error: 'Cette cohorte ne vous appartient pas',
          });
        }
        classData.professor = req.user._id;
      } else {
        classData.professor = cg.professorId;
      }
    } else if (!classData.professor) {
      classData.professor = req.user._id;
    }

    if (!classData.professor) {
      return res.status(400).json({ error: 'BadRequest', message: 'Professeur requis' });
    }

    if (!classData.schedule?.startTime) {
      return res.status(400).json({ error: 'BadRequest', message: 'schedule.startTime is required' });
    }

    if (classData.type === 'live' && !classData.schedule?.endTime) {
      return res.status(400).json({ error: 'BadRequest', message: 'schedule.endTime is required for live sessions' });
    }

    const startAt = new Date(classData.schedule.startTime);
    if (Number.isNaN(startAt.getTime())) {
      return res.status(400).json({ error: 'BadRequest', message: 'schedule.startTime invalide' });
    }
    const endAt = classData.schedule.endTime
      ? new Date(classData.schedule.endTime)
      : null;
    if (endAt && Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'BadRequest', message: 'schedule.endTime invalide' });
    }
    // Autoriser un début déjà passé tant que la session n'est pas terminée
    // (évite les faux positifs fuseau horaire / « maintenant »).
    if (endAt && endAt.getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'La session serait déjà terminée. Choisissez une heure de fin dans le futur.',
      });
    }
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'schedule.endTime doit être après schedule.startTime',
      });
    }

    const conflicts = await findProfessorScheduleConflicts(
      classData.professor,
      classData.schedule.startTime,
      classData.schedule.endTime
    );
    if (conflicts.length) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Professor has another session at this time',
        conflicts
      });
    }

    if (req.user.role === 'professor') {
      const course = await Course.findById(classData.course);
      const ownerId = course?.professor?.toString?.();
      if (!course || !ownerId || ownerId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Vous ne pouvez créer des classes que pour vos propres cours',
        });
      }
    }

    if (classData.type === 'live') {
      const creds = generateLiveMeetingCredentials();
      classData.liveConfig = {
        ...(classData.liveConfig || {}),
        platform: 'livekit',
        meetingId: creds.meetingId,
        waitingRoom: true,
      };
    }

    const classItem = new Class(classData);
    if (cohortForEnroll) {
      await enrollClassGroupStudentsInSession(cohortForEnroll, classItem);
    }
    await classItem.save();

    if (cohortForEnroll && (cohortForEnroll.studentIds || []).length) {
      const sessionTitle =
        classItem.title?.fr || classItem.title?.en || 'Session live';
      const when = classItem.schedule?.startTime
        ? new Date(classItem.schedule.startTime).toLocaleString('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '';
      for (const sid of cohortForEnroll.studentIds) {
        notifyUser(sid, {
          title: {
            fr: 'Nouvelle session planifiée',
            en: 'New session scheduled',
            ar: 'جلسة جديدة',
          },
          body: {
            fr: `${sessionTitle}${when ? ` — ${when}` : ''}`,
            en: `${sessionTitle}${when ? ` — ${when}` : ''}`,
            ar: `${sessionTitle}${when ? ` — ${when}` : ''}`,
          },
          type: 'class_scheduled',
          data: { classId: classItem._id, classGroupId: cohortForEnroll._id },
        }).catch((err) => console.error('notifyUser class_scheduled:', err.message));
      }
    }

    const populatedClass = await Class.findById(classItem._id)
      .populate('course', 'title')
      .populate('professor', 'firstName lastName email');

    const cohortStudentCount = (cohortForEnroll?.studentIds || []).length;
    const payload =
      populatedClass?.toObject?.() ? populatedClass.toObject() : populatedClass;
    res.status(201).json({
      ...payload,
      warning:
        cohortForEnroll && cohortStudentCount === 0
          ? 'Session créée, mais la cohorte n’a aucun étudiant : personne ne la verra dans le planning étudiant tant que des élèves ne sont pas ajoutés à la cohorte.'
          : undefined,
      enrolledFromCohort: cohortStudentCount,
    });
  } catch (error) {
    console.error('Erreur createClass:', error);
    const formatted = formatControllerError(error);
    if (formatted) {
      return res.status(formatted.status).json({
        success: false,
        error: formatted.message,
      });
    }
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la classe',
    });
  }
};

// @desc    Mettre à jour une classe
// @route   PUT /api/classes/:id
// @access  Professeur propriétaire ou admin
const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Vous ne pouvez modifier que vos propres classes' 
        });
      }
    }

    const updatedClass = await Class.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('course', 'title')
     .populate('professor', 'firstName lastName email');

    res.json(updatedClass);
  } catch (error) {
    console.error('Erreur updateClass:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour de la classe' 
    });
  }
};

// @desc    Supprimer une classe
// @route   DELETE /api/classes/:id
// @access  Professeur propriétaire ou admin
const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Vous ne pouvez supprimer que vos propres classes' 
        });
      }
    }

    // Note: Course model doesn't have a classes field - classes are linked via course field

    await Class.findByIdAndDelete(id);

    res.json({ 
      message: 'Class deleted successfully' 
    });
  } catch (error) {
    console.error('Erreur deleteClass:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la suppression de la classe' 
    });
  }
};

// @desc    Inscrire un étudiant à une classe
// @route   POST /api/classes/:id/enroll
// @access  Étudiants seulement
const enrollStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'utilisateur peut s'inscrire
    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        success: false, 
        error: 'Seuls les étudiants peuvent s\'inscrire aux classes' 
      });
    }

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier que l'étudiant est inscrit au cours
    const course = await Course.findById(classItem.course);
    const isEnrolledInCourse = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );
    if (!isEnrolledInCourse) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous devez être inscrit au cours pour participer à cette classe' 
      });
    }

    // Utiliser la méthode du modèle pour inscrire l'étudiant
    await classItem.enrollStudent(req.user._id);

    res.json({ 
      message: 'Enrolled successfully'
    });
  } catch (error) {
    console.error('Erreur enrollStudent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'inscription à la classe' 
    });
  }
};

// @desc    Get LiveKit join credentials for a live session
// @route   GET /api/classes/:id/join-token
// @access  Enrolled reglo students, session professor, admin
const getJoinToken = async (req, res) => {
  try {
    if (!isLiveKitConfigured()) {
      return res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'LiveKit n\'est pas configuré. Définissez LIVEKIT_API_KEY, LIVEKIT_API_SECRET et LIVEKIT_URL.',
      });
    }

    const classItem = await Class.findById(req.params.id)
      .populate('course', 'title')
      .populate('professor', 'firstName lastName');

    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Class not found' });
    }

    const access = await assertLiveJoinAccess(req, classItem);
    if (!access.ok) {
      return res.status(access.status || 403).json({ error: 'Forbidden', message: access.message });
    }

    if (!classItem.liveConfig?.meetingId) {
      const creds = ensureLiveConfigCredentials(classItem);
      await Class.findByIdAndUpdate(classItem._id, {
        'liveConfig.meetingId': creds.meetingId,
        'liveConfig.platform': 'livekit',
      });
      classItem.liveConfig = { ...classItem.liveConfig, meetingId: creds.meetingId, platform: 'livekit' };
    }

    const roomName = classItem.liveConfig.meetingId;
    const displayName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Participant';
    const token = await createLiveKitToken({
      roomName,
      identity: req.user._id.toString(),
      displayName,
      isHost: access.isHost,
    });

    const { url: serverUrl } = getLiveKitConfig();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    res.json({
      provider: 'livekit',
      serverUrl,
      token,
      roomName,
      expiresAt,
      sessionStatus: classItem.status,
      joinWindowOpen: isWithinJoinWindow(classItem),
      isHost: access.isHost,
      title: classItem.title,
    });
  } catch (error) {
    console.error('Erreur getJoinToken:', error);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to get join credentials' });
  }
};

// @desc    Check professor schedule conflicts
// @route   GET /api/classes/schedule-conflicts
// @access  Professor, Admin
const getScheduleConflicts = async (req, res) => {
  try {
    const { professorId, startTime, endTime, excludeClassId } = req.query;
    if (!professorId || !startTime) {
      return res.status(400).json({ error: 'BadRequest', message: 'professorId and startTime are required' });
    }
    if (req.user.role === 'professor' && professorId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Not authorized' });
    }
    const conflicts = await findProfessorScheduleConflicts(
      professorId,
      startTime,
      endTime,
      excludeClassId || null
    );
    res.json({ hasConflict: conflicts.length > 0, conflicts });
  } catch (error) {
    console.error('Erreur getScheduleConflicts:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des conflits horaires',
    });
  }
};

// @desc    Start session (status → ongoing)
// @route   POST /api/classes/:id/start
// @access  Professor (owner), Admin
const startSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { recordingStarted } = req.body || {};

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Class not found' });
    }
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to start this session' });
      }
    }
    if (classItem.type !== 'live') {
      return res.status(400).json({ error: 'BadRequest', message: 'Only live sessions can be started' });
    }
    if (classItem.status === 'cancelled' || classItem.status === 'completed') {
      return res.status(400).json({ error: 'BadRequest', message: 'Session cannot be started' });
    }

    const now = new Date();
    if (!canHostStartSession(classItem, now.getTime())) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Session can only be started within the join window (from 15 minutes before start)'
      });
    }

    const creds = ensureLiveConfigCredentials(classItem);
    const update = {
      status: 'ongoing',
      'liveConfig.meetingId': creds.meetingId,
      'liveConfig.platform': 'livekit',
      'liveConfig.sessionStartedAt': now
    };
    if (typeof recordingStarted === 'boolean') update['liveConfig.recordingStarted'] = recordingStarted;

    const updated = await Class.findByIdAndUpdate(id, update, { new: true })
      .populate('course', 'title')
      .populate('professor', 'firstName lastName email')
      .populate('chapterId', 'title displayTitle order');

    if (typeof recordingStarted === 'boolean' && recordingStarted) {
      const existing = await Recording.findOne({ session: id });
      let egressId = existing?.egressId || null;

      if (!egressId && isEgressConfigured()) {
        try {
          const started = await startRoomRecording({
            roomName: creds.meetingId,
            classId: id,
          });
          egressId = started.egressId;
        } catch (egressErr) {
          console.error('startSession egress:', egressErr.message || egressErr);
          await upsertSessionRecording(
            id,
            {
              status: 'failed',
              failureReason: egressErr.message || 'Failed to start LiveKit Egress',
            },
            req.user._id
          );
          const withRecording = await attachRecordingToClass(updated);
          return res.status(502).json({
            ...withRecording,
            error: 'EgressStartFailed',
            message:
              'La session a démarré mais l\'enregistrement LiveKit n\'a pas pu être lancé. Vérifiez S3/R2 et le quota Egress.',
          });
        }
      } else if (!egressId && !isEgressConfigured()) {
        console.warn(
          'startSession: recording requested but Egress not configured (need LIVEKIT_* + S3_*)'
        );
      }

      await upsertSessionRecording(
        id,
        { status: 'processing', egressId: egressId || undefined },
        req.user._id
      );
    }

    if (typeof recordingStarted === 'boolean' && recordingStarted === false) {
      const existing = await Recording.findOne({ session: id });
      if (existing?.egressId) {
        try {
          await stopRoomRecording(existing.egressId);
        } catch (stopErr) {
          console.error('startSession stop egress:', stopErr.message || stopErr);
        }
      }
    }

    const withRecording = await attachRecordingToClass(updated);
    res.json(withRecording);
  } catch (error) {
    console.error('Erreur startSession:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du démarrage de la session' });
  }
};

// @desc    End session (status → completed)
// @route   POST /api/classes/:id/end
// @access  Professor (owner), Admin
const endSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { recordingUrl, notes, recordingStatus, durationSeconds } = req.body || {};

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ error: 'NotFound', message: 'Class not found' });
    }
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Forbidden', message: 'Not authorized to end this session' });
      }
    }
    const update = {
      status: 'completed',
      'liveConfig.sessionEndedAt': new Date(),
    };
    if (recordingUrl) update['liveConfig.recordingUrl'] = recordingUrl;

    if (notes !== undefined) {
      if (typeof notes === 'string') {
        update.notes = { fr: notes, en: notes, ar: notes };
      } else if (notes && typeof notes === 'object') {
        update.notes = notes;
      }
    }

    const updated = await Class.findByIdAndUpdate(id, update, { new: true })
      .populate('course', 'title')
      .populate('professor', 'firstName lastName email')
      .populate('chapterId', 'title displayTitle order');

    const existingRec = await Recording.findOne({ session: id });
    if (existingRec?.egressId) {
      try {
        await stopRoomRecording(existingRec.egressId);
      } catch (stopErr) {
        console.error('endSession stop egress:', stopErr.message || stopErr);
      }
    }

    const hadRecording =
      classItem.liveConfig?.recordingStarted ||
      recordingUrl ||
      existingRec;

    if (hadRecording || recordingUrl) {
      const nextStatus = recordingUrl
        ? recordingStatus || 'ready'
        : existingRec?.status === 'ready'
          ? 'ready'
          : recordingStatus || 'processing';

      await upsertSessionRecording(
        id,
        {
          externalUrl: recordingUrl || undefined,
          status: nextStatus,
          durationSeconds,
          egressId: existingRec?.egressId || undefined,
        },
        req.user._id
      );
    }

    const withRecording = await attachRecordingToClass(updated);
    res.json(withRecording);
  } catch (error) {
    console.error('Erreur endSession:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la fin de la session' });
  }
};

// @desc    Marquer la présence d'un étudiant
// @route   POST /api/classes/:id/attendance
// @access  Professeur propriétaire ou admin
const markAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, status, notes } = req.body;

    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user._id.toString()) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Vous ne pouvez marquer la présence que pour vos propres classes' 
        });
      }
    }

    // Vérifier que l'étudiant est inscrit à la classe
    const enrollment = classItem.enrolledStudents.find(
      e => e.student.toString() === studentId.toString()
    );
    if (!enrollment) {
      return res.status(400).json({ 
        success: false, 
        error: 'L\'étudiant n\'est pas inscrit à cette classe' 
      });
    }

    // Utiliser la méthode du modèle pour marquer la présence
    await classItem.markAttendance(studentId);

    res.json({ 
      message: 'Attendance marked successfully'
    });
  } catch (error) {
    console.error('Erreur markAttendance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du marquage de la présence' 
    });
  }
};

// @desc    Récupérer les classes en direct
// @route   GET /api/classes/live
// @access  Public
const getLiveClasses = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const now = new Date();

    const classes = await Class.find({
      type: 'live',
      status: 'ongoing',
      'schedule.startTime': { $lte: now },
      'schedule.endTime': { $gte: now }
    })
    .limit(parseInt(limit))
    .populate('course', 'title')
    .populate('professor', 'firstName lastName email')
    .sort({ 'schedule.startTime': 1 });

    res.json({
      data: classes
    });
  } catch (error) {
    console.error('Erreur getLiveClasses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des classes en direct' 
    });
  }
};

// @desc    Récupérer les classes à venir
// @route   GET /api/classes/upcoming
// @access  Public
const getUpcomingClasses = async (req, res) => {
  try {
    const { limit = 10, days = 7 } = req.query;
    const parsedDays = Math.min(365, Math.max(1, parseInt(days, 10) || 7));
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const now = new Date();
    await completeExpiredLiveSessions(now);

    let query;
    if (req.user?.role === 'student') {
      await syncStudentCohortSessions(req.user._id);
      query = await buildStudentScheduleMongoFilter(req.user._id, {
        days: parsedDays,
        now,
      });
    } else {
      const futureDate = new Date(now.getTime() + parsedDays * 24 * 60 * 60 * 1000);
      query = {
        type: 'live',
        status: { $in: ['scheduled', 'ongoing'] },
        'schedule.startTime': { $lte: futureDate },
        $or: [
          { 'schedule.endTime': { $gt: now } },
          { status: 'ongoing' },
        ],
      };
      if (req.user?.role === 'professor') {
        query.professor = req.user._id;
      }
    }

    const classes = await Class.find(query)
    .limit(parsedLimit)
    .populate('course', 'title')
    .populate('professor', 'firstName lastName email')
    .populate('classGroupId', 'name')
    .sort({ 'schedule.startTime': 1 });

    res.json({
      data: classes
    });
  } catch (error) {
    console.error('Erreur getUpcomingClasses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des classes à venir' 
    });
  }
};

module.exports = {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getJoinToken,
  getScheduleConflicts,
  startSession,
  endSession,
  enrollStudent,
  markAttendance,
  getLiveClasses,
  getUpcomingClasses
}; 
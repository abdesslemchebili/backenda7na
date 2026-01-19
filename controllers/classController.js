const Class = require('../models/Class');
const Course = require('../models/Course');
const User = require('../models/User');

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
      sortBy = 'scheduledAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
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
      // Les étudiants ne voient que les classes des cours auxquels ils sont inscrits
      const enrolledCourses = await Course.find({
        'enrolledStudents.student': req.user._id
      }).select('_id');
      
      filters.course = { $in: enrolledCourses.map(c => c._id) };
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
      .populate('enrolledStudents.student', 'firstName lastName email');

    const total = await Class.countDocuments(filters);

    res.json({
      success: true,
      data: classes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllClasses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des classes' 
    });
  }
};

// @desc    Récupérer une classe par ID
// @route   GET /api/classes/:id
// @access  Public (avec restrictions selon le rôle)
const getClassById = async (req, res) => {
  try {
    const { id } = req.params;
    const classItem = await Class.findById(id)
      .populate('course', 'title description')
      .populate('professor', 'firstName lastName email bio')
      .populate('enrolledStudents.student', 'firstName lastName email');

    if (!classItem) {
      return res.status(404).json({ 
        success: false, 
        error: 'Classe non trouvée' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'student') {
      const course = await Course.findById(classItem.course);
      const isEnrolled = course.enrolledStudents.some(
        enrollment => enrollment.student.toString() === req.user._id.toString()
      );
      if (!isEnrolled) {
        return res.status(403).json({ 
          success: false, 
          error: 'Accès non autorisé à cette classe' 
        });
      }
    } else if (req.user.role === 'professor') {
      if (classItem.professor.toString() !== req.user._id.toString()) {
        const course = await Course.findById(classItem.course);
        if (course.professor.toString() !== req.user._id.toString()) {
          return res.status(403).json({ 
            success: false, 
            error: 'Accès non autorisé à cette classe' 
          });
        }
      }
    }

    res.json({ success: true, data: classItem });
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
    const classData = req.body;
    
    // Assigner le professeur si non spécifié
    if (!classData.professor) {
      classData.professor = req.user._id;
    }

    // Vérifier que l'utilisateur peut créer la classe
    if (req.user.role === 'professor') {
      const course = await Course.findById(classData.course);
      if (!course || course.professor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Vous ne pouvez créer des classes que pour vos propres cours' 
        });
      }
    }

    const classItem = new Class(classData);
    await classItem.save();

    // Note: Course model doesn't have a classes field - classes are linked via course field

    const populatedClass = await Class.findById(classItem._id)
      .populate('course', 'title')
      .populate('professor', 'firstName lastName email');

    res.status(201).json({ 
      success: true, 
      data: populatedClass,
      message: 'Classe créée avec succès'
    });
  } catch (error) {
    console.error('Erreur createClass:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la création de la classe' 
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

    res.json({ 
      success: true, 
      data: updatedClass,
      message: 'Classe mise à jour avec succès'
    });
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
    if (req.user.role === 'professor' && classItem.professor.toString() !== req.user.id) {
      const course = await Course.findById(classItem.course);
      if (!course || course.professor.toString() !== req.user.id) {
        return res.status(403).json({ 
          success: false, 
          error: 'Vous ne pouvez supprimer que vos propres classes' 
        });
      }
    }

    // Note: Course model doesn't have a classes field - classes are linked via course field

    await Class.findByIdAndDelete(id);

    res.json({ 
      success: true, 
      message: 'Classe supprimée avec succès' 
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
      success: true, 
      message: 'Inscription réussie à la classe'
    });
  } catch (error) {
    console.error('Erreur enrollStudent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'inscription à la classe' 
    });
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
      success: true, 
      message: 'Présence marquée avec succès'
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
      success: true,
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
    const now = new Date();
    const futureDate = new Date(now.getTime() + (parseInt(days) * 24 * 60 * 60 * 1000));

    const classes = await Class.find({
      type: 'live',
      status: 'scheduled',
      'schedule.startTime': { $gte: now, $lte: futureDate }
    })
    .limit(parseInt(limit))
    .populate('course', 'title')
    .populate('professor', 'firstName lastName email')
    .sort({ 'schedule.startTime': 1 });

    res.json({
      success: true,
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
  enrollStudent,
  markAttendance,
  getLiveClasses,
  getUpcomingClasses
}; 
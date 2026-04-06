const Course = require('../models/Course');
const User = require('../models/User');
const Class = require('../models/Class');

// @desc    Récupérer tous les cours (avec filtres)
// @route   GET /api/courses
// @access  Public (avec restrictions selon le rôle)
const getAllCourses = async (req, res) => {
  try {
    const { 
      language, 
      level, 
      category, 
      status, 
      professor,
      search, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construire les filtres
    const filters = {};
    if (language) filters.language = language;
    if (level) filters.level = level;
    if (category) filters.category = category;
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
    if (!req.user) {
      // Utilisateurs non authentifiés ne voient que les cours publics
      filters.status = 'published';
      filters.isPublic = true;
    } else if (req.user.role === 'student') {
      // Les étudiants ne voient que les cours publics et ceux auxquels ils sont inscrits
      filters.$or = [
        { status: 'published', isPublic: true },
        { 'enrolledStudents.student': req.user._id }
      ];
    } else if (req.user.role === 'professor') {
      // Les professeurs voient leurs propres cours et les cours publics
      filters.$or = [
        { status: 'published' },
        { professor: req.user._id }
      ];
    }
    // Les admins voient tous les cours

    // Construire le tri
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const courses = await Course.find(filters)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('professor', 'firstName lastName email')
      .populate('enrolledStudents.student', 'firstName lastName email');

    const total = await Course.countDocuments(filters);

    res.json({
      data: courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur getAllCourses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des cours' 
    });
  }
};

// @desc    Récupérer un cours par ID
// @route   GET /api/courses/:id
// @access  Public (avec restrictions selon le rôle)
const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id)
      .populate('professor', 'firstName lastName email bio')
      .populate('enrolledStudents.student', 'firstName lastName email');

    if (!course) {
      return res.status(404).json({ 
        error: 'NotFound', 
        message: 'Course not found' 
      });
    }

    // Vérifier les permissions
    if (!req.user) {
      // Utilisateurs non authentifiés ne peuvent voir que les cours publics
      if (course.status !== 'published' || !course.isPublic) {
        return res.status(403).json({ 
          success: false, 
          error: 'Accès non autorisé à ce cours' 
        });
      }
    } else if (req.user.role === 'student') {
      const isEnrolled = course.enrolledStudents.some(
        enrollment => enrollment.student.toString() === req.user._id.toString()
      );
      if (course.status !== 'published' && !isEnrolled) {
        return res.status(403).json({ 
          success: false, 
          error: 'Accès non autorisé à ce cours' 
        });
      }
    } else if (req.user.role === 'professor') {
      if (course.professor.toString() !== req.user._id.toString() && course.status !== 'published') {
        return res.status(403).json({ 
          success: false, 
          error: 'Accès non autorisé à ce cours' 
        });
      }
    }

    res.json(course);
  } catch (error) {
    console.error('Erreur getCourseById:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération du cours' 
    });
  }
};

// @desc    Créer un nouveau cours
// @route   POST /api/courses
// @access  Professeurs et admins seulement
const createCourse = async (req, res) => {
  try {
    const courseData = req.body;
    
    // Assigner le professeur si non spécifié
    if (!courseData.professor) {
      courseData.professor = req.user._id;
    }

    // Vérifier que l'utilisateur peut créer le cours
    if (req.user.role === 'professor' && courseData.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous ne pouvez créer que vos propres cours' 
      });
    }

    const course = new Course(courseData);
    await course.save();

    // Mettre à jour le profil du professeur
    await User.findByIdAndUpdate(
      courseData.professor,
      { $push: { 'professorInfo.courses': course._id } }
    );

    const populatedCourse = await Course.findById(course._id)
      .populate('professor', 'firstName lastName email');

    res.status(201).json(populatedCourse);
  } catch (error) {
    console.error('Erreur createCourse:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la création du cours' 
    });
  }
};

// @desc    Mettre à jour un cours
// @route   PUT /api/courses/:id
// @access  Professeur propriétaire ou admin
const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cours non trouvé' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous ne pouvez modifier que vos propres cours' 
      });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('professor', 'firstName lastName email');

    res.json(updatedCourse);
  } catch (error) {
    console.error('Erreur updateCourse:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du cours' 
    });
  }
};

// @desc    Supprimer un cours
// @route   DELETE /api/courses/:id
// @access  Professeur propriétaire ou admin
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cours non trouvé' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous ne pouvez supprimer que vos propres cours' 
      });
    }

    // Supprimer les classes associées
    await Class.deleteMany({ course: id });

    // Retirer le cours du profil du professeur
    await User.findByIdAndUpdate(
      course.professor,
      { $pull: { 'professorInfo.courses': id } }
    );

    // Retirer le cours des étudiants inscrits
    await User.updateMany(
      { 'studentInfo.enrolledCourses': id },
      { $pull: { 'studentInfo.enrolledCourses': id } }
    );

    await Course.findByIdAndDelete(id);

    res.json({ 
      message: 'Course deleted successfully' 
    });
  } catch (error) {
    console.error('Erreur deleteCourse:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la suppression du cours' 
    });
  }
};

// @desc    Inscrire un étudiant à un cours
// @route   POST /api/courses/:id/enroll
// @access  Étudiants seulement
const enrollStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;

    // Vérifier que l'utilisateur peut s'inscrire
    if (req.user.role !== 'student') {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Only students can enroll' 
      });
    }
    if (req.user.status !== 'reglo') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only students with payment confirmed (reglo) can enroll'
      });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cours non trouvé' 
      });
    }

    if (course.status !== 'published') {
      return res.status(400).json({ 
        success: false, 
        error: 'Ce cours n\'est pas ouvert aux inscriptions' 
      });
    }

    // Vérifier si l'étudiant est déjà inscrit
    const alreadyEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );
    if (alreadyEnrolled) {
      return res.status(400).json({ 
        success: false, 
        error: 'Vous êtes déjà inscrit à ce cours' 
      });
    }

    // Vérifier la limite d'étudiants
    if (course.maxStudents && course.enrolledStudents.length >= course.maxStudents) {
      return res.status(400).json({ 
        success: false, 
        error: 'Ce cours a atteint sa limite d\'étudiants' 
      });
    }

    // Utiliser la méthode du modèle pour inscrire l'étudiant
    await course.enrollStudent(req.user._id);

    // Ajouter le cours à l'étudiant
    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { 'studentInfo.enrolledCourses': id } }
    );

    res.json({ 
      message: 'Enrolled successfully'
    });
  } catch (error) {
    console.error('Erreur enrollStudent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'inscription au cours' 
    });
  }
};

// @desc    Désinscrire un étudiant d'un cours
// @route   DELETE /api/courses/:id/enroll
// @access  Student (self), Professor (owner), Admin (optional studentId)
const unenrollStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.query;

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ 
        error: 'NotFound', 
        message: 'Course not found' 
      });
    }

    let targetStudentId = req.user._id;
    if (studentId && (req.user.role === 'admin' || (req.user.role === 'professor' && course.professor.toString() === req.user._id.toString()))) {
      targetStudentId = studentId;
    } else if (studentId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Only professor or admin can unenroll another student' });
    }

    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === targetStudentId.toString()
    );
    if (!isEnrolled) {
      return res.status(400).json({ 
        error: 'BadRequest', 
        message: 'Student is not enrolled in this course' 
      });
    }

    await course.unenrollStudent(targetStudentId);
    await User.findByIdAndUpdate(
      targetStudentId,
      { $pull: { 'studentInfo.enrolledCourses': id } }
    );

    res.json({ 
      message: 'Unenrolled successfully'
    });
  } catch (error) {
    console.error('Erreur unenrollStudent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la désinscription du cours' 
    });
  }
};

// @desc    Mettre à jour le progrès d'un étudiant
// @route   PATCH /api/courses/:id/progress
// @access  Professeur propriétaire ou admin
const updateProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, progress } = req.body;

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cours non trouvé' 
      });
    }

    // Vérifier les permissions
    if (req.user.role === 'professor' && course.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous ne pouvez modifier que vos propres cours' 
      });
    }

    // Utiliser la méthode du modèle pour mettre à jour le progrès
    await course.updateStudentProgress(studentId, progress);

    res.json({ 
      message: 'Progress updated successfully'
    });
  } catch (error) {
    console.error('Erreur updateProgress:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la mise à jour du progrès' 
    });
  }
};

// @desc    Récupérer les cours en vedette
// @route   GET /api/courses/featured
// @access  Public
const getFeaturedCourses = async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const courses = await Course.find({ 
      status: 'published',
      featured: true 
    })
    .limit(parseInt(limit))
    .populate('professor', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.json({
      data: courses
    });
  } catch (error) {
    console.error('Erreur getFeaturedCourses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la récupération des cours en vedette' 
    });
  }
};

// @desc    Rechercher des cours
// @route   GET /api/courses/search
// @access  Public
const searchCourses = async (req, res) => {
  try {
    const { 
      search,
      q, 
      language, 
      level, 
      category,
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = search || q;
    if (!query) {
      return res.status(400).json({ 
        error: 'BadRequest', 
        message: 'Search term is required' 
      });
    }

    const filters = {
      status: 'published',
      $or: [
        { 'title.en': { $regex: query, $options: 'i' } },
        { 'title.fr': { $regex: query, $options: 'i' } },
        { 'title.ar': { $regex: query, $options: 'i' } },
        { 'description.en': { $regex: query, $options: 'i' } },
        { 'description.fr': { $regex: query, $options: 'i' } },
        { 'description.ar': { $regex: query, $options: 'i' } }
      ]
    };

    if (language) filters.language = language;
    if (level) filters.level = level;
    if (category) filters.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const courses = await Course.find(filters)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('professor', 'firstName lastName email')
      .sort(sort);

    const total = await Course.countDocuments(filters);

    res.json({
      data: courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Erreur searchCourses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la recherche de cours' 
    });
  }
};

module.exports = {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollStudent,
  unenrollStudent,
  updateProgress,
  getFeaturedCourses,
  searchCourses
}; 
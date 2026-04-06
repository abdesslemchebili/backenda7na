const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Importer les modèles
const User = require('../models/User');
const Course = require('../models/Course');
const Class = require('../models/Class');
const Application = require('../models/Application');
const ClassGroup = require('../models/ClassGroup');
const Lead = require('../models/Lead');

// Fonction pour se connecter à MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/language_school'
    );
    console.log('✅ Connexion à MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error.message);
    process.exit(1);
  }
};

// Fonction pour nettoyer la base de données
const clearDatabase = async () => {
  try {
    await User.deleteMany({});
    await Course.deleteMany({});
    await Class.deleteMany({});
    await Application.deleteMany({});
    await ClassGroup.deleteMany({});
    await Lead.deleteMany({});
    console.log('🗑️ Base de données nettoyée');
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
  }
};

// Fonction pour créer des utilisateurs de test
const createUsers = async () => {
  try {
    const users = [
      // Super Admin
      {
        firstName: 'Admin',
        lastName: 'Super',
        email: 'admin@languageschool.com',
        password: 'admin123',
        role: 'admin',
        adminLevel: 'super',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'Super administrator of the language school platform',
          fr: 'Super administrateur de la plateforme d\'école de langues',
          ar: 'مدير عام لمنصة مدرسة اللغات'
        }
      },
      // Admin Content
      {
        firstName: 'Content',
        lastName: 'Manager',
        email: 'content@languageschool.com',
        password: 'content123',
        role: 'admin',
        adminLevel: 'content',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'Content manager responsible for course management',
          fr: 'Gestionnaire de contenu responsable de la gestion des cours',
          ar: 'مدير المحتوى المسؤول عن إدارة الدورات'
        }
      },
      // Admin Support
      {
        firstName: 'Support',
        lastName: 'Team',
        email: 'support@languageschool.com',
        password: 'support123',
        role: 'admin',
        adminLevel: 'support',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'Support team member helping students and teachers',
          fr: 'Membre de l\'équipe de support aidant les étudiants et professeurs',
          ar: 'عضو فريق الدعم يساعد الطلاب والمعلمين'
        }
      },
      // Professeur 1
      {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@languageschool.com',
        password: 'prof123',
        role: 'professor',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'Experienced English teacher with 8 years of teaching experience',
          fr: 'Professeure d\'anglais expérimentée avec 8 ans d\'expérience',
          ar: 'معلمة إنجليزية ذو خبرة مع 8 سنوات من الخبرة في التدريس'
        },
        professorInfo: {
          specialties: [
            { language: 'english', level: 'all' },
            { language: 'french', level: 'intermediate' }
          ],
          experience: 8,
          education: 'Master in English Literature, University of Oxford'
        }
      },
      // Professeur 2
      {
        firstName: 'Ahmed',
        lastName: 'Al-Mansouri',
        email: 'ahmed.almansouri@languageschool.com',
        password: 'prof123',
        role: 'professor',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'Arabic language specialist with focus on modern Arabic',
          fr: 'Spécialiste de la langue arabe avec focus sur l\'arabe moderne',
          ar: 'متخصص في اللغة العربية مع التركيز على العربية الحديثة'
        },
        professorInfo: {
          specialties: [
            { language: 'arabic', level: 'all' },
            { language: 'english', level: 'advanced' }
          ],
          experience: 5,
          education: 'PhD in Arabic Linguistics, Cairo University'
        }
      },
      // Étudiant 1 (reglo)
      {
        firstName: 'Marie',
        lastName: 'Dubois',
        email: 'marie.dubois@example.com',
        password: 'student123',
        role: 'student',
        status: 'reglo',
        emailVerified: true,
        bio: {
          en: 'French student learning English and Arabic',
          fr: 'Étudiante française apprenant l\'anglais et l\'arabe',
          ar: 'طالبة فرنسية تتعلم الإنجليزية والعربية'
        },
        studentInfo: {
          level: 'intermediate',
          languages: [
            { language: 'english', level: 'intermediate' },
            { language: 'arabic', level: 'beginner' }
          ]
        }
      },
      // Étudiant 2 (pending)
      {
        firstName: 'Youssef',
        lastName: 'Benali',
        email: 'youssef.benali@example.com',
        password: 'student123',
        role: 'student',
        status: 'pending',
        emailVerified: true,
        bio: {
          en: 'Moroccan student interested in French and English',
          fr: 'Étudiant marocain intéressé par le français et l\'anglais',
          ar: 'طالب مغربي مهتم بالفرنسية والإنجليزية'
        },
        studentInfo: {
          level: 'beginner',
          languages: [
            { language: 'french', level: 'beginner' },
            { language: 'english', level: 'beginner' }
          ]
        }
      },
      // Étudiant 3 (invited)
      {
        firstName: 'Emma',
        lastName: 'Wilson',
        email: 'emma.wilson@example.com',
        password: 'student123',
        role: 'student',
        status: 'invited',
        emailVerified: false,
        bio: {
          en: 'American student learning Arabic',
          fr: 'Étudiante américaine apprenant l\'arabe',
          ar: 'طالبة أمريكية تتعلم العربية'
        },
        studentInfo: {
          level: 'beginner',
          languages: [
            { language: 'arabic', level: 'beginner' }
          ]
        }
      }
    ];

    const createdUsers = [];
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`✅ Utilisateur créé: ${user.firstName} ${user.lastName} (${user.email})`);
    }

    return createdUsers;
  } catch (error) {
    console.error('❌ Erreur lors de la création des utilisateurs:', error);
    throw error;
  }
};

// Fonction pour créer des cours de test
const createCourses = async (users) => {
  try {
    const professors = users.filter(user => user.role === 'professor');
    const courses = [
      {
        title: {
          en: 'English for Beginners',
          fr: 'Anglais pour débutants',
          ar: 'الإنجليزية للمبتدئين'
        },
        description: {
          en: 'A comprehensive course for absolute beginners in English',
          fr: 'Un cours complet pour les débutants absolus en anglais',
          ar: 'دورة شاملة للمبتدئين المطلقين في اللغة الإنجليزية'
        },
        shortDescription: {
          en: 'Learn English from scratch with native speakers',
          fr: 'Apprenez l\'anglais depuis le début avec des locuteurs natifs',
          ar: 'تعلم الإنجليزية من الصفر مع متحدثين أصليين'
        },
        language: 'english',
        level: 'beginner',
        category: 'conversation',
        duration: 40,
        maxStudents: 15,
        professor: professors[0]._id,
        price: 800,
        currency: 'MAD',
        status: 'published',
        isPublic: true,
        featured: true,
        syllabus: [
          {
            week: 1,
            title: { en: 'Introduction to English', fr: 'Introduction à l\'anglais', ar: 'مقدمة في اللغة الإنجليزية' },
            description: { en: 'Basic greetings and introductions', fr: 'Salutations et présentations de base', ar: 'التحيات والتعارف الأساسي' },
            objectives: [
              { en: 'Learn basic greetings', fr: 'Apprendre les salutations de base', ar: 'تعلم التحيات الأساسية' },
              { en: 'Introduce yourself', fr: 'Se présenter', ar: 'تقديم نفسك' }
            ]
          }
        ]
      },
      {
        title: {
          en: 'Modern Arabic Conversation',
          fr: 'Conversation arabe moderne',
          ar: 'محادثة عربية حديثة'
        },
        description: {
          en: 'Learn to speak modern Arabic for daily communication',
          fr: 'Apprenez à parler l\'arabe moderne pour la communication quotidienne',
          ar: 'تعلم التحدث بالعربية الحديثة للتواصل اليومي'
        },
        shortDescription: {
          en: 'Master everyday Arabic conversations',
          fr: 'Maîtrisez les conversations arabes quotidiennes',
          ar: 'أتقن المحادثات العربية اليومية'
        },
        language: 'arabic',
        level: 'intermediate',
        category: 'conversation',
        duration: 30,
        maxStudents: 12,
        professor: professors[1]._id,
        price: 600,
        currency: 'MAD',
        status: 'published',
        isPublic: true,
        featured: false
      },
      {
        title: {
          en: 'French Grammar Mastery',
          fr: 'Maîtrise de la grammaire française',
          ar: 'إتقان قواعد اللغة الفرنسية'
        },
        description: {
          en: 'Advanced French grammar for intermediate to advanced learners',
          fr: 'Grammaire française avancée pour les apprenants intermédiaires à avancés',
          ar: 'قواعد اللغة الفرنسية المتقدمة للمتعلمين المتوسطين والمتقدمين'
        },
        shortDescription: {
          en: 'Perfect your French grammar skills',
          fr: 'Perfectionnez vos compétences en grammaire française',
          ar: 'أتقن مهارات قواعد اللغة الفرنسية'
        },
        language: 'french',
        level: 'advanced',
        category: 'grammar',
        duration: 25,
        maxStudents: 10,
        professor: professors[0]._id,
        price: 1000,
        currency: 'MAD',
        status: 'published',
        isPublic: true,
        featured: false
      }
    ];

    const marie = users.find((u) => u.email === 'marie.dubois@example.com');
    const createdCourses = [];
    for (const courseData of courses) {
      const course = new Course(courseData);
      if (marie) {
        course.enrolledStudents.push({ student: marie._id, progress: 30 });
      }
      await course.save();
      createdCourses.push(course);
      console.log(`✅ Cours créé: ${course.title.en}`);
    }

    return createdCourses;
  } catch (error) {
    console.error('❌ Erreur lors de la création des cours:', error);
    throw error;
  }
};

// Fonction pour créer des cohorts (class groups)
const createClassGroups = async (users, courses) => {
  try {
    const prof = users.find((u) => u.email === 'sarah.johnson@languageschool.com');
    const marie = users.find((u) => u.email === 'marie.dubois@example.com');
    if (!prof || !courses[0]) return [];

    const g = await ClassGroup.create({
      name: 'Cohort A — English Beginners',
      description: 'Demo cohort for admin / professor class-group pages',
      courseId: courses[0]._id,
      professorId: prof._id,
      studentIds: marie ? [marie._id] : [],
      status: 'active'
    });
    console.log(`✅ Class group créé: ${g.name}`);
    return [g];
  } catch (error) {
    console.error('❌ Erreur lors de la création des class groups:', error);
    throw error;
  }
};

// Fonction pour créer des classes de test
const createClasses = async (courses, users, classGroups) => {
  try {
    const marie = users.find((u) => u.email === 'marie.dubois@example.com');
    const cohortId = classGroups && classGroups[0] ? classGroups[0]._id : null;

    const classes = [
      {
        title: {
          en: 'English Basics - Week 1',
          fr: 'Bases d\'anglais - Semaine 1',
          ar: 'أساسيات الإنجليزية - الأسبوع الأول'
        },
        description: {
          en: 'Introduction to English alphabet and basic greetings',
          fr: 'Introduction à l\'alphabet anglais et aux salutations de base',
          ar: 'مقدمة في الأبجدية الإنجليزية والتحيات الأساسية'
        },
        course: courses[0]._id,
        professor: courses[0].professor,
        ...(cohortId ? { classGroupId: cohortId } : {}),
        type: 'live',
        status: 'scheduled',
        schedule: {
          startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Dans 7 jours
          endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // +1 heure
          timezone: 'UTC',
          recurrence: 'weekly'
        },
        maxStudents: 15,
        liveConfig: {
          platform: 'zoom',
          waitingRoom: true,
          recording: true
        }
      },
      {
        title: {
          en: 'Arabic Conversation Practice',
          fr: 'Pratique de conversation arabe',
          ar: 'ممارسة المحادثة العربية'
        },
        description: {
          en: 'Practice speaking Arabic in a supportive environment',
          fr: 'Pratiquez l\'arabe dans un environnement bienveillant',
          ar: 'مارس التحدث بالعربية في بيئة داعمة'
        },
        course: courses[1]._id,
        professor: courses[1].professor,
        type: 'recorded',
        status: 'completed',
        content: {
          videoUrl: 'https://example.com/video/arabic-conversation.mp4',
          videoDuration: 45,
          documents: [
            {
              title: { en: 'Conversation Guide', fr: 'Guide de conversation', ar: 'دليل المحادثة' },
              url: 'https://example.com/docs/conversation-guide.pdf',
              type: 'pdf',
              size: 1024000
            }
          ]
        },
        maxStudents: 12
      }
    ];

    const createdClasses = [];
    let idx = 0;
    for (const classData of classes) {
      const classItem = new Class(classData);
      await classItem.save();
      if (idx === 0 && marie) {
        await classItem.enrollStudent(marie._id);
      }
      createdClasses.push(classItem);
      console.log(`✅ Classe créée: ${classItem.title.en}`);
      idx += 1;
    }

    return createdClasses;
  } catch (error) {
    console.error('❌ Erreur lors de la création des classes:', error);
    throw error;
  }
};

// Fonction pour créer des candidatures de test
const createApplications = async () => {
  try {
    const applications = [
      {
        applicant: {
          firstName: 'Fatima',
          lastName: 'Zahra',
          email: 'fatima.zahra@example.com',
          phone: '+212612345678',
          dateOfBirth: new Date('1990-05-15'),
          nationality: 'Moroccan'
        },
        education: {
          degree: 'Master in French Literature',
          institution: 'University of Rabat',
          graduationYear: 2018,
          field: 'French Literature'
        },
        teachingExperience: {
          years: 3,
          description: {
            en: 'Three years of teaching French to high school students',
            fr: 'Trois ans d\'enseignement du français aux lycéens',
            ar: 'ثلاث سنوات من تدريس الفرنسية لطلاب المدارس الثانوية'
          },
          previousInstitutions: [
            {
              name: 'Lycée Hassan II',
              position: 'French Teacher',
              duration: '2019-2022',
              description: 'Taught French to students aged 15-18'
            }
          ]
        },
        languages: [
          {
            language: 'french',
            proficiency: 'native',
            teachingLevel: 'all',
            certifications: [
              {
                name: 'DELF Examiner',
                issuingBody: 'French Ministry of Education',
                dateObtained: new Date('2020-03-15')
              }
            ]
          },
          {
            language: 'english',
            proficiency: 'advanced',
            teachingLevel: 'intermediate'
          }
        ],
        motivation: {
          en: 'I am passionate about teaching French and helping students discover the beauty of the language',
          fr: 'Je suis passionnée par l\'enseignement du français et aider les étudiants à découvrir la beauté de la langue',
          ar: 'أنا شغوفة بتدريس الفرنسية ومساعدة الطلاب على اكتشاف جمال اللغة'
        },
        availability: {
          schedule: 'part-time',
          timezone: 'UTC+1',
          preferredHours: [
            { day: 'monday', startTime: '18:00', endTime: '20:00' },
            { day: 'wednesday', startTime: '18:00', endTime: '20:00' },
            { day: 'saturday', startTime: '10:00', endTime: '12:00' }
          ],
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Dans 30 jours
        },
        status: 'pending',
        priority: 'high'
      }
    ];

    const createdApplications = [];
    for (const appData of applications) {
      const application = new Application(appData);
      await application.save();
      createdApplications.push(application);
      console.log(`✅ Candidature créée: ${application.applicant.firstName} ${application.applicant.lastName}`);
    }

    return createdApplications;
  } catch (error) {
    console.error('❌ Erreur lors de la création des candidatures:', error);
    throw error;
  }
};

// Fonction principale
const seedDatabase = async () => {
  try {
    console.log('🌱 Début du seeding de la base de données...');
    
    await connectDB();
    await clearDatabase();
    
    const users = await createUsers();
    const courses = await createCourses(users);
    const classGroups = await createClassGroups(users, courses);
    const classes = await createClasses(courses, users, classGroups);
    const applications = await createApplications();
    
    console.log('\n🎉 Seeding terminé avec succès !');
    console.log(`📊 Statistiques:`);
    console.log(`   - ${users.length} utilisateurs créés`);
    console.log(`   - ${courses.length} cours créés`);
    console.log(`   - ${classes.length} classes créées`);
    console.log(`   - ${classGroups.length} cohortes (class groups) créées`);
    console.log(`   - ${applications.length} candidatures créées`);
    
    console.log('\n🔑 Comptes de test:');
    console.log('   Super Admin: admin@languageschool.com / admin123');
    console.log('   Content Admin: content@languageschool.com / content123');
    console.log('   Support Admin: support@languageschool.com / support123');
    console.log('   Professeur 1: sarah.johnson@languageschool.com / prof123');
    console.log('   Professeur 2: ahmed.almansouri@languageschool.com / prof123');
    console.log('   Étudiant (reglo): marie.dubois@example.com / student123');
    console.log('   Étudiant (pending): youssef.benali@example.com / student123');
    console.log('   Étudiant (invited): emma.wilson@example.com / student123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors du seeding:', error);
    process.exit(1);
  }
};

// Exécuter le seeding si le script est appelé directement
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase }; 
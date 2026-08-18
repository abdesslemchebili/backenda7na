/**
 * Enregistre tous les schémas Mongoose référencés par populate().
 * Évite MissingSchemaError en production si une route n'a pas encore chargé le modèle.
 */
require('./User');
require('./Class');
require('./ClassGroup');
require('./Chapter');
require('./Recording');
require('./Book');
require('./Material');
require('./Exercise');
require('./LearningGame');
require('./ChapterProgress');
require('./Enrollment');
require('./Level');
require('./Language');
require('./Notification');
require('./Attendance');
require('./Payment');
require('./Document');
require('./Application');
require('./Assignment');
require('./AssignmentSubmission');
require('./Exam');
require('./PlacementTest');
require('./TeacherEarning');
require('./Lead');
require('./Settings');
require('./EnrollmentRequest');
require('./AuditLog');
require('./PracticePack');
require('./GroupChallenge');
require('./PracticeScore');
require('./BookBookmark');
require('./BookReadingProgress');
require('./BookPageMetadata');

module.exports = {};

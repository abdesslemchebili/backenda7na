/**
 * One-shot migration: Course → ClassGroup hub.
 *
 * Usage (from backenda7na root, with .env loaded):
 *   node scripts/migrateCourseToClassGroup.js
 *
 * Safe to re-run: skips groups already linked via legacy courseId field on raw docs,
 * and only rewrites child docs that still have `course` / `courseId`.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

const CODE_TO_LANG = {
  en: 'english',
  eng: 'english',
  fr: 'french',
  ar: 'arabic',
  es: 'spanish',
  de: 'german',
  it: 'italian',
  english: 'english',
  french: 'french',
  arabic: 'arabic',
  spanish: 'spanish',
  german: 'german',
  italian: 'italian',
};

async function ensureLanguage(db, course) {
  const languages = db.collection('languages');
  if (course.languageRef) {
    const byId = await languages.findOne({ _id: course.languageRef });
    if (byId) return byId._id;
  }
  const codeGuess = (course.language || 'german').toString().toLowerCase();
  const enumLang = CODE_TO_LANG[codeGuess] || codeGuess;
  const codeMap = { english: 'en', french: 'fr', arabic: 'ar', spanish: 'es', german: 'de', italian: 'it' };
  const code = codeMap[enumLang] || 'de';
  let lang = await languages.findOne({ code });
  if (!lang) {
    const inserted = await languages.insertOne({
      name: enumLang.charAt(0).toUpperCase() + enumLang.slice(1),
      code,
      nativeName: enumLang,
      active: true,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return inserted.insertedId;
  }
  return lang._id;
}

async function ensureLevel(db, languageId, course) {
  if (course.levelRef) return course.levelRef;
  const cefr = course.cefrLevel || null;
  if (!cefr || !languageId) return null;
  const levels = db.collection('levels');
  let level = await levels.findOne({ language: languageId, code: cefr });
  if (!level) {
    const inserted = await levels.insertOne({
      language: languageId,
      code: cefr,
      name: { en: cefr, fr: cefr, ar: cefr },
      order: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return inserted.insertedId;
  }
  return level._id;
}

function courseTitle(course) {
  const t = course.title;
  if (!t) return `Migrated course ${course._id}`;
  if (typeof t === 'string') return t;
  return t.en || t.fr || t.ar || `Migrated course ${course._id}`;
}

async function migrate() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI / DATABASE_URL missing');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('Connected. Migrating Course → ClassGroup...');

  const courses = await db.collection('courses').find({}).toArray();
  console.log(`Found ${courses.length} courses`);

  const groups = db.collection('classgroups');
  const courseToGroup = new Map();

  for (const course of courses) {
    let group = await groups.findOne({ legacyCourseId: course._id });
    if (!group) {
      group = await groups.findOne({ courseId: course._id });
    }

    const languageId = await ensureLanguage(db, course);
    const levelId = await ensureLevel(db, languageId, course);
    const studentIds = (course.enrolledStudents || [])
      .map((e) => e.student)
      .filter(Boolean);

    if (!group) {
      const doc = {
        name: courseTitle(course),
        description: (course.description && (course.description.en || course.description.fr)) || '',
        languageId,
        levelId: levelId || null,
        bookId: course.bookId || null,
        level: course.cefrLevel || null,
        subLevel: null,
        capacity: course.maxStudents || 20,
        professorId: course.professor,
        studentIds,
        status: course.status === 'archived' ? 'archived' : 'active',
        legacyCourseId: course._id,
        createdAt: course.createdAt || new Date(),
        updatedAt: new Date(),
      };
      const result = await groups.insertOne(doc);
      group = { _id: result.insertedId, ...doc };
      console.log(`Created group ${group._id} for course ${course._id}`);
    } else {
      await groups.updateOne(
        { _id: group._id },
        {
          $set: {
            languageId: group.languageId || languageId,
            levelId: group.levelId || levelId || null,
            bookId: group.bookId || course.bookId || null,
            legacyCourseId: course._id,
            updatedAt: new Date(),
          },
          $addToSet: { studentIds: { $each: studentIds } },
          $unset: { courseId: '' },
        }
      );
      console.log(`Updated group ${group._id} for course ${course._id}`);
    }

    courseToGroup.set(course._id.toString(), group._id);
  }

  // Groups that never had a course: ensure languageId if missing
  const orphanGroups = await groups.find({ languageId: { $exists: false } }).toArray();
  for (const g of orphanGroups) {
    let languageId = null;
    const languages = db.collection('languages');
    const first = await languages.findOne({ active: true }) || await languages.findOne({});
    if (first) languageId = first._id;
    if (languageId) {
      await groups.updateOne({ _id: g._id }, { $set: { languageId } });
      console.log(`Backfilled languageId on orphan group ${g._id}`);
    }
  }

  async function remap(collectionName, fieldFrom, fieldTo) {
    const col = db.collection(collectionName);
    const docs = await col.find({ [fieldFrom]: { $exists: true, $ne: null } }).toArray();
    let n = 0;
    for (const doc of docs) {
      const oldId = doc[fieldFrom];
      if (!oldId) continue;
      const mapped = courseToGroup.get(oldId.toString());
      if (!mapped) continue;
      const update = { $set: { [fieldTo]: mapped }, $unset: { [fieldFrom]: '' } };
      // Class already has classGroupId — prefer mapped group, unset course
      if (collectionName === 'classes' && fieldFrom === 'course') {
        if (doc.classGroupId) {
          await col.updateOne({ _id: doc._id }, { $unset: { course: '' } });
        } else {
          await col.updateOne({ _id: doc._id }, { $set: { classGroupId: mapped }, $unset: { course: '' } });
        }
      } else {
        await col.updateOne({ _id: doc._id }, update);
      }
      n += 1;
    }
    console.log(`${collectionName}: remapped ${n} docs (${fieldFrom} → ${fieldTo})`);
  }

  await remap('classes', 'course', 'classGroupId');
  await remap('assignments', 'course', 'classGroup');
  await remap('documents', 'course', 'classGroup');
  await remap('materials', 'course', 'classGroup');
  await remap('exercises', 'course', 'classGroup');
  await remap('learninggames', 'course', 'classGroup');
  await remap('chapterprogresses', 'course', 'classGroup');
  await remap('enrollments', 'course', 'classGroup');
  await remap('practicescores', 'courseId', 'classGroupId');
  await remap('groupchallenges', 'courseId', 'classGroupId');
  await remap('exams', 'courseId', 'classGroupId');

  // Users: enrolledCourses → enrolledGroups
  const users = db.collection('users');
  const withCourses = await users.find({ 'studentInfo.enrolledCourses.0': { $exists: true } }).toArray();
  for (const u of withCourses) {
    const old = u.studentInfo?.enrolledCourses || [];
    const mapped = old.map((id) => courseToGroup.get(id.toString())).filter(Boolean);
    await users.updateOne(
      { _id: u._id },
      {
        $set: { 'studentInfo.enrolledGroups': mapped },
        $unset: { 'studentInfo.enrolledCourses': '', 'professorInfo.courses': '' },
      }
    );
  }
  await users.updateMany(
    { 'professorInfo.courses': { $exists: true } },
    { $unset: { 'professorInfo.courses': '' } }
  );
  console.log(`Users remapped: ${withCourses.length}`);

  // Drop courses collection
  const names = await db.listCollections({ name: 'courses' }).toArray();
  if (names.length) {
    await db.collection('courses').drop();
    console.log('Dropped collection courses');
  }

  console.log('Migration complete.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});

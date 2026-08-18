const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createUser, app } = require('./helpers');
const Language = require('../models/Language');
const Book = require('../models/Book');
const ClassGroup = require('../models/ClassGroup');
const BookBookmark = require('../models/BookBookmark');
const BookReadingProgress = require('../models/BookReadingProgress');

function bearer(user) {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function seedLanguage() {
  return Language.create({
    name: 'German',
    code: `d${Math.random().toString(36).slice(2, 10)}`,
    nativeName: 'Deutsch',
    icon: 'DE',
  });
}

async function seedBook(languageId, overrides = {}) {
  return Book.create({
    title: { fr: 'Menschen A1', en: 'Menschen A1', ar: '' },
    author: 'Hueber',
    publisher: 'Hueber Verlag',
    language: languageId,
    status: 'published',
    active: true,
    pdfUrl: '/uploads/documents/test-book.pdf',
    pdfSize: 1024,
    ...overrides,
  });
}

describe('Interactive book reader', () => {
  it('rejects unauthenticated reader access', async () => {
    const lang = await seedLanguage();
    const book = await seedBook(lang._id);
    const res = await request(app).get(`/api/books/${book._id}/reader`);
    expect(res.status).toBe(401);
  });

  it('forbids a student who is not enrolled', async () => {
    const lang = await seedLanguage();
    const book = await seedBook(lang._id);
    const student = await createUser({ role: 'student', status: 'reglo' });
    const res = await request(app).get(`/api/books/${book._id}/reader`).set(bearer(student));
    expect(res.status).toBe(403);
  });

  it('forbids a student who is not reglo even if enrolled', async () => {
    const lang = await seedLanguage();
    const professor = await createUser({ role: 'professor', status: 'verified' });
    const student = await createUser({ role: 'student', status: 'verified' });
    const book = await seedBook(lang._id);
    await ClassGroup.create({
      name: 'A1 Group',
      languageId: lang._id,
      bookId: book._id,
      professorId: professor._id,
      studentIds: [student._id],
    });
    const res = await request(app).get(`/api/books/${book._id}/reader`).set(bearer(student));
    expect(res.status).toBe(403);
  });

  it('isolates bookmarks and progress between students', async () => {
    const lang = await seedLanguage();
    const professor = await createUser({ role: 'professor', status: 'verified' });
    const studentA = await createUser({ role: 'student', status: 'reglo' });
    const studentB = await createUser({ role: 'student', status: 'reglo' });
    const book = await seedBook(lang._id);
    await ClassGroup.create({
      name: 'A1 Iso',
      languageId: lang._id,
      bookId: book._id,
      professorId: professor._id,
      studentIds: [studentA._id, studentB._id],
    });

    const headersA = bearer(studentA);
    const headersB = bearer(studentB);

    const bmA = await request(app)
      .post(`/api/books/${book._id}/bookmarks`)
      .set(headersA)
      .send({ pageNumber: 58, label: 'Kapitel 4' });
    expect(bmA.status).toBe(201);

    const progA = await request(app)
      .put(`/api/books/${book._id}/progress`)
      .set(headersA)
      .send({ lastPage: 58, totalPages: 120 });
    expect(progA.status).toBe(200);
    expect(progA.body.lastPage).toBe(58);
    expect(progA.body.percent).toBe(48);

    const listB = await request(app).get(`/api/books/${book._id}/bookmarks`).set(headersB);
    expect(listB.status).toBe(200);
    expect(listB.body.data).toHaveLength(0);

    const progB = await request(app).get(`/api/books/${book._id}/progress`).set(headersB);
    expect(progB.status).toBe(200);
    expect(progB.body.lastPage).toBe(1);

    const listA = await request(app).get(`/api/books/${book._id}/bookmarks`).set(headersA);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0].pageNumber).toBe(58);

    const removed = await request(app)
      .delete(`/api/books/${book._id}/bookmarks/58`)
      .set(headersA);
    expect(removed.status).toBe(200);

    const after = await request(app).get(`/api/books/${book._id}/bookmarks`).set(headersA);
    expect(after.body.data).toHaveLength(0);

    expect(await BookBookmark.countDocuments({ user: studentB._id })).toBe(0);
    expect(await BookReadingProgress.countDocuments({ user: studentB._id, lastPage: 58 })).toBe(0);
  });

  it('lets content admin upsert sparse page metadata without creating every page', async () => {
    const lang = await seedLanguage();
    const book = await seedBook(lang._id);
    const admin = await createUser({
      role: 'admin',
      adminLevel: 'content',
      status: 'verified',
    });
    const res = await request(app)
      .put(`/api/books/${book._id}/page-metadata/58`)
      .set(bearer(admin))
      .send({
        vocabulary: [
          { term: 'kommen', translation: 'venir' },
          { term: 'wohnen', translation: 'habiter' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.pageNumber).toBe(58);
    expect(res.body.vocabulary).toHaveLength(2);

    const list = await request(app)
      .get(`/api/books/${book._id}/page-metadata`)
      .set(bearer(admin));
    expect(list.body.data).toHaveLength(1);
  });

  it('returns 404 for stream when PDF file is missing on disk', async () => {
    const lang = await seedLanguage();
    const professor = await createUser({ role: 'professor', status: 'verified' });
    const student = await createUser({ role: 'student', status: 'reglo' });
    const book = await seedBook(lang._id, { pdfUrl: '/uploads/documents/missing-book.pdf' });
    await ClassGroup.create({
      name: 'Stream Group',
      languageId: lang._id,
      bookId: book._id,
      professorId: professor._id,
      studentIds: [student._id],
    });
    const res = await request(app).get(`/api/books/${book._id}/stream`).set(bearer(student));
    expect(res.status).toBe(404);
  });
});

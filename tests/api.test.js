const request = require('supertest');
const { createUser, loginAs, authHeader, app } = require('./helpers');

describe('API — Sprint 6 critical paths', () => {
  describe('Health', () => {
    it('GET /api/health returns ok when DB is connected', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('connected');
    });
  });

  describe('Auth', () => {
    it('rejects login with missing credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid credentials', async () => {
      await createUser({ email: 'student@example.com', password: 'correctpass' });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@example.com', password: 'wrongpass' });
      expect(res.status).toBe(401);
    });

    it('returns token for valid student login', async () => {
      await createUser({
        email: 'valid@example.com',
        password: 'secret123',
        role: 'student',
        status: 'reglo',
      });
      const res = await loginAs('valid@example.com', 'secret123');
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('student');
    });

    it('returns token for valid admin login', async () => {
      await createUser({
        email: 'admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'super',
        status: 'verified',
      });
      const res = await loginAs('admin@example.com', 'adminpass');
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('admin');
    });
  });

  describe('Enrollment requests', () => {
    it('creates a public enrollment request', async () => {
      const res = await request(app).post('/api/enrollment-requests').send({
        fullName: 'Jean Dupont',
        email: 'jean.dupont@example.com',
        phone: '+33612345678',
        country: 'France',
        currentGermanLevel: 'A1',
      });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeDefined();
    });

    it('rejects duplicate pending enrollment', async () => {
      const payload = {
        fullName: 'Marie Martin',
        email: 'marie.martin@example.com',
        phone: '+33698765432',
        country: 'France',
      };
      await request(app).post('/api/enrollment-requests').send(payload);
      const res = await request(app).post('/api/enrollment-requests').send(payload);
      expect(res.status).toBe(400);
    });
  });

  describe('Payments', () => {
    it('allows student to submit payment proof', async () => {
      const student = await createUser({
        email: 'pay@example.com',
        password: 'paypass',
        role: 'student',
        status: 'verified',
      });
      const headers = await authHeader('pay@example.com', 'paypass');

      const res = await request(app)
        .post('/api/payments')
        .set(headers)
        .send({
          invoiceImageUrl: '/uploads/invoices/test.jpg',
          paymentDate: new Date().toISOString(),
          notes: 'Virement bancaire',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PAYMENT_SUBMITTED');

      const list = await request(app).get('/api/payments/me').set(headers);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
    });

    it('denies student access to admin payment list', async () => {
      await createUser({
        email: 'student2@example.com',
        password: 'pass123',
        role: 'student',
        status: 'reglo',
      });
      const headers = await authHeader('student2@example.com', 'pass123');
      const res = await request(app).get('/api/payments').set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Attendance authorization', () => {
    it('student can view own attendance', async () => {
      await createUser({
        email: 'att-self@example.com',
        password: 'pass123',
        role: 'student',
        status: 'reglo',
      });
      const headers = await authHeader('att-self@example.com', 'pass123');
      const res = await request(app).get('/api/users/me/attendance').set(headers);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('student cannot view another student attendance', async () => {
      const other = await createUser({
        email: 'other@example.com',
        password: 'pass123',
        role: 'student',
        status: 'reglo',
      });
      await createUser({
        email: 'viewer@example.com',
        password: 'pass123',
        role: 'student',
        status: 'reglo',
      });
      const headers = await authHeader('viewer@example.com', 'pass123');
      const res = await request(app)
        .get(`/api/attendance/student/${other._id}`)
        .set(headers);
      expect(res.status).toBe(403);
    });
  });

  describe('Languages & Levels catalog', () => {
    it('seeds default languages and CEFR levels for content admin', async () => {
      await createUser({
        email: 'content-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'content',
        status: 'verified',
      });
      const headers = await authHeader('content-admin@example.com', 'adminpass');

      const seedRes = await request(app).post('/api/languages/seed').set(headers);
      expect(seedRes.status).toBe(200);
      expect(seedRes.body.languages).toBeGreaterThanOrEqual(4);
      expect(seedRes.body.levels).toBeGreaterThanOrEqual(24);

      const listRes = await request(app).get('/api/languages').set(headers);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((l) => l.code === 'de')).toBe(true);

      const levelsRes = await request(app)
        .get('/api/levels?languageCode=de')
        .set(headers);
      expect(levelsRes.status).toBe(200);
      expect(levelsRes.body.data.length).toBe(6);
    });

    it('rejects language creation for support admin', async () => {
      await createUser({
        email: 'support-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'support',
        status: 'verified',
      });
      const headers = await authHeader('support-admin@example.com', 'adminpass');

      const res = await request(app)
        .post('/api/languages')
        .set(headers)
        .send({ name: 'Italian', code: 'it' });
      expect(res.status).toBe(403);
    });
  });

  describe('Books, chapters & materials', () => {
    it('creates a book and chapter for content admin', async () => {
      await createUser({
        email: 'book-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'content',
        status: 'verified',
      });
      const headers = await authHeader('book-admin@example.com', 'adminpass');

      await request(app).post('/api/languages/seed').set(headers);
      const langsRes = await request(app).get('/api/languages').set(headers);
      const deLang = langsRes.body.data.find((l) => l.code === 'de');
      expect(deLang).toBeDefined();

      const bookRes = await request(app)
        .post('/api/books')
        .set(headers)
        .send({
          title: 'Menschen A1',
          languageId: deLang._id,
          author: 'Hueber',
          status: 'published',
        });
      expect(bookRes.status).toBe(201);
      expect(bookRes.body.displayTitle).toBe('Menschen A1');

      const chapterRes = await request(app)
        .post(`/api/books/${bookRes.body._id}/chapters`)
        .set(headers)
        .send({ title: 'Kapitel 1', order: 1, status: 'published' });
      expect(chapterRes.status).toBe(201);
      expect(chapterRes.body.order).toBe(1);

      const listCh = await request(app)
        .get(`/api/books/${bookRes.body._id}/chapters`)
        .set(headers);
      expect(listCh.status).toBe(200);
      expect(listCh.body.data.length).toBe(1);
    });
  });

  describe('Live sessions & recordings', () => {
    it('creates recording on end session with URL and professor notes', async () => {
      const professor = await createUser({
        email: 'prof-rec@example.com',
        password: 'propass',
        role: 'professor',
        status: 'verified',
      });
      const profHeaders = await authHeader('prof-rec@example.com', 'propass');

      const courseRes = await request(app)
        .post('/api/courses')
        .set(profHeaders)
        .send({
          title: { en: 'German A1', fr: 'Allemand A1', ar: 'German A1' },
          description: { en: 'Test', fr: 'Test', ar: 'Test' },
          language: 'german',
          level: 'beginner',
          status: 'published',
          maxStudents: 20,
          price: 0,
          duration: 8,
          category: 'general',
        });
      expect(courseRes.status).toBe(201);
      const courseId = courseRes.body._id;

      const start = new Date(Date.now() + 5 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const classRes = await request(app)
        .post('/api/classes')
        .set(profHeaders)
        .send({
          title: { en: 'Live 1', fr: 'Live 1', ar: 'Live 1' },
          description: { en: '', fr: '', ar: '' },
          course: courseId,
          type: 'live',
          status: 'scheduled',
          schedule: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            timezone: 'UTC',
            recurrence: 'none',
          },
          maxStudents: 20,
        });
      expect(classRes.status).toBe(201);
      const classId = classRes.body._id;

      const startRes = await request(app)
        .post(`/api/classes/${classId}/start`)
        .set(profHeaders)
        .send({ recordingStarted: true });
      expect(startRes.status).toBe(200);

      const recPending = await request(app)
        .get(`/api/recordings/session/${classId}`)
        .set(profHeaders);
      expect(recPending.status).toBe(200);
      expect(recPending.body.data?.status).toBe('processing');

      const endRes = await request(app)
        .post(`/api/classes/${classId}/end`)
        .set(profHeaders)
        .send({
          recordingUrl: 'https://example.com/recording.mp4',
          notes: 'Révision du chapitre 1 — exercices page 12',
          durationSeconds: 3600,
        });
      expect(endRes.status).toBe(200);
      expect(endRes.body.status).toBe('completed');
      expect(endRes.body.notes?.fr).toContain('chapitre 1');
      expect(endRes.body.recording?.status).toBe('ready');
      expect(endRes.body.recording?.playbackUrl).toBe('https://example.com/recording.mp4');
    });

    it('returns LiveKit join token for professor host', async () => {
      const professor = await createUser({
        email: 'prof-livekit@example.com',
        password: 'propass',
        role: 'professor',
        status: 'verified',
      });
      const profHeaders = await authHeader('prof-livekit@example.com', 'propass');

      const courseRes = await request(app)
        .post('/api/courses')
        .set(profHeaders)
        .send({
          title: { en: 'German A1', fr: 'Allemand A1', ar: 'German A1' },
          description: { en: 'Test', fr: 'Test', ar: 'Test' },
          language: 'german',
          level: 'beginner',
          status: 'published',
          maxStudents: 20,
          price: 0,
          duration: 8,
          category: 'general',
        });
      expect(courseRes.status).toBe(201);
      const courseId = courseRes.body._id;

      const start = new Date(Date.now() + 5 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const classRes = await request(app)
        .post('/api/classes')
        .set(profHeaders)
        .send({
          title: { en: 'Live LK', fr: 'Live LK', ar: 'Live LK' },
          description: { en: '', fr: '', ar: '' },
          course: courseId,
          type: 'live',
          status: 'scheduled',
          schedule: {
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            timezone: 'UTC',
            recurrence: 'none',
          },
          maxStudents: 20,
        });
      expect(classRes.status).toBe(201);
      const classId = classRes.body._id;

      await request(app)
        .post(`/api/classes/${classId}/start`)
        .set(profHeaders)
        .send({});

      const tokenRes = await request(app)
        .get(`/api/classes/${classId}/join-token`)
        .set(profHeaders);
      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.provider).toBe('livekit');
      expect(tokenRes.body.serverUrl).toBe('wss://test-project.livekit.cloud');
      expect(typeof tokenRes.body.token).toBe('string');
      expect(tokenRes.body.token.length).toBeGreaterThan(20);
      expect(tokenRes.body.roomName).toMatch(/^na-/);
      expect(tokenRes.body.isHost).toBe(true);
    });
  });

  describe('Chapter exercises', () => {
    it('creates exercise, student submits MCQ, admin lists by chapter', async () => {
      await createUser({
        email: 'ex-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'content',
        status: 'verified',
      });
      const adminHeaders = await authHeader('ex-admin@example.com', 'adminpass');

      await request(app).post('/api/languages/seed').set(adminHeaders);
      const langsRes = await request(app).get('/api/languages').set(adminHeaders);
      const deLang = langsRes.body.data.find((l) => l.code === 'de');

      const bookRes = await request(app)
        .post('/api/books')
        .set(adminHeaders)
        .send({ title: 'Testbuch', languageId: deLang._id, status: 'published' });
      expect(bookRes.status).toBe(201);

      const chapterRes = await request(app)
        .post(`/api/books/${bookRes.body._id}/chapters`)
        .set(adminHeaders)
        .send({ title: 'Kapitel 1', order: 1, status: 'published' });
      expect(chapterRes.status).toBe(201);

      const exerciseRes = await request(app)
        .post('/api/exercises')
        .set(adminHeaders)
        .send({
          title: 'Quiz Kapitel 1',
          bookId: bookRes.body._id,
          chapterId: chapterRes.body._id,
          questions: [
            {
              type: 'multiple_choice',
              question: { en: 'Hello?', fr: 'Bonjour ?' },
              options: ['Hallo', 'Tschüss'],
              correctAnswer: 'Hallo',
              points: 2,
            },
          ],
          passingScore: 50,
        });
      expect(exerciseRes.status).toBe(201);
      expect(exerciseRes.body.questions).toHaveLength(1);

      const listRes = await request(app)
        .get(`/api/exercises?chapterId=${chapterRes.body._id}`)
        .set(adminHeaders);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);

      const student = await createUser({
        email: 'ex-student@example.com',
        password: 'stupass',
        role: 'student',
        status: 'reglo',
      });
      const prof = await createUser({
        email: 'ex-prof@example.com',
        password: 'propass',
        role: 'professor',
        status: 'verified',
      });
      const profHeaders = await authHeader('ex-prof@example.com', 'propass');

      const courseRes = await request(app)
        .post('/api/courses')
        .set(profHeaders)
        .send({
          title: { en: 'DE A1', fr: 'DE A1', ar: 'DE A1' },
          description: { en: 'x', fr: 'x', ar: 'x' },
          language: 'german',
          level: 'beginner',
          status: 'published',
          maxStudents: 20,
          price: 0,
          duration: 8,
          category: 'general',
          bookId: bookRes.body._id,
        });
      expect(courseRes.status).toBe(201);

      await request(app)
        .post(`/api/courses/${courseRes.body._id}/enroll`)
        .set(await authHeader('ex-student@example.com', 'stupass'));

      const studentHeaders = await authHeader('ex-student@example.com', 'stupass');
      const exId = exerciseRes.body._id;
      const qId = exerciseRes.body.questions[0]._id;

      const submitRes = await request(app)
        .post(`/api/exercises/${exId}/submit`)
        .set(studentHeaders)
        .send({ answers: [{ questionId: qId, answer: 'Hallo' }] });
      expect(submitRes.status).toBe(200);
      expect(submitRes.body.passed).toBe(true);
      expect(submitRes.body.percentage).toBe(100);
    });
  });

  describe('Learning games & gamification', () => {
    it('creates word match game and awards XP on play', async () => {
      await createUser({
        email: 'game-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'content',
        status: 'verified',
      });
      const adminHeaders = await authHeader('game-admin@example.com', 'adminpass');

      await request(app).post('/api/languages/seed').set(adminHeaders);
      const langsRes = await request(app).get('/api/languages').set(adminHeaders);
      const deLang = langsRes.body.data.find((l) => l.code === 'de');

      const bookRes = await request(app)
        .post('/api/books')
        .set(adminHeaders)
        .send({ title: 'Spielbuch', languageId: deLang._id, status: 'published' });
      const chapterRes = await request(app)
        .post(`/api/books/${bookRes.body._id}/chapters`)
        .set(adminHeaders)
        .send({ title: 'Wörter 1', order: 1, status: 'published' });

      const gameRes = await request(app)
        .post('/api/games')
        .set(adminHeaders)
        .send({
          title: 'Vocabulaire — Salutations',
          bookId: bookRes.body._id,
          chapterId: chapterRes.body._id,
          type: 'word_match',
          items: [
            { term: 'Hallo', translation: 'Bonjour' },
            { term: 'Tschüss', translation: 'Au revoir' },
          ],
          xpReward: 20,
        });
      expect(gameRes.status).toBe(201);

      await createUser({
        email: 'game-student@example.com',
        password: 'stupass',
        role: 'student',
        status: 'reglo',
      });
      const profHeaders = await authHeader('game-admin@example.com', 'adminpass');
      const courseRes = await request(app)
        .post('/api/courses')
        .set(profHeaders)
        .send({
          title: { en: 'DE Games', fr: 'DE Games', ar: 'DE Games' },
          description: { en: 'x', fr: 'x', ar: 'x' },
          language: 'german',
          level: 'beginner',
          status: 'published',
          maxStudents: 20,
          price: 0,
          duration: 8,
          category: 'general',
          bookId: bookRes.body._id,
        });
      await request(app)
        .post(`/api/courses/${courseRes.body._id}/enroll`)
        .set(await authHeader('game-student@example.com', 'stupass'));

      const studentHeaders = await authHeader('game-student@example.com', 'stupass');
      const playRes = await request(app)
        .post(`/api/games/${gameRes.body._id}/play`)
        .set(studentHeaders)
        .send({ score: 100, pairsMatched: 2, totalPairs: 2, durationSeconds: 45 });
      expect(playRes.status).toBe(200);
      expect(playRes.body.play.xpEarned).toBe(20);
      expect(playRes.body.gamification.totalXp).toBeGreaterThanOrEqual(20);

      const profileRes = await request(app).get('/api/gamification/me').set(studentHeaders);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.totalXp).toBeGreaterThanOrEqual(20);
      expect(profileRes.body.badges.some((b) => b.code === 'first_game')).toBe(true);
    });
  });

  describe('Chapter progress & leaderboard', () => {
    it('syncs chapter progress after exercise and returns leaderboard', async () => {
      await createUser({
        email: 'prog-admin@example.com',
        password: 'adminpass',
        role: 'admin',
        adminLevel: 'content',
        status: 'verified',
      });
      const adminHeaders = await authHeader('prog-admin@example.com', 'adminpass');
      await request(app).post('/api/languages/seed').set(adminHeaders);
      const langsRes = await request(app).get('/api/languages').set(adminHeaders);
      const deLang = langsRes.body.data.find((l) => l.code === 'de');

      const bookRes = await request(app)
        .post('/api/books')
        .set(adminHeaders)
        .send({ title: 'Prog Book', languageId: deLang._id, status: 'published' });
      const ch1 = await request(app)
        .post(`/api/books/${bookRes.body._id}/chapters`)
        .set(adminHeaders)
        .send({ title: 'Ch 1', order: 1, status: 'published' });
      const ch2 = await request(app)
        .post(`/api/books/${bookRes.body._id}/chapters`)
        .set(adminHeaders)
        .send({ title: 'Ch 2', order: 2, status: 'published' });

      const exRes = await request(app)
        .post('/api/exercises')
        .set(adminHeaders)
        .send({
          title: 'Quiz 1',
          bookId: bookRes.body._id,
          chapterId: ch1.body._id,
          questions: [{
            type: 'multiple_choice',
            question: { en: 'Hi?', fr: 'Hi?' },
            options: ['Hallo', 'Bye'],
            correctAnswer: 'Hallo',
            points: 1,
          }],
        });

      await createUser({ email: 'prog-student@example.com', password: 'stupass', role: 'student', status: 'reglo' });
      const profHeaders = await authHeader('prog-admin@example.com', 'adminpass');
      const courseRes = await request(app)
        .post('/api/courses')
        .set(profHeaders)
        .send({
          title: { en: 'Prog', fr: 'Prog', ar: 'Prog' },
          description: { en: 'x', fr: 'x', ar: 'x' },
          language: 'german',
          level: 'beginner',
          status: 'published',
          maxStudents: 20,
          price: 0,
          duration: 8,
          category: 'general',
          bookId: bookRes.body._id,
        });
      const courseId = courseRes.body._id;
      const studentHeaders = await authHeader('prog-student@example.com', 'stupass');
      await request(app).post(`/api/courses/${courseId}/enroll`).set(studentHeaders);

      const qId = exRes.body.questions[0]._id;
      await request(app)
        .post(`/api/exercises/${exRes.body._id}/submit`)
        .set(studentHeaders)
        .send({ answers: [{ questionId: qId, answer: 'Hallo' }] });

      const progressRes = await request(app)
        .get(`/api/progress/course/${courseId}`)
        .set(studentHeaders);
      expect(progressRes.status).toBe(200);
      expect(progressRes.body.overallProgress).toBeGreaterThan(0);
      expect(progressRes.body.chapters.find((c) => c.chapterId === ch1.body._id)?.status).toBe('completed');
      expect(progressRes.body.chapters.find((c) => c.chapterId === ch2.body._id)?.status).toBe('available');

      const boardRes = await request(app)
        .get(`/api/progress/course/${courseId}/leaderboard`)
        .set(studentHeaders);
      expect(boardRes.status).toBe(200);
      expect(boardRes.body.data.length).toBeGreaterThan(0);
      expect(boardRes.body.myRank).toBe(1);
    });
  });
});

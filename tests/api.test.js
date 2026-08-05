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
});

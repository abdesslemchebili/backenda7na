const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

async function createUser(overrides = {}) {
  const defaults = {
    firstName: 'Test',
    lastName: 'User',
    email: `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'testpass123',
    role: 'student',
    status: 'reglo',
    emailVerified: true,
  };
  return User.create({ ...defaults, ...overrides });
}

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
}

async function authHeader(email, password) {
  const res = await loginAs(email, password);
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { Authorization: `Bearer ${res.body.token}` };
}

module.exports = { createUser, loginAs, authHeader, app };

const mongoose = require('mongoose');

const TEST_URI =
  process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/nour_academy_test';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-sprint6';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.BCRYPT_ROUNDS = '4';

  await mongoose.connect(TEST_URI);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});

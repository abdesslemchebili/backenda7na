require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        'mongodb://localhost:27017/language_school'
    );
    console.log('✅ Connexion à MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur de connexion à MongoDB:', error.message);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log('📚 Plateforme Nour Academy');
    console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = { app, connectDB, startServer };

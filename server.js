require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === 'production'
      ? null
      : 'mongodb://localhost:27017/language_school');

  if (!uri) {
    console.error(
      '❌ MONGODB_URI (ou DATABASE_URL) est requis en production. ' +
        'Ajoutez-le dans les Environment Variables de Render / votre hébergeur.'
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
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

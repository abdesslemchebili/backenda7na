const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
const documentsDir = path.join(uploadsDir, 'documents');
const imagesDir = path.join(uploadsDir, 'images');

[uploadsDir, documentsDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const docStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, unique + ext);
  }
});

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, unique + ext);
  }
});

const fileFilterDoc = (req, file, cb) => {
  const allowed = /\.(pdf|doc|docx|ppt|pptx)$/i.test(file.originalname) ||
    ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(file.mimetype);
  cb(null, !!allowed);
};

const fileFilterImage = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
  cb(null, !!allowed);
};

const uploadDocument = multer({
  storage: docStorage,
  fileFilter: fileFilterDoc,
  limits: { fileSize: 20 * 1024 * 1024 }
}).single('file');

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: fileFilterImage,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('file');

module.exports = { uploadDocument, uploadImage };

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
const documentsDir = path.join(uploadsDir, 'documents');
const imagesDir = path.join(uploadsDir, 'images');
const audioDir = path.join(uploadsDir, 'audio');

[uploadsDir, documentsDir, imagesDir, audioDir].forEach(dir => {
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
  if (!allowed) {
    return cb(new Error('File type not allowed'));
  }
  cb(null, true);
};

const fileFilterImage = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
  cb(null, !!allowed);
};

const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, audioDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = (path.extname(file.originalname) || '.mp3').toLowerCase();
    cb(null, unique + ext);
  }
});

const fileFilterAudio = (req, file, cb) => {
  const allowed =
    /\.(mp3|m4a|wav|ogg)$/i.test(file.originalname) ||
    ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/x-m4a'].includes(file.mimetype);
  cb(null, !!allowed);
};

const uploadDocument = multer({
  storage: docStorage,
  fileFilter: fileFilterDoc,
  limits: { fileSize: 100 * 1024 * 1024 }
}).single('file');

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: fileFilterImage,
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('file');

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: fileFilterAudio,
  limits: { fileSize: 30 * 1024 * 1024 }
}).single('file');

const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isAudio =
      file.mimetype.startsWith('audio/') || /\.(mp3|m4a|wav|ogg)$/i.test(file.originalname);
    cb(null, isAudio ? audioDir : documentsDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, unique + ext);
  }
});

const fileFilterMaterial = (req, file, cb) => {
  const isAudio =
    file.mimetype.startsWith('audio/') || /\.(mp3|m4a|wav|ogg)$/i.test(file.originalname);
  const isDoc =
    /\.(pdf|doc|docx|ppt|pptx)$/i.test(file.originalname) ||
    ['application/pdf', 'application/msword'].includes(file.mimetype);
  cb(null, isAudio || isDoc);
};

const uploadMaterial = multer({
  storage: materialStorage,
  fileFilter: fileFilterMaterial,
  limits: { fileSize: 30 * 1024 * 1024 }
}).single('file');

module.exports = {
  uploadDocument,
  uploadImage,
  uploadAudio,
  uploadMaterial,
  /** Express error middleware for multer failures (size / type). */
  handleUploadError(err, req, res, next) {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Fichier trop volumineux (PDF max 100 Mo).',
        });
      }
      return res.status(400).json({ error: 'ValidationError', message: err.message });
    }
    if (err.message && /file type|File type|not allowed/i.test(err.message)) {
      return res.status(400).json({ error: 'ValidationError', message: 'Type de fichier non autorisé (PDF requis).' });
    }
    // multer fileFilter rejection often passes Error
    if (err.message === 'File type not allowed' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'ValidationError', message: err.message });
    }
    return next(err);
  },
};

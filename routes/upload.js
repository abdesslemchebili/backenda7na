const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { uploadImage: uploadImageMw } = require('../middleware/upload');
const documentController = require('../controllers/documentController');

// POST /api/upload or POST /api/upload/image - generic image upload
router.post('/', authenticateToken, uploadImageMw, documentController.uploadImage);
router.post('/image', authenticateToken, uploadImageMw, documentController.uploadImage);

module.exports = router;

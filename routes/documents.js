const express = require('express');
const router = express.Router();
const { authenticateToken, requireRegloForStudents } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

router.get('/documents/:id/download', authenticateToken, requireRegloForStudents, documentController.downloadDocument);
router.delete('/documents/:id', authenticateToken, documentController.deleteDocument);

module.exports = router;

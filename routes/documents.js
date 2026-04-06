const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

// Download document (returns URL) - GET /api/documents/:id/download
router.get('/documents/:id/download', authenticateToken, documentController.downloadDocument);

// Delete document (professor/admin) - DELETE /api/documents/:id
router.delete('/documents/:id', authenticateToken, documentController.deleteDocument);

module.exports = router;

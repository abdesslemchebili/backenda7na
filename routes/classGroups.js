const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const classGroupController = require('../controllers/classGroupController');

router.get('/', authenticateToken, classGroupController.list);
router.post('/', authenticateToken, classGroupController.create);
router.get('/:id', authenticateToken, classGroupController.getById);
router.put('/:id', authenticateToken, classGroupController.update);

module.exports = router;

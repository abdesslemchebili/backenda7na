const express = require('express');
const router = express.Router();
const materialCtrl = require('../controllers/materialController');
const {
  authenticateToken,
  authorizeRoles,
  authorizeAdminLevels,
} = require('../middleware/auth');
const { uploadMaterial } = require('../middleware/upload');

const contentAdmin = [
  authenticateToken,
  authorizeRoles('admin'),
  authorizeAdminLevels('super', 'full', 'content'),
];

router.get('/', authenticateToken, materialCtrl.listMaterials);
router.post('/', ...contentAdmin, uploadMaterial, materialCtrl.createMaterial);
router.get('/:id/download', authenticateToken, materialCtrl.downloadMaterial);
router.put('/:id', ...contentAdmin, materialCtrl.updateMaterial);
router.delete('/:id', ...contentAdmin, materialCtrl.deleteMaterial);

module.exports = router;

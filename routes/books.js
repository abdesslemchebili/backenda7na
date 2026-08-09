const express = require('express');
const router = express.Router();
const bookCtrl = require('../controllers/bookController');
const chapterCtrl = require('../controllers/chapterController');
const {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  authorizeAdminLevels,
} = require('../middleware/auth');
const { uploadDocument, uploadImage } = require('../middleware/upload');

const contentAdmin = [
  authenticateToken,
  authorizeRoles('admin'),
  authorizeAdminLevels('super', 'full', 'content'),
];

router.get('/', optionalAuth, bookCtrl.listBooks);
router.get('/:id/download', authenticateToken, bookCtrl.downloadBookPdf);
router.get('/:id', optionalAuth, bookCtrl.getBook);
router.post('/', ...contentAdmin, bookCtrl.createBook);
router.put('/:id', ...contentAdmin, bookCtrl.updateBook);
router.delete('/:id', ...contentAdmin, bookCtrl.deleteBook);
router.post('/:id/pdf', ...contentAdmin, uploadDocument, bookCtrl.uploadBookPdf);
router.post('/:id/cover', ...contentAdmin, uploadImage, bookCtrl.uploadBookCover);

router.get('/:bookId/chapters', optionalAuth, chapterCtrl.listByBook);
router.post('/:bookId/chapters', ...contentAdmin, chapterCtrl.createChapter);

module.exports = router;

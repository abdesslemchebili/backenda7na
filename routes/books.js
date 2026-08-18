const express = require('express');
const router = express.Router();
const bookCtrl = require('../controllers/bookController');
const chapterCtrl = require('../controllers/chapterController');
const readerCtrl = require('../controllers/bookReaderController');
const {
  authenticateToken,
  optionalAuth,
  authorizeRoles,
  authorizeAdminLevels,
  requireRegloForStudents,
} = require('../middleware/auth');
const { uploadDocument, uploadImage, handleUploadError } = require('../middleware/upload');

const contentAdmin = [
  authenticateToken,
  authorizeRoles('admin'),
  authorizeAdminLevels('super', 'full', 'content'),
];

const bookContent = [authenticateToken, requireRegloForStudents];

router.get('/', optionalAuth, bookCtrl.listBooks);

router.get('/:id/download', ...bookContent, bookCtrl.downloadBookPdf);
router.get('/:id/stream', optionalAuth, readerCtrl.streamBookPdf);
router.get('/:id/reader', ...bookContent, readerCtrl.getBookReader);

router.get('/:id/bookmarks', ...bookContent, readerCtrl.listBookmarks);
router.post('/:id/bookmarks', ...bookContent, readerCtrl.createBookmark);
router.delete('/:id/bookmarks/:page', ...bookContent, readerCtrl.deleteBookmark);

router.get('/:id/progress', ...bookContent, readerCtrl.getReadingProgress);
router.put('/:id/progress', ...bookContent, readerCtrl.upsertReadingProgress);

router.get('/:id/page-metadata', ...bookContent, readerCtrl.listPageMetadata);
router.put('/:id/page-metadata/:pageNumber', ...contentAdmin, readerCtrl.upsertPageMetadata);
router.delete('/:id/page-metadata/:pageNumber', ...contentAdmin, readerCtrl.deletePageMetadata);
router.post(
  '/:id/page-metadata/:pageNumber/hotspots',
  ...contentAdmin,
  readerCtrl.addPageHotspot
);
router.patch(
  '/:id/page-metadata/:pageNumber/hotspots/:hotspotId',
  ...contentAdmin,
  readerCtrl.updatePageHotspot
);
router.delete(
  '/:id/page-metadata/:pageNumber/hotspots/:hotspotId',
  ...contentAdmin,
  readerCtrl.deletePageHotspot
);

router.get('/:id', optionalAuth, bookCtrl.getBook);
router.post('/', ...contentAdmin, bookCtrl.createBook);
router.put('/:id', ...contentAdmin, bookCtrl.updateBook);
router.delete('/:id', ...contentAdmin, bookCtrl.deleteBook);
router.post('/:id/pdf', ...contentAdmin, uploadDocument, handleUploadError, bookCtrl.uploadBookPdf);
router.post('/:id/cover', ...contentAdmin, uploadImage, handleUploadError, bookCtrl.uploadBookCover);

router.get('/:bookId/chapters', optionalAuth, chapterCtrl.listByBook);
router.post('/:bookId/chapters', ...contentAdmin, chapterCtrl.createChapter);

module.exports = router;

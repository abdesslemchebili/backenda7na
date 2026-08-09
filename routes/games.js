const express = require('express');
const router = express.Router();
const gameCtrl = require('../controllers/gameController');
const {
  authenticateToken,
  authorizeRoles,
  requireRegloForStudents,
} = require('../middleware/auth');

router.get('/plays/me', authenticateToken, requireRegloForStudents, gameCtrl.getMyPlays);
router.get('/', authenticateToken, requireRegloForStudents, gameCtrl.listGames);
router.get('/:id', authenticateToken, requireRegloForStudents, gameCtrl.getGame);
router.post('/', authenticateToken, authorizeRoles('professor', 'admin'), gameCtrl.createGame);
router.put('/:id', authenticateToken, authorizeRoles('professor', 'admin'), gameCtrl.updateGame);
router.delete('/:id', authenticateToken, authorizeRoles('professor', 'admin'), gameCtrl.deleteGame);
router.post('/:id/play', authenticateToken, requireRegloForStudents, gameCtrl.playGame);

module.exports = router;

const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');

router.get('/serve', fileController.serveFile);

module.exports = router;

const express = require('express');
const { handleLiveKitWebhook } = require('../controllers/livekitWebhookController');

const router = express.Router();

router.post('/', handleLiveKitWebhook);

module.exports = router;

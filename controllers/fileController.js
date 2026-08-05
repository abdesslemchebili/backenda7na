const fs = require('fs');
const path = require('path');
const { verifyFileAccessToken, getAbsoluteFilePath } = require('../utils/fileAccess');

// GET /api/files/serve?token=...
const serveFile = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'BadRequest', message: 'token is required' });
    }

    const decoded = verifyFileAccessToken(token);
    const absPath = getAbsoluteFilePath(decoded.path);

    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'NotFound', message: 'File not found' });
    }

    const filename = path.basename(absPath);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(absPath);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Download link has expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Forbidden', message: 'Invalid download link' });
    }
    console.error('serveFile:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to serve file' });
  }
};

module.exports = { serveFile };

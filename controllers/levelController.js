const Level = require('../models/Level');
const Language = require('../models/Language');
const { CEFR_LEVELS } = require('../constants/cefrLevels');
const { formatLevel } = require('./languageController');

// GET /api/levels
const listLevels = async (req, res) => {
  try {
    const filters = {};
    if (req.user?.role !== 'admin') {
      filters.active = true;
    } else if (req.query.active === 'true') {
      filters.active = true;
    } else if (req.query.active === 'false') {
      filters.active = false;
    }

    if (req.query.languageId) {
      filters.language = req.query.languageId;
    } else if (req.query.languageCode) {
      const lang = await Language.findOne({ code: String(req.query.languageCode).toLowerCase() });
      if (!lang) {
        return res.json({ data: [] });
      }
      filters.language = lang._id;
    }

    const levels = await Level.find(filters)
      .populate('language', 'name code icon active')
      .sort({ order: 1, code: 1 })
      .lean();

    res.json({ data: levels.map(formatLevel) });
  } catch (err) {
    console.error('listLevels:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/levels/:id
const getLevel = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id)
      .populate('language', 'name code icon active')
      .lean();
    if (!level) {
      return res.status(404).json({ error: 'NotFound', message: 'Level not found' });
    }
    if (!level.active && req.user?.role !== 'admin') {
      return res.status(404).json({ error: 'NotFound', message: 'Level not found' });
    }
    res.json(formatLevel(level));
  } catch (err) {
    console.error('getLevel:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/levels
const createLevel = async (req, res) => {
  try {
    const { languageId, code, name, description, order = 0, active = true } = req.body;
    if (!languageId || !code) {
      return res.status(400).json({ error: 'ValidationError', message: 'languageId and code are required' });
    }
    if (!CEFR_LEVELS.includes(code)) {
      return res.status(400).json({ error: 'ValidationError', message: `code must be one of: ${CEFR_LEVELS.join(', ')}` });
    }

    const language = await Language.findById(languageId);
    if (!language) {
      return res.status(404).json({ error: 'NotFound', message: 'Language not found' });
    }

    const existing = await Level.findOne({ language: languageId, code });
    if (existing) {
      return res.status(400).json({ error: 'ValidationError', message: 'Level already exists for this language' });
    }

    const level = await Level.create({
      language: languageId,
      code,
      name: name || undefined,
      description: description || undefined,
      order: Number(order) || 0,
      active: active !== false,
    });

    const populated = await Level.findById(level._id).populate('language', 'name code icon active').lean();
    res.status(201).json(formatLevel(populated));
  } catch (err) {
    console.error('createLevel:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/levels/:id
const updateLevel = async (req, res) => {
  try {
    const level = await Level.findById(req.params.id);
    if (!level) {
      return res.status(404).json({ error: 'NotFound', message: 'Level not found' });
    }

    const { name, description, order, active } = req.body;
    if (name !== undefined) level.name = name;
    if (description !== undefined) level.description = description;
    if (order !== undefined) level.order = Number(order) || 0;
    if (active !== undefined) level.active = Boolean(active);

    await level.save();
    const populated = await Level.findById(level._id).populate('language', 'name code icon active').lean();
    res.json(formatLevel(populated));
  } catch (err) {
    console.error('updateLevel:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = { listLevels, getLevel, createLevel, updateLevel };

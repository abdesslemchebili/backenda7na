const Language = require('../models/Language');
const Level = require('../models/Level');
const { seedLanguageCatalog } = require('../utils/seedCatalog');

function formatLanguage(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    _id: o._id,
    name: o.name,
    code: o.code,
    nativeName: o.nativeName,
    icon: o.icon,
    active: o.active,
    order: o.order,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function formatLevel(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const lang = o.language;
  return {
    _id: o._id,
    language: lang && lang._id ? lang._id.toString() : lang?.toString?.() || lang,
    languageDoc: lang && lang._id
      ? { _id: lang._id, name: lang.name, code: lang.code, icon: lang.icon }
      : undefined,
    code: o.code,
    name: o.name,
    description: o.description,
    order: o.order,
    active: o.active,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

// GET /api/languages
const listLanguages = async (req, res) => {
  try {
    const filters = {};
    if (req.user?.role !== 'admin') {
      filters.active = true;
    } else if (req.query.active === 'true') {
      filters.active = true;
    } else if (req.query.active === 'false') {
      filters.active = false;
    }

    const languages = await Language.find(filters).sort({ order: 1, name: 1 }).lean();
    res.json({ data: languages.map(formatLanguage) });
  } catch (err) {
    console.error('listLanguages:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// GET /api/languages/:id
const getLanguage = async (req, res) => {
  try {
    const language = await Language.findById(req.params.id).lean();
    if (!language) {
      return res.status(404).json({ error: 'NotFound', message: 'Language not found' });
    }
    if (!language.active && req.user?.role !== 'admin') {
      return res.status(404).json({ error: 'NotFound', message: 'Language not found' });
    }
    res.json(formatLanguage(language));
  } catch (err) {
    console.error('getLanguage:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/languages
const createLanguage = async (req, res) => {
  try {
    const { name, code, nativeName, icon, active = true, order = 0 } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'ValidationError', message: 'name and code are required' });
    }

    const existing = await Language.findOne({ code: String(code).trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'ValidationError', message: 'Language code already exists' });
    }

    const language = await Language.create({
      name: String(name).trim(),
      code: String(code).trim().toLowerCase(),
      nativeName: nativeName ? String(nativeName).trim() : undefined,
      icon: icon ? String(icon).trim() : undefined,
      active: active !== false,
      order: Number(order) || 0,
    });

    res.status(201).json(formatLanguage(language));
  } catch (err) {
    console.error('createLanguage:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// PUT /api/languages/:id
const updateLanguage = async (req, res) => {
  try {
    const language = await Language.findById(req.params.id);
    if (!language) {
      return res.status(404).json({ error: 'NotFound', message: 'Language not found' });
    }

    const { name, code, nativeName, icon, active, order } = req.body;
    if (name !== undefined) language.name = String(name).trim();
    if (code !== undefined) {
      const normalized = String(code).trim().toLowerCase();
      const dup = await Language.findOne({ code: normalized, _id: { $ne: language._id } });
      if (dup) {
        return res.status(400).json({ error: 'ValidationError', message: 'Language code already exists' });
      }
      language.code = normalized;
    }
    if (nativeName !== undefined) language.nativeName = nativeName ? String(nativeName).trim() : '';
    if (icon !== undefined) language.icon = icon ? String(icon).trim() : '';
    if (active !== undefined) language.active = Boolean(active);
    if (order !== undefined) language.order = Number(order) || 0;

    await language.save();
    res.json(formatLanguage(language));
  } catch (err) {
    console.error('updateLanguage:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// POST /api/languages/seed
const seedLanguages = async (req, res) => {
  try {
    const result = await seedLanguageCatalog();
    res.json({
      message: 'Catalog seeded successfully',
      languages: result.languages.length,
      levels: result.levels.length,
    });
  } catch (err) {
    console.error('seedLanguages:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  listLanguages,
  getLanguage,
  createLanguage,
  updateLanguage,
  seedLanguages,
  formatLanguage,
  formatLevel,
};

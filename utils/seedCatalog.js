const Language = require('../models/Language');
const Level = require('../models/Level');
const { CEFR_LEVELS, CEFR_LEVEL_LABELS, CEFR_LEVEL_ORDER } = require('../constants/cefrLevels');

const DEFAULT_LANGUAGES = [
  { name: 'German', code: 'de', nativeName: 'Deutsch', icon: '🇩🇪', order: 1 },
  { name: 'English', code: 'en', nativeName: 'English', icon: '🇬🇧', order: 2 },
  { name: 'French', code: 'fr', nativeName: 'Français', icon: '🇫🇷', order: 3 },
  { name: 'Spanish', code: 'es', nativeName: 'Español', icon: '🇪🇸', order: 4 },
];

/**
 * Seed default languages and CEFR levels (A1–C2) per language.
 * Idempotent: upserts by code / language+code.
 */
async function seedLanguageCatalog() {
  const results = { languages: [], levels: [] };

  for (const langData of DEFAULT_LANGUAGES) {
    let language = await Language.findOne({ code: langData.code });
    if (language) {
      Object.assign(language, langData);
      await language.save();
    } else {
      language = await Language.create(langData);
    }
    results.languages.push(language);

    for (const code of CEFR_LEVELS) {
      const labels = CEFR_LEVEL_LABELS[code] || { en: code, fr: code, ar: code };
      const levelPayload = {
        language: language._id,
        code,
        name: labels,
        description: {
          en: `${langData.name} ${code}`,
          fr: `${langData.nativeName || langData.name} ${code}`,
          ar: `${langData.name} ${code}`,
        },
        order: CEFR_LEVEL_ORDER[code] || 0,
        active: true,
      };

      let level = await Level.findOne({ language: language._id, code });
      if (level) {
        Object.assign(level, levelPayload);
        await level.save();
      } else {
        level = await Level.create(levelPayload);
      }
      results.levels.push(level);
    }
  }

  return results;
}

module.exports = { seedLanguageCatalog, DEFAULT_LANGUAGES };

const Joi = require('joi');
const PracticePack = require('../models/PracticePack');
const { PRACTICE_KINDS } = require('../models/PracticePack');
const { GERMAN_SUB_LEVELS } = require('../constants/germanLevels');

const PROMPT_VERSION = 'v1';
const CACHE_DAYS = Number(process.env.PRACTICE_PACK_CACHE_DAYS || 14);

const COURSE_LANG_TO_ISO = {
  german: 'de',
  english: 'en',
  french: 'fr',
  spanish: 'es',
  arabic: 'ar',
  italian: 'it',
};

const LANG_LABELS = {
  de: 'German',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  ar: 'Arabic',
  it: 'Italian',
};

function courseLanguageToCode(language) {
  if (!language) return 'de';
  const key = String(language).toLowerCase();
  if (COURSE_LANG_TO_ISO[key]) return COURSE_LANG_TO_ISO[key];
  if (LANG_LABELS[key]) return key;
  return 'de';
}

function cefrToDefaultSubLevel(cefr) {
  if (!cefr) return 'A1.1';
  const main = String(cefr).toUpperCase().split('.')[0];
  const candidate = `${main}.1`;
  return GERMAN_SUB_LEVELS.includes(candidate) ? candidate : 'A1.1';
}

function packKeyForNow(kind) {
  const week = getIsoWeekKey(new Date());
  return `${kind}-${PROMPT_VERSION}-${week}`;
}

function getIsoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const quizSchema = Joi.object({
  title: Joi.object({
    fr: Joi.string().allow(''),
    en: Joi.string().allow(''),
    ar: Joi.string().allow(''),
  }).required(),
  questions: Joi.array()
    .items(
      Joi.object({
        question: Joi.object({
          fr: Joi.string().required(),
          en: Joi.string().allow(''),
          ar: Joi.string().allow(''),
        }).required(),
        options: Joi.array().items(Joi.string()).min(3).max(5).required(),
        correctAnswer: Joi.string().required(),
        points: Joi.number().integer().min(1).default(1),
      }).custom((q, helpers) => {
        if (!q.options.includes(q.correctAnswer)) {
          return helpers.error('any.invalid');
        }
        return q;
      })
    )
    .min(5)
    .max(12)
    .required(),
});

const itemsSchema = Joi.object({
  title: Joi.object({
    fr: Joi.string().allow(''),
    en: Joi.string().allow(''),
    ar: Joi.string().allow(''),
  }).required(),
  items: Joi.array()
    .items(
      Joi.object({
        term: Joi.string().required(),
        translation: Joi.string().required(),
        hint: Joi.string().allow('').default(''),
      })
    )
    .min(6)
    .max(12)
    .required(),
});

function fallbackPack({ languageCode, subLevel, kind }) {
  const title = {
    fr: `Practice ${subLevel} (${kind})`,
    en: `Practice ${subLevel} (${kind})`,
    ar: '',
  };

  if (kind === 'quiz') {
    return {
      title,
      questions: [
        {
          type: 'multiple_choice',
          question: { fr: 'Comment dit-on « bonjour » en allemand ?', en: 'How do you say hello in German?', ar: '' },
          options: ['Hallo', 'Tschüss', 'Danke', 'Bitte'],
          correctAnswer: 'Hallo',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: '« Ich heiße… » signifie :', en: '“Ich heiße…” means:', ar: '' },
          options: ['Je m’appelle…', 'J’habite…', 'J’ai…', 'Je vais…'],
          correctAnswer: 'Je m’appelle…',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: 'Quel article va avec « Haus » (neutre) ?', en: 'Which article goes with “Haus” (neuter)?', ar: '' },
          options: ['das', 'der', 'die', 'den'],
          correctAnswer: 'das',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: 'Traduisez : « Danke schön »', en: 'Translate: “Danke schön”', ar: '' },
          options: ['Merci beaucoup', 'Au revoir', 'S’il vous plaît', 'Excusez-moi'],
          correctAnswer: 'Merci beaucoup',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: '« Ja » / « Nein » signifient :', en: '“Ja” / “Nein” mean:', ar: '' },
          options: ['Oui / Non', 'Ici / Là', 'Un / Deux', 'Bonjour / Bonsoir'],
          correctAnswer: 'Oui / Non',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: 'Complétez : Ich ___ Student.', en: 'Complete: Ich ___ Student.', ar: '' },
          options: ['bin', 'bist', 'ist', 'seid'],
          correctAnswer: 'bin',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: '« Wie geht’s? » veut dire :', en: '“Wie geht’s?” means:', ar: '' },
          options: ['Comment ça va ?', 'Où habites-tu ?', 'Quel âge as-tu ?', 'Comment t’appelles-tu ?'],
          correctAnswer: 'Comment ça va ?',
          points: 1,
        },
        {
          type: 'multiple_choice',
          question: { fr: 'Nombre : « zwei » =', en: 'Number: “zwei” =', ar: '' },
          options: ['2', '3', '4', '5'],
          correctAnswer: '2',
          points: 1,
        },
      ],
      items: [],
      source: 'fallback',
    };
  }

  const items = [
    { term: 'Hallo', translation: 'Bonjour', hint: '' },
    { term: 'Danke', translation: 'Merci', hint: '' },
    { term: 'Bitte', translation: 'S’il vous plaît', hint: '' },
    { term: 'Ja', translation: 'Oui', hint: '' },
    { term: 'Nein', translation: 'Non', hint: '' },
    { term: 'Wasser', translation: 'Eau', hint: '' },
    { term: 'Brot', translation: 'Pain', hint: '' },
    { term: 'Schule', translation: 'École', hint: '' },
  ];

  return { title, questions: [], items, source: 'fallback' };
}

function buildPrompt({ languageCode, subLevel, kind }) {
  const lang = LANG_LABELS[languageCode] || languageCode;
  if (kind === 'quiz') {
    return `You are a CEFR language teacher. Generate a short multiple-choice quiz for ${lang} learners at level ${subLevel}.
Rules:
- Exactly 8 questions, CEFR ${subLevel} only (no higher grammar).
- Each question: French prompt in question.fr (also fill question.en briefly), 4 options, correctAnswer must be one of the options.
- Mix vocabulary and basic grammar for ${subLevel}.
- Return ONLY valid JSON:
{"title":{"fr":"...","en":"...","ar":""},"questions":[{"question":{"fr":"...","en":"...","ar":""},"options":["a","b","c","d"],"correctAnswer":"a","points":1}]}`;
  }
  return `You are a CEFR language teacher. Generate ${kind === 'flashcard' ? 'flashcards' : 'word-matching pairs'} for ${lang} at level ${subLevel}.
Rules:
- Exactly 8 items: term in ${lang}, translation in French.
- CEFR ${subLevel} vocabulary only.
- Return ONLY valid JSON:
{"title":{"fr":"...","en":"...","ar":""},"items":[{"term":"...","translation":"...","hint":""}]}`;
}

function resolveLlmConfig() {
  if (!process.env.GROQ_API_KEY) return null;
  return {
    provider: 'groq',
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  };
}

async function callLlm(prompt) {
  const cfg = resolveLlmConfig();
  if (!cfg) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You generate CEFR language practice content as strict JSON.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${cfg.provider} error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty ${cfg.provider} response`);
  return JSON.parse(content);
}

function validateGenerated(kind, payload) {
  const schema = kind === 'quiz' ? quizSchema : itemsSchema;
  const { error, value } = schema.validate(payload, { abortEarly: true, stripUnknown: true });
  if (error) throw new Error(`Invalid AI payload: ${error.message}`);
  return value;
}

async function findCachedPack({ languageCode, subLevel, kind }) {
  const since = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);
  return PracticePack.findOne({
    languageCode,
    subLevel,
    kind,
    active: true,
    generatedAt: { $gte: since },
  })
    .sort({ generatedAt: -1 })
    .lean();
}

async function generateAndStorePack({ languageCode, subLevel, kind, forceNew = false }) {
  const key = forceNew ? `${kind}-${PROMPT_VERSION}-${Date.now()}` : packKeyForNow(kind);
  if (!forceNew) {
    const existing = await PracticePack.findOne({ languageCode, subLevel, kind, packKey: key });
    if (existing) return existing.toObject ? existing.toObject() : existing;
  }

  let payload;
  let source = 'ai';
  try {
    const raw = await callLlm(buildPrompt({ languageCode, subLevel, kind }));
    payload = validateGenerated(kind, raw);
  } catch (err) {
    console.warn('aiPractice generate fallback:', err.message || err);
    payload = fallbackPack({ languageCode, subLevel, kind });
    source = 'fallback';
  }

  const doc = await PracticePack.findOneAndUpdate(
    { languageCode, subLevel, kind, packKey: key },
    {
      languageCode,
      subLevel,
      kind,
      packKey: key,
      title: payload.title,
      questions: kind === 'quiz' ? payload.questions : [],
      items: kind === 'quiz' ? [] : payload.items,
      source,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date(),
      active: true,
      xpReward: kind === 'quiz' ? 15 : 10,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc.toObject();
}

async function ensurePacksForLevel({ languageCode, subLevel, kinds = PRACTICE_KINDS }) {
  const packs = [];
  for (const kind of kinds) {
    let pack = await findCachedPack({ languageCode, subLevel, kind });
    if (!pack) {
      pack = await generateAndStorePack({ languageCode, subLevel, kind });
    }
    packs.push(pack);
  }
  return packs;
}

function formatPackForClient(pack, { includeAnswers = false } = {}) {
  if (!pack) return null;
  const base = {
    _id: pack._id,
    languageCode: pack.languageCode,
    subLevel: pack.subLevel,
    kind: pack.kind,
    title: pack.title,
    displayTitle: pack.title?.fr || pack.title?.en || pack.kind,
    source: pack.source,
    generatedAt: pack.generatedAt,
    xpReward: pack.xpReward,
  };

  if (pack.kind === 'quiz') {
    base.questions = (pack.questions || []).map((q) => ({
      _id: q._id,
      type: q.type || 'multiple_choice',
      question: q.question,
      options: q.options,
      points: q.points,
      ...(includeAnswers ? { correctAnswer: q.correctAnswer } : {}),
    }));
  } else {
    base.items = (pack.items || []).map((it) => ({
      _id: it._id,
      term: it.term,
      translation: includeAnswers || pack.kind === 'flashcard' ? it.translation : it.translation,
      hint: it.hint || '',
    }));
  }
  return base;
}

function scoreQuizSubmission(pack, answers = []) {
  const questions = pack.questions || [];
  let correct = 0;
  let max = 0;
  const details = [];
  for (const q of questions) {
    const pts = q.points || 1;
    max += pts;
    const given = answers.find((a) => String(a.questionId) === String(q._id));
    const ok = given && String(given.answer).trim() === String(q.correctAnswer).trim();
    if (ok) correct += pts;
    details.push({ questionId: q._id, correct: !!ok, correctAnswer: q.correctAnswer });
  }
  const percentage = max > 0 ? Math.round((correct / max) * 100) : 0;
  return { score: percentage, correct, max, details };
}

function scoreGameSubmission(pack, { score } = {}) {
  const n = Number(score);
  const percentage = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  return { score: percentage };
}

module.exports = {
  COURSE_LANG_TO_ISO,
  PRACTICE_KINDS,
  PROMPT_VERSION,
  courseLanguageToCode,
  cefrToDefaultSubLevel,
  ensurePacksForLevel,
  generateAndStorePack,
  findCachedPack,
  formatPackForClient,
  scoreQuizSubmission,
  scoreGameSubmission,
  fallbackPack,
};

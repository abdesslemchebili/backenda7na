const mongoose = require('mongoose');
const ClassGroup = require('../models/ClassGroup');
const Language = require('../models/Language');
const User = require('../models/User');
const PracticePack = require('../models/PracticePack');
const GroupChallenge = require('../models/GroupChallenge');
const PracticeScore = require('../models/PracticeScore');
const { awardGamification } = require('../utils/gamificationHelper');
const {
  courseLanguageToCode,
  cefrToDefaultSubLevel,
  ensurePacksForLevel,
  formatPackForClient,
  scoreQuizSubmission,
  scoreGameSubmission,
  generateAndStorePack,
} = require('../utils/aiPractice');
const { GERMAN_SUB_LEVELS } = require('../constants/germanLevels');

function isGroupMember(group, userId) {
  return (group.studentIds || []).some(
    (id) => id?.toString() === userId.toString()
  );
}

async function loadGroupAccess(req, classGroupId) {
  const group = await ClassGroup.findById(classGroupId)
    .select('name languageId levelId level subLevel professorId studentIds bookId')
    .lean();
  if (!group) {
    return {
      error: {
        status: 404,
        body: { error: 'NotFound', message: 'Class group not found' },
      },
    };
  }

  const uid = req.user._id.toString();
  const role = req.user.role;
  if (role === 'admin') return { group };
  if (role === 'professor' && group.professorId?.toString() === uid) return { group };
  if (role === 'student' && isGroupMember(group, uid)) return { group };

  return {
    error: {
      status: 403,
      body: { error: 'Forbidden', message: 'Not allowed for this class group' },
    },
  };
}

async function resolveLevelContext(group) {
  let languageCode = 'de';
  if (group.languageId) {
    const lang = await Language.findById(group.languageId).select('code').lean();
    if (lang?.code) {
      languageCode = courseLanguageToCode(lang.code);
    }
  }

  let subLevel = null;
  if (group.subLevel && GERMAN_SUB_LEVELS.includes(group.subLevel)) {
    subLevel = group.subLevel;
  } else if (group.level) {
    subLevel = cefrToDefaultSubLevel(group.level);
  } else {
    subLevel = 'A1.1';
  }

  return {
    languageCode,
    subLevel,
    classGroupId: group._id,
  };
}

function challengeEndsAt(from = new Date()) {
  const end = new Date(from);
  end.setDate(end.getDate() + 7);
  return end;
}

async function ensureOpenChallenge({ classGroupId, packId, createdBy = null }) {
  const now = new Date();
  let challenge = await GroupChallenge.findOne({
    classGroupId,
    status: 'open',
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
  }).sort({ startsAt: -1 });

  if (challenge) return challenge;

  challenge = await GroupChallenge.create({
    classGroupId,
    packId,
    title: 'Défi de cohorte',
    status: 'open',
    startsAt: now,
    endsAt: challengeEndsAt(now),
    participants: [],
    createdBy,
  });
  return challenge;
}

function formatChallenge(doc, pack = null) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const participants = [...(o.participants || [])].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
  return {
    _id: o._id,
    classGroupId: o.classGroupId,
    packId: o.packId,
    pack: pack ? formatPackForClient(pack, { includeAnswers: false }) : undefined,
    title: o.title,
    status: o.status,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    participants: participants.map((p) => ({
      studentId: p.studentId,
      score: p.score,
      completedAt: p.completedAt,
    })),
    createdAt: o.createdAt,
  };
}

// GET /api/practice/group/:classGroupId
const getGroupPractice = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await loadGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const level = await resolveLevelContext(access.group);
    const packs = await PracticePack.find({
      languageCode: level.languageCode,
      subLevel: level.subLevel,
      active: true,
    })
      .sort({ kind: 1, generatedAt: -1 })
      .lean();

    const byKind = {};
    for (const p of packs) {
      if (!byKind[p.kind]) byKind[p.kind] = p;
    }

    res.json({
      data: {
        languageCode: level.languageCode,
        subLevel: level.subLevel,
        classGroupId: level.classGroupId,
        packs: Object.values(byKind).map((p) => formatPackForClient(p)),
      },
    });
  } catch (err) {
    console.error('getGroupPractice:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/** @deprecated alias */
const getCoursePractice = getGroupPractice;

// POST /api/practice/group/:classGroupId/ensure
const ensureGroupPractice = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await loadGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const level = await resolveLevelContext(access.group);
    const packs = await ensurePacksForLevel({
      languageCode: level.languageCode,
      subLevel: level.subLevel,
    });

    const quizPack = packs.find((p) => p.kind === 'quiz');
    let challenge = null;
    if (quizPack) {
      challenge = await ensureOpenChallenge({
        classGroupId: access.group._id,
        packId: quizPack._id,
        createdBy: req.user._id,
      });
    }

    res.json({
      data: {
        languageCode: level.languageCode,
        subLevel: level.subLevel,
        classGroupId: level.classGroupId,
        packs: packs.map((p) => formatPackForClient(p)),
        challenge: challenge ? formatChallenge(challenge, quizPack) : null,
      },
    });
  } catch (err) {
    console.error('ensureGroupPractice:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/** @deprecated alias */
const ensureCoursePractice = ensureGroupPractice;

const getPack = async (req, res) => {
  try {
    const pack = await PracticePack.findById(req.params.id).lean();
    if (!pack || !pack.active) {
      return res.status(404).json({ error: 'NotFound', message: 'Pack not found' });
    }
    res.json({ data: formatPackForClient(pack, { includeAnswers: false }) });
  } catch (err) {
    console.error('getPack:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const submitPack = async (req, res) => {
  try {
    const { classGroupId, courseId, answers, score: clientScore } = req.body || {};
    const groupId = classGroupId || courseId;
    if (!groupId) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'classGroupId is required',
      });
    }

    const access = await loadGroupAccess(req, groupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);
    if (req.user.role !== 'student' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }

    const pack = await PracticePack.findById(req.params.id);
    if (!pack || !pack.active) {
      return res.status(404).json({ error: 'NotFound', message: 'Pack not found' });
    }

    let result;
    if (pack.kind === 'quiz') {
      result = scoreQuizSubmission(pack, answers || []);
    } else {
      result = scoreGameSubmission(pack, { score: clientScore });
    }

    const baseXp = pack.xpReward || 10;
    const xpEarned = Math.max(1, Math.round((baseXp * result.score) / 100));

    await PracticeScore.create({
      classGroupId: groupId,
      studentId: req.user._id,
      packId: pack._id,
      kind: pack.kind,
      score: result.score,
      xpEarned,
    });

    const gamification = await awardGamification(req.user._id, {
      xp: xpEarned,
      incrementExercises: pack.kind === 'quiz' ? 1 : 0,
      incrementGames: pack.kind !== 'quiz' ? 1 : 0,
    });

    res.json({
      data: {
        score: result.score,
        xpEarned,
        details: result.details,
        gamification,
      },
    });
  } catch (err) {
    console.error('submitPack:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await loadGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const groupObjectId = new mongoose.Types.ObjectId(String(access.group._id));
    const rows = await PracticeScore.aggregate([
      { $match: { classGroupId: groupObjectId } },
      {
        $group: {
          _id: '$studentId',
          bestScore: { $max: '$score' },
          totalXp: { $sum: '$xpEarned' },
          plays: { $sum: 1 },
          lastPlayedAt: { $max: '$createdAt' },
        },
      },
      { $sort: { totalXp: -1, bestScore: -1 } },
      { $limit: 50 },
    ]);

    const ids = rows.map((r) => r._id);
    const users = await User.find({ _id: { $in: ids } })
      .select('firstName lastName email')
      .lean();
    const byId = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    res.json({
      data: rows.map((r, idx) => {
        const u = byId[r._id.toString()];
        return {
          rank: idx + 1,
          studentId: r._id,
          name: u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'Étudiant',
          bestScore: r.bestScore,
          totalXp: r.totalXp,
          plays: r.plays,
          lastPlayedAt: r.lastPlayedAt,
        };
      }),
    });
  } catch (err) {
    console.error('getLeaderboard:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const listChallenges = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await loadGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const level = await resolveLevelContext(access.group);
    const packs = await ensurePacksForLevel({
      languageCode: level.languageCode,
      subLevel: level.subLevel,
    });
    const quizPack = packs.find((p) => p.kind === 'quiz');
    if (quizPack) {
      await ensureOpenChallenge({
        classGroupId: access.group._id,
        packId: quizPack._id,
      });
    }

    const challenges = await GroupChallenge.find({ classGroupId: access.group._id })
      .sort({ startsAt: -1 })
      .limit(20)
      .lean();

    const packIds = [...new Set(challenges.map((c) => String(c.packId)))];
    const packDocs = await PracticePack.find({ _id: { $in: packIds } }).lean();
    const packMap = Object.fromEntries(packDocs.map((p) => [String(p._id), p]));

    const studentIds = [
      ...new Set(
        challenges.flatMap((c) => (c.participants || []).map((p) => String(p.studentId)))
      ),
    ];
    const students = await User.find({ _id: { $in: studentIds } })
      .select('firstName lastName')
      .lean();
    const studentMap = Object.fromEntries(
      students.map((s) => [
        String(s._id),
        `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      ])
    );

    res.json({
      data: challenges.map((c) => {
        const formatted = formatChallenge(c, packMap[String(c.packId)]);
        formatted.participants = formatted.participants.map((p) => ({
          ...p,
          name: studentMap[String(p.studentId)] || 'Étudiant',
        }));
        return formatted;
      }),
    });
  } catch (err) {
    console.error('listChallenges:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const createChallenge = async (req, res) => {
  try {
    const classGroupId = req.params.classGroupId || req.params.courseId;
    const access = await loadGroupAccess(req, classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);
    if (!['professor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Professor or admin only' });
    }

    const level = await resolveLevelContext(access.group);
    const kind = req.body?.kind || 'quiz';
    const pack = await generateAndStorePack({
      languageCode: level.languageCode,
      subLevel: level.subLevel,
      kind,
      forceNew: true,
    });

    await GroupChallenge.updateMany(
      { classGroupId: access.group._id, status: 'open' },
      { $set: { status: 'closed', endsAt: new Date() } }
    );

    const challenge = await GroupChallenge.create({
      classGroupId: access.group._id,
      packId: pack._id,
      title: req.body?.title || 'Défi de cohorte',
      status: 'open',
      startsAt: new Date(),
      endsAt: challengeEndsAt(),
      participants: [],
      createdBy: req.user._id,
    });

    res.status(201).json({ data: formatChallenge(challenge, pack) });
  } catch (err) {
    console.error('createChallenge:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const joinChallenge = async (req, res) => {
  try {
    const challenge = await GroupChallenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'NotFound', message: 'Challenge not found' });
    if (challenge.status !== 'open') {
      return res.status(400).json({ error: 'ValidationError', message: 'Challenge is closed' });
    }

    const access = await loadGroupAccess(req, challenge.classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }

    const already = challenge.participants.some(
      (p) => p.studentId.toString() === req.user._id.toString()
    );
    if (!already) {
      challenge.participants.push({
        studentId: req.user._id,
        score: 0,
        completedAt: null,
      });
      await challenge.save();
    }

    const pack = await PracticePack.findById(challenge.packId).lean();
    res.json({ data: formatChallenge(challenge, pack) });
  } catch (err) {
    console.error('joinChallenge:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

const submitChallenge = async (req, res) => {
  try {
    const challenge = await GroupChallenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'NotFound', message: 'Challenge not found' });
    if (challenge.status !== 'open') {
      return res.status(400).json({ error: 'ValidationError', message: 'Challenge is closed' });
    }
    if (challenge.endsAt && challenge.endsAt < new Date()) {
      challenge.status = 'closed';
      await challenge.save();
      return res.status(400).json({ error: 'ValidationError', message: 'Challenge expired' });
    }

    const access = await loadGroupAccess(req, challenge.classGroupId);
    if (access.error) return res.status(access.error.status).json(access.error.body);
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Forbidden', message: 'Students only' });
    }

    const pack = await PracticePack.findById(challenge.packId);
    if (!pack) return res.status(404).json({ error: 'NotFound', message: 'Pack not found' });

    let result;
    if (pack.kind === 'quiz') {
      result = scoreQuizSubmission(pack, req.body?.answers || []);
    } else {
      result = scoreGameSubmission(pack, { score: req.body?.score });
    }

    const baseXp = pack.xpReward || 15;
    const xpEarned = Math.max(1, Math.round((baseXp * result.score) / 100));

    const idx = challenge.participants.findIndex(
      (p) => p.studentId.toString() === req.user._id.toString()
    );
    if (idx >= 0) {
      if ((challenge.participants[idx].score || 0) < result.score) {
        challenge.participants[idx].score = result.score;
        challenge.participants[idx].completedAt = new Date();
      }
    } else {
      challenge.participants.push({
        studentId: req.user._id,
        score: result.score,
        completedAt: new Date(),
      });
    }
    await challenge.save();

    await PracticeScore.create({
      classGroupId: challenge.classGroupId,
      studentId: req.user._id,
      packId: pack._id,
      kind: pack.kind,
      score: result.score,
      xpEarned,
      challengeId: challenge._id,
    });

    const gamification = await awardGamification(req.user._id, {
      xp: xpEarned,
      incrementExercises: pack.kind === 'quiz' ? 1 : 0,
      incrementGames: pack.kind !== 'quiz' ? 1 : 0,
    });

    res.json({
      data: {
        score: result.score,
        xpEarned,
        details: result.details,
        challenge: formatChallenge(challenge, pack),
        gamification,
      },
    });
  } catch (err) {
    console.error('submitChallenge:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

module.exports = {
  getGroupPractice,
  getCoursePractice,
  ensureGroupPractice,
  ensureCoursePractice,
  getPack,
  submitPack,
  getLeaderboard,
  listChallenges,
  createChallenge,
  joinChallenge,
  submitChallenge,
};

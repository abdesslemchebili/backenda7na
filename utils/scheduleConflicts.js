const Class = require('../models/Class');

function parseWindow(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : start + 60 * 60 * 1000;
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return { start, end };
}

function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function findProfessorScheduleConflicts(professorId, startTime, endTime, excludeClassId = null) {
  const window = parseWindow(startTime, endTime);
  if (!window) return [];

  const filter = {
    professor: professorId,
    status: { $nin: ['cancelled', 'completed'] },
    'schedule.startTime': { $exists: true }
  };
  if (excludeClassId) {
    filter._id = { $ne: excludeClassId };
  }

  const sessions = await Class.find(filter)
    .select('title schedule status course classGroupId')
    .populate('course', 'title')
    .lean();

  return sessions.filter((session) => {
    const sStart = new Date(session.schedule.startTime).getTime();
    const sEnd = session.schedule.endTime
      ? new Date(session.schedule.endTime).getTime()
      : sStart + 60 * 60 * 1000;
    return windowsOverlap(window.start, window.end, sStart, sEnd);
  });
}

module.exports = { findProfessorScheduleConflicts, parseWindow, windowsOverlap };

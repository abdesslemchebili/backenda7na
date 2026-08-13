require('dotenv').config();
const mongoose = require('mongoose');
require('../models/registerSchemas');
const Class = require('../models/Class');
const Recording = require('../models/Recording');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const ready = await Recording.find({ status: 'ready' }).select('session').lean();
  const ids = ready.map((r) => r.session).filter(Boolean);
  const result = await Class.updateMany(
    { _id: { $in: ids }, status: { $in: ['ongoing', 'scheduled'] } },
    { $set: { status: 'completed', 'liveConfig.sessionEndedAt': new Date() } }
  );
  console.log({ recordings: ids.length, matched: result.matchedCount, modified: result.modifiedCount });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

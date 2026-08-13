require('dotenv').config();
const mongoose = require('mongoose');
require('../models/registerSchemas');
const Recording = require('../models/Recording');
const Class = require('../models/Class');
const { normalizeStorageKey, objectExists } = require('../utils/objectStorage');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await Recording.find({
    storageUrl: { $regex: /./ },
  }).select('storageUrl session status');

  let healed = 0;
  for (const r of rows) {
    const key = normalizeStorageKey(r.storageUrl);
    if (!key || key === r.storageUrl) {
      const exists = key ? await objectExists(key) : false;
      console.log({ id: String(r._id), key: r.storageUrl, exists, changed: false });
      continue;
    }
    const exists = await objectExists(key);
    console.log({
      id: String(r._id),
      from: r.storageUrl,
      to: key,
      exists,
      changed: true,
    });
    r.storageUrl = key;
    await r.save();
    await Class.updateOne({ _id: r.session }, { $set: { 'liveConfig.recordingUrl': key } });
    healed += 1;
  }
  console.log('healed', healed);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

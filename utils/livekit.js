const { AccessToken, TrackSource } = require('livekit-server-sdk');

const TOKEN_TTL = '2h';

function getLiveKitConfig() {
  return {
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    url: process.env.LIVEKIT_URL || '',
  };
}

function isLiveKitConfigured() {
  const { apiKey, apiSecret, url } = getLiveKitConfig();
  return Boolean(apiKey && apiSecret && url);
}

/**
 * Génère un JWT LiveKit pour rejoindre une salle de classe.
 * @param {{ roomName: string, identity: string, displayName: string, isHost: boolean }} params
 */
async function createLiveKitToken({ roomName, identity, displayName, isHost }) {
  const { apiKey, apiSecret } = getLiveKitConfig();
  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit credentials are not configured');
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(identity),
    name: displayName || 'Participant',
    ttl: TOKEN_TTL,
  });

  const grant = {
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
  };

  if (isHost) {
    grant.canPublish = true;
    grant.roomAdmin = true;
    grant.roomCreate = true;
  } else {
    grant.canPublish = true;
    grant.canPublishSources = [TrackSource.CAMERA, TrackSource.MICROPHONE];
  }

  token.addGrant(grant);
  return token.toJwt();
}

module.exports = {
  TOKEN_TTL,
  getLiveKitConfig,
  isLiveKitConfigured,
  createLiveKitToken,
};

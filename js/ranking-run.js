import { createSubmissionId, isValidRankingSubmissionId, isValidRankingClientVersion, RANKING_CLIENT_VERSION, RANKING_GAME_SLUGS, RANKING_NAME_CONTRACT_VERSION } from './ranking-client.js';
import { validatePlayerName } from './player-profile.js';

export function normalizeRankingRun(value, { displayName, modeId }) {
  if (value === null || value === undefined) return null;
  const name = validatePlayerName(displayName);
  if (!name.ok || name.name !== displayName || value.displayName !== displayName
    || !isValidRankingSubmissionId(value.submissionId)
    || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0
    || !isValidRankingClientVersion(value.clientVersion)
    || value.contractVersion !== RANKING_NAME_CONTRACT_VERSION
    || value.gameSlug !== RANKING_GAME_SLUGS[modeId]) throw new TypeError('saved ranking participation is invalid');
  return Object.freeze({ submissionId:value.submissionId, displayName, gameSlug:value.gameSlug,
    clientVersion:value.clientVersion, contractVersion:value.contractVersion, createdAt:value.createdAt });
}

export function captureRankingRun(displayName, modeId, cryptoObject = globalThis.crypto) {
  if (!displayName) return null;
  try {
    return normalizeRankingRun({submissionId:createSubmissionId(cryptoObject),displayName,
      gameSlug:RANKING_GAME_SLUGS[modeId],clientVersion:RANKING_CLIENT_VERSION,
      contractVersion:RANKING_NAME_CONTRACT_VERSION,createdAt:Date.now()}, {displayName,modeId});
  } catch {
    // Missing secure randomness disables public submission, never gameplay.
    return null;
  }
}

// A late acknowledgement may arrive after the player starts another game.
// Only remove the active save that belongs to the acknowledged receipt.
export async function clearAcceptedRankingState(storage, submission) {
  const loaded = await storage.load();
  const run = loaded?.state?.rankingRun;
  if (loaded?.status !== 'available' || !run || run.submissionId !== submission.submissionId
    || run.displayName !== submission.displayName || run.clientVersion !== submission.clientVersion) {
    return {status:'not-matching'};
  }
  const result = await storage.clear({expectedSerialized:loaded.serialized});
  return {...result, serialized:loaded.serialized};
}

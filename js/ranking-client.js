import { GAME_MODE_IDS } from './game-modes.js';
import { validatePlayerName } from './player-profile.js';

export const RANKING_LIMIT = 10;
export const RANKING_CLIENT_VERSION = 'sainome-web-1';
export const RANKING_SUBMISSION_CONTRACT_VERSION = 'shared-v1';
export const RANKING_GAME_SLUGS = Object.freeze({
  [GAME_MODE_IDS.SIXTY_SECONDS]: 'sainome_60_seconds',
  [GAME_MODE_IDS.ONE_EIGHTY_SECONDS]: 'sainome_180_seconds'
});

const MAX_SCORE = 100_000_000;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/u;
const CLIENT_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/u;

export function isValidRankingSubmissionId(value) {
  return typeof value === 'string' && SUBMISSION_ID_PATTERN.test(value);
}

export function isValidRankingClientVersion(value) {
  return typeof value === 'string' && CLIENT_VERSION_PATTERN.test(value);
}

export class RankingError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RankingError';
    this.code = code;
  }
}

function requireModeSlug(modeId) {
  const slug = RANKING_GAME_SLUGS[modeId];
  if (!slug) throw new RangeError(`Unknown ranking mode: ${modeId}`);
  return slug;
}

function requireScore(score) {
  if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new RangeError('score must be a safe non-negative integer');
  }
  return score;
}

function requireDisplayName(displayName) {
  const validated = validatePlayerName(displayName);
  if (!validated.ok || validated.name !== displayName) {
    throw new TypeError('displayName is invalid or not normalized');
  }
  return displayName;
}

function requireSubmissionId(submissionId) {
  if (!isValidRankingSubmissionId(submissionId)) {
    throw new TypeError('submissionId is invalid');
  }
  return submissionId;
}

function requireClientVersion(clientVersion) {
  if (!isValidRankingClientVersion(clientVersion)) {
    throw new TypeError('clientVersion is invalid');
  }
  return clientVersion;
}

function parseSubmitResponse(data, expected) {
  if (Array.isArray(data) && data.length !== 1) {
    throw new RankingError('invalid-response', '記録登録の応答件数が不正です');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.accepted !== true) {
    throw new RankingError('invalid-response', '記録登録の応答を確認できませんでした');
  }

  const bestScore = row.result_best_score;
  const playCount = row.result_play_count;
  if (
    typeof row.result_display_name !== 'string'
    || row.result_display_name.length === 0
    || row.result_display_name.length > 80
    || typeof bestScore !== 'number'
    || !Number.isSafeInteger(bestScore)
    || bestScore < 0
    || bestScore > MAX_SCORE
    || typeof playCount !== 'number'
    || !Number.isSafeInteger(playCount)
    || playCount < 1
    || typeof row.is_first_play !== 'boolean'
    || typeof row.is_new_best !== 'boolean'
    || typeof row.was_duplicate !== 'boolean'
    || row.result_submission_id !== expected.submissionId
    || row.result_contract_version !== expected.contractVersion
    || row.result_client_version !== expected.clientVersion
    || row.result_game_slug !== expected.gameSlug
    || row.result_display_name !== expected.displayName
    || row.result_submitted_score !== expected.score
  ) {
    throw new RankingError('invalid-response', '記録登録の応答が不正です');
  }

  return Object.freeze({
    accepted: true,
    submissionId: row.result_submission_id,
    contractVersion: row.result_contract_version,
    clientVersion: row.result_client_version,
    gameSlug: row.result_game_slug,
    submittedScore: row.result_submitted_score,
    displayName: row.result_display_name,
    bestScore,
    playCount,
    isFirstPlay: row.is_first_play === true,
    isNewBest: row.is_new_best === true,
    wasDuplicate: row.was_duplicate === true
  });
}

function parseRankingResponse(data) {
  if (!Array.isArray(data)) {
    throw new RankingError('invalid-response', 'ランキングの応答が不正です');
  }

  const ranking = [];
  let currentUserCount = 0;
  for (const row of data) {
    if (ranking.length >= RANKING_LIMIT) break;
    const displayName = typeof row?.display_name === 'string'
      ? row.display_name
      : '';
    const validatedName = validatePlayerName(displayName);
    if (!validatedName.ok || validatedName.name !== displayName) continue;

    const rank = Number(row.rank_no);
    const score = Number(row.best_score);
    const playCount = Number(row.play_count);
    if (
      !Number.isSafeInteger(rank)
      || rank < 1
      || !Number.isSafeInteger(score)
      || score < 0
      || !Number.isSafeInteger(playCount)
      || playCount < 1
    ) {
      throw new RankingError('invalid-response', 'ランキングの行が不正です');
    }

    if (row.is_current_user === true) {
      currentUserCount += 1;
      if (currentUserCount > 1) {
        throw new RankingError('invalid-response', 'ランキングの本人判定が不正です');
      }
    }

    ranking.push(Object.freeze({
      rank,
      displayName,
      score,
      playCount,
      isCurrentUser: row.is_current_user === true
    }));
  }
  return Object.freeze(ranking);
}

function normalizeEndpoint(url) {
  if (typeof url !== 'string' || !/^https:\/\/[^/]+\.supabase\.co\/?$/u.test(url)) {
    throw new TypeError('Supabase URL is invalid');
  }
  return url.replace(/\/$/u, '');
}

export function createSubmissionId(cryptoObject = globalThis.crypto) {
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  if (typeof cryptoObject?.getRandomValues === 'function') {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `fallback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

export class RankingClient {
  constructor({ url, publishableKey, fetchImpl = globalThis.fetch, timeoutMs = 8_000 }) {
    this.url = normalizeEndpoint(url);
    if (typeof publishableKey !== 'string' || publishableKey.length < 20) {
      throw new TypeError('Supabase publishable key is invalid');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new RangeError('timeoutMs is invalid');
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async #rpc(functionName, parameters) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parameters),
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new RankingError('request-failed', 'ランキング通信に失敗しました');
      }
      return data;
    } catch (error) {
      if (error instanceof RankingError) throw error;
      if (error?.name === 'AbortError') {
        throw new RankingError('timeout', 'ランキング通信が時間切れになりました', error);
      }
      throw new RankingError('network', 'ランキングへ接続できませんでした', error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async submitScore({
    displayName,
    modeId,
    score,
    submissionId,
    clientVersion = RANKING_CLIENT_VERSION,
    contractVersion = RANKING_SUBMISSION_CONTRACT_VERSION
  }) {
    const expected = Object.freeze({
      displayName: requireDisplayName(displayName),
      gameSlug: requireModeSlug(modeId),
      score: requireScore(score),
      clientVersion: requireClientVersion(clientVersion),
      submissionId: requireSubmissionId(submissionId),
      contractVersion
    });
    if (contractVersion !== RANKING_SUBMISSION_CONTRACT_VERSION) {
      throw new TypeError('contractVersion is invalid');
    }

    const data = await this.#rpc('submit_score_once', {
      p_display_name: displayName,
      p_game_slug: expected.gameSlug,
      p_score: expected.score,
      p_client_version: expected.clientVersion,
      p_submission_id: expected.submissionId,
      p_contract_version: expected.contractVersion
    });
    return parseSubmitResponse(data, expected);
  }

  async getTopRanking(modeId) {
    const data = await this.#rpc('get_best_score_ranking', {
      p_game_slug: requireModeSlug(modeId),
      p_limit: RANKING_LIMIT
    });
    return parseRankingResponse(data);
  }
}

import { GAME_MODE_IDS } from './game-modes.js';

export const RANKING_LIMIT = 10;
export const RANKING_CLIENT_VERSION = 'sainome-web-1';
export const RANKING_GAME_SLUGS = Object.freeze({
  [GAME_MODE_IDS.SIXTY_SECONDS]: 'sainome_60_seconds',
  [GAME_MODE_IDS.ONE_EIGHTY_SECONDS]: 'sainome_180_seconds'
});

const MAX_SCORE = 100_000_000;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/u;

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

function requireSubmissionId(submissionId) {
  if (typeof submissionId !== 'string' || !SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw new TypeError('submissionId is invalid');
  }
  return submissionId;
}

function parseSubmitResponse(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.accepted !== true) {
    throw new RankingError('invalid-response', '記録登録の応答を確認できませんでした');
  }

  const bestScore = Number(row.result_best_score);
  const playCount = Number(row.result_play_count);
  if (!Number.isSafeInteger(bestScore) || !Number.isSafeInteger(playCount)) {
    throw new RankingError('invalid-response', '記録登録の応答が不正です');
  }

  return Object.freeze({
    accepted: true,
    displayName: String(row.result_display_name ?? ''),
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

  return Object.freeze(data.slice(0, RANKING_LIMIT).map((row) => {
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

    return Object.freeze({
      rank,
      displayName: String(row.display_name ?? '').slice(0, 80),
      score,
      playCount
    });
  }));
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

  async rpc(functionName, parameters) {
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

  async submitScore({ displayName, modeId, score, submissionId }) {
    if (typeof displayName !== 'string' || displayName.length === 0) {
      throw new TypeError('displayName is required');
    }

    const data = await this.rpc('submit_score_once', {
      p_display_name: displayName,
      p_game_slug: requireModeSlug(modeId),
      p_score: requireScore(score),
      p_client_version: RANKING_CLIENT_VERSION,
      p_submission_id: requireSubmissionId(submissionId)
    });
    return parseSubmitResponse(data);
  }

  async getTopRanking(modeId) {
    const data = await this.rpc('get_best_score_ranking', {
      p_game_slug: requireModeSlug(modeId),
      p_limit: RANKING_LIMIT
    });
    return parseRankingResponse(data);
  }
}

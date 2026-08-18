import {
  RankingClient as DirectRankingClient,
  RANKING_GAME_SLUGS,
  createSubmissionId,
  isValidRankingSubmissionId
} from './ranking-client.js';

export { createSubmissionId, isValidRankingSubmissionId };

const EDGE_CLIENT_VERSION = 'sainome-web-3-edge-v1';
const EDGE_FUNCTION = 'sainome-ranking';
const RANKING_LIMIT = 10;
const MAX_SCORE = 100_000_000;

function requireGameSlug(modeId) {
  const slug = RANKING_GAME_SLUGS[modeId];
  if (!slug) throw new RangeError(`Unknown ranking mode: ${modeId}`);
  return slug;
}

function requireName(displayName) {
  if (
    typeof displayName !== 'string'
    || displayName.length < 1
    || displayName.length > 20
    || displayName.trim() !== displayName
  ) {
    throw new TypeError('displayName is invalid');
  }
  return displayName;
}

function requireScore(score) {
  if (!Number.isSafeInteger(score) || score < 0 || score > MAX_SCORE) {
    throw new RangeError('score is invalid');
  }
  return score;
}

export class RankingClient {
  constructor({
    url,
    publishableKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000
  }) {
    this.direct = new DirectRankingClient({ url, publishableKey, fetchImpl, timeoutMs });
    this.url = String(url).replace(/\/$/u, '');
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async #request(action, payload = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.url}/functions/v1/${EDGE_FUNCTION}`, {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          clientVersion: EDGE_CLIENT_VERSION,
          ...payload
        }),
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = data && typeof data === 'object' ? String(data.reason || '') : '';
        const error = new Error(
          reason
            ? `ランキング中継で失敗しました (${response.status}: ${reason})`
            : `ランキング中継で失敗しました (${response.status})`
        );
        error.code = 'edge-request-failed';
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('ランキング中継が時間切れになりました');
        timeoutError.code = 'edge-timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async startPlay({ displayName, modeId }) {
    const expectedName = requireName(displayName);
    const gameSlug = requireGameSlug(modeId);
    const data = await this.#request('start', {
      displayName: expectedName,
      gameSlug
    });
    if (
      !data
      || data.accepted !== true
      || data.display_name !== expectedName
      || data.game_slug !== gameSlug
      || data.result_type !== 'play'
    ) {
      throw new Error('プレイ開始の受付内容が一致しません');
    }
    return Object.freeze({
      started: true,
      displayName: data.display_name,
      gameSlug: data.game_slug,
      playCount: null
    });
  }

  async submitScoreDirect({ displayName, modeId, score }) {
    const expectedName = requireName(displayName);
    const gameSlug = requireGameSlug(modeId);
    const expectedScore = requireScore(score);
    const data = await this.#request('submit', {
      displayName: expectedName,
      gameSlug,
      score: expectedScore
    });
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (
      !row
      || row.accepted !== true
      || row.result_display_name !== expectedName
      || !Number.isSafeInteger(row.result_best_score)
      || !Number.isSafeInteger(row.result_play_count)
    ) {
      throw new Error('スコア受付内容が一致しません');
    }
    return Object.freeze({
      accepted: true,
      displayName: row.result_display_name,
      gameSlug,
      submittedScore: expectedScore,
      bestScore: row.result_best_score,
      playCount: row.result_play_count,
      isFirstPlay: row.is_first_play === true,
      isNewBest: row.is_new_best === true
    });
  }

  async getTopRanking(modeId) {
    const gameSlug = requireGameSlug(modeId);
    const data = await this.#request('ranking', { gameSlug });
    if (!Array.isArray(data)) throw new Error('ランキング応答が不正です');
    return Object.freeze(data.slice(0, RANKING_LIMIT).map((row) => Object.freeze({
      rank: Number(row.rank_no),
      displayName: String(row.display_name ?? ''),
      score: Number(row.best_score),
      playCount: Number(row.play_count),
      isCurrentUser: false
    })).filter((row) =>
      Number.isSafeInteger(row.rank)
      && row.rank > 0
      && row.displayName.length > 0
      && Number.isSafeInteger(row.score)
      && Number.isSafeInteger(row.playCount)
      && row.playCount > 0
    ));
  }

  issuePlay(args) {
    return this.direct.issuePlay(args);
  }

  submitScore(args) {
    return this.direct.submitScore(args);
  }
}

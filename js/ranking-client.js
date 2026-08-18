import { GAME_MODE_IDS } from './game-modes.js';
import { validatePlayerName } from './player-profile.js';

export const RANKING_LIMIT = 10;
export const RANKING_CLIENT_VERSION = 'sainome-web-3';
export const RANKING_SUBMISSION_CONTRACT_VERSION = 'sainome-play-v2';
export const RANKING_NAME_CONTRACT_VERSION = 'sainome-name-v1';
export const RANKING_FAILURE_EVENT = 'sainome:ranking-failure';
export const RANKING_GAME_SLUGS = Object.freeze({
  [GAME_MODE_IDS.THREE_HUNDRED_SECONDS]: 'sainome_300_seconds'
});

const MAX_SCORE = 100_000_000;
const SUBMISSION_DELAY_MS = 303_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLIENT_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,40}$/u;

export function isValidRankingSubmissionId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export const isValidServerSubmissionId = isValidRankingSubmissionId;

export function isValidRankingClientVersion(value) {
  return typeof value === 'string' && CLIENT_VERSION_PATTERN.test(value);
}

export class RankingError extends Error {
  constructor(code, message, cause, {
    retryable = false,
    status = null,
    rpcName = null,
    serverCode = null,
    serverMessage = null,
    serverHint = null,
    serverDetails = null,
    gameSlug = null
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RankingError';
    this.code = code;
    this.retryable = retryable === true;
    this.status = Number.isInteger(status) ? status : null;
    this.rpcName = typeof rpcName === 'string' ? rpcName : null;
    this.serverCode = typeof serverCode === 'string' ? serverCode : null;
    this.serverMessage = typeof serverMessage === 'string' ? serverMessage : null;
    this.serverHint = typeof serverHint === 'string' ? serverHint : null;
    this.serverDetails = typeof serverDetails === 'string' ? serverDetails : null;
    this.gameSlug = typeof gameSlug === 'string' ? gameSlug : null;
  }
}

export function isRetryableRankingError(error) {
  return error instanceof RankingError
    && (error.retryable === true || error.code === 'network' || error.code === 'timeout');
}

export function createRankingFailureDetail(error) {
  if (!(error instanceof RankingError)) {
    throw new TypeError('ranking error is required');
  }
  return Object.freeze({
    code: error.code,
    retryable: error.retryable === true,
    status: error.status,
    rpcName: error.rpcName,
    serverCode: error.serverCode,
    serverMessage: error.serverMessage,
    serverHint: error.serverHint,
    serverDetails: error.serverDetails,
    gameSlug: error.gameSlug
  });
}

function reportRankingFailure(error) {
  const detail = createRankingFailureDetail(error);
  if (typeof globalThis.window !== 'undefined') {
    console.error('[sainome-ranking]', detail);
  }
  try {
    if (
      typeof globalThis.dispatchEvent === 'function'
      && typeof globalThis.CustomEvent === 'function'
    ) {
      globalThis.dispatchEvent(new globalThis.CustomEvent(RANKING_FAILURE_EVENT, { detail }));
    }
  } catch {
    // Diagnostics must never replace the original ranking error.
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
  return submissionId.toLowerCase();
}

function requireClientVersion(clientVersion) {
  if (!isValidRankingClientVersion(clientVersion)) {
    throw new TypeError('clientVersion is invalid');
  }
  return clientVersion;
}

function parseOneRow(data, message) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0]) {
    throw new RankingError('invalid-response', message);
  }
  return data[0];
}

function parseSubmitResponse(data, expected) {
  const row = parseOneRow(data, '記録登録の応答件数が不正です');
  const bestScore = row.result_best_score;
  const playCount = row.result_play_count;
  if (
    row.accepted !== true
    || !isValidRankingSubmissionId(row.result_submission_id)
    || row.result_submission_id.toLowerCase() !== expected.submissionId
    || row.result_contract_version !== expected.contractVersion
    || row.result_client_version !== expected.clientVersion
    || row.result_game_slug !== expected.gameSlug
    || row.result_display_name !== expected.displayName
    || row.result_submitted_score !== expected.score
    || typeof row.result_display_name !== 'string'
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
  ) {
    throw new RankingError('invalid-response', '記録登録の応答が不正です');
  }

  return Object.freeze({
    accepted: true,
    submissionId: row.result_submission_id.toLowerCase(),
    contractVersion: row.result_contract_version,
    clientVersion: row.result_client_version,
    gameSlug: row.result_game_slug,
    submittedScore: row.result_submitted_score,
    displayName: row.result_display_name,
    bestScore,
    playCount,
    isFirstPlay: row.is_first_play,
    isNewBest: row.is_new_best,
    wasDuplicate: row.was_duplicate
  });
}

function parseIssuedAt(value, name) {
  if (typeof value !== 'string') throw new RankingError('invalid-response', `${name}が不正です`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new RankingError('invalid-response', `${name}が不正です`);
  return timestamp;
}

function parseIssueResponse(data, expected) {
  const row = parseOneRow(data, 'プレイ番号の発行応答が不正です');
  const issuedAt = parseIssuedAt(row.issued_at, '発行時刻');
  const earliestSubmitAt = parseIssuedAt(row.earliest_submit_at, '受付開始時刻');
  const expiresAt = parseIssuedAt(row.expires_at, '失効時刻');
  if (
    row.issued !== true
    || !isValidRankingSubmissionId(row.result_submission_id)
    || row.result_display_name !== expected.displayName
    || row.result_game_slug !== expected.gameSlug
    || row.result_client_version !== RANKING_CLIENT_VERSION
    || row.result_contract_version !== RANKING_SUBMISSION_CONTRACT_VERSION
    || earliestSubmitAt - issuedAt !== SUBMISSION_DELAY_MS
    || expiresAt - issuedAt !== 86_400_000
    || !(issuedAt < earliestSubmitAt && earliestSubmitAt < expiresAt)
  ) {
    throw new RankingError('invalid-response', 'プレイ番号の発行応答が不正です');
  }

  return Object.freeze({
    submissionId: row.result_submission_id.toLowerCase(),
    displayName: row.result_display_name,
    gameSlug: row.result_game_slug,
    clientVersion: row.result_client_version,
    contractVersion: row.result_contract_version,
    issuedAt,
    earliestSubmitAt,
    expiresAt
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
    const displayName = typeof row?.display_name === 'string' ? row.display_name : '';
    const validatedName = validatePlayerName(displayName);
    if (!validatedName.ok || validatedName.name !== displayName) continue;

    const { rank_no: rank, best_score: score, play_count: playCount } = row;
    const isCurrentUser = row.is_current_user === true;
    if (
      typeof rank !== 'number'
      || !Number.isSafeInteger(rank)
      || rank < 1
      || typeof score !== 'number'
      || !Number.isSafeInteger(score)
      || score < 0
      || score > MAX_SCORE
      || typeof playCount !== 'number'
      || !Number.isSafeInteger(playCount)
      || playCount < 1
      || (row.is_current_user !== undefined && typeof row.is_current_user !== 'boolean')
      || (row.verification_status !== undefined && row.verification_status !== 'unverified')
    ) {
      throw new RankingError('invalid-response', 'ランキングの行が不正です');
    }

    if (isCurrentUser) {
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
      isCurrentUser
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
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  if (typeof cryptoObject?.getRandomValues === 'function') {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `fallback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function parseSimpleStartResponse(data, expected) {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  if (
    row?.accepted !== true
    || row.display_name !== expected.displayName
    || row.game_slug !== expected.gameSlug
    || row.result_type !== 'play'
  ) {
    throw new RankingError('invalid-response', 'プレイ開始の応答が不正です');
  }
  return Object.freeze({
    started: true,
    displayName: row.display_name,
    gameSlug: row.game_slug,
    playCount: null
  });
}

function parseSimpleSubmitResponse(data, expected) {
  const row = parseOneRow(data, '記録登録の応答が不正です');
  if (
    row.accepted !== true
    || row.result_display_name !== expected.displayName
    || typeof row.result_best_score !== 'number'
    || !Number.isSafeInteger(row.result_best_score)
    || row.result_best_score < 0
    || row.result_best_score > MAX_SCORE
    || typeof row.result_play_count !== 'number'
    || !Number.isSafeInteger(row.result_play_count)
    || row.result_play_count < 1
    || typeof row.is_first_play !== 'boolean'
    || typeof row.is_new_best !== 'boolean'
  ) {
    throw new RankingError('invalid-response', '記録登録の応答が不正です');
  }
  return Object.freeze({
    accepted: true,
    displayName: row.result_display_name,
    gameSlug: expected.gameSlug,
    submittedScore: expected.score,
    bestScore: row.result_best_score,
    playCount: row.result_play_count,
    isFirstPlay: row.is_first_play,
    isNewBest: row.is_new_best
  });
}

export class RankingClient {
  constructor({
    url,
    publishableKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000
  }) {
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

  #reportParsedFailure(error, functionName, parameters) {
    const rankingError = error instanceof RankingError
      ? error
      : new RankingError('client', 'ランキング応答を処理できませんでした', error);
    if (!rankingError.rpcName) rankingError.rpcName = functionName;
    if (!rankingError.gameSlug && typeof parameters?.p_game_slug === 'string') {
      rankingError.gameSlug = parameters.p_game_slug;
    }
    reportRankingFailure(rankingError);
    throw rankingError;
  }

  async #rpc(functionName, parameters) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const gameSlug = typeof parameters?.p_game_slug === 'string'
      ? parameters.p_game_slug
      : null;
    const headers = {
      apikey: this.publishableKey,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    try {
      const response = await this.fetchImpl.call(globalThis, `${this.url}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers,
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
        const retryable = response.status === 408
          || response.status === 425
          || response.status === 429
          || response.status >= 500;
        const serverError = data && typeof data === 'object' && !Array.isArray(data)
          ? data
          : {};
        const error = new RankingError(
          'request-failed',
          'ランキング通信に失敗しました',
          undefined,
          {
            retryable,
            status: response.status,
            rpcName: functionName,
            serverCode: typeof serverError.code === 'string' ? serverError.code : null,
            serverMessage: typeof serverError.message === 'string' ? serverError.message : null,
            serverHint: typeof serverError.hint === 'string' ? serverError.hint : null,
            serverDetails: typeof serverError.details === 'string' ? serverError.details : null,
            gameSlug
          }
        );
        reportRankingFailure(error);
        throw error;
      }
      return data;
    } catch (error) {
      if (error instanceof RankingError) throw error;
      const rankingError = error?.name === 'AbortError'
        ? new RankingError(
          'timeout',
          'ランキング通信が時間切れになりました',
          error,
          { retryable: true, rpcName: functionName, gameSlug }
        )
        : new RankingError(
          'network',
          'ランキングへ接続できませんでした',
          error,
          { retryable: true, rpcName: functionName, gameSlug }
        );
      reportRankingFailure(rankingError);
      throw rankingError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async startPlay({ displayName, modeId }) {
    const expected = Object.freeze({
      displayName: requireDisplayName(displayName),
      gameSlug: requireModeSlug(modeId)
    });
    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_result_type: 'play',
      p_client_version: RANKING_CLIENT_VERSION
    };
    const data = await this.#rpc('record_game_play', parameters);
    try {
      return parseSimpleStartResponse(data, expected);
    } catch (error) {
      return this.#reportParsedFailure(error, 'record_game_play', parameters);
    }
  }

  async submitScoreDirect({ displayName, modeId, score }) {
    const expected = Object.freeze({
      displayName: requireDisplayName(displayName),
      gameSlug: requireModeSlug(modeId),
      score: requireScore(score)
    });
    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_score: expected.score,
      p_client_version: RANKING_CLIENT_VERSION
    };
    const data = await this.#rpc('submit_score', parameters);
    try {
      return parseSimpleSubmitResponse(data, expected);
    } catch (error) {
      return this.#reportParsedFailure(error, 'submit_score', parameters);
    }
  }

  async issuePlay({ displayName, modeId }) {
    const expected = Object.freeze({
      displayName: requireDisplayName(displayName),
      gameSlug: requireModeSlug(modeId)
    });
    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_client_version: RANKING_CLIENT_VERSION,
      p_contract_version: RANKING_SUBMISSION_CONTRACT_VERSION
    };
    const data = await this.#rpc('issue_sainome_play_v2', parameters);
    try {
      return parseIssueResponse(data, expected);
    } catch (error) {
      return this.#reportParsedFailure(error, 'issue_sainome_play_v2', parameters);
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

    const parameters = {
      p_display_name: expected.displayName,
      p_game_slug: expected.gameSlug,
      p_score: expected.score,
      p_client_version: expected.clientVersion,
      p_submission_id: expected.submissionId,
      p_contract_version: expected.contractVersion
    };
    const data = await this.#rpc('submit_score_once', parameters);
    try {
      return parseSubmitResponse(data, expected);
    } catch (error) {
      return this.#reportParsedFailure(error, 'submit_score_once', parameters);
    }
  }

  async getTopRanking(modeId) {
    const parameters = {
      p_game_slug: requireModeSlug(modeId),
      p_limit: RANKING_LIMIT
    };
    const data = await this.#rpc('get_best_score_ranking', parameters);
    try {
      return parseRankingResponse(data);
    } catch (error) {
      return this.#reportParsedFailure(error, 'get_best_score_ranking', parameters);
    }
  }
}

export { parseIssueResponse, parseRankingResponse, parseSubmitResponse };

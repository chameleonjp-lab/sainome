import {
  isValidRankingSubmissionId,
  isRetryableRankingError,
  RankingError,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_NAME_CONTRACT_VERSION,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from './ranking-client.js';
import { validatePlayerName } from './player-profile.js';

function requireCanonicalPlayerName(displayName) {
  const validated = validatePlayerName(displayName);
  if (!validated.ok || validated.name !== displayName) {
    throw new TypeError('displayName is invalid or not normalized');
  }
  return displayName;
}

const DIRECT_SUBMISSION_ID_PATTERN = /^direct-[A-Za-z0-9_-]{8,120}$/u;

function isValidDirectSubmissionId(value) {
  return isValidRankingSubmissionId(value)
    || (typeof value === 'string' && DIRECT_SUBMISSION_ID_PATTERN.test(value));
}

function requirePlayTicket(playTicket, result) {
  if (!playTicket || typeof playTicket !== 'object') return null;
  if (!isValidRankingSubmissionId(playTicket.submissionId)) {
    throw new TypeError('play ticket submissionId is invalid');
  }
  if (playTicket.gameSlug !== RANKING_GAME_SLUGS[result.modeId]) {
    throw new TypeError('play ticket game slug is invalid');
  }
  if (playTicket.clientVersion !== RANKING_CLIENT_VERSION) {
    throw new TypeError('play ticket client version is invalid');
  }
  if (playTicket.contractVersion !== RANKING_SUBMISSION_CONTRACT_VERSION) {
    throw new TypeError('play ticket contract version is invalid');
  }
  for (const [name, value] of [
    ['issuedAt', playTicket.issuedAt],
    ['earliestSubmitAt', playTicket.earliestSubmitAt],
    ['expiresAt', playTicket.expiresAt]
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`play ticket ${name} is invalid`);
    }
  }
  if (!(playTicket.issuedAt < playTicket.earliestSubmitAt
    && playTicket.earliestSubmitAt < playTicket.expiresAt)) {
    throw new TypeError('play ticket time window is invalid');
  }
  return playTicket;
}

export class SingleFlight {
  constructor() {
    this.active = false;
  }

  async run(action) {
    if (typeof action !== 'function') throw new TypeError('single-flight action is invalid');
    if (this.active) return Object.freeze({ started: false, value: undefined });

    this.active = true;
    try {
      return Object.freeze({ started: true, value: await action() });
    } finally {
      this.active = false;
    }
  }
}

export function classifyRankingFailure(error) {
  if (isRetryableRankingError(error)) return 'transient';
  if (
    error instanceof RankingError
    && error.code === 'request-failed'
    && error.rpcName === 'submit_score_once'
    && error.status === 410
    && error.serverCode === 'PT410'
  ) {
    return 'permanent';
  }
  if (
    error instanceof RankingError
    && error.code === 'request-failed'
    && [400, 409, 422].includes(error.status)
  ) {
    return 'permanent';
  }
  return 'transient';
}

export function updateIfCurrentRankingSubmission({ submission, isCurrent, update }) {
  if (typeof isCurrent !== 'function' || typeof update !== 'function') {
    throw new TypeError('ranking view update is invalid');
  }
  if (!isCurrent(submission)) return false;
  update();
  return true;
}

export async function prepareRankingSubmission({
  pendingSubmissions,
  displayName,
  result,
  now = () => Date.now(),
  playTicket = null
}) {
  if (!pendingSubmissions || typeof pendingSubmissions.enqueue !== 'function') {
    throw new TypeError('pendingSubmissions is invalid');
  }
  if (typeof now !== 'function') {
    throw new TypeError('submission clock is invalid');
  }
  requireCanonicalPlayerName(displayName);

  if (!playTicket) {
    return Object.freeze({
      submissionId: null,
      contractVersion: RANKING_SUBMISSION_CONTRACT_VERSION,
      clientVersion: RANKING_CLIENT_VERSION,
      displayName,
      result,
      createdAt: now(),
      persisted: false,
      pendingSaveCode: 'ticket-unavailable',
      canSubmit: false
    });
  }

  const ticket = requirePlayTicket(playTicket, result);
  const candidate = Object.freeze({
    submissionId: ticket.submissionId,
    contractVersion: ticket.contractVersion,
    clientVersion: ticket.clientVersion,
    displayName,
    result,
    createdAt: now(),
    issuedAt: ticket.issuedAt,
    earliestSubmitAt: ticket.earliestSubmitAt,
    expiresAt: ticket.expiresAt
  });

  let queued;
  try {
    queued = await pendingSubmissions.enqueue(candidate);
  } catch (error) {
    console.error(error);
    queued = {
      ok: true,
      persisted: false,
      code: error?.code === 'storage-timeout'
        ? 'storage-timeout'
        : 'storage-unavailable'
    };
  }
  const canSubmit = queued?.ok === true
    || queued?.code === 'queue-full'
    || queued?.code === 'storage-unavailable'
    || queued?.code === 'storage-timeout';

  return Object.freeze({
    ...candidate,
    persisted: queued.persisted,
    pendingSaveCode: queued.code,
    canSubmit
  });
}

export async function prepareDirectRankingSubmission({
  pendingSubmissions,
  displayName,
  result,
  now = () => Date.now(),
  submissionId
}) {
  if (!pendingSubmissions || typeof pendingSubmissions.enqueue !== 'function') {
    throw new TypeError('pendingSubmissions is invalid');
  }
  if (typeof now !== 'function') {
    throw new TypeError('submission clock is invalid');
  }
  requireCanonicalPlayerName(displayName);
  if (!isValidDirectSubmissionId(submissionId)) {
    throw new TypeError('direct submissionId is invalid');
  }

  const candidate = Object.freeze({
    kind: 'direct-name',
    submissionId,
    contractVersion: RANKING_NAME_CONTRACT_VERSION,
    clientVersion: RANKING_CLIENT_VERSION,
    displayName,
    result,
    createdAt: now()
  });

  let queued;
  try {
    queued = await pendingSubmissions.enqueue(candidate);
  } catch (error) {
    console.error(error);
    queued = {
      ok: false,
      persisted: false,
      code: error?.code === 'storage-timeout'
        ? 'storage-timeout'
        : 'storage-unavailable'
    };
  }

  // New Sainome results use the same direct-ranking rule as Gorilla Rain:
  // local IndexedDB is optional backup only and must never decide whether
  // submit_score is called. Name, mode and score are validated again by the
  // ranking client and by the Supabase RPC.
  return Object.freeze({
    ...candidate,
    persisted: queued?.persisted === true,
    pendingSaveCode: queued?.code ?? 'storage-unavailable',
    canSubmit: true
  });
}

export async function submitPendingDirectRanking({
  rankingClient,
  pendingSubmissions,
  submission
}) {
  if (submission?.canSubmit === false) {
    throw new Error('ranking submission is not safe to send');
  }
  if (submission?.kind !== 'direct-name') {
    throw new TypeError('direct ranking submission is invalid');
  }
  requireCanonicalPlayerName(submission.displayName);

  const outcome = await rankingClient.submitScoreDirect({
    displayName: submission.displayName,
    modeId: submission.result.modeId,
    score: submission.result.score
  });
  if (
    outcome?.accepted !== true
    || outcome.displayName !== submission.displayName
    || outcome.gameSlug !== RANKING_GAME_SLUGS[submission.result.modeId]
    || outcome.submittedScore !== submission.result.score
  ) {
    throw new Error('ranking acceptance does not match the saved submission');
  }
  const cleanup = await pendingSubmissions.markAccepted(submission);
  return Object.freeze({ outcome, cleanup });
}

export async function submitPendingRanking({
  rankingClient,
  pendingSubmissions,
  submission
}) {
  if (submission?.canSubmit === false) {
    throw new Error('ranking submission is not safe to send');
  }
  requireCanonicalPlayerName(submission?.displayName);

  const outcome = await rankingClient.submitScore({
    displayName: submission.displayName,
    modeId: submission.result.modeId,
    score: submission.result.score,
    submissionId: submission.submissionId,
    clientVersion: submission.clientVersion,
    contractVersion: submission.contractVersion
  });
  if (
    outcome?.accepted !== true
    || outcome.submissionId !== submission.submissionId
    || outcome.contractVersion !== submission.contractVersion
    || outcome.clientVersion !== submission.clientVersion
    || outcome.gameSlug !== RANKING_GAME_SLUGS[submission.result.modeId]
    || outcome.displayName !== submission.displayName
    || outcome.submittedScore !== submission.result.score
  ) {
    throw new Error('ranking acceptance does not match the saved submission');
  }
  const cleanup = await pendingSubmissions.markAccepted(submission);
  return Object.freeze({ outcome, cleanup });
}

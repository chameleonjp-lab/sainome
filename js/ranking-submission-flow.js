import {
  isValidRankingSubmissionId,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
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

  const queued = await pendingSubmissions.enqueue(candidate);
  const canSubmit = queued.ok || queued.code === 'queue-full';

  return Object.freeze({
    ...candidate,
    persisted: queued.persisted,
    pendingSaveCode: queued.code,
    canSubmit
  });
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

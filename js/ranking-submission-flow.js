import {
  createSubmissionId,
  RANKING_CLIENT_VERSION,
  RANKING_GAME_SLUGS,
  RANKING_SUBMISSION_CONTRACT_VERSION
} from './ranking-client.js';
import { validatePlayerName } from './player-profile.js';

const MAX_ID_ATTEMPTS = 3;

function requireCanonicalPlayerName(displayName) {
  const validated = validatePlayerName(displayName);
  if (!validated.ok || validated.name !== displayName) {
    throw new TypeError('displayName is invalid or not normalized');
  }
  return displayName;
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
  idFactory = createSubmissionId,
  now = () => Date.now(),
  clientVersion = RANKING_CLIENT_VERSION,
  contractVersion = RANKING_SUBMISSION_CONTRACT_VERSION
}) {
  if (!pendingSubmissions || typeof pendingSubmissions.enqueue !== 'function') {
    throw new TypeError('pendingSubmissions is invalid');
  }
  if (typeof idFactory !== 'function' || typeof now !== 'function') {
    throw new TypeError('submission factories are invalid');
  }
  requireCanonicalPlayerName(displayName);

  let lastCandidate = null;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const candidate = Object.freeze({
      submissionId: idFactory(),
      contractVersion,
      clientVersion,
      displayName,
      result,
      createdAt: now()
    });
    lastCandidate = candidate;
    const queued = await pendingSubmissions.enqueue(candidate);
    if (queued.code === 'submission-conflict') continue;

    const canSubmit = queued.ok || queued.code === 'queue-full';
    return Object.freeze({
      ...candidate,
      persisted: queued.persisted,
      pendingSaveCode: queued.code,
      canSubmit
    });
  }

  return Object.freeze({
    ...lastCandidate,
    persisted: false,
    pendingSaveCode: 'submission-conflict',
    canSubmit: false
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

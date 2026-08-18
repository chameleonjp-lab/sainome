export function resolveReleaseId(env = process.env) {
  const raw = String(env.SAINOME_RELEASE ?? env.GITHUB_SHA ?? '').trim();

  if (/^[0-9a-f]{7,40}$/iu.test(raw)) {
    return raw.toLowerCase().slice(0, 12);
  }

  if (/^[A-Za-z0-9._-]{1,64}$/u.test(raw)) {
    return raw.slice(0, 32);
  }

  return 'local-dev';
}

export function resolveCommitSha(env = process.env) {
  const raw = String(env.SAINOME_RELEASE ?? env.GITHUB_SHA ?? '').trim();
  return /^[0-9a-f]{40}$/iu.test(raw) ? raw.toLowerCase() : null;
}

export const RELEASE_DIAGNOSTICS_QUERY = 'sainome-test';
export const RELEASE_DIAGNOSTICS_VALUE = 'release';

export function isReleaseDiagnosticsEnabled(location = globalThis.location) {
  if (!location?.href) return false;

  try {
    const url = new URL(location.href);
    return url.searchParams.get(RELEASE_DIAGNOSTICS_QUERY)
      === RELEASE_DIAGNOSTICS_VALUE;
  } catch {
    return false;
  }
}

export const SAINOME_GAME_URL = "https://chameleonjp-lab.github.io/sainome/";
export const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";

export function normalizeSainomeGameUrl(
  locationObject = globalThis.location,
  historyObject = globalThis.history
) {
  if (!locationObject?.href || typeof historyObject?.replaceState !== "function") {
    return false;
  }

  let currentUrl;
  let canonicalUrl;
  try {
    currentUrl = new URL(locationObject.href);
    canonicalUrl = new URL(SAINOME_GAME_URL);
  } catch {
    return false;
  }

  if (
    currentUrl.origin !== canonicalUrl.origin
    || currentUrl.pathname !== canonicalUrl.pathname
    || !currentUrl.searchParams.has("v")
  ) {
    return false;
  }

  currentUrl.searchParams.delete("v");

  try {
    historyObject.replaceState(
      historyObject.state ?? null,
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    );
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  normalizeSainomeGameUrl(window.location, window.history);
}

export const GAME_MODE_IDS = Object.freeze({
  THREE_HUNDRED_SECONDS: '300-seconds'
});

export const DEFAULT_GAME_MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;

export const GAME_MODES = Object.freeze({
  [GAME_MODE_IDS.THREE_HUNDRED_SECONDS]: Object.freeze({
    id: GAME_MODE_IDS.THREE_HUNDRED_SECONDS,
    durationMs: 300_000,
    label: '300秒',
    brand: '300 SECOND PUZZLE',
    kicker: '300秒で、消して、増やして、つなげる'
  })
});

export function getGameMode(modeId = DEFAULT_GAME_MODE_ID) {
  const mode = GAME_MODES[modeId];
  if (!mode) throw new RangeError(`Unknown game mode: ${modeId}`);
  return mode;
}

export const GAME_MODE_IDS = Object.freeze({
  SIXTY_SECONDS: '60-seconds',
  ONE_EIGHTY_SECONDS: '180-seconds'
});

export const DEFAULT_GAME_MODE_ID = GAME_MODE_IDS.SIXTY_SECONDS;

export const GAME_MODES = Object.freeze({
  [GAME_MODE_IDS.SIXTY_SECONDS]: Object.freeze({
    id: GAME_MODE_IDS.SIXTY_SECONDS,
    durationMs: 60_000,
    label: '60秒',
    brand: '60 SECOND PUZZLE',
    kicker: '60秒で、つないで、沈める'
  }),
  [GAME_MODE_IDS.ONE_EIGHTY_SECONDS]: Object.freeze({
    id: GAME_MODE_IDS.ONE_EIGHTY_SECONDS,
    durationMs: 180_000,
    label: '180秒',
    brand: '180 SECOND PUZZLE',
    kicker: '180秒で、消して、増やして、つなげる'
  })
});

export function getGameMode(modeId = DEFAULT_GAME_MODE_ID) {
  const mode = GAME_MODES[modeId];
  if (!mode) throw new RangeError(`Unknown game mode: ${modeId}`);
  return mode;
}

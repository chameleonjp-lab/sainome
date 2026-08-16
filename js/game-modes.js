export const GAME_MODE_IDS = Object.freeze({
  // 旧保存・旧ランキング記録を読み取るための互換ID。新規開始では使わない。
  SIXTY_SECONDS: '60-seconds',
  ONE_EIGHTY_SECONDS: '180-seconds',
  THREE_HUNDRED_SECONDS: '300-seconds'
});

// 新しいプレイは300秒へ一本化する。旧60秒・180秒は、端末に残る途中経過・
// 未送信結果・過去記録を読み取れるよう互換用の定義だけを残す。
export const DEFAULT_GAME_MODE_ID = GAME_MODE_IDS.THREE_HUNDRED_SECONDS;

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
    kicker: '180秒（旧モード）'
  }),
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

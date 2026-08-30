const TOUCH_POINTER_MEDIA_QUERY = '(pointer: coarse)';

const STANDARD_ACTION_TIMINGS = Object.freeze({
  rollMs: 280,
  hopMs: 210,
  walkMs: 170,
  stepDownMs: 230
});

const TOUCH_ACTION_TIMINGS = Object.freeze({
  rollMs: 215,
  hopMs: 155,
  walkMs: 125,
  stepDownMs: 165
});

export const PERFORMANCE_PROFILES = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    actionTimings: STANDARD_ACTION_TIMINGS,
    pixelRatioCap: 2,
    antialias: true,
    shadows: true
  }),
  touch: Object.freeze({
    id: 'touch',
    actionTimings: TOUCH_ACTION_TIMINGS,
    pixelRatioCap: 1.5,
    antialias: false,
    shadows: false
  })
});

function resolveMatchMedia(matchMedia) {
  if (typeof matchMedia === 'function') return matchMedia;
  if (typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia.bind(globalThis);
  }
  return null;
}

export function isTouchPerformanceTarget({
  navigatorObject = globalThis.navigator,
  matchMedia = globalThis.matchMedia
} = {}) {
  const maxTouchPoints = Number(navigatorObject?.maxTouchPoints ?? 0);
  const matchMediaFunction = resolveMatchMedia(matchMedia);
  let hasCoarsePointer = false;

  try {
    hasCoarsePointer = matchMediaFunction?.(TOUCH_POINTER_MEDIA_QUERY).matches === true;
  } catch {
    hasCoarsePointer = false;
  }

  return maxTouchPoints > 0 || hasCoarsePointer;
}

export function getPerformanceProfile(options = {}) {
  const isTouch = options.isTouch ?? isTouchPerformanceTarget(options);
  return isTouch ? PERFORMANCE_PROFILES.touch : PERFORMANCE_PROFILES.standard;
}

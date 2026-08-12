export const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

function resolveMatchMedia(matchMedia) {
  if (typeof matchMedia === 'function') return matchMedia;
  if (typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia.bind(globalThis);
  }
  return null;
}

export class MotionPreferences {
  constructor({ matchMedia } = {}) {
    this.mediaQueryList = null;
    this.listeners = new Set();
    this.reducedMotion = false;
    this.contextChangeHandler = null;

    const matchMediaFunction = resolveMatchMedia(matchMedia);
    if (!matchMediaFunction) return;

    try {
      this.mediaQueryList = matchMediaFunction(REDUCED_MOTION_MEDIA_QUERY);
      this.reducedMotion = this.mediaQueryList?.matches === true;
      this.contextChangeHandler = (event) => {
        const matches = event?.matches ?? this.mediaQueryList?.matches;
        this.update(matches === true);
      };

      if (typeof this.mediaQueryList?.addEventListener === 'function') {
        this.mediaQueryList.addEventListener('change', this.contextChangeHandler);
      } else if (typeof this.mediaQueryList?.addListener === 'function') {
        this.mediaQueryList.addListener(this.contextChangeHandler);
      }
    } catch {
      this.mediaQueryList = null;
      this.contextChangeHandler = null;
      this.reducedMotion = false;
    }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    listener(this.reducedMotion);
    return () => this.listeners.delete(listener);
  }

  update(reducedMotion) {
    const next = reducedMotion === true;
    if (next === this.reducedMotion) return;
    this.reducedMotion = next;
    for (const listener of this.listeners) listener(next);
  }

  dispose() {
    if (this.mediaQueryList && this.contextChangeHandler) {
      if (typeof this.mediaQueryList.removeEventListener === 'function') {
        this.mediaQueryList.removeEventListener('change', this.contextChangeHandler);
      } else if (typeof this.mediaQueryList.removeListener === 'function') {
        this.mediaQueryList.removeListener(this.contextChangeHandler);
      }
    }
    this.mediaQueryList = null;
    this.contextChangeHandler = null;
    this.listeners.clear();
  }
}

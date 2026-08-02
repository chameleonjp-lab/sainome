export const TUTORIAL_SLIDE_COUNT = 3;

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function freezeSnapshot(slides) {
  return Object.freeze({
    index: slides.index,
    number: slides.index + 1,
    count: slides.count,
    isFirst: slides.index === 0,
    isLast: slides.index === slides.count - 1
  });
}

export class TutorialSlides {
  constructor({ count = TUTORIAL_SLIDE_COUNT } = {}) {
    this.count = requirePositiveInteger(count, 'count');
    this.index = 0;
  }

  reset() {
    this.index = 0;
    return this.getSnapshot();
  }

  next() {
    this.index = Math.min(this.count - 1, this.index + 1);
    return this.getSnapshot();
  }

  previous() {
    this.index = Math.max(0, this.index - 1);
    return this.getSnapshot();
  }

  getSnapshot() {
    return freezeSnapshot(this);
  }
}

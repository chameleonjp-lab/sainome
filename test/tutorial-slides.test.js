import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TUTORIAL_SLIDE_COUNT,
  TutorialSlides
} from '../js/tutorial-slides.js';

test('説明は1枚目から始まる', () => {
  const slides = new TutorialSlides();

  assert.deepEqual(slides.getSnapshot(), {
    index: 0,
    number: 1,
    count: TUTORIAL_SLIDE_COUNT,
    isFirst: true,
    isLast: false
  });
});

test('次へ進むと最後の5枚目で止まる', () => {
  const slides = new TutorialSlides();

  for (let index = 0; index < 4; index += 1) slides.next();
  const last = slides.getSnapshot();

  assert.equal(last.index, 4);
  assert.equal(last.isLast, true);
  assert.deepEqual(slides.next(), last);
});

test('前へ戻ると最初の1枚目で止まる', () => {
  const slides = new TutorialSlides();
  for (let index = 0; index < 4; index += 1) slides.next();
  for (let index = 0; index < 4; index += 1) slides.previous();
  const first = slides.getSnapshot();

  assert.equal(first.index, 0);
  assert.equal(first.isFirst, true);
  assert.deepEqual(slides.previous(), first);
});

test('開き直すと1枚目へ戻る', () => {
  const slides = new TutorialSlides();
  for (let index = 0; index < 4; index += 1) slides.next();

  const reset = slides.reset();

  assert.equal(reset.number, 1);
  assert.equal(reset.isFirst, true);
});

test('説明枚数には1以上の整数だけを使える', () => {
  assert.throws(() => new TutorialSlides({ count: 0 }), /positive integer/);
  assert.throws(() => new TutorialSlides({ count: 2.5 }), /positive integer/);
});

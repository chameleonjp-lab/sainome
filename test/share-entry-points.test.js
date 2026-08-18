import test from 'node:test';
import assert from 'node:assert/strict';

import { configureShareEntryPoints } from '../js/result-share.js';

function createElement() {
  const attributes = new Map();
  return {
    textContent: '',
    className: '',
    parentNode: null,
    nextSibling: null,
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name === 'class') this.className = value;
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    }
  };
}

test('ホームと結果のシェア導線を他ゲームと同じ表示へ揃える', () => {
  const homeShare = createElement();
  const homeLab = createElement();
  const resultShare = createElement();
  const parent = {
    inserted: null,
    insertBefore(node, reference) {
      this.inserted = { node, reference };
      node.parentNode = this;
      node.nextSibling = reference;
    }
  };
  homeShare.parentNode = parent;
  homeLab.parentNode = parent;

  const nodes = new Map([
    ['#home-share-button', homeShare],
    ['#home-lab-link', homeLab],
    ['#result-share-button', resultShare]
  ]);
  const root = {
    querySelector(selector) {
      return nodes.get(selector) ?? null;
    }
  };

  const configured = configureShareEntryPoints(root);

  assert.deepEqual(configured, { home: true, result: true });
  assert.equal(homeShare.textContent, 'ゲームをシェア');
  assert.equal(homeShare.className, 'lab-link home-lab-link');
  assert.equal(homeShare.getAttribute('aria-label'), 'サイノメをシェア');
  assert.deepEqual(parent.inserted, { node: homeShare, reference: homeLab });
  assert.equal(resultShare.textContent, '結果をシェア');
  assert.equal(resultShare.className, 'secondary-button');
  assert.equal(resultShare.getAttribute('aria-label'), '今回のスコアをシェア');
});

test('DOMがない環境では安全に何もしない', () => {
  assert.deepEqual(configureShareEntryPoints(null), { home: false, result: false });
});

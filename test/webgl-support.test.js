import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkWebGL2Support,
  WEBGL2_CONTEXT_NAME,
  WEBGL_SUPPORT_REASONS
} from '../js/webgl-support.js';

function createDocumentWithContext(context) {
  return {
    createElement(tagName) {
      assert.equal(tagName, 'canvas');
      return {
        getContext(name) {
          assert.equal(name, WEBGL2_CONTEXT_NAME);
          return context;
        }
      };
    }
  };
}

test('WebGL 2が作成できるときだけ対応環境と判定する', () => {
  const result = checkWebGL2Support({
    documentObject: createDocumentWithContext({})
  });

  assert.deepEqual(result, {
    available: true,
    reason: WEBGL_SUPPORT_REASONS.AVAILABLE
  });
  assert.equal(Object.isFrozen(result), true);
});

test('WebGL 2が作成できない環境を開始不可と判定する', () => {
  const result = checkWebGL2Support({
    documentObject: createDocumentWithContext(null)
  });

  assert.deepEqual(result, {
    available: false,
    reason: WEBGL_SUPPORT_REASONS.CONTEXT_UNAVAILABLE
  });
});

test('描画機能の検査で例外が出てもゲームを開始不可と判定する', () => {
  const result = checkWebGL2Support({
    documentObject: {
      createElement() {
        return {
          getContext() {
            throw new Error('context denied');
          }
        };
      }
    }
  });

  assert.deepEqual(result, {
    available: false,
    reason: WEBGL_SUPPORT_REASONS.CONTEXT_ERROR
  });
});

test('キャンバスや文書を作れない環境を安全に扱う', () => {
  assert.deepEqual(
    checkWebGL2Support({ documentObject: null }),
    {
      available: false,
      reason: WEBGL_SUPPORT_REASONS.DOCUMENT_UNAVAILABLE
    }
  );

  assert.deepEqual(
    checkWebGL2Support({
      documentObject: { createElement: () => ({}) }
    }),
    {
      available: false,
      reason: WEBGL_SUPPORT_REASONS.CANVAS_UNAVAILABLE
    }
  );
});

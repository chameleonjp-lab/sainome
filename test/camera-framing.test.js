import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CAMERA_POSITION,
  MIN_BOARD_VIEW_WIDTH,
  calculateCameraFrustum,
  getProjectedBoardWidth
} from '../js/camera-framing.js';

test('カメラの水平位置を対称にして盤面の向きをそろえる', () => {
  assert.equal(CAMERA_POSITION.x, CAMERA_POSITION.z);
});

test('縦長の実機画像と同じ比率でも盤面全幅と余白を収める', () => {
  const frustum = calculateCameraFrustum(663, 930);

  assert.ok(frustum.viewWidth >= MIN_BOARD_VIEW_WIDTH);
  assert.ok(frustum.viewWidth > getProjectedBoardWidth());
  assert.equal(frustum.left, -frustum.right);
  assert.equal(frustum.bottom, -frustum.top);
});

test('iPhone SE相当の狭い縦画面でも盤面全幅を収める', () => {
  const frustum = calculateCameraFrustum(320, 480);

  assert.ok(frustum.viewWidth >= MIN_BOARD_VIEW_WIDTH);
  assert.ok(frustum.viewHeight >= 9.2);
  assert.ok(Math.abs(frustum.viewWidth / frustum.viewHeight - 320 / 480) < 1e-12);
});

test('十分に横長な画面では従来の高さを保つ', () => {
  const frustum = calculateCameraFrustum(1200, 600);

  assert.equal(frustum.viewHeight, 8.2);
  assert.equal(frustum.viewWidth, 16.4);
});

test('不正な寸法でも有限の撮影範囲を返す', () => {
  const frustum = calculateCameraFrustum(0, Number.NaN);

  for (const value of Object.values(frustum)) assert.ok(Number.isFinite(value));
  assert.ok(frustum.viewWidth >= MIN_BOARD_VIEW_WIDTH);
});

test('WebGL画面が共通の盤面寸法と撮影範囲を使う', () => {
  const source = readFileSync(new URL('../js/webgl-game.js', import.meta.url), 'utf8');

  assert.match(source, /BOARD_BASE_SIZE/);
  assert.match(source, /calculateCameraFrustum\(width, height\)/);
  assert.doesNotMatch(source, /const viewHeight = aspect < 0\.9 \? 9\.2 : 8\.2/);
});

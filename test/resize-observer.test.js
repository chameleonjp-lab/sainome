import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/webgl-game.js', import.meta.url), 'utf8');
function method(name, window) {
  const body = source.match(new RegExp(`  ${name}\\(\\) \\{([\\s\\S]*?)\\n  \\}`))?.[1];
  assert.ok(body, `${name} must exist`);
  return new Function('window', `return function () {${body}}`)(window);
}
test('resize notifications coalesce outside the observer delivery and can schedule again', () => {
  let callback; let requests = 0; let resized = 0;
  const window = { requestAnimationFrame(fn) { callback = fn; requests++; return requests; } };
  const state = { resizeFrameId: null, resize() { resized++; } };
  const schedule = method('scheduleResize', window).bind(state);
  schedule(); schedule();
  assert.equal(requests, 1); assert.equal(resized, 0);
  callback(); assert.equal(resized, 1); assert.equal(state.resizeFrameId, null);
  schedule(); assert.equal(requests, 2);
  state.resizeDisposed = true; callback(); schedule();
  assert.equal(resized, 1); assert.equal(requests, 2);
  assert.match(source, /new ResizeObserver\(\(\) => this\.scheduleResize\(\)\)/);
});
test('disposing cancels pending resize before renderer disposal', () => {
  const events = [];
  const noop = () => {};
  const window = { clearTimeout: noop, cancelAnimationFrame(id) { events.push(['cancel', id]); } };
  const dispose = method('dispose', window);
  const state = { renderLoop: { setEnabled: noop, cancel: noop }, animationFrameTasks: new Set(), epoch: 0,
    resizeFrameId: 7, resizeObserver: { disconnect() { events.push(['disconnect']); } },
    canvas: { removeEventListener: noop }, renderer: { dispose() { events.push(['dispose']); } } };
  globalThis.document = { removeEventListener: noop };
  try { dispose.call(state); } finally { delete globalThis.document; }
  assert.equal(state.resizeFrameId, null);
  assert.deepEqual(events, [['disconnect'], ['cancel', 7], ['dispose']]);
});

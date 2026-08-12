import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isReleaseDiagnosticsEnabled,
  RELEASE_DIAGNOSTICS_QUERY,
  RELEASE_DIAGNOSTICS_VALUE
} from '../js/release-diagnostics.js';

test('実機試験用診断は指定したURLパラメータでだけ有効になる', () => {
  const enabledUrl = `https://example.test/?${RELEASE_DIAGNOSTICS_QUERY}=${RELEASE_DIAGNOSTICS_VALUE}`;
  assert.equal(isReleaseDiagnosticsEnabled({ href: enabledUrl }), true);
  assert.equal(isReleaseDiagnosticsEnabled({ href: 'https://example.test/' }), false);
  assert.equal(
    isReleaseDiagnosticsEnabled({ href: `https://example.test/?${RELEASE_DIAGNOSTICS_QUERY}=1` }),
    false
  );
});

test('不正なURLやlocationがない環境では診断を有効にしない', () => {
  assert.equal(isReleaseDiagnosticsEnabled(), false);
  assert.equal(isReleaseDiagnosticsEnabled({ href: 'not a URL' }), false);
  assert.equal(isReleaseDiagnosticsEnabled(null), false);
});

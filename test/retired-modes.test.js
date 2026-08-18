import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const forbidden = [
  '60-seconds',
  '180-seconds',
  'sainome_60_seconds',
  'sainome_180_seconds',
  'sixtySecondSpawnedCount'
];

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

test('公開実装に廃止した60秒・180秒モードを残さない', () => {
  const targets = [
    join(root, 'index.html'),
    ...listFiles(join(root, 'js'))
  ];
  const violations = [];

  for (const path of targets) {
    const source = readFileSync(path, 'utf8');
    for (const token of forbidden) {
      if (source.includes(token)) violations.push(`${path}: ${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test('廃止した60秒版アーカイブをリポジトリへ残さない', () => {
  assert.equal(existsSync(join(root, 'archive', '60-second')), false);
});

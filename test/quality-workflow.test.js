import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/quality.yml', rootUrl), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('品質ワークフローはPRとmain更新でロック済み検査を実行する', () => {
  assert.match(workflow, /^on:\n\s+push:\n\s+pull_request:\n\s+workflow_dispatch:/m);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version: 22\.x/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run check:syntax/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test('構文検査はリポジトリのnpmスクリプトとして再実行できる', () => {
  assert.equal(packageJson.scripts?.['check:syntax'], 'node --check js/*.js');
});

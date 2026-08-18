import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/quality.yml', rootUrl), 'utf8');
const deployWorkflow = readFileSync(
  new URL('.github/workflows/deploy-github-pages.yml', rootUrl),
  'utf8'
);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('品質ワークフローはPRとmain更新でロック済み検査を実行する', () => {
  assert.match(workflow, /^on:\n\s+push:\n\s+pull_request:\n\s+workflow_dispatch:/m);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version: 22\.x/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run check:syntax/);
  assert.match(workflow, /run: npm run check:release-syntax/);
  assert.match(workflow, /SAINOME_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /run: npm run build:pages/);
  assert.match(workflow, /run: npm run verify:pages/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test('構文検査はリポジトリのnpmスクリプトとして再実行できる', () => {
  assert.equal(packageJson.scripts?.['check:syntax'], 'node --check js/*.js');
  assert.equal(packageJson.scripts?.['check:release-syntax'], 'node --check scripts/*.js');
});

test('Pages公開は同じコミットで生成・検査した_siteだけを配信する', () => {
  assert.match(deployWorkflow, /run: npm run check:release-syntax/);
  assert.match(deployWorkflow, /SAINOME_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /run: npm run build:pages/);
  assert.match(deployWorkflow, /run: npm run verify:pages/);
  assert.match(deployWorkflow, /uses: actions\/upload-pages-artifact@v4\n\s+with:\n\s+path: _site/);
  assert.doesNotMatch(deployWorkflow, /uses: actions\/upload-pages-artifact@v4\n\s+with:\n\s+path: \./);
});

test('公開物の生成と検査は明示したnpmスクリプトから実行できる', () => {
  assert.equal(
    packageJson.scripts?.['build:pages'],
    'node scripts/prepare-github-pages.js'
  );
  assert.equal(
    packageJson.scripts?.['verify:pages'],
    'node scripts/verify-github-pages.js'
  );
});

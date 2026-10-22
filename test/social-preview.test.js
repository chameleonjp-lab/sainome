import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const gameUrl = 'https://chameleonjp-lab.github.io/sainome/';
const imageUrl = new URL('assets/sainome-ogp.jpg', gameUrl).href;

function metadata(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1] ?? '';
  const values = new Map();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)="([^"]*)"/gu)].map((match) => [match[1], match[2]])
    );
    values.set(attributes.property ?? attributes.name, attributes.content);
  }
  return values;
}

function assertPreview(html) {
  const meta = metadata(html);
  assert.equal(meta.get('og:url'), gameUrl, 'Crawler must receive the public game URL');
  assert.equal(meta.get('og:type'), 'website');
  assert.equal(meta.get('og:title'), 'サイノメ');
  assert.match(meta.get('og:description') ?? '', /300秒/u);
  assert.equal(meta.get('og:image'), imageUrl, 'OG image must be an absolute public URL');
  assert.equal(meta.get('og:image:type'), 'image/jpeg');
  assert.equal(meta.get('og:image:width'), '1280');
  assert.equal(meta.get('og:image:height'), '672');
  assert.ok(meta.get('og:image:alt'));
  assert.equal(meta.get('twitter:card'), 'summary_large_image');
  assert.equal(meta.get('twitter:title'), meta.get('og:title'));
  assert.equal(meta.get('twitter:description'), meta.get('og:description'));
  assert.equal(meta.get('twitter:image'), imageUrl);
  assert.equal(meta.get('twitter:image:alt'), meta.get('og:image:alt'));
}

function runScript(script, cwd) {
  return spawnSync(process.execPath, [join(root, 'scripts', script)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SAINOME_RELEASE: 'social-preview-test' }
  });
}

test('URL・ゲーム・結果共有のページはJavaScriptなしでSNS画像を指定する', () => {
  assertPreview(readFileSync(join(root, 'index.html'), 'utf8'));
});

test('Pagesの公開物にSNS画像を同梱し、欠落や画像指定の破損を公開前に検出する', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'sainome-social-preview-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const path of ['index.html', 'css', 'js', 'assets']) {
    cpSync(join(root, path), join(directory, path), { recursive: true });
  }

  const build = runScript('prepare-github-pages.js', directory);
  assert.equal(build.status, 0, build.stderr);
  const htmlPath = join(directory, '_site', 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assertPreview(html);

  const imagePath = join(directory, '_site', 'assets', 'sainome-ogp.jpg');
  const image = readFileSync(imagePath);
  assert.deepEqual(image, readFileSync(join(root, 'assets', 'sainome-ogp.jpg')));
  assert.equal(image.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.equal(image.subarray(-2).toString('hex'), 'ffd9');

  const verified = runScript('verify-github-pages.js', directory);
  assert.equal(verified.status, 0, verified.stderr);

  for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
    writeFileSync(htmlPath, html.replace(
      `${attribute} content="${imageUrl}"`,
      `${attribute} content="https://example.com/missing.png"`
    ));
    const brokenMetadata = runScript('verify-github-pages.js', directory);
    assert.notEqual(brokenMetadata.status, 0, `${attribute} must be checked before publishing`);
    assert.match(brokenMetadata.stderr, /social|preview|image/iu);
  }

  writeFileSync(htmlPath, html);
  rmSync(imagePath);
  const missingImage = runScript('verify-github-pages.js', directory);
  assert.notEqual(missingImage.status, 0, 'A missing thumbnail must fail release verification');
  assert.match(missingImage.stderr, /sainome-ogp\.jpg/u);
});

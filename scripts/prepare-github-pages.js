import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCommitSha, resolveReleaseId } from './release-id.js';

const root = process.cwd();
const out = join(root, '_site');
const release = resolveReleaseId();
const commit = resolveCommitSha();

const STATIC_LOCAL_JS = /((?:from\s*|import\s*)["'])(\.{1,2}\/[^"'?#]+\.js)(?:\?v=[^"'#]*)?(["'])/gu;
const DYNAMIC_LOCAL_JS = /(import\(\s*["'])(\.{1,2}\/[^"'?#]+\.js)(?:\?v=[^"'#]*)?(["']\s*\))/gu;

async function copy(path) {
  await cp(join(root, path), join(out, path), { recursive: true });
}

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Required release marker was not found: ${label}`);
  }
  return source.replace(pattern, replacement);
}

function versionLocalModuleSpecifiers(source) {
  const version = `?v=${release}`;
  return source
    .replace(STATIC_LOCAL_JS, (_match, prefix, specifier, suffix) => (
      `${prefix}${specifier}${version}${suffix}`
    ))
    .replace(DYNAMIC_LOCAL_JS, (_match, prefix, specifier, suffix) => (
      `${prefix}${specifier}${version}${suffix}`
    ));
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copy('index.html');
await copy('css');
await copy('js');

const indexPath = join(out, 'index.html');
let indexHtml = await readFile(indexPath, 'utf8');
indexHtml = replaceRequired(
  indexHtml,
  /<meta name="sainome-release" content="[^"]*">/u,
  `<meta name="sainome-release" content="${release}">`,
  'release meta'
);
indexHtml = replaceRequired(
  indexHtml,
  /<link rel="stylesheet" href="\.\/css\/style\.css(?:\?v=[^"]*)?">/u,
  `<link rel="stylesheet" href="./css/style.css?v=${release}">`,
  'stylesheet release query'
);
indexHtml = replaceRequired(
  indexHtml,
  /<script type="module" src="\.\/js\/ranking-status-ui\.js(?:\?v=[^"]*)?"><\/script>/u,
  `<script type="module" src="./js/ranking-status-ui.js?v=${release}"></script>`,
  'ranking status module release query'
);
indexHtml = replaceRequired(
  indexHtml,
  /<script type="module" src="\.\/js\/main\.js(?:\?v=[^"]*)?"><\/script>/u,
  `<script type="module" src="./js/main.js?v=${release}"></script>`,
  'main module release query'
);
await writeFile(indexPath, indexHtml, 'utf8');

for (const file of await listJavaScriptFiles(join(out, 'js'))) {
  const source = await readFile(file, 'utf8');
  await writeFile(file, versionLocalModuleSpecifiers(source), 'utf8');
}

await writeFile(
  join(out, 'release.json'),
  `${JSON.stringify({ release, commit }, null, 2)}\n`,
  'utf8'
);

console.log(`Prepared GitHub Pages release ${release}`);

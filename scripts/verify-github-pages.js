import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { resolveCommitSha, resolveReleaseId } from './release-id.js';

const root = process.cwd();
const out = join(root, '_site');
const release = resolveReleaseId();
const commit = resolveCommitSha();
const version = `?v=${release}`;

const STATIC_LOCAL_JS = /(?:from\s*|import\s*)["'](\.{1,2}\/[^"'?#]+\.js(?:\?v=[^"'#]*)?)["']/gu;
const DYNAMIC_LOCAL_JS = /import\(\s*["'](\.{1,2}\/[^"'?#]+\.js(?:\?v=[^"'#]*)?)["']\s*\)/gu;

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

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`Release verification failed: ${label}`);
  }
}

function collectLocalSpecifiers(source) {
  const specifiers = [];
  for (const pattern of [STATIC_LOCAL_JS, DYNAMIC_LOCAL_JS]) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

const indexHtml = await readFile(join(out, 'index.html'), 'utf8');
requireText(indexHtml, `<meta name="sainome-release" content="${release}">`, 'release meta');
requireText(indexHtml, `./css/style.css?v=${release}`, 'stylesheet version');
requireText(indexHtml, `./js/main.js?v=${release}`, 'main module version');

const releaseInfo = JSON.parse(await readFile(join(out, 'release.json'), 'utf8'));
if (releaseInfo.release !== release || releaseInfo.commit !== commit) {
  throw new Error('Release verification failed: release.json does not match the build input');
}

let localImportCount = 0;
const siteRoot = resolve(out);
for (const file of await listJavaScriptFiles(join(out, 'js'))) {
  const source = await readFile(file, 'utf8');
  for (const specifier of collectLocalSpecifiers(source)) {
    localImportCount += 1;
    if (!specifier.endsWith(version)) {
      throw new Error(`Unversioned local module import in ${file}: ${specifier}`);
    }

    const targetPath = specifier.slice(0, -version.length);
    const target = resolve(dirname(file), targetPath);
    if (target !== siteRoot && !target.startsWith(`${siteRoot}${sep}`)) {
      throw new Error(`Local module escapes release directory: ${specifier}`);
    }
    await access(target);
  }
}

if (localImportCount === 0) {
  throw new Error('Release verification failed: no local JavaScript imports were inspected');
}

const mainJs = await readFile(join(out, 'js', 'main.js'), 'utf8');
requireText(mainJs, `from './ranking-client.js?v=${release}'`, 'ranking client is versioned');
requireText(mainJs, `from './ranking-submission-flow.js?v=${release}'`, 'ranking submission flow is versioned');
requireText(mainJs, `from './pending-ranking-submissions.js?v=${release}'`, 'pending ranking storage is versioned');
requireText(mainJs, `import('./webgl-game.js?v=${release}')`, 'dynamic WebGL module is versioned');

const rankingClient = await readFile(join(out, 'js', 'ranking-client.js'), 'utf8');
requireText(rankingClient, "#rpc('record_game_play'", 'play start RPC');
requireText(rankingClient, "#rpc('submit_score'", 'score submit RPC');
requireText(rankingClient, "#rpc('get_best_score_ranking'", 'ranking read RPC');

console.log(`Verified GitHub Pages release ${release}: ${localImportCount} local module imports`);

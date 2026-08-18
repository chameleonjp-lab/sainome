import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RELEASE = '20260818-edge-ranking-v1';
const root = process.cwd();
const out = join(root, '_site');

async function copy(path) {
  const from = join(root, path);
  const to = join(out, path);
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

async function replaceRequired(path, replacements) {
  const file = join(out, path);
  let text = await readFile(file, 'utf8');
  for (const [from, to, label] of replacements) {
    if (!text.includes(from)) {
      throw new Error(`Required release transform was not found: ${label}`);
    }
    text = text.replaceAll(from, to);
  }
  await writeFile(file, text, 'utf8');
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copy('index.html');
await copy('css');
await copy('js');

await replaceRequired('index.html', [
  ['20260818-ranking-submit-retry', RELEASE, 'release token'],
]);

const rankingClientVersioned = `./ranking-client.js?v=${RELEASE}`;
const edgeRankingClientVersioned = `./ranking-edge-client.js?v=${RELEASE}`;

await replaceRequired('js/main.js', [
  ["} from './ranking-client.js';", `} from '${edgeRankingClientVersioned}';`, 'main edge ranking-client import'],
  ["} from './pending-ranking-submissions.js';", `} from './pending-ranking-submissions.js?v=${RELEASE}';`, 'main pending-ranking import'],
  ["} from './ranking-submission-flow.js';", `} from './ranking-submission-flow.js?v=${RELEASE}';`, 'main submission-flow import'],
  [
    "function setResultRankingRetryAction(action, label = '') {\n  resultRankingRetryAction = action;\n  resultRankingRetry.hidden = !action;\n  if (label) resultRankingRetry.textContent = label;\n}",
    "function setResultRankingRetryAction(action, label = '') {\n  resultRankingRetryAction = action;\n  resultRankingRetry.hidden = !action;\n  if (action) resultRankingRetry.disabled = false;\n  if (label) resultRankingRetry.textContent = label;\n}",
    'retry button enable'
  ],
  [
    'if (submission.canSubmit === false) {',
    'if (false && submission.canSubmit === false) {',
    'do not suppress direct network submit'
  ],
  [
    "resultRankingRetryAction === 'submit'\n    && latestRankingSubmission.canSubmit !== false\n    && !latestRankingSubmission.acceptedOutcome",
    "resultRankingRetryAction === 'submit'\n    && !latestRankingSubmission.acceptedOutcome",
    'retry blocked by canSubmit'
  ],
  [
    "  } else if (\n    resultRankingRetryAction === 'submit'\n    && !latestRankingSubmission.acceptedOutcome\n  ) {\n    void syncResultRanking(latestRankingSubmission);\n  }",
    "  } else if (\n    resultRankingRetryAction === 'submit'\n    && !latestRankingSubmission.acceptedOutcome\n  ) {\n    resultRankingRetry.disabled = true;\n    resultRankingRetry.textContent = '再送中…';\n    resultRankingStatus.textContent = '記録を再送しています…';\n    void syncResultRanking(latestRankingSubmission);\n  }",
    'retry visual feedback'
  ],
  [
    "      ? 'ランキングは表示しましたが、今回の記録を送信できませんでした'\n      : '記録を送信できませんでした。通信状態を確認してください';",
    "      ? `ランキングは表示しましたが、今回の記録を送信できませんでした（${submitError?.message ?? '原因不明'}）`\n      : `記録を送信できませんでした（${submitError?.message ?? '原因不明'}）`;",
    'show concrete submit failure'
  ]
]);

await replaceRequired('js/ranking-submission-flow.js', [
  ["} from './ranking-client.js';", `} from '${rankingClientVersioned}';`, 'submission-flow ranking-client import']
]);

await replaceRequired('js/pending-ranking-submissions.js', [
  ["} from './ranking-client.js';", `} from '${rankingClientVersioned}';`, 'pending ranking-client import']
]);

await replaceRequired('js/ranking-edge-client.js', [
  ["} from './ranking-client.js';", `} from '${rankingClientVersioned}';`, 'edge client base import']
]);

console.log(`Prepared GitHub Pages release ${RELEASE}`);

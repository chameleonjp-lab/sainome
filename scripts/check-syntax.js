import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await checkDirectory(path);
    else if (entry.name.endsWith('.js')) {
      const checked = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (checked.error || checked.status !== 0) process.exit(checked.status || 1);
    }
  }
}
for (const directory of process.argv.slice(2)) await checkDirectory(directory);

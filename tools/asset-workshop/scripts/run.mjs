import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { workshopRoot } from './paths.mjs';

export function runNpm(args) {
  // Invoke npm's JS entry directly so Windows paths with spaces never enter a shell.
  const npmCli = [
    process.env.npm_execpath,
    resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js',
  ].find((candidate) => candidate && existsSync(candidate));
  if (!npmCli && process.platform === 'win32') throw new Error('Cannot locate npm CLI beside Node. Run via npm run reproduce.');
  const result = spawnSync(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, {
    cwd: workshopRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} exited with ${result.status}`);
}

export function runLocal(relativeScript, args = []) {
  const result = spawnSync(process.execPath, [relativeScript, ...args], {
    cwd: workshopRoot, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${relativeScript} exited with ${result.status}`);
}

import { runNpm, runLocal } from './run.mjs';
import { outputArgument } from './paths.mjs';

const output = outputArgument();
runNpm(['run', 'generate']);
runLocal('node_modules/vite/bin/vite.js', ['build', '--outDir', output]);
runLocal('scripts/pack.mjs', ['--out-dir', output]);

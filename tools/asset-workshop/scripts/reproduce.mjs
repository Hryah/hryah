import { runNpm } from './run.mjs';

// Works from a fresh clone with only Node/npm installed, regardless of the current directory.
runNpm(['ci']);
runNpm(['run', 'check']);
runNpm(['run', 'snapshot']);

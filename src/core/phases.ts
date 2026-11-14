// phases.ts — ЄДИНЕ місце, де заглушка замінюється справжньою частиною.
// Група, що здала свою частину, міняє тут один рядок, наприклад:
//   export { orbitPhase } from './orbit';
// Решта коду (склейка, дебаг-екран, тести) підхопить нові типи стану й дій сама.

import { stubDesignPhase, stubFlightPhase, stubOrbitPhase } from './stub-phases';

export const designPhase = stubDesignPhase;
export const flightPhase = stubFlightPhase;
export const orbitPhase = stubOrbitPhase;

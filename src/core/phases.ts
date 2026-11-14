// phases.ts — ЄДИНЕ місце, де заглушка замінюється справжньою частиною.
// Група, що здала свою частину, міняє тут один рядок, наприклад:
//   export { orbitPhase } from './orbit';
// Решта коду (склейка, дебаг-екран, тести) підхопить нові типи стану й дій сама.

export { designPhase } from './design';
export { flightPhase } from './flight';
export { orbitPhase } from './orbit';

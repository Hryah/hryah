// stub-phases.ts — заглушки у формі Phase, щоб склейка (game.ts) працювала з ними
// так само, як зі справжніми частинами. Розрахунки беруться зі stubs.ts.

import type {
  DebugAction, Design, DesignInput, DesignPhase, FlightInput, FlightPhase, OrbitInput, OrbitPhase, SlotId,
} from './contracts';
import { SAMPLE_DESIGN, stubDesign, stubFlight, stubOrbit } from './stubs';

// ───────────────────────── Частина 1: вибір без графіки ─────────────────────────

export interface StubDesignState {
  input: DesignInput;
  design: Design;
  confirmed: boolean;
}

export type StubDesignAction =
  | { type: 'setModule'; slot: SlotId; moduleId: string }
  | { type: 'setFuel'; fuelKg: number }
  | { type: 'setAlt'; altKm: number }
  | { type: 'setLauncher'; launcherId: string }
  | { type: 'confirm' };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const stubDesignPhase: DesignPhase<StubDesignState, StubDesignAction> = {
  init: (input) => ({ input, design: SAMPLE_DESIGN, confirmed: false }),

  step(state, action) {
    if (state.confirmed) return state; // після підтвердження проєкт заморожений
    const { design } = state;
    switch (action.type) {
      case 'setModule':
        return { ...state, design: { ...design, modules: { ...design.modules, [action.slot]: action.moduleId } } };
      case 'setFuel':
        return { ...state, design: { ...design, fuelKg: Math.max(0, action.fuelKg) } };
      case 'setAlt': {
        const [lo, hi] = state.input.mission.altRangeKm;
        return { ...state, design: { ...design, altKm: clamp(action.altKm, lo, hi) } };
      }
      case 'setLauncher':
        return { ...state, design: { ...design, launcherId: action.launcherId } };
      case 'confirm':
        return { ...state, confirmed: true };
    }
  },

  isDone: (state) => state.confirmed,

  // finish чиста, тому її можна викликати будь-коли як попередній перегляд запасів.
  finish: (state) => stubDesign(state.input, state.design),

  debugActions(state) {
    const { mission, catalog } = state.input;
    const { design } = state;
    const mark = (on: boolean, text: string) => (on ? `● ${text}` : text);
    const actions: DebugAction<StubDesignAction>[] = catalog.modules.map((m) => ({
      group: m.slot,
      label: mark(design.modules[m.slot] === m.id, m.id),
      action: { type: 'setModule', slot: m.slot, moduleId: m.id },
    }));
    for (const l of mission.launchers) {
      actions.push({
        group: 'launcher',
        label: mark(design.launcherId === l.id, `${l.id} (${l.maxPayloadKg} kg)`),
        action: { type: 'setLauncher', launcherId: l.id },
      });
    }
    actions.push(
      { group: `fuel: ${design.fuelKg} kg`, label: '−2', action: { type: 'setFuel', fuelKg: design.fuelKg - 2 } },
      { group: `fuel: ${design.fuelKg} kg`, label: '+2', action: { type: 'setFuel', fuelKg: design.fuelKg + 2 } },
      { group: `orbit: ${design.altKm} km`, label: '−50', action: { type: 'setAlt', altKm: design.altKm - 50 } },
      { group: `orbit: ${design.altKm} km`, label: '+50', action: { type: 'setAlt', altKm: design.altKm + 50 } },
      { group: 'go', label: 'Запуск', action: { type: 'confirm' } },
    );
    return actions;
  },
};

// ───────────────────────── Частини 2 і 3: одна кнопка «далі» ─────────────────────────
// Геймплею тут нема: результат рахується формулою. Справжні частини замінять ці об'єкти.

export interface StubFlightState { input: FlightInput; done: boolean }
export interface StubOrbitState { input: OrbitInput; done: boolean }
export type ContinueAction = { type: 'continue' };

export const stubFlightPhase: FlightPhase<StubFlightState, ContinueAction> = {
  init: (input) => ({ input, done: false }),
  step: (state) => ({ ...state, done: true }),
  isDone: (state) => state.done,
  finish: (state) => stubFlight(state.input),
  debugActions: () => [{ group: 'go', label: 'Пролетіти (заглушка)', action: { type: 'continue' } }],
};

export const stubOrbitPhase: OrbitPhase<StubOrbitState, ContinueAction> = {
  init: (input) => ({ input, done: false }),
  step: (state) => ({ ...state, done: true }),
  isDone: (state) => state.done,
  finish: (state) => stubOrbit(state.input),
  debugActions: () => [{ group: 'go', label: 'Відпрацювати орбіту (заглушка)', action: { type: 'continue' } }],
};

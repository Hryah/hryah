// Частина 1: проєктування. Гравець збирає апарат, а запаси (dv, energy, link, science, mass, budget)
// перераховуються після кожної дії. Формули апарата лежать у model/ (buildSpec): їх читають частини 2 і 3
// та перебір балансу, тож рахуємо тим самим кодом, щоб цифри не розійшлись.
//
// Правила, які тримає ця частина:
//   - mass і budget жорсткі: з червоним запасом запуск неможливий (так само рахує sim.ts, поле launchable);
//   - dv, energy, link, science м'які: запустити можна, але далі це вилізе проблемами в польоті й на орбіті.
//     Саме про такі рішення розбір і розповідає, тому вони потрапляють у журнал як warning.

import type {
  CauseEntry, DebugAction, Design, DesignInput, DesignPhase, MarginId, ModuleDef, SlotId, SystemId,
} from '../contracts';
import { buildSpec } from '../model';

export interface DesignState {
  input: DesignInput;
  design: Design;
  confirmed: boolean;
}

// Назви дій збігаються з заглушкою: на них розраховані game.test.ts і боти.
export type DesignAction =
  | { type: 'setModule'; slot: SlotId; moduleId: string }
  | { type: 'setFuel'; fuelKg: number }
  | { type: 'setAlt'; altKm: number }
  | { type: 'setLauncher'; launcherId: string }
  | { type: 'confirm' };

export const SLOTS: SlotId[] = ['engine', 'solar', 'battery', 'antenna', 'instrument'];

// Скільки палива в стартовому проєкті. Це лише відправна точка, гравець її міняє.
export const START_FUEL_KG = 12;
const FUEL_STEP_KG = 2;
const ALT_STEP_KM = 50;

// Запас, що блокує запуск.
const HARD_MARGINS: MarginId[] = ['mass', 'budget'];

const MARGIN_SYSTEM: Record<MarginId, SystemId> = {
  dv: 'propulsion', energy: 'power', link: 'comms', science: 'science', mass: 'structure', budget: 'structure',
};

const MODULE_DECISIONS = SLOTS.map((slot) => `design:${slot}`);

// Які рішення гравця стоять за кожним запасом (id записів журналу).
const MARGIN_CAUSES: Record<MarginId, string[]> = {
  dv: ['design:fuel', ...MODULE_DECISIONS],
  energy: ['design:battery', 'design:solar', 'design:instrument', 'design:antenna', 'design:altitude'],
  link: ['design:antenna', 'design:instrument'],
  science: ['design:instrument', 'design:altitude'],
  mass: ['design:launcher', 'design:fuel', ...MODULE_DECISIONS],
  budget: ['design:launcher', ...MODULE_DECISIONS],
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

function modulesOf(input: DesignInput, slot: SlotId): ModuleDef[] {
  return input.catalog.modules.filter((m) => m.slot === slot);
}

// Стартовий проєкт: середній модуль у кожному слоті, найменший носій, найнижча орбіта.
// «Середній» дає робочий, але не найкращий апарат: є що покращувати й де зекономити.
export function startDesign(input: DesignInput): Design {
  const modules = {} as Record<SlotId, string>;
  for (const slot of SLOTS) {
    const options = modulesOf(input, slot);
    const middle = options[Math.floor(options.length / 2)];
    if (!middle) throw new Error(`У каталозі немає жодного модуля для слота ${slot}`);
    modules[slot] = middle.id;
  }
  const launcher = [...input.mission.launchers].sort((a, b) => a.maxPayloadKg - b.maxPayloadKg)[0];
  if (!launcher) throw new Error('У місії немає жодного носія');
  return {
    modules,
    fuelKg: START_FUEL_KG,
    altKm: input.mission.altRangeKm[0],
    launcherId: launcher.id,
  };
}

// Які запаси зараз червоні й заважають запуску. Порожній список означає, що запускати можна.
export function launchBlockers(state: DesignState): MarginId[] {
  return buildSpec(state.input, state.design).result.margins
    .filter((m) => !m.ok && HARD_MARGINS.includes(m.id))
    .map((m) => m.id);
}

// Який елемент керування чіпає дія: слот, пальне, висота чи носій. Для розкладу змін за хід (див. консорціум).
export function controlOf(action: DesignAction): string | null {
  switch (action.type) {
    case 'setModule': return `slot:${action.slot}`;
    case 'setFuel': return 'fuel';
    case 'setAlt': return 'alt';
    case 'setLauncher': return 'launcher';
    case 'confirm': return null;
  }
}

export const designPhase: DesignPhase<DesignState, DesignAction> = {
  init: (input) => ({ input, design: startDesign(input), confirmed: false }),

  step(state, action) {
    if (state.confirmed) return state; // після запуску проєкт заморожений
    const { design, input } = state;
    const { mission, catalog } = input;

    switch (action.type) {
      case 'setModule': {
        const exists = catalog.modules.some((m) => m.slot === action.slot && m.id === action.moduleId);
        if (!exists || design.modules[action.slot] === action.moduleId) return state;
        return { ...state, design: { ...design, modules: { ...design.modules, [action.slot]: action.moduleId } } };
      }
      case 'setFuel': {
        if (!Number.isFinite(action.fuelKg)) return state;
        const maxKg = Math.max(0, ...mission.launchers.map((l) => l.maxPayloadKg));
        const fuelKg = clamp(action.fuelKg, 0, maxKg);
        return fuelKg === design.fuelKg ? state : { ...state, design: { ...design, fuelKg } };
      }
      case 'setAlt': {
        if (!Number.isFinite(action.altKm)) return state;
        const [lo, hi] = mission.altRangeKm;
        const altKm = clamp(action.altKm, lo, hi);
        return altKm === design.altKm ? state : { ...state, design: { ...design, altKm } };
      }
      case 'setLauncher': {
        if (!mission.launchers.some((l) => l.id === action.launcherId) || design.launcherId === action.launcherId) return state;
        return { ...state, design: { ...design, launcherId: action.launcherId } };
      }
      case 'confirm':
        return launchBlockers(state).length === 0 ? { ...state, confirmed: true } : state;
    }
  },

  isDone: (state) => state.confirmed,

  // finish чиста, тож її можна викликати будь-коли як попередній перегляд запасів.
  finish(state) {
    const { result, log } = buildSpec(state.input, state.design);
    const { design } = state;

    // Рішення, які buildSpec не записує: пальне, висота, носій.
    const extra: CauseEntry[] = [
      { id: 'design:fuel', phase: 'design', tS: 0, kind: 'decision', system: 'propulsion',
        messageKey: 'design.fuel', params: { fuelKg: design.fuelKg } },
      { id: 'design:altitude', phase: 'design', tS: 0, kind: 'decision', system: 'science',
        messageKey: 'design.altitude', params: { altKm: design.altKm } },
      { id: 'design:launcher', phase: 'design', tS: 0, kind: 'decision', system: 'structure',
        messageKey: 'design.launcher', params: { launcherId: design.launcherId } },
    ];

    // Червоний запас, з яким гравець усе одно полетів: розбір покаже, що це було видно ще на Землі.
    const warnings: CauseEntry[] = result.margins
      .filter((m) => !m.ok)
      .map((m) => ({
        id: `design:margin-${m.id}`, phase: 'design', tS: 0, kind: 'warning', system: MARGIN_SYSTEM[m.id],
        messageKey: 'design.marginRed',
        params: { margin: m.id, have: round2(m.have), need: round2(m.need) },
        causedBy: MARGIN_CAUSES[m.id],
      }));

    return { result, log: [...log, ...extra, ...warnings] };
  },

  debugActions(state) {
    const { mission, catalog } = state.input;
    const { design } = state;
    const mark = (on: boolean, text: string) => (on ? `● ${text}` : text);
    const actions: DebugAction<DesignAction>[] = catalog.modules.map((m) => ({
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
    const blockers = launchBlockers(state);
    actions.push(
      { group: `fuel: ${design.fuelKg} kg`, label: `−${FUEL_STEP_KG}`, action: { type: 'setFuel', fuelKg: design.fuelKg - FUEL_STEP_KG } },
      { group: `fuel: ${design.fuelKg} kg`, label: `+${FUEL_STEP_KG}`, action: { type: 'setFuel', fuelKg: design.fuelKg + FUEL_STEP_KG } },
      { group: `orbit: ${design.altKm} km`, label: `−${ALT_STEP_KM}`, action: { type: 'setAlt', altKm: design.altKm - ALT_STEP_KM } },
      { group: `orbit: ${design.altKm} km`, label: `+${ALT_STEP_KM}`, action: { type: 'setAlt', altKm: design.altKm + ALT_STEP_KM } },
      // Остання дія в списку завжди «Запуск»: на цьому тримається бот у game.test.ts.
      {
        group: 'go',
        label: blockers.length === 0 ? 'Запуск' : `Запуск (заблоковано: ${blockers.join(', ')})`,
        action: { type: 'confirm' },
      },
    );
    return actions;
  },
};

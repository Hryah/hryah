import { describe, expect, it } from "vitest";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import type { AgencyProfile } from "../design/agency";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../stubs";
import { nextRandom } from "../physics";
import { newConsortium, stepConsortium, type ConsortiumAction, type ConsortiumState } from "./session";
import type { Market } from "./market";

const agencies = Object.values(agenciesData) as AgencyProfile[];
const base = { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG };

function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}

// Випадкова дія з усіх, що дозволяє тип: у тому числі абсурдні значення.
function randomAction(state: ConsortiumState, r: () => number): ConsortiumAction {
  const entry = state.agencies[state.active];
  const mods = SAMPLE_CATALOG.modules;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const kind = Math.floor(r() * 9);
  switch (kind) {
    case 0: { const m = pick(mods); return { type: "design", action: { type: "setModule", slot: m.slot, moduleId: m.id } }; }
    case 1: return { type: "design", action: { type: "setFuel", fuelKg: pick([-5, 0, 3, 12, 30, 1e9, NaN, Infinity]) } };
    case 2: return { type: "design", action: { type: "setAlt", altKm: pick([-1, 100, 400, 650, 2000, NaN]) } };
    case 3: return { type: "design", action: { type: "setLauncher", launcherId: pick(["small", "medium", "heavy", "nope"]) } };
    case 4: return { type: "develop", order: { slot: "instrument", apertureM: pick([0.05, 0.1, 0.3, 0.5, 0.9, NaN, -1]), inspect: r() < 0.5 } };
    case 5: return { type: "launch" };
    case 6: case 7: return { type: "wait" };
    default: return { type: "design", action: { type: "confirm" } };
  }
  void entry;
}

describe("фаз-тест консорціуму: випадкові дії", () => {
  it("жодна послідовність не кидає помилок, стан лишається JSON, вхідний стан не мутується", () => {
    for (let seed = 1; seed <= 150; seed++) {
      let rs = seed * 7919;
      const r = () => { const [v, n] = nextRandom(rs); rs = n; return v; };
      const chosen = agencies.filter(() => r() < 0.7);
      let s = newConsortium(base, marketData as Market, chosen.length ? chosen : [agencies[0]!], 12, seed);
      for (let i = 0; i < 300 && !s.result; i++) {
        const frozen = freeze(JSON.parse(JSON.stringify(s)) as ConsortiumState);
        const before = JSON.stringify(frozen);
        const next = stepConsortium(frozen, randomAction(s, r));
        expect(JSON.stringify(frozen)).toBe(before);
        expect(JSON.parse(JSON.stringify(next))).toEqual(next);
        for (const e of next.agencies) {
          expect(e.actionsLeft).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(e.design.input.mission.budgetMUsd)).toBe(true);
          expect(e.design.input.mission.budgetMUsd).toBeGreaterThan(0);
        }
        s = next;
      }
      if (s.result) {
        const pay = s.result.settlement.payouts.reduce((a, p) => a + p.payoutMUsd, 0);
        expect(pay).toBeCloseTo(s.result.settlement.poolMUsd, 1);
        for (const run of s.result.runs) {
          const ids = new Set(run.log.map((e) => e.id));
          for (const e of run.log) {
            if (e.kind === "failure") expect(e.causedBy?.length ?? 0).toBeGreaterThan(0);
            for (const c of e.causedBy ?? []) expect(ids.has(c), `${seed}: ${c}`).toBe(true);
          }
        }
      }
    }
  }, 120000);
});

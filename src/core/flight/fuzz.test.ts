import { describe, expect, it } from "vitest";
import { SAMPLE_CATALOG, SAMPLE_DESIGN, SAMPLE_MISSION, stubDesign } from "../stubs";
import { nextRandom } from "../physics";
import { flightPhase, type FlightAction, type FlightState } from "./index";

function walk(v: unknown, path: string, bad: string[]): void {
  if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${path}=${v}`);
  else if (v === undefined) bad.push(`${path}=undefined`);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, bad);
}

describe("фаз-тест частини 2: випадкові дії", () => {
  it("жодна послідовність не кидає помилок і не дає NaN, undefined чи мутації", () => {
    const d = stubDesign({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, SAMPLE_DESIGN);
    const input = { mission: SAMPLE_MISSION, spec: d.result, log: d.log };
    for (let seed = 1; seed <= 40; seed++) {
      let rs = seed * 104729;
      const r = () => { const [v, n] = nextRandom(rs); rs = n; return v; };
      const n = (lo: number, hi: number) => lo + r() * (hi - lo);
      let s: FlightState = flightPhase.init(input, seed);
      for (let i = 0; i < 400 && !flightPhase.isDone(s); i++) {
        const acts = (flightPhase.debugActions?.(s) ?? []).map((a) => a.action);
        const k = Math.floor(r() * 10);
        const a: FlightAction =
          k < 3 ? { type: "tick", dtS: n(0, 0.2) }
          : k === 3 ? { type: "slingshot_start", screenX: n(-500, 1500), screenY: n(-500, 1500) }
          : k === 4 ? { type: "slingshot_move", screenX: n(-500, 1500), screenY: n(-500, 1500) }
          : k === 5 ? { type: "slingshot_release" }
          : k === 6 ? { type: "fire_thruster", dirX: n(-1, 1), dirY: n(-1, 1) }
          : k === 7 ? { type: "slide_along_handle", dirX: n(-1, 1), dirY: n(-1, 1), dtS: n(0, 0.1) }
          : (acts[Math.floor(r() * acts.length)] ?? { type: "tick", dtS: 0.05 });
        const before = JSON.stringify(s);
        const next = flightPhase.step(JSON.parse(before) as FlightState, a);
        const bad: string[] = [];
        walk(next, "s", bad);
        expect(bad.slice(0, 3), `${seed}/${i} ${JSON.stringify(a)}`).toEqual([]);
        s = next;
      }
      const out = flightPhase.finish(s);
      const bad: string[] = [];
      walk(out, "out", bad);
      expect(bad.slice(0, 3)).toEqual([]);
      const ids = new Set([...input.log, ...out.log].map((e) => e.id));
      for (const e of out.log) {
        if (e.kind === "failure") expect(e.causedBy?.length ?? 0).toBeGreaterThan(0);
        for (const c of e.causedBy ?? []) expect(ids.has(c), c).toBe(true);
      }
    }
  }, 120000);
});

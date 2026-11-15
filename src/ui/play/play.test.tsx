import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { availableActions, newGame, step, type GameState } from "../../core/game";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { flightPhase } from "../../core/phases";
import { describeEntry } from "../design/cause";
import { PlayScreen } from "./PlayScreen";

const render = (game: GameState, active = false) => renderToStaticMarkup(<PlayScreen game={game} setGame={() => undefined} active={active} />);

describe("наскрізна гра: екран показує поточну частину", () => {
  it("проєктування → політ → орбіта → розбір, кожна частина має свій екран і підсвічений етап", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    expect(g.phase).toBe("design");
    expect(render(g)).toContain("Launch");

    g = step(g, { phase: "design", action: { type: "confirm" } });
    expect(g.phase).toBe("flight");
    expect(render(g)).toContain("Finish the flight");
    // Канвас польоту займає все вікно (z-index 1000): кнопка завершення лежить у шарі вище й видима, коли екран активний.
    const live = render(g, true);
    expect(live).toContain("<canvas");
    expect(live).toContain("Finish the flight");
    expect(live).toMatch(/z-index:1100/);
    expect(live).toContain("display:grid");

    if (g.phase !== "flight") throw new Error("очікувався політ");
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    expect(g.phase).toBe("orbit");
    expect(render(g)).toContain("Orbit operations");
    expect(render(g)).toContain('data-testid="orbit-panel"');
    expect(render(g)).toContain("Next orbit");
    expect(render(g)).not.toContain("заглушка");

    for (let i = 0; i < 50 && g.phase === "orbit"; i++) g = step(g, availableActions(g).at(-1)!.action);
    expect(g.phase).toBe("debrief");
    const html = render(g);
    expect(html).toMatch(/Mission (accomplished|failed)/);
    expect(html).not.toContain("ui.");
  });

  it("розбір провалу на орбіті не містить сирих ключів (мала батарея)", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    g = step(g, { phase: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-s" } });
    g = step(g, { phase: "design", action: { type: "confirm" } });
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    for (let i = 0; i < 50 && g.phase === "orbit"; i++) g = step(g, availableActions(g).at(-1)!.action);
    expect(g.phase).toBe("debrief");
    const html = render(g);
    expect(html).toMatch(/Mission failed/);
    expect(html).not.toMatch(/orbit\.proto|ui\.|\{\w+\}/);
    // Усі записи журналу орбіти мають переклад, зокрема перемикачі з параметрами.
    if (g.phase !== "debrief") throw new Error("розбір");
    for (const e of g.record.log.filter((x) => x.phase === "orbit")) {
      const text = describeEntry(e, { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG });
      expect(text, e.messageKey).not.toMatch(/orbit\.proto|\{\w+\}/);
    }
  });

  it("екран орбіти: безпечний режим показує, що перемикачі перевизначені, є пам'ять і прогноз", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    g = step(g, { phase: "design", action: { type: "confirm" } });
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    g = step(g, { phase: "orbit", action: { type: "toggle", id: "safeMode" } });
    const html = render(g);
    expect(html).toContain("Onboard storage");
    expect(html).toContain('data-testid="orbit-log"'); // стрічка подій орбіти
    expect(html).toContain("Mission log");
    expect(html).toContain("by safe mode");
    expect(html).toContain("Enabled by safe mode"); // обігрівач у безпечному режимі не «призупинений»
  });

  it("екран орбіти попереджає про бурю заздалегідь", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    g = step(g, { phase: "design", action: { type: "confirm" } });
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    let soon = false;
    for (let i = 0; i < 12 && g.phase === "orbit"; i++) {
      if (/Solar storm in \d orbits/.test(render(g))) soon = true;
      g = step(g, { phase: "orbit", action: { type: "tick", dtS: g.orbit.input.flight.orbit.periodS } });
    }
    expect(soon).toBe(true);
  });

  it("заблокована холодом камера показується як «недоступна», а не «увімкнена»", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    g = step(g, { phase: "design", action: { type: "confirm" } });
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    if (g.phase !== "orbit") throw new Error("очікувалась орбіта");
    expect(render(g)).toContain("Camera: Enabled");
    const cold: GameState = { ...g, orbit: { ...g.orbit, coldStress: 2 } };
    const html = render(cold);
    expect(html).toContain("Camera: Unavailable");
    expect(html).not.toContain("Camera: Enabled");
  });

  it("безпечний режим із непрацюючим обігрівачем показує його «недоступним»", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    g = step(g, { phase: "design", action: { type: "confirm" } });
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    g = step(g, { phase: "orbit", action: { type: "toggle", id: "safeMode" } });
    if (g.phase !== "orbit") throw new Error("очікувалась орбіта");
    const dead: GameState = { ...g, orbit: { ...g.orbit, input: { ...g.orbit.input, flight: { ...g.orbit.input.flight, damage: [{ system: "thermal", severity: 1 }] } } } };
    expect(render(dead)).toContain("Heater: Unavailable");
    expect(render(g)).toContain("Heater: Enabled");
  });

  it("пояснює втрату до відділення й показує справжню причину без успішної орбіти", () => {
    const initial = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    const launched = step(initial, { phase: "design", action: { type: "confirm" } });
    if (launched.phase !== "flight") throw new Error("очікувався політ");
    const game: GameState = {
      phase: "debrief", seed: launched.seed, mission: launched.mission,
      record: {
        seed: launched.seed, missionId: launched.mission.id, spec: launched.spec,
        flight: { ...flightPhase.finish(launched.flight).result, deploymentStatus: "lost" },
        outcome: { success: false, deliveredMb: 0, survivedOrbits: 0, score: 0 },
        log: [
          { id: "flight:terminal:1", phase: "flight", tS: 5, kind: "event", system: "structure", messageKey: "flight.event.terminalState", params: { energyPct: 0, oxygenPct: 71, tempC: 25 } },
          { id: "flight:lost:1", phase: "flight", tS: 5, kind: "failure", system: "structure", messageKey: "flight.failure.satelliteLost", params: { energyPct: 0, oxygenPct: 71, tempC: 25 }, causedBy: ["flight:terminal:1"] },
        ],
      },
    };
    const html = render(game);
    expect(html).toContain("Mission failed");
    expect(html).toContain("Satellite lost before deployment");
    expect(html).toContain("Orbit operations never started");
    expect(html).toContain("Orbit · not started");
    expect(html).toContain("Flight ended with energy 0%, oxygen 71%");
    expect(html).not.toContain("flight.failure.satelliteLost");
    expect(html).not.toContain("Run the orbit");
    expect(html).not.toContain("Mission accomplished");

    // An older saved result omits deploymentStatus; its existing outcome still determines the screen.
    const legacyFlight = { ...game.record.flight };
    delete legacyFlight.deploymentStatus;
    const legacy: GameState = { ...game, record: { ...game.record, flight: legacyFlight, log: [], outcome: { success: true, deliveredMb: 2000, survivedOrbits: 10, score: 100 } } };
    expect(render(legacy)).toContain("Mission accomplished");
    expect(render(legacy)).not.toContain("Orbit operations never started");
    expect(render(legacy)).not.toContain("Orbit · not started");
  });

  it("не обіцяє відділення супутника для термінального невдалого польоту", () => {
    const launched = step(newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7), { phase: "design", action: { type: "confirm" } });
    if (launched.phase !== "flight") throw new Error("очікувався політ");
    const html = render({ ...launched, flight: { ...launched.flight, gameMode: "GAME_OVER" } });
    expect(html).toContain("Review failed flight");
    expect(html).not.toContain("Finish the flight and deploy the satellite");
  });

  it("показує причину відмови, коли вона лише подія (апарат прибув на орбіту непрацездатним)", () => {
    const launched = step(newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7), { phase: "design", action: { type: "confirm" } });
    if (launched.phase !== "flight") throw new Error("очікувався політ");
    const game: GameState = {
      phase: "debrief", seed: launched.seed, mission: launched.mission,
      record: {
        seed: launched.seed, missionId: launched.mission.id, spec: launched.spec,
        flight: { ...flightPhase.finish(launched.flight).result, deploymentStatus: "deployed" },
        outcome: { success: false, deliveredMb: 0, survivedOrbits: 0, score: 0 },
        log: [
          { id: "orbit:arrival", phase: "orbit", tS: 0, kind: "event", system: "structure", messageKey: "orbit.proto.arrival", params: { altKm: 500 } },
          { id: "orbit:arrivalFailure", phase: "orbit", tS: 0, kind: "failure", system: "power", messageKey: "orbit.proto.arrivalFailure", params: {}, causedBy: ["orbit:arrival"] },
        ],
      },
    };
    const html = render(game);
    expect(html).toContain("Flight damage left the spacecraft unable to operate");
    expect(html).toContain("Satellite separation confirmed at 500 km");
  });
});

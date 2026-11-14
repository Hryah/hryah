import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { availableActions, newGame, step, type GameState } from "../../core/game";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
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
    expect(render(g)).toContain("Run the orbit");
    expect(render(g)).not.toContain("заглушка");

    const go = availableActions(g).at(-1)!;
    g = step(g, go.action);
    expect(g.phase).toBe("debrief");
    const html = render(g);
    expect(html).toMatch(/Mission (accomplished|failed)/);
    expect(html).not.toContain("ui.");
  });
});

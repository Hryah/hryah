import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { availableActions, newGame, step, type GameState } from "../../core/game";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { PlayScreen } from "./PlayScreen";

const render = (game: GameState) => renderToStaticMarkup(<PlayScreen game={game} setGame={() => undefined} active={false} />);

describe("наскрізна гра: екран показує поточну частину", () => {
  it("проєктування → політ → орбіта → розбір, кожна частина має свій екран і підсвічений етап", () => {
    let g = newGame(SAMPLE_MISSION, SAMPLE_CATALOG, 7);
    expect(g.phase).toBe("design");
    expect(render(g)).toContain("Launch");

    g = step(g, { phase: "design", action: { type: "confirm" } });
    expect(g.phase).toBe("flight");
    expect(render(g)).toContain("Finish the flight");

    if (g.phase !== "flight") throw new Error("очікувався політ");
    g = step(g, { phase: "flight", action: { type: "complete_phase" } });
    expect(g.phase).toBe("orbit");
    expect(render(g)).toContain("Orbit operations");

    const go = availableActions(g).at(-1)!;
    g = step(g, go.action);
    expect(g.phase).toBe("debrief");
    const html = render(g);
    expect(html).toMatch(/Mission (accomplished|failed)/);
    expect(html).not.toContain("ui.");
  });
});

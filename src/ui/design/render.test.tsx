import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { designPhase } from "../../core/design";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { ConsortiumScreen } from "./ConsortiumScreen";
import { DesignScreen } from "./DesignScreen";

const state = designPhase.init({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, 1);

describe("екран частини 1: розмітка", () => {
  it("показує місію, шість запасів, модулі всіх слотів і носії", () => {
    const html = renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable />);
    for (const text of ["Earth Observer", "Delta-v", "Eclipse energy", "Data link", "Image sharpness", "Launch mass", "Budget",
      "Chemical engine", "Medium solar array", "Medium battery", "Medium antenna", "Mid-size camera", "Small launcher", "Propellant", "Orbit altitude"]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("ui."); // жодного невизначеного ключа
  });

  it("не показує попередження про блокування для стартового проєкту, а для перевантаженого показує", () => {
    expect(renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable />)).not.toContain("Launch is blocked");
    const heavy = designPhase.step(state, { type: "setFuel", fuelKg: 100 });
    expect(renderToStaticMarkup(<DesignScreen state={heavy} dispatch={() => undefined} editable />)).toContain("Launch is blocked: Launch mass");
  });

  it("недоступні модулі показані окремо з номером ходу", () => {
    const html = renderToStaticMarkup(
      <DesignScreen state={state} dispatch={() => undefined} editable upcoming={[{ id: "cam-l", slot: "instrument", nameKey: "camera.l", fromTurn: 4 }]} />,
    );
    expect(html).toContain("Large camera");
    expect(html).toContain("Available from turn 4");
  });

  it("лічильник дій і режим лише для перегляду", () => {
    const html = renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable={false} actionsLeft={3} />);
    expect(html).toContain("3 changes left this turn");
    expect(html).toContain("disabled");
  });

  it("екран консорціуму починає з вибору агенцій", () => {
    const html = renderToStaticMarkup(<ConsortiumScreen />);
    for (const text of ["Choose the agencies", "United States", "India", "Europe", "Start the mission"]) expect(html, text).toContain(text);
  });
});

describe("екран частини 1: вичерпані дії", () => {
  it("без змін у цей хід картки модулів заблоковані", () => {
    const html = renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable={false} actionsLeft={0} />);
    expect(html).toContain("0 changes left this turn");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThan(10);
  });
});

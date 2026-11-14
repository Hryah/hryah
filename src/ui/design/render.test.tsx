import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { designPhase } from "../../core/design";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import { newConsortium, stepConsortium, type ConsortiumAction, type Market } from "../../core/consortium";
import agenciesData from "../../data/agencies.json";
import marketData from "../../data/market.json";
import type { AgencyProfile } from "../../core/design/agency";
import { ConsortiumScreen, Results, Turn } from "./ConsortiumScreen";
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
    expect(html).toContain("3 controls left to adjust this turn");
    expect(html).toContain("disabled");
  });

  it("екран консорціуму починає з вибору агенцій", () => {
    const html = renderToStaticMarkup(<ConsortiumScreen />);
    for (const text of ["Choose the agencies", "Borealis Federation", "Monsoon Union", "Meridia Concord", "Start the mission"]) expect(html, text).toContain(text);
  });
});

describe("екран частини 1: вичерпані дії", () => {
  it("без змін у цей хід картки модулів заблоковані", () => {
    const html = renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable={false} actionsLeft={0} />);
    expect(html).toContain("0 controls left to adjust this turn");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThan(10);
  });
});

describe("результати: розбір причин", () => {
  const borealis = (agenciesData as unknown as Record<string, AgencyProfile>).borealis!;
  const play = (...actions: ConsortiumAction[]) =>
    actions.reduce(stepConsortium, newConsortium({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, marketData as Market, [borealis]));

  it("слабка батарея: показано відмову й рішення гравця, що до неї привело", () => {
    const state = play({ type: "design", action: { type: "setModule", slot: "battery", moduleId: "bat-s" } }, { type: "launch" });
    const html = renderToStaticMarkup(<Results state={state} onRestart={() => undefined} />);
    expect(html).toContain("Why Borealis Federation got this result");
    expect(html).toContain("Battery depleted");
    expect(html).toContain("Selected Small battery for Battery");
    expect(html).not.toContain("ui.");
  });

  it("добрий проєкт: без відмов, є таблиця виплат", () => {
    const html = renderToStaticMarkup(<Results state={play({ type: "launch" })} onRestart={() => undefined} />);
    expect(html).toContain("Total paid out");
    expect(html).not.toContain("Battery depleted");
  });
});

describe("власна розробка на екрані", () => {
  const borealis = (agenciesData as unknown as Record<string, AgencyProfile>).borealis!;
  const fresh = () => newConsortium({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, marketData as Market, [borealis]);

  it("до замовлення показано форму з ціною, строком і ризиком браку", () => {
    const html = renderToStaticMarkup(<Turn state={fresh()} dispatch={() => undefined} />);
    expect(html).toContain("Develop your own camera");
    expect(html).toContain("defect risk");
    expect(html).not.toContain("ui.");
  });

  it("після замовлення показано проєкт і скільки ходів лишилось", () => {
    const state = stepConsortium(fresh(), { type: "develop", order: { slot: "instrument", apertureM: 0.3, inspect: false } });
    const html = renderToStaticMarkup(<Turn state={state} dispatch={() => undefined} />);
    expect(html).toContain("Custom camera, 0.3 m");
    expect(html).toMatch(/ready in \d+ turns/);
    expect(html).not.toContain("Start development");
  });
});

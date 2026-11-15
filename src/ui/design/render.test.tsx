import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { designPhase } from "../../core/design";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "../../core/stubs";
import {
  campaignRoomSetup,
  newConsortium,
  newRoom,
  stepConsortium,
  stepRoom,
  type ConsortiumAction,
  type Market,
  type RoomState,
} from "../../core/consortium";
import agenciesData from "../../data/agencies.json";
import cargoCatalogData from "../../data/catalog-cargo.json";
import extraCatalogData from "../../data/catalog-extra.json";
import marketData from "../../data/market.json";
import type { AgencyProfile } from "../../core/design/agency";
import type { Catalog, ModuleDef } from "../../core/contracts";
import { describeEntry } from "./cause";
import { Lobby } from "./Lobby";
import { ConsortiumScreen, Results, Turn } from "./ConsortiumScreen";
import { DesignScreen } from "./DesignScreen";

const profiles = Object.values(agenciesData) as AgencyProfile[];
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

  it("екран консорціуму починає з меню: один екран, створити кімнату, приєднатись", () => {
    const html = renderToStaticMarkup(<ConsortiumScreen />);
    for (const text of ["Play at one screen", "Create room", "Join", "Your name"]) expect(html, text).toContain(text);
    expect(html).not.toContain("ui.");
  });

  it("локальне лобі: гравець, вибір країни, старт", () => {
    const ids = profiles.map((a) => a.id);
    const room = newRoom("p1", "Player 1", ids, 1);
    const html = renderToStaticMarkup(<Lobby room={room} agencies={profiles} local send={() => undefined} onStart={() => undefined} />);
    for (const text of ["Consortium lobby", "Player 1", "Any country", "Borealis Federation", "Monsoon Union", "Meridia Concord", "Add player", "Start the mission"]) expect(html, text).toContain(text);
    expect(html).not.toContain("ui.");
  });

  it("лобі: монета при конфлікті, онлайн-режим із готовністю", () => {
    const ids = profiles.map((a) => a.id);
    let room: RoomState = newRoom("a", "Ann", ids, 5);
    const setup = { base: { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, market: marketData as unknown as Market, agencies: profiles };
    room = stepRoom(room, "b", { type: "join", name: "Bob" }, setup);
    room = stepRoom(room, "a", { type: "wish", agencyId: ids[0]! }, setup);
    room = stepRoom(room, "b", { type: "wish", agencyId: ids[0]! }, setup);
    if (room.phase !== "lobby") throw new Error("лобі");
    const html = renderToStaticMarkup(<Lobby room={room} agencies={profiles} send={() => undefined} onStart={() => undefined} meId="a" />);
    for (const text of ["Ann", "Bob", "Ready", "coin toss", "contested", "Waiting for everyone to be ready."]) expect(html, text).toContain(text);
    expect(html).not.toContain("ui.");
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

describe("розбір причин: власна розробка", () => {
  it("модуль власної розробки названо, а не показано сирим id", () => {
    const text = describeEntry(
      { id: "design:instrument", phase: "design", tS: 0, kind: "decision", system: "science", messageKey: "design.chose", params: { slot: "instrument", module: "custom-instrument-borealis" } },
      { mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG },
    );
    expect(text).toContain("Custom camera");
    expect(text).not.toContain("custom-instrument");
  });
});

describe("перегляд апарата на екрані проєктування: без дублювання", () => {
  it("типово показує 3D-стенд без дублюючої 2D-схеми та має перемикачі режимів", () => {
    const html = renderToStaticMarkup(<DesignScreen state={state} dispatch={() => undefined} editable />);
    expect(html).toContain("Spacecraft preview");
    expect(html).toContain("3D stand");
    expect(html).toContain("2D schematic");
    expect(html).toContain("Blueprint");
    expect(html).not.toContain("ORBIT:");
    expect(html).not.toContain("ui.");
  });

  it("у режимі svg показує єдину 2D-схему без дублюючого 3D-стенду", () => {
    const html = renderToStaticMarkup(
      <DesignScreen state={state} dispatch={() => undefined} editable defaultPreviewMode="svg" />,
    );
    expect(html).toContain("ORBIT:");
    expect(html).toContain("FUEL:");
    expect(html).not.toContain("Spacecraft on the test stand");
    expect(html).toContain("<image");
  });

  it("у режимі blueprint показує суто векторне креслення без SVG <image> текстури планети", () => {
    const html = renderToStaticMarkup(
      <DesignScreen state={state} dispatch={() => undefined} editable defaultPreviewMode="blueprint" />,
    );
    expect(html).toContain("ORBIT:");
    expect(html).not.toContain("Spacecraft on the test stand");
    expect(html).not.toContain("<image");
  });

  it("відображає векторну іконку-контейнер для cargo-* модулів без зовнішнього спрайту", () => {
    const cargoCatalog: Catalog = {
      ...SAMPLE_CATALOG,
      modules: [...SAMPLE_CATALOG.modules, ...(cargoCatalogData.modules as ModuleDef[])],
    };
    const cargoState = designPhase.init({ mission: SAMPLE_MISSION, catalog: cargoCatalog }, 1);
    const html = renderToStaticMarkup(<DesignScreen state={cargoState} dispatch={() => undefined} editable />);
    expect(html).toContain("Water container");
    expect(html).toContain('fill="#78350f"');
    expect(html).not.toContain("ui.");
  });

  it("якщо передано невідомий defaultPreviewMode, переглядач коректно відкочується на 3D-стенд і не лишає порожню область", () => {
    const html = renderToStaticMarkup(
      <DesignScreen state={state} dispatch={() => undefined} editable defaultPreviewMode="nonexistent-mode" />,
    );
    expect(html).toContain("Spacecraft on the test stand");
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("пульт керування місією та спрайти модулів", () => {
  it("рендерить PNG-спрайти 15 базових модулів, SVG-плейсхолдери для додаткових модулів без власного спрайта і векторні носії", () => {
    const extendedCatalog: Catalog = {
      ...SAMPLE_CATALOG,
      modules: [...SAMPLE_CATALOG.modules, ...(extraCatalogData.modules as ModuleDef[])],
    };
    const extendedState = designPhase.init({ mission: SAMPLE_MISSION, catalog: extendedCatalog }, 1);
    const html = renderToStaticMarkup(<DesignScreen state={extendedState} dispatch={() => undefined} editable />);

    for (const id of ["eng-chem", "sol-m", "bat-m", "ant-m", "cam-m"]) {
      expect(html).toContain(`assets/sprites/modules/${id}.png`);
    }
    for (const extraId of ["eng-mono", "sol-gaas", "ant-laser", "cam-swir"]) {
      expect(html).not.toContain(`assets/sprites/modules/${extraId}.png`);
    }
    expect((html.match(/data-placeholder="module"/g) ?? []).length).toBe((extraCatalogData.modules as ModuleDef[]).length);
    expect((html.match(/data-placeholder="launcher"/g) ?? []).length).toBe(SAMPLE_MISSION.launchers.length);
    expect(html).not.toContain("ui.");
  });

  it("показує пульт керування місією з 5 вкладками, конвеєром виробництва, брифінгом і панеллю перевірки проєкту", () => {
    const setup = campaignRoomSetup(marketData as unknown as Market, profiles);
    const ids = profiles.map((a) => a.id);
    let room: RoomState = newRoom("p1", "Commander", ids, 7);
    room = stepRoom(room, "p1", { type: "wish", agencyId: "borealis" }, setup);
    room = stepRoom(room, "p2", { type: "join", name: "Rival" }, setup);
    room = stepRoom(room, "p2", { type: "wish", agencyId: "monsoon" }, setup);
    room = stepRoom(room, "p1", { type: "ready", ready: true }, setup);
    room = stepRoom(room, "p2", { type: "ready", ready: true }, setup);
    room = stepRoom(room, "p1", { type: "start" }, setup);
    if (room.phase !== "play") throw new Error("Очікувався стан активної кампанії");

    const designHtml = renderToStaticMarkup(<Turn state={room.consortium} dispatch={() => undefined} />);
    expect(designHtml).toContain('data-testid="mission-control-console"');
    expect(designHtml).toContain('role="tablist"');
    expect(designHtml).toContain('data-testid="design-check-panel"');
    expect(designHtml).toContain('data-testid="briefing"');
    for (const label of ["Design", "Factory", "Ground segment", "Technology", "Research", "Launch", "Wait a turn"]) {
      expect(designHtml).toContain(label);
    }
    expect(designHtml).not.toContain("ui.");

    const factoryHtml = renderToStaticMarkup(<Turn state={room.consortium} dispatch={() => undefined} initialTab="factory" />);
    expect(factoryHtml).toContain("Raw material");
    expect(factoryHtml).toContain("Refining");
    expect(factoryHtml).toContain("Finishing");
    expect(factoryHtml).toContain("Module");
    expect(factoryHtml).not.toContain("ui.");

    for (const tab of ["ground", "trl", "research"] as const) {
      const tabHtml = renderToStaticMarkup(<Turn state={room.consortium} dispatch={() => undefined} initialTab={tab} />);
      expect(tabHtml).not.toContain("ui.");
    }
  });

  it("вимикає таби кампанії та показує пояснення під час чужого ходу або поза кампанією, а в таблиці підсвічує лише мою агенцію", () => {
    const setup = campaignRoomSetup(marketData as unknown as Market, profiles);
    const ids = profiles.map((a) => a.id);
    let room: RoomState = newRoom("p1", "Commander", ids, 7);
    room = stepRoom(room, "p1", { type: "wish", agencyId: "borealis" }, setup);
    room = stepRoom(room, "p2", { type: "join", name: "Rival" }, setup);
    room = stepRoom(room, "p2", { type: "wish", agencyId: "monsoon" }, setup);
    room = stepRoom(room, "p1", { type: "ready", ready: true }, setup);
    room = stepRoom(room, "p2", { type: "ready", ready: true }, setup);
    room = stepRoom(room, "p1", { type: "start" }, setup);
    if (room.phase !== "play") throw new Error("Очікувався стан активної кампанії");

    // Хід активної Borealis, але в онлайні моя агенція — Monsoon: підсвічуватися має лише Monsoon Union.
    const opponentTurnHtml = renderToStaticMarkup(
      <Turn state={room.consortium} dispatch={() => undefined} isMyTurn={false} myAgencyIds={["monsoon"]} initialTab="factory" />,
    );
    expect(opponentTurnHtml).toContain("Available on your turn.");
    expect(opponentTurnHtml).toContain('<tr class="is-player"><td>Monsoon Union');
    expect(opponentTurnHtml).not.toContain('<tr class="is-player"><td>Borealis Federation');
    expect((opponentTurnHtml.match(/id="mc-tab-(?:factory|ground|trl|research)"[^>]*disabled=""/g) ?? []).length).toBe(4);
    expect(opponentTurnHtml).not.toContain("ui.");

    // Поза кампанією (`!account`): вкладки кампанії вимкнені, а панель містить пояснення.
    const borealis = (agenciesData as unknown as Record<string, AgencyProfile>).borealis!;
    const soloConsortium = newConsortium({ mission: SAMPLE_MISSION, catalog: SAMPLE_CATALOG }, marketData as Market, [borealis]);
    const nonCampaignHtml = renderToStaticMarkup(
      <Turn state={soloConsortium} dispatch={() => undefined} initialTab="factory" />,
    );
    expect(nonCampaignHtml).toContain("Available in campaign mode only.");
    expect((nonCampaignHtml.match(/id="mc-tab-(?:factory|ground|trl|research)"[^>]*disabled=""/g) ?? []).length).toBe(4);
    expect(nonCampaignHtml).not.toContain("ui.");
  });
});

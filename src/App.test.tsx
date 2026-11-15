import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Канал підміняємо в build-info; важкі екрани замінюємо позначками, щоб бачити, що змонтовано.
const mocked = vi.hoisted(() => ({ channel: "main" as "main" | "experimental" | "local" }));

vi.mock("./build-info", async (importOriginal) => {
  const original = await importOriginal<typeof import("./build-info")>();
  return {
    ...original,
    get channel() {
      return mocked.channel;
    },
  };
});
vi.mock("./ui/design/ConsortiumScreen", () => ({ ConsortiumScreen: () => <div data-screen="play" /> }));
vi.mock("./ui/play/PlayScreen", () => ({ PlayScreen: () => <div data-screen="mission" />, startPlay: () => ({}) }));
vi.mock("./ui/debug/DebugScreen", () => ({ DebugScreen: () => <div data-screen="debug" /> }));
vi.mock("./ui/orbit/OrbitPrototype", () => ({ OrbitPrototype: () => <div data-screen="orbit" /> }));
vi.mock("./scenes/gallery", () => ({ Gallery: () => <div data-screen="gallery" /> }));
vi.mock("./ui/room/RoomScreen", () => ({ RoomScreen: () => <div data-screen="room" /> }));

import { App } from "./App";

const NAV_HREFS = ["#play", "#room", "#orbit", "#mission", "#debug", "#gallery"];
const SCREENS = ["mission", "orbit", "debug", "gallery", "room"];
const ROOM_FALLBACK = 'role="status"';

const renderAt = (hash: string) => {
  vi.stubGlobal("window", { location: { hash }, addEventListener: () => undefined, removeEventListener: () => undefined });
  return renderToStaticMarkup(<App />);
};

describe("App: службові елементи за каналом збірки", () => {
  beforeEach(() => {
    mocked.channel = "main";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("main: немає смуги каналу й посилань навігації, логотип і Retro style лишаються", () => {
    const html = renderAt("");
    expect(html).not.toContain('data-testid="channel-bar"');
    expect(html).not.toContain("MAIN · стабільна");
    expect(html).not.toContain("збірка");
    for (const href of NAV_HREFS) expect(html).not.toContain(`href="${href}"`);
    expect(html).toContain("hryah");
    expect(html).toContain("retro-toggle");
    expect(html).toContain('data-screen="play"');
  });

  it("main: службові екрани не монтуються за жодною #адресою, відкривається основна гра", () => {
    for (const hash of ["#orbit", "#mission", "#debug", "#gallery", "#room", "#play", "#unknown"]) {
      const html = renderAt(hash);
      expect(html, hash).toContain('data-screen="play"');
      for (const screen of SCREENS) expect(html, `${hash} → ${screen}`).not.toContain(`data-screen="${screen}"`);
      expect(html, hash).not.toContain(ROOM_FALLBACK);
      expect(html, hash).not.toContain('data-testid="channel-bar"');
    }
  });

  it.each(["experimental", "local"] as const)("%s: смуга каналу й усі посилання навігації на місці", (channel) => {
    mocked.channel = channel;
    const html = renderAt("");
    expect(html).toContain('data-testid="channel-bar"');
    expect(html).toContain("збірка");
    for (const href of NAV_HREFS) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("retro-toggle");
    expect(html).toContain('data-screen="orbit"');
    expect(html).toContain('data-screen="mission"');
    expect(html).toContain('data-screen="debug"');
  });

  it("experimental: службові екрани відкриваються за адресою", () => {
    mocked.channel = "experimental";
    expect(renderAt("#gallery")).toContain('data-screen="gallery"');
    // Каюта ледача: в SSR видно запасну розмітку Suspense, а не сам екран.
    expect(renderAt("#room")).toContain(ROOM_FALLBACK);
  });
});

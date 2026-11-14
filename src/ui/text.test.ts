import { describe, expect, it } from "vitest";
import agenciesData from "../data/agencies.json";
import texts from "../data/texts.en.json";
import { fmt, t } from "./text";

const known = new Set(Object.keys(texts));
// Усі екрани як текст: перевіряємо ключі без файлової системи.
const sources = import.meta.glob<string>("./design/*.tsx", { query: "?raw", import: "default", eager: true });

describe("тексти екранів", () => {
  it("кожен літеральний ключ t(\"...\") є у файлі текстів", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bt\("([^"]+)"/g)) expect(known.has(match[1] ?? ""), `${file}: ${match[1]}`).toBe(true);
    }
  });

  it("динамічні ключі слотів і запасів мають тексти", () => {
    for (const slot of ["engine", "solar", "battery", "antenna", "instrument"]) expect(known.has(`ui.slot.${slot}`), slot).toBe(true);
    for (const id of ["dv", "energy", "link", "science", "mass", "budget"]) {
      expect(known.has(`ui.margin.${id}`), id).toBe(true);
      expect(known.has(`ui.marginHint.${id}`), id).toBe(true);
    }
    for (const a of Object.values(agenciesData)) expect(known.has(a.nameKey) && known.has(a.descriptionKey)).toBe(true);
  });

  it("t підставляє параметри й показує відсутній ключ як є", () => {
    expect(t("ui.turn", { turn: 3, deadline: 12 })).toBe("Turn 3 of 12");
    expect(t("no.such.key")).toBe("no.such.key");
    expect(t("ui.turn")).toBe("Turn {turn} of {deadline}");
  });

  it("fmt округлює без шуму", () => expect(fmt(0.1 + 0.2)).toBe("0.3"));
});

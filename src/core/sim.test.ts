import { describe, expect, it } from "vitest";
import { summarize, sweepDesigns } from "./sim";
import { SAMPLE_CATALOG, SAMPLE_MISSION } from "./stubs";

describe("перебір проєктів", () => {
  const summary = summarize(sweepDesigns(SAMPLE_MISSION, SAMPLE_CATALOG));

  it("перебирає всі комбінації", () => {
    expect(summary.total).toBe(3 ** 5 * 3 * 3 * 3);
  });

  it("місію можна пройти, але не будь-яким проєктом", () => {
    expect(summary.wins).toBeGreaterThan(0);
    expect(summary.wins).toBeLessThan(summary.total);
  });
});

import { describe, expect, it } from "vitest";
import { initialState, step } from "./state";

describe("step", () => {
  it("не мутує вхідний стан", () => {
    const s = initialState(1);
    const frozen = Object.freeze({ ...s });
    const next = step(frozen, { type: "burn", amount: 10 });
    expect(next).not.toBe(frozen);
    expect(frozen.fuel).toBe(100);
    expect(next.fuel).toBe(90);
  });

  it("детермінований: однаковий вхід — однаковий вихід", () => {
    const a = step(initialState(7), { type: "burn", amount: 5 });
    const b = step(initialState(7), { type: "burn", amount: 5 });
    expect(a).toEqual(b);
  });

  it("паливо не йде нижче нуля", () => {
    expect(step(initialState(1), { type: "burn", amount: 1000 }).fuel).toBe(0);
  });

  it("стан серіалізується в JSON без втрат", () => {
    const s = step(initialState(3), { type: "coast" });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

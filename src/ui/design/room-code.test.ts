import { describe, expect, it } from "vitest";
import { normalizeRoomCode } from "./room-code";

describe("код кімнати", () => {
  it("латиниця лишається, регістр і зайві символи прибрано", () => {
    expect(normalizeRoomCode("zj sf")).toBe("ZJSF");
    expect(normalizeRoomCode("ab12cd")).toBe("ABCD");
  });

  it("набраний з української розкладки код перекладається за клавішами", () => {
    expect(normalizeRoomCode("яоіа")).toBe("ZJSF"); // клавіші Z J S F
    expect(normalizeRoomCode("ПАПВ")).toBe("GFGD");
  });

  it("не довший за 4 літери", () => {
    expect(normalizeRoomCode("ABCDE")).toBe("ABCD");
  });
});

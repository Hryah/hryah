import { describe, expect, it } from "vitest";
import { channelFromBase } from "./build-info";

describe("channelFromBase", () => {
  it("корінь — main", () => expect(channelFromBase("/", false)).toBe("main"));
  it("/experimental/ — experimental", () => expect(channelFromBase("/experimental/", false)).toBe("experimental"));
  it("dev-сервер — local, навіть з базою /", () => expect(channelFromBase("/", true)).toBe("local"));
});

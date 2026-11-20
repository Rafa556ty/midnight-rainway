import { describe, expect, it } from "vitest";
import { CITY_TO, CYCLE, TUNNEL_FROM, inCity, inTunnel, themeAt } from "./world";

describe("map layout", () => {
  it("starts in the city", () => {
    expect(inCity(0)).toBe(true);
    expect(inCity(CITY_TO - 1)).toBe(true);
    expect(inCity(CITY_TO + 1)).toBe(false);
    expect(themeAt(100)).toBe("day");
  });
  it("keeps the original highway after the city, then loops back to the city", () => {
    expect(TUNNEL_FROM).toBe(CITY_TO + 1400);
    expect(inTunnel(TUNNEL_FROM + 10)).toBe(true);
    expect(inCity(CYCLE + 10)).toBe(true);
  });
});

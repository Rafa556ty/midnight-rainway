import { describe, expect, it } from "vitest";
import {
  BRIDGE_FROM, BRIDGE_TO, CITY_TO, CYCLE, RAIN_FROM, RAIN_TO, STORE_AT, TUNNEL_FROM, TUNNEL_TO,
  WATER_FROM, WATER_TO, hasOncoming, nightAmount, overWater, rainAmount, sunsetAmount, zoneAt,
} from "./world";

describe("map layout", () => {
  it("runs city -> highway -> bridge -> tunnel -> night highway in that order", () => {
    expect(zoneAt(10)).toBe("city");
    expect(zoneAt(CITY_TO + 100)).toBe("highway");
    expect(zoneAt(BRIDGE_FROM + 200)).toBe("bridge");
    expect(zoneAt(TUNNEL_FROM + 200)).toBe("tunnel");
    expect(zoneAt(TUNNEL_TO + 200)).toBe("night-highway");
    expect(zoneAt(CYCLE + 10)).toBe("city");
  });
  it("tunnel is 8 straightened tiles of the owner's model (~1 km)", () => {
    expect(TUNNEL_TO - TUNNEL_FROM).toBe(1015);
  });
  it("water is only under the bridge", () => {
    expect(WATER_FROM).toBeGreaterThan(BRIDGE_FROM);
    expect(WATER_TO).toBeLessThan(BRIDGE_TO);
    expect(overWater((WATER_FROM + WATER_TO) / 2)).toBe(true);
    expect(overWater(BRIDGE_FROM - 50)).toBe(false);
  });
  it("rains only on the night highway, at night", () => {
    expect(RAIN_FROM).toBeGreaterThan(TUNNEL_TO);
    const mid = (RAIN_FROM + RAIN_TO) / 2;
    expect(rainAmount(mid)).toBe(1);
    expect(nightAmount(mid)).toBe(1);
    expect(rainAmount(500)).toBe(0);
  });
  it("city is daytime, bridge is golden hour", () => {
    expect(nightAmount(600)).toBe(0);
    expect(sunsetAmount(BRIDGE_FROM + 245)).toBeGreaterThan(0.9);
    expect(sunsetAmount(600)).toBe(0);
  });
  it("oncoming cars in city, bridge and tunnel; one-way highways", () => {
    expect(hasOncoming(300)).toBe(true);
    expect(hasOncoming(BRIDGE_FROM + 100)).toBe(true);
    expect(hasOncoming(TUNNEL_FROM + 100)).toBe(true);
    expect(hasOncoming(CITY_TO + 300)).toBe(false);
    expect(hasOncoming(STORE_AT)).toBe(false);
  });
});

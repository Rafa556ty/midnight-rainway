import { describe, expect, it } from "vitest";
import { oncomingCars } from "./oncoming";
import { BRIDGE_FROM, CITY_TO, TUNNEL_FROM } from "./world";

describe("oncoming traffic", () => {
  it("drives on the left carriageway in the city, never on our lanes", () => {
    const cars = oncomingCars(500, 3, 260, 110);
    expect(cars.length).toBeGreaterThan(4);
    for (const c of cars) expect(c.x).toBeLessThan(-9);
  });
  it("is absent on the one-way highway", () => {
    expect(oncomingCars(CITY_TO + 600, 3, 260, 110)).toHaveLength(0);
  });
  it("uses the bridge deck and the tunnel's other bore", () => {
    for (const c of oncomingCars(BRIDGE_FROM + 200, 1, 100, 50)) expect(c.x).toBeLessThan(-7.3);
    for (const c of oncomingCars(TUNNEL_FROM + 400, 1, 100, 50)) expect(c.x).toBeLessThan(-14.1);
  });
  it("cars come toward the player over time", () => {
    const a = oncomingCars(500, 0, 260, 110)[0]!;
    const b = oncomingCars(500, 0.5, 260, 110).find((c) => c.model === a.model && c.x === a.x)!;
    expect(b.z).toBeGreaterThan(a.z);
  });
});

import { describe, expect, it } from "vitest";
import { oncomingCars } from "./oncoming";
import { BRIDGE_FROM, STORE_AT, TUNNEL_FROM } from "./world";

describe("oncoming traffic", () => {
  it("is absent on the one-way highways", () => {
    expect(oncomingCars(300, 3, 260, 110)).toHaveLength(0);
    expect(oncomingCars(STORE_AT, 3, 260, 110)).toHaveLength(0);
  });
  it("uses the bridge deck and the tunnel's other bore, never our lanes", () => {
    const bridge = oncomingCars(BRIDGE_FROM + 200, 1, 100, 50);
    expect(bridge.length).toBeGreaterThan(2);
    for (const c of bridge) expect(c.x).toBeLessThan(-7.3);
    for (const c of oncomingCars(TUNNEL_FROM + 400, 1, 100, 50)) expect(c.x).toBeLessThan(-14.1);
  });
  it("cars come toward the player over time", () => {
    const a = oncomingCars(BRIDGE_FROM + 200, 0, 100, 50)[0]!;
    const b = oncomingCars(BRIDGE_FROM + 200, 0.5, 100, 50).find((c) => c.model === a.model && c.x === a.x)!;
    expect(b.z).toBeGreaterThan(a.z);
  });
});

import { describe, expect, it } from "vitest";
import { CITY_LEFT_EDGE, CITY_RIGHT_EDGE, CITY_STREET, cityPlan } from "./city-plan";

const sizes = {
  paramount: { w: 18.5, d: 21.4 }, projects: { w: 54, d: 18 }, clinic: { w: 37.6, d: 18.6 }, liquor: { w: 18.9, d: 20.8 },
  housing: { w: 18.6, d: 18.5 }, pawnshop: { w: 18, d: 18.5 }, laundrette: { w: 18, d: 18 }, filler: { w: 18.4, d: 20.6 },
  gunshop: { w: 36.2, d: 20.2 }, fishfactory: { w: 54, d: 18 }, basketball: { w: 36, d: 18 },
};

describe("city layout", () => {
  const plan = cityPlan(sizes, 0, 1300);
  it("puts buildings on both sides, never on the road", () => {
    expect(plan.buildings.some((b) => b.side < 0)).toBe(true);
    expect(plan.buildings.some((b) => b.side > 0)).toBe(true);
    for (const b of plan.buildings) {
      const near = Math.abs(b.x) - (sizes as Record<string, { d: number }>)[b.type]!.d / 2;
      expect(near).toBeGreaterThanOrEqual(b.side > 0 ? CITY_RIGHT_EDGE : CITY_LEFT_EDGE);
    }
  });
  it("leaves cross streets free and buildings don't overlap", () => {
    for (const side of [-1, 1]) {
      const row = plan.buildings.filter((b) => b.side === side).sort((a, b) => a.at - b.at);
      for (let i = 1; i < row.length; i++) {
        expect(row[i]!.at - row[i]!.w / 2).toBeGreaterThan(row[i - 1]!.at + row[i - 1]!.w / 2);
      }
      for (const s of plan.streets) for (const b of row) {
        expect(Math.abs(b.at - s)).toBeGreaterThanOrEqual(b.w / 2 + CITY_STREET / 2 - 0.01);
      }
    }
  });
  it("is not one building repeated", () => {
    expect(new Set(plan.buildings.map((b) => b.type)).size).toBeGreaterThanOrEqual(8);
  });
});

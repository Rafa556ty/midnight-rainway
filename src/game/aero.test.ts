import { describe, expect, it } from "vitest";
import { REVUELTO_WING_RISE, stepRevueltoWing } from "./aero";

const run = (gas: boolean, braking: boolean, speed: number, seconds: number, lift = 0) => {
  let s = { lift, tilt: 0 };
  for (let t = 0; t < seconds * 60; t++) s = stepRevueltoWing(s, speed, gas, braking, 1 / 60);
  return s;
};

describe("Revuelto active wing", () => {
  it("rises while accelerating", () => {
    expect(run(true, false, 60, 3).lift).toBeGreaterThan(0.95);
  });
  it("settles flush when the driver lets off the gas", () => {
    expect(run(false, false, 60, 6, 1).lift).toBeLessThan(0.01);
  });
  it("only lifts slightly", () => {
    expect(REVUELTO_WING_RISE).toBeLessThanOrEqual(0.06);
  });
});

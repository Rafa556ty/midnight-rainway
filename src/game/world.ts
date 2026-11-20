// Scenery cycle along the road (pure, unit-tested). Distances are in HUD meters.
// Cycle: City (start) -> Day Highway -> Tunnel -> Rainy Dusk -> Night Highway -> Dawn -> City...
// The original highway layout is kept as is, just pushed back by the city stretch.

export type Theme = "day" | "tunnel" | "night";

export const CITY_FROM = 0;
export const CITY_TO = 1300;
const O = CITY_TO; // original layout offset

export const TUNNEL_FROM = O + 1400;
export const TUNNEL_TO = O + 2400;
export const DUSK_FROM = TUNNEL_TO; // gets dark gradually after tunnel
export const NIGHT_FROM = O + 3400; // fully night when the night highway starts
export const DAWN_FROM = O + 5000;
export const CYCLE = O + 5800;

/** Rain storm span on the highway (wet road, glossy reflections, raindrops) */
export const RAIN_FROM = O + 2450;
export const RAIN_TO = O + 3350;

/** Highway overpass bridges along the route (z positions in HUD meters) */
export const BRIDGES: [number, number][] = [
  [O + 500, O + 560],
  [O + 1100, O + 1160],
  [O + 2800, O + 2860],
  [O + 4100, O + 4160],
];

/** Overhead highway sign gantries (z center positions) */
export const SIGN_GANTRIES = [O + 300, O + 850, O + 1320, O + 2550, O + 3700, O + 4600];

/** Speed trap camera radar locations (HUD meters) */
export const SPEED_RADARS = [O + 750, O + 2050, O + 3600, O + 4750];

export const cyc = (z: number) => ((z % CYCLE) + CYCLE) % CYCLE;

export const inCity = (z: number) => {
  const u = cyc(z);
  return u >= CITY_FROM && u < CITY_TO;
};

export function themeAt(z: number): Theme {
  const u = cyc(z);
  if (u >= TUNNEL_FROM && u < TUNNEL_TO) return "tunnel";
  if (u >= NIGHT_FROM && u < DAWN_FROM) return "night";
  return "day";
}

export const inTunnel = (z: number) => {
  const u = cyc(z);
  return u >= TUNNEL_FROM && u < TUNNEL_TO;
};

export function onBridge(z: number) {
  const u = cyc(z);
  return BRIDGES.some(([a, b]) => u >= a && u < b);
}

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** 0 = full day, 1 = full night. Darkens smoothly during dusk, brightens during dawn. */
export function nightAmount(z: number) {
  const u = cyc(z);
  if (u < DUSK_FROM) return 0;
  if (u < NIGHT_FROM) return smooth((u - DUSK_FROM) / (NIGHT_FROM - DUSK_FROM));
  if (u < DAWN_FROM) return 1;
  return 1 - smooth((u - DAWN_FROM) / (CYCLE - DAWN_FROM));
}

/** 0 = dry, 1 = heavy rain */
export function rainAmount(z: number): number {
  if (inTunnel(z)) return 0;
  const u = cyc(z);
  if (u < RAIN_FROM || u > RAIN_TO) return 0;
  const mid = (RAIN_FROM + RAIN_TO) / 2;
  const halfSpan = (RAIN_TO - RAIN_FROM) / 2;
  const dist = Math.abs(u - mid) / halfSpan;
  return smooth(1 - dist);
}

/** Check if car lights should be on: approaching or in tunnel, night, or raining */
export function lightsOn(z: number) {
  const u = cyc(z);
  const inOrNearTunnel = u >= TUNNEL_FROM - 40 && u < TUNNEL_TO + 15;
  return inOrNearTunnel || nightAmount(z) > 0.35 || rainAmount(z) > 0.4;
}

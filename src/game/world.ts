// Map layout along the road (pure, unit-tested). Distances are in HUD meters.
// One lap of the cycle:
//   City (day) -> Day highway -> Suspension bridge over water (sunset)
//   -> Twin-bore tunnel -> Night highway with rain -> Dawn -> City...

export type Theme = "day" | "tunnel" | "night";
export type Zone = "city" | "highway" | "bridge" | "tunnel" | "night-highway";

export const CITY_FROM = 0;
export const CITY_TO = 1300;
export const BRIDGE_FROM = 2500;
/** Bridge model length in metres (owner-supplied suspension bridge, flattened). */
export const BRIDGE_LEN = 490;
export const BRIDGE_TO = BRIDGE_FROM + BRIDGE_LEN;
/** Open water under the bridge (between the two abutments). */
export const WATER_FROM = BRIDGE_FROM + 70;
export const WATER_TO = BRIDGE_FROM + 420;

/** Straightened owner-supplied tunnel tile length (m) and tile count. */
export const TUNNEL_TILE = 126.9;
export const TUNNEL_TILES = 8;
export const TUNNEL_FROM = 3150;
export const TUNNEL_TO = Math.round(TUNNEL_FROM + TUNNEL_TILE * TUNNEL_TILES);

export const DUSK_FROM = 2600; // sky darkens slowly after the bridge
export const NIGHT_FROM = 3800; // fully night inside the tunnel
export const DAWN_FROM = 6100;
export const CYCLE = 6800;

/** Rain storm span on the night highway (wet road, glossy reflections, raindrops) */
export const RAIN_FROM = 4500;
export const RAIN_TO = 5600;

/** Highway overpass bridges (only on the highways) */
export const BRIDGES: [number, number][] = [
  [1700, 1760],
  [2250, 2310],
  [4650, 4710],
  [5450, 5510],
];

/** Overhead highway sign gantries (z center positions) */
export const SIGN_GANTRIES = [1450, 2050, 4400, 5250, 5900];

/** Speed trap camera radar locations (HUD meters) */
export const SPEED_RADARS = [1900, 2420, 4850, 5750];

/** Roadside convenience store from the owner's freeway model (shown once per lap). */
export const STORE_AT = 5080;

export const cyc = (z: number) => ((z % CYCLE) + CYCLE) % CYCLE;

export function zoneAt(z: number): Zone {
  const u = cyc(z);
  if (u < CITY_TO) return "city";
  if (u >= BRIDGE_FROM && u < BRIDGE_TO) return "bridge";
  if (u >= TUNNEL_FROM && u < TUNNEL_TO) return "tunnel";
  if (u >= TUNNEL_TO) return "night-highway";
  return "highway";
}

export function themeAt(z: number): Theme {
  if (inTunnel(z)) return "tunnel";
  return nightAmount(z) > 0.5 ? "night" : "day";
}

export const inTunnel = (z: number) => {
  const u = cyc(z);
  return u >= TUNNEL_FROM && u < TUNNEL_TO;
};

export const inCity = (z: number) => cyc(z) < CITY_TO;

export function overWater(z: number) {
  const u = cyc(z);
  return u >= WATER_FROM && u < WATER_TO;
}

/** Overpass check (kept for the 2D fallback renderer). */
export function onBridge(z: number) {
  const u = cyc(z);
  return BRIDGES.some(([a, b]) => u >= a && u < b);
}

/** Cars come the other way on a second carriageway in the city, on the bridge and in the tunnel's other bore. */
export function hasOncoming(z: number) {
  const zone = zoneAt(z);
  return zone === "city" || zone === "bridge" || zone === "tunnel";
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

/** Golden-hour warmth, strongest while crossing the bridge (0..1). */
export function sunsetAmount(z: number) {
  const u = cyc(z);
  const a = BRIDGE_FROM - 400;
  const b = TUNNEL_FROM + 100;
  if (u < a || u > b) return 0;
  const mid = BRIDGE_FROM + BRIDGE_LEN / 2;
  return u < mid ? smooth((u - a) / (mid - a)) : smooth((b - u) / (b - mid));
}

/** 0 = dry, 1 = heavy rain */
export function rainAmount(z: number): number {
  if (inTunnel(z)) return 0;
  const u = cyc(z);
  if (u < RAIN_FROM || u > RAIN_TO) return 0;
  const mid = (RAIN_FROM + RAIN_TO) / 2;
  const halfSpan = (RAIN_TO - RAIN_FROM) / 2;
  const dist = Math.abs(u - mid) / halfSpan;
  return smooth(Math.min(1, (1 - dist) * 1.6));
}

/** Check if car lights should be on: approaching or in tunnel, night, or raining */
export function lightsOn(z: number) {
  const u = cyc(z);
  const inOrNearTunnel = u >= TUNNEL_FROM - 40 && u < TUNNEL_TO + 15;
  return inOrNearTunnel || nightAmount(z) > 0.35 || rainAmount(z) > 0.4;
}

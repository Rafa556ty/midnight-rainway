// Map layout along the road (pure, unit-tested). Distances are in HUD meters.
// One lap of the cycle (the start is the original day highway, unchanged):
//   Day highway -> new twin-bore tunnel -> suspension bridge over water (sunset)
//   -> California night highway with rain -> Dawn -> Day highway...

export type Theme = "day" | "tunnel" | "night";
export type Zone = "highway" | "tunnel" | "bridge" | "night-highway";

/** Straightened owner-supplied tunnel tile length (m) and tile count. */
export const TUNNEL_TILE = 126.9;
export const TUNNEL_TILES = 8;
export const TUNNEL_FROM = 1400;
export const TUNNEL_TO = Math.round(TUNNEL_FROM + TUNNEL_TILE * TUNNEL_TILES);

export const BRIDGE_FROM = 2650;
/** Bridge model length in metres (owner-supplied suspension bridge, flattened). */
export const BRIDGE_LEN = 490;
export const BRIDGE_TO = BRIDGE_FROM + BRIDGE_LEN;
/** Open water under the bridge (between the two abutments). */
export const WATER_FROM = BRIDGE_FROM + 70;
export const WATER_TO = BRIDGE_FROM + 420;

export const DUSK_FROM = TUNNEL_TO; // sky darkens slowly after the tunnel, sunset over the bridge
export const NIGHT_FROM = 3500; // fully night on the California highway
export const DAWN_FROM = 5600;
export const CYCLE = 6400;

/** Rain storm span on the night highway (wet road, glossy reflections, raindrops) */
export const RAIN_FROM = 3700;
export const RAIN_TO = 4700;

/** Highway overpass bridges (start of the map is the original layout). */
export const BRIDGES: [number, number][] = [
  [500, 560],
  [1100, 1160],
  [3900, 3960],
  [5000, 5060],
];

/** Overhead highway sign gantries (z center positions) */
export const SIGN_GANTRIES = [300, 850, 1320, 3350, 4500, 5300];

/** Speed trap camera radar locations (HUD meters) */
export const SPEED_RADARS = [750, 3600, 4900, 5900];

/** Roadside convenience store from the owner's freeway model (once per lap). */
export const STORE_AT = 4200;

export const cyc = (z: number) => ((z % CYCLE) + CYCLE) % CYCLE;

export function zoneAt(z: number): Zone {
  const u = cyc(z);
  if (u < TUNNEL_FROM) return "highway";
  if (u < TUNNEL_TO) return "tunnel";
  if (u >= BRIDGE_FROM && u < BRIDGE_TO) return "bridge";
  if (u >= BRIDGE_TO && u < DAWN_FROM) return "night-highway";
  return "highway";
}

export const inTunnel = (z: number) => {
  const u = cyc(z);
  return u >= TUNNEL_FROM && u < TUNNEL_TO;
};

export function themeAt(z: number): Theme {
  if (inTunnel(z)) return "tunnel";
  return nightAmount(z) > 0.5 ? "night" : "day";
}

export function overWater(z: number) {
  const u = cyc(z);
  return u >= WATER_FROM && u < WATER_TO;
}

/** Overpass check (kept for the 2D fallback renderer). */
export function onBridge(z: number) {
  const u = cyc(z);
  return BRIDGES.some(([a, b]) => u >= a && u < b);
}

/** Cars come the other way on the bridge and in the tunnel's other bore. */
export function hasOncoming(z: number) {
  const zone = zoneAt(z);
  return zone === "bridge" || zone === "tunnel";
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
  const a = TUNNEL_TO;
  const b = BRIDGE_TO + 250;
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

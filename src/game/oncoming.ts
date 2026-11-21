// Decorative oncoming traffic on the other carriageway (pure). Cars drive toward
// the player at their own speed and wrap from behind the camera to far ahead in the fog.
import { cyc, hasOncoming, TUNNEL_FROM, TUNNEL_TO, BRIDGE_FROM, BRIDGE_TO } from "./world";

export type OncomingModel = "sedan" | "hatch" | "suv" | "pickup" | "bus" | "truck" | "mustang" | "bmw";
export type OncomingCar = { model: OncomingModel; x: number; z: number };

const MODELS: OncomingModel[] = ["sedan", "hatch", "suv", "sedan", "pickup", "bmw", "hatch", "bus", "suv", "mustang", "sedan", "truck", "hatch", "suv"];
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Centre of the oncoming carriageway (metres from our road centre) at cycle distance u. */
export function oncomingCenter(u: number) {
  if (u >= TUNNEL_FROM && u < TUNNEL_TO) return -22.4; // the tunnel's other bore
  if (u >= BRIDGE_FROM && u < BRIDGE_TO) return -14.5; // left half of the bridge deck
  return -16.6; // city avenue
}

export const ONCOMING_SLOTS = 14;

/** Render-space cars (z < 0 ahead, z > 0 behind the player). */
export function oncomingCars(pz: number, time: number, ahead: number, behind: number): OncomingCar[] {
  const span = ahead + behind;
  const out: OncomingCar[] = [];
  for (let i = 0; i < ONCOMING_SLOTS; i++) {
    const v = (65 + hash(i * 3.1) * 45) / 3.6;
    const z = ((((pz + v * time + hash(i * 7.7) * span) % span) + span) % span) - ahead;
    const world = pz - z;
    if (!hasOncoming(world)) continue;
    const lane = i % 3;
    out.push({ model: MODELS[i % MODELS.length]!, x: oncomingCenter(cyc(world)) + (lane - 1) * 3.6, z });
  }
  return out;
}

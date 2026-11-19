// Pure city layout: which owner-supplied building goes where along the avenue.
// Distances are cycle metres along the road; x is metres from the road centre.

export type KitSize = { w: number; d: number }; // w = front width (along the road), d = depth
export type Placement = { type: string; side: -1 | 1; at: number; x: number; yaw: number; w: number };

/** Our carriageway (3 lanes + shoulders + gravel) ends here on the right. */
export const CITY_RIGHT_EDGE = 9.4;
/** The oncoming carriageway + gravel ends here on the left. */
export const CITY_LEFT_EDGE = 23.8;
export const CITY_SIDEWALK = 4;
export const CITY_BLOCK = 110;
export const CITY_STREET = 14;

const CENTER = ["paramount", "projects", "clinic", "liquor", "housing", "pawnshop", "laundrette", "filler", "gunshop", "paramount", "projects"];
const OUTSKIRTS = ["fishfactory", "gunshop", "laundrette", "pawnshop", "filler", "basketball", "housing", "fishfactory"];
const SMALL = ["laundrette", "pawnshop", "housing", "liquor", "filler", "paramount"];

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function cityPlan(sizes: Record<string, KitSize>, from: number, to: number) {
  const buildings: Placement[] = [];
  const streets: number[] = [];
  const blocks = Math.floor((to - from) / CITY_BLOCK);
  for (let b = 0; b < blocks; b++) {
    const start = from + b * CITY_BLOCK;
    streets.push(start + CITY_BLOCK - CITY_STREET / 2);
    const outskirts = b < 2 || b >= blocks - 2;
    const list = outskirts ? OUTSKIRTS : CENTER;
    for (const side of [-1, 1] as const) {
      let cursor = start + 2;
      const end = start + CITY_BLOCK - CITY_STREET - 1;
      for (let k = 0; k < 8; k++) {
        let type = list[Math.floor(hash(b * 31 + side * 7 + k * 13) * list.length)]!;
        if (!sizes[type] || cursor + sizes[type]!.w > end) {
          type = SMALL.find((t) => sizes[t] && cursor + sizes[t]!.w <= end) ?? "";
          if (!type) break;
        }
        const { w, d } = sizes[type]!;
        const x = side > 0 ? CITY_RIGHT_EDGE + CITY_SIDEWALK + d / 2 : -(CITY_LEFT_EDGE + CITY_SIDEWALK + d / 2);
        buildings.push({ type, side, at: cursor + w / 2, x, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, w });
        cursor += w + 1.5;
      }
    }
  }
  return { buildings, streets };
}

import * as THREE from "three";

/** Separate the upper rear aero panel from the original baked Body geometry. */
export function isolateActiveWing(root: THREE.Group): THREE.Group | null {
  const wing = new THREE.Group();
  wing.name = "active-wing";
  const pivot = new THREE.Vector3(0, 0.96, 2.12);
  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) ||
      Array.isArray(object.material) ||
      object.material.name !== "Body"
    )
      return;
    const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    const position = source.getAttribute("position");
    const moving: number[] = [],
      fixed: number[] = [];
    for (let i = 0; i < position.count; i += 3) {
      let rearPanel = true;
      for (let j = 0; j < 3; j++)
        if (position.getZ(i + j) < 1.86 || position.getY(i + j) < 0.83) rearPanel = false;
      (rearPanel ? moving : fixed).push(i, i + 1, i + 2);
    }
    if (!moving.length) return;
    const subset = (indices: number[]) => {
      const geo = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(source.attributes)) {
        if (
          !(a instanceof THREE.BufferAttribute) &&
          !(a instanceof THREE.InterleavedBufferAttribute)
        )
          continue;
        const values = new Float32Array(indices.length * a.itemSize);
        indices.forEach((id, i) => {
          for (let c = 0; c < a.itemSize; c++) values[i * a.itemSize + c] = a.getComponent(id, c);
        });
        geo.setAttribute(name, new THREE.BufferAttribute(values, a.itemSize));
      }
      geo.computeBoundingSphere();
      return geo;
    };
    object.geometry = subset(fixed);
    const geo = subset(moving);
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const mat = (object.material as THREE.Material).clone();
    mat.side = THREE.DoubleSide;
    const panel = new THREE.Mesh(geo, mat);
    panel.castShadow = true;
    wing.add(panel);
  });
  if (!wing.children.length) return null;
  wing.position.copy(pivot);
  root.add(wing);
  // Telescoping supports stay hidden under the panel when retracted.
  const metal = new THREE.MeshStandardMaterial({ color: 0x45494d, metalness: 0.8, roughness: 0.3 });
  for (const x of [-0.55, 0.55]) {
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.32, 8), metal);
    support.position.set(x, 0.8, 2.1);
    support.name = "wing-support";
    support.visible = false;
    root.add(support);
  }
  return wing;
}

/**
 * 2024 Revuelto: its active wing is its own connected piece of the paint mesh
 * (the rear deck blade between the haunches, above the Y tail lights). Split
 * that piece into an "active-wing" group pivoted on its leading bottom edge.
 */
export function isolateRevuelto2024Wing(root: THREE.Group): THREE.Group | null {
  const body = root.children.find(
    (o): o is THREE.Mesh =>
      (o as THREE.Mesh).isMesh && !Array.isArray((o as THREE.Mesh).material) &&
      /2024Paint_Material$/.test(((o as THREE.Mesh).material as THREE.Material).name) &&
      !(o as THREE.Mesh).geometry.index,
  );
  if (!body) return null;
  const pos = body.geometry.getAttribute("position");
  const tris = pos.count / 3;
  // Weld vertices (0.5 mm) and union triangles into connected pieces.
  const parent = new Int32Array(tris).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
    return a;
  };
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    const t = Math.floor(i / 3);
    const other = seen.get(k);
    if (other === undefined) seen.set(k, t);
    else {
      const a = find(other), b = find(t);
      if (a !== b) parent[a] = b;
    }
  }
  const pieces = new Map<number, { tris: number[]; min: THREE.Vector3; max: THREE.Vector3 }>();
  const v = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    let piece = pieces.get(r);
    if (!piece) pieces.set(r, (piece = { tris: [], min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) }));
    piece.tris.push(t);
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, t * 3 + k);
      piece.min.min(v); piece.max.max(v);
    }
  }
  const moving = new Set<number>();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  for (const piece of pieces.values()) {
    const isWing = piece.tris.length > 300 && piece.min.z > 1.85 && piece.min.y > 0.78 && piece.max.x - piece.min.x > 1.2;
    if (!isWing) continue;
    for (const t of piece.tris) moving.add(t);
    min.min(piece.min);
  }
  if (!moving.size) return null;
  const pick = (keep: boolean) => {
    const ids: number[] = [];
    for (let t = 0; t < tris; t++) if (moving.has(t) !== keep) ids.push(t * 3, t * 3 + 1, t * 3 + 2);
    const geo = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(body.geometry.attributes)) {
      const attr = a as THREE.BufferAttribute;
      const out = new Float32Array(ids.length * attr.itemSize);
      ids.forEach((id, i) => {
        for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(id, c);
      });
      geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
    }
    geo.computeBoundingSphere();
    return geo;
  };
  const old = body.geometry;
  const wingGeo = pick(false);
  body.geometry = pick(true);
  old.dispose();
  const pivot = new THREE.Vector3(0, min.y, min.z);
  wingGeo.translate(-pivot.x, -pivot.y, -pivot.z);
  const panel = new THREE.Mesh(wingGeo, body.material);
  panel.name = body.name;
  panel.castShadow = true;
  const wing = new THREE.Group();
  wing.name = "active-wing";
  wing.position.copy(pivot);
  wing.add(panel);
  // Two dark struts under the blade; hidden in the deck while it is flush.
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.7, roughness: 0.35 });
  for (const x of [-0.42, 0.42]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.06), metal);
    strut.position.set(x, -0.03, 0.16);
    wing.add(strut);
  }
  root.add(wing);
  return wing;
}

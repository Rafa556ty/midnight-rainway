// Owner-supplied map models placed along the road (browser only; render3d owns it).
// Tunnel tiles and roadside pines are InstancedMeshes, so each
// model part is one draw call however many copies are on screen (weak phones).
import * as THREE from "three";
import { fetchGlb, parseGlb } from "./models3d";
import tunnelAsset from "@/assets/map/tunnel.glb.asset.json";
import bridgeAsset from "@/assets/map/bridge.glb.asset.json";
import highwayAsset from "@/assets/map/highway-kit.glb.asset.json";
import {
  BRIDGE_FROM, BRIDGE_LEN, CYCLE, STORE_AT, TUNNEL_FROM, TUNNEL_TILE, TUNNEL_TILES, TUNNEL_TO,
  WATER_FROM, WATER_TO, cyc, inTunnel, overWater, zoneAt,
} from "./world";

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const WATER_LEVEL = -12;
/** Tunnel tile drop: its floor crown (+0.11) sits just under the game road (y 0). */
const TUNNEL_Y = -0.15;

class Batch {
  n = 0;
  constructor(public meshes: THREE.InstancedMesh[]) {}
  add(m: THREE.Matrix4) {
    if (this.n >= (this.meshes[0]?.instanceMatrix.count ?? 0)) return;
    for (const im of this.meshes) im.setMatrixAt(this.n, m);
    this.n++;
  }
  commit() {
    for (const im of this.meshes) {
      im.count = this.n;
      im.visible = this.n > 0;
      im.instanceMatrix.needsUpdate = true;
    }
    this.n = 0;
  }
}

function meshesOf(o: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); });
  return out;
}

function instanced(src: THREE.Object3D, cap: number, scene: THREE.Object3D, glow: THREE.MeshStandardMaterial[]) {
  src.updateMatrixWorld(true);
  const list = meshesOf(src).map((m) => {
    const g = m.geometry.clone();
    // Quantized (normalized int) attributes clamp to [-1, 1] when baked: widen to float first.
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      if (a.array instanceof Float32Array && !(a as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
    g.applyMatrix4(m.matrixWorld);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (/glow/i.test(mat.name) && !glow.includes(mat)) glow.push(mat);
    const im = new THREE.InstancedMesh(g, mat, cap);
    im.frustumCulled = false;
    im.count = 0;
    im.visible = false;
    scene.add(im);
    return im;
  });
  return new Batch(list);
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class MapScenery {
  loaded = false;
  hasPines = false;
  private root = new THREE.Group();
  private glow: THREE.MeshStandardMaterial[] = [];
  private tunnelTiles: Batch | null = null;
  private bridge: THREE.Group | null = null;
  private water: THREE.Mesh;
  private waterTex: THREE.Texture;
  private banks: THREE.Mesh[] = [];
  private mountain: THREE.Group | null = null;
  private pines: Batch | null = null;
  private bgTrees: Batch | null = null;
  private store: THREE.Object3D | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    scene: THREE.Scene,
    private low: boolean,
    private ahead: number,
    private behind: number,
  ) {
    scene.add(this.root);
    // Water under the bridge: glossy, rippling, reflects the sky environment.
    this.waterTex = canvasTex(256, 256, (g) => {
      g.fillStyle = "#808080";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {
        const v = 110 + Math.floor(hash(i) * 40);
        g.fillStyle = `rgb(${v},${v},255)`;
        g.fillRect(hash(i * 3) * 256, hash(i * 5) * 256, 6 + hash(i * 7) * 20, 1 + hash(i * 9) * 2);
      }
    });
    this.waterTex.colorSpace = THREE.NoColorSpace;
    this.waterTex.repeat.set(40, 40);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1f4a5c,
      roughness: 0.12,
      metalness: 0.35,
      normalMap: this.waterTex,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1400, WATER_TO - WATER_FROM + 160), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.visible = false;
    this.root.add(this.water);
    // River banks: grassy slopes from road level down into the water.
    const bankTex = canvasTex(256, 256, (g) => {
      g.fillStyle = "#4e5a33";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = ["#5d6b3a", "#3f4a29", "#6d6650", "#7a7462"][i % 4]!;
        g.fillRect(hash(i) * 256, hash(i * 2) * 256, 2 + hash(i * 3) * 4, 2);
      }
    });
    bankTex.repeat.set(60, 3);
    const bankMat = new THREE.MeshStandardMaterial({ map: bankTex, roughness: 1 });
    for (let i = 0; i < 2; i++) {
      const len = Math.hypot(28, -WATER_LEVEL + 2);
      const bank = new THREE.Mesh(new THREE.PlaneGeometry(1400, len), bankMat);
      bank.visible = false;
      this.banks.push(bank);
      this.root.add(bank);
    }
  }

  async load() {
    const get = async (url: string) => parseGlb(await fetchGlb(url));
    const [tunnel, bridge, hwy] = await Promise.all([
      get(tunnelAsset.url).catch((e) => (console.error("tunnel model", e), null)),
      get(bridgeAsset.url).catch((e) => (console.error("bridge model", e), null)),
      get(highwayAsset.url).catch((e) => (console.error("highway model", e), null)),
    ]);
    if (tunnel) {
      this.tunnelTiles = instanced(tunnel, 4, this.root, this.glow);
      const box = new THREE.Box3().setFromObject(tunnel);
      this.mountain = buildMountain(box.min.x, box.max.x, box.max.y + TUNNEL_Y);
      this.mountain.visible = false;
      this.root.add(this.mountain);
    }
    if (bridge) {
      this.bridge = bridge;
      bridge.visible = false;
      this.root.add(bridge);
    }
    if (hwy) {
      const pine = hwy.getObjectByName("pine");
      const bg = hwy.getObjectByName("bgtree");
      for (const o of [pine, bg]) o?.traverse((c) => {
        const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat) { mat.alphaTest = Math.max(mat.alphaTest, 0.4); mat.transparent = false; mat.side = THREE.DoubleSide; }
      });
      if (pine) { this.pines = instanced(pine, this.low ? 40 : 90, this.root, this.glow); this.hasPines = true; }
      if (bg) this.bgTrees = instanced(bg, this.low ? 40 : 80, this.root, this.glow);
      const store = hwy.getObjectByName("store");
      if (store) { this.store = store; store.visible = false; this.root.add(store); }
    }
    this.loaded = true;
    return this.root;
  }

  /** Render-space z of the occurrence of cycle position `at` that is nearest the view. */
  private zOf(pz: number, at: number, len = 0) {
    const base = pz - cyc(pz);
    let w = base + at;
    if (w + len < pz - this.behind - 60) w += CYCLE;
    if (w - CYCLE + len >= pz - this.behind - 60) w -= CYCLE;
    return -(w - pz);
  }
  private visible(z: number, len = 0, margin = 0) {
    return z > -this.ahead - margin && z - len < this.behind + margin;
  }

  update(pz: number, night: number, time: number) {
    const { m, q, p, s, up } = this;
    // --- tunnel tiles (straightened owner model), local z spans [-tile, 0]
    if (this.tunnelTiles) {
      for (let i = 0; i < TUNNEL_TILES; i++) {
        const z = this.zOf(pz, TUNNEL_FROM + i * TUNNEL_TILE, TUNNEL_TILE);
        if (!this.visible(z, TUNNEL_TILE, 10)) continue;
        m.makeTranslation(0, TUNNEL_Y, z); // floor crown just under the game road so our lane paint stays on top
        this.tunnelTiles.add(m);
      }
      this.tunnelTiles.commit();
    }
    if (this.mountain) {
      const len = TUNNEL_TO - TUNNEL_FROM;
      const z = this.zOf(pz, TUNNEL_FROM, len);
      this.mountain.visible = this.visible(z, len, 260);
      this.mountain.position.z = z;
    }
    // --- suspension bridge + water + banks
    const bz = this.zOf(pz, BRIDGE_FROM, BRIDGE_LEN);
    const bridgeOn = this.visible(bz, BRIDGE_LEN, 120);
    if (this.bridge) {
      this.bridge.visible = bridgeOn;
      this.bridge.position.z = bz;
    }
    const wNear = this.zOf(pz, WATER_FROM, WATER_TO - WATER_FROM);
    const wFar = wNear - (WATER_TO - WATER_FROM);
    this.water.visible = this.banks[0]!.visible = this.banks[1]!.visible = bridgeOn;
    if (bridgeOn) {
      this.water.position.set(0, WATER_LEVEL, (wNear + wFar) / 2);
      this.waterTex.offset.set(time * 0.01, time * 0.02);
      const drop = -WATER_LEVEL + 2;
      const ang = Math.atan2(drop, 28);
      const [near, far] = this.banks as [THREE.Mesh, THREE.Mesh];
      near.rotation.set(-Math.PI / 2 - ang, 0, 0);
      near.position.set(0, -drop / 2, wNear - 14);
      far.rotation.set(-Math.PI / 2 + ang, 0, 0);
      far.position.set(0, -drop / 2, wFar + 14);
    }
    // --- pines + background tree walls along the California night highway
    const reach = this.low ? 150 : this.ahead;
    if (this.pines) {
      const first = Math.floor((pz - this.behind) / 9);
      for (let n = first; n * 9 < pz + reach; n++) {
        const wz = n * 9;
        const zone = zoneAt(wz);
        if (zone !== "night-highway") continue;
        if (overWater(wz) || inTunnel(wz + 40) || inTunnel(wz - 40)) continue;
        for (const side of [-1, 1]) {
          const h = hash(n * 2 + (side > 0 ? 1 : 0));
          if (h < 0.15) continue;
          if (side > 0 && Math.abs(cyc(wz) - STORE_AT) < 30) continue;
          const k = 0.75 + hash(n * 7.3 + side) * 0.5;
          q.setFromAxisAngle(up, h * 6.28);
          p.set(side * (12 + h * 22), 0, -(wz - pz));
          m.compose(p, q, s.set(k, k * (0.85 + h * 0.3), k));
          this.pines.add(m);
        }
      }
      this.pines.commit();
    }
    if (this.bgTrees) {
      const first = Math.floor((pz - this.behind) / 6);
      for (let n = first; n * 6 < pz + this.ahead; n++) {
        const wz = n * 6;
        const zone = zoneAt(wz);
        if (zone !== "night-highway") continue;
        if (overWater(wz) || inTunnel(wz + 60) || inTunnel(wz - 60)) continue;
        for (const side of [-1, 1]) {
          const h = hash(n * 5 + side * 3);
          if (side > 0 && Math.abs(cyc(wz) - STORE_AT) < 40) continue;
          const k = 1 + hash(n * 3.3 + side) * 0.6;
          q.setFromAxisAngle(up, h * 6.28);
          p.set(side * (38 + h * 30), 0, -(wz - pz));
          m.compose(p, q, s.set(k, k, k));
          this.bgTrees.add(m);
        }
      }
      this.bgTrees.commit();
    }
    // --- the convenience store (once per lap, right side of the night highway)
    if (this.store) {
      const z = this.zOf(pz, STORE_AT);
      this.store.visible = this.visible(z, 0, 30);
      this.store.position.set(9.4 + 4 + 12, 0, z);
      this.store.rotation.y = Math.PI;
    }
    // Windows and neon signs glow at night.
    for (const mat of this.glow) mat.emissiveIntensity = 0.25 + night * 1.6;
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.root.removeFromParent();
  }
}

/**
 * Rocky hill the tunnel is bored through (the tile model has no ground over it),
 * with a solid concrete portal at each end: only the two bores stay open.
 * Local z spans [-len, 0] like the tunnel.
 */
function buildMountain(minX: number, maxX: number, top: number) {
  const len = TUNNEL_TO - TUNNEL_FROM;
  const mid = (minX + maxX) / 2;
  const faceHalf = (maxX - minX) / 2 + 16; // portal facade half width
  const faceTop = top + 7; // facade top edge
  const ceil = top - 0.75; // underside of the lintel = inside ceiling height at the mouth
  const roof = faceTop - 0.6; // hill surface right behind the facade
  const W = 560;
  const segX = 112;
  const segZ = 64;
  const geo = new THREE.PlaneGeometry(W, len + 160, segX, segZ).rotateX(-Math.PI / 2);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const colors: number[] = [];
  const grass = new THREE.Color(0x4f5d31);
  const rock = new THREE.Color(0x76706a);
  const dirt = new THREE.Color(0x5f5440);
  const c = new THREE.Color();
  const edge = 6; // rows over the 80 m in front of each portal; rows land exactly on both portals
  const OUT = 80;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + mid;
    const r = Math.round(((len + 160) / 2 - pos.getZ(i)) / ((len + 160) / segZ)); // row 0 = entry side
    const zl = r <= edge ? OUT - (r * OUT) / edge
      : r <= segZ - edge ? (-(r - edge) * len) / (segZ - 2 * edge)
      : -len - ((r - segZ + edge) * OUT) / edge;
    const out = Math.max(0, zl, -len - zl); // metres outside the tunnel ends
    const dx = Math.abs(x - mid);
    const ridge = 34 + 30 * Math.sin(zl * 0.006 + 1.3) + 14 * Math.sin(zl * 0.021);
    const side = Math.max(0, dx - faceHalf);
    const inn = Math.max(0, Math.min(-zl, zl + len));
    const jitter = (hash(i) - 0.5) * 2.4;
    const crest = Math.min(28, inn * 0.55) * (0.75 + 0.25 * Math.sin(x * 0.045 + zl * 0.01));
    let h = roof + ridge * (1 - Math.exp(-side / 50)) + crest + (inn > 2 ? jitter : 0);
    let z = zl;
    if (out > 0) {
      if (dx < faceHalf) {
        // In front of the facade: collapse onto the portal edge (no ground over the bores).
        z = zl > 0 ? 0 : -len;
        h = roof;
      } else {
        // Embankments beside the portal slope down toward the open road.
        h = Math.max(-0.6, h * Math.exp(-out / (24 + side * 0.4)) - 1.2) + jitter * 0.4;
      }
    }
    pos.setXYZ(i, x, h, z);
    const k = Math.min(1, Math.abs(h - roof) / 40);
    c.copy(grass).lerp(dirt, hash(i * 3) * 0.5).lerp(rock, k * 0.8 + (hash(i * 7) > 0.85 ? 0.3 : 0));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Double sided: the cheeks beside each portal are seen from below as well.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));

  // Portal facades: concrete panels around both bores, a lintel, a median pillar and a cap.
  const wallTex = canvasTex(128, 128, (x) => {
    x.fillStyle = "#8d877d";
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1500; i++) { x.fillStyle = i % 2 ? "#99938a" : "#7f796f"; x.fillRect(hash(i) * 128, hash(i * 2) * 128, 2, 2); }
    x.fillStyle = "rgba(40,36,30,0.35)";
    for (let k = 0; k < 128; k += 32) { x.fillRect(0, k, 128, 2); x.fillRect(k, 0, 2, 128); }
    x.fillStyle = "rgba(30,26,22,0.25)"; // rain streaks
    for (let i = 0; i < 40; i++) x.fillRect(hash(i * 11) * 128, 0, 1 + hash(i * 13) * 2, 40 + hash(i * 17) * 88);
  });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x6d685f, roughness: 0.8 });
  const stripeTex = canvasTex(64, 8, (x) => {
    for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? "#e8c21a" : "#1d1d1d"; x.fillRect(k * 8, 0, 8, 8); }
  });
  stripeTex.repeat.set(12, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
  const T = 1.4; // facade thickness
  const x0 = mid - faceHalf;
  const x1 = mid + faceHalf;
  const box = (ax: number, bx: number, ay: number, by: number, z: number, m: THREE.Material, d = T) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bx - ax, by - ay, d), m);
    b.position.set((ax + bx) / 2, (ay + by) / 2, z);
    const tex = (m as THREE.MeshStandardMaterial).map;
    if (tex === wallTex) {
      // world-scale UVs so the panel lines keep their size on every block
      const uv = b.geometry.attributes["uv"] as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (bx - ax) / 6, uv.getY(i) * (by - ay) / 6);
    }
    g.add(b);
  };
  for (const end of [0, 1]) {
    const z = end === 0 ? T / 2 : -len - T / 2;
    box(x0, x1, ceil, faceTop, z, wallMat); // lintel
    box(x0, minX + 0.9, -1, ceil, z, wallMat); // left jamb
    box(maxX - 0.7, x1, -1, ceil, z, wallMat); // right jamb (over the walkway)
    box(-12.4, -10.6, -0.2, ceil, z, wallMat); // pillar between the bores
    box(x0 - 0.4, x1 + 0.4, faceTop, faceTop + 0.5, z, capMat, T + 1); // cap
    const sz = end === 0 ? T + 0.02 : -len - T - 0.02;
    box(minX + 0.9, maxX - 0.7, ceil - 0.01, ceil + 0.45, sz, stripeMat, 0.05); // hazard stripe over the mouth
  }
  return g;
}

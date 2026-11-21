// Owner-supplied map models placed along the road (browser only; render3d owns it).
// Tunnel tiles, city buildings and roadside pines are InstancedMeshes, so each
// model part is one draw call however many copies are on screen (weak phones).
import * as THREE from "three";
import { fetchGlb, parseGlb } from "./models3d";
import tunnelAsset from "@/assets/map/tunnel.glb.asset.json";
import bridgeAsset from "@/assets/map/bridge.glb.asset.json";
import cityAsset from "@/assets/map/city-kit.glb.asset.json";
import highwayAsset from "@/assets/map/highway-kit.glb.asset.json";
import { cityPlan, type KitSize, type Placement } from "./city-plan";
import {
  BRIDGE_FROM, BRIDGE_LEN, CITY_FROM, CITY_TO, CYCLE, STORE_AT, TUNNEL_FROM, TUNNEL_TILE, TUNNEL_TILES,
  WATER_FROM, WATER_TO, cyc, inCity, inTunnel, overWater, zoneAt,
} from "./world";

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const WATER_LEVEL = -12;

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
  private kits = new Map<string, Batch>();
  private plan: { buildings: Placement[]; streets: number[] } = { buildings: [], streets: [] };
  private pines: Batch | null = null;
  private bgTrees: Batch | null = null;
  private store: THREE.Object3D | null = null;
  private streetMesh: THREE.InstancedMesh;
  private cityGround: THREE.Mesh[] = [];
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
    // City: concrete sidewalks/plazas over the grass and asphalt cross streets.
    const pave = canvasTex(256, 256, (g) => {
      g.fillStyle = "#9c9a94";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = ["#a7a59f", "#8f8d87", "#b1aea6"][i % 3]!;
        g.fillRect(hash(i) * 256, hash(i * 2) * 256, 1 + hash(i * 3) * 2, 1 + hash(i * 4) * 2);
      }
      g.strokeStyle = "rgba(60,60,60,0.35)";
      g.lineWidth = 2;
      for (let k = 0; k <= 256; k += 64) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke();
        g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
      }
    });
    pave.repeat.set(30, 1);
    const paveMat = new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(120, 1), paveMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set(side > 0 ? 9.4 + 60 : -23.8 - 60, -0.03, 0);
      g.visible = false;
      this.cityGround.push(g);
      this.root.add(g);
    }
    const street = canvasTex(512, 64, (g) => {
      g.fillStyle = "#34363a";
      g.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 3000; i++) { g.fillStyle = i % 2 ? "#3c3e42" : "#2e3034"; g.fillRect(hash(i) * 512, hash(i * 2) * 64, 2, 2); }
      g.fillStyle = "#d9b23a";
      g.fillRect(0, 30, 512, 4);
    });
    street.wrapS = THREE.RepeatWrapping;
    street.repeat.set(6, 1);
    this.streetMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(260, 14).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: street, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      6,
    );
    this.streetMesh.frustumCulled = false;
    this.streetMesh.count = 0;
    this.root.add(this.streetMesh);
  }

  async load() {
    const get = async (url: string) => parseGlb(await fetchGlb(url));
    const [tunnel, bridge, city, hwy] = await Promise.all([
      get(tunnelAsset.url).catch((e) => (console.error("tunnel model", e), null)),
      get(bridgeAsset.url).catch((e) => (console.error("bridge model", e), null)),
      get(cityAsset.url).catch((e) => (console.error("city model", e), null)),
      get(highwayAsset.url).catch((e) => (console.error("highway model", e), null)),
    ]);
    if (tunnel) this.tunnelTiles = instanced(tunnel, 4, this.root, this.glow);
    if (bridge) {
      this.bridge = bridge;
      bridge.visible = false;
      this.root.add(bridge);
    }
    if (city) {
      const sizes: Record<string, KitSize> = {};
      for (const node of city.children) {
        const b = new THREE.Box3().setFromObject(node);
        sizes[node.name] = { w: b.max.x - b.min.x, d: b.max.z - b.min.z };
        const cap = node.name === "stoplights" ? 4 : node.name === "streetlamp" ? 1 : 10;
        this.kits.set(node.name, instanced(node, cap, this.root, this.glow));
      }
      delete sizes["stoplights"];
      delete sizes["streetlamp"];
      this.plan = cityPlan(sizes, CITY_FROM, CITY_TO);
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
        m.makeTranslation(0, 0, z);
        this.tunnelTiles.add(m);
      }
      this.tunnelTiles.commit();
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
    // --- city: buildings, cross streets with traffic lights, pavements
    const cz = this.zOf(pz, CITY_FROM, CITY_TO - CITY_FROM);
    const cityOn = this.visible(cz, CITY_TO - CITY_FROM, 40);
    for (const g of this.cityGround) {
      g.visible = cityOn;
      if (!cityOn) continue;
      const a = Math.min(cz, this.behind + 20);
      const b = Math.max(cz - (CITY_TO - CITY_FROM), -this.ahead - 20);
      g.scale.set(1, Math.max(0.01, a - b), 1);
      g.position.z = (a + b) / 2;
      ((g.material as THREE.MeshStandardMaterial).map as THREE.Texture).repeat.set(30, Math.max(1, (a - b) / 4));
      ((g.material as THREE.MeshStandardMaterial).map as THREE.Texture).offset.y = (-b % 4) / 4;
    }
    let streets = 0;
    const lights = this.kits.get("stoplights");
    if (cityOn) {
      for (const pl of this.plan.buildings) {
        const z = this.zOf(pz, pl.at);
        if (!this.visible(z, 0, 40)) continue;
        const kit = this.kits.get(pl.type);
        if (!kit) continue;
        q.setFromAxisAngle(up, pl.yaw);
        p.set(pl.x, 0, z);
        m.compose(p, q, s.set(1, 1, 1));
        kit.add(m);
      }
      for (const at of this.plan.streets) {
        const z = this.zOf(pz, at);
        if (!this.visible(z, 0, 20)) continue;
        m.makeTranslation(-8, -0.02, z);
        this.streetMesh.setMatrixAt(streets++, m);
        if (lights) { m.makeTranslation(0, 0, z); lights.add(m); }
      }
    }
    this.streetMesh.count = streets;
    this.streetMesh.visible = streets > 0;
    this.streetMesh.instanceMatrix.needsUpdate = true;
    for (const kit of this.kits.values()) kit.commit();
    // --- pines + background tree walls along both highways
    const reach = this.low ? 150 : this.ahead;
    if (this.pines) {
      const first = Math.floor((pz - this.behind) / 9);
      for (let n = first; n * 9 < pz + reach; n++) {
        const wz = n * 9;
        const zone = zoneAt(wz);
        if (zone !== "highway" && zone !== "night-highway") continue;
        if (overWater(wz) || inTunnel(wz + 40) || inTunnel(wz - 40) || inCity(wz + 30)) continue;
        for (const side of [-1, 1]) {
          const h = hash(n * 2 + (side > 0 ? 1 : 0));
          if (h < (zone === "night-highway" ? 0.15 : 0.35)) continue;
          if (zone === "night-highway" && side > 0 && Math.abs(cyc(wz) - STORE_AT) < 30) continue;
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
        if (zone !== "highway" && zone !== "night-highway") continue;
        if (overWater(wz) || inTunnel(wz + 60) || inTunnel(wz - 60) || inCity(wz + 30)) continue;
        for (const side of [-1, 1]) {
          const h = hash(n * 5 + side * 3);
          if (zone === "highway" && h < 0.5) continue;
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

// Owner-supplied map models placed along the road (browser only; render3d owns it).
// City buildings are InstancedMeshes, so each
// model part is one draw call however many copies are on screen (weak phones).
import * as THREE from "three";
import { fetchGlb, parseGlb } from "./models3d";
import cityAsset from "@/assets/map/city-kit.glb.asset.json";
import { cityPlan, type KitSize, type Placement } from "./city-plan";
import { CITY_FROM, CITY_TO, CYCLE, cyc } from "./world";

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};


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
  private root = new THREE.Group();
  private glow: THREE.MeshStandardMaterial[] = [];
  private kits = new Map<string, Batch>();
  private plan: { buildings: Placement[]; streets: number[] } = { buildings: [], streets: [] };
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
    const city = await get(cityAsset.url).catch((e) => (console.error("city model", e), null));
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

  update(pz: number, night: number) {
    const { m, q, p, s, up } = this;
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

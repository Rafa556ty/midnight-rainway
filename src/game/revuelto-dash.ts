// Revuelto digital cockpit: animated driver cluster + big centre screen drawn on canvases.
import * as THREE from "three";
import { pickGear, rpmIn, REDLINE, IDLE_RPM } from "./gearbox";

const EYE = new THREE.Vector3(-0.4, 0.98, 0.1);
const Y = "#f5c400";

function screen(w: number, h: number, cw: number, ch: number) {
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.userData["cabinOnly"] = true;
  return { canvas, ctx: canvas.getContext("2d")!, tex, mesh };
}

export class RevueltoDash {
  group = new THREE.Group();
  private cluster = screen(0.3, 0.1, 768, 256);
  private center = screen(0.2, 0.125, 512, 320);
  private gear = 0;
  private acc = 1;
  private rpm = IDLE_RPM;
  private t = 0;

  constructor() {
    this.cluster.mesh.position.set(-0.4, 0.83, -0.6);
    this.center.mesh.position.set(-0.08, 0.64, -0.46);
    for (const m of [this.cluster.mesh, this.center.mesh]) { m.lookAt(EYE); this.group.add(m); }
    this.group.name = "revuelto-dash";
  }

  update(speed: number, gas: boolean, dt: number) {
    this.t += dt; this.acc += dt;
    this.gear = pickGear(this.gear, speed, gas);
    const target = Math.max(IDLE_RPM, Math.min(REDLINE, rpmIn(this.gear, speed))) + (gas && speed < 5 ? 2500 : 0);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 10);
    if (this.acc < 1 / 20) return;
    this.acc = 0;
    this.drawCluster(speed, gas);
    this.drawCenter(speed);
  }

  private drawCluster(speed: number, gas: boolean) {
    const { ctx: c, tex } = this.cluster;
    const W = 768, H = 256, cx = W / 2, cy = 150;
    c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
    // rpm arc, Lamborghini-style hexagonal segments
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, frac = this.rpm / REDLINE;
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const f = i / segs, a = a0 + (a1 - a0) * f;
      const on = f < frac;
      c.strokeStyle = on ? (f > 0.85 ? "#ff2a1a" : Y) : "#2a2a2a";
      c.lineWidth = 16;
      c.beginPath(); c.arc(cx, cy, 120, a, a + (a1 - a0) / segs * 0.7); c.stroke();
    }
    c.fillStyle = "#888"; c.font = "bold 16px sans-serif"; c.textAlign = "center";
    for (let k = 0; k <= 9; k++) {
      const a = a0 + (a1 - a0) * (k * 1000 / REDLINE);
      if (k * 1000 > REDLINE) break;
      c.fillText(String(k), cx + Math.cos(a) * 92, cy + Math.sin(a) * 92 + 6);
    }
    c.fillStyle = "#fff"; c.font = "bold 72px sans-serif";
    c.fillText(String(Math.round(speed)), cx, cy + 10);
    c.font = "16px sans-serif"; c.fillStyle = "#aaa"; c.fillText("km/h", cx, cy + 34);
    c.fillStyle = Y; c.font = "bold 40px sans-serif"; c.fillText(String(this.gear + 1), cx, cy - 58);
    // side panels
    c.textAlign = "left"; c.fillStyle = Y; c.font = "bold 22px sans-serif"; c.fillText("CORSA", 30, 50);
    c.fillStyle = "#aaa"; c.font = "16px sans-serif"; c.fillText("V12 + HPEV", 30, 78);
    const bat = 0.55 + 0.4 * Math.sin(this.t * 0.2);
    c.strokeStyle = "#555"; c.lineWidth = 2; c.strokeRect(30, 100, 160, 16);
    c.fillStyle = "#29c46a"; c.fillRect(32, 102, 156 * bat, 12);
    c.fillStyle = "#aaa"; c.fillText("BATTERY " + Math.round(bat * 100) + "%", 30, 140);
    c.textAlign = "right";
    c.fillStyle = gas ? Y : "#666"; c.font = "bold 22px sans-serif"; c.fillText(Math.round(this.rpm) + " RPM", W - 30, 50);
    c.fillStyle = "#aaa"; c.font = "16px sans-serif"; c.fillText("OIL 108°C", W - 30, 78); c.fillText("TYRES OK", W - 30, 104);
    const g = Math.min(1, Math.abs(speed) / 350);
    c.strokeStyle = "#555"; c.strokeRect(W - 190, 120, 160, 16);
    c.fillStyle = Y; c.fillRect(W - 188, 122, 156 * g, 12);
    tex.needsUpdate = true;
  }

  private drawCenter(speed: number) {
    const { ctx: c, tex } = this.center;
    const W = 512, H = 320;
    c.fillStyle = "#0a0a0c"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#16161a"; c.fillRect(0, 0, W, 40);
    c.fillStyle = Y; c.font = "bold 20px sans-serif"; c.textAlign = "left"; c.fillText("LAMBORGHINI", 16, 27);
    const now = new Date();
    c.textAlign = "right"; c.fillStyle = "#ddd";
    c.fillText(now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0"), W - 16, 27);
    // map with route
    c.fillStyle = "#1b2128"; c.fillRect(16, 56, 300, 248);
    c.strokeStyle = "#2f3a46"; c.lineWidth = 6;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(16, 70 + i * 45); c.lineTo(316, 40 + i * 50); c.stroke(); }
    const off = (this.t * speed * 0.05) % 40;
    c.strokeStyle = Y; c.lineWidth = 8; c.setLineDash([24, 16]); c.lineDashOffset = -off;
    c.beginPath(); c.moveTo(166, 304); c.bezierCurveTo(170, 220, 120, 160, 200, 56); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(166, 250); c.lineTo(154, 276); c.lineTo(178, 276); c.fill();
    // side widgets
    c.textAlign = "left"; c.fillStyle = "#aaa"; c.font = "15px sans-serif";
    c.fillText("ENERGY FLOW", 332, 76);
    const p = (Math.sin(this.t * 3) + 1) / 2;
    c.fillStyle = `rgba(41,196,106,${0.4 + 0.6 * p})`; c.fillRect(332, 88, 164, 10);
    c.fillStyle = "#aaa"; c.fillText("G-FORCE", 332, 140);
    c.strokeStyle = "#444"; c.lineWidth = 2; c.beginPath(); c.arc(414, 200, 44, 0, Math.PI * 2); c.stroke();
    c.fillStyle = Y; c.beginPath(); c.arc(414 + Math.sin(this.t) * 10, 200 - Math.min(30, speed / 12), 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ddd"; c.font = "bold 22px sans-serif"; c.fillText("♪ RADIO 98.1", 332, 290);
    tex.needsUpdate = true;
  }
}

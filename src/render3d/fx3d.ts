import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, NormalBlending, Points, ShaderMaterial,
} from 'three';
import type { SimEvent } from '../sim/core/events';
import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import { drawFloatText } from '../render/fx';
import { RingDecal } from './decals';
import type { Camera3D } from './camera3d';
import { groundHeight } from './coords';
import { lookupFx } from './fx/registry';

type RGB = [number, number, number];

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grow: number;
  c: RGB; a: number; drag: number; grav: number; add: boolean;
}
interface FloatText { x: number; z: number; h: number; rise: number; vy: number; life: number; max: number; text: string; color: string; size: number }
interface RingFx { decal: RingDecal; x: number; z: number; r0: number; r1: number; life: number; max: number; color: number; width: number; fill: number }
interface BeamFx { mesh: Mesh<CylinderGeometry, ShaderMaterial>; life: number; max: number; grow: number; r: number }
interface SlashFx { mesh: Mesh<BufferGeometry, ShaderMaterial>; life: number; max: number; spin: number }
interface LineFx { mesh: Mesh<BufferGeometry, ShaderMaterial>; life: number; max: number; flicker: number }
/** 折线的一个点：sim 坐标 (x, y) + 离地高度 h（世界高度，不是相对地面） */
export interface LinePoint { x: number; y: number; h: number }

const MAX_PARTICLES = 900;
const MAX_TEXTS = 70;

/** 粒子着色器：按透视缩放的圆形软点，颜色 / 透明度逐粒子 */
function particleMaterial(additive: boolean): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
      void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vColor;
      void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c); if (d > 1.0) discard; float a = 1.0 - d; gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`,
  });
}

/** 竖直光柱：开口圆柱，越往上越透明 */
function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color() }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main() { float a = pow(1.0 - vUv.y, 1.6) * uOpacity; gl_FragColor = vec4(uColor, a); }`,
  });
}

/** 新月形的斩击弧（XY 平面，弧心在原点，半径 1） */
function crescentGeometry(): BufferGeometry {
  const seg = 18;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = -1.1 + t * 2.2;
    const w = 0.28 * Math.sin(t * Math.PI);
    pos.push(Math.cos(a), Math.sin(a), 0, Math.cos(a) * (1 - w), Math.sin(a) * (1 - w), 0);
    uv.push(t, 1, t, 0);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

function slashMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color() }, uK: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK; varying vec2 vUv;
      void main() {
        float head = uK * 1.6;
        float a = (1.0 - smoothstep(head - 0.35, head, vUv.x)) * (1.0 - smoothstep(0.55, 1.0, uK));
        a *= 0.35 + 0.65 * vUv.y;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), vUv.y * 0.5), a);
      }`,
  });
}

/** 折线 / 闪电：十字交叉的两片条带（任何角度看都有宽度），中心亮、边缘软 */
function lineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: new Color() }, uOpacity: { value: 1 } },
    vertexShader: `attribute float aEdge; varying float vEdge; void main() { vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vEdge;
      void main() { float c = 1.0 - abs(vEdge); float a = smoothstep(0.0, 0.6, c) * uOpacity; gl_FragColor = vec4(mix(uColor, vec3(1.0), smoothstep(0.55, 1.0, c) * 0.8), a); }`,
  });
}

/** 折线几何体：每段两片互相垂直的条带（宽 width），三维坐标 (x, 高度, z) */
export function lineGeometry(pts: { x: number; y: number; z: number }[], width: number): BufferGeometry {
  const pos: number[] = [];
  const edge: number[] = [];
  const hw = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // 侧向（水平）：d × up；竖直的线段退回 x 轴
    let sx = -dz, sz = dx;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-6 * len) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    // 第二个方向：d × side
    const ux = dy * sz, uy = dz * sx - dx * sz, uz = -dy * sx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const sides: [number, number, number][] = [[sx, 0, sz], [ux / ul, uy / ul, uz / ul]];
    for (const [px, py, pz] of sides) {
      const q = [
        [a.x - px * hw, a.y - py * hw, a.z - pz * hw, -1], [a.x + px * hw, a.y + py * hw, a.z + pz * hw, 1],
        [b.x - px * hw, b.y - py * hw, b.z - pz * hw, -1], [b.x + px * hw, b.y + py * hw, b.z + pz * hw, 1],
      ];
      for (const k of [0, 1, 2, 1, 3, 2]) {
        pos.push(q[k][0], q[k][1], q[k][2]);
        edge.push(q[k][3]);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1));
  return g;
}

const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** 单位的"身高"：受击火花、飘字等按它定位 */
export type HeightOf = (u: Unit) => number;

/**
 * 3D 特效：粒子（两组 Points：叠加 / 普通混合）、贴地冲击环、光柱、斩击弧，以及画在界面层上的飘字和全屏闪光。
 * 只消费 sim 事件、读取 World，从不修改 World。
 */
export class Fx3D {
  readonly group = new Group();
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: RingFx[] = [];
  private ringPool: RingDecal[] = [];
  private beams: BeamFx[] = [];
  private beamPool: Mesh<CylinderGeometry, ShaderMaterial>[] = [];
  private slashes: SlashFx[] = [];
  private slashPool: Mesh<BufferGeometry, ShaderMaterial>[] = [];
  private lines: LineFx[] = [];
  private linePool: ShaderMaterial[] = [];
  private readonly beamGeo = new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  private readonly crescent = crescentGeometry();
  private readonly pts: { points: Points; pos: Float32Array; col: Float32Array; size: Float32Array; mat: ShaderMaterial }[];
  /** 全屏闪光（淘汰之刃斩杀） */
  flash = { color: '255,40,30', life: 0, max: 1 };

  constructor() {
    this.pts = [true, false].map((add) => {
      const g = new BufferGeometry();
      const pos = new Float32Array(MAX_PARTICLES * 3);
      const col = new Float32Array(MAX_PARTICLES * 4);
      const size = new Float32Array(MAX_PARTICLES);
      g.setAttribute('position', new BufferAttribute(pos, 3));
      g.setAttribute('aColor', new BufferAttribute(col, 4));
      g.setAttribute('aSize', new BufferAttribute(size, 1));
      g.setDrawRange(0, 0);
      const mat = particleMaterial(add);
      const points = new Points(g, mat);
      points.frustumCulled = false;
      points.renderOrder = add ? 6 : 5;
      this.group.add(points);
      return { points, pos, col, size, mat };
    });
  }

  clear(): void {
    this.particles = [];
    this.texts = [];
    for (const r of this.rings) this.releaseRing(r.decal);
    this.rings = [];
    for (const b of this.beams) this.releaseBeam(b.mesh);
    this.beams = [];
    for (const s of this.slashes) this.releaseSlash(s.mesh);
    this.slashes = [];
    for (const l of this.lines) this.releaseLine(l.mesh);
    this.lines = [];
    this.flash.life = 0;
  }

  // ---------- 基本特效 ----------
  /** 一团粒子。h = 离地高度；up = 额外的竖直初速度；grav = 重力（向下为正） */
  burst(x: number, z: number, h: number, n: number, color: number, speed: number, size: number, life = 0.6, add = true, o: { up?: number; grav?: number; drag?: number; flat?: boolean; grow?: number; a?: number } = {}): void {
    const c = rgb(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = o.flat ? (Math.random() - 0.5) * 0.4 : Math.random() * 1.2 - 0.2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y: h, z, vx: Math.cos(a) * Math.cos(el) * s, vy: Math.sin(el) * s + (o.up ?? 0), vz: Math.sin(a) * Math.cos(el) * s,
        life: life * (0.7 + Math.random() * 0.3), max: life, size: size * (0.6 + Math.random() * 0.8), grow: o.grow ?? 0,
        c, a: o.a ?? 1, drag: o.drag ?? 3, grav: o.grav ?? 0, add,
      });
    }
  }

  /** 单个粒子（拖尾、飘散） */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, add = true, grow = 0, a = 1): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, c: rgb(color), a, drag: 2, grav: 0, add });
  }

  private takeRing(): RingDecal {
    const d = this.ringPool.pop() ?? new RingDecal(true, 3);
    if (!d.mesh.parent) this.group.add(d.mesh);
    return d;
  }
  private releaseRing(d: RingDecal): void {
    d.hide();
    this.ringPool.push(d);
  }

  /** 贴地扩散的冲击环 */
  ring(x: number, z: number, r0: number, r1: number, color: number, life = 0.5, width = 16): void {
    this.rings.push({ decal: this.takeRing(), x, z, r0, r1, life, max: life, color, width, fill: 0 });
  }

  /** 贴地闪光：一个实心的发光圆盘，略微扩大后淡出（闪烁的起点 / 终点、落雷点） */
  decalFlash(x: number, z: number, radius: number, color: number, life = 0.35): void {
    this.rings.push({ decal: this.takeRing(), x, z, r0: radius * 0.75, r1: radius, life, max: life, color, width: radius * 0.35, fill: 0.85 });
  }

  /**
   * 折线 / 闪电：pts 是 sim 坐标 + 世界高度的点列。jag > 0 时在每两个点之间插 segs 段随机折点（振幅 jag），
   * flicker > 0 时整体闪烁（宙斯的电弧）。一次性的，life 秒内淡出。
   */
  line(pts: LinePoint[], color: number, width: number, life: number, o: { jag?: number; segs?: number; flicker?: number } = {}): void {
    if (pts.length < 2) return;
    const out: { x: number; y: number; z: number }[] = [];
    const jag = o.jag ?? 0;
    const segs = jag > 0 ? Math.max(1, o.segs ?? 6) : 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let k = 0; k < segs; k++) {
        const t = k / segs;
        const off = k === 0 ? 0 : jag;
        out.push({
          x: a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 2 * off,
          y: a.h + (b.h - a.h) * t + (Math.random() - 0.5) * 2 * off,
          z: a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 2 * off,
        });
      }
    }
    const last = pts[pts.length - 1];
    out.push({ x: last.x, y: last.h, z: last.y });
    const mat = this.linePool.pop() ?? lineMaterial();
    mat.uniforms.uColor.value.set(color);
    mat.uniforms.uOpacity.value = 1;
    const mesh = new Mesh(lineGeometry(out, width), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    this.group.add(mesh);
    this.lines.push({ mesh, life, max: life, flicker: o.flicker ?? 0 });
  }

  private releaseLine(m: Mesh<BufferGeometry, ShaderMaterial>): void {
    m.removeFromParent();
    m.geometry.dispose();
    this.linePool.push(m.material);
  }

  /** 光柱：外层彩色光柱 + 内层白色细芯 + 脚下的贴地闪光（比 beam 更亮，用于大招落点） */
  pillar(x: number, z: number, radius: number, height: number, color: number, life = 0.6): void {
    this.beam(x, z, radius, height, color, life);
    this.beam(x, z, radius * 0.4, height * 1.1, 0xffffff, life * 0.8);
    this.decalFlash(x, z, radius * 1.8, color, life * 0.7);
  }

  private takeBeam(): Mesh<CylinderGeometry, ShaderMaterial> {
    const m = this.beamPool.pop() ?? new Mesh(this.beamGeo, beamMaterial());
    m.renderOrder = 7;
    m.visible = true;
    if (!m.parent) this.group.add(m);
    return m;
  }
  private releaseBeam(m: Mesh): void {
    m.visible = false;
    this.beamPool.push(m as Mesh<CylinderGeometry, ShaderMaterial>);
  }

  /** 竖直光柱（升级、复活、回城、冲击波的外墙） */
  beam(x: number, z: number, radius: number, height: number, color: number, life = 0.7, grow = 0): void {
    const m = this.takeBeam();
    m.position.set(x, groundHeight(x, z), z);
    m.scale.set(radius, height, radius);
    m.material.uniforms.uColor.value.set(color);
    this.beams.push({ mesh: m, life, max: life, grow, r: radius });
  }

  private takeSlash(): Mesh<BufferGeometry, ShaderMaterial> {
    const m = this.slashPool.pop() ?? new Mesh(this.crescent, slashMaterial());
    m.renderOrder = 8;
    m.visible = true;
    if (!m.parent) this.group.add(m);
    return m;
  }
  private releaseSlash(m: Mesh): void {
    m.visible = false;
    this.slashPool.push(m as Mesh<BufferGeometry, ShaderMaterial>);
  }

  /**
   * 斩击弧：vertical = 竖直的劈砍（面向镜头），否则是水平横扫（反击螺旋）。
   * angle：竖直时是弧在屏幕上的倾斜角；水平时是起始朝向。
   */
  slash(x: number, z: number, h: number, size: number, color: number, life: number, vertical: boolean, angle: number, spin = 0): void {
    const m = this.takeSlash();
    m.position.set(x, h, z);
    m.scale.setScalar(size);
    if (vertical) m.rotation.set(-0.5, 0, angle);
    else m.rotation.set(-Math.PI / 2, 0, angle);
    m.material.uniforms.uColor.value.set(color);
    m.material.uniforms.uK.value = 0;
    this.slashes.push({ mesh: m, life, max: life, spin });
  }

  text(x: number, z: number, h: number, text: string, color: string, size = 26): void {
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + (Math.random() - 0.5) * 30, z, h, rise: 0, vy: 90, life: 0.9, max: 0.9, text, color, size });
  }

  screenFlash(color: string, life: number): void {
    this.flash = { color, life, max: life };
  }

  // ---------- 事件 → 特效 ----------
  consume(events: SimEvent[], world: World, playerId: number | null, cam: Camera3D, heightOf: HeightOf): void {
    const player = world.getUnit(playerId);
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          const t = world.getUnit(e.targetId);
          if (!t || !cam.visible(t.pos)) break;
          const H = heightOf(t);
          const gy = groundHeight(t.pos.x, t.pos.y);
          const involvesPlayer = playerId !== null && (e.sourceId === playerId || e.targetId === playerId);
          if (involvesPlayer || t.kind === 'hero' || e.crit || e.amount >= 100) {
            const color = e.crit ? '#ff4d3d' : e.damageType === 'magical' ? '#7cc4ff' : e.damageType === 'pure' ? '#ffd54a' : '#ffffff';
            this.text(t.pos.x, t.pos.y, gy + H + 20, `${Math.round(e.amount)}${e.crit ? '!' : ''}`, color, e.crit ? 40 : involvesPlayer ? 28 : 22);
          }
          if (e.isAttack) {
            const hh = t.kind === 'building' ? Math.min(160, H * 0.45) : H * 0.55;
            this.burst(t.pos.x, t.pos.y, gy + hh, 6, 0xffb060, 260, 7, 0.28, true, { grav: 300 });
            this.burst(t.pos.x, t.pos.y, gy + hh, 3, 0xc02818, 140, 9, 0.35, false, { grav: 400 });
          }
          break;
        }
        case 'heal': {
          const t = world.getUnit(e.targetId);
          if (t && t.kind === 'hero' && e.amount >= 25 && cam.visible(t.pos)) this.text(t.pos.x, t.pos.y, heightOf(t) + 20, `+${Math.round(e.amount)}`, '#6dff7a', 22);
          break;
        }
        case 'miss': {
          const t = world.getUnit(e.targetId);
          if (t && cam.visible(t.pos)) this.text(t.pos.x, t.pos.y, heightOf(t) + 20, '未命中', '#bbbbbb', 20);
          break;
        }
        case 'death': {
          const u = world.getUnit(e.unitId);
          if (!u || !cam.visible(u.pos)) break;
          const gy = groundHeight(u.pos.x, u.pos.y);
          if (u.kind === 'hero') {
            this.burst(u.pos.x, u.pos.y, gy + 90, 40, 0xc81e1e, 320, 12, 0.9, false, { grav: 500 });
            this.burst(u.pos.x, u.pos.y, gy + 20, 18, 0x8a7a66, 160, 30, 1.1, false, { up: 60, flat: true, grow: 30, a: 0.5 });
            this.ring(u.pos.x, u.pos.y, 20, 200, 0xff3c28, 0.6, 18);
          } else if (u.kind !== 'building') {
            this.burst(u.pos.x, u.pos.y, gy + 50, 10, 0xa01e1e, 200, 8, 0.5, false, { grav: 500 });
            this.burst(u.pos.x, u.pos.y, gy + 10, 7, 0x8a7a66, 90, 22, 0.9, false, { up: 40, flat: true, grow: 25, a: 0.45 });
          }
          break;
        }
        case 'buildingDestroyed': {
          const u = world.getUnit(e.unitId);
          if (!u) break;
          const gy = groundHeight(u.pos.x, u.pos.y);
          this.burst(u.pos.x, u.pos.y, gy + 150, 90, 0xffaa3c, 520, 16, 1.2, true, { grav: 200 });
          this.burst(u.pos.x, u.pos.y, gy + 60, 50, 0x5a5550, 380, 14, 1.6, false, { up: 250, grav: 700 });
          this.burst(u.pos.x, u.pos.y, gy + 20, 30, 0x8a8070, 200, 60, 2.2, false, { up: 50, flat: true, grow: 50, a: 0.5 });
          this.ring(u.pos.x, u.pos.y, 40, 480, 0xffbe5a, 0.8, 30);
          this.beam(u.pos.x, u.pos.y, u.radius * 1.2, 500, 0xffb050, 0.6);
          if (cam.visible(u.pos)) cam.shake(28);
          break;
        }
        case 'gold': {
          if (e.unitId === playerId && player && e.amount >= 5) this.text(player.pos.x + 40, player.pos.y, heightOf(player) + 50, `+${e.amount}`, '#ffcc33', 22);
          break;
        }
        case 'levelUp': {
          const u = world.getUnit(e.unitId);
          if (!u || !cam.visible(u.pos)) break;
          this.ring(u.pos.x, u.pos.y, 10, 170, 0xffd75a, 0.8, 14);
          this.beam(u.pos.x, u.pos.y, 60, 320, 0xffd060, 0.9);
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 40;
            this.emit(u.pos.x + Math.cos(a) * r, groundHeight(u.pos.x, u.pos.y) + Math.random() * 60, u.pos.y + Math.sin(a) * r, 0, 160 + Math.random() * 120, 0, 0xffe080, 8, 0.9);
          }
          if (u.id === playerId) this.text(u.pos.x, u.pos.y, heightOf(u) + 70, '升级！', '#ffe070', 34);
          break;
        }
        case 'respawn': {
          const u = world.getUnit(e.unitId);
          if (!u) break;
          this.ring(u.pos.x, u.pos.y, 10, 150, 0xa0dcff, 0.7, 12);
          this.beam(u.pos.x, u.pos.y, 55, 380, 0x90d0ff, 1.0);
          break;
        }
        case 'fx':
          this.fxEvent(e, world, cam, heightOf, playerId);
          break;
        default:
          break;
      }
    }
  }

  private fxEvent(e: Extract<SimEvent, { type: 'fx' }>, world: World, cam: Camera3D, heightOf: HeightOf, playerId: number | null): void {
    // 先查注册表（各英雄的 fx/<id>.ts、通用的 fx/common.ts），没有再走内置分支
    const h = lookupFx(e.kind);
    if (h) {
      h(e, { fx: this, world, cam, heightOf, playerId });
      return;
    }
    const { x, y } = e.pos;
    const gy = groundHeight(x, y);
    switch (e.kind) {
      case 'axe_call': {
        // 狂战士之吼：红色冲击波（两道环 + 一圈矮光墙 + 向外飞散的火星）
        const r = e.radius ?? 315;
        this.ring(x, y, 30, r, 0xff3a28, 0.55, 55);
        this.ring(x, y, 10, r * 0.75, 0xffa050, 0.4, 26);
        this.ring(x, y, r * 0.9, r * 1.08, 0xff6040, 0.7, 14);
        this.beam(x, y, 40, 150, 0xff4a30, 0.5, r);
        this.burst(x, y, gy + 10, 24, 0x8a7a66, 380, 22, 0.8, false, { flat: true, up: 20, grow: 30, a: 0.45 });
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          const s = 500 + Math.random() * 250;
          this.emit(x + Math.cos(a) * 30, gy + 40 + Math.random() * 40, y + Math.sin(a) * 30, Math.cos(a) * s, 40, Math.sin(a) * s, 0xff6a40, 10, 0.45);
        }
        if (cam.visible(e.pos)) cam.shake(10);
        break;
      }
      case 'axe_helix': {
        // 反击螺旋：两道水平的旋风斩 + 切向飞出的火星
        const r = e.radius ?? 275;
        this.ring(x, y, r * 0.5, r, 0xff2a1e, 0.35, 30);
        this.slash(x, y, gy + 70, r * 0.85, 0xff4a30, 0.38, false, Math.random() * 6.28, 16);
        this.slash(x, y, gy + 50, r * 0.7, 0xffa060, 0.32, false, Math.random() * 6.28, 18);
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          this.emit(x + Math.cos(a) * r * 0.6, gy + 60, y + Math.sin(a) * r * 0.6, -Math.sin(a) * 600, 30, Math.cos(a) * 600, 0xff7a5a, 9, 0.35);
        }
        break;
      }
      case 'axe_hunger': {
        const t = world.getUnit(e.targetId);
        const p = t?.pos ?? e.pos;
        const h = t ? heightOf(t) : 120;
        this.burst(p.x, p.y, groundHeight(p.x, p.y) + h * 0.8, 22, 0xff2a2a, 200, 9, 0.6, true, { up: 80 });
        this.ring(p.x, p.y, 10, 90, 0xff2020, 0.4, 10);
        break;
      }
      case 'axe_cull':
      case 'axe_cull_kill': {
        const kill = e.kind === 'axe_cull_kill';
        const t = world.getUnit(e.targetId);
        const h = (t ? heightOf(t) : 160) * 0.6;
        this.slash(x, y, gy + h, kill ? 170 : 120, kill ? 0xff2a1a : 0xff9a60, 0.42, true, -0.9);
        if (kill) this.slash(x, y, gy + h, 140, 0xffd0a0, 0.3, true, 0.9);
        this.burst(x, y, gy + h, kill ? 70 : 28, 0xff3a20, kill ? 520 : 320, 11, 0.7, true, { grav: 300 });
        if (kill) {
          this.burst(x, y, gy + h, 40, 0x8a0a0a, 300, 12, 1.0, false, { grav: 600 });
          this.ring(x, y, 20, 260, 0xff2010, 0.6, 26);
          this.beam(x, y, 70, 420, 0xff2a1a, 0.5);
          this.text(x, y, gy + h * 2 + 80, '淘汰！', '#ff3b2f', 44);
          if (cam.visible(e.pos)) this.screenFlash('255,30,20', 0.35);
        }
        if (cam.visible(e.pos)) cam.shake(kill ? 22 : 10);
        break;
      }
      case 'recall':
        this.ring(x, y, 10, 160, 0x78beff, 0.6, 12);
        this.beam(x, y, 50, 300, 0x80c8ff, 0.6);
        this.burst(x, y, gy + 40, 24, 0x96d2ff, 220, 8, 0.6, true, { up: 150 });
        break;
      default:
        this.ring(x, y, 10, e.radius ?? 120, 0xffffff, 0.4, 10);
    }
  }

  // ---------- 每帧 ----------
  update(dt: number, viewH: number, fovRad: number): void {
    const ps = this.particles;
    for (const p of ps) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.size += p.grow * dt;
      const floor = groundHeight(p.x, p.z) + 2;
      if (p.y < floor) {
        p.y = floor;
        p.vy *= -0.3;
      }
    }
    this.particles = ps.filter((p) => p.life > 0);
    // 写入两组 Points 的缓冲区
    const scale = viewH / (2 * Math.tan(fovRad / 2));
    const n = [0, 0];
    for (const p of this.particles) {
      const set = p.add ? 0 : 1;
      const buf = this.pts[set];
      const i = n[set]++;
      buf.pos[i * 3] = p.x;
      buf.pos[i * 3 + 1] = p.y;
      buf.pos[i * 3 + 2] = p.z;
      const fade = Math.max(0, p.life / p.max);
      buf.col[i * 4] = p.c[0];
      buf.col[i * 4 + 1] = p.c[1];
      buf.col[i * 4 + 2] = p.c[2];
      buf.col[i * 4 + 3] = p.a * Math.min(1, fade * 1.6);
      buf.size[i] = p.size * 3;
    }
    this.pts.forEach((b, s) => {
      const g = b.points.geometry;
      g.setDrawRange(0, n[s]);
      b.points.visible = n[s] > 0;
      b.mat.uniforms.uScale.value = scale;
      if (n[s] > 0) {
        for (const name of ['position', 'aColor', 'aSize']) {
          const attr = g.getAttribute(name) as BufferAttribute;
          attr.clearUpdateRanges();
          attr.addUpdateRange(0, n[s] * attr.itemSize);
          attr.needsUpdate = true;
        }
      }
    });

    for (const t of this.texts) {
      t.life -= dt;
      t.rise += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);

    for (const r of this.rings) {
      r.life -= dt;
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      r.decal.set(r.x, groundHeight(r.x, r.z) + 3, r.z, rad, { color: r.color, opacity: Math.max(0, 1 - k), width: r.width * (1 - k * 0.6), soft: 6, fill: r.fill });
    }
    for (const r of this.rings) if (r.life <= 0) this.releaseRing(r.decal);
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const b of this.beams) {
      b.life -= dt;
      const k = 1 - b.life / b.max;
      b.mesh.material.uniforms.uOpacity.value = Math.max(0, 1 - k) * 0.9;
      if (b.grow > 0) {
        const r = b.r + (b.grow - b.r) * (1 - (1 - k) * (1 - k));
        b.mesh.scale.x = b.mesh.scale.z = r;
      }
    }
    for (const b of this.beams) if (b.life <= 0) this.releaseBeam(b.mesh);
    this.beams = this.beams.filter((b) => b.life > 0);

    for (const s of this.slashes) {
      s.life -= dt;
      s.mesh.material.uniforms.uK.value = Math.min(1, 1 - s.life / s.max);
      if (s.spin) s.mesh.rotation.z += s.spin * dt;
    }
    for (const s of this.slashes) if (s.life <= 0) this.releaseSlash(s.mesh);
    this.slashes = this.slashes.filter((s) => s.life > 0);

    for (const l of this.lines) {
      l.life -= dt;
      const k = Math.max(0, l.life / l.max);
      const fl = l.flicker > 0 ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(l.life * 90)) : 1;
      l.mesh.material.uniforms.uOpacity.value = Math.min(1, k * 1.5) * fl;
    }
    for (const l of this.lines) if (l.life <= 0) this.releaseLine(l.mesh);
    this.lines = this.lines.filter((l) => l.life > 0);

    this.flash.life = Math.max(0, this.flash.life - dt);
  }

  /** 在界面层上画飘字（k = CSS 像素 / 界面单位，与 2D 镜头的 scale 一致） */
  drawTexts(ctx: CanvasRenderingContext2D, cam: Camera3D, k: number, uiScale: number): void {
    const out = { x: 0, y: 0, depth: 0 };
    for (const t of this.texts) {
      cam.project(t.x, t.z, t.h, out);
      if (out.x < -100 || out.x > cam.viewW + 100 || out.y < -100 || out.y > cam.viewH + 100) continue;
      drawFloatText(ctx, t.text, t.color, t.size, t.life / t.max, out.x / k, out.y / k - t.rise, uiScale);
    }
    ctx.globalAlpha = 1;
  }

  get particleCount(): number {
    return this.particles.length;
  }
}

import {
  CanvasTexture, Color, DirectionalLight, DynamicDrawUsage, Fog, Group, HemisphereLight, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, NoToneMapping, Object3D, PCFShadowMap, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
  type BufferGeometry, type Material, type ShaderMaterial,
} from 'three';
import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Projectile } from '../sim/entities/projectile';
import type { SimEvent } from '../sim/core/events';
import type { Vec2 } from '../sim/core/vec2';
import { Team } from '../sim/core/types';
import { VIEW_WORLD_HEIGHT } from '../render/camera';
import type { AimIndicator, GameRenderer } from '../render/view';
import { drawBars, killMarkerFor } from '../render/unitDraw';
import { Camera3D, CAM3D } from './camera3d';
import { facingToRotY, groundHeight } from './coords';
import { MapScene } from './mapScene';
import { Fx3D } from './fx3d';
import { AnimTracker, animInput, turnToward, type AnimInput } from './anim';
import { AXE_SCALE, AxeModel } from './models/axe';
import { buildCreepRig, creepHeadHeight, poseCreep, type CreepRig } from './models/creeps';
import { buildBuilding, makeHalo, rubbleMesh, shieldGeometry, shieldMaterial, towerHeight, type BuildingParts } from './models/buildings';
import { cachedGeo } from './models/rig';
import { flatQuad, flatStrip, makeRingMaterial, RingDecal } from './decals';
import { makeGlow, makeLambert, makeToon, teamColor, teamLight } from './materials';
import { GeoBuilder } from './geo';
import { arcFor, homingProgress, projectileHeight } from './projectileArc';

/** 太阳方向（指向光源）：从西北上方照下来，影子落向屏幕右下方 */
const SUN_DIR = new Vector3(-0.42, 1, -0.5).normalize();
const SUN_DIST = 3000;
/** 技能释放后收招动作的时长 */
const RELEASE_DUR: Record<string, number> = { axe_berserkers_call: 0.65, axe_battle_hunger: 0.45, axe_culling_blade: 0.6 };
const HELIX_DUR = 0.38;
/** 死亡动画播完（倒地 + 沉入地面）后隐藏 */
const HERO_CORPSE_TIME = 3.4;
const CREEP_CORPSE_TIME = 1.5;
const DEG = Math.PI / 180;
/** 建筑挡住身后英雄时的不透明度 */
const FADE_OPACITY = 0.38;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

interface Anchor { u: Unit; x: number; y: number; h: number }

// ---------- 英雄 ----------
class HeroView {
  readonly model: AxeModel;
  readonly mat: ReturnType<typeof makeToon>;
  readonly tracker = new AnimTracker();
  readonly ring = new RingDecal(false, 2);
  readonly meRing = new RingDecal(true, 2);
  readonly channel = new RingDecal(true, 3);
  facing: number;
  x = 0;
  y = 0;
  /** 边缘光（受击时变红） */
  private readonly baseRim: Color;

  constructor(readonly u: Unit, parent: Group) {
    this.mat = makeToon({ rim: 0xfff0dc, rimStrength: 0.3, key: 'hero' });
    this.baseRim = this.mat.rimU.value.clone();
    this.model = new AxeModel(u.team, this.mat);
    this.facing = u.facing;
    parent.add(this.model.root, this.ring.mesh, this.meRing.mesh, this.channel.mesh);
  }

  update(world: World, p: Vec2, dt: number, alpha: number, time: number, isPlayer: boolean): void {
    const u = this.u;
    this.tracker.update(animInput(u), dt, alpha);
    const tr = this.tracker;
    if (u.alive) this.facing = turnToward(this.facing, u.facing, 14, dt);
    this.x = p.x;
    this.y = p.y;
    const gy = groundHeight(p.x, p.y);
    const root = this.model.root;
    const visible = u.alive || tr.deadTime < HERO_CORPSE_TIME;
    root.visible = visible;
    root.position.set(p.x, gy, p.y);
    root.rotation.y = facingToRotY(this.facing);
    const pop = tr.pop > 0 ? 1 + 0.18 * Math.sin(tr.pop * Math.PI) : 1;
    root.scale.setScalar(AXE_SCALE * pop);
    if (visible) this.model.pose(tr, time, u.id * 1.7);
    // 受击闪红 + 边缘光
    const f = tr.flash;
    this.mat.emissive.setRGB(0.55 * f, 0.12 * f, 0.08 * f);
    this.mat.rimU.value.copy(this.baseRim).lerp(new Color(1.2, 0.5, 0.4), f);
    const ringA = u.alive ? 1 : 0;
    this.ring.set(p.x, gy + 1.5, p.y, 54, { color: teamColor(u.team), opacity: 0.95 * ringA, width: 9, soft: 3, fill: 0.16 });
    if (isPlayer && u.alive) this.meRing.set(p.x, gy + 1.6, p.y, 62, { color: 0xffffff, opacity: 0.35 + 0.25 * Math.sin(time * 5), width: 4, soft: 3 });
    else this.meRing.hide();
    // 回城 / 引导进度圈
    let prog = -1;
    let color = 0xffdc78;
    if (u.order.kind === 'recall') {
      prog = 1 - u.order.remaining / Math.max(0.001, world.balance.hero.recallTime);
      color = 0x78beff;
    } else if (u.cast?.phase === 'channel' && u.cast.channelTotal > 0) {
      prog = 1 - u.cast.timer / u.cast.channelTotal;
    }
    if (prog >= 0 && u.alive) this.channel.set(p.x, gy + 2, p.y, 64, { color, opacity: 0.95, width: 9, progress: Math.max(0.001, Math.min(1, prog)), soft: 3 });
    else this.channel.hide();
  }

  dispose(): void {
    this.model.root.removeFromParent();
    this.model.dispose();
    for (const d of [this.ring, this.meRing, this.channel]) {
      d.mesh.removeFromParent();
      d.dispose();
    }
    this.mat.dispose();
  }
}

// ---------- 小兵（实例化绘制） ----------
class CreepView {
  readonly rig: CreepRig;
  readonly tracker = new AnimTracker();
  facing: number;
  wheel = 0;
  x: number;
  y: number;
  gone = false;
  constructor(readonly u: Unit) {
    this.rig = buildCreepRig(u.creep?.type ?? 'melee', u.team);
    this.facing = u.facing;
    this.x = u.pos.x;
    this.y = u.pos.y;
  }
}

const DEAD_INPUT: AnimInput = { alive: false, speed: 0, windup: -1, attackPoint: 1, castAbility: null, castProgress: 0, channel: false, stunned: false, taunted: false };

/** 按"部件 key"共享的实例化网格；每帧重新写入可见小兵的部件矩阵 */
class CreepInstances {
  private meshes = new Map<string, { mesh: InstancedMesh; n: number }>();
  private readonly ringMat = makeRingMaterial(false);

  constructor(private readonly parent: Group, private readonly mats: Material[], private readonly glow: Material) {
    this.ringMat.uniforms.uWidth.value = 0.16;
    this.ringMat.uniforms.uSoft.value = 0.08;
    this.ringMat.uniforms.uFill.value = 0.12;
    this.ringMat.uniforms.uOpacity.value = 0.8;
  }

  begin(): void {
    for (const m of this.meshes.values()) m.n = 0;
  }

  private get(key: string, geo: BufferGeometry, mat: Material, shadow: boolean): { mesh: InstancedMesh; n: number } {
    let e = this.meshes.get(key);
    if (!e) {
      e = { mesh: this.make(geo, mat, 48, shadow), n: 0 };
      this.meshes.set(key, e);
    } else if (e.n >= e.mesh.instanceMatrix.count) {
      // 扩容：新建一个两倍容量的网格，拷贝本帧已经写入的数据
      const old = e.mesh;
      const mesh = this.make(geo, mat, old.instanceMatrix.count * 2, shadow);
      (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      (mesh.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      old.removeFromParent();
      old.dispose();
      e.mesh = mesh;
    }
    return e;
  }

  private make(geo: BufferGeometry, mat: Material, cap: number, shadow: boolean): InstancedMesh {
    const mesh = new InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    // 实例每帧都在动，包围球会过期：关闭网格级剔除，由渲染器按镜头可见范围筛选小兵
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    this.parent.add(mesh);
    return mesh;
  }

  push(key: string, geo: BufferGeometry, glow: boolean, team: number, m: Matrix4, color: Color): void {
    const e = this.get(`${key}#${team}`, geo, glow ? this.glow : this.mats[team], !glow);
    e.mesh.setMatrixAt(e.n, m);
    e.mesh.setColorAt(e.n, color);
    e.n++;
  }

  ring(m: Matrix4, color: Color): void {
    const e = this.get('ring', flatQuad(), this.ringMat, false);
    e.mesh.renderOrder = 2;
    e.mesh.setMatrixAt(e.n, m);
    e.mesh.setColorAt(e.n, color);
    e.n++;
  }

  end(): void {
    for (const e of this.meshes.values()) {
      e.mesh.count = e.n;
      e.mesh.visible = e.n > 0;
      if (e.n > 0) {
        e.mesh.instanceMatrix.clearUpdateRanges();
        e.mesh.instanceMatrix.addUpdateRange(0, e.n * 16);
        e.mesh.instanceMatrix.needsUpdate = true;
        e.mesh.instanceColor!.clearUpdateRanges();
        e.mesh.instanceColor!.addUpdateRange(0, e.n * 3);
        e.mesh.instanceColor!.needsUpdate = true;
      }
    }
  }
}

// ---------- 建筑 ----------
class BuildingView {
  readonly parts: BuildingParts;
  readonly rubble: Mesh;
  readonly shield: Mesh | null;
  /** 每座建筑一份材质：挡住身后的英雄时单独变半透明 */
  readonly mat = makeToon({ rimStrength: 0.15, key: 'building' });
  destroyed = false;
  smoke = 0;
  /** 当前不透明度（挡住英雄时淡到 FADE_OPACITY） */
  opacity = 1;
  constructor(readonly u: Unit, parent: Group, rubbleMat: Material, shieldMat: ShaderMaterial) {
    const st = u.building!;
    this.parts = buildBuilding(st.type, u.team, st.tier, this.mat);
    const mat = rubbleMat;
    const g = this.parts.group;
    g.position.set(u.pos.x, groundHeight(u.pos.x, u.pos.y), u.pos.y);
    // 塔身朝向随位置略有不同，避免完全一样
    g.rotation.y = (u.id % 4) * 0.2;
    parent.add(g);
    this.rubble = rubbleMesh(st.type, u.team, u.radius, mat);
    this.rubble.position.copy(g.position);
    this.rubble.visible = false;
    parent.add(this.rubble);
    if (st.type !== 'fountain') {
      this.shield = new Mesh(shieldGeometry(), shieldMat);
      const r = u.radius * (st.type === 'ancient' ? 1.45 : 1.5);
      this.shield.scale.set(r, st.type === 'ancient' ? this.parts.crystalY + 90 : this.parts.crystalY + 60, r);
      this.shield.position.copy(g.position);
      this.shield.renderOrder = 9;
      parent.add(this.shield);
    } else this.shield = null;
  }

  /** occluding：这一帧是否挡住了身后的英雄 */
  fade(occluding: boolean, dt: number): void {
    const target = occluding ? FADE_OPACITY : 1;
    this.opacity += (target - this.opacity) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.opacity - target) < 0.01) this.opacity = target;
    const m = this.mat;
    const see = this.opacity < 0.999;
    if (m.transparent !== see) {
      m.transparent = see;
      m.depthWrite = !see;
      m.needsUpdate = true;
    }
    m.opacity = this.opacity;
  }

  update(time: number, dt: number, fx: Fx3D): void {
    const u = this.u;
    if (!u.alive && !this.destroyed) {
      this.destroyed = true;
      this.parts.group.visible = false;
      this.rubble.visible = true;
    }
    if (this.shield) this.shield.visible = u.alive && u.hasState('invulnerable');
    if (this.destroyed) return;
    const p = this.parts;
    if (p.crystal) {
      p.crystal.rotation.y = time * 0.9 + u.id;
      p.crystal.position.y = p.crystalY + Math.sin(time * 2 + u.id) * 6;
    }
    if (p.halo) {
      const s = (u.building!.type === 'ancient' ? 360 : u.building!.type === 'fountain' ? 150 : 170) * (0.9 + 0.1 * Math.sin(time * 3 + u.id));
      p.halo.scale.set(s, s, 1);
      p.halo.position.y = p.crystal ? p.crystal.position.y : p.crystalY;
    }
    // 血量低于一半时冒烟
    if (u.building!.type !== 'fountain' && u.hp < u.stats.maxHp * 0.5 && dt > 0) {
      this.smoke -= dt;
      if (this.smoke <= 0) {
        this.smoke = 0.12 + (u.hp / u.stats.maxHp) * 0.3;
        const a = Math.random() * Math.PI * 2;
        fx.emit(u.pos.x + Math.cos(a) * 30, p.group.position.y + p.crystalY * 0.75, u.pos.y + Math.sin(a) * 30, 10, 90, -8, 0x4a4440, 26, 1.8, false, 30, 0.45);
      }
    }
  }

  dispose(): void {
    this.parts.group.removeFromParent();
    this.rubble.removeFromParent();
    this.shield?.removeFromParent();
    this.parts.halo?.material.dispose();
    this.mat.dispose();
  }
}

// ---------- 弹道 ----------
interface ProjView { obj: Object3D; h0: number; h1: number; d0: number; arc: number; trail: number; color: number; additive: boolean }

/** 单位头顶状态标记（战斗饥渴、嘲讽、眩晕）的对象池 */
class Marks {
  private pools: Record<string, Object3D[]> = { hunger: [], taunt: [], stun: [] };
  private used: Record<string, number> = { hunger: 0, taunt: 0, stun: 0 };
  private tauntTex: CanvasTexture | null = null;
  constructor(private readonly parent: Group) {}

  begin(): void {
    for (const k in this.used) this.used[k] = 0;
  }

  private make(kind: string): Object3D {
    const g = new Group();
    if (kind === 'hunger') {
      // 战斗饥渴：胸口高度环绕的红色碎片 + 红色光晕 + 脚下脉动的红圈
      g.add(makeHalo(0xff2a20, 90, 0.7));
      const mat = makeGlow(0xff3a2a);
      for (let i = 0; i < 4; i++) {
        const m = new Mesh(cachedGeo('mark:shard', () => new GeoBuilder(7).octa(8, 0xffffff, { s: [0.55, 1.7, 0.55], jitter: 0 }).build()), mat);
        const a = (i / 4) * Math.PI * 2;
        m.position.set(Math.cos(a) * 42, (i % 2) * 14, Math.sin(a) * 42);
        m.rotation.z = 0.5;
        g.add(m);
      }
      const ring = new RingDecal(true, 3);
      ring.set(0, 0, 0, 58, { color: 0xff2a1a, opacity: 0.8, width: 10, soft: 4, fill: 0.15 });
      ring.mesh.name = 'ground';
      g.add(ring.mesh);
    } else if (kind === 'taunt') {
      if (!this.tauntTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d')!;
        x.font = 'bold 54px sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.lineWidth = 8;
        x.strokeStyle = '#300';
        x.strokeText('!', 32, 34);
        x.fillStyle = '#ff3a2a';
        x.fillText('!', 32, 34);
        this.tauntTex = new CanvasTexture(c);
        this.tauntTex.colorSpace = SRGBColorSpace;
      }
      const s = new Sprite(new SpriteMaterial({ map: this.tauntTex, depthTest: false, transparent: true }));
      s.scale.set(34, 34, 1);
      s.renderOrder = 10;
      g.add(s);
    } else {
      const mat = makeGlow(0xffe060);
      for (let i = 0; i < 4; i++) {
        const m = new Mesh(cachedGeo('mark:star', () => new GeoBuilder(8).octa(6, 0xffffff, { s: [1, 1, 0.4], jitter: 0 }).build()), mat);
        const a = (i / 4) * Math.PI * 2;
        m.position.set(Math.cos(a) * 26, 0, Math.sin(a) * 26);
        g.add(m);
      }
    }
    this.parent.add(g);
    return g;
  }

  /** gy：脚下地面高度（战斗饥渴的地面红圈用） */
  place(kind: 'hunger' | 'taunt' | 'stun', x: number, y: number, z: number, time: number, gy = 0): void {
    const pool = this.pools[kind];
    const i = this.used[kind]++;
    if (!pool[i]) pool[i] = this.make(kind);
    const o = pool[i];
    o.visible = true;
    o.position.set(x, y + (kind === 'taunt' ? 6 * Math.abs(Math.sin(time * 6)) : 0), z);
    if (kind !== 'taunt') o.rotation.y = time * (kind === 'stun' ? 4 : 2.5);
    const ground = o.getObjectByName('ground');
    if (ground) {
      ground.position.y = gy + 2 - y;
      const s = 1 + 0.12 * Math.sin(time * 7);
      ground.scale.set(58 * s, 1, 58 * s);
    }
  }

  end(): void {
    for (const k in this.pools) for (let i = this.used[k]; i < this.pools[k].length; i++) this.pools[k][i].visible = false;
  }
}

/** 手动瞄准的贴地指示器 */
class AimDecals {
  readonly range = new RingDecal(false, 4);
  readonly area = new RingDecal(false, 4);
  readonly target = new RingDecal(true, 4);
  readonly rect: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly line: Mesh<BufferGeometry, MeshBasicMaterial>;

  constructor(parent: Group) {
    const mk = () => {
      const m = new Mesh(flatStrip(), new MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }));
      m.renderOrder = 4;
      m.frustumCulled = false;
      return m;
    };
    this.rect = mk();
    this.line = mk();
    parent.add(this.range.mesh, this.area.mesh, this.target.mesh, this.rect, this.line);
    this.hide();
  }

  hide(): void {
    this.range.hide();
    this.area.hide();
    this.target.hide();
    this.rect.visible = false;
    this.line.visible = false;
  }

  update(aim: AimIndicator | null, world: World, time: number): void {
    this.hide();
    if (!aim) return;
    const color = aim.cancel ? 0xff5050 : 0x78c8ff;
    const o = aim.origin;
    const gy = Math.max(0, groundHeight(o.x, o.y)) + 3;
    this.range.set(o.x, gy, o.y, aim.range, { color, opacity: 0.7, width: 7, dash: Math.max(12, Math.round(aim.range / 45)), dashOffset: -time * 0.6, fill: aim.kind === 'none' ? 0.18 : 0.04, soft: 2 });
    if (aim.kind === 'direction' && aim.dir) {
      const w = aim.width ?? 100;
      this.rect.visible = true;
      this.rect.position.set(o.x, gy + 0.5, o.y);
      this.rect.rotation.y = -Math.atan2(aim.dir.y, aim.dir.x);
      this.rect.scale.set(aim.range, 1, w);
      this.rect.material.color.set(color);
      this.rect.material.opacity = 0.32;
    }
    if (aim.kind === 'point' && aim.point) {
      this.area.set(aim.point.x, Math.max(0, groundHeight(aim.point.x, aim.point.y)) + 3.5, aim.point.y, aim.radius ?? 150, { color, opacity: 0.9, width: 8, fill: 0.3, soft: 2 });
    }
    if (aim.kind === 'unit' && aim.targetId !== undefined) {
      const t = world.getUnit(aim.targetId);
      if (t) {
        this.target.set(t.pos.x, Math.max(0, groundHeight(t.pos.x, t.pos.y)) + 3.5, t.pos.y, t.radius * 2.4, { color, opacity: 1, width: 9, soft: 2 });
        const dx = t.pos.x - o.x, dy = t.pos.y - o.y;
        this.line.visible = true;
        this.line.position.set(o.x, gy + 0.6, o.y);
        this.line.rotation.y = -Math.atan2(dy, dx);
        this.line.scale.set(Math.hypot(dx, dy), 1, 10);
        this.line.material.color.set(color);
        this.line.material.opacity = 0.75;
      }
    }
  }
}

/**
 * Three.js 3D 渲染器：倾斜的透视镜头、卡通光照和阴影、程序生成的低多边形模型和地图。
 * 和 2D 渲染器一样只读取 World（以及消费事件队列），从不修改 World。
 * 血条、等级、斩杀标记和飘字画在 WebGL 画布上方的一层透明 2D 画布上（复用 2D 渲染器的 drawBars / drawFloatText）。
 */
export class Renderer3D implements GameRenderer {
  readonly kind = '3d' as const;
  readonly camera = new Camera3D();
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  private readonly sun: DirectionalLight;
  private readonly map: MapScene;
  readonly fx = new Fx3D();
  private readonly dyn = new Group();
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private readonly buildingMat = makeToon({ rimStrength: 0.15, key: 'building' });
  /** 小兵材质按阵营分两份（以后可以给两边不同的边缘光） */
  private readonly creepMats = [0, 1].map(() => makeToon({ rim: 0xfff0dc, rimStrength: 0.25, key: 'creep' }));
  private readonly shieldMat = shieldMaterial();
  private readonly creepInst: CreepInstances;
  private readonly marks: Marks;
  private readonly aimDecals: AimDecals;
  private world: World | null = null;
  private heroes = new Map<number, HeroView>();
  private creeps = new Map<number, CreepView>();
  private buildings = new Map<number, BuildingView>();
  private projs = new Map<number, ProjView>();
  private areas = new Map<number, RingDecal>();
  private areaPool: RingDecal[] = [];
  private anchors: Anchor[] = [];
  private time = 0;
  private overlayDpr = 1;
  private shadowBox = { l: -1, r: 1, b: -1, t: 1 };
  private readonly shadowSize: number;
  /** 最近一帧的绘制统计（性能测试读取） */
  readonly stats = { calls: 0, triangles: 0, creeps: 0, particles: 0 };
  private readonly tmpM = new Matrix4();
  private readonly tmpC = new Color();
  private readonly projGeo = {
    orb: new GeoBuilder(21).ico(7, 1, 0xffffff, { jitter: 0 }).build(),
    big: new GeoBuilder(22).ico(15, 1, 0xffffff, { jitter: 0 }).build(),
    rock: new GeoBuilder(23).dodeca(13, 0x7a6e62, { jitter: 0.15 }).build(),
  };
  private readonly projMats = new Map<string, Material>();

  constructor(canvas: HTMLCanvasElement) {
    const touch = isTouch();
    const dpr = Math.min(touch ? 1.5 : 2, window.devicePixelRatio || 1);
    this.gl = new WebGLRenderer({ canvas, antialias: dpr < 1.6, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.shadowSize = touch ? 1536 : 2048;

    const scene = this.scene;
    scene.background = new Color(0x141b12);
    scene.fog = new Fog(0x1a2216, 2600, 6200);
    scene.add(new HemisphereLight(0xd6e6ff, 0x5a4a34, 1.4));
    const sun = (this.sun = new DirectionalLight(0xfff0d8, 2.8));
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 1.5;
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = SUN_DIST + 2500;
    scene.add(sun, sun.target);

    this.map = new MapScene();
    scene.add(this.map.group, this.dyn, this.fx.group);
    const creepGlow = Object.assign(makeGlow(0xffffff), { vertexColors: true });
    this.creepInst = new CreepInstances(this.dyn, this.creepMats, creepGlow);
    this.marks = new Marks(this.dyn);
    this.aimDecals = new AimDecals(this.dyn);

    // 界面层：血条、等级、飘字
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'overlay-2d';
    Object.assign(this.overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
    canvas.after(this.overlay);
    this.octx = this.overlay.getContext('2d')!;
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.resize();
  }

  resize(): void {
    const touch = isTouch();
    const dpr = Math.min(touch ? 1.5 : 2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, true);
    this.camera.resize(w, h, dpr);
    this.overlayDpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlay.width = Math.round(w * this.overlayDpr);
    this.overlay.height = Math.round(h * this.overlayDpr);
    this.overlay.style.width = `${w}px`;
    this.overlay.style.height = `${h}px`;
    this.fitShadow();
  }

  /**
   * 阴影相机的范围：把镜头可见的地面四边形（含 300 高度，覆盖塔和树）转到光源坐标系，取外接矩形。
   * 只在窗口尺寸变化时算一次（相对镜头中心），每帧只平移并对齐到阴影贴图像素，镜头移动时影子边缘不闪烁。
   */
  private fitShadow(): void {
    const cx = this.camera.x, cy = this.camera.y;
    const view = new Matrix4().lookAt(SUN_DIR, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const inv = view.clone().invert();
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
    const v = new Vector3();
    for (const p of this.camera.footprint()) {
      for (const h of [0, 320]) {
        v.set(p.x - cx, h, p.y - cy).applyMatrix4(inv);
        l = Math.min(l, v.x); r = Math.max(r, v.x); b = Math.min(b, v.y); t = Math.max(t, v.y);
      }
    }
    const m = 120;
    this.shadowBox = { l: l - m, r: r + m, b: b - m, t: t + m };
    const c = this.sun.shadow.camera;
    c.left = this.shadowBox.l;
    c.right = this.shadowBox.r;
    c.bottom = this.shadowBox.b;
    c.top = this.shadowBox.t;
    c.updateProjectionMatrix();
  }

  private placeSun(): void {
    // 光源坐标系的两个轴
    const view = new Matrix4().lookAt(SUN_DIR, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const right = new Vector3().setFromMatrixColumn(view, 0);
    const up = new Vector3().setFromMatrixColumn(view, 1);
    const c = new Vector3(this.camera.x, 0, this.camera.y);
    const tx = (this.shadowBox.r - this.shadowBox.l) / this.shadowSize;
    const ty = (this.shadowBox.t - this.shadowBox.b) / this.shadowSize;
    const u = c.dot(right), w = c.dot(up);
    c.addScaledVector(right, Math.round(u / tx) * tx - u).addScaledVector(up, Math.round(w / ty) * ty - w);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(SUN_DIR, SUN_DIST);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  private reset(world: World | null): void {
    for (const v of this.heroes.values()) v.dispose();
    for (const v of this.buildings.values()) v.dispose();
    for (const p of this.projs.values()) p.obj.removeFromParent();
    for (const d of this.areas.values()) d.hide();
    this.areaPool.push(...this.areas.values());
    this.heroes.clear();
    this.creeps.clear();
    this.buildings.clear();
    this.projs.clear();
    this.areas.clear();
    this.fx.clear();
    this.world = world;
  }

  snapTo(world: World, followId: number | null): void {
    if (world !== this.world) this.reset(world);
    const u = world.getUnit(followId);
    if (u) this.camera.follow(u.pos, u.team, 0, true);
    this.fx.clear();
  }

  /** 单位的"身高"（头顶离地高度） */
  private heightOf = (u: Unit): number => {
    if (u.kind === 'hero') return AxeModel.HEAD_HEIGHT;
    if (u.kind === 'building') {
      const t = u.building!.type;
      return t === 'tower' ? towerHeight(u.building!.tier) + 60 : t === 'ancient' ? 330 : 180;
    }
    return creepHeadHeight(u.creep?.type ?? 'melee');
  };

  consume(events: SimEvent[], world: World, followId: number | null): void {
    if (world !== this.world) this.reset(world);
    for (const e of events) {
      if (e.type === 'damage') {
        this.heroes.get(e.targetId)?.tracker.hit();
        this.creeps.get(e.targetId)?.tracker.hit();
      } else if (e.type === 'cast') {
        this.heroes.get(e.unitId)?.tracker.trigger(e.abilityId, RELEASE_DUR[e.abilityId] ?? 0.4);
      } else if (e.type === 'fx' && e.kind === 'axe_helix' && e.unitId !== undefined) {
        this.heroes.get(e.unitId)?.tracker.trigger('helix', HELIX_DUR);
      } else if (e.type === 'respawn') {
        const v = this.heroes.get(e.unitId);
        if (v) v.tracker.pop = 1;
      }
    }
    this.fx.consume(events, world, followId, this.camera, this.heightOf);
  }

  render(world: World | null, alpha: number, followId: number | null, dt: number, aim: AimIndicator | null): void {
    this.time += dt;
    const time = this.time;
    if (world !== this.world) this.reset(world);
    if (!world) {
      this.gl.render(this.scene, this.camera.cam);
      this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      return;
    }
    const focus = world.getUnit(followId);
    if (focus) this.camera.follow(this.ipos(focus, alpha), focus.team, dt);
    else this.camera.follow({ x: this.camera.x, y: this.camera.y }, Team.Radiant, 0);
    const viewerTeam = focus?.team ?? Team.Radiant;
    this.placeSun();
    this.map.update(time);

    this.anchors.length = 0;
    this.syncUnits(world, alpha, dt, time, followId, viewerTeam);
    this.syncProjectiles(world, alpha, dt);
    this.syncAreas(world, time);
    this.aimDecals.update(aim, world, time);
    this.shieldMat.uniforms.uTime.value = time;
    this.fx.update(dt, this.camera.viewH, CAM3D.fovDeg * DEG);

    this.gl.render(this.scene, this.camera.cam);
    const info = this.gl.info.render;
    this.stats.calls = info.calls;
    this.stats.triangles = info.triangles;
    this.stats.particles = this.fx.particleCount;
    this.drawOverlay(world, focus, followId, viewerTeam);
  }

  private ipos(u: { pos: Vec2; prevPos: Vec2 }, alpha: number): Vec2 {
    // 位置跳变（复活、回城）时不插值
    if (Math.abs(u.pos.x - u.prevPos.x) + Math.abs(u.pos.y - u.prevPos.y) > 300) return { x: u.pos.x, y: u.pos.y };
    return { x: lerp(u.prevPos.x, u.pos.x, alpha), y: lerp(u.prevPos.y, u.pos.y, alpha) };
  }

  private syncUnits(world: World, alpha: number, dt: number, time: number, followId: number | null, viewerTeam: Team): void {
    const cam = this.camera;
    const seen = new Set<number>();
    this.creepInst.begin();
    this.marks.begin();
    let creepCount = 0;
    for (const u of world.units) {
      if (u.removed) continue;
      seen.add(u.id);
      const hiddenEnemy = u.team !== viewerTeam && u.hasState('hidden');
      if (u.kind === 'building') {
        let v = this.buildings.get(u.id);
        if (!v) this.buildings.set(u.id, (v = new BuildingView(u, this.dyn, this.buildingMat, this.shieldMat)));
        v.update(time, dt, this.fx);
        if (u.alive && cam.visible(u.pos, 400)) this.anchors.push({ u, x: u.pos.x, y: u.pos.y, h: groundHeight(u.pos.x, u.pos.y) + v.parts.barHeight });
        continue;
      }
      const p = this.ipos(u, alpha);
      if (u.kind === 'hero') {
        let v = this.heroes.get(u.id);
        if (!v) this.heroes.set(u.id, (v = new HeroView(u, this.dyn)));
        v.update(world, p, dt, alpha, time, u.id === followId && !!u.hero?.playerControlled);
        v.model.root.visible &&= !hiddenEnemy;
        if (u.alive && !hiddenEnemy && cam.visible(p, 250)) {
          const gy = groundHeight(p.x, p.y);
          this.anchors.push({ u, x: p.x, y: p.y, h: gy + AxeModel.HEAD_HEIGHT });
          this.unitMarks(u, p, gy + AxeModel.HEAD_HEIGHT + 30, time);
        }
        continue;
      }
      let v = this.creeps.get(u.id);
      if (!v) this.creeps.set(u.id, (v = new CreepView(u)));
      if (hiddenEnemy || !cam.visible(p, 200)) continue;
      v.x = p.x;
      v.y = p.y;
      v.tracker.update(animInput(u), dt, alpha);
      v.facing = turnToward(v.facing, u.facing, 10, dt);
      v.wheel += v.tracker.speed * dt;
      this.writeCreep(v, time);
      creepCount++;
      const hh = groundHeight(p.x, p.y) + creepHeadHeight(v.rig.type);
      if (u.alive) {
        this.anchors.push({ u, x: p.x, y: p.y, h: hh });
        this.unitMarks(u, p, hh + 26, time);
      }
    }
    // 已经被移除的小兵：在原地播放死亡动画，然后释放
    for (const [id, v] of this.creeps) {
      if (seen.has(id)) continue;
      v.gone = true;
      v.tracker.update(DEAD_INPUT, dt, alpha);
      if (v.tracker.deadTime > CREEP_CORPSE_TIME) {
        this.creeps.delete(id);
        continue;
      }
      if (cam.visible({ x: v.x, y: v.y }, 200)) this.writeCreep(v, time);
    }
    // 建筑挡住身后（北边、屏幕上方）的英雄时变半透明
    for (const b of this.buildings.values()) {
      if (b.destroyed) continue;
      let occ = false;
      const bp = b.u.pos;
      const reach = b.parts.crystalY * 1.15;
      for (const h of this.heroes.values()) {
        if (!h.u.alive || !h.model.root.visible) continue;
        const dy = bp.y - h.y;
        if (dy > -20 && dy < reach && Math.abs(h.x - bp.x) < b.u.radius + 110) {
          occ = true;
          break;
        }
      }
      b.fade(occ, dt);
    }
    for (const [id, v] of this.heroes) if (!seen.has(id)) {
      v.dispose();
      this.heroes.delete(id);
    }
    for (const [id, v] of this.buildings) if (!seen.has(id)) {
      v.dispose();
      this.buildings.delete(id);
    }
    this.creepInst.end();
    this.marks.end();
    this.stats.creeps = creepCount;
  }

  /** h：头顶上方的标记高度；战斗饥渴的标记在胸口高度 */
  private unitMarks(u: Unit, p: Vec2, h: number, time: number): void {
    if (u.hasState('stunned')) this.marks.place('stun', p.x, h, p.y, time);
    else if (u.stats.tauntedBy !== null) this.marks.place('taunt', p.x, h + 4, p.y, time);
    if (u.modifiers.some((m) => m.def.id === 'axe_battle_hunger')) {
      const gy = groundHeight(p.x, p.y);
      this.marks.place('hunger', p.x, gy + this.heightOf(u) * 0.5, p.y, time, gy);
    }
  }

  private writeCreep(v: CreepView, time: number): void {
    const rig = v.rig;
    const gy = groundHeight(v.x, v.y);
    rig.root.position.set(v.x, gy, v.y);
    rig.root.rotation.y = facingToRotY(v.facing);
    poseCreep(rig, v.tracker, time, v.wheel);
    rig.root.updateMatrixWorld(true);
    const f = v.tracker.flash;
    const c = this.tmpC.setRGB(1 + f * 1.4, 1 + f * 0.5, 1 + f * 0.4);
    for (const part of rig.parts) this.creepInst.push(part.key, cachedGeo(part.key, part.geo), !!part.glow, v.u.team, part.bone.matrixWorld, c);
    if (v.tracker.deadTime < 0) {
      const r = v.u.radius * 2.1 * (rig.type === 'siege' ? 1.25 : 1);
      this.tmpM.makeScale(r, 1, r).setPosition(v.x, gy + 1.2, v.y);
      this.creepInst.ring(this.tmpM, this.tmpC.set(teamColor(v.u.team)));
    }
  }

  private projMat(visual: string, team: number): Material {
    const key = `${visual}:${team}`;
    let m = this.projMats.get(key);
    if (!m) {
      if (visual === 'siege') m = makeLambert(true);
      else m = makeGlow(visual === 'tower' || visual === 'fountain' ? teamLight(team) : team === Team.Radiant ? 0xb8ffb0 : 0xffc0a0);
      this.projMats.set(key, m);
    }
    return m;
  }

  private sourceHeight(world: World, pr: Projectile): number {
    const s = world.getUnit(pr.sourceId);
    if (!s) return 80;
    if (s.kind === 'building') return this.buildings.get(s.id)?.parts.muzzleY ?? 200;
    if (s.kind === 'hero') return 110;
    return s.creep?.type === 'siege' ? 80 : 95;
  }

  private syncProjectiles(world: World, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const pr of world.projectiles) {
      if (pr.done) continue;
      seen.add(pr.id);
      const p = this.ipos(pr, alpha);
      const target = pr.targetId !== undefined ? world.getUnit(pr.targetId) : undefined;
      let v = this.projs.get(pr.id);
      if (!v) {
        const big = pr.visual === 'tower' || pr.visual === 'fountain';
        const geo = pr.visual === 'siege' ? this.projGeo.rock : big ? this.projGeo.big : this.projGeo.orb;
        const obj = new Group();
        const mesh = new Mesh(geo, this.projMat(pr.visual, pr.team));
        mesh.castShadow = pr.visual === 'siege';
        obj.add(mesh);
        if (pr.visual !== 'siege') obj.add(makeHalo(big ? teamColor(pr.team) : pr.team === Team.Radiant ? 0x80ff90 : 0xff8060, big ? 90 : 40, 0.9, true));
        this.dyn.add(obj);
        const d0 = target ? Math.hypot(target.pos.x - pr.pos.x, target.pos.y - pr.pos.y) : pr.maxDistance === Infinity ? 600 : pr.maxDistance;
        v = {
          obj, h0: groundHeight(pr.pos.x, pr.pos.y) + this.sourceHeight(world, pr), h1: 0, d0, arc: arcFor(pr.visual, d0), trail: 0,
          color: big ? teamLight(pr.team) : pr.team === Team.Radiant ? 0x90ff90 : 0xff9070, additive: pr.visual !== 'siege',
        };
        this.projs.set(pr.id, v);
      }
      if (target) v.h1 = groundHeight(target.pos.x, target.pos.y) + this.heightOf(target) * (target.kind === 'building' ? 0.35 : 0.55);
      const prog = target ? homingProgress(v.d0, Math.hypot(target.pos.x - p.x, target.pos.y - p.y)) : Math.min(1, pr.traveled / Math.max(1, v.d0));
      const h = projectileHeight(v.h0, v.h1 || v.h0, prog, v.arc);
      v.obj.position.set(p.x, h, p.y);
      v.obj.rotation.y += dt * 8;
      // 拖尾
      v.trail -= dt;
      if (v.trail <= 0 && dt > 0) {
        v.trail = pr.visual === 'siege' ? 0.05 : 0.02;
        if (v.additive) this.fx.emit(p.x, h, p.y, 0, 10, 0, v.color, pr.visual === 'tower' ? 15 : 8, 0.3, true, -10);
        else this.fx.emit(p.x, h, p.y, 0, 15, 0, 0x8a8070, 10, 0.5, false, 20, 0.5);
      }
    }
    for (const [id, v] of this.projs) if (!seen.has(id)) {
      v.obj.removeFromParent();
      this.projs.delete(id);
    }
  }

  private syncAreas(world: World, time: number): void {
    const seen = new Set<number>();
    for (const e of world.effects) {
      if (e.done) continue;
      seen.add(e.id);
      let d = this.areas.get(e.id);
      if (!d) {
        d = this.areaPool.pop() ?? new RingDecal(false, 3);
        if (!d.mesh.parent) this.dyn.add(d.mesh);
        this.areas.set(e.id, d);
      }
      const k = Math.max(0, 1 - e.elapsed / Math.max(0.001, e.duration));
      d.set(e.pos.x, Math.max(0, groundHeight(e.pos.x, e.pos.y)) + 3, e.pos.y, e.radius, {
        color: teamColor(e.team), opacity: 0.35 + 0.45 * k, width: 6, dash: Math.max(10, Math.round(e.radius / 40)), dashOffset: -time * 0.4, fill: 0.15, soft: 2,
      });
    }
    for (const [id, d] of this.areas) if (!seen.has(id)) {
      d.hide();
      this.areaPool.push(d);
      this.areas.delete(id);
    }
  }

  /** 界面层：血条（含等级和斩杀标记）、飘字、全屏闪光 */
  private drawOverlay(world: World, focus: Unit | undefined, followId: number | null, viewerTeam: Team): void {
    const ctx = this.octx;
    const cam = this.camera;
    const dpr = this.overlayDpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    // k：CSS 像素 / 界面单位，与 2D 镜头的 scale 相同，所以血条和飘字在屏幕上的大小与 2D 版一致
    const k = cam.viewH / VIEW_WORLD_HEIGHT;
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    const ui = cam.uiScale;
    const opts = { killMarker: killMarkerFor(world, focus), time: this.time, uiScale: ui, top: 0 };
    const out = { x: 0, y: 0, depth: 0 };
    this.anchors.sort((a, b) => a.y - b.y);
    for (const a of this.anchors) {
      const u = a.u;
      cam.project(a.x, a.y, a.h, out);
      if (out.x < -150 || out.x > cam.viewW + 150 || out.y < -60 || out.y > cam.viewH + 80) continue;
      const isHero = u.kind === 'hero';
      const s = isHero ? ui : 1 + (ui - 1) * 0.5;
      const sx = out.x / k;
      const sy = out.y / k;
      opts.top = sy - (isHero ? 34 : u.kind === 'building' ? 16 : 12) * s;
      drawBars(ctx, u, sx, sy, u.id === followId, viewerTeam, opts);
    }
    this.fx.drawTexts(ctx, cam, k, ui);
    const fl = this.fx.flash;
    if (fl.life > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${fl.color},${(0.35 * fl.life) / fl.max})`;
      ctx.fillRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }
}

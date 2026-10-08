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
import { drawBars, drawStatusIcons2D, killMarkerFor } from '../render/unitDraw';
import { Camera3D, CAM3D } from './camera3d';
import { facingToRotY, groundHeight } from './coords';
import { MapScene } from './mapScene';
import { Fx3D } from './fx3d';
import { AnimTracker, animInput, turnToward, type AnimInput } from './anim';
import { SkinnedHeroModel, type HeroModelSpec } from './models/heroModel';
import { heroModelSpec, summonModelSpec, type SummonModelSpec } from './models/registry';
import './fx/index';
import {
  lookupAreaVisual, lookupModifierVisual, projectileStyle, unitVisuals, type ModVisualCtx, type ProjectileStyle, type StatusMark, type UnitVisualCtx, type ViewFx,
} from './fx/registry';
import { buildCreepRig, creepHeadHeight, poseCreep, type CreepRig } from './models/creeps';
import { buildBuilding, makeHalo, rubbleMesh, shieldGeometry, shieldMaterial, towerHeight, type BuildingParts } from './models/buildings';
import { cachedGeo } from './models/rig';
import { flatQuad, flatStrip, makeRingMaterial, RingDecal } from './decals';
import { makeGlow, makeLambert, makeToon, PAL, teamColor, teamLight, type ToonMaterial } from './materials';
import { GeoBuilder } from './geo';
import { arcFor, homingProgress, projectileHeight } from './projectileArc';
import { motionHeight } from '../sim/systems/motion';
import { DT } from '../sim/core/constants';

/** 太阳方向（指向光源）：从西北上方照下来，影子落向屏幕右下方 */
const SUN_DIR = new Vector3(-0.42, 1, -0.5).normalize();
const SUN_DIST = 3000;
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
/** 强制位移的离地高度，按插值系数平滑（motionHeight 是逻辑帧末的值） */
function motionLift(u: Unit, alpha: number): number {
  const m = u.motion;
  if (!m || m.height <= 0) return 0;
  return motionHeight({ ...m, elapsed: Math.max(0, m.elapsed - DT + alpha * DT) });
}

/** 己方隐藏单位（魅影无形）的不透明度 */
const HIDDEN_ALLY_OPACITY = 0.45;

class HeroView {
  readonly spec: HeroModelSpec;
  readonly model: SkinnedHeroModel;
  readonly mat: ToonMaterial;
  readonly tracker = new AnimTracker();
  readonly ring = new RingDecal(false, 2);
  readonly meRing = new RingDecal(true, 2);
  readonly channel = new RingDecal(true, 3);
  facing: number;
  x = 0;
  y = 0;
  gy = 0;
  /** 本帧的位移抬高 */
  lift = 0;
  /** 边缘光（受击时变红） */
  private readonly baseRim: Color;
  private readonly tmpColor = new Color();
  // 本帧 Modifier 外观的累积（每帧在 update 里重置，在 finish 里应用）
  private fxTint = new Color();
  private fxTintK = 0;
  private fxRim = new Color();
  private fxRimK = 0;
  private fxScale = 1;
  private fxOpacity = 1;
  private fxLift = 0;
  private fxShake = 0;
  private hiddenAlly = false;
  private pop = 1;
  readonly api: ViewFx = {
    tint: (color, k) => {
      if (k > this.fxTintK) {
        this.fxTintK = k;
        this.fxTint.set(color);
      }
    },
    rim: (color, k) => {
      if (k > this.fxRimK) {
        this.fxRimK = k;
        this.fxRim.set(color);
      }
    },
    scale: (k) => (this.fxScale *= k),
    opacity: (k) => (this.fxOpacity = Math.min(this.fxOpacity, k)),
    lift: (h) => (this.fxLift += h),
    shake: (a) => (this.fxShake = Math.max(this.fxShake, a)),
  };

  constructor(readonly u: Unit, parent: Group) {
    this.mat = makeToon({ rim: 0xfff0dc, rimStrength: 0.3, key: 'hero' });
    this.baseRim = this.mat.rimU.value.clone();
    this.spec = heroModelSpec(u.defId);
    this.model = new SkinnedHeroModel(this.spec, u.team, this.mat);
    this.facing = u.facing;
    parent.add(this.model.root, this.ring.mesh, this.meRing.mesh, this.channel.mesh);
  }

  /** 头顶（血条锚点）离地高度 */
  get headHeight(): number {
    return this.model.headHeightWorld;
  }

  update(world: World, p: Vec2, dt: number, alpha: number, time: number, isPlayer: boolean, hiddenEnemy: boolean): void {
    const u = this.u;
    this.tracker.update(animInput(u), dt, alpha);
    const tr = this.tracker;
    if (u.alive) this.facing = turnToward(this.facing, u.facing, 14, dt);
    this.x = p.x;
    this.y = p.y;
    const gy = (this.gy = groundHeight(p.x, p.y));
    this.lift = u.alive ? motionLift(u, alpha) : 0;
    this.hiddenAlly = u.alive && !hiddenEnemy && u.hasState('hidden');
    this.fxTintK = 0;
    this.fxRimK = 0;
    this.fxScale = 1;
    this.fxOpacity = 1;
    this.fxLift = 0;
    this.fxShake = 0;
    const root = this.model.root;
    const visible = (u.alive || tr.deadTime < HERO_CORPSE_TIME) && !hiddenEnemy;
    root.visible = visible;
    root.position.set(p.x, gy, p.y);
    root.rotation.y = facingToRotY(this.facing);
    this.pop = tr.pop > 0 ? 1 + 0.18 * Math.sin(tr.pop * Math.PI) : 1;
    root.scale.setScalar(this.spec.scale * this.pop);
    if (visible) this.model.pose(tr, time, u.id * 1.7, u);
    const ringA = u.alive && !hiddenEnemy ? 1 : 0;
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
    if (prog >= 0 && u.alive && !hiddenEnemy) this.channel.set(p.x, gy + 2, p.y, 64, { color, opacity: 0.95, width: 9, progress: Math.max(0.001, Math.min(1, prog)), soft: 3 });
    else this.channel.hide();
  }

  /** 应用本帧的位移抬高和 Modifier 外观（在 update 和外观注册表之后调用） */
  finish(time: number): void {
    const root = this.model.root;
    const sh = this.fxShake;
    root.position.set(
      this.x + (sh > 0 ? Math.sin(time * 53) * sh : 0),
      this.gy + this.lift + this.fxLift,
      this.y + (sh > 0 ? Math.cos(time * 47) * sh : 0),
    );
    if (this.fxScale !== 1) root.scale.setScalar(this.spec.scale * this.pop * this.fxScale);
    this.mat.setOpacity(Math.min(this.hiddenAlly ? HIDDEN_ALLY_OPACITY : 1, this.fxOpacity));
    // 受击闪红 + 边缘光；Modifier 外观的自发光叠加在上面
    const f = this.tracker.flash;
    this.mat.emissive.setRGB(0.55 * f, 0.12 * f, 0.08 * f);
    if (this.fxTintK > 0) this.mat.emissive.add(this.tmpColor.copy(this.fxTint).multiplyScalar(this.fxTintK));
    const rim = this.mat.rimU.value.copy(this.baseRim);
    if (this.fxRimK > 0) rim.lerp(this.tmpColor.copy(this.fxRim).multiplyScalar(2), Math.min(1, this.fxRimK));
    rim.lerp(this.tmpColor.setRGB(1.2, 0.5, 0.4), f);
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

// ---------- 召唤物 ----------
const SUMMON_CORPSE_TIME = 0.6;
/** 没有注册模型的召唤物：一个小图腾（石座 + 木柱 + 雕刻的头 + 阵营色宝石和光晕） */
const TOTEM_HEIGHT = 96;
function buildTotem(team: number, mat: Material): Object3D {
  const g = new Group();
  const geo = cachedGeo(`summon:totem:${team}`, () => {
    const b = new GeoBuilder(61 + team);
    b.cyl(20, 24, 10, 7, 0x6a6258, { p: [0, 5, 0], top: 0x8a8278 });
    b.cyl(7, 9, 62, 6, PAL.wood, { p: [0, 40, 0], top: 0x8a6040 });
    b.box(22, 20, 18, 0x9a6a3a, { p: [0, 66, 0], jitter: 0.12 });
    b.box(16, 4, 3, 0x1c1411, { p: [0, 68, 9.5] });
    b.box(26, 4, 6, teamColor(team), { p: [0, 56, 0] });
    for (const sx of [1, -1]) b.cone(3, 12, 4, 0xe8dcbc, { p: [sx * 13, 74, 0], r: [0, 0, -sx * 0.9] });
    b.octa(8, teamLight(team), { p: [0, 86, 0], s: [1, 1.5, 1], jitter: 0 });
    return b.build();
  });
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  g.add(m);
  const halo = makeHalo(teamColor(team), 60, 0.75, true);
  halo.position.y = 86;
  halo.name = 'halo';
  g.add(halo);
  return g;
}

class SummonView {
  readonly obj: Object3D;
  readonly spec: SummonModelSpec | undefined;
  readonly ring = new RingDecal(false, 2);
  x: number;
  y: number;
  /** 死亡（被移除）后经过的时间；-1 = 还在 */
  deadTime = -1;
  private faded: Material[] | null = null;
  constructor(readonly u: Unit, parent: Group, mat: Material) {
    this.spec = summonModelSpec(u.defId);
    this.obj = this.spec ? this.spec.build(u.team) : buildTotem(u.team, mat);
    this.x = u.pos.x;
    this.y = u.pos.y;
    parent.add(this.obj, this.ring.mesh);
  }

  get height(): number {
    return this.spec?.height ?? TOTEM_HEIGHT;
  }

  update(p: Vec2, time: number, visible: boolean): void {
    const u = this.u;
    this.x = p.x;
    this.y = p.y;
    const gy = groundHeight(p.x, p.y);
    this.obj.visible = visible;
    this.obj.position.set(p.x, gy, p.y);
    this.obj.rotation.y = facingToRotY(u.facing);
    if (this.spec?.update) this.spec.update(this.obj, u, time);
    else {
      const halo = this.obj.getObjectByName('halo');
      if (halo) {
        const k = 60 * (0.9 + 0.1 * Math.sin(time * 4 + u.id));
        halo.scale.set(k, k, 1);
      }
    }
    if (visible) this.ring.set(p.x, gy + 1.4, p.y, u.radius * 2.2, { color: teamColor(u.team), opacity: 0.8, width: 5, soft: 2, fill: 0.12 });
    else this.ring.hide();
  }

  /** 被移除后：缩小、下沉、淡出；返回 true 表示已经播完 */
  fadeOut(dt: number): boolean {
    this.deadTime = Math.max(0, this.deadTime) + dt;
    const k = Math.min(1, this.deadTime / SUMMON_CORPSE_TIME);
    this.ring.hide();
    if (!this.faded) {
      // 第一次淡出时给每个网格换一份可以单独变透明的材质（注册的模型可能共用材质）
      this.faded = [];
      this.obj.traverse((o) => {
        const m = (o as Mesh).material as Material | undefined;
        if (!m || Array.isArray(m)) return;
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        (o as Mesh).material = c;
        this.faded!.push(c);
      });
    }
    for (const m of this.faded) m.opacity = 1 - k;
    this.obj.scale.setScalar(1 - 0.4 * k);
    this.obj.position.y = groundHeight(this.x, this.y) - 20 * k;
    return k >= 1;
  }

  dispose(): void {
    this.obj.removeFromParent();
    this.ring.mesh.removeFromParent();
    this.ring.dispose();
    for (const m of this.faded ?? []) m.dispose();
  }
}

// ---------- 单位外观（状态标记、Modifier 外观）的每单位缓存 ----------
class UnitFxStore {
  readonly decals = new Map<string, RingDecal>();
  readonly objs = new Map<string, Object3D>();
  private used = new Set<string>();
  frame = -1;
  constructor(private readonly parent: Group) {}

  begin(frame: number): void {
    this.frame = frame;
    this.used.clear();
  }

  decal(key: string): RingDecal {
    let d = this.decals.get(key);
    if (!d) {
      d = new RingDecal(false, 3);
      this.parent.add(d.mesh);
      this.decals.set(key, d);
    }
    this.used.add(`d:${key}`);
    return d;
  }

  obj<T extends Object3D>(key: string, build: () => T): T {
    let o = this.objs.get(key) as T | undefined;
    if (!o) {
      o = build();
      this.parent.add(o);
      this.objs.set(key, o);
    }
    o.visible = true;
    this.used.add(`o:${key}`);
    return o;
  }

  /** 本帧没有用到的隐藏 */
  end(): void {
    for (const [k, d] of this.decals) if (!this.used.has(`d:${k}`)) d.hide();
    for (const [k, o] of this.objs) if (!this.used.has(`o:${k}`)) o.visible = false;
  }

  hideAll(): void {
    this.used.clear();
    this.end();
  }

  dispose(): void {
    for (const d of this.decals.values()) {
      d.mesh.removeFromParent();
      d.dispose();
    }
    for (const o of this.objs.values()) o.removeFromParent();
    this.decals.clear();
    this.objs.clear();
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
  /** 被击退时的离地高度 */
  lift = 0;
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
    this.mat.setOpacity(this.opacity);
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
interface ProjView {
  obj: Object3D; h0: number; h1: number; d0: number; arc: number; trail: number; color: number; additive: boolean;
  /** 注册的外观（没有时走 P1 的 orb / tower / siege） */
  style?: ProjectileStyle; mesh?: Object3D; chain?: Mesh[];
}

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

/** 链子的链节数 */
const CHAIN_LINKS = 14;

/**
 * 注册弹道外观的几何体（按 size = 14 设计，渲染时按 size / 14 缩放）。模型面朝本地 +Z（飞行方向）；
 * 顶点色是浅色的明暗细节，乘上外观颜色。wave 的基准宽度（本地 X）是 100。
 */
function projectileGeometry(kind: ProjectileStyle['mesh']): BufferGeometry {
  const b = new GeoBuilder(31);
  switch (kind) {
    case 'arrow':
      b.cyl(1.6, 1.6, 46, 5, 0xd8c8a8, { r: [Math.PI / 2, 0, 0] });
      b.cone(4.5, 12, 4, 0xffffff, { p: [0, 0, 28], r: [Math.PI / 2, 0, 0] });
      b.box(0.8, 7, 9, 0xf0f0f0, { p: [0, 0, -20] });
      b.box(7, 0.8, 9, 0xf0f0f0, { p: [0, 0, -20] });
      break;
    case 'dagger':
      b.extrude([[0, 0], [3.5, 4], [2.5, 26], [0, 34], [-2.5, 26], [-3.5, 4]], 1.6, 0xffffff, { r: [Math.PI / 2, 0, 0], p: [0, 0, -6] });
      b.box(12, 2.5, 3, 0xb0a080, { p: [0, 0, -6] });
      b.cyl(1.8, 1.8, 10, 5, 0x6a5040, { r: [Math.PI / 2, 0, 0], p: [0, 0, -12] });
      break;
    case 'hammer':
      b.box(16, 16, 26, 0xffffff, { jitter: 0.1 });
      b.box(18, 18, 4, 0xd0d8e0, { p: [0, 0, 9] });
      b.box(18, 18, 4, 0xd0d8e0, { p: [0, 0, -9] });
      b.cyl(2.4, 2.4, 26, 5, 0x8a6a4a, { p: [0, -18, 0] });
      break;
    case 'hook':
      b.torus(11, 2.6, 4, 10, 0xffffff, { r: [0, Math.PI / 2, 0], p: [0, 0, 6] }, Math.PI * 1.3);
      b.cone(3.5, 10, 4, 0xffffff, { p: [0, 10, 14], r: [0.6, 0, 0] });
      b.cyl(2.2, 2.2, 14, 5, 0xc0c0c0, { r: [Math.PI / 2, 0, 0], p: [0, 0, -8] });
      b.torus(3.5, 1.2, 3, 6, 0xc0c0c0, { p: [0, 0, -16] });
      break;
    case 'wave':
      // 竖起来的新月形波（宽 100 × 高 30），朝 +Z 推进
      b.extrude([[-50, 0], [-30, 22], [0, 30], [30, 22], [50, 0], [30, 10], [0, 16], [-30, 10]], 10, 0xffffff, { p: [0, -10, 0], jitter: 0.05 });
      break;
    case 'shard':
      b.octa(10, 0xffffff, { s: [0.55, 0.55, 1.8], jitter: 0.05 });
      break;
    case 'rock':
      b.dodeca(13, 0xbfb6aa, { jitter: 0.15 });
      break;
    default:
      b.ico(7, 1, 0xffffff, { jitter: 0 });
  }
  return b.build();
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
  private summons = new Map<number, SummonView>();
  private unitFx = new Map<number, UnitFxStore>();
  private frameNo = 0;
  private readonly suppressed = new Set<StatusMark>();
  /** 召唤物图腾的材质（所有未注册模型的召唤物共用） */
  private readonly summonMat = makeToon({ rim: 0xfff0dc, rimStrength: 0.25, key: 'creep' });
  private buildings = new Map<number, BuildingView>();
  private projs = new Map<number, ProjView>();
  private areas = new Map<number, RingDecal>();
  /** 区域效果外观要求的第二个贴地圈（AreaVisualCtx.extra） */
  private areaExtras = new Map<number, RingDecal>();
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
  private readonly styleGeos = new Map<string, BufferGeometry>();
  private readonly chainGeo = new GeoBuilder(24).box(1, 1, 1, 0xffffff, { jitter: 0 }).build();
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
    for (const v of this.summons.values()) v.dispose();
    for (const f of this.unitFx.values()) f.dispose();
    for (const p of this.projs.values()) this.removeProj(p);
    for (const d of [...this.areas.values(), ...this.areaExtras.values()]) d.hide();
    this.areaPool.push(...this.areas.values(), ...this.areaExtras.values());
    this.areaExtras.clear();
    this.heroes.clear();
    this.creeps.clear();
    this.summons.clear();
    this.unitFx.clear();
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
    if (u.kind === 'hero') return this.heroes.get(u.id)?.headHeight ?? heroModelSpec(u.defId).headHeight * heroModelSpec(u.defId).scale;
    if (u.kind === 'summon') return summonModelSpec(u.defId)?.height ?? TOTEM_HEIGHT;
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
        const v = this.heroes.get(e.unitId);
        v?.tracker.trigger(e.abilityId, v.spec.releaseDur[e.abilityId] ?? 0.4);
      } else if (e.type === 'fx' && e.unitId !== undefined) {
        // 模型声明的 fx 触发动作（斧王的反击螺旋）
        const v = this.heroes.get(e.unitId);
        const t = v?.spec.fxTriggers?.[e.kind];
        if (v && t) v.tracker.trigger(t.kind, t.dur);
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
    this.syncAreas(world, time, dt);
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
    this.frameNo++;
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
        if (u.alive && cam.visible(u.pos, 400)) {
          const gy = groundHeight(u.pos.x, u.pos.y);
          this.anchors.push({ u, x: u.pos.x, y: u.pos.y, h: gy + v.parts.barHeight });
          if (u.modifiers.length) this.unitVisuals(world, u, u.pos, gy, 0, this.heightOf(u), null, time, dt, false);
        }
        continue;
      }
      const p = this.ipos(u, alpha);
      if (u.kind === 'hero') {
        let v = this.heroes.get(u.id);
        if (!v) this.heroes.set(u.id, (v = new HeroView(u, this.dyn)));
        v.update(world, p, dt, alpha, time, u.id === followId && !!u.hero?.playerControlled, hiddenEnemy);
        if (u.alive && !hiddenEnemy && cam.visible(p, 250)) {
          const top = v.gy + v.lift + v.headHeight;
          this.anchors.push({ u, x: p.x, y: p.y, h: top });
          // 眩晕金星绕着头转（P1 放在头顶上方 30，会被血条挡住），嘲讽"!"仍在头顶上方
          const busy = this.unitMarks(u, p, top + 30, time, top - 6);
          this.unitVisuals(world, u, p, v.gy, v.lift, v.headHeight, v.api, time, dt, busy);
        }
        v.finish(time);
        continue;
      }
      if (u.kind === 'summon') {
        let v = this.summons.get(u.id);
        if (!v) this.summons.set(u.id, (v = new SummonView(u, this.dyn, this.summonMat)));
        const vis = !hiddenEnemy && cam.visible(p, 200);
        v.update(p, time, vis && u.alive);
        if (vis && u.alive) {
          const gy = groundHeight(p.x, p.y);
          this.anchors.push({ u, x: p.x, y: p.y, h: gy + v.height });
          const busy = this.unitMarks(u, p, gy + v.height + 26, time);
          this.unitVisuals(world, u, p, gy, 0, v.height, null, time, dt, busy);
        }
        continue;
      }
      let v = this.creeps.get(u.id);
      if (!v) this.creeps.set(u.id, (v = new CreepView(u)));
      if (hiddenEnemy || !cam.visible(p, 200)) continue;
      v.x = p.x;
      v.y = p.y;
      v.lift = u.alive ? motionLift(u, alpha) : 0;
      v.tracker.update(animInput(u), dt, alpha);
      v.facing = turnToward(v.facing, u.facing, 10, dt);
      v.wheel += v.tracker.speed * dt;
      this.writeCreep(v, time);
      creepCount++;
      const gy = groundHeight(p.x, p.y);
      const ch = creepHeadHeight(v.rig.type);
      const hh = gy + v.lift + ch;
      if (u.alive) {
        this.anchors.push({ u, x: p.x, y: p.y, h: hh });
        const busy = this.unitMarks(u, p, hh + 26, time);
        this.unitVisuals(world, u, p, gy, v.lift, ch, null, time, dt, busy);
      }
    }
    // 已经被移除的小兵：在原地播放死亡动画，然后释放
    for (const [id, v] of this.creeps) {
      if (seen.has(id)) continue;
      v.gone = true;
      v.lift = 0;
      v.tracker.update(DEAD_INPUT, dt, alpha);
      if (v.tracker.deadTime > CREEP_CORPSE_TIME) {
        this.creeps.delete(id);
        continue;
      }
      if (cam.visible({ x: v.x, y: v.y }, 200)) this.writeCreep(v, time);
    }
    // 已经被移除的召唤物：淡出后释放
    for (const [id, v] of this.summons) {
      if (seen.has(id)) continue;
      if (v.fadeOut(dt)) {
        v.dispose();
        this.summons.delete(id);
      }
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
    // 单位外观：本帧没有处理的单位全部隐藏，已经移除的释放
    for (const [id, f] of this.unitFx) {
      if (!seen.has(id)) {
        f.dispose();
        this.unitFx.delete(id);
      } else if (f.frame !== this.frameNo) f.hideAll();
    }
    this.creepInst.end();
    this.marks.end();
    this.stats.creeps = creepCount;
  }

  /** h：头顶上方的标记高度；战斗饥渴的标记在胸口高度。返回头顶是否被眩晕 / 嘲讽标记占用 */
  private unitMarks(u: Unit, p: Vec2, h: number, time: number, stunH = h): boolean {
    let busy = false;
    if (u.hasState('stunned') && !u.modifiers.some((m) => lookupModifierVisual(m.def.id)?.replaces.includes('stun'))) {
      busy = true;
      this.marks.place('stun', p.x, stunH, p.y, time);
    } else if (u.stats.tauntedBy !== null) {
      busy = true;
      this.marks.place('taunt', p.x, h + 4, p.y, time);
    }
    if (u.modifiers.some((m) => m.def.id === 'axe_battle_hunger')) {
      const gy = groundHeight(p.x, p.y);
      this.marks.place('hunger', p.x, gy + this.heightOf(u) * 0.5, p.y, time, gy);
    }
    return busy;
  }

  /**
   * 通用状态标记（fx/common.ts）和 Modifier 外观（各英雄的 fx/<id>.ts）。
   * 外观对象按"单位 + key"缓存在 UnitFxStore 里，本帧没有用到的自动隐藏。
   */
  private unitVisuals(world: World, u: Unit, p: Vec2, gy: number, lift: number, height: number, view: ViewFx | null, time: number, dt: number, headBusy: boolean): void {
    let store = this.unitFx.get(u.id);
    const uv = unitVisuals();
    const sup = this.suppressed;
    sup.clear();
    let any = uv.length > 0;
    for (const m of u.modifiers) {
      const r = lookupModifierVisual(m.def.id);
      if (!r) continue;
      any = true;
      for (const k of r.replaces) sup.add(k);
    }
    if (!any) return;
    if (!store) this.unitFx.set(u.id, (store = new UnitFxStore(this.dyn)));
    const st = store;
    st.begin(this.frameNo);
    const c: UnitVisualCtx = {
      u, world, x: p.x, y: p.y, gy, lift, height, top: gy + lift + height, headBusy, time, dt, fx: this.fx,
      decal: (key) => st.decal(key), obj: (key, build) => st.obj(key, build), view, suppressed: sup,
    };
    for (const v of uv) v(c);
    let mc: ModVisualCtx | null = null;
    for (const m of u.modifiers) {
      const r = lookupModifierVisual(m.def.id);
      if (!r) continue;
      mc ??= { ...c, m };
      mc.m = m;
      r.v(mc);
    }
    st.end();
  }

  private writeCreep(v: CreepView, time: number): void {
    const rig = v.rig;
    const gy = groundHeight(v.x, v.y);
    rig.root.position.set(v.x, gy + v.lift, v.y);
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

  /** 注册外观的网格：发光体（orb / wave / shard）用 makeGlow，实物（箭、匕首、锤、钩、石块）用顶点色 × 外观颜色的兰伯特材质 */
  private styleMesh(visual: string, st: ProjectileStyle): Mesh {
    const glow = st.mesh === 'orb' || st.mesh === 'wave' || st.mesh === 'shard';
    const key = `style:${visual}`;
    let m = this.projMats.get(key);
    if (!m) {
      if (glow) m = makeGlow(st.color, st.mesh === 'wave');
      else {
        const lm = makeLambert(true);
        lm.color.set(st.color);
        m = lm;
      }
      this.projMats.set(key, m);
    }
    let geo = this.styleGeos.get(st.mesh);
    if (!geo) this.styleGeos.set(st.mesh, (geo = projectileGeometry(st.mesh)));
    const mesh = new Mesh(geo, m);
    mesh.castShadow = !glow;
    mesh.scale.setScalar(st.size / 14);
    return mesh;
  }

  private sourceHeight(world: World, pr: Projectile): number {
    const s = world.getUnit(pr.sourceId);
    if (!s) return 80;
    if (s.kind === 'building') return this.buildings.get(s.id)?.parts.muzzleY ?? 200;
    if (s.kind === 'hero') return heroModelSpec(s.defId).muzzleHeight;
    if (s.kind === 'summon') return (summonModelSpec(s.defId)?.height ?? TOTEM_HEIGHT) * 0.7;
    return s.creep?.type === 'siege' ? 80 : 95;
  }

  private removeProj(v: ProjView): void {
    v.obj.removeFromParent();
    for (const c of v.chain ?? []) c.removeFromParent();
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
        const d0 = target ? Math.hypot(target.pos.x - pr.pos.x, target.pos.y - pr.pos.y) : pr.maxDistance === Infinity ? 600 : pr.maxDistance;
        const st = projectileStyle(pr.visual);
        const h0 = groundHeight(pr.pos.x, pr.pos.y) + (st?.height ?? this.sourceHeight(world, pr));
        const obj = new Group();
        if (st) {
          const mesh = this.styleMesh(pr.visual, st);
          obj.add(mesh);
          if (st.halo) obj.add(makeHalo(st.color, st.halo, 0.9, true));
          v = {
            obj, h0, h1: 0, d0, arc: st.arc ?? arcFor(pr.visual, d0), trail: 0, color: st.trail?.color ?? st.color, additive: st.trail?.additive ?? true,
            style: st, mesh,
          };
          if (st.chain) {
            const ck = `chain:${pr.visual}`;
            let mat = this.projMats.get(ck);
            if (!mat) {
              const cm = makeLambert(true);
              cm.color.set(st.chain.color);
              this.projMats.set(ck, (mat = cm));
            }
            v.chain = Array.from({ length: CHAIN_LINKS }, () => {
              const l = new Mesh(this.chainGeo, mat);
              l.castShadow = true;
              this.dyn.add(l);
              return l;
            });
          }
        } else {
          const big = pr.visual === 'tower' || pr.visual === 'fountain';
          const geo = pr.visual === 'siege' ? this.projGeo.rock : big ? this.projGeo.big : this.projGeo.orb;
          const mesh = new Mesh(geo, this.projMat(pr.visual, pr.team));
          mesh.castShadow = pr.visual === 'siege';
          obj.add(mesh);
          if (pr.visual !== 'siege') obj.add(makeHalo(big ? teamColor(pr.team) : pr.team === Team.Radiant ? 0x80ff90 : 0xff8060, big ? 90 : 40, 0.9, true));
          v = {
            obj, h0, h1: 0, d0, arc: arcFor(pr.visual, d0), trail: 0,
            color: big ? teamLight(pr.team) : pr.team === Team.Radiant ? 0x90ff90 : 0xff9070, additive: pr.visual !== 'siege',
          };
        }
        this.dyn.add(obj);
        this.projs.set(pr.id, v);
      }
      if (target) v.h1 = groundHeight(target.pos.x, target.pos.y) + this.heightOf(target) * (target.kind === 'building' ? 0.35 : 0.55);
      const prog = target ? homingProgress(v.d0, Math.hypot(target.pos.x - p.x, target.pos.y - p.y)) : Math.min(1, pr.traveled / Math.max(1, v.d0));
      // 固定离地高度的外观（贴地火墙）跟着地形起伏
      const h = v.style?.height !== undefined ? groundHeight(p.x, p.y) + v.style.height : projectileHeight(v.h0, v.h1 || v.h0, prog, v.arc);
      v.obj.position.set(p.x, h, p.y);
      const st = v.style;
      if (st) {
        // 朝飞行方向（模型面朝本地 +Z）；翻滚绕横轴
        const dir = target ? { x: target.pos.x - p.x, y: target.pos.y - p.y } : pr.dir ?? { x: pr.pos.x - pr.prevPos.x, y: pr.pos.y - pr.prevPos.y };
        if (Math.abs(dir.x) + Math.abs(dir.y) > 1e-6) v.obj.rotation.y = facingToRotY(Math.atan2(dir.y, dir.x));
        if (st.spin) v.mesh!.rotation.x += st.spin * dt;
        else if (st.mesh === 'orb') v.mesh!.rotation.y += dt * 8;
        if (st.scaleWithWidth) v.mesh!.scale.x = (st.size / 14) * Math.max(0.2, pr.width / 100);
        if (st.emitter && dt > 0) {
          const dl = Math.hypot(dir.x, dir.y) || 1;
          st.emitter({ fx: this.fx, x: p.x, y: p.y, h, gy: groundHeight(p.x, p.y), dir: { x: dir.x / dl, y: dir.y / dl }, width: pr.width, traveled: pr.traveled, dt });
        }
        if (v.chain) this.placeChain(world, pr, v, p, h, alpha);
        v.trail -= dt;
        if (st.trail && v.trail <= 0 && dt > 0) {
          v.trail = st.trail.every;
          this.fx.emit(p.x, h, p.y, 0, 10, 0, st.trail.color, st.trail.size, 0.35, st.trail.additive, st.trail.additive ? -10 : 15, st.trail.additive ? 1 : 0.6);
        }
        continue;
      }
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
      this.removeProj(v);
      this.projs.delete(id);
    }
  }

  /** 链子（肉钩）：从施法者手部（muzzleHeight）到弹道，略微下垂的一串链节 */
  private placeChain(world: World, pr: Projectile, v: ProjView, p: Vec2, h: number, alpha: number): void {
    const src = world.getUnit(pr.sourceId);
    const links = v.chain!;
    if (!src || !src.alive) {
      for (const l of links) l.visible = false;
      return;
    }
    const sp = this.ipos(src, alpha);
    const sh = groundHeight(sp.x, sp.y) + this.sourceHeight(world, pr);
    const width = v.style!.chain!.width;
    const len = Math.hypot(p.x - sp.x, p.y - sp.y, h - sh);
    const n = links.length;
    const sag = Math.min(40, len * 0.06);
    const pt = (t: number) => ({ x: lerp(sp.x, p.x, t), y: lerp(sh, h, t) - sag * 4 * t * (1 - t), z: lerp(sp.y, p.y, t) });
    for (let i = 0; i < n; i++) {
      const a = pt(i / n), b = pt((i + 1) / n);
      const l = links[i];
      l.visible = true;
      l.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      l.scale.set(width, width * (i % 2 ? 1 : 0.6), Math.max(1, seg));
      l.lookAt(b.x, b.y, b.z);
    }
  }

  private syncAreas(world: World, time: number, dt: number): void {
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
      const custom = lookupAreaVisual(e.visual);
      if (custom) {
        const extra = (): RingDecal => {
          let d2 = this.areaExtras.get(e.id);
          if (!d2) {
            d2 = this.areaPool.pop() ?? new RingDecal(false, 3);
            if (!d2.mesh.parent) this.dyn.add(d2.mesh);
            this.areaExtras.set(e.id, d2);
          }
          return d2;
        };
        custom(e, { decal: d, fx: this.fx, world, time, dt, extra });
        continue;
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
    for (const [id, d] of this.areaExtras) if (!seen.has(id)) {
      d.hide();
      this.areaPool.push(d);
      this.areaExtras.delete(id);
    }
  }

  private readonly skipSet = new Set<string>();
  /** 界面层图标要跳过的种类：Modifier 外观声明替换掉的 */
  private iconSkip(u: Unit): ReadonlySet<string> {
    const s = this.skipSet;
    s.clear();
    for (const m of u.modifiers) for (const k of lookupModifierVisual(m.def.id)?.replaces ?? []) s.add(k);
    return s;
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
      // 头顶状态图标（眩晕、沉默、缴械、破坏、恐惧）画在血条上方；被 Modifier 外观替换掉的不画
      if (u.kind !== 'building' && u.modifiers.length) drawStatusIcons2D(ctx, u, sx, opts.top - 8 * s, this.time, s, this.iconSkip(u));
    }
    this.fx.drawTexts(ctx, cam, k, ui);
    const fa = this.fx.flashAlpha();
    if (fa > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${this.fx.flash.color},${fa})`;
      ctx.fillRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }
}

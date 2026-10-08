import {
  AdditiveBlending, CircleGeometry, Color, CylinderGeometry, DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NoToneMapping, PerspectiveCamera, RingGeometry, Scene, SRGBColorSpace, WebGLRenderer, type BufferGeometry, type Material,
} from 'three';
import './fx/index';
import { heroModelSpec } from './models/registry';
import { SkinnedHeroModel, type HeroModelSpec } from './models/heroModel';
import { AnimTracker, type AnimInput } from './anim';
import { makeToon, type ToonMaterial } from './materials';
import { facingToRotY } from './coords';
import { DT } from '../sim/core/constants';
import { getHeroDef, hasHero } from '../sim/heroes/index';

/** 预览动作序列的一步 */
type Move =
  | { kind: 'idle' | 'run'; dur: number }
  | { kind: 'attack'; dur: number; point: number }
  | { kind: 'cast'; id: string; point: number; dur: number }
  | { kind: 'fx'; id: string; trigger: { kind: string; dur: number }; dur: number };

const IDLE_TIME = 2;
const RUN_TIME = 2;
/** 普攻出手后停留的时间 */
const ATTACK_TAIL = 0.55;
/** 技能前摇的最短显示时间（前摇为 0 的技能也看得出蓄力） */
const MIN_CAST_POINT = 0.25;
/** 每个技能动作之后停顿多久 */
const MOVE_GAP = 0.6;
/** 默认朝向：面向镜头，稍微侧一点（3/4 视角） */
const BASE_YAW = facingToRotY(Math.PI / 2) - 0.5;

/** 循环播放的动作：站立 → 跑 → 普攻 ×2 → spec.previewMoves（或 releaseDur）里的每个技能 / 一次性动作 */
function buildMoves(spec: HeroModelSpec, heroId: string): Move[] {
  const def = hasHero(heroId) ? getHeroDef(heroId) : null;
  const ap = Math.max(0.2, def?.attackPoint ?? 0.4);
  const moves: Move[] = [
    { kind: 'idle', dur: IDLE_TIME },
    { kind: 'run', dur: RUN_TIME },
    { kind: 'attack', point: ap, dur: ap + ATTACK_TAIL },
    { kind: 'attack', point: ap, dur: ap + ATTACK_TAIL },
  ];
  for (const id of spec.previewMoves ?? Object.keys(spec.releaseDur)) {
    const trig = spec.fxTriggers?.[id];
    if (trig) {
      moves.push({ kind: 'fx', id, trigger: trig, dur: trig.dur + MOVE_GAP });
      continue;
    }
    const ab = def?.abilities.find((a) => a.id === id);
    const point = Math.max(MIN_CAST_POINT, ab?.castPoint ?? 0);
    moves.push({ kind: 'cast', id, point, dur: point + (spec.releaseDur[id] ?? 0.5) + MOVE_GAP });
  }
  return moves;
}

/**
 * 选英雄界面的 3D 预览：独立的小 WebGL 画布，站在石台上循环播放站立、跑、普攻和各技能动作。
 * 按住拖动可以转动模型。离开界面时 dispose() 释放 WebGL 上下文。
 */
export class HeroPreview {
  private readonly gl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly cam = new PerspectiveCamera(28, 1, 10, 5000);
  private readonly mat: ToonMaterial;
  private readonly extras: { geo: BufferGeometry; mat: Material }[] = [];
  private model: SkinnedHeroModel | null = null;
  private heroId: string | null = null;
  private tracker = new AnimTracker();
  private moves: Move[] = [];
  private step = 0;
  private t = 0;
  private time = 0;
  private triggered = false;
  private finalWindup = false;
  private yaw = 0;
  private dragX: number | null = null;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', stencil: false });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = NoToneMapping;
    this.gl.setClearColor(new Color(0x000000), 0);
    this.mat = makeToon({ rim: 0xfff0dc, rimStrength: 0.35, key: 'hero' });
    const s = this.scene;
    s.add(new HemisphereLight(0xd6e6ff, 0x5a4a34, 1.5));
    const sun = new DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-300, 600, 500);
    s.add(sun, sun.target);
    // 石台 + 金色光圈 + 脚下的影子
    const add = (geo: BufferGeometry, mat: Material, y: number, rotX = 0): Mesh => {
      const m = new Mesh(geo, mat);
      m.position.y = y;
      m.rotation.x = rotX;
      s.add(m);
      this.extras.push({ geo, mat });
      return m;
    };
    add(new CylinderGeometry(118, 128, 22, 40), new MeshLambertMaterial({ color: 0x4a4640 }), -11);
    add(new RingGeometry(104, 114, 48), new MeshBasicMaterial({ color: 0xe2b04a, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }), 0.6, -Math.PI / 2);
    add(new CircleGeometry(62, 32), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }), 0.4, -Math.PI / 2);
    this.listen();
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private listen(): void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(type, fn);
      this.offs.push(() => this.canvas.removeEventListener(type, fn));
    };
    on('pointerdown', (e) => {
      this.dragX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    on('pointermove', (e) => {
      if (this.dragX === null) return;
      this.yaw += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
    });
    const end = () => {
      this.dragX = null;
    };
    on('pointerup', end);
    on('pointercancel', end);
  }

  /** 换模型（同一个英雄不重建）并从头播放动作序列 */
  show(heroId: string): void {
    if (this.disposed || heroId === this.heroId) return;
    this.heroId = heroId;
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose();
    }
    const spec = heroModelSpec(heroId);
    this.model = new SkinnedHeroModel(spec, 0, this.mat);
    this.scene.add(this.model.root);
    this.moves = buildMoves(spec, heroId);
    this.tracker = new AnimTracker();
    this.step = 0;
    this.t = 0;
    this.triggered = false;
    this.finalWindup = false;
    this.yaw = 0;
    this.fit();
  }

  /** 镜头按模型高度和画布宽高比取景：整个模型（含石台）都在画面里 */
  private fit(): void {
    const h = this.model?.headHeightWorld ?? 230;
    const aspect = this.cam.aspect || 1;
    const halfH = Math.max(h * 0.62 + 30, 150 / aspect);
    const dist = halfH / Math.tan((this.cam.fov * Math.PI) / 360);
    const lookY = h * 0.45;
    const pitch = 0.2;
    this.cam.position.set(0, lookY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    this.cam.lookAt(0, lookY, 0);
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    this.gl.setPixelRatio(Math.min(touch ? 1.5 : 2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.fit();
  }

  /** 当前这一步的动画输入（不依赖 sim 的 Unit） */
  private input(m: Move): AnimInput {
    const i: AnimInput = {
      alive: true, speed: 0, windup: -1, attackPoint: 0.4, castAbility: null, castProgress: 0, channel: false, stunned: false, taunted: false,
    };
    const t = this.t;
    switch (m.kind) {
      case 'run': {
        const def = this.heroId && hasHero(this.heroId) ? getHeroDef(this.heroId) : null;
        i.speed = def?.moveSpeed ?? 300;
        break;
      }
      case 'attack':
        i.attackPoint = m.point;
        // 出手前保证有一帧"剩余不到两个逻辑帧"，AnimTracker 才会判定出手、播收招（帧率很低时也一样）
        if (t < m.point - DT) i.windup = m.point - t;
        else if (!this.finalWindup) {
          this.finalWindup = true;
          i.windup = DT * 0.5;
        }
        break;
      case 'cast':
        if (t < m.point) {
          i.castAbility = m.id;
          i.castProgress = Math.min(1, t / m.point);
        } else if (!this.triggered) {
          this.triggered = true;
          this.tracker.trigger(m.id, this.model?.spec.releaseDur[m.id] ?? 0.5);
        }
        break;
      case 'fx':
        if (!this.triggered) {
          this.triggered = true;
          this.tracker.trigger(m.trigger.kind, m.trigger.dur);
        }
        break;
    }
    return i;
  }

  private readonly frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const model = this.model;
    if (!model || !this.moves.length || dt <= 0) return;
    this.time += dt;
    this.t += dt;
    let m = this.moves[this.step];
    if (this.t >= m.dur) {
      this.step = (this.step + 1) % this.moves.length;
      this.t = 0;
      this.triggered = false;
      this.finalWindup = false;
      m = this.moves[this.step];
    }
    this.tracker.update(this.input(m), dt, 0);
    model.pose(this.tracker, this.time, 0, null);
    // 不拖动时慢慢转回默认朝向
    if (this.dragX === null) this.yaw *= Math.exp(-dt * 0.8);
    model.root.rotation.y = BASE_YAW + this.yaw;
    this.gl.render(this.scene, this.cam);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.offs) f();
    if (this.model) {
      this.model.root.removeFromParent();
      // 蒙皮几何体是和对局共用的缓存，不释放
      this.model.dispose();
    }
    for (const e of this.extras) {
      e.geo.dispose();
      e.mat.dispose();
    }
    this.mat.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}

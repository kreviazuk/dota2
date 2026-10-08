import { PerspectiveCamera, Vector3 } from 'three';
import type { Vec2 } from '../sim/core/vec2';
import { Team } from '../sim/core/types';
import { MAP } from '../sim/data/map';
import { UI_REF_VIEW_HEIGHT, VIEW_WORLD_HEIGHT } from '../render/camera';
import type { ViewCamera } from '../render/view';

const DEG = Math.PI / 180;

/** 3D 镜头参数 */
export const CAM3D = {
  /** 俯角（视线与地面的夹角） */
  pitchDeg: 54,
  /** 垂直视场角 */
  fovDeg: 36,
  /** 屏幕正中那一列从下边缘到上边缘覆盖的地面长度（与 2D 镜头的屏高一致） */
  span: VIEW_WORLD_HEIGHT,
  /** 镜头中心比英雄往敌方基地方向偏多少（2D 是 20% 屏高 = 280） */
  lookAhead: 230,
  /** 镜头中心 x 最多偏离道路中线多少 */
  xRange: 320,
  near: 60,
  far: 9000,
};

/**
 * 镜头到注视点的距离：视线俯角 pitch、垂直视场角 fov 时，屏幕正中那一列的地面覆盖长度等于 span。
 * 镜头高度 h = D·sin(pitch)，上下边缘视线的俯角分别是 pitch ∓ fov/2，落地点相距 h·(cot(pitch−fov/2) − cot(pitch+fov/2))。
 */
export function cameraDistance(pitchRad: number, fovRad: number, span: number): number {
  const f = fovRad / 2;
  return span / (Math.sin(pitchRad) * (1 / Math.tan(pitchRad - f) - 1 / Math.tan(pitchRad + f)));
}

/**
 * 射线与水平面 y = h 的交点；射线平行于平面或朝背离平面的方向时返回 null。
 * origin / dir 是 Three 坐标。
 */
export function rayPlaneY(origin: Vector3, dir: Vector3, h: number, out = new Vector3()): Vector3 | null {
  if (Math.abs(dir.y) < 1e-9) return null;
  const t = (h - origin.y) / dir.y;
  if (t < 0) return null;
  return out.copy(dir).multiplyScalar(t).add(origin);
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

/** 视口高度不低于 720 CSS 像素时界面元素按原始大小，更矮的屏幕按比例放大（最多 2 倍），与 2D 镜头相同 */
export const uiScaleFor = (viewH: number): number => Math.max(1, Math.min(2, UI_REF_VIEW_HEIGHT / viewH));

/**
 * 3D 透视镜头：从南边上空朝北俯视（屏幕上方 = 夜魇），平滑跟随英雄。
 * 屏幕 ↔ 地面的换算通过镜头射线与地面（y = 0 平面）求交实现，操作层和 HUD 通过 ViewCamera 接口使用。
 */
export class Camera3D implements ViewCamera {
  readonly cam: PerspectiveCamera;
  x: number = MAP.laneX;
  y: number = MAP.height / 2;
  viewW = 1;
  viewH = 1;
  dpr = 1;
  private shakeT = 0;
  private shakeAmp = 0;
  private sx = 0;
  private sy = 0;
  private readonly dist: number;
  private readonly pitch: number;
  /** 镜头距离倍数（1 = 正常；调试截图时拉近看模型用） */
  zoom = 1;
  /** 调试用的自由镜头（Three 坐标：eye 看向 at）；null = 正常跟随 */
  debugView: { eye: [number, number, number]; at: [number, number, number] } | null = null;
  private fp: Vec2[] = [];
  private fpBox = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private readonly tmp = new Vector3();
  private readonly tmpDir = new Vector3();

  constructor() {
    this.pitch = CAM3D.pitchDeg * DEG;
    this.dist = cameraDistance(this.pitch, CAM3D.fovDeg * DEG, CAM3D.span);
    this.cam = new PerspectiveCamera(CAM3D.fovDeg, 1, CAM3D.near, CAM3D.far);
    this.place();
  }

  /** 镜头离地高度 */
  get height(): number {
    return this.dist * Math.sin(this.pitch);
  }

  resize(w: number, h: number, dpr: number): void {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
    this.place();
  }

  get worldW(): number {
    return this.fpBox.x1 - this.fpBox.x0;
  }
  get worldH(): number {
    return this.fpBox.y1 - this.fpBox.y0;
  }
  get uiScale(): number {
    return uiScaleFor(this.viewH);
  }

  /** 跟随目标，并向敌方基地方向偏移；snap = 立即到位；rate = 跟随速率（每秒，缺省 7；无敌斩这类连续闪烁时更慢，见 cameraHints） */
  follow(target: Vec2, team: Team, dt: number, snap = false, rate = 7): void {
    const look = CAM3D.lookAhead * (team === Team.Radiant ? -1 : 1);
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    this.x += (target.x - this.x) * k;
    this.y += (target.y + look - this.y) * k;
    this.x = clamp(this.x, MAP.laneX - CAM3D.xRange, MAP.laneX + CAM3D.xRange);
    this.y = clamp(this.y, 450, MAP.height - 420);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = (this.shakeAmp * Math.max(0, this.shakeT)) / 0.35;
      this.sx = (Math.random() * 2 - 1) * a;
      this.sy = (Math.random() * 2 - 1) * a;
    } else {
      this.sx = 0;
      this.sy = 0;
    }
    this.place();
  }

  shake(amp: number): void {
    this.shakeAmp = this.shakeT > 0 ? Math.max(this.shakeAmp, amp) : amp;
    this.shakeT = 0.35;
  }

  /** 按 (x, y) 和震动偏移摆放 Three 镜头，并更新地面可见范围 */
  private place(): void {
    const tx = this.x + this.sx;
    const tz = this.y + this.sy;
    const c = this.cam;
    const d = this.dist * this.zoom;
    c.position.set(tx, d * Math.sin(this.pitch), tz + d * Math.cos(this.pitch));
    c.lookAt(tx, 0, tz);
    if (this.debugView) {
      c.position.set(...this.debugView.eye);
      c.lookAt(...this.debugView.at);
    }
    c.updateMatrixWorld();
    const corners: Vec2[] = [
      { x: 0, y: 0 },
      { x: this.viewW, y: 0 },
      { x: this.viewW, y: this.viewH },
      { x: 0, y: this.viewH },
    ];
    this.fp = corners.map((p) => this.screenToWorld(p));
    const xs = this.fp.map((p) => p.x);
    const ys = this.fp.map((p) => p.y);
    this.fpBox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }

  footprint(): Vec2[] {
    return this.fp;
  }

  /** 世界坐标（离地高度 h）→ CSS 像素；在镜头背后的点返回 null 以外的远处坐标（调用方一般先用 visible 过滤） */
  worldToScreen(p: Vec2, h = 0): Vec2 {
    const v = this.tmp.set(p.x, h, p.y).project(this.cam);
    return { x: ((v.x + 1) / 2) * this.viewW, y: ((1 - v.y) / 2) * this.viewH };
  }

  /** 同 worldToScreen，另外返回该点到镜头的距离（用于按远近缩放界面元素） */
  project(x: number, y: number, h: number, out: { x: number; y: number; depth: number }): { x: number; y: number; depth: number } {
    const v = this.tmp.set(x, h, y);
    out.depth = v.distanceTo(this.cam.position);
    v.project(this.cam);
    out.x = ((v.x + 1) / 2) * this.viewW;
    out.y = ((1 - v.y) / 2) * this.viewH;
    return out;
  }

  /** CSS 像素 → 镜头射线与地面（y = 0）的交点 */
  screenToWorld(p: Vec2): Vec2 {
    const ndc = this.tmp.set((p.x / this.viewW) * 2 - 1, -(p.y / this.viewH) * 2 + 1, 0.5).unproject(this.cam);
    const dir = this.tmpDir.copy(ndc).sub(this.cam.position).normalize();
    const hit = rayPlaneY(this.cam.position, dir, 0, this.tmp);
    // 指向天空时（正常镜头参数下不会发生）退回到镜头正下方
    return hit ? { x: hit.x, y: hit.z } : { x: this.x, y: this.y };
  }

  visible(p: Vec2, margin = 200): boolean {
    const b = this.fpBox;
    return p.x >= b.x0 - margin && p.x <= b.x1 + margin && p.y >= b.y0 - margin && p.y <= b.y1 + margin;
  }

  /** 镜头位置（Three 坐标，含震动），阴影跟随用 */
  get position(): Vector3 {
    return this.cam.position;
  }
}

import type { Vec2 } from '../sim/core/vec2';
import { Team } from '../sim/core/types';
import { MAP } from '../sim/data/map';
import type { ViewCamera } from './view';

/** 屏幕高度对应的世界单位数 */
export const VIEW_WORLD_HEIGHT = 1400;
/** 视口高度（CSS 像素）不低于这个值时，血条和飘字按原始大小绘制；更矮的屏幕（手机横屏）按比例放大 */
export const UI_REF_VIEW_HEIGHT = 720;
const MAX_UI_SCALE = 2;

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

export class Camera implements ViewCamera {
  x: number = MAP.laneX;
  y: number = MAP.height / 2;
  /** CSS 像素 / 世界单位 */
  scale = 1;
  viewW = 1;
  viewH = 1;
  dpr = 1;
  private shakeT = 0;
  private shakeAmp = 0;
  private sx = 0;
  private sy = 0;

  resize(w: number, h: number, dpr: number): void {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.scale = h / VIEW_WORLD_HEIGHT;
  }

  get worldW(): number {
    return this.viewW / this.scale;
  }
  get worldH(): number {
    return this.viewH / this.scale;
  }
  /**
   * 血条、等级、飘字等"界面型"元素的放大倍数。它们画在世界坐标里，会随镜头一起缩小，
   * 手机横屏（约 360–420 CSS 像素高）时如果不放大只有 5–7 像素，看不清。
   */
  get uiScale(): number {
    return Math.max(1, Math.min(MAX_UI_SCALE, UI_REF_VIEW_HEIGHT / this.viewH));
  }

  /** 跟随目标，并向敌方基地方向偏移 20% 屏高；snap = 立即到位；rate = 跟随速率（每秒，缺省 8；无敌斩这类连续闪烁时更慢，见 cameraHints） */
  follow(target: Vec2, team: Team, dt: number, snap = false, rate = 8): void {
    const look = this.worldH * 0.2 * (team === Team.Radiant ? -1 : 1);
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    this.x += (target.x - this.x) * k;
    this.y += (target.y + look - this.y) * k;
    const hw = this.worldW / 2;
    const hh = this.worldH / 2;
    this.x = clamp(this.x, hw, MAP.width - hw);
    this.y = clamp(this.y, hh - 300, MAP.height - hh + 300);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = (this.shakeAmp * Math.max(0, this.shakeT)) / 0.35;
      this.sx = (Math.random() * 2 - 1) * a;
      this.sy = (Math.random() * 2 - 1) * a;
    } else {
      this.sx = 0;
      this.sy = 0;
    }
  }

  shake(amp: number): void {
    this.shakeAmp = this.shakeT > 0 ? Math.max(this.shakeAmp, amp) : amp;
    this.shakeT = 0.35;
  }

  /** 设置世界坐标 → 画布像素的变换 */
  apply(ctx: CanvasRenderingContext2D): void {
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.viewW / 2) - (this.x + this.sx) * s, this.dpr * (this.viewH / 2) - (this.y + this.sy) * s);
  }

  /** 世界坐标 → CSS 像素 */
  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.x) * this.scale + this.viewW / 2, y: (p.y - this.y) * this.scale + this.viewH / 2 };
  }

  /** CSS 像素 → 世界坐标 */
  screenToWorld(p: Vec2): Vec2 {
    return { x: (p.x - this.viewW / 2) / this.scale + this.x, y: (p.y - this.viewH / 2) / this.scale + this.y };
  }

  footprint(): Vec2[] {
    const hw = this.worldW / 2;
    const hh = this.worldH / 2;
    return [
      { x: this.x - hw, y: this.y - hh },
      { x: this.x + hw, y: this.y - hh },
      { x: this.x + hw, y: this.y + hh },
      { x: this.x - hw, y: this.y + hh },
    ];
  }

  visible(p: Vec2, margin = 200): boolean {
    return Math.abs(p.x - this.x) <= this.worldW / 2 + margin && Math.abs(p.y - this.y) <= this.worldH / 2 + margin;
  }
}

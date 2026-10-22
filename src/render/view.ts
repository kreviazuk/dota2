import type { Vec2 } from '../sim/core/vec2';
import type { Team } from '../sim/core/types';
import type { SimEvent } from '../sim/core/events';
import type { World } from '../sim/world';

/** 手动瞄准时的指示器（由操作层计算，世界坐标） */
export interface AimIndicator {
  kind: 'unit' | 'point' | 'direction' | 'none';
  origin: Vec2;
  range: number;
  point?: Vec2;
  dir?: Vec2;
  radius?: number;
  width?: number;
  targetId?: number;
  /** 拖到了取消区：指示器变红 */
  cancel: boolean;
}

/**
 * 镜头的公共接口：2D 俯视镜头（Camera）和 3D 透视镜头（Camera3D）都实现它。
 * 操作层（屏幕 ↔ 世界坐标）、HUD（小地图上的视野框）和特效（是否在画面内、震屏）只依赖这个接口。
 * 坐标都是 sim 的世界坐标（x 向右，y 向下）和 CSS 像素。
 */
export interface ViewCamera {
  /** 镜头中心对准的地面点（世界坐标） */
  x: number;
  y: number;
  viewW: number;
  viewH: number;
  /** 可见地面范围的外接矩形宽高（世界单位） */
  readonly worldW: number;
  readonly worldH: number;
  /** 血条、等级、飘字等界面元素的放大倍数 */
  readonly uiScale: number;
  follow(target: Vec2, team: Team, dt: number, snap?: boolean): void;
  shake(amp: number): void;
  /** 世界坐标（离地高度 h）→ CSS 像素 */
  worldToScreen(p: Vec2, h?: number): Vec2;
  /** CSS 像素 → 地面上的世界坐标 */
  screenToWorld(p: Vec2): Vec2;
  visible(p: Vec2, margin?: number): boolean;
  /** 屏幕四角投影到地面上的四边形（左上、右上、右下、左下），小地图画视野框用 */
  footprint(): Vec2[];
}

/** 渲染器的公共接口：3D（Three.js）渲染器和 2D（Canvas）后备渲染器都实现它。 */
export interface GameRenderer {
  readonly kind: '2d' | '3d';
  readonly camera: ViewCamera;
  resize(): void;
  /** 切换对局 / 跟随对象时：镜头立即到位并清空残留特效 */
  snapTo(world: World, followId: number | null): void;
  /** 消费 sim 事件（特效、飘字、震屏） */
  consume(events: SimEvent[], world: World, followId: number | null): void;
  /** alpha：两次逻辑帧之间的插值系数 0..1；dt：距上一帧的真实秒数（暂停时传 0） */
  render(world: World | null, alpha: number, followId: number | null, dt: number, aim: AimIndicator | null): void;
}

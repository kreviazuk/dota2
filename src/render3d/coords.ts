import { MAP, walkableHalfWidthAt } from '../sim/data/map';

/**
 * sim 坐标 ↔ Three.js 坐标（全项目唯一的换算处）。
 *
 * sim：x 向右，y 向下（天辉在下方、y 大），单位 = 世界单位，没有高度。
 * Three：右手系，Y 轴向上。地面是 XZ 平面：three.x = sim.x，three.z = sim.y，three.y = 离地高度（世界单位）。
 * 1 个 Three 单位 = 1 个世界单位。镜头在南边（+z）的上空朝北（-z）看，所以屏幕上方 = 夜魇方向，和 2D 俯视一致。
 */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** sim 坐标 (x, y) + 高度 h → Three 坐标 */
export function simToThree(x: number, y: number, h = 0, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
  out.x = x;
  out.y = h;
  out.z = y;
  return out;
}

/** Three 坐标 → sim 坐标（丢掉高度） */
export const threeToSim = (v: Vec3Like): { x: number; y: number } => ({ x: v.x, y: v.z });

/**
 * sim 朝向角 facing（atan2(dy, dx)）→ 模型绕 Y 轴的旋转角。
 * 所有模型都按"面朝本地 +Z"建模：绕 Y 旋转 θ 后本地 +Z 指向 (sin θ, 0, cos θ)，要等于 (cos f, 0, sin f)，所以 θ = π/2 − f。
 */
export const facingToRotY = (facing: number): number => Math.PI / 2 - facing;

/** 河床最深处比道路低多少 */
export const RIVER_DEPTH = 26;
/** 水面高度 */
export const WATER_LEVEL = -11;
/** 树林地面比道路高多少（道路两侧形成一道矮坡） */
export const FOREST_RISE = 16;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 地面高度（世界单位）。可走区域（道路、基地）是平的 0；河道是凹下去的河床；道路两侧的树林地面略高。
 * 单位、地面网格、树和装饰都按这个函数放置，所以人物在河里会"站在水里"。
 */
export function groundHeight(x: number, y: number): number {
  const hw = walkableHalfWidthAt(y);
  const off = Math.abs(x - MAP.laneX) - hw;
  // 可走区域边缘外 30–110 单位从 0 升到 FOREST_RISE
  let h = FOREST_RISE * smoothstep(30, 110, off);
  // 河道：中心最深，河岸在 riverHalf 外 70 单位内过渡
  const d = Math.abs(y - MAP.riverY);
  const dip = smoothstep(MAP.riverHalf + 70, MAP.riverHalf - 50, d);
  h = h * (1 - dip) - RIVER_DEPTH * dip;
  return h;
}

import { MAP } from '../sim/data/map';

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

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * 地面高度（世界单位）。可走区域（道路、基地）是平的 0；河道是凹下去的河床；道路两侧的树林地面略高。
 * 单位、地面网格、树和装饰都按这个函数放置，所以人物在河里会"站在水里"。
 */
export function groundHeight(x: number, y: number): number {
  // 基地判定
  const inBase = y < MAP.baseDepth || y > MAP.height - MAP.baseDepth;
  const baseDist = Math.min(
    Math.hypot(x - 1500, y - 8500),
    Math.hypot(x - 8500, y - 1500),
    Math.abs(x - MAP.laneX),
  );
  if (inBase && baseDist <= MAP.baseHalfWidth) {
    const off = baseDist - MAP.baseHalfWidth;
    let h = FOREST_RISE * smoothstep(30, 110, off);
    const d = Math.abs(y - MAP.riverY);
    const dip = smoothstep(MAP.riverHalf + 70, MAP.riverHalf - 50, d);
    return h * (1 - dip) - RIVER_DEPTH * dip;
  }

  // 计算到三路道路中轴线的最小距离
  const dTop1 = distToSegment(x, y, 1500, 8500, 1500, 1500);
  const dTop2 = distToSegment(x, y, 1500, 1500, 8500, 1500);
  const dMid = distToSegment(x, y, 1500, 8500, 8500, 1500);
  const dBot1 = distToSegment(x, y, 1500, 8500, 8500, 8500);
  const dBot2 = distToSegment(x, y, 8500, 8500, 8500, 1500);

  const minDist = Math.min(dTop1, dTop2, dMid, dBot1, dBot2);
  const off = minDist - MAP.laneHalfWidth;

  // 可走区域边缘外 30–110 单位从 0 升到 FOREST_RISE
  let h = FOREST_RISE * smoothstep(30, 110, off);

  // 河道：中心最深，河岸在 riverHalf 外 70 单位内过渡
  const d = Math.abs(y - MAP.riverY);
  const dip = smoothstep(MAP.riverHalf + 70, MAP.riverHalf - 50, d);
  h = h * (1 - dip) - RIVER_DEPTH * dip;
  return h;
}

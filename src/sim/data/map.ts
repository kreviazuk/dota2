import type { Vec2 } from '../core/vec2';
import { Team } from '../core/types';

export type Lane = 'top' | 'mid' | 'bot';
export const LANES: readonly Lane[] = ['top', 'mid', 'bot'];

export const MAP = {
  width: 10000,
  height: 10000,
  minX: 150,
  maxX: 9850,
  minY: 150,
  maxY: 9850,
  laneX: 1500,
  laneHalfWidth: 500,
  baseHalfWidth: 1200,
  baseDepth: 1800,
  riverY: 5000,
  riverHalf: 350,
} as const;

export interface TeamLayout {
  fountain: Vec2;
  ancient: Vec2;
  t4a: Vec2;
  t4b: Vec2;
  // 经典中路别名（兼容单路/旧测试）
  t3: Vec2;
  t2: Vec2;
  t1: Vec2;
  // 三路防御塔
  topT1: Vec2;
  topT2: Vec2;
  topT3: Vec2;
  midT1: Vec2;
  midT2: Vec2;
  midT3: Vec2;
  botT1: Vec2;
  botT2: Vec2;
  botT3: Vec2;
  // 出生与兵线刷新点
  spawn: Vec2;
  topSpawn: Vec2;
  midSpawn: Vec2;
  botSpawn: Vec2;
}

const RADIANT: TeamLayout = {
  fountain: { x: 900, y: 9100 },
  ancient: { x: 1500, y: 8500 },
  t4a: { x: 1300, y: 8300 },
  t4b: { x: 1700, y: 8700 },
  // 中路
  t1: { x: 4200, y: 5800 },
  t2: { x: 3500, y: 6500 },
  t3: { x: 2500, y: 7500 },
  midT1: { x: 4200, y: 5800 },
  midT2: { x: 3500, y: 6500 },
  midT3: { x: 2500, y: 7500 },
  // 上路 (劣后/外侧折角)
  topT1: { x: 1500, y: 5800 },
  topT2: { x: 1500, y: 6800 },
  topT3: { x: 1500, y: 7800 },
  // 下路 (优势路)
  botT1: { x: 6200, y: 8500 },
  botT2: { x: 4500, y: 8500 },
  botT3: { x: 2500, y: 8500 },
  // 出生与出兵点
  spawn: { x: 1700, y: 8300 },
  topSpawn: { x: 1500, y: 8200 },
  midSpawn: { x: 1800, y: 8200 },
  botSpawn: { x: 1800, y: 8500 },
};

/** 点对称函数：以 (5000, 5000) 地图中心点对称 */
export const mirrorPoint = (p: Vec2): Vec2 => ({
  x: MAP.width - p.x,
  y: MAP.height - p.y,
});

/** 兼容旧代码的 mirrorY 函数 */
export const mirrorY = (p: Vec2): Vec2 => ({ x: p.x, y: MAP.height - p.y });

const DIRE: TeamLayout = {
  fountain: mirrorPoint(RADIANT.fountain),
  ancient: mirrorPoint(RADIANT.ancient),
  t4a: mirrorPoint(RADIANT.t4b), // 对称后 t4a/t4b 左右互换对应
  t4b: mirrorPoint(RADIANT.t4a),
  // 中路
  t1: mirrorPoint(RADIANT.midT1),
  t2: mirrorPoint(RADIANT.midT2),
  t3: mirrorPoint(RADIANT.midT3),
  midT1: mirrorPoint(RADIANT.midT1),
  midT2: mirrorPoint(RADIANT.midT2),
  midT3: mirrorPoint(RADIANT.midT3),
  // 上路（夜魇下路为优势路，对称到天辉下路；夜魇上路为劣势路，对称到天辉上路）
  topT1: mirrorPoint(RADIANT.topT1),
  topT2: mirrorPoint(RADIANT.topT2),
  topT3: mirrorPoint(RADIANT.topT3),
  // 下路
  botT1: mirrorPoint(RADIANT.botT1),
  botT2: mirrorPoint(RADIANT.botT2),
  botT3: mirrorPoint(RADIANT.botT3),
  // 出生与出兵点
  spawn: mirrorPoint(RADIANT.spawn),
  topSpawn: mirrorPoint(RADIANT.topSpawn),
  midSpawn: mirrorPoint(RADIANT.midSpawn),
  botSpawn: mirrorPoint(RADIANT.botSpawn),
};

export const layoutFor = (team: Team): TeamLayout => (team === Team.Radiant ? RADIANT : DIRE);

/** 朝敌方基地前进的 y 方向：天辉向上（-1），夜魇向下（+1） */
export const forwardY = (team: Team): number => (team === Team.Radiant ? -1 : 1);

export const walkableHalfWidthAt = (y: number): number =>
  y < MAP.baseDepth || y > MAP.height - MAP.baseDepth ? MAP.baseHalfWidth : MAP.laneHalfWidth;

/** 三路小兵行进路标点（从己方基地出发，穿过防御塔、河道直至敌方遗迹） */
export const LANE_WAYPOINTS: Record<Team, Record<Lane, readonly Vec2[]>> = {
  [Team.Radiant]: {
    top: [
      { x: 1500, y: 8200 },
      { x: 1500, y: 7800 },
      { x: 1500, y: 6800 },
      { x: 1500, y: 5800 },
      { x: 1500, y: 5000 }, // 河道
      { x: 1500, y: 4200 },
      { x: 1500, y: 2500 },
      { x: 2200, y: 1500 }, // 转角
      { x: 3800, y: 1500 },
      { x: 7500, y: 1500 },
      { x: 8500, y: 1500 }, // 敌方遗迹
    ],
    mid: [
      { x: 1800, y: 8200 },
      { x: 2500, y: 7500 },
      { x: 3500, y: 6500 },
      { x: 4200, y: 5800 },
      { x: 5000, y: 5000 }, // 河道中心
      { x: 5800, y: 4200 },
      { x: 6500, y: 3500 },
      { x: 7500, y: 2500 },
      { x: 8500, y: 1500 }, // 敌方遗迹
    ],
    bot: [
      { x: 1800, y: 8500 },
      { x: 2500, y: 8500 },
      { x: 4500, y: 8500 },
      { x: 6200, y: 8500 },
      { x: 7800, y: 8500 },
      { x: 8500, y: 7800 }, // 转角
      { x: 8500, y: 5800 },
      { x: 8500, y: 5000 }, // 河道
      { x: 8500, y: 4200 },
      { x: 8500, y: 2500 },
      { x: 8500, y: 1500 }, // 敌方遗迹
    ],
  },
  [Team.Dire]: {
    top: [
      { x: 8200, y: 1500 },
      { x: 7500, y: 1500 },
      { x: 3800, y: 1500 },
      { x: 2200, y: 1500 },
      { x: 1500, y: 2500 },
      { x: 1500, y: 4200 },
      { x: 1500, y: 5000 },
      { x: 1500, y: 5800 },
      { x: 1500, y: 6800 },
      { x: 1500, y: 7800 },
      { x: 1500, y: 8500 },
    ],
    mid: [
      { x: 8200, y: 1800 },
      { x: 7500, y: 2500 },
      { x: 6500, y: 3500 },
      { x: 5800, y: 4200 },
      { x: 5000, y: 5000 },
      { x: 4200, y: 5800 },
      { x: 3500, y: 6500 },
      { x: 2500, y: 7500 },
      { x: 1500, y: 8500 },
    ],
    bot: [
      { x: 8500, y: 1800 },
      { x: 8500, y: 2500 },
      { x: 8500, y: 4200 },
      { x: 8500, y: 5000 },
      { x: 8500, y: 5800 },
      { x: 8500, y: 7800 },
      { x: 7800, y: 8500 },
      { x: 6200, y: 8500 },
      { x: 4500, y: 8500 },
      { x: 2500, y: 8500 },
      { x: 1500, y: 8500 },
    ],
  },
  [Team.Neutral]: {
    top: [],
    mid: [],
    bot: [],
  },
};

/** 将坐标限制在全地图可行走边界之内 */
export const clampToWalkable = (p: Vec2, radius: number): Vec2 => {
  const x = Math.max(MAP.minX + radius, Math.min(MAP.maxX - radius, p.x));
  const y = Math.max(MAP.minY + radius, Math.min(MAP.maxY - radius, p.y));
  return { x, y };
};

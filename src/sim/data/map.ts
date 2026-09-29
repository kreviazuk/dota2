import type { Vec2 } from '../core/vec2';
import { Team } from '../core/types';

export const MAP = {
  width: 3000,
  height: 10000,
  laneX: 1500,
  laneHalfWidth: 500,
  baseHalfWidth: 800,
  baseDepth: 1400,
  riverY: 5000,
  riverHalf: 150,
  minY: 150,
  maxY: 9850,
} as const;

export interface TeamLayout {
  fountain: Vec2;
  ancient: Vec2;
  t4a: Vec2;
  t4b: Vec2;
  t3: Vec2;
  t2: Vec2;
  t1: Vec2;
  spawn: Vec2;
}

const RADIANT: TeamLayout = {
  fountain: { x: 1500, y: 9750 },
  ancient: { x: 1500, y: 9350 },
  t4a: { x: 1200, y: 9050 },
  t4b: { x: 1800, y: 9050 },
  t3: { x: 1500, y: 8350 },
  t2: { x: 1500, y: 7250 },
  t1: { x: 1500, y: 6100 },
  spawn: { x: 1500, y: 8900 },
};

export const mirrorY = (p: Vec2): Vec2 => ({ x: p.x, y: MAP.height - p.y });

const DIRE: TeamLayout = Object.fromEntries(
  Object.entries(RADIANT).map(([k, v]) => [k, mirrorY(v)]),
) as unknown as TeamLayout;

export const layoutFor = (team: Team): TeamLayout => (team === Team.Radiant ? RADIANT : DIRE);

/** 朝敌方基地前进的 y 方向：天辉向上（-1），夜魇向下（+1） */
export const forwardY = (team: Team): number => (team === Team.Radiant ? -1 : 1);

export const walkableHalfWidthAt = (y: number): number =>
  y < MAP.baseDepth || y > MAP.height - MAP.baseDepth ? MAP.baseHalfWidth : MAP.laneHalfWidth;

export const clampToWalkable = (p: Vec2, radius: number): Vec2 => {
  const y = Math.max(MAP.minY + radius, Math.min(MAP.maxY - radius, p.y));
  const hw = walkableHalfWidthAt(y) - radius;
  const x = Math.max(MAP.laneX - hw, Math.min(MAP.laneX + hw, p.x));
  return { x, y };
};

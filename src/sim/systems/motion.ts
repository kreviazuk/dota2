import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { Vec2 } from '../core/vec2';
import { add, copy, lerp, normalize, scale, sub } from '../core/vec2';
import { clampToWalkable } from '../data/map';
import { cancelCast } from './abilities';

/** 强制位移（击退、肉钩拖拽、跳跃、拉近、冲刺） */
export interface ForcedMotion {
  /** 'knockback' | 'hook' | 'leap' | 'pull' | 'dash'（渲染据此选动作） */
  kind: string;
  sourceId: number | null;
  from: Vec2;
  to: Vec2;
  duration: number;
  elapsed: number;
  /** 渲染用的抛物线最高点（0 = 贴地） */
  height: number;
  /** 期间不能行动（等同眩晕：不能攻击、施法、按指令移动），开始时打断施法和回城 */
  disables: boolean;
  /** 跟随模式：每 tick 由回调给出位置（肉钩拖拽），返回 null 表示结束 */
  follow?: (world: World, u: Unit) => Vec2 | null;
  onEnd?: (world: World, u: Unit, interrupted: boolean) => void;
}

export function startMotion(world: World, u: Unit, m: Omit<ForcedMotion, 'elapsed' | 'from'> & { from?: Vec2 }): void {
  if (u.motion) endMotion(world, u, true);
  u.motion = { ...m, from: copy(m.from ?? u.pos), to: copy(m.to), elapsed: 0 };
  if (m.disables) {
    if (u.cast) cancelCast(world, u, true);
    u.attack.windup = -1;
    if (u.order.kind === 'recall') u.order = { kind: 'idle' };
  }
}

/** 结束位移：正常结束时落到终点（跟随模式停在当前位置），然后调用 onEnd */
export function endMotion(world: World, u: Unit, interrupted: boolean): void {
  const m = u.motion;
  if (!m) return;
  u.motion = null;
  if (!interrupted && !m.follow) u.pos = clampToWalkable(m.to, u.radius);
  m.onEnd?.(world, u, interrupted);
}

export function knockback(world: World, u: Unit, source: Unit | null, dir: Vec2, distance: number, duration: number, height = 0): void {
  const d = normalize(dir);
  startMotion(world, u, {
    kind: 'knockback', sourceId: source?.id ?? null, to: add(u.pos, scale(d, distance)), duration, height, disables: true,
  });
}

/** 瞬移：落点限制在可行走区域，prevPos 同步（渲染不插值），发 fx 'blink'（pos = 起点，dir = 位移向量；o.fx === false 时不发，无敌斩用） */
export function blinkTo(world: World, u: Unit, p: Vec2, o: { fx?: boolean } = {}): void {
  if (u.motion) endMotion(world, u, true);
  const from = copy(u.pos);
  u.pos = clampToWalkable(p, u.radius);
  u.prevPos = copy(u.pos);
  if (o.fx !== false) world.events.emit({ type: 'fx', kind: 'blink', pos: from, dir: sub(u.pos, from), unitId: u.id });
}

/** 渲染用：当前离地高度 4h·t(1−t) */
export function motionHeight(m: ForcedMotion | null): number {
  if (!m || m.height <= 0 || !(m.duration > 0) || !Number.isFinite(m.duration)) return 0;
  const t = Math.max(0, Math.min(1, m.elapsed / m.duration));
  return 4 * m.height * t * (1 - t);
}

export function updateMotion(world: World, dt: number): void {
  for (const u of world.units) {
    const m = u.motion;
    if (!m || !u.alive) continue;
    m.elapsed += dt;
    if (m.follow) {
      const p = m.follow(world, u);
      if (u.motion !== m) continue;
      if (!p) {
        endMotion(world, u, false);
        continue;
      }
      u.pos = clampToWalkable(p, u.radius);
      continue;
    }
    if (m.elapsed >= m.duration - 1e-6) {
      endMotion(world, u, false);
      continue;
    }
    u.pos = clampToWalkable(lerp(m.from, m.to, m.elapsed / m.duration), u.radius);
  }
}

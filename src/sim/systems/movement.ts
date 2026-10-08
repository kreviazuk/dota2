import { castGoal } from './abilities';
import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { Vec2 } from '../core/vec2';
import { add, angleOf, dist, dot, normalize, scale, sub } from '../core/vec2';
import { clampToWalkable } from '../data/map';
import { edgeDist, isDisabled } from '../query';

const MASS: Record<string, number> = { hero: 3, creep: 1, elite: 4, summon: 1, building: 1e6 };

/** 本 tick 想去的位置；null = 不移动 */
export function movementGoal(world: World, u: Unit): Vec2 | null {
  const s = u.stats;
  if (s.fearedBy !== null) {
    const src = world.getUnit(s.fearedBy);
    return src ? add(u.pos, scale(normalize(sub(u.pos, src.pos)), 300)) : null;
  }
  if (s.tauntedBy !== null) {
    const t = world.getUnit(s.tauntedBy);
    if (t && t.alive) return edgeDist(u, t) > s.attackRange ? t.pos : null;
  }
  const o = u.order;
  switch (o.kind) {
    case 'moveDir':
      return add(u.pos, scale(o.dir, 1000));
    case 'moveTo':
      return dist(u.pos, o.point) > 2 ? o.point : null;
    case 'attack': {
      const t = world.getUnit(o.targetId);
      if (!t || !t.alive) return null;
      return edgeDist(u, t) > s.attackRange ? t.pos : null;
    }
    case 'cast':
      return castGoal(world, u);
    default:
      return null;
  }
}

/** 前方有建筑时，把方向偏转到切线方向 */
function steerAroundBuildings(world: World, u: Unit, dir: Vec2): Vec2 {
  let out = dir;
  for (const b of world.units) {
    if (b.kind !== 'building' || !b.alive) continue;
    const to = sub(b.pos, u.pos);
    const d = Math.hypot(to.x, to.y);
    const clear = u.radius + b.radius;
    if (d > clear + 80 || d < 1e-6) continue;
    const toN = scale(to, 1 / d);
    const ahead = dot(out, toN);
    if (ahead <= 0) continue;
    const p1 = { x: -toN.y, y: toN.x };
    const tangent = dot(p1, out) >= 0 ? p1 : { x: -p1.x, y: -p1.y };
    let r = normalize(add(out, scale(tangent, ahead * 1.5)));
    const comp = dot(r, toN);
    if (comp > 0 && d < clear + 10) r = normalize(sub(r, scale(toN, comp)));
    out = r;
  }
  return out;
}

export function updateMovement(world: World, dt: number): void {
  for (const u of world.units) {
    if (!u.alive || u.kind === 'building') continue;
    // 强制位移中的单位由 updateMotion 决定位置（仍参与下面的碰撞推开）
    if (u.motion || isDisabled(u) || u.hasState('rooted') || u.hasState('busy')) continue;
    if (u.cast && !(u.cast.phase === 'channel' && u.cast.ability.def.channelAllowsMove)) continue;
    if (u.attack.windup >= 0) continue;
    const goal = movementGoal(world, u);
    if (!goal) continue;
    const to = sub(goal, u.pos);
    const d = Math.hypot(to.x, to.y);
    if (d < 1e-6) continue;
    const dir = steerAroundBuildings(world, u, scale(to, 1 / d));
    const step = Math.min(u.stats.moveSpeed * dt, d);
    // 允许移动的引导（数箭齐发）中保持面向施法方向：边走边射（走到这里时 u.cast 只可能是允许移动的引导）
    if (u.cast?.phase !== 'channel') u.facing = angleOf(dir);
    u.pos = clampToWalkable(add(u.pos, scale(dir, step)), u.radius);
  }
  resolveCollisions(world);
}

export function resolveCollisions(world: World): void {
  const movers = world.units.filter((u) => u.alive && u.kind !== 'building' && !u.hasState('phased'));
  const buildings = world.units.filter((u) => u.alive && u.kind === 'building');
  for (let i = 0; i < movers.length; i++) {
    const a = movers[i];
    for (let j = i + 1; j < movers.length; j++) {
      const b = movers[j];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      let nx: number, ny: number;
      if (d < 1e-6) {
        const ang = world.rng.range(0, Math.PI * 2);
        nx = Math.cos(ang); ny = Math.sin(ang); d = 0;
      } else {
        nx = dx / d; ny = dy / d;
      }
      const overlap = (min - d) * 0.5;
      const ma = MASS[a.kind] ?? 1;
      const mb = MASS[b.kind] ?? 1;
      const wa = mb / (ma + mb);
      const wb = ma / (ma + mb);
      a.pos.x -= nx * overlap * wa; a.pos.y -= ny * overlap * wa;
      b.pos.x += nx * overlap * wb; b.pos.y += ny * overlap * wb;
    }
  }
  for (const u of movers) {
    for (const b of buildings) {
      const dx = u.pos.x - b.pos.x;
      const dy = u.pos.y - b.pos.y;
      const min = u.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d < 1e-6 ? 1 : dx / d;
      const ny = d < 1e-6 ? 0 : dy / d;
      u.pos = { x: b.pos.x + nx * min, y: b.pos.y + ny * min };
    }
    u.pos = clampToWalkable(u.pos, u.radius);
  }
}

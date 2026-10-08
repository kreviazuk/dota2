import type { World } from '../world';
import { Projectile, type ProjectileInit } from '../entities/projectile';
import { AreaEffect, type AreaEffectInit } from '../entities/effect';
import { add, dist, distToSegment, scale, type Vec2 } from '../core/vec2';
import type { Unit } from '../entities/unit';

export function spawnProjectile(world: World, init: Omit<ProjectileInit, 'id'>): Projectile {
  const p = new Projectile({ ...init, id: world.allocId() });
  world.projectiles.push(p);
  return p;
}

export function spawnEffect(world: World, init: Omit<AreaEffectInit, 'id'>): AreaEffect {
  const e = new AreaEffect({ ...init, id: world.allocId() });
  world.effects.push(e);
  return e;
}

/**
 * 躲弹道（Dota 的 disjoint）：传送、回城等瞬间位移后，正在飞向该单位的追踪弹道全部失效，
 * 按"目标消失"处理（触发 onEnd，不触发 onHit）。直线弹道不受影响。
 */
export function disjointProjectiles(world: World, u: Unit): void {
  for (const p of world.projectiles) {
    if (p.done || p.kind !== 'homing' || p.targetId !== u.id) continue;
    p.done = true;
    p.onEnd?.(world, p);
  }
}

/**
 * 直线弹道这一步（from → to）扫到的单位，按离 from 的距离排序：存活、非建筑、非无敌、没被这个弹道打过，
 * 通过 hitFilter（缺省 = 敌方），且到线段的距离 ≤ 碰撞半径 + 单位半径。自定义 update 的弹道（肉钩）也用它做碰撞
 */
export function linearSweep(world: World, p: Projectile, from: Vec2, to: Vec2): Unit[] {
  const hits = world.units.filter(
    (u) =>
      u.alive && !u.removed && u.kind !== 'building' && !u.hasState('invulnerable') && !p.hit.has(u.id) &&
      (p.hitFilter ? p.hitFilter(world, u) : u.team !== p.team) &&
      distToSegment(u.pos, from, to) <= p.width + u.radius,
  );
  hits.sort((a, b) => dist(a.pos, from) - dist(b.pos, from));
  return hits;
}

export function updateProjectiles(world: World, dt: number): void {
  for (const p of world.projectiles.slice()) {
    if (p.done) continue;
    if (p.update && p.update(world, p, dt)) continue;
    const step = p.speed * dt;
    if (p.kind === 'homing') {
      const t = world.getUnit(p.targetId);
      if (!t || !t.alive || t.removed) {
        p.done = true;
        p.onEnd?.(world, p);
        continue;
      }
      const d = dist(p.pos, t.pos);
      if (d <= step + t.radius) {
        p.pos = { x: t.pos.x, y: t.pos.y };
        p.done = true;
        p.onHit(world, t, p);
        continue;
      }
      p.pos = { x: p.pos.x + ((t.pos.x - p.pos.x) * step) / d, y: p.pos.y + ((t.pos.y - p.pos.y) * step) / d };
      continue;
    }
    const dir = p.dir ?? { x: 0, y: -1 };
    const s = Math.min(step, p.maxDistance - p.traveled);
    const from = p.pos;
    const to = add(from, scale(dir, s));
    p.pos = to;
    p.traveled += s;
    const hits = linearSweep(world, p, from, to);
    for (const u of hits) {
      p.hit.add(u.id);
      p.onHit(world, u, p);
      if (!p.pierce) {
        p.done = true;
        break;
      }
    }
    if (!p.done && p.traveled >= p.maxDistance - 1e-6) {
      p.done = true;
      p.onEnd?.(world, p);
    }
  }
}

export function updateEffects(world: World, dt: number): void {
  for (const e of world.effects.slice()) {
    if (e.done) continue;
    if (!e.started) {
      e.started = true;
      e.onStart?.(world, e);
    }
    e.elapsed += dt;
    if (e.interval > 0 && e.onInterval) {
      e.timer -= dt;
      while (e.timer <= 1e-6 && !e.done) {
        e.onInterval(world, e);
        e.timer += e.interval;
      }
    }
    if (e.elapsed >= e.duration - 1e-6) {
      e.done = true;
      e.onEnd?.(world, e);
    }
  }
}

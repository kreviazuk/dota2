import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { dot, fromAngle, len, scale, sub } from '../core/vec2';
import { applyDamage } from './damage';

/** 分裂范围：从攻击者位置出发、朝主目标方向的梯形 */
export interface CleaveShape {
  startWidth: number;
  endWidth: number;
  length: number;
}

function cleaveDir(attacker: Unit, main: Unit) {
  const d = sub(main.pos, attacker.pos);
  const l = len(d);
  return l > 1e-6 ? scale(d, 1 / l) : fromAngle(attacker.facing);
}

/** 攻击者前方梯形（方向 = 攻击者 → 主目标）内的其他敌方非建筑单位（不含无敌单位；隐藏单位照常命中） */
export function cleaveTargets(world: World, attacker: Unit, main: Unit, shape: CleaveShape): Unit[] {
  const dir = cleaveDir(attacker, main);
  const out: Unit[] = [];
  for (const u of world.units) {
    if (!u.alive || u.removed || u.id === main.id || u.team === attacker.team || u.kind === 'building') continue;
    if (u.hasState('invulnerable')) continue;
    const rel = sub(u.pos, attacker.pos);
    const t = dot(rel, dir);
    if (t < 0 || t > shape.length) continue;
    const lateral = Math.abs(rel.x * dir.y - rel.y * dir.x);
    const width = shape.startWidth + (shape.endWidth - shape.startWidth) * (shape.length > 0 ? t / shape.length : 0);
    if (lateral <= width / 2 + u.radius) out.push(u);
  }
  return out;
}

/**
 * 分裂：对梯形内的单位造成 amount 的无视护甲物理伤害（不是攻击、不受技能增强、不触发攻击特效和吸血），
 * 并发 fx 'cleave'（pos = 攻击者，dir = 方向，radius = length）。
 */
export function applyCleave(world: World, attacker: Unit, main: Unit, amount: number, shape: CleaveShape, abilityId: string): void {
  const dir = cleaveDir(attacker, main);
  const targets = cleaveTargets(world, attacker, main, shape);
  world.events.emit({ type: 'fx', kind: 'cleave', pos: { x: attacker.pos.x, y: attacker.pos.y }, dir, radius: shape.length, unitId: attacker.id });
  if (amount <= 0) return;
  for (const t of targets) {
    applyDamage(world, {
      source: attacker, target: t, amount, type: 'physical', isAttack: false, abilityId, ignoreArmor: true, noSpellAmp: true,
    });
  }
}

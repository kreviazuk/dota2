import type { World } from '../world';
import { Unit, type UnitBase } from '../entities/unit';
import type { Vec2 } from '../core/vec2';
import { dist, fromAngle, scale, sub } from '../core/vec2';
import { clampToWalkable } from '../data/map';
import { addModifier, type ModifierDef } from '../modifiers';
import { killUnit } from './damage';

export interface SummonState {
  ownerId: number;
  expiresAt: number;
  /** 被攻击多少次后死亡（每次普攻固定 1 点，技能伤害无效）；undefined = 普通生命值 */
  hitsToKill?: number;
  /** 跟随主人，保持这个距离 */
  follow?: number;
}

export interface SummonOpts {
  defId: string;
  name: string;
  pos: Vec2;
  radius: number;
  /** 秒；Infinity = 不会到期 */
  duration: number;
  /** 缺省：无攻击、移速 0、生命 1 */
  base?: Partial<UnitBase>;
  hitsToKill?: number;
  follow?: number;
  /** 出生时挂上（sourceId = 主人），例如治疗守卫的回复光环 */
  modifiers?: ModifierDef[];
}

const SUMMON_BASE: UnitBase = {
  maxHp: 1, hpRegen: 0, maxMana: 0, manaRegen: 0, armor: 0, magicResist: 0, damageMin: 0, damageMax: 0, bat: 1,
  attackSpeed: 100, attackPoint: 0, attackRange: 0, projectileSpeed: 0, moveSpeed: 0, acquireRange: 0,
};

/** 召唤物：kind 'summon'、与主人同队、没有赏金（击杀不给金钱和经验）；主人死亡不影响召唤物 */
export function spawnSummon(world: World, owner: Unit, o: SummonOpts): Unit {
  const base: UnitBase = { ...SUMMON_BASE, ...o.base };
  if (o.hitsToKill !== undefined) base.maxHp = o.hitsToKill;
  const u = new Unit({
    id: world.allocId(), kind: 'summon', team: owner.team, defId: o.defId, name: o.name, pos: clampToWalkable(o.pos, o.radius),
    radius: o.radius, base, attackClass: 'basic', armorClass: 'basic', bounty: { gold: 0, xp: 0 },
  });
  u.facing = owner.facing;
  u.summon = { ownerId: owner.id, expiresAt: world.time + o.duration, hitsToKill: o.hitsToKill, follow: o.follow };
  world.addUnit(u);
  for (const def of o.modifiers ?? []) addModifier(world, u, def, { sourceId: owner.id });
  return u;
}

/** 系统（timers 之后）：到期的召唤物死亡并移除；跟随型召唤物走到主人身后 */
export function updateSummons(world: World, dt: number): void {
  void dt;
  const slack = world.balance.summons.followSlack;
  for (const u of world.units.slice()) {
    const s = u.summon;
    if (!s || !u.alive || u.removed) continue;
    if (world.time + 1e-9 >= s.expiresAt) {
      killUnit(world, u, null);
      continue;
    }
    if (s.follow === undefined) continue;
    const owner = world.getUnit(s.ownerId);
    if (!owner || !owner.alive || owner.removed) {
      u.order = { kind: 'idle' };
      continue;
    }
    if (dist(u.pos, owner.pos) > s.follow + slack) {
      const behind = sub(owner.pos, scale(fromAngle(owner.facing), s.follow));
      u.order = { kind: 'moveTo', point: clampToWalkable(behind, u.radius) };
    } else {
      u.order = { kind: 'idle' };
    }
  }
}

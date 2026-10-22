import { World } from '../src/sim/world';
import { Unit, type UnitBase } from '../src/sim/entities/unit';
import { Team } from '../src/sim/core/types';
import type { AbilitySlot, ArmorClass, AttackClass, UnitKind } from '../src/sim/core/types';
import { createHero } from '../src/sim/systems/heroes';
import { syncPassives } from '../src/sim/systems/abilities';
import type { Vec2 } from '../src/sim/core/vec2';

export const makeWorld = (seed = 1): World => new World({ seed, recordEvents: true, spawnCreeps: false });

export const DUMMY_BASE: UnitBase = {
  maxHp: 1000, hpRegen: 0, maxMana: 500, manaRegen: 0, armor: 0, magicResist: 0, damageMin: 50, damageMax: 50,
  bat: 1, attackSpeed: 100, attackPoint: 0.3, attackRange: 150, projectileSpeed: 0, moveSpeed: 300, acquireRange: 600,
};

export interface DummyOpts {
  kind?: UnitKind;
  team?: Team;
  pos?: Vec2;
  radius?: number;
  base?: Partial<UnitBase>;
  attackClass?: AttackClass;
  armorClass?: ArmorClass;
  bounty?: { gold: number; xp: number };
  name?: string;
}

export function spawnDummy(world: World, o: DummyOpts = {}): Unit {
  const u = new Unit({
    id: world.allocId(), kind: o.kind ?? 'creep', team: o.team ?? Team.Radiant, defId: 'dummy', name: o.name ?? '木桩',
    pos: o.pos ?? { x: 1500, y: 5000 }, radius: o.radius ?? 20, base: { ...DUMMY_BASE, ...o.base },
    attackClass: o.attackClass ?? 'hero', armorClass: o.armorClass ?? 'hero', bounty: o.bounty,
  });
  world.addUnit(u);
  return u;
}

export function runFor(world: World, seconds: number): void {
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) world.step();
}

/** 创建英雄、放到 pos、设置技能等级和英雄等级（缺省 18）、关闭站立自动攻击、满蓝，并 step 一次 */
export function heroAt(
  w: World, heroId: string, pos: Vec2, o: { levels?: Partial<Record<AbilitySlot, number>>; heroLevel?: number; team?: Team } = {},
): Unit {
  const u = createHero(w, heroId, o.team ?? Team.Radiant, false);
  u.pos = { x: pos.x, y: pos.y };
  u.prevPos = { x: pos.x, y: pos.y };
  for (const [slot, lv] of Object.entries(o.levels ?? {})) {
    const ab = u.ability(slot as AbilitySlot);
    if (ab && lv !== undefined) ab.level = lv;
  }
  u.hero!.level = o.heroLevel ?? 18;
  syncPassives(w, u);
  u.autoAttack = false;
  w.step();
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  return u;
}

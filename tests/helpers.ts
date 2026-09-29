import { World } from '../src/sim/world';
import { Unit, type UnitBase } from '../src/sim/entities/unit';
import { Team } from '../src/sim/core/types';
import type { ArmorClass, AttackClass, UnitKind } from '../src/sim/core/types';
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

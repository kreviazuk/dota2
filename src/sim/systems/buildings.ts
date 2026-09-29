import type { World } from '../world';
import { Unit, type BuildingState, type UnitBase } from '../entities/unit';
import { Team, TEAMS, enemyTeam } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { layoutFor } from '../data/map';
import type { TowerStats } from '../data/balance';
import { alliesInRadius, canAttack, edgeDist, enemiesInRadius, nearestOf, unitsInRadius } from '../query';
import { addModifier, type ModifierDef } from '../modifiers';
import { recomputeStats } from '../stats';

export const BACKDOOR: ModifierDef = {
  id: 'backdoor_protection',
  hidden: true,
  persistOnDeath: true,
  dispel: 'none',
  onIncomingDamage: (_m, owner, world, info) => {
    const r = world.balance.buildings.backdoorRadius;
    const near = unitsInRadius(world, owner.pos, r, (u) => u.team !== owner.team && (u.kind === 'creep' || u.kind === 'elite'));
    if (near.length === 0) info.amount *= world.balance.buildings.backdoorMult;
  },
};

export interface TeamBuildings {
  fountain: Unit;
  ancient: Unit;
  t4a: Unit;
  t4b: Unit;
  t3: Unit;
  t2: Unit;
  t1: Unit;
}

const TIER_NAME: Record<number, string> = { 1: '一塔', 2: '二塔', 3: '三塔', 4: '基地塔' };

const noAttackBase = (hp: number, armor: number, hpRegen: number): UnitBase => ({
  maxHp: hp, hpRegen, maxMana: 0, manaRegen: 0, armor, magicResist: 0, damageMin: 0, damageMax: 0, bat: 1,
  attackSpeed: 100, attackPoint: 0, attackRange: 0, projectileSpeed: 0, moveSpeed: 0, acquireRange: 0,
});

function makeBuilding(world: World, team: Team, key: string, name: string, pos: Vec2, radius: number, base: UnitBase, st: BuildingState): Unit {
  const u = new Unit({ id: world.allocId(), kind: 'building', team, defId: key, name, pos, radius, base, attackClass: 'tower', armorClass: 'reinforced' });
  u.building = st;
  world.addUnit(u);
  return u;
}

const state = (type: BuildingState['type'], tier: number, key: string, prereq: Unit[], goldTeam = 0, goldLastHit = 0): BuildingState => ({
  type, tier, key, prereqIds: prereq.map((p) => p.id), forcedTargetId: null, forcedUntil: 0, goldTeam, goldLastHit,
});

export function createBuildings(world: World): Record<Team, TeamBuildings> {
  const bb = world.balance.buildings;
  const out = {} as Record<Team, TeamBuildings>;
  for (const team of TEAMS) {
    const L = layoutFor(team);
    const tower = (key: 't1' | 't2' | 't3' | 't4a' | 't4b', tier: number, s: TowerStats, prereq: Unit[]): Unit => {
      const base: UnitBase = {
        maxHp: s.hp, hpRegen: 0, maxMana: 0, manaRegen: 0, armor: s.armor, magicResist: 0, damageMin: s.damage,
        damageMax: s.damage, bat: s.bat, attackSpeed: 100, attackPoint: bb.towerAttackPoint, attackRange: s.attackRange,
        projectileSpeed: bb.towerProjectileSpeed, moveSpeed: 0, acquireRange: s.attackRange,
      };
      const u = makeBuilding(world, team, key, TIER_NAME[tier], L[key], bb.towerRadius, base, state('tower', tier, key, prereq, s.goldTeam, s.goldLastHit));
      if (tier >= 2) addModifier(world, u, BACKDOOR);
      return u;
    };
    const t1 = tower('t1', 1, bb.t1, []);
    const t2 = tower('t2', 2, bb.t2, [t1]);
    const t3 = tower('t3', 3, bb.t3, [t2]);
    const t4a = tower('t4a', 4, bb.t4, [t3]);
    const t4b = tower('t4b', 4, bb.t4, [t3]);
    const ancient = makeBuilding(world, team, 'ancient', '遗迹', L.ancient, bb.ancientRadius,
      noAttackBase(bb.ancient.hp, bb.ancient.armor, bb.ancient.hpRegen), state('ancient', 5, 'ancient', [t4a, t4b]));
    addModifier(world, ancient, BACKDOOR);
    const f = bb.fountain;
    const fountain = makeBuilding(world, team, 'fountain', '泉水', L.fountain, f.radius, {
      maxHp: 1, hpRegen: 0, maxMana: 0, manaRegen: 0, armor: 0, magicResist: 0, damageMin: f.damage, damageMax: f.damage,
      bat: f.bat, attackSpeed: 100, attackPoint: 0.05, attackRange: f.attackRange, projectileSpeed: 1800, moveSpeed: 0,
      acquireRange: f.attackRange,
    }, state('fountain', 0, 'fountain', []));
    fountain.baseStates.add('invulnerable');
    fountain.baseStates.add('untargetable');
    recomputeStats(world, fountain);
    out[team] = { fountain, ancient, t4a, t4b, t3, t2, t1 };
  }
  updateInvulnerability(world);
  return out;
}

export function updateInvulnerability(world: World): void {
  for (const b of world.units) {
    if (b.kind !== 'building' || !b.alive || !b.building || b.building.type === 'fountain') continue;
    const protectedNow = b.building.prereqIds.some((id) => world.getUnit(id)?.alive);
    const has = b.baseStates.has('invulnerable');
    if (protectedNow === has) continue;
    if (protectedNow) b.baseStates.add('invulnerable');
    else b.baseStates.delete('invulnerable');
    recomputeStats(world, b);
  }
}

export function pickTowerTarget(world: World, b: Unit): Unit | null {
  const st = b.building!;
  const inRange = (t: Unit): boolean => canAttack(b, t) && edgeDist(b, t) <= b.stats.attackRange;
  if (st.forcedTargetId !== null && world.time < st.forcedUntil) {
    const f = world.getUnit(st.forcedTargetId);
    if (f && inRange(f)) return f;
  }
  const cur = world.getUnit(b.attack.targetId);
  if (cur && inRange(cur)) return cur;
  const cands = enemiesInRadius(world, b.team, b.pos, b.stats.attackRange + b.radius).filter(inRange);
  const g1 = cands.filter((u) => (u.kind === 'creep' && u.creep?.type !== 'siege') || u.kind === 'elite');
  if (g1.length) return nearestOf(b.pos, g1);
  const g2 = cands.filter((u) => u.creep?.type === 'siege');
  if (g2.length) return nearestOf(b.pos, g2);
  return nearestOf(b.pos, cands);
}

export function updateBuildings(world: World, dt: number): void {
  updateInvulnerability(world);
  const f = world.balance.buildings.fountain;
  for (const b of world.units) {
    if (b.kind !== 'building' || !b.alive || !b.building) continue;
    if (b.building.type === 'fountain') {
      for (const u of alliesInRadius(world, b.team, b.pos, f.healRadius)) {
        u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * f.healPctPerSec * dt);
        u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * f.healPctPerSec * dt);
      }
    }
    if (b.base.damageMax <= 0) continue;
    b.attack.targetId = pickTowerTarget(world, b)?.id ?? null;
  }
}

export function onBuildingKilled(world: World, victim: Unit, killer: Unit | null): void {
  void killer;
  if (victim.kind !== 'building' || !victim.building) return;
  world.events.emit({ type: 'buildingDestroyed', unitId: victim.id, team: victim.team });
  const enemy = enemyTeam(victim.team);
  if (victim.building.tier === 3) world.teams[enemy].superCreeps = true;
  if (victim.building.type === 'ancient') {
    world.winner = enemy;
    world.events.emit({ type: 'victory', winner: enemy });
  }
}

import type { World } from '../world';
import { Unit, type CreepType, type UnitBase } from '../entities/unit';
import { Team, TEAMS } from '../core/types';
import { add, dist, normalize, scale, sub, type Vec2 } from '../core/vec2';
import { forwardY, LANES, type Lane, LANE_WAYPOINTS, layoutFor, MAP } from '../data/map';
import { canAttack, edgeDist, enemiesInRadius, nearestOf } from '../query';
import { getUnlockedElites, spawnElite, type EliteType } from '../entities/elites';

const CREEP_NAMES: Record<CreepType, string> = {
  melee: '近战兵', ranged: '远程兵', siege: '攻城车', superMelee: '超级近战兵', superRanged: '超级远程兵',
};

export const creepUpgradeLevel = (world: World): number => Math.floor(world.time / world.balance.waves.upgradeInterval);

export function spawnCreep(
  world: World,
  team: Team,
  type: CreepType,
  pos: Vec2,
  laneOffset: number,
  protectedFirstWave = false,
  lane?: Lane,
): Unit {
  const b = world.balance;
  const s = b.creeps[type];
  const lvl = creepUpgradeLevel(world);
  const isSuper = type === 'superMelee' || type === 'superRanged';
  const up =
    type === 'melee' || type === 'superMelee' ? b.waves.upgradeMelee
      : type === 'ranged' || type === 'superRanged' ? b.waves.upgradeRanged
        : { hp: 0, damage: 0 };
  const mult = isSuper ? b.waves.superUpgradeMult : 1;
  const hp = s.hp + up.hp * lvl * mult;
  const dmg = s.damage + up.damage * lvl * mult;
  const bountyMult = 1 + b.waves.upgradeBountyPct * lvl;
  const base: UnitBase = {
    maxHp: hp, hpRegen: s.hpRegen, maxMana: 0, manaRegen: 0, armor: s.armor, magicResist: s.magicResist,
    damageMin: dmg - 2, damageMax: dmg + 2, bat: s.bat, attackSpeed: 100, attackPoint: s.attackPoint,
    attackRange: s.attackRange, projectileSpeed: s.projectileSpeed, moveSpeed: s.moveSpeed, acquireRange: s.acquireRange,
  };
  const u = new Unit({
    id: world.allocId(), kind: 'creep', team, defId: type, name: CREEP_NAMES[type], pos, radius: s.radius, base,
    attackClass: s.attackClass, armorClass: s.armorClass, bounty: { gold: s.gold * bountyMult, xp: s.xp * bountyMult },
  });
  u.creep = {
    type,
    lane,
    waypointIndex: 0,
    laneOffset,
    aggroTargetId: null,
    aggroUntil: 0,
    protectedUntilContact: protectedFirstWave,
  };
  world.addUnit(u);
  return u;
}

export function waveComposition(world: World, team: Team, waveIndex: number): CreepType[] {
  const w = world.balance.waves;
  const t = world.time;
  const sup = world.teams[team].superCreeps;
  const melee = w.melee + (t >= w.extraMeleeTime ? 1 : 0);
  const ranged = w.ranged + (t >= w.extraRangedTime ? 1 : 0);
  const out: CreepType[] = [];
  for (let i = 0; i < melee; i++) out.push(sup ? 'superMelee' : 'melee');
  for (let i = 0; i < ranged; i++) out.push(sup ? 'superRanged' : 'ranged');
  if (t >= w.siegeStartTime && waveIndex % w.siegeEveryNWaves === 0) out.push('siege');
  return out;
}

const ROW_OFFSETS = [0, -70, 70, -140, 140, -35, 35];

export function updateSpawner(world: World, dt: number): void {
  void dt;
  if (!world.config.spawnCreeps) return;
  const sp = world.spawner;
  if (world.time + 1e-9 < sp.nextWaveTime) return;
  const hasElite = world.time >= 180 && (world.time >= 720 ? sp.waveIndex % 3 === 0 : sp.waveIndex % 4 === 2);
  let eliteType: EliteType | null = null;
  if (hasElite) {
    const unlocked = getUnlockedElites(world.time);
    if (unlocked.length > 0) {
      eliteType = unlocked[world.rng.int(0, unlocked.length - 1)];
    }
  }
  for (const team of TEAMS) {
    const comp = waveComposition(world, team, sp.waveIndex);
    const L = layoutFor(team);
    const fy = forwardY(team);
    for (const lane of LANES) {
      const spawnBase = lane === 'top' ? L.topSpawn : lane === 'bot' ? L.botSpawn : L.midSpawn;
      const rows: Record<number, number> = {};
      for (const type of comp) {
        const row = type === 'melee' || type === 'superMelee' ? 0 : type === 'siege' ? 2 : 1;
        const idx = rows[row] ?? 0;
        rows[row] = idx + 1;
        const off = ROW_OFFSETS[idx % ROW_OFFSETS.length];
        spawnCreep(
          world,
          team,
          type,
          { x: spawnBase.x + off, y: spawnBase.y - fy * row * 60 },
          off * 0.8,
          sp.waveIndex === 0,
          lane,
        );
      }
    }
    if (eliteType) {
      const eliteLane: Lane = LANES[sp.waveIndex % LANES.length];
      const spawnBase = eliteLane === 'top' ? L.topSpawn : eliteLane === 'bot' ? L.botSpawn : L.midSpawn;
      const eliteUnit = spawnElite(
        world,
        team,
        eliteType,
        { x: spawnBase.x, y: spawnBase.y - fy * 3 * 60 },
        0,
        world.teams[team].eliteMult,
      );
      if (eliteUnit.elite) eliteUnit.elite.lane = eliteLane;
    }
    world.events.emit({ type: 'wave', team, index: sp.waveIndex });
  }
  sp.waveIndex++;
  sp.nextWaveTime += world.balance.waves.interval;
}

export function pickCreepTarget(world: World, u: Unit, acquire: number): Unit | null {
  const cands = enemiesInRadius(world, u.team, u.pos, acquire + u.radius, { includeBuildings: true }).filter((t) => canAttack(u, t));
  const valid = cands.filter((t) => t.team !== Team.Neutral || t.neutral?.inCombat);
  const nonHero = valid.filter((t) => t.kind !== 'hero' && t.kind !== 'building');
  if (nonHero.length) return nearestOf(u.pos, nonHero);
  const blds = valid.filter((t) => t.kind === 'building');
  if (blds.length) return nearestOf(u.pos, blds);
  return nearestOf(u.pos, valid);
}

const setAttack = (u: Unit, t: Unit): void => {
  if (u.order.kind !== 'attack' || u.order.targetId !== t.id) u.order = { kind: 'attack', targetId: t.id, persistent: false };
};

export function updateCreepAI(world: World, dt: number): void {
  void dt;
  const leash = world.balance.aggro.leashMult;
  for (const u of world.units) {
    const c = u.creep;
    if (!c || !u.alive || u.cast) continue;
    const acquire = u.base.acquireRange;
    if (c.protectedUntilContact && enemiesInRadius(world, u.team, u.pos, acquire).some((e) => e.kind !== 'hero')) {
      c.protectedUntilContact = false;
    }
    if (c.aggroTargetId !== null) {
      const t = world.getUnit(c.aggroTargetId);
      if (world.time < c.aggroUntil && t && canAttack(u, t) && edgeDist(u, t) <= acquire * leash) {
        setAttack(u, t);
        continue;
      }
      c.aggroTargetId = null;
    }
    if (u.order.kind === 'attack') {
      const t = world.getUnit(u.order.targetId);
      if (t && canAttack(u, t) && edgeDist(u, t) <= acquire * leash) {
        const switchOffHero =
          t.kind === 'hero' && enemiesInRadius(world, u.team, u.pos, acquire).some((e) => e.kind !== 'hero' && canAttack(u, e));
        if (!switchOffHero) continue;
      }
    }
    const t = pickCreepTarget(world, u, acquire);
    if (t) {
      setAttack(u, t);
      continue;
    }
    // 寻路前进：如果有分配的分路与路标，按路标前进
    if (c.lane && LANE_WAYPOINTS[u.team]?.[c.lane]) {
      const waypoints = LANE_WAYPOINTS[u.team][c.lane];
      c.waypointIndex = c.waypointIndex ?? 0;
      const targetWp = waypoints[c.waypointIndex];
      if (targetWp) {
        if (dist(u.pos, targetWp) < 300 && c.waypointIndex < waypoints.length - 1) {
          c.waypointIndex++;
        }
        const nextWp = waypoints[c.waypointIndex];
        const d = dist(u.pos, nextWp);
        if (d > 1e-4) {
          const dir = normalize(sub(nextWp, u.pos));
          const perp = { x: -dir.y, y: dir.x };
          const goal = add(nextWp, scale(perp, c.laneOffset));
          u.order = { kind: 'moveTo', point: goal };
          continue;
        }
      }
    }
    const fy = forwardY(u.team);
    const goalY = Math.max(MAP.minY + 50, Math.min(MAP.maxY - 50, u.pos.y + fy * 400));
    u.order = { kind: 'moveTo', point: { x: (u.pos.x || MAP.laneX) + c.laneOffset, y: goalY } };
  }
}

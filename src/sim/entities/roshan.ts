import type { World } from '../world';
import { Unit, type UnitBase } from './unit';
import { Team } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { dist } from '../core/vec2';
import { canAttack, edgeDist, enemiesInRadius, nearestOf } from '../query';
import { applyDamage } from '../systems/damage';
import { applySlow } from '../status';
import { grantAegis } from '../items/aegis';

export const ROSHAN_PIT: Vec2 = { x: 1150, y: 5000 };

export interface RoshanState {
  spawnTime: number;
  abilityCooldowns: { slam?: number };
  leashing: boolean;
}

/** 检查世界中是否存活有肉山 */
export function getLiveRoshan(world: World): Unit | undefined {
  return world.units.find((u) => u.defId === 'roshan' && u.alive && !u.removed);
}

/** 动态计算肉山的基础属性（随时间每分钟生命+150，攻击+6） */
export function calculateRoshanBase(time: number): UnitBase {
  const minutes = Math.floor(time / 60);
  const hp = 6000 + minutes * 150;
  const dmg = 150 + minutes * 6;
  return {
    maxHp: hp,
    hpRegen: 20,
    maxMana: 0,
    manaRegen: 0,
    armor: 20,
    magicResist: 0.55,
    damageMin: dmg - 5,
    damageMax: dmg + 5,
    bat: 1.0,
    attackSpeed: 100,
    attackPoint: 0.3,
    attackRange: 150,
    projectileSpeed: 0,
    moveSpeed: 280,
    acquireRange: 450,
  };
}

/** 生成肉山实体 */
export function spawnRoshan(world: World): Unit {
  const base = calculateRoshanBase(world.time);
  const u = new Unit({
    id: world.allocId(),
    kind: 'elite',
    team: Team.Neutral,
    defId: 'roshan',
    name: '肉山',
    pos: { ...ROSHAN_PIT },
    radius: 36,
    base,
    attackClass: 'elite',
    armorClass: 'reinforced',
    bounty: { gold: 400, xp: 500 },
  });

  world.addUnit(u);
  world.events.emit({
    type: 'fx',
    kind: 'roshan_spawn',
    pos: { ...ROSHAN_PIT },
    unitId: u.id,
  });

  return u;
}

export interface RoshanManager {
  nextSpawnTime: number;
}

export function newRoshanManager(): RoshanManager {
  return {
    nextSpawnTime: 900, // 15:00 首次降临
  };
}

/** 肉山死亡触发：击杀英雄获得不朽之守护，并计划 5 分钟后重生 */
export function onRoshanKilled(world: World, victim: Unit, killer: Unit | null): void {
  if (victim.defId !== 'roshan') return;
  const lastHitter = killer && killer.kind === 'hero' ? killer : (victim.lastHeroDamage ? world.getUnit(victim.lastHeroDamage.heroId) : null);
  if (lastHitter && lastHitter.kind === 'hero') {
    grantAegis(world, lastHitter);
  }
  world.events.emit({
    type: 'fx',
    kind: 'roshan_death',
    pos: { ...victim.pos },
    unitId: victim.id,
  });

  // 300 秒（5 分钟）后在巢穴复活
  world.after(300, (w) => {
    spawnRoshan(w);
  });
}

/** 肉山 AI 与定时刷新系统 */
export function updateRoshan(world: World, dt: number): void {
  void dt;
  const roshan = getLiveRoshan(world);
  if (!roshan) {
    if (world.time >= 900 && !(world as any)._roshanFirstSpawned) {
      // 15:00 首次降临（后续通过 300 秒复活定时器刷新）
      (world as any)._roshanFirstSpawned = true;
      spawnRoshan(world);
    }
    return;
  }

  // === 仇恨脱离（Leash）检测 ===
  const distFromPit = dist(roshan.pos, ROSHAN_PIT);
  if (distFromPit > 550) {
    // 超过巢穴 550 距离立即后撤回巢穴并快速回血
    roshan.order = { kind: 'moveTo', point: { ...ROSHAN_PIT } };
    roshan.hp = Math.min(roshan.stats.maxHp, roshan.hp + roshan.stats.maxHp * 0.1 * dt);
    return;
  }

  // === 巨力重击（Slam）施法 ===
  const cd = (roshan as any).slamCooldown ?? 0;
  if (world.time >= cd) {
    const nearby = enemiesInRadius(world, Team.Neutral, roshan.pos, 350);
    if (nearby.length > 0) {
      (roshan as any).slamCooldown = world.time + 10;
      world.events.emit({
        type: 'fx',
        kind: 'roshan_slam',
        pos: { ...roshan.pos },
        unitId: roshan.id,
      });
      for (const target of nearby) {
        applyDamage(world, {
          source: roshan,
          target,
          amount: 120,
          type: 'magical',
          isAttack: false,
        });
        applySlow(world, target, {
          source: roshan,
          duration: 3.0,
          key: 'roshan_slam',
          moveSlow: 0.5,
          attackSlow: 50,
        });
      }
    }
  }

  // === 目标选择与战斗 ===
  const acquire = roshan.base.acquireRange;
  if (roshan.order.kind === 'attack') {
    const currentTarget = world.getUnit(roshan.order.targetId);
    if (currentTarget && canAttack(roshan, currentTarget) && edgeDist(roshan, currentTarget) <= acquire) {
      return;
    }
  }

  const enemies = enemiesInRadius(world, Team.Neutral, roshan.pos, acquire).filter((t) => canAttack(roshan, t));
  const heroes = enemies.filter((t) => t.kind === 'hero');
  const target = heroes.length ? nearestOf(roshan.pos, heroes) : nearestOf(roshan.pos, enemies);

  if (target) {
    roshan.order = { kind: 'attack', targetId: target.id, persistent: false };
    return;
  }

  // 无战斗且离开巢穴则返回
  if (distFromPit > 50) {
    roshan.order = { kind: 'moveTo', point: { ...ROSHAN_PIT } };
  } else {
    roshan.order = { kind: 'idle' };
  }
}

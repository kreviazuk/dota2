import type { World } from '../world';
import { Unit, type EliteType, type UnitBase } from './unit';
import { Team } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { normalize, sub } from '../core/vec2';

export type { EliteType } from './unit';
import { forwardY, MAP } from '../data/map';
import { canAttack, edgeDist, enemiesInRadius, nearestOf } from '../query';
import { addModifier, type ModifierDef } from '../modifiers';
import { prdRoll } from '../prd';
import { applyControl } from '../status';
import { applyDamage } from '../systems/damage';
import { spawnEffect, spawnProjectile } from '../systems/projectiles';

export interface EliteConfig {
  name: string;
  unlockTime: number;
  hp: number;
  hpRegen: number;
  armor: number;
  magicResist: number;
  damage: number;
  bat: number;
  attackRange: number;
  attackPoint: number;
  projectileSpeed: number;
  moveSpeed: number;
  radius: number;
  acquireRange: number;
  gold: number;
  xp: number;
  attackClass: 'basic' | 'pierce' | 'siege' | 'elite' | 'hero';
  armorClass: 'basic' | 'reinforced' | 'hero';
}

export const ELITE_CONFIGS: Record<EliteType, EliteConfig> = {
  centaur_conqueror: {
    name: '半人马征服者',
    unlockTime: 180, // 3:00
    hp: 1100,
    hpRegen: 1.5,
    armor: 3,
    magicResist: 0,
    damage: 45,
    bat: 1.3,
    attackRange: 120,
    attackPoint: 0.4,
    projectileSpeed: 0,
    moveSpeed: 330,
    radius: 24,
    acquireRange: 500,
    gold: 180,
    xp: 220,
    attackClass: 'basic',
    armorClass: 'basic',
  },
  alpha_wolf: {
    name: '头狼',
    unlockTime: 300, // 5:00
    hp: 900,
    hpRegen: 1.0,
    armor: 2,
    magicResist: 0,
    damage: 40,
    bat: 1.2,
    attackRange: 120,
    attackPoint: 0.35,
    projectileSpeed: 0,
    moveSpeed: 350,
    radius: 20,
    acquireRange: 500,
    gold: 220,
    xp: 260,
    attackClass: 'basic',
    armorClass: 'basic',
  },
  satyr_hellcaller: {
    name: '萨特苦难者',
    unlockTime: 420, // 7:00
    hp: 1100,
    hpRegen: 4.0,
    armor: 1,
    magicResist: 0,
    damage: 50,
    bat: 1.35,
    attackRange: 120,
    attackPoint: 0.45,
    projectileSpeed: 0,
    moveSpeed: 320,
    radius: 24,
    acquireRange: 600,
    gold: 260,
    xp: 320,
    attackClass: 'basic',
    armorClass: 'basic',
  },
  ancient_black_dragon: {
    name: '远古黑龙',
    unlockTime: 540, // 9:00
    hp: 1800,
    hpRegen: 2.0,
    armor: 4,
    magicResist: 0.25,
    damage: 70,
    bat: 1.5,
    attackRange: 300,
    attackPoint: 0.5,
    projectileSpeed: 900,
    moveSpeed: 310,
    radius: 28,
    acquireRange: 650,
    gold: 320,
    xp: 420,
    attackClass: 'elite',
    armorClass: 'reinforced',
  },
  ancient_rock_golem: {
    name: '远古岩石傀儡',
    unlockTime: 720, // 12:00
    hp: 2200,
    hpRegen: 1.0,
    armor: 6,
    magicResist: 0.40,
    damage: 70,
    bat: 1.5,
    attackRange: 120,
    attackPoint: 0.5,
    projectileSpeed: 0,
    moveSpeed: 300,
    radius: 28,
    acquireRange: 500,
    gold: 380,
    xp: 500,
    attackClass: 'basic',
    armorClass: 'reinforced',
  },
  golem_shard: {
    name: '小岩石傀儡',
    unlockTime: Infinity,
    hp: 880,
    hpRegen: 0.5,
    armor: 3,
    magicResist: 0.20,
    damage: 28,
    bat: 1.5,
    attackRange: 120,
    attackPoint: 0.5,
    projectileSpeed: 0,
    moveSpeed: 300,
    radius: 18,
    acquireRange: 500,
    gold: 40,
    xp: 60,
    attackClass: 'basic',
    armorClass: 'reinforced',
  },
};

/** 头狼被动：30% 几率 2.0 倍暴击；900 范围友军小兵 +20% 基础攻击力 */
export const MOD_ALPHA_WOLF_PASSIVE: ModifierDef = {
  id: 'mod_alpha_wolf_passive',
  name: '统御光环与暴击',
  hidden: true,
  persistOnDeath: false,
  dispel: 'none',
  onAttackStart: (m, _src, _t, w, atk) => {
    if (prdRoll(w, m.data, 'crit', 0.30)) {
      atk.critMult = Math.max(atk.critMult, 2.0);
    }
  },
  aura: {
    team: 'ally',
    includeSelf: false,
    includeBuildings: false,
    radius: () => 900,
    filter: (_owner, u) => u.kind === 'creep' || u.kind === 'elite' || u.kind === 'summon',
    child: {
      id: 'mod_alpha_wolf_aura_child',
      name: '统御光环',
      dispel: 'none',
      stats: () => ({ baseDamagePct: 0.2 }),
    },
  },
};

/** 岩石傀儡被动：900 范围友方非英雄单位 +150 最大生命值 */
export const MOD_GRANITE_AURA: ModifierDef = {
  id: 'mod_granite_aura',
  name: '花岗岩光环',
  hidden: true,
  persistOnDeath: false,
  dispel: 'none',
  aura: {
    team: 'ally',
    includeSelf: false,
    includeBuildings: false,
    radius: () => 900,
    filter: (_owner, u) => u.kind === 'creep' || u.kind === 'elite' || u.kind === 'summon',
    child: {
      id: 'mod_granite_aura_child',
      name: '花岗岩光环',
      dispel: 'none',
      stats: () => ({ maxHp: 150 }),
    },
  },
};

/** 获取当前游戏时间已解锁的精英怪列表 */
export function getUnlockedElites(time: number): EliteType[] {
  const types: EliteType[] = [
    'centaur_conqueror',
    'alpha_wolf',
    'satyr_hellcaller',
    'ancient_black_dragon',
    'ancient_rock_golem',
  ];
  return types.filter((t) => time >= ELITE_CONFIGS[t].unlockTime);
}

/** 生成一只精英怪 */
export function spawnElite(
  world: World,
  team: Team,
  type: EliteType,
  pos: Vec2,
  laneOffset = 0,
  diffMult = 1.0,
): Unit {
  const cfg = ELITE_CONFIGS[type];
  // 每分钟生命与攻击力成长 +4%（Spec §8）
  const minutes = Math.floor(world.time / 60);
  const growth = 1 + minutes * 0.04;
  const hp = Math.round(cfg.hp * growth * diffMult);
  const dmg = Math.round(cfg.damage * growth * diffMult);
  const gold = Math.round(cfg.gold * growth);
  const xp = Math.round(cfg.xp * growth);

  const base: UnitBase = {
    maxHp: hp,
    hpRegen: cfg.hpRegen,
    maxMana: 0,
    manaRegen: 0,
    armor: cfg.armor,
    magicResist: cfg.magicResist,
    damageMin: dmg - 2,
    damageMax: dmg + 2,
    bat: cfg.bat,
    attackSpeed: 100,
    attackPoint: cfg.attackPoint,
    attackRange: cfg.attackRange,
    projectileSpeed: cfg.projectileSpeed,
    moveSpeed: cfg.moveSpeed,
    acquireRange: cfg.acquireRange,
  };

  const u = new Unit({
    id: world.allocId(),
    kind: 'elite',
    team,
    defId: type,
    name: cfg.name,
    pos,
    radius: cfg.radius,
    base,
    attackClass: cfg.attackClass,
    armorClass: cfg.armorClass,
    bounty: { gold, xp },
  });

  u.elite = {
    type,
    laneOffset,
    abilityCooldowns: {},
  };

  world.addUnit(u);

  if (type === 'alpha_wolf') {
    addModifier(world, u, MOD_ALPHA_WOLF_PASSIVE, {});
  } else if (type === 'ancient_rock_golem') {
    addModifier(world, u, MOD_GRANITE_AURA, {});
  }

  return u;
}

/** 精英怪死亡监听：远古岩石傀儡分裂成 2 个小傀儡 */
export function onEliteKilled(world: World, victim: Unit): void {
  if (victim.kind !== 'elite' || !victim.elite) return;
  if (victim.elite.type === 'ancient_rock_golem') {
    const fy = forwardY(victim.team);
    spawnElite(world, victim.team, 'golem_shard', { x: victim.pos.x - 30, y: victim.pos.y - fy * 15 }, victim.elite.laneOffset - 25);
    spawnElite(world, victim.team, 'golem_shard', { x: victim.pos.x + 30, y: victim.pos.y - fy * 15 }, victim.elite.laneOffset + 25);
  }
}

/** 挑选精英怪的普攻目标 */
function pickEliteTarget(world: World, u: Unit, acquire: number): Unit | null {
  const cands = enemiesInRadius(world, u.team, u.pos, acquire + u.radius, { includeBuildings: true }).filter((t) => canAttack(u, t));
  const nonHero = cands.filter((t) => t.kind !== 'hero' && t.kind !== 'building');
  if (nonHero.length) return nearestOf(u.pos, nonHero);
  const blds = cands.filter((t) => t.kind === 'building');
  if (blds.length) return nearestOf(u.pos, blds);
  return nearestOf(u.pos, cands);
}

/** 精英怪 AI 更新（走线、技能施放、目标攻击） */
export function updateEliteAI(world: World, dt: number): void {
  void dt;
  const leash = world.balance.aggro.leashMult;
  for (const u of world.units) {
    if (u.kind !== 'elite' || !u.elite || !u.alive || u.cast) continue;
    const e = u.elite;
    const t = world.time;

    // === 技能释放检查 ===
    if (e.type === 'centaur_conqueror') {
      const cd = e.abilityCooldowns.stomp ?? 0;
      if (t >= cd) {
        const inRange = enemiesInRadius(world, u.team, u.pos, 250);
        if (inRange.length > 0) {
          e.abilityCooldowns.stomp = t + 12;
          world.events.emit({ type: 'fx', kind: 'centaur_war_stomp', pos: { ...u.pos }, unitId: u.id });
          for (const victim of inRange) {
            applyDamage(world, {
              source: u,
              target: victim,
              amount: 100,
              type: 'magical',
              isAttack: false,
            });
            applyControl(world, victim, 'stun', { source: u, duration: 1.5 });
          }
        }
      }
    } else if (e.type === 'satyr_hellcaller') {
      const cd = e.abilityCooldowns.shockwave ?? 0;
      if (t >= cd) {
        const enemies = enemiesInRadius(world, u.team, u.pos, 700);
        const target = enemies[0];
        if (target) {
          e.abilityCooldowns.shockwave = t + 10;
          const delta = sub(target.pos, u.pos);
          const dir = normalize(delta);
          world.events.emit({ type: 'fx', kind: 'satyr_shockwave', pos: { ...u.pos }, unitId: u.id });
          spawnProjectile(world, {
            kind: 'linear',
            team: u.team,
            sourceId: u.id,
            pos: { ...u.pos },
            dir,
            speed: 900,
            maxDistance: 800,
            width: 140,
            pierce: true,
            visual: 'satyr_shockwave',
            onHit: (w, hitTarget, p) => {
              applyDamage(w, {
                source: w.getUnit(p.sourceId) ?? null,
                target: hitTarget,
                amount: 160,
                type: 'magical',
                isAttack: false,
              });
            },
          });
        }
      }
    } else if (e.type === 'ancient_black_dragon') {
      const cd = e.abilityCooldowns.fireball ?? 0;
      if (t >= cd) {
        const enemies = enemiesInRadius(world, u.team, u.pos, 600);
        const target = enemies[0];
        if (target) {
          e.abilityCooldowns.fireball = t + 12;
          const targetPos = { ...target.pos };
          world.events.emit({ type: 'fx', kind: 'dragon_fireball', pos: targetPos, unitId: u.id });
          spawnEffect(world, {
            team: u.team,
            sourceId: u.id,
            pos: targetPos,
            radius: 250,
            duration: 5.0,
            interval: 0.5,
            visual: 'dragon_fireball',
            onInterval: (w, eff) => {
              const affected = enemiesInRadius(w, eff.team, eff.pos, eff.radius);
              for (const victim of affected) {
                applyDamage(w, {
                  source: w.getUnit(eff.sourceId) ?? null,
                  target: victim,
                  amount: 30, // 30 每 0.5s = 60 每秒
                  type: 'magical',
                  isAttack: false,
                });
              }
            },
          });
        }
      }
    }

    // === 普攻与寻路目标 ===
    const acquire = u.base.acquireRange;
    if (u.order.kind === 'attack') {
      const target = world.getUnit(u.order.targetId);
      if (target && canAttack(u, target) && edgeDist(u, target) <= acquire * leash) {
        continue;
      }
    }

    const target = pickEliteTarget(world, u, acquire);
    if (target) {
      if (u.order.kind !== 'attack' || u.order.targetId !== target.id) {
        u.order = { kind: 'attack', targetId: target.id, persistent: false };
      }
      continue;
    }

    // 沿兵线前推
    const fy = forwardY(u.team);
    const goalY = Math.max(MAP.minY + 50, Math.min(MAP.maxY - 50, u.pos.y + fy * 400));
    u.order = { kind: 'moveTo', point: { x: MAP.laneX + e.laneOffset, y: goalY } };
  }
}

import type { World } from '../world';
import { Unit, type EliteType, type UnitBase } from './unit';
import { Team } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { dist } from '../core/vec2';
import { canAttack, edgeDist, enemiesInRadius, nearestOf } from '../query';
import { mirrorPoint } from '../data/map';
import { ELITE_CONFIGS, type EliteConfig } from './elites';

export type CampTier = 'small' | 'medium' | 'hard' | 'ancient';

export interface NeutralCampDef {
  id: string;
  name: string;
  tier: CampTier;
  pos: Vec2;
  types: EliteType[];
}

export interface NeutralCampState {
  def: NeutralCampDef;
  unitIds: number[];
  nextRespawnTime: number;
}

export const NEUTRAL_CAMPS: readonly NeutralCampDef[] = [
  // 天辉野区（下半区、中路与下路之间）
  { id: 'radiant_small', name: '天辉小型野怪', tier: 'small', pos: { x: 3600, y: 7200 }, types: ['alpha_wolf', 'alpha_wolf'] },
  { id: 'radiant_medium', name: '天辉中型野怪', tier: 'medium', pos: { x: 4800, y: 7500 }, types: ['centaur_conqueror'] },
  { id: 'radiant_hard', name: '天辉大型野怪', tier: 'hard', pos: { x: 3900, y: 6100 }, types: ['satyr_hellcaller'] },
  { id: 'radiant_ancient', name: '天辉远古野怪', tier: 'ancient', pos: { x: 2400, y: 6000 }, types: ['ancient_black_dragon'] },

  // 夜魇野区（上半区、上路与中路之间，严格几何点对称）
  { id: 'dire_small', name: '夜魇小型野怪', tier: 'small', pos: mirrorPoint({ x: 3600, y: 7200 }), types: ['alpha_wolf', 'alpha_wolf'] },
  { id: 'dire_medium', name: '夜魇中型野怪', tier: 'medium', pos: mirrorPoint({ x: 4800, y: 7500 }), types: ['centaur_conqueror'] },
  { id: 'dire_hard', name: '夜魇大型野怪', tier: 'hard', pos: mirrorPoint({ x: 3900, y: 6100 }), types: ['satyr_hellcaller'] },
  { id: 'dire_ancient', name: '夜魇远古野怪', tier: 'ancient', pos: mirrorPoint({ x: 2400, y: 6000 }), types: ['ancient_black_dragon'] },
];

function makeBase(c: EliteConfig): UnitBase {
  return {
    maxHp: c.hp,
    hpRegen: c.hpRegen,
    maxMana: 0,
    manaRegen: 0,
    armor: c.armor,
    magicResist: c.magicResist,
    damageMin: Math.max(1, Math.round(c.damage * 0.9)),
    damageMax: Math.round(c.damage * 1.1),
    bat: c.bat,
    attackSpeed: 100,
    attackPoint: c.attackPoint,
    attackRange: c.attackRange,
    projectileSpeed: c.projectileSpeed,
    moveSpeed: c.moveSpeed,
    acquireRange: c.acquireRange,
  };
}

export function spawnCampUnits(world: World, camp: NeutralCampState): void {
  camp.unitIds = [];
  const n = camp.def.types.length;
  camp.def.types.forEach((type, idx) => {
    const cfg = ELITE_CONFIGS[type];
    const angle = (idx / Math.max(1, n)) * Math.PI * 2;
    const r = n > 1 ? 55 : 0;
    const spawnPos: Vec2 = {
      x: camp.def.pos.x + Math.cos(angle) * r,
      y: camp.def.pos.y + Math.sin(angle) * r,
    };
    const u = new Unit({
      id: world.allocId(),
      kind: 'elite',
      team: Team.Neutral,
      defId: type,
      name: cfg.name,
      pos: spawnPos,
      radius: cfg.radius,
      base: makeBase(cfg),
      attackClass: cfg.attackClass,
      armorClass: cfg.armorClass,
      bounty: { gold: cfg.gold, xp: cfg.xp },
    });
    u.elite = {
      type,
      laneOffset: 0,
      abilityCooldowns: {},
    };
    u.neutral = {
      campId: camp.def.id,
      spawnPos,
      leashTimer: 0,
      inCombat: false,
    };
    world.addUnit(u);
    camp.unitIds.push(u.id);
  });
}

export class NeutralCampManager {
  readonly camps: NeutralCampState[];

  constructor(world: World) {
    this.camps = NEUTRAL_CAMPS.map((def) => ({
      def,
      unitIds: [],
      nextRespawnTime: 0,
    }));
    // 开局立即生成第一波野怪
    for (const c of this.camps) {
      spawnCampUnits(world, c);
      c.nextRespawnTime = 60;
    }
  }

  update(world: World, dt: number): void {
    // 1. 定期刷新清理干净的野怪点（每 60 秒尝试刷新一次）
    for (const camp of this.camps) {
      const allDead = camp.unitIds.every((id) => !world.getUnit(id)?.alive);
      if (allDead && world.time >= camp.nextRespawnTime) {
        // 封野检查：营地 300 范围内无任何单位时方可刷新
        const blockers = world.units.filter((u) => u.alive && !u.removed && dist(u.pos, camp.def.pos) <= 300);
        if (blockers.length === 0) {
          spawnCampUnits(world, camp);
          camp.nextRespawnTime = world.time + 60;
        } else {
          // 被封野，10 秒后重试
          camp.nextRespawnTime = world.time + 10;
        }
      }
    }

    // 2. 野怪 AI、脱战与拉野回巢
    for (const camp of this.camps) {
      for (const id of camp.unitIds) {
        const u = world.getUnit(id);
        if (!u || !u.alive || !u.neutral) continue;
        const st = u.neutral;

        if (!st.inCombat) {
          const dToSpawn = dist(u.pos, st.spawnPos);
          if (dToSpawn > 45) {
            // 回巢中：快速回血
            u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * 0.06 * dt);
            u.order = { kind: 'moveTo', point: st.spawnPos };
          } else {
            // 守卫警戒：敌方单位进入警戒范围则主动攻击
            if (u.order.kind !== 'idle') u.order = { kind: 'idle' };
            const enemies = enemiesInRadius(world, Team.Neutral, u.pos, 260).filter((t) => canAttack(u, t));
            const target = nearestOf(u.pos, enemies);
            if (target) {
              this.alertCamp(world, camp, target);
            }
          }
        } else {
          // 战斗中：检查拉扯距离和追击时长
          const dToSpawn = dist(u.pos, st.spawnPos);
          st.leashTimer += dt;
          if (dToSpawn > 650 || st.leashTimer > 6.0) {
            // 超过最大拉野距离，脱战回巢
            st.inCombat = false;
            st.leashTimer = 0;
            u.attack.targetId = null;
            u.order = { kind: 'moveTo', point: st.spawnPos };
            continue;
          }

          // 保持攻击目标
          const curTarget = u.order.kind === 'attack' ? world.getUnit(u.order.targetId) : null;
          if (!curTarget || !curTarget.alive || edgeDist(u, curTarget) > 500) {
            const enemies = enemiesInRadius(world, Team.Neutral, u.pos, 450).filter((t) => canAttack(u, t));
            const best = nearestOf(u.pos, enemies);
            if (best) {
              u.order = { kind: 'attack', targetId: best.id, persistent: false };
            } else {
              // 丢失目标，回巢
              st.inCombat = false;
              st.leashTimer = 0;
              u.attack.targetId = null;
              u.order = { kind: 'moveTo', point: st.spawnPos };
            }
          }
        }
      }
    }
  }

  alertCamp(world: World, camp: NeutralCampState, target: Unit): void {
    for (const peerId of camp.unitIds) {
      const peer = world.getUnit(peerId);
      if (peer && peer.alive && peer.neutral) {
        peer.neutral.inCombat = true;
        peer.neutral.leashTimer = 0;
        peer.order = { kind: 'attack', targetId: target.id, persistent: false };
      }
    }
  }

  onDamaged(world: World, victim: Unit, source: Unit): void {
    if (!victim.neutral) return;
    const camp = this.camps.find((c) => c.def.id === victim.neutral?.campId);
    if (camp) {
      this.alertCamp(world, camp, source);
    }
  }
}

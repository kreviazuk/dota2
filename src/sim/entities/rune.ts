import type { World } from '../world';
import { Unit } from './unit';
import type { Vec2 } from '../core/vec2';
import { copy, dist } from '../core/vec2';
import { addModifier, removeModifier, type ModifierDef, type ModifierInstance } from '../modifiers';
import { giveGold, giveXp } from '../systems/progress';

export type RuneType = 'double_damage' | 'haste' | 'regen' | 'invis' | 'arcane' | 'bounty';

export interface RuneDef {
  type: RuneType;
  name: string;
  color: string;
  duration: number;
}

export const RUNE_DEFS: Record<RuneType, RuneDef> = {
  double_damage: { type: 'double_damage', name: '双倍伤害', color: '#2196f3', duration: 45 },
  haste: { type: 'haste', name: '急速', color: '#f44336', duration: 25 },
  regen: { type: 'regen', name: '回复', color: '#4caf50', duration: 30 },
  invis: { type: 'invis', name: '隐身', color: '#9c27b0', duration: 45 },
  arcane: { type: 'arcane', name: '奥术', color: '#e91e63', duration: 50 },
  bounty: { type: 'bounty', name: '赏金', color: '#ffc107', duration: 0 },
};

export const POWER_RUNES: readonly RuneType[] = ['double_damage', 'haste', 'regen', 'invis', 'arcane'];

export interface RuneSpot {
  id: string;
  name: string;
  pos: Vec2;
  category: 'power' | 'bounty';
}

/** 河道经典神符刷新点（东侧下路河道、西侧上路河道） */
export const RUNE_SPOTS: readonly RuneSpot[] = [
  { id: 'east_power', name: '东侧河道', pos: { x: 6400, y: 5000 }, category: 'power' },
  { id: 'west_bounty', name: '西侧河道', pos: { x: 3600, y: 5000 }, category: 'bounty' },
];

export const RUNE_SPAWN_INTERVAL = 120; // 每 2 分钟 (120s) 刷新一次
export const RUNE_FIRST_SPAWN = 120;    // 首次在 2:00 刷新
export const RUNE_PICKUP_RADIUS = 100;  // 拾取碰撞半径

export class Rune {
  readonly id: number;
  readonly type: RuneType;
  readonly pos: Vec2;
  readonly spotId: string;
  readonly spawnTime: number;
  pickedUp: boolean = false;

  constructor(id: number, type: RuneType, pos: Vec2, spotId: string, spawnTime: number) {
    this.id = id;
    this.type = type;
    this.pos = copy(pos);
    this.spotId = spotId;
    this.spawnTime = spawnTime;
  }

  get name(): string {
    return RUNE_DEFS[this.type].name;
  }

  get color(): string {
    return RUNE_DEFS[this.type].color;
  }
}

// ----------------- 神符 Buff 定义 -----------------

/** 1. 双倍伤害神符 (Double Damage): +100% 基础攻击力 */
export const MOD_RUNE_DD: ModifierDef = {
  id: 'mod_rune_double_damage',
  name: '双倍伤害',
  dispel: 'weak',
  stacking: 'refresh',
  stats: { baseDamagePct: 1.0 },
};

/** 2. 急速神符 (Haste): 移速达到极限 550 且减速抗性 100% */
export const MOD_RUNE_HASTE: ModifierDef = {
  id: 'mod_rune_haste',
  name: '急速',
  dispel: 'weak',
  stacking: 'refresh',
  finalStats: (_m, _u, _world, s) => {
    s.moveSpeed = 550;
    s.slowResist = 1.0;
  },
};

/** 3. 回复神符 (Regen): 每秒恢复 6% 最大生命与最大魔法，受到敌方英雄伤害打断，满血满蓝自动结束 */
export const MOD_RUNE_REGEN: ModifierDef = {
  id: 'mod_rune_regen',
  name: '回复',
  dispel: 'weak',
  stacking: 'refresh',
  interval: 0.2,
  onInterval: (m: ModifierInstance, owner: Unit, world: World) => {
    if (!owner.alive) return;
    const healHp = owner.stats.maxHp * 0.06 * 0.2;
    const healMana = owner.stats.maxMana * 0.06 * 0.2;
    owner.hp = Math.min(owner.stats.maxHp, owner.hp + healHp);
    owner.mana = Math.min(owner.stats.maxMana, owner.mana + healMana);

    // 满血满蓝自动完成
    if (owner.hp >= owner.stats.maxHp - 0.01 && owner.mana >= owner.stats.maxMana - 0.01) {
      removeModifier(world, owner, m);
    }
  },
  onIncomingDamage: (m: ModifierInstance, owner: Unit, world: World, info) => {
    // 受到敌方英雄伤害打断
    if (info.amount > 0 && info.source && info.source.kind === 'hero' && info.source.team !== owner.team) {
      removeModifier(world, owner, m);
    }
  },
};

/** 4. 隐身神符 (Invis): 进入隐形状态，攻击或施法破隐 */
export const MOD_RUNE_INVIS: ModifierDef = {
  id: 'mod_rune_invis',
  name: '隐身',
  dispel: 'weak',
  stacking: 'refresh',
  states: ['hidden'],
  onAttackStart: (m: ModifierInstance, owner: Unit, _target, world) => {
    removeModifier(world, owner, m);
  },
  onAbilityCast: (m: ModifierInstance, owner: Unit, _abId, world) => {
    removeModifier(world, owner, m);
  },
};

/** 5. 奥术神符 (Arcane): 技能冷却与魔法消耗降低 30% */
export const MOD_RUNE_ARCANE: ModifierDef = {
  id: 'mod_rune_arcane',
  name: '奥术',
  dispel: 'weak',
  stacking: 'refresh',
};

// ----------------- 神符生成与拾取 -----------------

export function spawnRuneAtSpot(world: World, spot: RuneSpot): Rune {
  const type: RuneType = spot.category === 'power'
    ? world.rng.pick(POWER_RUNES)
    : 'bounty';
  const rune = new Rune(world.allocId(), type, spot.pos, spot.id, world.time);
  world.runes.push(rune);
  world.events.emit({
    type: 'fx',
    kind: 'rune_spawn',
    pos: copy(rune.pos),
    targetId: rune.id,
  });
  return rune;
}

export function pickupRune(world: World, rune: Rune, hero: Unit): void {
  if (rune.pickedUp || !hero.alive || hero.removed || hero.kind !== 'hero') return;
  rune.pickedUp = true;
  world.runesPickedCount++;

  const def = RUNE_DEFS[rune.type];

  // 触发拾取特效与音效事件
  world.events.emit({
    type: 'fx',
    kind: 'rune_pickup',
    pos: copy(rune.pos),
    unitId: hero.id,
  });
  world.events.emit({
    type: 'announcement',
    category: 'rune',
    killerId: hero.id,
    team: hero.team,
    title: `${hero.name} 激活了 ${def.name}！`,
  });

  if (rune.type === 'bounty') {
    // 赏金神符：拾取者与队友获得全队金钱与经验
    const minutes = Math.floor(world.time / 60);
    const selfGold = 100 + minutes * 5;
    const selfXp = 100 + minutes * 5;
    const allyGold = 50 + minutes * 3;
    const allyXp = 50 + minutes * 3;

    giveGold(world, hero, selfGold);
    giveXp(world, hero, selfXp);

    const allies = world.heroes(hero.team).filter((u) => u.id !== hero.id && u.alive);
    for (const ally of allies) {
      giveGold(world, ally, allyGold);
      giveXp(world, ally, allyXp);
    }
  } else if (rune.type === 'double_damage') {
    addModifier(world, hero, MOD_RUNE_DD, { duration: def.duration, sourceId: hero.id });
  } else if (rune.type === 'haste') {
    addModifier(world, hero, MOD_RUNE_HASTE, { duration: def.duration, sourceId: hero.id });
  } else if (rune.type === 'regen') {
    addModifier(world, hero, MOD_RUNE_REGEN, { duration: def.duration, sourceId: hero.id });
  } else if (rune.type === 'invis') {
    addModifier(world, hero, MOD_RUNE_INVIS, { duration: def.duration, sourceId: hero.id });
  } else if (rune.type === 'arcane') {
    addModifier(world, hero, MOD_RUNE_ARCANE, { duration: def.duration, sourceId: hero.id });
  }
}

/** 每 tick 更新神符状态：刷新周期检查与英雄自动拾取 */
export function updateRunes(world: World, _dt: number): void {
  // 1. 神符定时刷新检查
  const time = world.time;
  if (time >= RUNE_FIRST_SPAWN) {
    const cycle = Math.floor(time / RUNE_SPAWN_INTERVAL);
    const lastSpawnCycle = (world as unknown as { _lastRuneSpawnCycle?: number })._lastRuneSpawnCycle ?? -1;

    if (cycle > lastSpawnCycle) {
      (world as unknown as { _lastRuneSpawnCycle: number })._lastRuneSpawnCycle = cycle;

      // 刷新前先清理未被拾取的旧神符
      for (const spot of RUNE_SPOTS) {
        const oldRuneIndex = world.runes.findIndex((r) => r.spotId === spot.id && !r.pickedUp);
        if (oldRuneIndex >= 0) {
          world.runes.splice(oldRuneIndex, 1);
        }
        spawnRuneAtSpot(world, spot);
      }
    }
  }

  // 2. 拾取碰撞检查
  const heroes = world.heroes().filter((h) => h.alive && !h.removed);
  for (const rune of world.runes) {
    if (rune.pickedUp) continue;
    for (const hero of heroes) {
      if (dist(hero.pos, rune.pos) <= hero.radius + 60) {
        pickupRune(world, rune, hero);
        break;
      }
    }
  }

  // 3. 移除已拾取神符
  if (world.runes.some((r) => r.pickedUp)) {
    world.runes = world.runes.filter((r) => !r.pickedUp);
  }
}

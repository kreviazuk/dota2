import type { AbilityDef, HeroDef } from './types';
import type { ModifierDef, ModifierInstance } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import { addModifier, dispel, findModifier, removeModifier } from '../modifiers';
import { abilityValue } from '../systems/abilities';
import { applyDamage, heal } from '../systems/damage';
import { performAttack } from '../systems/attack';
import { spawnSummon } from '../systems/summons';
import { blinkTo } from '../systems/motion';
import { prdRoll } from '../prd';
import { effectiveAttackSpeed } from '../formulas';
import { alliesInRadius, enemiesInRadius, isTargetableBy, unitsInRadius } from '../query';
import { add, fromAngle, normalize, scale, sub } from '../core/vec2';

// ---------- E 剑舞 ----------
/** 剑舞是否生效：学会了且没有被破坏 */
const bladeDanceOn = (owner: Unit): boolean => {
  const e = owner.ability('E');
  return !!e && e.level > 0 && !owner.hasState('breakPassives');
};

const BLADE_DANCE: ModifierDef = {
  id: 'jugg_blade_dance', hidden: true, persistOnDeath: true, dispel: 'none',
  // 出手时按伪随机判定暴击；和其他暴击来源同时生效时取更高的倍率
  onAttackStart: (m, owner, _target, world, atk) => {
    if (!bladeDanceOn(owner)) return;
    const e = owner.ability('E')!;
    if (!prdRoll(world, m.data, 'prd', abilityValue(owner, e, 'chance'))) return;
    atk.critMult = Math.max(atk.critMult, abilityValue(owner, e, 'critMult'));
    atk.flags.bladeDance = 1;
  },
  // 25 级天赋：剑舞暴击按实际伤害吸血（不对建筑）
  onAttackLanded: (_m, owner, target, world, info) => {
    if (!info.attack?.flags.bladeDance || target.kind === 'building') return;
    const e = owner.ability('E');
    if (!e) return;
    const ls = abilityValue(owner, e, 'critLifesteal');
    if (ls > 0 && info.amount > 0) heal(world, owner, info.amount * ls);
  },
};

const bladeDance: AbilityDef = {
  id: 'jugg_blade_dance', name: '剑舞',
  description: '主宰的攻击有几率造成暴击（伪随机，不会长时间不出暴击）。剑刃风暴的每一跳伤害也能暴击，无敌斩的每一斩同样可以。被破坏时失效。',
  slot: 'E', maxLevel: 4, targetType: 'passive', damageType: 'physical',
  values: { chance: [0.35], critMult: [1.4, 1.6, 1.8, 2.0], critLifesteal: [0] },
  passive: BLADE_DANCE,
};

// ---------- Q 剑刃风暴 ----------
const BLADE_FURY: ModifierDef = {
  id: 'jugg_blade_fury', name: '剑刃风暴', dispel: 'none',
  states: ['debuffImmune', 'disarmed'],
  stats: (m) => ({ magicResist: m.data.mr ?? 0, moveSpeed: m.data.ms ?? 0 }),
  interval: 0.2,
  // 每 0.2 秒对周围敌方非建筑单位造成 dps × 0.2 魔法伤害；学了剑舞时这一跳用剑舞的伪随机判定一次暴击
  onInterval: (m, owner, world) => {
    const targets = enemiesInRadius(world, owner.team, owner.pos, m.data.radius ?? 0);
    if (!targets.length) return;
    let crit = 1;
    if (bladeDanceOn(owner)) {
      const e = owner.ability('E')!;
      const bd = findModifier(owner, BLADE_DANCE.id);
      if (bd && prdRoll(world, bd.data, 'prdFury', abilityValue(owner, e, 'chance'))) crit = Math.max(1, abilityValue(owner, e, 'critMult'));
    }
    const amount = (m.data.dps ?? 0) * 0.2 * crit;
    for (const t of targets) {
      applyDamage(world, { source: owner, target: t, amount, type: 'magical', isAttack: false, abilityId: 'jugg_blade_fury', crit: crit > 1 });
    }
  },
};

const bladeFury: AbilityDef = {
  id: 'jugg_blade_fury', name: '剑刃风暴',
  description: '主宰化作一团旋转的剑刃风暴，持续对周围的敌人造成魔法伤害。施放时驱散自身所有减益（包括眩晕），旋转期间免疫减益、大幅提高魔法抗性，可以自由移动，但不能普攻。',
  slot: 'Q', maxLevel: 4, targetType: 'none', damageType: 'magical', castPoint: 0,
  cooldown: [30, 26, 22, 18], manaCost: [110],
  values: { dps: [85, 115, 145, 175], radius: [260], duration: [5], magicResist: [0.8], moveSpeed: [0] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    // D16：施放时强驱散自己
    dispel(world, caster, 'strong', 'debuffs');
    addModifier(world, caster, BLADE_FURY, {
      sourceId: caster.id, duration: ctx.v('duration'),
      data: { dps: ctx.v('dps'), radius: ctx.v('radius'), mr: ctx.v('magicResist'), ms: ctx.v('moveSpeed') },
    });
    world.events.emit({ type: 'fx', kind: 'jugg_blade_fury', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id });
  },
};

// ---------- W 治疗守卫 ----------
const WARD_HEAL: ModifierDef = {
  id: 'jugg_healing_ward_heal', hidden: true, dispel: 'none',
  interval: 0.25,
  // 每 0.25 秒给范围内所有友方非建筑单位回复 最大生命 × 百分比 × 0.25（含无敌的友方，例如无敌斩中的主宰）
  onInterval: (m, owner, world) => {
    const pct = m.data.heal ?? 0;
    if (pct <= 0) return;
    for (const u of alliesInRadius(world, owner.team, owner.pos, m.data.radius ?? 0, { includeInvulnerable: true })) {
      if (u.id !== owner.id) heal(world, u, u.stats.maxHp * pct * 0.25);
    }
  },
};

const healingWard: AbilityDef = {
  id: 'jugg_healing_ward', name: '治疗守卫',
  description: '在身前召唤一个会跟随主宰移动的治疗守卫，持续为周围所有友方单位按最大生命的百分比回复生命。守卫被任意一次普攻就会摧毁，技能伤害对它无效。',
  slot: 'W', maxLevel: 4, targetType: 'none', castPoint: 0.3, cooldown: [60], manaCost: [120],
  values: { heal: [0.02, 0.03, 0.04, 0.05], radius: [400], duration: [18, 20, 22, 24], wardSpeed: [325], follow: [150] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const ward = spawnSummon(world, caster, {
      defId: 'jugg_healing_ward', name: '治疗守卫', pos: add(caster.pos, scale(fromAngle(caster.facing), 80)), radius: 20,
      duration: ctx.v('duration'), hitsToKill: 1, follow: ctx.v('follow'), base: { moveSpeed: ctx.v('wardSpeed') },
      modifiers: [WARD_HEAL],
    });
    const m = findModifier(ward, WARD_HEAL.id);
    if (m) {
      m.data.heal = ctx.v('heal');
      m.data.radius = ctx.v('radius');
    }
    world.events.emit({ type: 'fx', kind: 'jugg_healing_ward', pos: { x: ward.pos.x, y: ward.pos.y }, unitId: ward.id });
  },
};

// ---------- R 无敌斩 ----------
/** 两斩之间的间隔：1.4 / (攻速/100 × 1.4) = 100 / 攻速（D15，攻速含无敌斩的 +40） */
const slashInterval = (u: Unit): number => 100 / effectiveAttackSpeed(u.stats.attackSpeed);

/** D15：主宰当前位置 radius 内随机选一个敌方英雄，没有英雄再随机选其他敌方单位（不含建筑、隐藏、无敌、不可选中） */
function pickSlashTarget(world: World, j: Unit, radius: number): Unit | null {
  const pool = unitsInRadius(world, j.pos, radius, (u) => u.team !== j.team && isTargetableBy(j, u, 'enemy', true));
  if (!pool.length) return null;
  const heroes = pool.filter((u) => u.kind === 'hero');
  const list = heroes.length ? heroes : pool;
  return list[world.rng.int(0, list.length - 1)];
}

/** 一斩：闪到目标身边（靠近主宰的一侧）、转向、立即结算一次攻击（可以闪避、可以暴击） */
function slash(world: World, j: Unit, t: Unit): void {
  const from = { x: j.pos.x, y: j.pos.y };
  const back = normalize(sub(j.pos, t.pos));
  const side = back.x || back.y ? back : fromAngle(j.facing + Math.PI);
  blinkTo(world, j, add(t.pos, scale(side, j.radius + t.radius + 8)), { fx: false });
  const d = sub(t.pos, j.pos);
  if (d.x || d.y) j.facing = Math.atan2(d.y, d.x);
  world.events.emit({ type: 'fx', kind: 'jugg_omnislash', pos: from, unitId: j.id, targetId: t.id });
  performAttack(world, j, t, { instant: true, abilityId: 'jugg_omnislash' });
}

const OMNISLASH: ModifierDef = {
  id: 'jugg_omnislash', name: '无敌斩', dispel: 'none',
  states: ['invulnerable', 'debuffImmune', 'untargetable', 'busy'],
  stats: (m) => ({ attackSpeed: m.data.as ?? 0, bonusDamage: m.data.dmg ?? 0 }),
  onTick: (m: ModifierInstance, owner, world, dt) => {
    m.data.timer = (m.data.timer ?? 0) - dt;
    while (m.data.timer <= 1e-6 && owner.modifiers.includes(m)) {
      const t = pickSlashTarget(world, owner, m.data.radius ?? 0);
      // 附近没有目标：提前结束
      if (!t) {
        removeModifier(world, owner, m);
        return;
      }
      slash(world, owner, t);
      m.data.timer += slashInterval(owner);
    }
  },
};

const omnislash: AbilityDef = {
  id: 'jugg_omnislash', name: '无敌斩',
  description: '主宰跳向一名敌人并开始连续斩击，每一斩都会跳到附近随机的敌人身边（优先敌方英雄），斩击速度随攻击速度提高。期间主宰无敌、免疫减益、不能被选中，也不能接受其他指令；附近没有敌人时提前结束。施放时驱散自身的减益。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'unit', targetTeam: 'enemy', damageType: 'physical',
  castRange: [450], castPoint: 0.3, cooldown: [120], manaCost: [200, 275, 350],
  values: { duration: [3, 3.25, 3.5], attackSpeed: [40], bonusDamage: [25, 30, 35], radius: [425] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    dispel(world, caster, 'weak', 'debuffs');
    const m = addModifier(world, caster, OMNISLASH, {
      sourceId: caster.id, duration: ctx.v('duration'),
      data: { as: ctx.v('attackSpeed'), dmg: ctx.v('bonusDamage'), radius: ctx.v('radius'), timer: 0 },
    });
    if (!m) return;
    caster.order = { kind: 'idle' };
    caster.attack.windup = -1;
    // 第一刀立即斩向施法目标
    slash(world, caster, t);
    m.data.timer = slashInterval(caster);
  },
};

// ---------- 先天 剑心犹在 ----------
export interface BladeformState {
  stacks: number;
  /** 从这个时刻起计算"连续没有受伤"的时间 */
  quietSince: number;
  /** 已经处理过的最后一次受伤时刻 */
  lastHit: number;
  /** 层数将在这个时刻清零（Infinity = 没有待清零） */
  dropAt: number;
}

export interface BladeformCfg {
  interval: number;
  maxStacks: number;
  linger: number;
  /** 被破坏时不再获得新层（已有的层数照常生效） */
  canGain: boolean;
}

/**
 * 剑心犹在的状态推进（纯函数）：受到伤害后层数保留 linger 秒再全部清零，清零后重新开始计时；
 * 连续 interval 秒没有受伤就 +1 层（最多 maxStacks）。
 */
export function bladeformStep(s: BladeformState, now: number, lastDamagedTime: number, cfg: BladeformCfg): BladeformState {
  let { stacks, quietSince, lastHit, dropAt } = s;
  if (lastDamagedTime > lastHit) {
    lastHit = lastDamagedTime;
    dropAt = lastDamagedTime + cfg.linger;
    quietSince = dropAt;
  }
  if (now + 1e-6 >= dropAt) {
    stacks = 0;
    dropAt = Infinity;
  }
  if (!cfg.canGain) return { stacks, quietSince: Math.max(quietSince, now), lastHit, dropAt };
  if (now + 1e-6 >= quietSince && cfg.interval > 0) {
    const n = Math.floor((now - quietSince + 1e-6) / cfg.interval);
    stacks += n;
    quietSince += n * cfg.interval;
    if (stacks >= cfg.maxStacks) {
      stacks = cfg.maxStacks;
      quietSince = now;
    }
  }
  return { stacks, quietSince, lastHit, dropAt };
}

const bladeformAbility = (u: Unit) => u.ability('innate');

/** 层数（没有该 Modifier 时为 0） */
const bladeformStacks = (u: Unit): number => findModifier(u, 'jugg_bladeform')?.data.stacks ?? 0;

const BLADEFORM: ModifierDef = {
  id: 'jugg_bladeform', hidden: true, persistOnDeath: true, dispel: 'none',
  onApply: (m, owner, world) => {
    m.data.stacks = 0;
    m.data.quietSince = world.time;
    m.data.lastHit = owner.hero?.lastDamagedTime ?? -Infinity;
    m.data.dropAt = Infinity;
  },
  onTick: (m, owner, world) => {
    const ab = bladeformAbility(owner);
    if (!ab) return;
    const lastDamaged = owner.hero?.lastDamagedTime ?? -Infinity;
    // 复活后从头开始计时
    if (m.data.revive) {
      m.data.revive = 0;
      m.data.quietSince = world.time;
      m.data.lastHit = Math.max(m.data.lastHit, lastDamaged);
    }
    const next = bladeformStep(
      { stacks: m.data.stacks, quietSince: m.data.quietSince, lastHit: m.data.lastHit, dropAt: m.data.dropAt },
      world.time, lastDamaged,
      {
        interval: abilityValue(owner, ab, 'interval'), maxStacks: Math.round(abilityValue(owner, ab, 'maxStacks')),
        linger: abilityValue(owner, ab, 'linger'), canGain: !owner.hasState('breakPassives'),
      },
    );
    Object.assign(m.data, next);
  },
  // 死亡时层数清零
  onDeath: (m) => {
    m.data.stacks = 0;
    m.data.dropAt = Infinity;
    m.data.revive = 1;
  },
  // 每层：基础敏捷（等级成长部分，不含属性加成和装备）× (2.5% + 0.1% × 英雄等级)
  lateStats: (m, owner) => {
    const h = owner.hero;
    const ab = bladeformAbility(owner);
    const stacks = m.data.stacks ?? 0;
    if (!h || !ab || stacks <= 0) return {};
    const baseAgi = h.attrs.agi[0] + h.attrs.agi[1] * (h.level - 1);
    return { agi: baseAgi * abilityValue(owner, ab, 'agiPct') * stacks };
  },
  stats: (m, owner) => {
    const ab = bladeformAbility(owner);
    const stacks = m.data.stacks ?? 0;
    return ab && stacks > 0 ? { moveSpeedPct: abilityValue(owner, ab, 'moveSpeed') * stacks } : {};
  },
};

const bladeform: AbilityDef = {
  id: 'jugg_bladeform', name: '剑心犹在',
  description: '先天技能：主宰每隔一段时间没有受到伤害，就获得一层剑心，每层提高基础敏捷的一定比例（随英雄等级提高）和移动速度。受到伤害后，层数会在片刻之后全部消失。被破坏时不再获得新层。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { interval: [2], maxStacks: [10], agiPct: [0.025], agiPctPerLevel: [0.001], moveSpeed: [0.01], linger: [2] },
  passive: BLADEFORM,
  counter: (u) => bladeformStacks(u),
};

export const JUGGERNAUT: HeroDef = {
  id: 'juggernaut', name: '主宰', title: '尤涅若', primary: 'agi',
  str: [20, 2.0], agi: [32, 2.8], int: [14, 1.4],
  baseDamage: [22, 24], baseArmor: 0, baseHpRegen: 0.5, baseManaRegen: 0,
  attackRange: 150, bat: 1.4, baseAttackSpeed: 110, attackPoint: 0.33, projectileSpeed: 0, moveSpeed: 305,
  roles: ['核心', '推进', '爆发'],
  abilities: [bladeFury, healingWard, bladeDance, omnislash, bladeform],
  talents: [
    [
      { id: 'jugg_t10a', name: '−12 秒治疗守卫冷却', valueBonus: { abilityId: 'jugg_healing_ward', key: 'cooldown', add: -12 } },
      { id: 'jugg_t10b', name: '−1 秒剑心层数获得间隔', valueBonus: { abilityId: 'jugg_bladeform', key: 'interval', add: -1 } },
    ],
    [
      { id: 'jugg_t15a', name: '−15 秒无敌斩冷却', valueBonus: { abilityId: 'jugg_omnislash', key: 'cooldown', add: -15 } },
      { id: 'jugg_t15b', name: '剑刃风暴期间 +45 移速', valueBonus: { abilityId: 'jugg_blade_fury', key: 'moveSpeed', add: 45 } },
    ],
    [
      { id: 'jugg_t20a', name: '+15% 剑舞暴击伤害', valueBonus: { abilityId: 'jugg_blade_dance', key: 'critMult', add: 0.15 } },
      { id: 'jugg_t20b', name: '+120 剑刃风暴每秒伤害', valueBonus: { abilityId: 'jugg_blade_fury', key: 'dps', add: 120 } },
    ],
    [
      { id: 'jugg_t25a', name: '+1 秒无敌斩持续时间', valueBonus: { abilityId: 'jugg_omnislash', key: 'duration', add: 1 } },
      { id: 'jugg_t25b', name: '+40% 剑舞暴击吸血', valueBonus: { abilityId: 'jugg_blade_dance', key: 'critLifesteal', add: 0.4 } },
    ],
  ],
};

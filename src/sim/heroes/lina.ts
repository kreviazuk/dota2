import type { AbilityDef, AbilityInstance, HeroDef } from './types';
import type { ModifierDef, ModifierInstance } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import { addModifier, findModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { abilityCastRange, abilityValue } from '../systems/abilities';
import { spawnEffect, spawnProjectile } from '../systems/projectiles';
import { applyControl } from '../status';
import { enemiesInRadius, isTargetableBy, nearestOf } from '../query';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

// ---------- Q 龙破斩 ----------
const dragonSlave: AbilityDef = {
  id: 'lina_dragon_slave', name: '龙破斩',
  description: '向指定方向喷出一道火焰波，对沿途的所有敌人造成魔法伤害。火焰波越往前越窄。',
  slot: 'Q', maxLevel: 4, targetType: 'direction', damageType: 'magical', castPoint: 0.35,
  castRange: [1075], cooldown: [11, 10, 9, 8], manaCost: [90, 100, 110, 120],
  values: { damage: [65, 125, 185, 245], startWidth: [275], endWidth: [200], width: [275], distance: [1075], speed: [1200] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const dir = ctx.target.dir;
    if (!dir) return;
    const damage = ctx.v('damage');
    const distance = ctx.v('distance');
    const w0 = ctx.v('startWidth');
    const w1 = ctx.v('endWidth');
    spawnProjectile(world, {
      team: caster.team, sourceId: caster.id, pos: { x: caster.pos.x, y: caster.pos.y }, speed: ctx.v('speed'),
      kind: 'linear', dir, maxDistance: distance, width: w0 / 2, pierce: true, visual: 'lina_dragon_slave',
      // 碰撞半径随飞行距离从 275/2 收窄到 200/2
      update: (_w, p) => {
        p.width = lerp(w0, w1, p.traveled / distance) / 2;
        return false;
      },
      onHit: (w, target) => {
        applyDamage(w, { source: caster, target, amount: damage, type: 'magical', isAttack: false, abilityId: 'lina_dragon_slave' });
      },
    });
    world.events.emit({ type: 'fx', kind: 'lina_dragon_slave', pos: { x: caster.pos.x, y: caster.pos.y }, dir: { x: dir.x, y: dir.y }, unitId: caster.id });
  },
};

// ---------- W 光击阵 ----------
const lightStrikeArray: AbilityDef = {
  id: 'lina_light_strike_array', name: '光击阵',
  description: '在指定地点召唤一道火柱。短暂预警后，火柱对范围内的所有敌人造成魔法伤害并眩晕。',
  slot: 'W', maxLevel: 4, targetType: 'point', damageType: 'magical', castPoint: 0.45,
  castRange: [700], cooldown: [13, 11, 9, 7], manaCost: [100, 110, 120, 130],
  values: { damage: [80, 125, 170, 215], stun: [1.2, 1.6, 2.0, 2.4], radius: [250], delay: [0.5] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const p = ctx.target.point;
    if (!p) return;
    // 数值在施放时确定
    const damage = ctx.v('damage');
    const stun = ctx.v('stun');
    const radius = ctx.v('radius');
    spawnEffect(world, {
      team: caster.team, sourceId: caster.id, pos: p, radius, duration: ctx.v('delay'), visual: 'lina_lsa',
      onEnd: (w, e) => {
        for (const u of enemiesInRadius(w, caster.team, e.pos, radius)) {
          applyDamage(w, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'lina_light_strike_array' });
          if (u.alive) applyControl(w, u, 'stun', { source: caster, duration: stun });
        }
        w.events.emit({ type: 'fx', kind: 'lina_lsa', pos: { x: e.pos.x, y: e.pos.y }, radius, unitId: caster.id });
      },
    });
  },
};

// ---------- E 炽魂 ----------
/** 层数 Buff：每层的攻速 / 移速 / 魔抗读莉娜当前的炽魂数值（含天赋）；被破坏时无效 */
const FIERY_SOUL_STACK: ModifierDef = {
  id: 'lina_fiery_soul_stack', name: '炽魂', stacking: 'stacks', maxStacks: 7, dispel: 'none',
  stats: (m, owner) => {
    const ab = owner.ability('E');
    if (!ab || ab.level <= 0 || owner.hasState('breakPassives')) return {};
    const v = (k: string) => abilityValue(owner, ab, k);
    return { attackSpeed: v('attackSpeed') * m.stacks, moveSpeedPct: v('moveSpeed') * m.stacks, magicResist: v('magicResist') * m.stacks };
  },
};

const FIERY_SOUL: ModifierDef = {
  id: 'lina_fiery_soul', hidden: true, persistOnDeath: true, dispel: 'none',
  // 莉娜的技能（不含烧灼）每对敌方单位造成一次伤害叠 1 层（D14）
  onDealtDamage: (_m, owner, target, world, info) => {
    if (!info.abilityId || info.abilityId === 'lina_slow_burn' || info.isAttack || target.team === owner.team) return;
    if (!owner.alive || owner.hasState('breakPassives')) return;
    const ab = owner.ability('E');
    if (!ab || ab.level <= 0) return;
    addModifier(world, owner, FIERY_SOUL_STACK, { sourceId: owner.id, duration: abilityValue(owner, ab, 'duration') });
  },
};

const fierySoul: AbilityDef = {
  id: 'lina_fiery_soul', name: '炽魂',
  description: '莉娜的技能每命中一个敌人，就获得一层炽魂，每层提高攻击速度和移动速度，层数有上限。再次命中会刷新持续时间。',
  slot: 'E', maxLevel: 4, targetType: 'passive',
  values: { attackSpeed: [7, 14, 21, 28], moveSpeed: [0.01, 0.015, 0.02, 0.025], duration: [16], magicResist: [0] },
  passive: FIERY_SOUL,
  // 没有层数时不显示角标
  counter: (u) => findModifier(u, 'lina_fiery_soul_stack')?.stacks ?? null,
};

// ---------- R 神灭斩 ----------
/** 神灭斩能否击杀 t：伤害 × (1 + 技能增强) × (1 − 魔抗) ≥ 当前生命（AI 和智能施法共用） */
export function lagunaKills(caster: Unit, ab: AbilityInstance, t: Unit): boolean {
  return abilityValue(caster, ab, 'damage') * (1 + caster.stats.spellAmp) * (1 - t.stats.magicResist) >= t.hp;
}

const lagunaBlade: AbilityDef = {
  id: 'lina_laguna_blade', name: '神灭斩',
  description: '向一名敌人释放一道巨大的闪电，短暂延迟后造成大量魔法伤害。智能施法优先锁定能被击杀的敌方英雄。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'unit', targetTeam: 'enemy', damageType: 'magical',
  castPoint: 0.3, castRange: [750], cooldown: [70, 60, 50], manaCost: [150, 300, 450],
  values: { damage: [400, 580, 760], delay: [0.25] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    const damage = ctx.v('damage');
    world.events.emit({ type: 'fx', kind: 'lina_laguna', pos: { x: t.pos.x, y: t.pos.y }, unitId: caster.id, targetId: t.id });
    world.after(ctx.v('delay'), (w) => {
      if (!t.alive || t.removed || t.hasState('invulnerable')) return;
      applyDamage(w, { source: caster, target: t, amount: damage, type: 'magical', isAttack: false, abilityId: 'lina_laguna_blade' });
      w.events.emit({ type: 'fx', kind: 'lina_laguna_hit', pos: { x: t.pos.x, y: t.pos.y }, unitId: caster.id, targetId: t.id });
    });
  },
  // 智能施法：施法距离 + 300 内能击杀的敌方英雄里血量最低的；否则最近的敌方英雄
  smartTarget: (world, caster, ab) => {
    const heroes = enemiesInRadius(world, caster.team, caster.pos, abilityCastRange(caster, ab) + 300, { heroesOnly: true }).filter((u) =>
      isTargetableBy(caster, u, 'enemy', false),
    );
    const killable = heroes.filter((u) => lagunaKills(caster, ab, u));
    if (killable.length) return { unit: killable.reduce((a, b) => (b.hp < a.hp ? b : a)) };
    const t = nearestOf(caster.pos, heroes);
    return t ? { unit: t } : null;
  },
};

// ---------- 先天 慢热 ----------
const BURN_INTERVAL = 0.5;

/** 烧灼：同一个莉娜对同一目标只有一个池子；每 0.5 秒把池子按剩余跳数平分结算（D13） */
const SLOW_BURN_DOT: ModifierDef = {
  id: 'lina_slow_burn_dot', name: '慢热', debuff: true, perSource: true, dispel: 'none', interval: BURN_INTERVAL,
  onInterval: (m, owner, world) => {
    const pool = m.data.pool ?? 0;
    if (pool <= 0) return;
    const ticks = Math.max(1, Math.ceil(m.duration / BURN_INTERVAL - 1e-6));
    const amount = pool / ticks;
    m.data.pool = pool - amount;
    applyDamage(world, {
      source: world.getUnit(m.sourceId) ?? null, target: owner, amount, type: 'magical', isAttack: false,
      abilityId: 'lina_slow_burn', noSpellAmp: true,
    });
  },
};

function addBurn(world: World, lina: Unit, target: Unit, amount: number, duration: number): ModifierInstance | null {
  const pool = (findModifier(target, SLOW_BURN_DOT.id, lina.id)?.data.pool ?? 0) + amount;
  return addModifier(world, target, SLOW_BURN_DOT, { sourceId: lina.id, duration, data: { pool } });
}

const SLOW_BURN: ModifierDef = {
  id: 'lina_slow_burn', hidden: true, persistOnDeath: true, dispel: 'none',
  // 技能伤害（不含烧灼本身）命中敌方非建筑单位：减免前伤害 × ratio 加进烧灼池，剩余时间重置为满
  onDealtDamage: (_m, owner, target, world, info) => {
    if (!info.abilityId || info.abilityId === 'lina_slow_burn' || info.isAttack) return;
    if (target.team === owner.team || target.kind === 'building' || !target.alive) return;
    const ab = owner.ability('innate');
    if (!ab) return;
    const amount = (info.preMitigation ?? 0) * abilityValue(owner, ab, 'ratio');
    if (amount > 0) addBurn(world, owner, target, amount, abilityValue(owner, ab, 'duration'));
  },
};

const slowBurn: AbilityDef = {
  id: 'lina_slow_burn', name: '慢热',
  description: '莉娜的技能命中敌人后，还会在几秒内持续灼烧目标，追加一部分技能伤害作为魔法伤害。多次命中会叠加到同一团火里并重新计时。烧灼不可驱散。',
  slot: 'innate', maxLevel: 1, targetType: 'passive', values: { ratio: [0.64], duration: [4] }, passive: SLOW_BURN,
};

// ---------- 天赋 25 右：普攻对慢热中的目标暴击 ----------
const BURN_CRIT: ModifierDef = {
  id: 'lina_burn_crit', hidden: true, persistOnDeath: true, dispel: 'none',
  onAttackStart: (_m, owner, target, _world, atk) => {
    if (findModifier(target, SLOW_BURN_DOT.id, owner.id)) atk.critMult = Math.max(atk.critMult, 1.5);
  },
};

export const LINA: HeroDef = {
  id: 'lina', name: '莉娜', title: '秀逗魔导士', primary: 'int',
  str: [20, 2.4], agi: [21, 2.4], int: [28, 4.0],
  baseDamage: [21, 29], baseArmor: 0, baseHpRegen: 0.25, baseManaRegen: 0,
  attackRange: 670, bat: 1.6, baseAttackSpeed: 100, attackPoint: 0.65, projectileSpeed: 1000, moveSpeed: 290,
  roles: ['核心', '法师', '爆发'],
  abilities: [dragonSlave, lightStrikeArray, fierySoul, lagunaBlade, slowBurn],
  talents: [
    [
      { id: 'lina_t10a', name: '+25 攻击力', stats: { bonusDamage: 25 } },
      { id: 'lina_t10b', name: '−3 秒龙破斩冷却', valueBonus: { abilityId: 'lina_dragon_slave', key: 'cooldown', add: -3 } },
    ],
    [
      { id: 'lina_t15a', name: '炽魂每层 +5% 魔抗', valueBonus: { abilityId: 'lina_fiery_soul', key: 'magicResist', add: 0.05 } },
      { id: 'lina_t15b', name: '+110 光击阵伤害', valueBonus: { abilityId: 'lina_light_strike_array', key: 'damage', add: 110 } },
    ],
    [
      { id: 'lina_t20a', name: '−20 秒神灭斩冷却', valueBonus: { abilityId: 'lina_laguna_blade', key: 'cooldown', add: -20 } },
      {
        id: 'lina_t20b', name: '炽魂每层额外 +10 攻速、+1% 移速',
        valueBonus: [{ abilityId: 'lina_fiery_soul', key: 'attackSpeed', add: 10 }, { abilityId: 'lina_fiery_soul', key: 'moveSpeed', add: 0.01 }],
      },
    ],
    [
      {
        id: 'lina_t25a', name: '慢热持续 +1 秒，烧灼提高到 80%',
        valueBonus: [{ abilityId: 'lina_slow_burn', key: 'duration', add: 1 }, { abilityId: 'lina_slow_burn', key: 'ratio', add: 0.16 }],
      },
      { id: 'lina_t25b', name: '普攻对慢热中的目标造成 150% 暴击', modifier: BURN_CRIT },
    ],
  ],
};

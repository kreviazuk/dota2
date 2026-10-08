import type { AbilityDef, CastContext, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { abilityChannelTime, abilityManaCost, abilityValue } from '../systems/abilities';
import { applySlow } from '../status';
import { addShield } from '../shields';
import { enemiesInRadius } from '../query';
import { dist } from '../core/vec2';

// ---------- Q 冰霜新星 ----------
const crystalNova: AbilityDef = {
  id: 'cm_crystal_nova', name: '冰霜新星',
  description: '在指定地点引爆一团寒冰，对范围内的所有敌人造成魔法伤害，并降低他们的移动速度和攻击速度。',
  slot: 'Q', maxLevel: 4, targetType: 'point', damageType: 'magical', castPoint: 0.3,
  castRange: [700], cooldown: [11, 10, 9, 8], manaCost: [115, 135, 155, 175],
  values: {
    damage: [110, 160, 210, 260], radius: [425], moveSlow: [0.2, 0.3, 0.4, 0.5], attackSlow: [30, 45, 60, 75], duration: [4],
  },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const p = ctx.target.point;
    if (!p) return;
    const radius = ctx.v('radius');
    const damage = ctx.v('damage');
    for (const u of enemiesInRadius(world, caster.team, p, radius)) {
      applyDamage(world, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'cm_crystal_nova' });
      if (u.alive) {
        applySlow(world, u, {
          source: caster, key: 'cm_nova', duration: ctx.v('duration'), moveSlow: ctx.v('moveSlow'), attackSlow: ctx.v('attackSlow'),
        });
      }
    }
    world.events.emit({ type: 'fx', kind: 'cm_nova', pos: { x: p.x, y: p.y }, radius, unitId: caster.id });
  },
};

// ---------- W 冰封禁制 ----------
const FROSTBITE_INTERVAL = 0.25;

/** 缠绕 + 缴械（D26），每 0.25 秒结算 data.tick 点魔法伤害（施放时按目标类型算好） */
const FROSTBITE: ModifierDef = {
  id: 'cm_frostbite', name: '冰封禁制', debuff: true, keepLonger: true, states: ['rooted', 'disarmed'],
  interval: FROSTBITE_INTERVAL,
  onInterval: (m, owner, world) => {
    applyDamage(world, {
      source: world.getUnit(m.sourceId) ?? null, target: owner, amount: m.data.tick ?? 0, type: 'magical', isAttack: false,
      abilityId: 'cm_frostbite',
    });
  },
};

const frostbite: AbilityDef = {
  id: 'cm_frostbite', name: '冰封禁制',
  description: '把一名敌人冻在冰块里：期间不能移动、不能攻击（仍然可以施法），并持续受到魔法伤害。对小兵的伤害更高。',
  slot: 'W', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', damageType: 'magical', castPoint: 0.3,
  castRange: [600], cooldown: [9, 8, 7, 6], manaCost: [125, 135, 145, 155],
  values: { duration: [1.5, 2, 2.5, 3], dps: [100], creepMult: [4] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    // 非英雄、非精英的小兵 × creepMult（持续时间不变）
    const mult = t.kind === 'creep' ? ctx.v('creepMult') : 1;
    addModifier(world, t, FROSTBITE, {
      sourceId: caster.id, duration: ctx.v('duration'), data: { tick: ctx.v('dps') * FROSTBITE_INTERVAL * mult },
    });
    world.events.emit({ type: 'fx', kind: 'cm_frostbite', pos: { x: t.pos.x, y: t.pos.y }, unitId: caster.id, targetId: t.id });
  },
};

// ---------- E 奥术光环 ----------
/** 友方英雄身上的光环效果：按与水晶室女的距离给魔法恢复（D27：1200 内 × 3） */
const ARCANE_AURA_BUFF: ModifierDef = {
  id: 'cm_arcane_aura_buff', name: '奥术光环', dispel: 'none',
  stats: (m, owner, world) => {
    const src = world.getUnit(m.sourceId);
    const regen = m.data.regen ?? 0;
    if (!src) return { manaRegen: regen };
    const near = dist(src.pos, owner.pos) - owner.radius <= (m.data.nearRadius ?? 0);
    return { manaRegen: regen * (near ? m.data.nearMult ?? 1 : 1) };
  },
};

const ARCANE_AURA: ModifierDef = {
  id: 'cm_arcane_aura', hidden: true, persistOnDeath: true, dispel: 'none',
  // 自己的魔法恢复增强；被破坏时失效
  stats: (_m, owner) => {
    const ab = owner.ability('E');
    if (!ab || ab.level <= 0 || owner.hasState('breakPassives')) return {};
    return { manaRegenAmp: abilityValue(owner, ab, 'selfAmp') };
  },
  aura: {
    radius: () => Infinity, team: 'ally', includeSelf: true,
    filter: (_owner, u) => u.kind === 'hero',
    child: ARCANE_AURA_BUFF,
    childData: (owner) => {
      const ab = owner.ability('E');
      if (!ab) return { regen: 0, nearMult: 1, nearRadius: 0 };
      return {
        regen: abilityValue(owner, ab, 'regen'), nearMult: abilityValue(owner, ab, 'nearMult'),
        nearRadius: abilityValue(owner, ab, 'nearRadius'),
      };
    },
  },
};

const arcaneAura: AbilityDef = {
  id: 'cm_arcane_aura', name: '奥术光环',
  description: '全图所有友方英雄（包括水晶室女自己）获得额外的魔法恢复，在她附近的友方英雄获得三倍效果。水晶室女自己的魔法恢复还会按比例提高。',
  slot: 'E', maxLevel: 4, targetType: 'passive',
  values: { regen: [0.4, 0.6, 0.8, 1.0], nearMult: [3], nearRadius: [1200], selfAmp: [0.2, 0.4, 0.6, 0.8] },
  passive: ARCANE_AURA,
};

// ---------- R 极寒领域 ----------
/** 极寒领域范围内敌人的减速（光环子 Modifier，数值由 childData 每 tick 写入） */
const FREEZING_FIELD_SLOW: ModifierDef = {
  id: 'cm_freezing_field_slow', name: '极寒领域', debuff: true,
  stats: (m) => ({ moveSpeedPct: -(m.data.ms ?? 0), attackSpeed: -(m.data.as ?? 0) }),
};

const FREEZING_FIELD: ModifierDef = {
  id: 'cm_freezing_field', name: '极寒领域', dispel: 'none',
  aura: {
    radius: (owner) => {
      const ab = owner.ability('R');
      return ab ? abilityValue(owner, ab, 'radius') : 0;
    },
    team: 'enemy',
    child: FREEZING_FIELD_SLOW,
    childData: (owner) => {
      const ab = owner.ability('R');
      return ab ? { ms: abilityValue(owner, ab, 'moveSlow'), as: abilityValue(owner, ab, 'attackSlow') } : { ms: 0, as: 0 };
    },
  },
};

const endFreezingField = (ctx: CastContext): void => {
  const m = findModifier(ctx.caster, FREEZING_FIELD.id);
  if (m) removeModifier(ctx.world, ctx.caster, m);
};

const freezingField: AbilityDef = {
  id: 'cm_freezing_field', name: '极寒领域',
  description: '持续施法：周围的敌人被减速，四周不断随机落下冰爆，对冰爆范围内的敌人造成魔法伤害。移动或被控制会中断施法。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', damageType: 'magical',
  castPoint: 0, channelTime: [10], cooldown: [100, 95, 90], manaCost: [200, 400, 600],
  values: {
    damage: [110, 180, 250], radius: [810], minDist: [195], maxDist: [785], blastRadius: [320], interval: [0.1],
    moveSlow: [0.4], attackSlow: [80, 120, 160],
  },
  onCast: (ctx) => {
    const { world, caster, ability } = ctx;
    ability.data.ffAcc = 0;
    // 引导结束时移除；时长只是保险
    addModifier(world, caster, FREEZING_FIELD, {
      sourceId: caster.id, abilityLevel: ability.level, duration: abilityChannelTime(caster, ability) + 0.1,
    });
    world.events.emit({ type: 'fx', kind: 'cm_freezing_field', pos: { x: caster.pos.x, y: caster.pos.y }, radius: ctx.v('radius'), unitId: caster.id });
  },
  onChannelTick: (ctx, dt) => {
    const { world, caster, ability } = ctx;
    const interval = ctx.v('interval');
    ability.data.ffAcc = (ability.data.ffAcc ?? 0) + dt;
    while (ability.data.ffAcc >= interval - 1e-6) {
      ability.data.ffAcc -= interval;
      const a = world.rng.range(0, Math.PI * 2);
      const d = world.rng.range(ctx.v('minDist'), ctx.v('maxDist'));
      const p = { x: caster.pos.x + Math.cos(a) * d, y: caster.pos.y + Math.sin(a) * d };
      const radius = ctx.v('blastRadius');
      const damage = ctx.v('damage');
      for (const u of enemiesInRadius(world, caster.team, p, radius)) {
        applyDamage(world, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'cm_freezing_field' });
      }
      world.events.emit({ type: 'fx', kind: 'cm_ff_blast', pos: p, radius, unitId: caster.id });
    }
  },
  onChannelEnd: (ctx) => endFreezingField(ctx),
};

// ---------- 先天 冰川护体 ----------
const GLACIAL_GUARD_ID = 'cm_glacial_guard';

const GLACIAL_GUARD: ModifierDef = {
  id: 'cm_glacial_guard_passive', hidden: true, persistOnDeath: true, dispel: 'none',
  // 施放技能后：花掉的魔法 × ratio 变成 8 秒的物理护盾（每次独立、可以叠加）
  onAbilityCast: (_m, owner, abilityId, world) => {
    const ab = owner.abilities.find((a) => a.def.id === abilityId);
    const gg = owner.ability('innate');
    if (!ab || !gg) return;
    const cost = abilityManaCost(ab, owner);
    if (cost <= 0) return;
    addShield(world, owner, {
      id: GLACIAL_GUARD_ID, amount: cost * abilityValue(owner, gg, 'ratio'), duration: abilityValue(owner, gg, 'duration'),
      types: ['physical'], sourceId: owner.id,
    });
  },
};

const glacialGuard: AbilityDef = {
  id: 'cm_glacial_guard', name: '冰川护体',
  description: '水晶室女每施放一个技能，就把花掉的一部分魔法变成一层只吸收物理伤害的护盾，持续数秒，多层可以叠加。比例随英雄等级提高。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { ratio: [0.3], ratioPerLevel: [0.02], duration: [8] },
  passive: GLACIAL_GUARD,
  // 当前冰川护盾总量（取整）；没有时不显示
  counter: (u) => {
    let sum = 0;
    for (const m of u.modifiers) if (m.def.id === GLACIAL_GUARD_ID) sum += m.data.remaining ?? 0;
    const n = Math.round(sum);
    return n > 0 ? n : null;
  },
};

export const CRYSTAL_MAIDEN: HeroDef = {
  id: 'crystal_maiden', name: '水晶室女', title: '莉莉丝', primary: 'int',
  str: [17, 2.2], agi: [16, 1.8], int: [20, 3.3],
  baseDamage: [28, 34], baseArmor: 0, baseHpRegen: 0.25, baseManaRegen: 0,
  attackRange: 600, bat: 1.7, baseAttackSpeed: 100, attackPoint: 0.45, projectileSpeed: 900, moveSpeed: 280,
  roles: ['辅助', '控制', '法师'],
  abilities: [crystalNova, frostbite, arcaneAura, freezingField, glacialGuard],
  talents: [
    [
      { id: 'cm_t10a', name: '+200 生命', stats: { maxHp: 200 } },
      { id: 'cm_t10b', name: '+12 智力', stats: { int: 12 } },
    ],
    [
      { id: 'cm_t15a', name: '+100 冰封禁制施法距离', valueBonus: { abilityId: 'cm_frostbite', key: 'castRange', add: 100 } },
      { id: 'cm_t15b', name: '−4.5 秒冰霜新星冷却', valueBonus: { abilityId: 'cm_crystal_nova', key: 'cooldown', add: -4.5 } },
    ],
    [
      { id: 'cm_t20a', name: '冰川护体转化比例 +20%', valueBonus: { abilityId: 'cm_glacial_guard', key: 'ratio', add: 0.2 } },
      { id: 'cm_t20b', name: '+50 极寒领域伤害', valueBonus: { abilityId: 'cm_freezing_field', key: 'damage', add: 50 } },
    ],
    [
      { id: 'cm_t25a', name: '+1 秒冰封禁制持续时间', valueBonus: { abilityId: 'cm_frostbite', key: 'duration', add: 1 } },
      { id: 'cm_t25b', name: '+300 冰霜新星伤害', valueBonus: { abilityId: 'cm_crystal_nova', key: 'damage', add: 300 } },
    ],
  ],
};

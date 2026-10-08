import type { AbilityDef, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import { addModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { abilityValue } from '../systems/abilities';
import { applyCleave } from '../systems/cleave';
import { spawnProjectile } from '../systems/projectiles';
import { applyControl } from '../status';
import { alliesInRadius, enemiesInRadius } from '../query';
import { add, normalize, scale, sub } from '../core/vec2';

// ---------- Q 风暴之拳 ----------
const stormHammer: AbilityDef = {
  id: 'sven_storm_hammer', name: '风暴之拳',
  description: '向一名敌人掷出追踪的风暴之锤，命中时对目标周围的所有敌人造成魔法伤害并眩晕。目标在锤子命中前消失则没有效果。',
  slot: 'Q', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', damageType: 'magical', castPoint: 0.2,
  castRange: [600], cooldown: [21, 18, 15, 12], manaCost: [110],
  values: { damage: [80, 160, 240, 320], stun: [1, 1.25, 1.5, 1.75], radius: [250, 270, 290, 310], speed: [1000] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    // 数值在出手时确定（飞行途中升级、选天赋不影响这一锤）
    const damage = ctx.v('damage');
    const stun = ctx.v('stun');
    const radius = ctx.v('radius');
    const dir = normalize(sub(t.pos, caster.pos));
    spawnProjectile(world, {
      team: caster.team, sourceId: caster.id, pos: add(caster.pos, scale(dir, caster.radius)), speed: ctx.v('speed'),
      kind: 'homing', targetId: t.id, visual: 'sven_hammer',
      // 命中：以目标为圆心，范围内所有敌方非建筑单位受到魔法伤害并眩晕（斯温中途死亡也照常生效）
      onHit: (w, target) => {
        for (const e of enemiesInRadius(w, caster.team, target.pos, radius, { spell: true })) {
          applyDamage(w, { source: caster, target: e, amount: damage, type: 'magical', isAttack: false, abilityId: 'sven_storm_hammer' });
          if (e.alive) applyControl(w, e, 'stun', { source: caster, duration: stun });
        }
        w.events.emit({ type: 'fx', kind: 'sven_hammer_hit', pos: { x: target.pos.x, y: target.pos.y }, radius, unitId: caster.id, targetId: target.id });
      },
    });
    world.events.emit({ type: 'fx', kind: 'sven_storm_hammer', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id, targetId: t.id });
  },
};

// ---------- W 巨力挥舞 ----------
const CLEAVE: ModifierDef = {
  id: 'sven_great_cleave', hidden: true, persistOnDeath: true, dispel: 'none',
  // 普攻命中敌方非建筑单位：主目标这次攻击的护甲前伤害 × 比例，溅射到身前梯形内的其他敌人（无视护甲，D11）
  onAttackLanded: (_m, owner, target, world, info) => {
    if (target.kind === 'building' || target.team === owner.team || owner.hasState('breakPassives')) return;
    const ab = owner.ability('W');
    if (!ab || ab.level <= 0) return;
    const v = (k: string) => abilityValue(owner, ab, k);
    applyCleave(world, owner, target, (info.preMitigation ?? 0) * v('pct'), {
      startWidth: v('startWidth'), endWidth: v('endWidth'), length: v('length'),
    }, 'sven_great_cleave');
  },
};

const greatCleave: AbilityDef = {
  id: 'sven_great_cleave', name: '巨力挥舞',
  description: '斯温的普攻会横扫身前的梯形区域，按这次攻击的伤害对其中的其他敌人造成分裂伤害。分裂伤害无视护甲，不对建筑生效。',
  slot: 'W', maxLevel: 4, targetType: 'passive', damageType: 'physical',
  values: { pct: [0.6, 0.7, 0.8, 0.9], startWidth: [150], endWidth: [270, 300, 330, 360], length: [400, 500, 600, 700] },
  passive: CLEAVE,
};

// ---------- E 战吼 ----------
const WARCRY: ModifierDef = {
  id: 'sven_warcry', name: '战吼',
  stats: (m) => ({ armor: m.data.armor ?? 0, moveSpeedPct: (m.data.speed ?? 0) / 100 }),
};

const warcry: AbilityDef = {
  id: 'sven_warcry', name: '战吼',
  description: '斯温发出振奋人心的怒吼，周围的友方英雄（包括自己）获得额外护甲和移动速度。施放时不打断普攻和施法。',
  slot: 'E', maxLevel: 4, targetType: 'none', instant: true,
  cooldown: [36, 32, 28, 24], manaCost: [30, 35, 40, 45],
  values: { armor: [5, 8, 11, 14], speed: [6, 9, 12, 15], duration: [8], radius: [700] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const radius = ctx.v('radius');
    const data = { armor: ctx.v('armor'), speed: ctx.v('speed') };
    for (const ally of alliesInRadius(world, caster.team, caster.pos, radius, { heroesOnly: true })) {
      addModifier(world, ally, WARCRY, { sourceId: caster.id, duration: ctx.v('duration'), data });
    }
    world.events.emit({ type: 'fx', kind: 'sven_warcry', pos: { x: caster.pos.x, y: caster.pos.y }, radius, unitId: caster.id });
  },
};

// ---------- R 神之力量 ----------
const GODS_STRENGTH: ModifierDef = {
  id: 'sven_gods_strength', name: '神之力量', dispel: 'none',
  stats: (m) => ({ baseDamagePct: m.data.damagePct ?? 0, slowResist: m.data.slowResist ?? 0 }),
};

const godsStrength: AbilityDef = {
  id: 'sven_gods_strength', name: '神之力量',
  description: '斯温释放体内的神力，大幅提高攻击力（按基础攻击力加主属性计算）并获得减速抗性，配合巨力挥舞打出范围爆发。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', castPoint: 0.3,
  cooldown: [110, 105, 100], manaCost: [100, 125, 150],
  values: { damagePct: [1.1, 1.5, 1.9], slowResist: [0.4], duration: [30] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    addModifier(world, caster, GODS_STRENGTH, {
      sourceId: caster.id, duration: ctx.v('duration'), data: { damagePct: ctx.v('damagePct'), slowResist: ctx.v('slowResist') },
    });
    world.events.emit({ type: 'fx', kind: 'sven_gods_strength', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id });
  },
};

// ---------- 先天 神之愤怒 ----------
const WRATH: ModifierDef = {
  id: 'sven_wrath_of_god', hidden: true, persistOnDeath: true, dispel: 'none',
  // 面板算完后按最终力量加攻击力；被破坏时无效
  finalStats: (_m, owner, _world, s) => {
    if (owner.hasState('breakPassives')) return;
    const ab = owner.ability('innate');
    if (!ab) return;
    s.bonusDamage += s.str * abilityValue(owner, ab, 'perStr');
  },
};

const wrathOfGod: AbilityDef = {
  id: 'sven_wrath_of_god', name: '神之愤怒',
  description: '每点力量为斯温额外提供攻击力，每点力量提供的攻击力随英雄等级提高。被破坏时失效。',
  slot: 'innate', maxLevel: 1, targetType: 'passive', values: { perStr: [0.08], perStrPerLevel: [0.02] }, passive: WRATH,
};

export const SVEN: HeroDef = {
  id: 'sven', name: '斯温', title: '流浪剑客', primary: 'str',
  str: [24, 3.5], agi: [18, 2.2], int: [16, 1.5],
  baseDamage: [37, 39], baseArmor: 0, baseHpRegen: 0.75, baseManaRegen: 0,
  attackRange: 150, bat: 1.9, baseAttackSpeed: 110, attackPoint: 0.4, projectileSpeed: 0, moveSpeed: 325,
  roles: ['核心', '先手', '控制'],
  abilities: [stormHammer, greatCleave, warcry, godsStrength, wrathOfGod],
  talents: [
    [
      { id: 'sven_t10a', name: '+5 秒战吼持续时间', valueBonus: { abilityId: 'sven_warcry', key: 'duration', add: 5 } },
      { id: 'sven_t10b', name: '+20% 神之力量减速抗性', valueBonus: { abilityId: 'sven_gods_strength', key: 'slowResist', add: 0.2 } },
    ],
    [
      { id: 'sven_t15a', name: '−12 秒神之力量冷却', valueBonus: { abilityId: 'sven_gods_strength', key: 'cooldown', add: -12 } },
      { id: 'sven_t15b', name: '+25% 巨力挥舞伤害', valueBonus: { abilityId: 'sven_great_cleave', key: 'pct', add: 0.25 } },
    ],
    [
      {
        id: 'sven_t20a', name: '−25% 风暴之拳冷却和魔耗',
        valueBonus: [{ abilityId: 'sven_storm_hammer', key: 'cooldown', mult: 0.75 }, { abilityId: 'sven_storm_hammer', key: 'manaCost', mult: 0.75 }],
      },
      { id: 'sven_t20b', name: '+8 战吼护甲', valueBonus: { abilityId: 'sven_warcry', key: 'armor', add: 8 } },
    ],
    [
      { id: 'sven_t25a', name: '+50% 神之力量攻击力', valueBonus: { abilityId: 'sven_gods_strength', key: 'damagePct', add: 0.5 } },
      { id: 'sven_t25b', name: '+1 秒风暴之拳眩晕', valueBonus: { abilityId: 'sven_storm_hammer', key: 'stun', add: 1 } },
    ],
  ],
};

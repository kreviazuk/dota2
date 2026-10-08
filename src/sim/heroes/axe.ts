import type { AbilityDef, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import { addModifier, removeModifier } from '../modifiers';
import { applyDamage, killUnit } from '../systems/damage';
import { abilityCastRange, abilityValue, cancelCast } from '../systems/abilities';
import { alliesInRadius, enemiesInRadius, isAliveUnit, isTargetableBy, nearestOf } from '../query';
import { dot, fromAngle, normalize, sub } from '../core/vec2';

// ---------- Q 狂战士之吼 ----------
const TAUNT: ModifierDef = {
  id: 'axe_berserkers_call_taunt', name: '狂战士之吼', debuff: true, dispel: 'none', taunt: true,
  // 斧王死亡（或消失）后嘲讽立即结束，否则被嘲讽者会在剩余时间里无法操作
  onTick: (m, owner, world) => {
    if (!isAliveUnit(world.getUnit(m.sourceId))) removeModifier(world, owner, m);
  },
};
const CALL_ARMOR: ModifierDef = {
  id: 'axe_berserkers_call_armor', name: '狂战士之吼', dispel: 'none', stats: (m) => ({ armor: m.data.armor ?? 0 }),
};

const berserkersCall: AbilityDef = {
  id: 'axe_berserkers_call', name: '狂战士之吼', description: '嘲讽周围的敌人，强迫它们攻击斧王，同时斧王获得额外护甲。',
  slot: 'Q', maxLevel: 4, targetType: 'none', castPoint: 0.3,
  cooldown: [18, 16, 14, 12], manaCost: [90, 100, 110, 120],
  values: { radius: [315], duration: [2.1, 2.4, 2.7, 3.0], armor: [12, 13, 14, 15] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const radius = ctx.v('radius');
    const duration = ctx.v('duration');
    for (const e of enemiesInRadius(world, caster.team, caster.pos, radius, { spell: true })) {
      if (e.creep?.protectedUntilContact || e.hasState('hidden')) continue;
      if (!addModifier(world, e, TAUNT, { sourceId: caster.id, duration, ignoreImmunity: true })) continue;
      if (e.cast) cancelCast(world, e, true);
      // 嘲讽覆盖原有指令（包括回城、走向施法目标）
      e.order = { kind: 'idle' };
      e.attack.windup = -1;
    }
    addModifier(world, caster, CALL_ARMOR, { sourceId: caster.id, duration, data: { armor: ctx.v('armor') } });
    world.events.emit({ type: 'fx', kind: 'axe_call', pos: { ...caster.pos }, radius, unitId: caster.id });
  },
};

// ---------- W 战斗饥渴 ----------
const HUNGER: ModifierDef = {
  id: 'axe_battle_hunger', name: '战斗饥渴', debuff: true, dispel: 'weak', interval: 0.5,
  stats: (m, owner, world) => {
    const src = world.getUnit(m.sourceId);
    if (!isAliveUnit(src)) return {};
    // 背对斧王（朝向与"指向斧王的方向"夹角超过 90°）时减速
    const away = dot(fromAngle(owner.facing), normalize(sub(src.pos, owner.pos))) < 0;
    return away ? { moveSpeedPct: -(m.data.slow ?? 0) / 100 } : {};
  },
  onInterval: (m, owner, world) => {
    applyDamage(world, {
      source: world.getUnit(m.sourceId) ?? null, target: owner, amount: (m.data.dps ?? 0) * 0.5, type: 'pure',
      isAttack: false, abilityId: 'axe_battle_hunger',
    });
  },
  // 目标击杀任意单位（含反补、摧毁建筑）时结束
  onKill: (m, owner, _victim, world) => {
    removeModifier(world, owner, m);
  },
};

const battleHunger: AbilityDef = {
  id: 'axe_battle_hunger', name: '战斗饥渴', description: '激怒一个敌人，使其持续受到纯粹伤害，直到它击杀一个单位；目标背对斧王时被减速。',
  slot: 'W', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', castPoint: 0.3, damageType: 'pure',
  castRange: [600, 700, 800, 900], cooldown: [20, 15, 10, 5], manaCost: [50, 60, 70, 80],
  values: { dps: [12, 16, 20, 24], slow: [18, 22, 26, 30], duration: [12] },
  onCast: (ctx) => {
    const t = ctx.target.unit;
    if (!t) return;
    addModifier(ctx.world, t, HUNGER, { sourceId: ctx.caster.id, duration: ctx.v('duration'), data: { dps: ctx.v('dps'), slow: ctx.v('slow') } });
    ctx.world.events.emit({ type: 'fx', kind: 'axe_hunger', pos: { ...t.pos }, unitId: ctx.caster.id, targetId: t.id });
  },
};

/** 10 级天赋 A：每个生效中（斧王施放、目标存活）的战斗饥渴给斧王 +8% 移速 */
const HUNGER_SPEED_PER = 0.08;
const T10A_HUNGER_SPEED: ModifierDef = {
  id: 'axe_t10a', name: '战斗饥渴移速', hidden: true, persistOnDeath: true, dispel: 'none',
  stats: (_m, owner, world) => {
    let n = 0;
    for (const u of world.units) {
      if (!u.alive) continue;
      for (const m of u.modifiers) if (m.def.id === HUNGER.id && m.sourceId === owner.id) n++;
    }
    return n > 0 ? { moveSpeedPct: HUNGER_SPEED_PER * n } : {};
  },
};

// ---------- E 反击螺旋 ----------
const HELIX: ModifierDef = {
  id: 'axe_counter_helix', hidden: true, persistOnDeath: true, dispel: 'none',
  // 计数在死亡（即复活时）和技能升级时清零
  onDeath: (m) => {
    m.data.count = 0;
  },
  onAttacked: (m, owner, _attacker, world) => {
    if (!owner.alive || owner.hasState('breakPassives')) return;
    const ab = owner.ability('E');
    if (!ab || ab.level <= 0) return;
    if (m.data.level !== ab.level) {
      m.data.level = ab.level;
      m.data.count = 0;
    }
    m.data.count = (m.data.count ?? 0) + 1;
    if (m.data.count < abilityValue(owner, ab, 'hits') || world.time < (m.data.readyAt ?? 0)) return;
    m.data.count = 0;
    m.data.readyAt = world.time + abilityValue(owner, ab, 'cooldown');
    const radius = abilityValue(owner, ab, 'radius');
    const dmg = abilityValue(owner, ab, 'damage');
    for (const e of enemiesInRadius(world, owner.team, owner.pos, radius, { spell: true })) {
      if (e.hasState('debuffImmune')) continue;
      applyDamage(world, { source: owner, target: e, amount: dmg, type: 'pure', isAttack: false, abilityId: 'axe_counter_helix', reflected: true });
    }
    world.events.emit({ type: 'fx', kind: 'axe_helix', pos: { ...owner.pos }, radius, unitId: owner.id });
  },
};

const counterHelix: AbilityDef = {
  id: 'axe_counter_helix', name: '反击螺旋', description: '斧王每受到若干次攻击，就旋转一次，对周围所有敌人造成纯粹伤害。',
  slot: 'E', maxLevel: 4, targetType: 'passive', damageType: 'pure',
  values: { hits: [7, 6, 5, 4], damage: [100, 120, 140, 160], radius: [275], cooldown: [0.3] },
  passive: HELIX,
};

// ---------- R 淘汰之刃 ----------
const CULL_BUFF: ModifierDef = {
  id: 'axe_culling_blade_buff', name: '淘汰之刃',
  stats: (m) => ({ armor: m.data.armor ?? 0, moveSpeedPct: (m.data.speed ?? 0) / 100 }),
};
const CULL_STACKS: ModifierDef = {
  id: 'axe_culling_blade_stacks', name: '淘汰之刃（永久护甲）', persistOnDeath: true, dispel: 'none', stacking: 'stacks',
  // 每层护甲按当前大招等级计算
  stats: (m, owner) => {
    const r = owner.ability('R');
    const per = r ? abilityValue(owner, r, 'armorStack') : 1;
    return { armor: m.stacks * per };
  },
};

const cullingBlade: AbilityDef = {
  id: 'axe_culling_blade', name: '淘汰之刃', description: '对一个敌人造成纯粹伤害；如果目标生命低于斩杀线则直接斩杀。斩杀英雄后冷却重置，周围友军加速加甲，斧王获得永久护甲。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'unit', targetTeam: 'enemy',
  ignoresDebuffImmune: true, damageType: 'pure', castRange: [175], castPoint: 0.3,
  cooldown: [80, 75, 70], manaCost: [100, 125, 150],
  values: { damage: [275, 375, 475], speed: [20, 25, 30], armor: [10, 15, 20], armorStack: [1, 1.5, 2], buffDuration: [6], buffRadius: [900] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t || !t.alive) return;
    const threshold = ctx.v('damage');
    const killed = t.hp <= threshold;
    if (killed) {
      world.events.emit({ type: 'damage', sourceId: caster.id, targetId: t.id, amount: t.hp, damageType: 'pure', crit: true, isAttack: false });
      killUnit(world, t, caster);
    } else {
      applyDamage(world, { source: caster, target: t, amount: threshold, type: 'pure', isAttack: false, abilityId: 'axe_culling_blade', ignoreImmunity: true });
    }
    world.events.emit({ type: 'fx', kind: killed ? 'axe_cull_kill' : 'axe_cull', pos: { ...t.pos }, unitId: caster.id, targetId: t.id });
    if (killed && t.kind === 'hero') {
      ctx.ability.cooldown = 0;
      for (const ally of alliesInRadius(world, caster.team, caster.pos, ctx.v('buffRadius'), { heroesOnly: true })) {
        addModifier(world, ally, CULL_BUFF, { sourceId: caster.id, duration: ctx.v('buffDuration'), data: { speed: ctx.v('speed'), armor: ctx.v('armor') } });
      }
      addModifier(world, caster, CULL_STACKS, { sourceId: caster.id });
    }
  },
  // 智能施法：优先选能斩杀的英雄（血量最低），否则最近的英雄
  smartTarget: (world, caster, ab) => {
    const threshold = abilityValue(caster, ab, 'damage');
    const cands = enemiesInRadius(world, caster.team, caster.pos, abilityCastRange(caster, ab) + 300).filter((u) =>
      isTargetableBy(caster, u, 'enemy', true),
    );
    const heroes = cands.filter((u) => u.kind === 'hero');
    const killable = heroes.filter((u) => u.hp <= threshold);
    if (killable.length) return { unit: killable.reduce((a, b) => (b.hp < a.hp ? b : a)) };
    const t = nearestOf(caster.pos, heroes);
    return t ? { unit: t } : null;
  },
};

// ---------- 先天 一人之军 ----------
const ONE_MAN_ARMY: ModifierDef = {
  id: 'axe_one_man_army', hidden: true, persistOnDeath: true, dispel: 'none',
  // data.factor：加成比例。附近没有友方英雄时立即为 1；有友方英雄时在 fadeTime 秒内线性降到 0
  onTick: (m, owner, world, dt) => {
    const ab = owner.ability('innate');
    if (!ab) return;
    const allies = alliesInRadius(world, owner.team, owner.pos, abilityValue(owner, ab, 'radius'), { heroesOnly: true, excludeId: owner.id });
    const fade = abilityValue(owner, ab, 'fadeTime');
    m.data.factor = allies.length === 0 ? 1 : fade > 0 ? Math.max(0, (m.data.factor ?? 1) - dt / fade) : 0;
  },
  lateStats: (m, owner, _world, s) => {
    if (owner.hasState('breakPassives')) return {};
    const ab = owner.ability('innate');
    if (!ab) return {};
    const factor = m.data.factor ?? 1;
    return factor > 0 ? { str: Math.max(0, s.armor) * abilityValue(owner, ab, 'ratio') * factor } : {};
  },
};

const oneManArmy: AbilityDef = {
  id: 'axe_one_man_army', name: '一人之军', description: '附近没有友方英雄时，获得相当于当前护甲 50% 的额外力量；友方英雄靠近后加成在 3 秒内逐渐消失。',
  slot: 'innate', maxLevel: 1, targetType: 'passive', values: { radius: [350], ratio: [0.5], fadeTime: [3] }, passive: ONE_MAN_ARMY,
};

export const AXE: HeroDef = {
  id: 'axe', name: '斧王', title: '蒙哥·卡恩', primary: 'str',
  str: [25, 2.7], agi: [18, 1.7], int: [18, 1.6],
  baseDamage: [31, 35], baseArmor: 0, baseHpRegen: 2, baseManaRegen: 0,
  attackRange: 150, bat: 1.7, baseAttackSpeed: 100, attackPoint: 0.4, projectileSpeed: 0, moveSpeed: 315,
  roles: ['先手', '坦克', '控制'],
  abilities: [berserkersCall, battleHunger, counterHelix, cullingBlade, oneManArmy],
  talents: [
    [
      { id: 'axe_t10a', name: '每个生效中的战斗饥渴 +8% 移速', modifier: T10A_HUNGER_SPEED },
      { id: 'axe_t10b', name: '+3 秒淘汰之刃增益持续时间', valueBonus: { abilityId: 'axe_culling_blade', key: 'buffDuration', add: 3 } },
    ],
    [
      { id: 'axe_t15a', name: '+10 狂战士之吼护甲', valueBonus: { abilityId: 'axe_berserkers_call', key: 'armor', add: 10 } },
      { id: 'axe_t15b', name: '+8 战斗饥渴每秒伤害', valueBonus: { abilityId: 'axe_battle_hunger', key: 'dps', add: 8 } },
    ],
    [
      { id: 'axe_t20a', name: '+40 反击螺旋伤害', valueBonus: { abilityId: 'axe_counter_helix', key: 'damage', add: 40 } },
      { id: 'axe_t20b', name: '+15 力量', stats: { str: 15 } },
    ],
    [
      { id: 'axe_t25a', name: '+150 淘汰之刃伤害', valueBonus: { abilityId: 'axe_culling_blade', key: 'damage', add: 150 } },
      { id: 'axe_t25b', name: '+85 狂战士之吼范围', valueBonus: { abilityId: 'axe_berserkers_call', key: 'radius', add: 85 } },
    ],
  ],
};

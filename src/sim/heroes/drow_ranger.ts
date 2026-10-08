import type { AbilityDef, AbilityInstance, CastContext, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import type { Vec2 } from '../core/vec2';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { abilityChannelTime, abilityValue } from '../systems/abilities';
import { rollAttackDamage } from '../systems/attack';
import { spawnProjectile } from '../systems/projectiles';
import { knockback } from '../systems/motion';
import { applyControl, applySlow } from '../status';
import { prdRoll } from '../prd';
import { isHiddenFrom, unitsInRadius } from '../query';
import { dist, fromAngle, normalize, rotate, sub } from '../core/vec2';

// ---------- Q 霜冻之箭 ----------
/** 霜冻减速（普攻和数箭齐发共用）：读卓尔当前的霜冻之箭数值 */
function applyFrostSlow(world: World, drow: Unit, target: Unit, q: AbilityInstance): void {
  if (!target.alive) return;
  applySlow(world, target, {
    source: drow, key: 'drow_frost', moveSlow: abilityValue(drow, q, 'slow'), duration: abilityValue(drow, q, 'duration'),
  });
}

const FROST_ARROWS: ModifierDef = {
  id: 'drow_frost_arrows', hidden: true, persistOnDeath: true, dispel: 'none',
  // 出手时：开关开着、打的是敌方非建筑单位、魔法够 → 扣魔法，这一箭变成霜冻之箭（魔法不足时自动变回普通箭，开关仍开着）
  onAttackStart: (_m, owner, target, _world, atk) => {
    const q = owner.ability('Q');
    if (!q || q.level <= 0 || !q.toggled) return;
    if (target.kind === 'building' || target.team === owner.team) return;
    const cost = abilityValue(owner, q, 'manaPerArrow');
    if (owner.mana + 1e-6 < cost) return;
    owner.mana -= cost;
    atk.bonusDamage += abilityValue(owner, q, 'damage');
    atk.flags.frost = 1;
    atk.visual = 'drow_frost_arrow';
  },
  onAttackLanded: (_m, owner, target, world, info) => {
    const q = owner.ability('Q');
    if (!q || !info.attack?.flags.frost) return;
    applyFrostSlow(world, owner, target, q);
  },
};

const frostArrows: AbilityDef = {
  id: 'drow_frost_arrows', name: '霜冻之箭',
  description: '开关技能（学会时自动开启）：开启时卓尔的每一箭消耗少量魔法，造成额外伤害并降低目标的移动速度。魔法不够时自动射出普通箭，打建筑时不消耗。',
  slot: 'Q', maxLevel: 4, targetType: 'toggle', damageType: 'physical', defaultToggled: true,
  values: { damage: [12, 18, 24, 30], slow: [0.15, 0.25, 0.35, 0.45], duration: [1.5], manaPerArrow: [9, 10, 11, 12] },
  passive: FROST_ARROWS,
};

// ---------- W 狂风 ----------
const GUST_SPEED: ModifierDef = {
  id: 'drow_gust_speed', name: '狂风',
  stats: (m) => ({ moveSpeedPct: m.data.pct ?? 0 }),
};

const gust: AbilityDef = {
  id: 'drow_gust', name: '狂风',
  description: '向指定方向释放一道冲击波，沿途的敌人被沉默，并被向外推开——离卓尔越近推得越远、越久。被推开的敌人会中断持续施法。',
  slot: 'W', maxLevel: 4, targetType: 'direction', castPoint: 0.25,
  castRange: [900], cooldown: [19, 17, 15, 13], manaCost: [55],
  values: {
    distance: [900], width: [250], speed: [2000], silence: [3, 4, 5, 6], knockback: [450], knockDuration: [0.6, 0.7, 0.8, 0.9],
    minKnockDuration: [0.4], selfSpeed: [0], selfSpeedDuration: [3],
  },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const dir = ctx.target.dir;
    if (!dir) return;
    // 数值在施放时确定
    const distance = ctx.v('distance');
    const silence = ctx.v('silence');
    const push = ctx.v('knockback');
    const knockDur = ctx.v('knockDuration');
    const minDur = ctx.v('minKnockDuration');
    const selfSpeed = ctx.v('selfSpeed');
    const selfDur = ctx.v('selfSpeedDuration');
    let first = true;
    spawnProjectile(world, {
      team: caster.team, sourceId: caster.id, pos: { x: caster.pos.x, y: caster.pos.y }, speed: ctx.v('speed'),
      kind: 'linear', dir, maxDistance: distance, width: ctx.v('width') / 2, pierce: true, visual: 'drow_gust',
      // 敌方非建筑、非减益免疫单位（建筑和无敌单位弹道系统已经排除）
      hitFilter: (_w, u) => u.team !== caster.team && !u.hasState('debuffImmune'),
      onHit: (w, target, p) => {
        applyControl(w, target, 'silence', { source: caster, duration: silence });
        // D20：方向 = 卓尔 → 目标；距离 450 × (1 − d/900)，时长 max(0.4, 级别时长 × (1 − d/900))
        const d = dist(caster.pos, target.pos);
        const k = Math.max(0, 1 - d / distance);
        const away = normalize(sub(target.pos, caster.pos));
        const kdir = away.x || away.y ? away : p.dir ?? dir;
        if (push * k > 1 && target.alive) knockback(w, target, caster, kdir, push * k, Math.max(minDur, knockDur * k));
        if (first && selfSpeed > 0 && caster.alive) {
          addModifier(w, caster, GUST_SPEED, { sourceId: caster.id, duration: selfDur, data: { pct: selfSpeed } });
        }
        first = false;
      },
    });
    world.events.emit({ type: 'fx', kind: 'drow_gust', pos: { x: caster.pos.x, y: caster.pos.y }, dir: { x: dir.x, y: dir.y }, unitId: caster.id });
  },
};

// ---------- E 数箭齐发 ----------
/** 引导期间自己的减速（引导结束时移除；时长只是保险） */
const MULTISHOT_SLOW: ModifierDef = {
  id: 'drow_multishot_slow', name: '数箭齐发', dispel: 'none',
  stats: (m) => ({ moveSpeedPct: -(m.data.slow ?? 0) }),
};

/** 射程 = 当前攻击距离 + rangeBonus */
const multishotRange = (caster: Unit, ab: AbilityInstance): number => caster.stats.attackRange + abilityValue(caster, ab, 'rangeBonus');

/** 发一波：arrows 支箭在 cone 度内均匀分布，直线、不穿透；同一波里一个单位最多被 1 支箭命中（D19） */
function fireWave(world: World, caster: Unit, ab: AbilityInstance, dir: Vec2): void {
  const v = (k: string) => abilityValue(caster, ab, k);
  const n = Math.max(1, Math.round(v('arrows')));
  const cone = (v('cone') * Math.PI) / 180;
  const range = multishotRange(caster, ab);
  const pct = v('damagePct');
  const q = caster.ability('Q');
  const frost = q && q.level > 0 ? q : null;
  const frostDamage = frost ? abilityValue(caster, frost, 'damage') : 0;
  const hit = new Set<number>();
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : cone * (i / (n - 1) - 0.5);
    const d = rotate(dir, a);
    spawnProjectile(world, {
      team: caster.team, sourceId: caster.id, pos: { x: caster.pos.x, y: caster.pos.y }, speed: v('speed'),
      kind: 'linear', dir: d, maxDistance: range, width: v('width') / 2, pierce: false, visual: 'drow_multishot',
      hitFilter: (_w, u) => u.team !== caster.team && !hit.has(u.id),
      onHit: (w, target) => {
        hit.add(target.id);
        // 伤害 = 一次攻击力随机值 × 比例 + 霜冻之箭伤害（学了就算，不耗蓝）；物理技能伤害，不受技能增强
        const amount = rollAttackDamage(w, caster) * pct + frostDamage;
        applyDamage(w, { source: caster, target, amount, type: 'physical', isAttack: false, abilityId: 'drow_multishot', noSpellAmp: true });
        if (frost) applyFrostSlow(w, caster, target, frost);
      },
    });
  }
}

const endMultishot = (ctx: CastContext): void => {
  const m = findModifier(ctx.caster, MULTISHOT_SLOW.id);
  if (m) removeModifier(ctx.world, ctx.caster, m);
};

const multishot: AbilityDef = {
  id: 'drow_multishot', name: '数箭齐发',
  description: '持续施法：朝指定方向的扇形区域连续射出几波箭，每支箭按卓尔的攻击力造成物理伤害，学了霜冻之箭时附带霜冻减速。同一波箭对一个敌人只造成一次伤害。施法期间可以减速移动，射击方向不变。',
  slot: 'E', maxLevel: 4, targetType: 'direction', damageType: 'physical', castPoint: 0,
  channelTime: [1.75], channelAllowsMove: true, cooldown: [24, 21, 18, 15], manaCost: [70, 85, 100, 115],
  values: {
    damagePct: [0.8, 1.0, 1.2, 1.4], waves: [3], arrows: [4], cone: [50], rangeBonus: [475], width: [90], speed: [1300], selfSlow: [0.35],
  },
  // 瞄准指示器：长度 = 攻击距离 + 475，宽度 = 锥形末端的宽度
  aimShape: (caster, ab) => {
    const length = multishotRange(caster, ab);
    const half = (abilityValue(caster, ab, 'cone') * Math.PI) / 360;
    return { length, width: 2 * length * Math.tan(half) };
  },
  onCast: (ctx) => {
    const { world, caster, ability } = ctx;
    const dir = normalize(ctx.target.dir ?? fromAngle(caster.facing));
    ability.data.dirX = dir.x;
    ability.data.dirY = dir.y;
    ability.data.wavesFired = 1;
    addModifier(world, caster, MULTISHOT_SLOW, {
      sourceId: caster.id, duration: abilityChannelTime(caster, ability) + 0.1, data: { slow: ctx.v('selfSlow') },
    });
    fireWave(world, caster, ability, dir);
    world.events.emit({ type: 'fx', kind: 'drow_multishot', pos: { x: caster.pos.x, y: caster.pos.y }, dir: { x: dir.x, y: dir.y }, unitId: caster.id });
  },
  // 第 i 波（i 从 0 开始）在已引导时间 ≥ i × 引导时间 / waves 时发出
  onChannelTick: (ctx) => {
    const { world, caster, ability } = ctx;
    const c = caster.cast;
    if (!c || c.ability !== ability) return;
    const waves = Math.max(1, Math.round(ctx.v('waves')));
    const elapsed = c.channelTotal - c.timer;
    const dir = { x: ability.data.dirX ?? 0, y: ability.data.dirY ?? -1 };
    while ((ability.data.wavesFired ?? 0) < waves && elapsed + 1e-6 >= (ability.data.wavesFired ?? 0) * (c.channelTotal / waves)) {
      ability.data.wavesFired = (ability.data.wavesFired ?? 0) + 1;
      fireWave(world, caster, ability, dir);
    }
  },
  onChannelEnd: (ctx) => endMultishot(ctx),
};

// ---------- R 射手天赋 ----------
const MARKSMANSHIP: ModifierDef = {
  id: 'drow_marksmanship', hidden: true, persistOnDeath: true, dispel: 'none',
  // 150 内有可见的敌方英雄时失效（设计文档 §6.3 把 300 改成 150）
  onTick: (m, owner, world) => {
    const r = owner.ability('R');
    const radius = r ? abilityValue(owner, r, 'disableRadius') : 0;
    const near = unitsInRadius(world, owner.pos, radius, (u) => u.kind === 'hero' && u.team !== owner.team && !isHiddenFrom(u, owner.team));
    m.data.off = near.length > 0 ? 1 : 0;
  },
  onAttackStart: (m, owner, target, world, atk) => {
    if (m.data.off || owner.hasState('breakPassives')) return;
    if (target.kind === 'building' || target.team === owner.team) return;
    const r = owner.ability('R');
    if (!r || r.level <= 0) return;
    if (!prdRoll(world, m.data, 'prd', abilityValue(owner, r, 'chance'))) return;
    atk.ignoreBaseArmor = true;
    atk.trueStrike = true;
    atk.bonusDamage += abilityValue(owner, r, 'damage');
    atk.visual = 'drow_marksman_arrow';
  },
};

const marksmanship: AbilityDef = {
  id: 'drow_marksmanship', name: '射手天赋',
  description: '卓尔的普攻有一定几率射出必定命中的穿甲箭：无视目标的基础护甲（装备和技能加的护甲仍然有效），并造成额外伤害。附近有敌方英雄贴身时失效（技能图标变灰），被破坏时也失效。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'passive', damageType: 'physical',
  values: { chance: [0.3, 0.35, 0.4], damage: [50, 70, 90], disableRadius: [150] },
  passive: MARKSMANSHIP,
  inactive: (u) => !!findModifier(u, MARKSMANSHIP.id)?.data.off || u.hasState('breakPassives'),
};

// ---------- 先天 精准光环 ----------
const AURA_ID = 'drow_precision_aura';

/** 友方远程英雄身上的光环效果：来源卓尔这一轮的敏捷加成 × allyShare */
const PRECISION_AURA_BUFF: ModifierDef = {
  id: 'drow_precision_aura_buff', name: '精准光环', dispel: 'none',
  stats: (m, _owner, world) => {
    const src = world.getUnit(m.sourceId);
    const aura = src ? findModifier(src, AURA_ID) : undefined;
    const inn = src?.ability('innate');
    if (!src || !aura || !inn) return {};
    return { agi: (aura.data.bonus ?? 0) * abilityValue(src, inn, 'allyShare') };
  },
};

const PRECISION_AURA: ModifierDef = {
  id: AURA_ID, hidden: true, persistOnDeath: true, dispel: 'none',
  // 自身：本光环之前的敏捷 × (10% + 1% × 英雄等级)，同时记下来给友方用（D28）；被破坏时无效
  lateStats: (m, owner, _world, s) => {
    const inn = owner.ability('innate');
    if (!inn || owner.hasState('breakPassives')) {
      m.data.bonus = 0;
      return {};
    }
    const bonus = s.agi * abilityValue(owner, inn, 'pct');
    m.data.bonus = bonus;
    return { agi: bonus };
  },
  aura: {
    radius: (owner) => {
      const inn = owner.ability('innate');
      return inn ? abilityValue(owner, inn, 'radius') : 0;
    },
    team: 'ally',
    // 远程 = 普攻有弹道（与选人界面的"远程 / 近战"标签一致，宙斯 380 也算远程）；只给英雄，不含卓尔自己
    filter: (_owner, u) => u.kind === 'hero' && !u.isMelee,
    child: PRECISION_AURA_BUFF,
  },
};

const precisionAura: AbilityDef = {
  id: 'drow_precision_aura', name: '精准光环',
  description: '卓尔获得一部分自身敏捷作为额外敏捷，比例随英雄等级提高；附近的友方远程英雄获得这份加成的一半。被破坏时失效。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { pct: [0.1], pctPerLevel: [0.01], allyShare: [0.5], radius: [1200] },
  passive: PRECISION_AURA,
};

export const DROW_RANGER: HeroDef = {
  id: 'drow_ranger', name: '卓尔游侠', title: '崔希丝', primary: 'agi',
  str: [16, 1.9], agi: [24, 2.8], int: [15, 1.4],
  baseDamage: [27, 34], baseArmor: 0, baseHpRegen: 0.25, baseManaRegen: 0,
  attackRange: 625, bat: 1.7, baseAttackSpeed: 100, attackPoint: 0.5, projectileSpeed: 1250, moveSpeed: 310,
  roles: ['核心', '远程', '减速'],
  abilities: [frostArrows, gust, multishot, marksmanship, precisionAura],
  talents: [
    [
      { id: 'drow_t10a', name: '−18% 霜冻之箭魔耗', valueBonus: { abilityId: 'drow_frost_arrows', key: 'manaPerArrow', mult: 0.82 } },
      { id: 'drow_t10b', name: '数箭齐发每波 +1 支箭', valueBonus: { abilityId: 'drow_multishot', key: 'arrows', add: 1 } },
    ],
    [
      { id: 'drow_t15a', name: '+75 攻击距离', stats: { attackRange: 75 } },
      { id: 'drow_t15b', name: '−6 秒数箭齐发冷却', valueBonus: { abilityId: 'drow_multishot', key: 'cooldown', add: -6 } },
    ],
    [
      { id: 'drow_t20a', name: '狂风命中后自身 +50% 移速', valueBonus: { abilityId: 'drow_gust', key: 'selfSpeed', add: 0.5 } },
      { id: 'drow_t20b', name: '+25% 数箭齐发伤害', valueBonus: { abilityId: 'drow_multishot', key: 'damagePct', add: 0.25 } },
    ],
    [
      { id: 'drow_t25a', name: '+8% 射手天赋几率', valueBonus: { abilityId: 'drow_marksmanship', key: 'chance', add: 0.08 } },
      { id: 'drow_t25b', name: '数箭齐发 +2 波', valueBonus: { abilityId: 'drow_multishot', key: 'waves', add: 2 } },
    ],
  ],
};

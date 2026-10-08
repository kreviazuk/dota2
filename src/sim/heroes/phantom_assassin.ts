import type { AbilityDef, HeroDef } from './types';
import type { ModifierDef, ModifierInstance } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { abilityCastRange, abilityValue } from '../systems/abilities';
import { performAttack } from '../systems/attack';
import { spawnProjectile, disjointProjectiles } from '../systems/projectiles';
import { blinkTo } from '../systems/motion';
import { applySlow } from '../status';
import { prdRoll } from '../prd';
import { edgeDist, enemiesInRadius, isTargetableBy, nearestOf, unitsInRadius } from '../query';
import { add, dist, fromAngle, normalize, scale, sub } from '../core/vec2';

// ---------- Q 窒碍短匕 ----------
/** 飞刀命中：一次立即结算、必定命中的攻击（攻击力 × 比例 + 基础伤害，触发攻击特效），然后减速 */
function throwDagger(world: World, pa: Unit, target: Unit, o: { pct: number; base: number; slow: number; slowDuration: number; speed: number }): void {
  const dir = normalize(sub(target.pos, pa.pos));
  spawnProjectile(world, {
    team: pa.team, sourceId: pa.id, pos: add(pa.pos, scale(dir, pa.radius)), speed: o.speed,
    kind: 'homing', targetId: target.id, visual: 'pa_dagger',
    onHit: (w, t) => {
      // 幻刺在飞刀途中死亡就没有攻击可言了
      if (!pa.alive) return;
      performAttack(w, pa, t, { instant: true, damageMult: o.pct, bonusDamage: o.base, abilityId: 'pa_stifling_dagger', trueStrike: true });
      if (t.alive && !t.hasState('invulnerable')) applySlow(w, t, { source: pa, key: 'pa_dagger', moveSlow: o.slow, duration: o.slowDuration });
    },
  });
}

const stiflingDagger: AbilityDef = {
  id: 'pa_stifling_dagger', name: '窒碍短匕',
  description: '向一名敌人掷出追踪的短匕，命中时按幻影刺客攻击力的一部分加上固定伤害打出一次必定命中的攻击（会触发恩赐解脱等攻击效果），并大幅降低目标的移动速度。不会结束魅影无形，也可以用来远程补刀。',
  slot: 'Q', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', damageType: 'physical', castPoint: 0.3,
  castRange: [700, 850, 1000, 1150], cooldown: [6], manaCost: [30],
  values: {
    baseDamage: [65, 70, 75, 80], attackPct: [0.3, 0.45, 0.6, 0.75], slow: [0.5], slowDuration: [2.1, 2.4, 2.7, 3.0], speed: [1200],
    extraTargets: [0],
  },
  onCast: (ctx) => {
    const { world, caster, ability } = ctx;
    const main = ctx.target.unit;
    if (!main) return;
    // 数值在出手时确定
    const o = { pct: ctx.v('attackPct'), base: ctx.v('baseDamage'), slow: ctx.v('slow'), slowDuration: ctx.v('slowDuration'), speed: ctx.v('speed') };
    const targets = [main];
    // 25 级天赋：施法距离内另外 extraTargets 个最近的敌方单位（英雄优先）
    const extra = Math.max(0, Math.round(ctx.v('extraTargets')));
    if (extra > 0) {
      const range = abilityCastRange(caster, ability);
      const pool = enemiesInRadius(world, caster.team, caster.pos, range + caster.radius)
        .filter((u) => u.id !== main.id && edgeDist(caster, u) <= range && isTargetableBy(caster, u, 'enemy', false))
        .sort((a, b) => (a.kind === 'hero' ? 0 : 1) - (b.kind === 'hero' ? 0 : 1) || dist(caster.pos, a.pos) - dist(caster.pos, b.pos));
      targets.push(...pool.slice(0, extra));
    }
    for (const t of targets) throwDagger(world, caster, t, o);
    world.events.emit({ type: 'fx', kind: 'pa_stifling_dagger', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id, targetId: main.id });
  },
};

// ---------- W 幻影突袭 ----------
const PHANTOM_STRIKE: ModifierDef = {
  id: 'pa_phantom_strike', name: '幻影突袭',
  stats: (m) => ({ attackSpeed: m.data.as ?? 0 }),
};

const phantomStrike: AbilityDef = {
  id: 'pa_phantom_strike', name: '幻影突袭',
  description: '瞬间闪到一个单位身边（敌我都可以）。目标是敌人时，幻影刺客短时间内大幅提高攻击速度并立即开始攻击它；对友方单位使用可以用来逃跑。有两层充能，按顺序逐层恢复。',
  slot: 'W', maxLevel: 4, targetType: 'unit', targetTeam: 'any', castPoint: 0.25,
  castRange: [650, 750, 850, 950], charges: 2, chargeMode: 'sequential', cooldown: [21, 18, 15, 12], manaCost: [35, 40, 45, 50],
  values: { attackSpeed: [80, 120, 160, 200], duration: [3] },
  // 智能施法：施法距离 + 300 内最近的敌方英雄，其次最近的敌方单位
  smartTarget: (world, caster, ab) => {
    const search = abilityCastRange(caster, ab) + 300;
    const pool = enemiesInRadius(world, caster.team, caster.pos, search).filter((u) => isTargetableBy(caster, u, 'enemy', false));
    const heroes = pool.filter((u) => u.kind === 'hero');
    const t = nearestOf(caster.pos, heroes.length ? heroes : pool);
    return t ? { unit: t } : null;
  },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    const from = { x: caster.pos.x, y: caster.pos.y };
    // D18：落在目标靠近幻刺的一侧，贴身（两者半径 + 8）
    const back = normalize(sub(caster.pos, t.pos));
    const side = back.x || back.y ? back : fromAngle(caster.facing + Math.PI);
    blinkTo(world, caster, add(t.pos, scale(side, caster.radius + t.radius + 8)));
    const d = sub(t.pos, caster.pos);
    if (d.x || d.y) caster.facing = Math.atan2(d.y, d.x);
    if (t.team !== caster.team) {
      addModifier(world, caster, PHANTOM_STRIKE, { sourceId: caster.id, duration: ctx.v('duration'), data: { as: ctx.v('attackSpeed') } });
      caster.order = { kind: 'attack', targetId: t.id, persistent: true };
    }
    world.events.emit({ type: 'fx', kind: 'pa_phantom_strike', pos: from, unitId: caster.id, targetId: t.id });
  },
};

// ---------- E 飘忽不定 ----------
const IMMATERIAL: ModifierDef = {
  id: 'pa_immaterial', hidden: true, persistOnDeath: true, dispel: 'none',
  // 被破坏时没有闪避
  stats: (_m, owner) => {
    const e = owner.ability('E');
    if (!e || e.level <= 0 || owner.hasState('breakPassives')) return {};
    return { evasion: abilityValue(owner, e, 'evasion') };
  },
};

const immaterial: AbilityDef = {
  id: 'pa_immaterial', name: '飘忽不定',
  description: '幻影刺客的身形飘忽，敌人的普攻有一定几率落空（闪避）。被破坏时失效。',
  slot: 'E', maxLevel: 4, targetType: 'passive',
  values: { evasion: [0.25, 0.35, 0.45, 0.55] },
  passive: IMMATERIAL,
};

// ---------- R 恩赐解脱 ----------
const DEADLY_FOCUS: ModifierDef = { id: 'pa_deadly_focus', name: '致命专注' };

/** 恩赐解脱只对敌方非建筑单位生效，被破坏时失效 */
const coupApplies = (owner: Unit, target: Unit): boolean =>
  target.kind !== 'building' && target.team !== owner.team && !owner.hasState('breakPassives');

const COUP_DE_GRACE: ModifierDef = {
  id: 'pa_coup_de_grace', hidden: true, persistOnDeath: true, dispel: 'none',
  // 出手时身上有致命专注：这一下必定暴击，并消耗掉专注
  onAttackStart: (_m, owner, target, world, atk) => {
    const r = owner.ability('R');
    if (!r || r.level <= 0 || !coupApplies(owner, target)) return;
    const focus = findModifier(owner, DEADLY_FOCUS.id);
    if (!focus) return;
    atk.critMult = Math.max(atk.critMult, abilityValue(owner, r, 'crit'));
    atk.flags.coup = 1;
    removeModifier(world, owner, focus);
  },
  // 命中后（不是专注暴击的那一下）按伪随机判定是否获得致命专注：普攻 17%，短匕 34%
  onAttackLanded: (m, owner, target, world, info) => {
    const atk = info.attack;
    if (atk?.flags.coup) {
      world.events.emit({ type: 'fx', kind: 'pa_crit', pos: { x: target.pos.x, y: target.pos.y }, unitId: owner.id, targetId: target.id });
      return;
    }
    const r = owner.ability('R');
    if (!r || r.level <= 0 || !coupApplies(owner, target)) return;
    const dagger = atk?.abilityId === 'pa_stifling_dagger';
    const p = abilityValue(owner, r, dagger ? 'daggerChance' : 'chance');
    if (!prdRoll(world, m.data, dagger ? 'prdDagger' : 'prd', p)) return;
    addModifier(world, owner, DEADLY_FOCUS, { sourceId: owner.id, duration: abilityValue(owner, r, 'focusDuration') });
  },
};

const coupDeGrace: AbilityDef = {
  id: 'pa_coup_de_grace', name: '恩赐解脱',
  description: '幻影刺客的每次攻击都有几率获得"致命专注"（窒碍短匕命中时几率翻倍），带着致命专注的下一次攻击必定造成巨额暴击。致命专注会在一段时间后消失。不对建筑生效，被破坏时失效。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'passive', damageType: 'physical',
  values: { chance: [0.17], daggerChance: [0.34], crit: [2.0, 3.25, 4.5], focusDuration: [6, 8, 10] },
  passive: COUP_DE_GRACE,
};

// ---------- X1 魅影无形（先天主动） ----------
/** 模糊中、附近没有敌方英雄和防御塔时的隐藏状态（D6） */
const BLUR_HIDDEN: ModifierDef = { id: 'pa_blur_hidden', hidden: true, dispel: 'none', states: ['hidden'] };

const removeChild = (world: World, owner: Unit): void => {
  const h = findModifier(owner, BLUR_HIDDEN.id);
  if (h) removeModifier(world, owner, h);
};

/** 500 内有存活的敌方英雄（含看不见的），或敌方防御塔中心在 500 + 塔半径内 */
function blurRevealed(world: World, owner: Unit, radius: number): boolean {
  const near = unitsInRadius(world, owner.pos, radius, (u) =>
    u.team !== owner.team && (u.kind === 'hero' || (u.kind === 'building' && u.building?.type === 'tower')));
  return near.some((u) => u.kind === 'hero' || dist(u.pos, owner.pos) <= radius + u.radius);
}

const BLUR: ModifierDef = {
  id: 'pa_blur', name: '魅影无形', dispel: 'none',
  stats: (m) => ({ moveSpeedPct: m.data.ms ?? 0 }),
  onTick: (m: ModifierInstance, owner, world, dt) => {
    m.data.t = (m.data.t ?? 0) + dt;
    const hide = m.data.t + 1e-6 >= (m.data.delay ?? 0) && !blurRevealed(world, owner, m.data.radius ?? 0);
    const cur = findModifier(owner, BLUR_HIDDEN.id);
    if (hide && !cur) addModifier(world, owner, BLUR_HIDDEN, { sourceId: owner.id });
    else if (!hide && cur) removeModifier(world, owner, cur);
  },
  // 自己发起的普攻结束模糊（窒碍短匕这类技能发起的攻击不算）
  onAttackStart: (m, owner, _target, world, atk) => {
    if (!atk.abilityId) removeModifier(world, owner, m);
  },
  onRemove: (_m, owner, world) => removeChild(world, owner),
};

const blur: AbilityDef = {
  id: 'pa_blur', name: '魅影无形',
  description: '先天技能，从 1 级起就可以施放：躲开所有正飞向自己的弹道，并获得额外移动速度。片刻之后，只要附近没有敌方英雄和敌方防御塔，敌人就看不见、也选不中幻影刺客。发起普攻会结束魅影无形，掷出窒碍短匕不会。敌人无法驱散。',
  slot: 'X1', innate: true, maxLevel: 1, targetType: 'none', castPoint: 0.3, cooldown: [45], manaCost: [50],
  values: { duration: [30], delay: [0.8], revealRadius: [500], moveSpeed: [0.095], moveSpeedPerLevel: [0.005] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    disjointProjectiles(world, caster);
    addModifier(world, caster, BLUR, {
      sourceId: caster.id, duration: ctx.v('duration'),
      data: { t: 0, delay: ctx.v('delay'), radius: ctx.v('revealRadius'), ms: ctx.v('moveSpeed') },
    });
    world.events.emit({ type: 'fx', kind: 'pa_blur', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id });
  },
};

export const PHANTOM_ASSASSIN: HeroDef = {
  id: 'phantom_assassin', name: '幻影刺客', title: '茉朵', primary: 'agi',
  str: [19, 2.2], agi: [22, 3.4], int: [15, 1.7],
  baseDamage: [35, 37], baseArmor: 1, baseHpRegen: 1.0, baseManaRegen: 0,
  attackRange: 150, bat: 1.7, baseAttackSpeed: 110, attackPoint: 0.3, projectileSpeed: 0, moveSpeed: 310,
  roles: ['核心', '刺客', '爆发'],
  abilities: [stiflingDagger, phantomStrike, immaterial, coupDeGrace, blur],
  talents: [
    [
      { id: 'pa_t10a', name: '+0.8 秒幻影突袭持续时间', valueBonus: { abilityId: 'pa_phantom_strike', key: 'duration', add: 0.8 } },
      { id: 'pa_t10b', name: '−2 秒窒碍短匕冷却', valueBonus: { abilityId: 'pa_stifling_dagger', key: 'cooldown', add: -2 } },
    ],
    [
      { id: 'pa_t15a', name: '+20% 飘忽不定闪避', valueBonus: { abilityId: 'pa_immaterial', key: 'evasion', add: 0.2 } },
      { id: 'pa_t15b', name: '+15% 窒碍短匕攻击力系数', valueBonus: { abilityId: 'pa_stifling_dagger', key: 'attackPct', add: 0.15 } },
    ],
    [
      { id: 'pa_t20a', name: '+200 幻影突袭施法距离', valueBonus: { abilityId: 'pa_phantom_strike', key: 'castRange', add: 200 } },
      { id: 'pa_t20b', name: '+60 幻影突袭攻速', valueBonus: { abilityId: 'pa_phantom_strike', key: 'attackSpeed', add: 60 } },
    ],
    [
      {
        id: 'pa_t25a', name: '+10% 恩赐解脱几率（短匕同样 +10%）',
        valueBonus: [{ abilityId: 'pa_coup_de_grace', key: 'chance', add: 0.1 }, { abilityId: 'pa_coup_de_grace', key: 'daggerChance', add: 0.1 }],
      },
      { id: 'pa_t25b', name: '窒碍短匕额外射出 2 把', valueBonus: { abilityId: 'pa_stifling_dagger', key: 'extraTargets', add: 2 } },
    ],
  ],
};

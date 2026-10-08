import type { AbilityDef, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import type { Vec2 } from '../core/vec2';
import { add, dist, fromAngle, normalize, scale } from '../core/vec2';
import { applyDamage } from '../systems/damage';
import { abilityValue } from '../systems/abilities';
import { startMotion } from '../systems/motion';
import { applyControl, applySlow } from '../status';
import { enemiesInRadius, isTargetableBy } from '../query';
import { clampToWalkable } from '../data/map';

// ---------- Q 弧形闪电 ----------
const arcLightning: AbilityDef = {
  id: 'zeus_arc_lightning', name: '弧形闪电',
  description: '向一名敌人释放一道闪电，造成魔法伤害，之后闪电每隔一小段时间跳到附近另一个没有被它打过的敌人身上，直到跳满次数或附近没有新的敌人。冷却很短，清兵、补刀、消耗都用它。',
  slot: 'Q', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', damageType: 'magical', castPoint: 0.2,
  castRange: [800], cooldown: [1.6], manaCost: [85, 90, 95, 100],
  values: { damage: [105, 130, 155, 180], targets: [5, 7, 9, 11], bounceRadius: [450], bounceDelay: [0.25] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const first = ctx.target.unit;
    if (!first) return;
    // 数值在施放时确定（D25：targets 是总命中数，含第一个目标；同一个单位只命中一次）
    const damage = ctx.v('damage');
    const total = Math.round(ctx.v('targets'));
    const radius = ctx.v('bounceRadius');
    const delay = ctx.v('bounceDelay');
    const hit = new Set<number>();
    // 第 k 跳的理想时刻 = 施放时刻 + k × 间隔（按理想时刻排计时器，不让逻辑帧的取整一跳一跳累积）
    const t0 = world.time;
    const strike = (w: World, from: Vec2, t: Unit): void => {
      hit.add(t.id);
      w.events.emit({ type: 'fx', kind: 'zeus_arc', pos: { x: from.x, y: from.y }, unitId: caster.id, targetId: t.id });
      applyDamage(w, { source: caster, target: t, amount: damage, type: 'magical', isAttack: false, abilityId: 'zeus_arc_lightning' });
      if (hit.size >= total) return;
      const last = { x: t.pos.x, y: t.pos.y };
      w.after(t0 + hit.size * delay - w.time, (w2) => {
        // 上一个目标 450 内最近的、没被这道闪电打过的敌方非建筑可选中单位
        let next: Unit | null = null;
        let nd = Infinity;
        for (const u of enemiesInRadius(w2, caster.team, last, radius)) {
          if (hit.has(u.id) || !isTargetableBy(caster, u, 'enemy', false)) continue;
          const d = dist(last, u.pos);
          if (d < nd) { nd = d; next = u; }
        }
        if (next) strike(w2, last, next);
      });
    };
    strike(world, caster.pos, first);
  },
};

// ---------- W 雷击 ----------
const lightningBolt: AbilityDef = {
  id: 'zeus_lightning_bolt', name: '雷击',
  description: '召唤一道落雷劈中一名敌人，造成魔法伤害并短暂眩晕，可以打断持续施法。',
  slot: 'W', maxLevel: 4, targetType: 'unit', targetTeam: 'enemy', damageType: 'magical', castPoint: 0.3,
  castRange: [700, 750, 800, 850], cooldown: [6], manaCost: [120, 125, 130, 135],
  values: { damage: [140, 220, 300, 380], stun: [0.35], aoe: [0] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    const damage = ctx.v('damage');
    const stun = ctx.v('stun');
    const aoe = ctx.v('aoe');
    // 25 级左天赋：目标周围 aoe 内的敌方非建筑单位都被劈中
    const targets = aoe > 0 ? enemiesInRadius(world, caster.team, t.pos, aoe, { spell: true }) : [t];
    world.events.emit({
      type: 'fx', kind: 'zeus_bolt', pos: { x: t.pos.x, y: t.pos.y }, unitId: caster.id, targetId: t.id, ...(aoe > 0 ? { radius: aoe } : {}),
    });
    for (const u of targets) {
      applyControl(world, u, 'stun', { source: caster, duration: stun });
      applyDamage(world, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'zeus_lightning_bolt' });
    }
  },
};

// ---------- E 神圣一跳 ----------
const heavenlyJump: AbilityDef = {
  id: 'zeus_heavenly_jump', name: '神圣一跳',
  description: '宙斯朝面对的方向向前一跃（移动时就是摇杆的方向），起跳时电击附近最近的敌人（优先英雄），造成魔法伤害并大幅降低其移动速度和攻击速度。跳跃途中不能行动，被缠绕时不能施放。',
  slot: 'E', maxLevel: 4, targetType: 'none', damageType: 'magical', castPoint: 0, blockedByRoot: true,
  cooldown: [26, 22, 18, 14], manaCost: [50, 60, 70, 80],
  values: {
    distance: [375, 450, 525, 600], duration: [0.5], radius: [700, 800, 900, 1000], targets: [1], damage: [25, 50, 75, 100],
    moveSlow: [0.8], attackSlow: [100], slowDuration: [1.4],
    // 25 级右天赋的充能键（充能上限实际由 abilityMaxCharges 按 `zeus_heavenly_jump.charges` 天赋加值计算）
    charges: [0],
  },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const dir = normalize(ctx.target.dir ?? fromAngle(caster.facing));
    const from = { x: caster.pos.x, y: caster.pos.y };
    // 起跳时：radius 内最近的 targets 个敌方单位，英雄优先
    const radius = ctx.v('radius');
    const n = Math.round(ctx.v('targets'));
    const cands = enemiesInRadius(world, caster.team, from, radius)
      .filter((u) => isTargetableBy(caster, u, 'enemy', false))
      .sort((a, b) => Number(b.kind === 'hero') - Number(a.kind === 'hero') || dist(from, a.pos) - dist(from, b.pos))
      .slice(0, n);
    const damage = ctx.v('damage');
    for (const u of cands) {
      world.events.emit({ type: 'fx', kind: 'zeus_jump_shock', pos: { x: u.pos.x, y: u.pos.y }, unitId: caster.id, targetId: u.id });
      applyDamage(world, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'zeus_heavenly_jump' });
      if (u.alive) {
        applySlow(world, u, {
          source: caster, key: 'zeus_jump', duration: ctx.v('slowDuration'), moveSlow: ctx.v('moveSlow'), attackSlow: ctx.v('attackSlow'),
        });
      }
    }
    if (dir.x || dir.y) caster.facing = Math.atan2(dir.y, dir.x);
    startMotion(world, caster, {
      kind: 'leap', sourceId: caster.id, to: clampToWalkable(add(from, scale(dir, ctx.v('distance'))), caster.radius),
      duration: ctx.v('duration'), height: 120, disables: true,
    });
    world.events.emit({ type: 'fx', kind: 'zeus_jump', pos: from, dir: { x: dir.x, y: dir.y }, unitId: caster.id });
  },
};

// ---------- R 雷神之怒 ----------
const thundergodsWrath: AbilityDef = {
  id: 'zeus_thundergods_wrath', name: '雷神之怒',
  description: '向全地图所有存活的敌方英雄同时降下天雷，造成魔法伤害。看不见的敌方英雄也会被劈中，无敌的不会。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', damageType: 'magical', castPoint: 0.4,
  cooldown: [130], manaCost: [250, 375, 500],
  values: { damage: [275, 425, 575] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const damage = ctx.v('damage');
    // 所有存活、非无敌的敌方英雄，含隐藏的（D7）
    const heroes = world.units.filter(
      (u) => u.kind === 'hero' && u.team !== caster.team && u.alive && !u.removed && !u.hasState('invulnerable'),
    );
    for (const u of heroes) {
      world.events.emit({ type: 'fx', kind: 'zeus_wrath_hit', pos: { x: u.pos.x, y: u.pos.y }, unitId: caster.id, targetId: u.id });
      applyDamage(world, { source: caster, target: u, amount: damage, type: 'magical', isAttack: false, abilityId: 'zeus_thundergods_wrath' });
    }
    world.events.emit({ type: 'fx', kind: 'zeus_wrath', pos: { x: caster.pos.x, y: caster.pos.y }, unitId: caster.id });
  },
};

// ---------- 先天 静电场 ----------
/** 静电场当前的比例（3.45% + 0.05% × 英雄等级，含天赋）；AI 估算伤害共用 */
export function staticFieldPct(zeus: Unit): number {
  const ab = zeus.ability('innate');
  return ab && ab.def.id === 'zeus_static_field' ? abilityValue(zeus, ab, 'pct') : 0;
}

const STATIC_FIELD: ModifierDef = {
  id: 'zeus_static_field', hidden: true, persistOnDeath: true, dispel: 'none',
  // 普攻命中或技能伤害敌方非建筑单位时，先按目标当前生命结算静电场，再结算这次伤害（D25）
  onBeforeDealDamage: (_m, owner, target, world, info) => {
    if (info.abilityId === 'zeus_static_field' || info.reflected) return;
    if (!info.isAttack && !info.abilityId) return;
    if (target.team === owner.team || target.kind === 'building' || owner.hasState('breakPassives')) return;
    const amount = target.hp * staticFieldPct(owner);
    if (amount <= 0) return;
    world.events.emit({ type: 'fx', kind: 'zeus_static', pos: { x: target.pos.x, y: target.pos.y }, unitId: owner.id, targetId: target.id });
    applyDamage(world, { source: owner, target, amount, type: 'magical', isAttack: false, abilityId: 'zeus_static_field' });
  },
};

const staticField: AbilityDef = {
  id: 'zeus_static_field', name: '静电场',
  description: '宙斯的普攻命中、或者任何技能伤害到敌人时，先追加目标当前生命一定百分比的魔法伤害（对满血、高血量的目标最痛）。比例随英雄等级提高。对建筑无效。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { pct: [0.0345], pctPerLevel: [0.0005] },
  passive: STATIC_FIELD,
};

export const ZEUS: HeroDef = {
  id: 'zeus', name: '宙斯', title: '众神之王', primary: 'int',
  str: [21, 2.1], agi: [11, 1.2], int: [23, 3.3],
  baseDamage: [30, 40], baseArmor: 1, baseHpRegen: 0.25, baseManaRegen: 0,
  attackRange: 380, bat: 1.7, baseAttackSpeed: 100, attackPoint: 0.35, projectileSpeed: 1100, moveSpeed: 305,
  roles: ['核心', '法师', '爆发'],
  abilities: [arcLightning, lightningBolt, heavenlyJump, thundergodsWrath, staticField],
  talents: [
    [
      { id: 'zeus_t10a', name: '神圣一跳 +1 个目标', valueBonus: { abilityId: 'zeus_heavenly_jump', key: 'targets', add: 1 } },
      { id: 'zeus_t10b', name: '+200 生命', stats: { maxHp: 200 } },
    ],
    [
      { id: 'zeus_t15a', name: '+75 雷神之怒伤害', valueBonus: { abilityId: 'zeus_thundergods_wrath', key: 'damage', add: 75 } },
      {
        id: 'zeus_t15b', name: '−20% 弧形闪电冷却和魔耗',
        valueBonus: [{ abilityId: 'zeus_arc_lightning', key: 'cooldown', mult: 0.8 }, { abilityId: 'zeus_arc_lightning', key: 'manaCost', mult: 0.8 }],
      },
    ],
    [
      { id: 'zeus_t20a', name: '+60 弧形闪电伤害', valueBonus: { abilityId: 'zeus_arc_lightning', key: 'damage', add: 60 } },
      { id: 'zeus_t20b', name: '+0.5 秒雷击眩晕', valueBonus: { abilityId: 'zeus_lightning_bolt', key: 'stun', add: 0.5 } },
    ],
    [
      { id: 'zeus_t25a', name: '雷击变成 325 范围伤害', valueBonus: { abilityId: 'zeus_lightning_bolt', key: 'aoe', add: 325 } },
      { id: 'zeus_t25b', name: '神圣一跳改为 3 层充能', valueBonus: { abilityId: 'zeus_heavenly_jump', key: 'charges', add: 3 } },
    ],
  ],
};

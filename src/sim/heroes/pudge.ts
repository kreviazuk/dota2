import type { AbilityDef, CastContext, HeroDef } from './types';
import type { ModifierDef } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import type { ForcedMotion } from '../systems/motion';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { applyDamage, heal, killUnit } from '../systems/damage';
import { abilityChannelTime, abilityValue, cancelCast } from '../systems/abilities';
import { linearSweep, spawnProjectile } from '../systems/projectiles';
import { endMotion, startMotion } from '../systems/motion';
import { enemiesInRadius } from '../query';
import { recomputeStats } from '../stats';
import { clampToWalkable } from '../data/map';
import { add, copy, dist, fromAngle, normalize, scale, sub } from '../core/vec2';

// ---------- Q 肉钩 ----------
/** 出钩后帕吉不能行动（钩子飞过最大距离的 selfRootPct 或提前命中时移除；时长只是保险） */
const HOOK_BUSY: ModifierDef = { id: 'pudge_hook_busy', hidden: true, dispel: 'none', states: ['busy'] };

const removeHookBusy = (world: World, pudge: Unit): void => {
  const m = findModifier(pudge, HOOK_BUSY.id);
  if (m) removeModifier(world, pudge, m);
};

/** D21：能被肉钩钩到的单位（敌我都可以；不钩建筑、召唤物、无敌 / 不可选中单位和帕吉自己）。隐藏单位照常钩到（直线弹道的通用规则） */
export const hookable = (pudge: Unit, u: Unit): boolean =>
  u.id !== pudge.id && u.kind !== 'building' && u.kind !== 'summon' && !u.hasState('invulnerable') && !u.hasState('untargetable');

const meatHook: AbilityDef = {
  id: 'pudge_meat_hook', name: '肉钩',
  description: '朝指定方向甩出肉钩，钩住路上碰到的第一个单位并把它拖回帕吉面前。钩到敌方英雄时造成纯粹伤害，拖回途中对方不能行动；钩到友方单位只拖回、不造成伤害；钩到敌方小兵会直接将其击杀。出钩后帕吉要等钩子飞出大半距离或钩中目标才能行动。',
  slot: 'Q', maxLevel: 4, targetType: 'direction', damageType: 'pure', castPoint: 0.3,
  castRange: [1300], cooldown: [18, 16, 14, 12], manaCost: [120],
  values: { damage: [150, 220, 290, 360], speed: [1600], distance: [1300], width: [200], selfRootPct: [0.65] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const dir = normalize(ctx.target.dir ?? fromAngle(caster.facing));
    // 数值在出钩时确定
    const damage = ctx.v('damage');
    const speed = ctx.v('speed');
    const distance = ctx.v('distance');
    const releaseAt = distance * ctx.v('selfRootPct');
    addModifier(world, caster, HOOK_BUSY, { sourceId: caster.id, duration: (2 * distance) / Math.max(1, speed) + 0.5 });
    // 飞行中的钩子数（渲染层据此隐藏帕吉手里的钩子）
    const ab = ctx.ability;
    ab.data.hookOut = (ab.data.hookOut ?? 0) + 1;
    const finish = (p: { done: boolean }): void => {
      p.done = true;
      ab.data.hookOut = Math.max(0, (ab.data.hookOut ?? 1) - 1);
    };
    let phase: 'out' | 'back' = 'out';
    let targetId = -1;
    let drag: ForcedMotion | null = null;
    /** 正在被这个钩子拖着的单位（死亡、被别的位移打断后不再算） */
    const dragged = (w: World): Unit | null => {
      const t = targetId >= 0 ? w.getUnit(targetId) : undefined;
      return t && t.alive && !t.removed && drag && t.motion === drag ? t : null;
    };
    const hookHit = (w: World, u: Unit, pos: { x: number; y: number }): void => {
      removeHookBusy(w, caster);
      phase = 'back';
      w.events.emit({ type: 'fx', kind: 'pudge_hook_hit', pos: copy(u.pos), unitId: caster.id, targetId: u.id });
      const enemy = u.team !== caster.team;
      // 敌方小兵：直接击杀，钩子空着收回
      if (enemy && u.kind === 'creep') {
        killUnit(w, u, caster);
        return;
      }
      // 敌方英雄 / 精英：纯粹伤害（减益免疫时为 0，但照样拖回）
      if (enemy) applyDamage(w, { source: caster, target: u, amount: damage, type: 'pure', isAttack: false, abilityId: 'pudge_meat_hook' });
      if (!u.alive) return;
      // 钩尖贴到目标身上，之后目标跟着钩尖走
      pos.x = u.pos.x;
      pos.y = u.pos.y;
      startMotion(w, u, {
        kind: 'hook', sourceId: caster.id, to: copy(u.pos), duration: Infinity, height: 0, disables: enemy,
        follow: (w2, v) => {
          // 帕吉死亡 / 钩子已经结束：原地放下（被打断）
          if (!caster.alive || proj.done) {
            endMotion(w2, v, true);
            return null;
          }
          return copy(proj.pos);
        },
      });
      drag = u.motion;
      targetId = u.id;
    };
    const proj = spawnProjectile(world, {
      team: caster.team, sourceId: caster.id, pos: copy(caster.pos), speed, kind: 'linear', dir, maxDistance: distance,
      width: ctx.v('width') / 2, pierce: false, visual: 'pudge_hook',
      hitFilter: (_w, u) => hookable(caster, u),
      // 碰撞在 update 里处理
      onHit: () => {},
      update: (w, p, dt) => {
        // D21：帕吉中途死亡，钩子立即消失，目标原地放下
        if (!caster.alive || caster.removed) {
          const t = dragged(w);
          if (t) endMotion(w, t, true);
          finish(p);
          return true;
        }
        if (phase === 'out') {
          const s = Math.min(p.speed * dt, p.maxDistance - p.traveled);
          const from = p.pos;
          p.pos = add(from, scale(dir, s));
          p.traveled += s;
          if (p.traveled + 1e-6 >= releaseAt) removeHookBusy(w, caster);
          const first = linearSweep(w, p, from, p.pos)[0];
          if (first) {
            p.hit.add(first.id);
            hookHit(w, first, p.pos);
          } else if (p.traveled >= p.maxDistance - 1e-6) {
            phase = 'back';
            removeHookBusy(w, caster);
          }
          return true;
        }
        // 收回：每帧朝帕吉当前位置移动
        const t = dragged(w);
        const d = dist(p.pos, caster.pos);
        const step = p.speed * dt;
        const stopAt = t ? caster.radius + t.radius + 40 : 0;
        if (d <= step + stopAt) {
          if (t) {
            // 落在帕吉面前（目标来的那一侧），两者半径 + 40
            const side = normalize(sub(t.pos, caster.pos));
            const face = side.x || side.y ? side : fromAngle(caster.facing);
            endMotion(w, t, false);
            t.pos = clampToWalkable(add(caster.pos, scale(face, caster.radius + t.radius + 40)), t.radius);
          }
          p.pos = copy(caster.pos);
          finish(p);
          return true;
        }
        p.pos = add(p.pos, scale(sub(caster.pos, p.pos), step / d));
        if (t) t.pos = clampToWalkable(copy(p.pos), t.radius);
        return true;
      },
    });
    world.events.emit({ type: 'fx', kind: 'pudge_meat_hook', pos: copy(caster.pos), dir: copy(dir), unitId: caster.id });
  },
};

// ---------- W 腐烂 ----------
/** 腐烂范围内敌人的减速（光环子 Modifier，数值每 tick 由 childData 写入） */
const ROT_SLOW: ModifierDef = {
  id: 'pudge_rot_slow', name: '腐烂', debuff: true,
  stats: (m) => ({ moveSpeedPct: -(m.data.slow ?? 0) }),
};

const rotValue = (owner: Unit, key: string): number => {
  const ab = owner.ability('W');
  return ab ? abilityValue(owner, ab, key) : 0;
};

const ROT: ModifierDef = {
  id: 'pudge_rot', name: '腐烂', dispel: 'none', interval: 0.2,
  // 每 0.2 秒：范围内敌方非建筑单位受到 dps × 0.2 魔法伤害，帕吉自己也受到同样的伤害（不会致死，不吃技能增强 / 吸血）
  onInterval: (_m, owner, world) => {
    const amount = rotValue(owner, 'dps') * 0.2;
    for (const u of enemiesInRadius(world, owner.team, owner.pos, rotValue(owner, 'radius'))) {
      applyDamage(world, { source: owner, target: u, amount, type: 'magical', isAttack: false, abilityId: 'pudge_rot' });
    }
    if (owner.alive) {
      applyDamage(world, {
        source: owner, target: owner, amount, type: 'magical', isAttack: false, abilityId: 'pudge_rot', nonLethal: true, noSpellAmp: true,
      });
    }
  },
  // 帕吉死亡时开关自动关闭（Modifier 本身随死亡移除）
  onDeath: (_m, owner) => {
    const ab = owner.ability('W');
    if (ab) ab.toggled = false;
  },
  aura: {
    radius: (owner) => rotValue(owner, 'radius'),
    team: 'enemy',
    child: ROT_SLOW,
    childData: (owner) => ({ slow: rotValue(owner, 'slow') / 100 }),
  },
};

const rot: AbilityDef = {
  id: 'pudge_rot', name: '腐烂',
  description: '开关技能：开启后帕吉身边散发腐臭的毒雾，持续对周围的敌人造成魔法伤害并降低他们的移动速度。帕吉自己也会受到同样的伤害，但腐烂不会让他死亡。帕吉死亡时自动关闭。',
  slot: 'W', maxLevel: 4, targetType: 'toggle', damageType: 'magical',
  values: { dps: [30, 60, 90, 120], slow: [14, 20, 26, 32], radius: [250] },
  onToggle: (ctx, on) => {
    const { world, caster } = ctx;
    const m = findModifier(caster, ROT.id);
    if (on) {
      if (!m) addModifier(world, caster, ROT, { sourceId: caster.id, abilityLevel: ctx.level });
      world.events.emit({ type: 'fx', kind: 'pudge_rot', pos: copy(caster.pos), radius: ctx.v('radius'), unitId: caster.id });
    } else if (m) {
      removeModifier(world, caster, m);
    }
  },
};

// ---------- E 肉盾 ----------
const MEAT_SHIELD: ModifierDef = {
  id: 'pudge_meat_shield', name: '肉盾',
  // 每一次伤害（任意类型和来源）减免后再减去固定的格挡值
  onIncomingDamage: (m, _owner, _world, info) => {
    info.amount = Math.max(0, info.amount - (m.data.block ?? 0));
  },
};

const meatShield: AbilityDef = {
  id: 'pudge_meat_shield', name: '肉盾',
  description: '即时施放：帕吉用一层厚厚的肉挡在身前，持续期间受到的每一次伤害都减少固定的数值。施放不会打断其他动作，肢解时也能使用。',
  slot: 'E', maxLevel: 4, targetType: 'none', instant: true,
  cooldown: [20, 19, 18, 17], manaCost: [65, 70, 75, 80],
  values: { block: [8, 14, 20, 26], duration: [4, 5, 6, 7] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    addModifier(world, caster, MEAT_SHIELD, { sourceId: caster.id, duration: ctx.v('duration'), data: { block: ctx.v('block') } });
    world.events.emit({ type: 'fx', kind: 'pudge_meat_shield', pos: copy(caster.pos), unitId: caster.id });
  },
};

// ---------- R 肢解 ----------
const DISMEMBERED: ModifierDef = { id: 'pudge_dismembered', name: '肢解', debuff: true, dispel: 'none', states: ['stunned'] };

/** 一跳：(dps + 力量 × strPct) × tick 魔法伤害，帕吉回复等量（实际造成的）生命 */
function dismemberTick(ctx: CastContext, t: Unit): void {
  const { world, caster } = ctx;
  const amount = (ctx.v('dps') + caster.stats.str * ctx.v('strPct')) * ctx.v('tick');
  const dealt = applyDamage(world, {
    source: caster, target: t, amount, type: 'magical', isAttack: false, abilityId: 'pudge_dismember', ignoreImmunity: true,
  });
  if (dealt > 0) heal(world, caster, dealt);
  world.events.emit({ type: 'fx', kind: 'pudge_dismember', pos: copy(t.pos), unitId: caster.id, targetId: t.id });
}

const endDismember = (ctx: CastContext): void => {
  const t = ctx.target.unit;
  if (!t) return;
  const m = findModifier(t, DISMEMBERED.id, ctx.caster.id);
  if (m) removeModifier(ctx.world, t, m);
};

const dismember: AbilityDef = {
  id: 'pudge_dismember', name: '肢解',
  description: '持续施法：帕吉抓住一名敌人大口撕咬，期间对方无法行动（无视减益免疫），每隔一段时间受到魔法伤害，伤害随帕吉的力量提高，帕吉回复等量的生命；目标会被慢慢拉到帕吉身边。帕吉移动或被控制时中断。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'unit', targetTeam: 'enemy', damageType: 'magical',
  castRange: [200], castPoint: 0.3, channelTime: [2.75], ignoresDebuffImmune: true,
  cooldown: [30, 25, 20], manaCost: [100, 130, 170],
  values: { dps: [80, 100, 120], strPct: [0.3, 0.6, 0.9], pullSpeed: [75], minDist: [125], tick: [0.5] },
  onCast: (ctx) => {
    const { world, caster, ability } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    addModifier(world, t, DISMEMBERED, {
      sourceId: caster.id, duration: abilityChannelTime(caster, ability) + 0.1, ignoreImmunity: true,
    });
    ability.data.acc = 0;
    // 第一跳立即结算（D22：0、0.5 … 秒）
    dismemberTick(ctx, t);
    if (!t.alive) cancelCast(world, caster, true);
  },
  onChannelTick: (ctx, dt) => {
    const { world, caster, ability } = ctx;
    const c = caster.cast;
    if (!c || c.ability !== ability) return;
    const t = ctx.target.unit;
    if (!t || !t.alive || t.removed) {
      cancelCast(world, caster, true);
      return;
    }
    // 以 pullSpeed 把目标拉向帕吉，直到中心距离 ≤ minDist
    const d = dist(t.pos, caster.pos);
    const minD = ctx.v('minDist');
    if (d > minD) {
      const step = Math.min(ctx.v('pullSpeed') * dt, d - minD);
      t.pos = clampToWalkable(add(t.pos, scale(normalize(sub(caster.pos, t.pos)), step)), t.radius);
    }
    // 每 tick 秒一跳；引导结束的那一刻不再结算（2.75 秒 = 6 跳，3.5 秒 = 7 跳）
    const tick = ctx.v('tick');
    ability.data.acc = (ability.data.acc ?? 0) + dt;
    while (ability.data.acc + 1e-6 >= tick && c.timer > 1e-6) {
      ability.data.acc -= tick;
      dismemberTick(ctx, t);
      if (!t.alive) {
        cancelCast(world, caster, true);
        return;
      }
    }
  },
  onChannelEnd: (ctx) => endDismember(ctx),
};

// ---------- 先天 腐肉堆积 ----------
const fleshHeapStacks = (u: Unit): number => findModifier(u, 'pudge_flesh_heap')?.data.stacks ?? 0;

const FLESH_HEAP: ModifierDef = {
  id: 'pudge_flesh_heap', hidden: true, persistOnDeath: true, dispel: 'none',
  // 敌方英雄死亡：死在帕吉 radius 内（中心到死者边缘）或者是帕吉击杀的 → +1 层
  onUnitDeath: (m, owner, victim, killer, world) => {
    if (victim.kind !== 'hero' || victim.team === owner.team) return;
    const ab = owner.ability('innate');
    if (!ab) return;
    const near = dist(victim.pos, owner.pos) - victim.radius <= abilityValue(owner, ab, 'radius');
    if (!near && killer?.id !== owner.id) return;
    m.data.stacks = (m.data.stacks ?? 0) + 1;
    recomputeStats(world, owner);
    world.events.emit({ type: 'fx', kind: 'pudge_flesh_heap', pos: copy(owner.pos), unitId: owner.id, targetId: victim.id });
  },
  // 每层力量读当前数值（25 级右天赋 ×1.5 对已有的层数同样生效）
  stats: (m, owner) => {
    const ab = owner.ability('innate');
    const stacks = m.data.stacks ?? 0;
    return ab && stacks > 0 ? { str: stacks * abilityValue(owner, ab, 'strPerStack') } : {};
  },
};

const fleshHeap: AbilityDef = {
  id: 'pudge_flesh_heap', name: '腐肉堆积',
  description: '先天技能：每当有敌方英雄死在帕吉附近，或者被帕吉击杀，帕吉就永久获得一层腐肉堆积，每层增加力量。层数在帕吉死亡后保留。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { strPerStack: [2], radius: [450] },
  passive: FLESH_HEAP,
  counter: (u) => fleshHeapStacks(u),
};

export const PUDGE: HeroDef = {
  id: 'pudge', name: '帕吉', title: '屠夫', primary: 'str',
  str: [25, 3.0], agi: [13, 1.4], int: [16, 1.8],
  baseDamage: [45, 51], baseArmor: 0, baseHpRegen: 2.5, baseManaRegen: 0,
  attackRange: 175, bat: 1.7, baseAttackSpeed: 100, attackPoint: 0.5, projectileSpeed: 0, moveSpeed: 280,
  roles: ['先手', '坦克', '控制'],
  abilities: [meatHook, rot, meatShield, dismember, fleshHeap],
  talents: [
    [
      { id: 'pudge_t10a', name: '+5 护甲', stats: { armor: 5 } },
      { id: 'pudge_t10b', name: '+10% 腐烂减速', valueBonus: { abilityId: 'pudge_rot', key: 'slow', add: 10 } },
    ],
    [
      { id: 'pudge_t15a', name: '+8% 技能吸血', stats: { spellLifesteal: 0.08 } },
      { id: 'pudge_t15b', name: '+150 肉钩伤害', valueBonus: { abilityId: 'pudge_meat_hook', key: 'damage', add: 150 } },
    ],
    [
      { id: 'pudge_t20a', name: '+0.75 秒肢解持续时间', valueBonus: { abilityId: 'pudge_dismember', key: 'channelTime', add: 0.75 } },
      { id: 'pudge_t20b', name: '−4 秒肉钩冷却', valueBonus: { abilityId: 'pudge_meat_hook', key: 'cooldown', add: -4 } },
    ],
    [
      {
        id: 'pudge_t25a', name: '肢解伤害和治疗 ×1.5',
        valueBonus: [{ abilityId: 'pudge_dismember', key: 'dps', mult: 1.5 }, { abilityId: 'pudge_dismember', key: 'strPct', mult: 1.8 }],
      },
      {
        id: 'pudge_t25b', name: '腐肉堆积与肉盾效果 ×1.5',
        valueBonus: [{ abilityId: 'pudge_flesh_heap', key: 'strPerStack', mult: 1.5 }, { abilityId: 'pudge_meat_shield', key: 'block', mult: 1.5 }],
      },
    ],
  ],
};

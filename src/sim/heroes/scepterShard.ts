import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { AbilityDef } from './types';
import { newAbilityInstance } from '../systems/abilities';
import { addModifier, type ModifierDef } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { applyControl, applySlow } from '../status';
import { startMotion } from '../systems/motion';
import { enemiesInRadius } from '../query';
import { add, fromAngle, normalize, scale, sub } from '../core/vec2';

// ================= 状态查询 =================

export const hasScepter = (unit: Unit): boolean => unit.hasItem('aghanims_scepter');
export const hasShard = (unit: Unit): boolean => !!unit.hero?.hasShard;

// ================= 斧王 A杖与魔晶效果 =================

export const MOD_AXE_HELIX_DEBUFF: ModifierDef = {
  id: 'mod_axe_helix_debuff',
  name: '螺旋震慑',
  debuff: true,
  stats: { bonusDamage: -15 },
};

// ================= 主宰 A杖技能：迅风斩 (X2) =================

export const JUGG_SWIFTSLASH: AbilityDef = {
  id: 'jugg_swiftslash',
  name: '迅风斩',
  description: '神杖赋予技能：瞬移并对目标及其周围敌方单位进行持续 1.0 秒的小型无敌斩，无敌且获得额外攻速与攻击力。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'unit',
  targetTeam: 'enemy',
  castRange: [600],
  castPoint: 0.2,
  cooldown: [20],
  manaCost: [100],
  values: { duration: [1.0], bonusAs: [40], bonusDamage: [40], radius: [425] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const t = ctx.target.unit;
    if (!t) return;
    const omni = caster.ability('R');
    const omniDef = omni?.def;
    if (omniDef?.passive) {
      addModifier(world, caster, omniDef.passive, {
        sourceId: caster.id,
        duration: 1.0,
        data: { as: 40, dmg: 40, radius: 425, timer: 0 },
      });
    }
    world.events.emit({ type: 'fx', kind: 'jugg_omnislash', pos: { ...caster.pos }, unitId: caster.id, targetId: t.id });
  },
};

// ================= 幻影刺客 A杖技能：刀阵旋风 (X2) =================

export const PA_FAN_OF_KNIVES: AbilityDef = {
  id: 'pa_fan_of_knives',
  name: '刀阵旋风',
  description: '神杖赋予技能：释放刀阵，对周围 550 范围内敌人造成其 30% 最大生命值的物理伤害，并破坏其被动技能 4 秒。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'none',
  castPoint: 0.1,
  cooldown: [18],
  manaCost: [50],
  values: { radius: [550], pct: [0.30], breakDuration: [4.0] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const r = ctx.v('radius');
    const pct = ctx.v('pct');
    const dur = ctx.v('breakDuration');
    for (const e of enemiesInRadius(world, caster.team, caster.pos, r, { includeBuildings: false })) {
      const dmg = e.stats.maxHp * pct;
      applyDamage(world, {
        source: caster,
        target: e,
        amount: dmg,
        type: 'physical',
        isAttack: false,
        abilityId: 'pa_fan_of_knives',
      });
      applyControl(world, e, 'break', { source: caster, duration: dur });
    }
    world.events.emit({ type: 'fx', kind: 'pa_fan_of_knives', pos: { ...caster.pos }, radius: r, unitId: caster.id });
  },
};

// ================= 卓尔游侠 魔晶技能：冰川 (X2) =================

export const MOD_DROW_GLACIER: ModifierDef = {
  id: 'mod_drow_glacier',
  name: '冰川高地',
  stats: { attackRange: 200, bonusDamage: 25 },
};

export const DROW_GLACIER: AbilityDef = {
  id: 'drow_glacier',
  name: '冰川',
  description: '魔晶赋予技能：在脚下升起一座冰丘，击退周围敌人，持续 6 秒内增加 200 攻击距离并附带高地额外攻击力。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'none',
  castPoint: 0.1,
  cooldown: [25],
  manaCost: [75],
  values: { duration: [6.0], pushDistance: [250] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    addModifier(world, caster, MOD_DROW_GLACIER, { sourceId: caster.id, duration: 6.0 });
    for (const e of enemiesInRadius(world, caster.team, caster.pos, 350)) {
      const dir = normalize(sub(e.pos, caster.pos));
      startMotion(world, e, {
        kind: 'knockback',
        sourceId: caster.id,
        to: add(e.pos, scale(dir, 200)),
        duration: 0.3,
        height: 50,
        disables: true,
      });
    }
    world.events.emit({ type: 'fx', kind: 'drow_glacier', pos: { ...caster.pos }, unitId: caster.id });
  },
};

// ================= 卓尔游侠 A杖被动：低温 (Hypothermia) =================

export const MOD_DROW_HYPOTHERMIA: ModifierDef = {
  id: 'mod_drow_hypothermia',
  name: '低温',
  debuff: true,
  stacking: 'stacks',
  maxStacks: 9,
  stats: (m) => ({ hpRegenAmp: -0.10 * m.stacks }),
  onDeath: (m, owner, killer, world) => {
    if (m.stacks > 0) {
      const dmg = m.stacks * 60;
      for (const e of enemiesInRadius(world, owner.team, owner.pos, 500)) {
        applyDamage(world, {
          source: killer,
          target: e,
          amount: dmg,
          type: 'magical',
          isAttack: false,
          abilityId: 'drow_hypothermia_burst',
        });
        applySlow(world, e, { source: killer, duration: 3.0, key: 'hypothermia', moveSlow: 0.30 });
      }
    }
  },
};

// ================= 莉娜 A杖技能：腾焰斗篷 (X2) =================

export const MOD_LINA_FLAME_CLOAK: ModifierDef = {
  id: 'mod_lina_flame_cloak',
  name: '腾焰斗篷',
  states: ['phased'],
  stats: { spellAmp: 0.35, magicResist: 0.35, moveSpeedPct: 0.25 },
};

export const LINA_FLAME_CLOAK: AbilityDef = {
  id: 'lina_flame_cloak',
  name: '腾焰斗篷',
  description: '神杖赋予技能：获得穿行移动能力、+35% 技能增强、+35% 魔法抗性，并立即获得满层炽魂，持续 7 秒。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'none',
  castPoint: 0.1,
  cooldown: [25],
  manaCost: [100],
  values: { duration: [7.0] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    addModifier(world, caster, MOD_LINA_FLAME_CLOAK, { sourceId: caster.id, duration: 7.0 });
    const fiery = caster.ability('E');
    if (fiery && fiery.level > 0 && fiery.def.passive) {
      addModifier(world, caster, fiery.def.passive, { sourceId: caster.id, stacks: 3 });
    }
    world.events.emit({ type: 'fx', kind: 'lina_flame_cloak', pos: { ...caster.pos }, unitId: caster.id });
  },
};

// ================= 宙斯 A杖技能：雷云 (Nimbus X2) =================

export const ZEUS_NIMBUS: AbilityDef = {
  id: 'zeus_nimbus',
  name: '雷云',
  description: '神杖赋予技能：在全地图任意位置召唤一片雷云，每 2.5 秒自动对云下 450 范围内敌人施放落雷，持续 30 秒。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'point',
  castPoint: 0.2,
  cooldown: [35],
  manaCost: [200],
  values: { duration: [30.0], interval: [2.5], radius: [450] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const targetPoint = ctx.target.point ?? caster.pos;
    const cloudPos = { ...targetPoint };

    // 纯仿真定时推进器
    for (let t = 2.5; t <= 30; t += 2.5) {
      world.after(t, (w) => {
        if (!caster.alive) return;
        const enemies = enemiesInRadius(w, caster.team, cloudPos, 450);
        if (enemies.length > 0) {
          const victim = enemies[0];
          applyDamage(w, {
            source: caster,
            target: victim,
            amount: 300,
            type: 'magical',
            isAttack: false,
            abilityId: 'zeus_nimbus_bolt',
          });
          applyControl(w, victim, 'stun', { source: caster, duration: 0.4 });
          w.events.emit({ type: 'fx', kind: 'zeus_bolt', pos: { ...victim.pos }, unitId: caster.id, targetId: victim.id });
        }
      });
    }

    world.events.emit({ type: 'fx', kind: 'zeus_nimbus', pos: cloudPos, radius: 450, unitId: caster.id });
  },
};

// ================= 宙斯 魔晶技能：霹雳之手 (Lightning Hands X2) =================

export const ZEUS_LIGHTNING_HANDS: AbilityDef = {
  id: 'zeus_lightning_hands',
  name: '霹雳之手',
  description: '魔晶赋予开关：开启后每次普通攻击自动触发半额弧形闪电。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'toggle',
  cooldown: [0],
  values: {},
  passive: {
    id: 'mod_zeus_lightning_hands',
    onAttackLanded: (_m, owner, target, world, info) => {
      const toggle = owner.ability('X2');
      if (toggle && toggle.toggled && info.isAttack && target.alive && !target.hasState('invulnerable')) {
        const arc = owner.ability('Q');
        if (arc && arc.level > 0) {
          arc.def.onCast?.({
            world,
            caster: owner,
            ability: arc,
            level: arc.level,
            target: { unit: target },
            v: (k: string) => (arc.def.values[k]?.[arc.level - 1] ?? 0) * 0.5,
          });
        }
      }
    },
  },
};

// ================= 水晶室女 魔晶技能：冰晶克隆 (Crystal Clone X2) =================

export const CM_CRYSTAL_CLONE: AbilityDef = {
  id: 'cm_crystal_clone',
  name: '冰晶克隆',
  description: '魔晶赋予技能：向后滑行 400 距离，并在原地留下一个冰晶克隆。5 秒后或受到攻击时爆炸，造成 150 点魔法伤害并冰封周围敌人 2.0 秒。',
  slot: 'X2',
  maxLevel: 1,
  targetType: 'none',
  castPoint: 0.1,
  cooldown: [12],
  manaCost: [50],
  values: { duration: [5.0], radius: [400], damage: [150], frostbiteDuration: [2.0] },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const backward = fromAngle(caster.facing + Math.PI);
    const origin = { ...caster.pos };

    // 后滑 400
    startMotion(world, caster, {
      kind: 'dash',
      sourceId: caster.id,
      to: add(caster.pos, scale(backward, 400)),
      duration: 0.3,
      height: 0,
      disables: false,
    });

    // 留下克隆：延迟爆炸
    world.after(5.0, (w) => {
      for (const e of enemiesInRadius(w, caster.team, origin, 400)) {
        applyDamage(w, {
          source: caster,
          target: e,
          amount: 150,
          type: 'magical',
          isAttack: false,
          abilityId: 'cm_crystal_clone',
        });
        applyControl(w, e, 'root', { source: caster, duration: 2.0 });
        applyControl(w, e, 'disarm', { source: caster, duration: 2.0 });
      }
      w.events.emit({ type: 'fx', kind: 'cm_clone_explode', pos: origin, radius: 400, unitId: caster.id });
    });

    world.events.emit({ type: 'fx', kind: 'cm_crystal_clone', pos: origin, unitId: caster.id });
  },
};

// ================= 同步与挂载 =================

export function syncScepterAndShard(world: World, unit: Unit): void {
  if (!unit.alive || !unit.hero) return;

  const scepter = hasScepter(unit);
  const shard = hasShard(unit);

  // 1. 检查各英雄专属 X2 技能挂载
  switch (unit.defId) {
    case 'juggernaut':
      updateX2Ability(unit, scepter ? JUGG_SWIFTSLASH : null);
      break;

    case 'phantom_assassin':
      updateX2Ability(unit, scepter ? PA_FAN_OF_KNIVES : null);
      break;

    case 'drow_ranger':
      updateX2Ability(unit, shard ? DROW_GLACIER : null);
      break;

    case 'lina':
      updateX2Ability(unit, scepter ? LINA_FLAME_CLOAK : null);
      break;

    case 'zeus':
      if (scepter) updateX2Ability(unit, ZEUS_NIMBUS);
      else if (shard) updateX2Ability(unit, ZEUS_LIGHTNING_HANDS);
      else updateX2Ability(unit, null);
      break;

    case 'crystal_maiden':
      updateX2Ability(unit, shard ? CM_CRYSTAL_CLONE : null);
      break;

    default:
      break;
  }
}

function updateX2Ability(unit: Unit, def: AbilityDef | null): void {
  const existingIndex = unit.abilities.findIndex((a) => a.def.slot === 'X2');
  if (def) {
    if (existingIndex >= 0) {
      if (unit.abilities[existingIndex].def.id !== def.id) {
        unit.abilities[existingIndex] = newAbilityInstance(def);
        unit.abilities[existingIndex].level = 1;
      }
    } else {
      const inst = newAbilityInstance(def);
      inst.level = 1;
      unit.abilities.push(inst);
    }
  } else if (existingIndex >= 0) {
    unit.abilities.splice(existingIndex, 1);
  }
}

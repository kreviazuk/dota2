import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { CastTarget } from '../heroes/types';
import type { ModifierDef } from '../modifiers';
import { addModifier, findModifier, removeModifier, dispel } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { heal } from '../systems/damage';
import { applyControl, applySlow } from '../status';
import { blinkTo, startMotion } from '../systems/motion';
import { addShield } from '../shields';
import { alliesInRadius, edgeDist, enemiesInRadius } from '../query';
import { add, dist, fromAngle, normalize, scale, sub } from '../core/vec2';
import { recomputeStats } from '../stats';
import { getItemDef } from './definitions';
import { syncItemPassives, triggerChainLightning } from './passives';

// ================= Active Modifiers =================

export const MOD_BKB_ACTIVE: ModifierDef = {
  id: 'mod_item_bkb_active',
  name: '天神下凡',
  dispel: 'none',
  states: ['debuffImmune'],
  stats: { magicResist: 0.60 },
};

export const MOD_BLADE_MAIL_ACTIVE: ModifierDef = {
  id: 'mod_item_blade_mail_active',
  name: '伤害返还',
  dispel: 'none',
  onIncomingDamage: (_m, target, world, info) => {
    if (info.source && info.source.alive && !info.reflected && info.source.team !== target.team && info.amount > 0) {
      applyDamage(world, {
        source: target,
        target: info.source,
        amount: info.amount,
        type: info.type,
        isAttack: false,
        reflected: true,
        abilityId: 'item_blade_mail_active',
      });
    }
  },
};

export const MOD_PHASE_BOOTS: ModifierDef = {
  id: 'mod_item_phase_boots',
  name: '相位移动',
  states: ['phased'],
  stats: { moveSpeedPct: 0.20 },
};

export const MOD_SATANIC_ACTIVE: ModifierDef = {
  id: 'mod_item_satanic_active',
  name: '不洁狂热',
  dispel: 'none',
  stats: { lifesteal: 1.75 },
};

export const MOD_MOM_ACTIVE: ModifierDef = {
  id: 'mod_item_mom_active',
  name: '狂热',
  states: ['silenced'],
  stats: { attackSpeed: 110, moveSpeedPct: 0.15, armor: -7 },
};

export const MOD_ARMLET_ACTIVE: ModifierDef = {
  id: 'mod_item_armlet_active',
  name: '邪恶之力',
  dispel: 'none',
  stats: { bonusDamage: 35, str: 25, armor: 4 },
  interval: 0.1,
  onInterval: (_m, u, _w) => {
    if (u.alive && u.hp > 1) {
      u.hp = Math.max(1, u.hp - 4.5); // 45 hp/s non-lethal drain
    }
  },
};

export const MOD_MEKANSM_ARMOR: ModifierDef = {
  id: 'mod_item_mekansm_armor',
  name: '治愈装甲',
  stats: { armor: 2 },
};

export const MOD_CRIMSON_GUARD_ACTIVE: ModifierDef = {
  id: 'mod_item_crimson_guard_active',
  name: '坚盾防线',
  onIncomingDamage: (_m, _u, _w, info) => {
    if (info.isAttack && info.type === 'physical') {
      info.amount = Math.max(0, info.amount - 75);
    }
  },
};

export const MOD_EUL_CYCLONE: ModifierDef = {
  id: 'mod_item_eul_cyclone',
  name: '龙卷风',
  dispel: 'none',
  states: ['invulnerable', 'busy'],
  onRemove: (m, u, world) => {
    const caster = m.sourceId ? world.getUnit(m.sourceId) : null;
    if (caster && u.team !== caster.team && u.alive) {
      applyDamage(world, {
        source: caster,
        target: u,
        amount: 50,
        type: 'magical',
        isAttack: false,
        abilityId: 'item_euls_scepter',
      });
    }
  },
};

export const MOD_TANGO: ModifierDef = {
  id: 'mod_item_tango',
  name: '吞食',
  stats: { hpRegen: 7.0 },
};

export const MOD_SALVE: ModifierDef = {
  id: 'mod_item_salve',
  name: '治愈',
  stats: { hpRegen: 30.0 },
  onIncomingDamage: (m, u, world, info) => {
    if (info.source && (info.source.kind === 'hero' || info.source.kind === 'building') && info.source.team !== u.team && info.amount > 0) {
      removeModifier(world, u, m);
    }
  },
};

export const MOD_CLARITY: ModifierDef = {
  id: 'mod_item_clarity',
  name: '回魔',
  stats: { manaRegen: 6.0 },
  onIncomingDamage: (m, u, world, info) => {
    if (info.source && (info.source.kind === 'hero' || info.source.kind === 'building') && info.source.team !== u.team && info.amount > 0) {
      removeModifier(world, u, m);
    }
  },
};

export const MOD_MJOLLNIR_SHIELD: ModifierDef = {
  id: 'mod_item_mjollnir_shield',
  name: '静电护盾',
  onAttacked: (_m, target, attacker, world, info) => {
    if (attacker && attacker.alive && !info.reflected && world.rng.chance(0.20)) {
      triggerChainLightning(world, target, attacker, 225, 5);
    }
  },
};

// ================= Magic Stick & Wand Charging =================

export function chargeMagicStickNearby(world: World, caster: Unit): void {
  for (const enemy of enemiesInRadius(world, caster.team, caster.pos, 1200, { heroesOnly: true })) {
    for (const it of enemy.inventory) {
      if (!it) continue;
      if (it.id === 'magic_stick') {
        it.charges = Math.min(10, (it.charges ?? 0) + 1);
      } else if (it.id === 'magic_wand') {
        it.charges = Math.min(20, (it.charges ?? 0) + 1);
      }
    }
  }
}

// ================= Active Item Dispatcher =================

export function useItem(world: World, unit: Unit, slotIndex: number, target?: CastTarget): boolean {
  if (!unit.alive || slotIndex < 0 || slotIndex >= 6) return false;
  const item = unit.inventory[slotIndex];
  if (!item) return false;

  // 处于静音状态不能使用物品
  if (unit.hasState('muted')) return false;

  const def = getItemDef(item.id);
  if (!def || !def.active) return false;

  const active = def.active;

  // 冷却检查
  if ((item.cooldownRemaining ?? 0) > 0) return false;

  // 魔法值检查
  const manaCost = active.manaCost ?? 0;
  if (manaCost > 0 && unit.mana + 1e-6 < manaCost) return false;

  // 状态检查：部分控制状态下不可用（眩晕、睡眠等，busy状态除外除非技能要求）
  if (unit.hasState('stunned') || unit.hasState('busy')) return false;

  // 目标解析
  let targetUnit: Unit | null = null;
  if (active.targetType === 'unit') {
    if (target?.unitId !== undefined) {
      targetUnit = world.getUnit(target.unitId) ?? null;
    } else if (active.canTargetSelf) {
      targetUnit = unit;
    }
    if (!targetUnit || !targetUnit.alive) return false;

    // 团队限制
    if (active.targetTeam === 'enemy' && targetUnit.team === unit.team) return false;
    if (active.targetTeam === 'ally' && targetUnit.team !== unit.team) return false;

    // 施法距离检查
    if (active.castRange && targetUnit.id !== unit.id) {
      if (edgeDist(unit, targetUnit) > active.castRange + 50) return false;
    }
  }

  // 扣除魔法与进入冷却
  if (manaCost > 0) unit.mana -= manaCost;
  if (active.cooldown > 0) {
    item.cooldownRemaining = active.cooldown;
  }

  // 广播事件
  world.events.emit({ type: 'itemUsed', unitId: unit.id, itemId: item.id });

  // 执行具体主动效果
  switch (item.id) {
    case 'blink_dagger': {
      let dest = target?.point ?? add(unit.pos, scale(fromAngle(unit.facing), 1200));
      const d = dist(unit.pos, dest);
      if (d > 1200) {
        dest = add(unit.pos, scale(normalize(sub(dest, unit.pos)), 1200));
      }
      blinkTo(world, unit, dest);
      break;
    }

    case 'black_king_bar': {
      dispel(world, unit, 'weak', 'debuffs');
      const uses = item.charges ?? 0;
      const duration = Math.max(7, 9 - uses);
      item.charges = uses + 1;
      addModifier(world, unit, MOD_BKB_ACTIVE, { sourceId: unit.id, duration });
      world.events.emit({ type: 'fx', kind: 'bkb_active', pos: { ...unit.pos }, unitId: unit.id, duration });
      break;
    }

    case 'blade_mail': {
      addModifier(world, unit, MOD_BLADE_MAIL_ACTIVE, { sourceId: unit.id, duration: 5.5 });
      world.events.emit({ type: 'fx', kind: 'blade_mail_active', pos: { ...unit.pos }, unitId: unit.id, duration: 5.5 });
      break;
    }

    case 'force_staff': {
      const tgt = targetUnit ?? unit;
      const dir = fromAngle(tgt.facing);
      startMotion(world, tgt, {
        kind: 'force_staff',
        sourceId: unit.id,
        to: add(tgt.pos, scale(dir, 600)),
        duration: 0.4,
        height: 0,
        disables: false,
      });
      world.events.emit({ type: 'fx', kind: 'force_staff', pos: { ...tgt.pos }, dir, unitId: tgt.id });
      break;
    }

    case 'euls_scepter': {
      const tgt = targetUnit ?? unit;
      if (tgt.team === unit.team) {
        dispel(world, tgt, 'weak', 'debuffs');
      } else {
        dispel(world, tgt, 'weak', 'buffs');
      }
      addModifier(world, tgt, MOD_EUL_CYCLONE, { sourceId: unit.id, duration: 2.5 });
      world.events.emit({ type: 'fx', kind: 'eul_cyclone', pos: { ...tgt.pos }, unitId: tgt.id, duration: 2.5 });
      break;
    }

    case 'phase_boots': {
      addModifier(world, unit, MOD_PHASE_BOOTS, { sourceId: unit.id, duration: 3.0 });
      break;
    }

    case 'power_treads': {
      const cur = item.selectedStat ?? 'str';
      item.selectedStat = cur === 'str' ? 'agi' : cur === 'agi' ? 'int' : 'str';
      recomputeStats(world, unit);
      break;
    }

    case 'arcane_boots': {
      for (const ally of alliesInRadius(world, unit.team, unit.pos, 1200)) {
        ally.mana = Math.min(ally.stats.maxMana, ally.mana + 175);
      }
      world.events.emit({ type: 'fx', kind: 'arcane_boots', pos: { ...unit.pos }, radius: 1200, unitId: unit.id });
      break;
    }

    case 'mekansm': {
      for (const ally of alliesInRadius(world, unit.team, unit.pos, 1200)) {
        heal(world, ally, 250);
        addModifier(world, ally, MOD_MEKANSM_ARMOR, { sourceId: unit.id, duration: 25.0 });
      }
      world.events.emit({ type: 'fx', kind: 'mekansm', pos: { ...unit.pos }, radius: 1200, unitId: unit.id });
      break;
    }

    case 'crimson_guard': {
      for (const ally of alliesInRadius(world, unit.team, unit.pos, 1200, { includeBuildings: true })) {
        addModifier(world, ally, MOD_CRIMSON_GUARD_ACTIVE, { sourceId: unit.id, duration: 7.0 });
      }
      world.events.emit({ type: 'fx', kind: 'crimson_guard', pos: { ...unit.pos }, radius: 1200, unitId: unit.id });
      break;
    }

    case 'pipe_of_insight': {
      for (const ally of alliesInRadius(world, unit.team, unit.pos, 1200)) {
        addShield(world, ally, {
          id: 'pipe_barrier',
          amount: 425,
          duration: 8.0,
          types: ['magical'],
          sourceId: unit.id,
        });
      }
      world.events.emit({ type: 'fx', kind: 'pipe_of_insight', pos: { ...unit.pos }, radius: 1200, unitId: unit.id });
      break;
    }

    case 'heaven_halberd': {
      if (targetUnit) {
        applyControl(world, targetUnit, 'disarm', { source: unit, duration: 3.5 });
      }
      break;
    }

    case 'shivas_guard': {
      for (const e of enemiesInRadius(world, unit.team, unit.pos, 900)) {
        applyDamage(world, {
          source: unit,
          target: e,
          amount: 225,
          type: 'magical',
          isAttack: false,
          abilityId: 'item_shivas_guard',
        });
        applySlow(world, e, {
          source: unit,
          duration: 4.0,
          key: 'shivas_guard',
          moveSlow: 0.40,
          attackSlow: 45,
        });
      }
      world.events.emit({ type: 'fx', kind: 'shivas_guard', pos: { ...unit.pos }, radius: 900, unitId: unit.id });
      break;
    }

    case 'satanic': {
      dispel(world, unit, 'weak', 'debuffs');
      addModifier(world, unit, MOD_SATANIC_ACTIVE, { sourceId: unit.id, duration: 6.0 });
      break;
    }

    case 'mask_of_madness': {
      addModifier(world, unit, MOD_MOM_ACTIVE, { sourceId: unit.id, duration: 6.0 });
      break;
    }

    case 'abyssal_blade': {
      if (targetUnit) {
        applyControl(world, targetUnit, 'stun', { source: unit, duration: 1.6, ignoreImmunity: true });
        applyDamage(world, {
          source: unit,
          target: targetUnit,
          amount: 120,
          type: 'physical',
          isAttack: false,
          abilityId: 'item_abyssal_blade',
        });
      }
      break;
    }

    case 'armlet_of_mordiggian': {
      const existing = findModifier(unit, MOD_ARMLET_ACTIVE.id);
      if (existing) {
        removeModifier(world, unit, existing);
      } else {
        addModifier(world, unit, MOD_ARMLET_ACTIVE, { sourceId: unit.id, duration: Infinity });
      }
      break;
    }

    case 'soul_ring': {
      unit.hp = Math.max(1, unit.hp - 170);
      unit.mana = Math.min(unit.stats.maxMana, unit.mana + 170);
      break;
    }

    case 'magic_stick':
    case 'magic_wand': {
      const charges = item.charges ?? 0;
      if (charges > 0) {
        item.charges = 0;
        heal(world, unit, charges * 15);
        unit.mana = Math.min(unit.stats.maxMana, unit.mana + charges * 15);
        world.events.emit({ type: 'fx', kind: 'wand_heal', pos: { ...unit.pos }, unitId: unit.id });
      }
      break;
    }

    case 'mjollnir': {
      const tgt = targetUnit ?? unit;
      addModifier(world, tgt, MOD_MJOLLNIR_SHIELD, { sourceId: unit.id, duration: 15.0 });
      break;
    }

    case 'tango': {
      addModifier(world, unit, MOD_TANGO, { sourceId: unit.id, duration: 16.0 });
      break;
    }

    case 'healing_salve': {
      const tgt = targetUnit ?? unit;
      addModifier(world, tgt, MOD_SALVE, { sourceId: unit.id, duration: 13.0 });
      break;
    }

    case 'clarity': {
      const tgt = targetUnit ?? unit;
      addModifier(world, tgt, MOD_CLARITY, { sourceId: unit.id, duration: 25.0 });
      break;
    }

    case 'faerie_fire': {
      heal(world, unit, 85);
      break;
    }

    case 'enchanted_mango': {
      unit.mana = Math.min(unit.stats.maxMana, unit.mana + 100);
      break;
    }

    default:
      break;
  }

  // 消耗品使用后扣减层数与清除空槽
  if (def.stackable || item.charges !== undefined) {
    if (item.id === 'tango' || item.id === 'healing_salve' || item.id === 'clarity' || item.id === 'faerie_fire' || item.id === 'enchanted_mango') {
      item.charges = (item.charges ?? 1) - 1;
      if (item.charges <= 0) {
        unit.inventory[slotIndex] = null;
        if (unit.hero) {
          unit.hero.itemValue = calculateInventoryValue(unit);
        }
        syncItemPassives(world, unit);
        recomputeStats(world, unit);
      }
    }
  }

  return true;
}

function calculateInventoryValue(unit: Unit): number {
  let val = 0;
  for (const it of unit.inventory) {
    if (it) val += it.costPaid;
  }
  return val;
}

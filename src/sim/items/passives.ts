import type { World } from '../world';
import type { Unit } from '../entities/unit';
import type { ModifierDef } from '../modifiers';
import { addModifier, findModifier, removeModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { applyCleave, type CleaveShape } from '../systems/cleave';
import { applyControl, applySlow } from '../status';
import { enemiesInRadius, nearestOf } from '../query';
import { prdRoll } from '../prd';
import { performAttack } from '../systems/attack';
import type { AbilityInstance } from '../heroes/types';

// ================= 辅助函数：连环闪电 =================

export function triggerChainLightning(
  world: World,
  attacker: Unit,
  initialTarget: Unit,
  damage: number,
  maxBounces: number,
  radius = 650
): void {
  const hit = new Set<number>([initialTarget.id]);
  applyDamage(world, {
    source: attacker,
    target: initialTarget,
    amount: damage,
    type: 'magical',
    isAttack: false,
    abilityId: 'item_chain_lightning',
  });
  world.events.emit({
    type: 'fx',
    kind: 'chain_lightning',
    pos: { x: attacker.pos.x, y: attacker.pos.y },
    dir: { x: initialTarget.pos.x - attacker.pos.x, y: initialTarget.pos.y - attacker.pos.y },
    radius,
    unitId: attacker.id,
    targetId: initialTarget.id,
  });

  let current = initialTarget;
  for (let b = 1; b < maxBounces; b++) {
    const candidates = enemiesInRadius(world, attacker.team, current.pos, radius, { includeBuildings: false }).filter(
      (u) => !hit.has(u.id) && u.alive && !u.hasState('invulnerable')
    );
    if (candidates.length === 0) break;
    const next = nearestOf(current.pos, candidates);
    if (!next) break;

    hit.add(next.id);
    applyDamage(world, {
      source: attacker,
      target: next,
      amount: damage,
      type: 'magical',
      isAttack: false,
      abilityId: 'item_chain_lightning',
    });
    world.events.emit({
      type: 'fx',
      kind: 'chain_lightning',
      pos: { x: current.pos.x, y: current.pos.y },
      dir: { x: next.pos.x - current.pos.x, y: next.pos.y - current.pos.y },
      radius,
      unitId: current.id,
      targetId: next.id,
    });
    current = next;
  }
}

// ================= 辅助函数：林肯法球法术抵挡 =================

export function tryTriggerLinkens(world: World, target: Unit, caster: Unit, ability: AbilityInstance): boolean {
  if (target.team === caster.team) return false;
  // 仅抵挡指向性技能
  if (ability.def.targetType !== 'unit') return false;

  const mod = findModifier(target, 'mod_item_linkens_sphere');
  if (!mod) return false;
  const cd = mod.data.cooldownRemaining ?? 0;
  if (cd > 0) return false;

  // 抵挡成功！进入 14 秒冷却
  mod.data.cooldownRemaining = 14.0;
  world.events.emit({
    type: 'fx',
    kind: 'linkens_block',
    pos: { x: target.pos.x, y: target.pos.y },
    unitId: target.id,
  });
  return true;
}

// ================= 减益 Modifier 模版 =================

export const MOD_BLIGHT_DEBUFF: ModifierDef = {
  id: 'mod_blight_debuff',
  name: '凋零',
  debuff: true,
  stats: { armor: -2 },
};

export const MOD_VENOM_DEBUFF: ModifierDef = {
  id: 'mod_venom_debuff',
  name: '淬毒',
  debuff: true,
  interval: 1.0,
  onInterval: (m, u, world) => {
    const src = m.sourceId ? (world.getUnit(m.sourceId) ?? null) : null;
    applyDamage(world, {
      source: src,
      target: u,
      amount: 12,
      type: 'magical',
      isAttack: false,
      abilityId: 'item_orb_of_venom',
    });
  },
};

export const MOD_FROST_DEBUFF: ModifierDef = {
  id: 'mod_frost_debuff',
  name: '寒霜',
  debuff: true,
  stats: { moveSpeedPct: -0.13, hpRegenAmp: -0.15 },
};

export const MOD_CORROSION_DEBUFF: ModifierDef = {
  id: 'mod_corrosion_debuff',
  name: '腐蚀',
  debuff: true,
  stats: { armor: -2, moveSpeedPct: -0.16, hpRegenAmp: -0.18 },
};

export const MOD_DESOLATOR_DEBUFF: ModifierDef = {
  id: 'mod_desolator_debuff',
  name: '腐蚀',
  debuff: true,
  stats: { armor: -6 },
};

export const MOD_RADIANCE_BURN: ModifierDef = {
  id: 'mod_radiance_burn',
  name: '辉耀灼烧',
  debuff: true,
  interval: 0.5,
  onInterval: (m, u, world) => {
    const src = m.sourceId ? (world.getUnit(m.sourceId) ?? null) : null;
    applyDamage(world, {
      source: src,
      target: u,
      amount: 30, // 60 dps
      type: 'magical',
      isAttack: false,
      abilityId: 'item_radiance_burn',
    });
  },
};

const BATTLE_FURY_SHAPE: CleaveShape = {
  startWidth: 150,
  endWidth: 360,
  length: 650,
};

// ================= 各物品被动 Modifier 定义 =================

export const ITEM_PASSIVE_MODIFIERS: Record<string, ModifierDef> = {
  quelling_blade: {
    id: 'mod_item_quelling_blade',
    onAttackStart: (_m, src, t, _w, atk) => {
      if (t.kind !== 'hero' && t.kind !== 'building') {
        atk.bonusDamage += src.isMelee ? 8 : 4;
      }
    },
  },

  orb_of_blight: {
    id: 'mod_item_orb_of_blight',
    onAttackLanded: (_m, _src, t, w) => {
      if (t.alive && !t.hasState('invulnerable')) {
        addModifier(w, t, MOD_BLIGHT_DEBUFF, { duration: 3.0 });
      }
    },
  },

  orb_of_venom: {
    id: 'mod_item_orb_of_venom',
    onAttackLanded: (_m, src, t, w) => {
      if (t.alive && !t.hasState('invulnerable')) {
        addModifier(w, t, MOD_VENOM_DEBUFF, { sourceId: src.id, duration: 3.0 });
      }
    },
  },

  orb_of_frost: {
    id: 'mod_item_orb_of_frost',
    onAttackLanded: (_m, _src, t, w) => {
      if (t.alive && !t.hasState('invulnerable')) {
        addModifier(w, t, MOD_FROST_DEBUFF, { duration: 3.0 });
      }
    },
  },

  orb_of_corrosion: {
    id: 'mod_item_orb_of_corrosion',
    onAttackLanded: (_m, _src, t, w) => {
      if (t.alive && !t.hasState('invulnerable')) {
        addModifier(w, t, MOD_CORROSION_DEBUFF, { duration: 3.0 });
      }
    },
  },

  desolator: {
    id: 'mod_item_desolator',
    onAttackLanded: (_m, _src, t, w) => {
      if (t.alive && !t.hasState('invulnerable')) {
        addModifier(w, t, MOD_DESOLATOR_DEBUFF, { duration: 7.0 });
      }
    },
  },

  crystalys: {
    id: 'mod_item_crystalys',
    onAttackStart: (m, _src, _t, w, atk) => {
      if (prdRoll(w, m.data, 'crit', 0.30)) {
        atk.critMult = Math.max(atk.critMult, 1.60);
      }
    },
  },

  daedalus: {
    id: 'mod_item_daedalus',
    onAttackStart: (m, _src, _t, w, atk) => {
      if (prdRoll(w, m.data, 'crit', 0.30)) {
        atk.critMult = Math.max(atk.critMult, 2.25);
      }
    },
  },

  javelin: {
    id: 'mod_item_javelin',
    onAttackStart: (_m, _src, _t, w, atk) => {
      if (w.rng.chance(0.25)) {
        atk.trueStrike = true;
        atk.flags.javelin = 1;
      }
    },
    onAttackLanded: (_m, src, t, w, info) => {
      if (info.attack?.flags.javelin && t.alive && !t.hasState('invulnerable')) {
        applyDamage(w, {
          source: src,
          target: t,
          amount: 60,
          type: 'magical',
          isAttack: false,
          abilityId: 'item_javelin',
        });
      }
    },
  },

  monkey_king_bar: {
    id: 'mod_item_monkey_king_bar',
    onAttackStart: (_m, _src, _t, w, atk) => {
      if (w.rng.chance(0.80)) {
        atk.trueStrike = true;
        atk.flags.mkb = 1;
      }
    },
    onAttackLanded: (_m, src, t, w, info) => {
      if (info.attack?.flags.mkb && t.alive && !t.hasState('invulnerable')) {
        applyDamage(w, {
          source: src,
          target: t,
          amount: 70,
          type: 'magical',
          isAttack: false,
          abilityId: 'item_monkey_king_bar',
        });
      }
    },
  },

  maelstrom: {
    id: 'mod_item_maelstrom',
    onAttackLanded: (m, src, t, w, info) => {
      if (info.isAttack && t.alive && prdRoll(w, m.data, 'chain', 0.25)) {
        triggerChainLightning(w, src, t, 110, 4);
      }
    },
  },

  mjollnir: {
    id: 'mod_item_mjollnir',
    onAttackLanded: (m, src, t, w, info) => {
      if (info.isAttack && t.alive && prdRoll(w, m.data, 'chain', 0.25)) {
        triggerChainLightning(w, src, t, 180, 12);
      }
    },
  },

  skull_basher: {
    id: 'mod_item_skull_basher',
    onTick: (m, _u, _w, dt) => {
      if (m.data.cd && m.data.cd > 0) m.data.cd = Math.max(0, m.data.cd - dt);
    },
    onAttackLanded: (m, src, t, w, info) => {
      if (!info.isAttack || !t.alive || (m.data.cd ?? 0) > 0 || t.kind === 'building') return;
      const chance = src.isMelee ? 0.25 : 0.10;
      if (prdRoll(w, m.data, 'bash', chance)) {
        m.data.cd = 2.3;
        applyControl(w, t, 'stun', { source: src, duration: 1.2 });
        applyDamage(w, {
          source: src,
          target: t,
          amount: 100,
          type: 'physical',
          isAttack: false,
          abilityId: 'item_skull_basher',
        });
      }
    },
  },

  abyssal_blade: {
    id: 'mod_item_abyssal_blade',
    onTick: (m, _u, _w, dt) => {
      if (m.data.cd && m.data.cd > 0) m.data.cd = Math.max(0, m.data.cd - dt);
    },
    onAttackLanded: (m, src, t, w, info) => {
      if (!info.isAttack || !t.alive || (m.data.cd ?? 0) > 0 || t.kind === 'building') return;
      const chance = src.isMelee ? 0.25 : 0.10;
      if (prdRoll(w, m.data, 'bash', chance)) {
        m.data.cd = 2.3;
        applyControl(w, t, 'stun', { source: src, duration: 1.2 });
        applyDamage(w, {
          source: src,
          target: t,
          amount: 120,
          type: 'physical',
          isAttack: false,
          abilityId: 'item_abyssal_blade',
        });
      }
    },
  },

  battle_fury: {
    id: 'mod_item_battle_fury',
    onAttackLanded: (_m, src, t, w, info) => {
      if (src.isMelee && t.kind !== 'building') {
        const raw = info.preMitigation ?? info.amount;
        const cleaveDamage = raw * (t.kind === 'hero' ? 0.60 : 0.40);
        applyCleave(w, src, t, cleaveDamage, BATTLE_FURY_SHAPE, 'item_battle_fury');
      }
    },
  },

  echo_sabre: {
    id: 'mod_item_echo_sabre',
    onTick: (m, _u, _w, dt) => {
      if (m.data.cd && m.data.cd > 0) m.data.cd = Math.max(0, m.data.cd - dt);
    },
    onAttackLanded: (m, src, t, w, info) => {
      if (!src.isMelee || !info.isAttack || (m.data.cd ?? 0) > 0 || !t.alive || t.kind === 'building') return;
      m.data.cd = 5.0;
      applySlow(w, t, { source: src, duration: 0.8, key: 'echo_sabre', moveSlow: 1.0, attackSlow: 100 });
      // 快速连击一次
      performAttack(w, src, t, { instant: true, noProcs: false });
    },
  },

  vanguard: {
    id: 'mod_item_vanguard',
    onIncomingDamage: (_m, u, w, info) => {
      if (info.isAttack && info.type === 'physical') {
        if (w.rng.chance(0.60)) {
          const block = u.isMelee ? 50 : 25;
          info.amount = Math.max(0, info.amount - block);
        }
      }
    },
  },

  crimson_guard: {
    id: 'mod_item_crimson_guard',
    onIncomingDamage: (_m, u, w, info) => {
      if (info.isAttack && info.type === 'physical') {
        if (w.rng.chance(0.60)) {
          const block = u.isMelee ? 75 : 50;
          info.amount = Math.max(0, info.amount - block);
        }
      }
    },
  },

  blade_mail: {
    id: 'mod_item_blade_mail',
    onAttacked: (_m, target, attacker, w, info) => {
      if (attacker && attacker.alive && !info.reflected && attacker.team !== target.team) {
        const dmg = 10 + (info.preMitigation ?? info.amount) * 0.15;
        applyDamage(w, {
          source: target,
          target: attacker,
          amount: dmg,
          type: 'physical',
          isAttack: false,
          reflected: true,
          noSpellAmp: true,
          abilityId: 'item_blade_mail_passive',
        });
      }
    },
  },

  linkens_sphere: {
    id: 'mod_item_linkens_sphere',
    onTick: (m, _u, _w, dt) => {
      if (m.data.cooldownRemaining && m.data.cooldownRemaining > 0) {
        m.data.cooldownRemaining = Math.max(0, m.data.cooldownRemaining - dt);
      }
    },
  },

  // ================= 光环类物品 =================

  buckler: {
    id: 'mod_item_buckler',
    aura: {
      radius: () => 1200,
      team: 'ally',
      includeSelf: true,
      includeBuildings: true,
      child: {
        id: 'mod_buckler_aura_child',
        name: '玄冥护甲光环',
        stats: { armor: 2 },
      },
    },
  },

  headdress: {
    id: 'mod_item_headdress',
    aura: {
      radius: () => 1200,
      team: 'ally',
      includeSelf: true,
      includeBuildings: false,
      child: {
        id: 'mod_headdress_aura_child',
        name: '回复光环',
        stats: { hpRegen: 2.0 },
      },
    },
  },

  ring_of_basilius: {
    id: 'mod_item_ring_of_basilius',
    aura: {
      radius: () => 1200,
      team: 'ally',
      includeSelf: true,
      includeBuildings: false,
      child: {
        id: 'mod_basilius_aura_child',
        name: '王者回蓝光环',
        stats: { manaRegen: 1.0 },
      },
    },
  },

  pipe_of_insight: {
    id: 'mod_item_pipe_of_insight',
    aura: {
      radius: () => 1200,
      team: 'ally',
      includeSelf: true,
      includeBuildings: false,
      child: {
        id: 'mod_pipe_aura_child',
        name: '洞察魔抗光环',
        stats: { magicResist: 0.08 },
      },
    },
  },

  assault_cuirass: {
    id: 'mod_item_assault_cuirass',
    aura: {
      radius: () => 1200,
      team: 'ally',
      includeSelf: true,
      includeBuildings: true,
      child: {
        id: 'mod_ac_ally_child',
        name: '强袭友军光环',
        stats: { attackSpeed: 30, armor: 5 },
      },
    },
  },

  assault_cuirass_enemy: {
    id: 'mod_item_assault_cuirass_enemy',
    aura: {
      radius: () => 1200,
      team: 'enemy',
      includeBuildings: true,
      child: {
        id: 'mod_ac_enemy_child',
        name: '强袭敌军减甲',
        debuff: true,
        stats: { armor: -5 },
      },
    },
  },

  shivas_guard: {
    id: 'mod_item_shivas_guard',
    aura: {
      radius: () => 1200,
      team: 'enemy',
      includeBuildings: false,
      child: {
        id: 'mod_shiva_aura_child',
        name: '希瓦减攻速光环',
        debuff: true,
        stats: { attackSpeed: -40 },
      },
    },
  },

  radiance: {
    id: 'mod_item_radiance',
    aura: {
      radius: () => 650,
      team: 'enemy',
      includeBuildings: false,
      child: MOD_RADIANCE_BURN,
    },
  },
};

/** 同步单位身上全部物品的被动 Modifier */
export function syncItemPassives(world: World, unit: Unit): void {
  // 收集单位背包中所有物品 id
  const itemIds = new Set<string>();
  for (const it of unit.inventory) {
    if (it) itemIds.add(it.id);
  }

  // 检查强袭胸甲的双光环映射
  if (itemIds.has('assault_cuirass')) {
    itemIds.add('assault_cuirass_enemy');
  }

  // 检查已挂载的物品 modifier：如果不再拥有则移除
  for (const [key, def] of Object.entries(ITEM_PASSIVE_MODIFIERS)) {
    const existing = findModifier(unit, def.id);
    const shouldHave = itemIds.has(key);
    if (shouldHave) {
      if (!existing) {
        addModifier(world, unit, def, { sourceId: unit.id, duration: Infinity });
      }
    } else if (existing) {
      removeModifier(world, unit, existing);
    }
  }
}

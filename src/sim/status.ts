import type { Unit } from './entities/unit';
import type { World } from './world';
import type { ModifierDef, ModifierInstance, UnitState } from './modifiers';
import { addModifier, findModifier } from './modifiers';
import { recomputeStats } from './stats';
import { cancelCast } from './systems/abilities';

export type ControlKind = 'stun' | 'root' | 'silence' | 'disarm' | 'break' | 'mute';

export interface ControlOpts {
  source: Unit | null;
  duration: number;
  /** 无视减益免疫（例如肢解） */
  ignoreImmunity?: boolean;
}

export interface SlowOpts {
  source: Unit | null;
  duration: number;
  /** 区分来源技能：同一个 key + 同一个来源刷新，不同 key 或不同来源叠加 */
  key: string;
  /** 0..1，0.3 = 减速 30%（受减速抗性影响） */
  moveSlow?: number;
  /** 攻速点数，100 = −100 攻速 */
  attackSlow?: number;
  /** 可选：同时削减魔抗（负数，例如 −0.1） */
  magicResist?: number;
  ignoreImmunity?: boolean;
}

export const CONTROL_NAMES: Record<ControlKind | 'fear' | 'slow', string> = {
  stun: '眩晕', root: '缠绕', silence: '沉默', disarm: '缴械', break: '破坏', mute: '禁用物品', fear: '恐惧', slow: '减速',
};

const CONTROL_STATE: Record<ControlKind, UnitState> = {
  stun: 'stunned', root: 'rooted', silence: 'silenced', disarm: 'disarmed', break: 'breakPassives', mute: 'muted',
};

const controlDef = (kind: ControlKind): ModifierDef => ({
  id: `status_${kind}`, name: CONTROL_NAMES[kind], debuff: true, keepLonger: true,
  // 眩晕只能被强驱散，其余控制弱驱散即可
  dispel: kind === 'stun' ? 'strong' : 'weak',
  states: [CONTROL_STATE[kind]],
});

export const CONTROL_DEFS: Record<ControlKind, ModifierDef> = {
  stun: controlDef('stun'), root: controlDef('root'), silence: controlDef('silence'),
  disarm: controlDef('disarm'), break: controlDef('break'), mute: controlDef('mute'),
};

/** 同类控制不叠加：已有时取剩余时间更长的一个（keepLonger）。眩晕只能被强驱散。 */
export function applyControl(world: World, target: Unit, kind: ControlKind, o: ControlOpts): ModifierInstance | null {
  return addModifier(world, target, CONTROL_DEFS[kind], {
    sourceId: o.source?.id ?? null, duration: o.duration, ignoreImmunity: o.ignoreImmunity,
  });
}

const slowDefs = new Map<string, ModifierDef>();

/** 减速 Modifier 按 key 懒创建并缓存（id `slow_<key>`，按来源区分） */
export function slowDef(key: string): ModifierDef {
  let d = slowDefs.get(key);
  if (!d) {
    d = {
      id: `slow_${key}`, name: CONTROL_NAMES.slow, debuff: true, dispel: 'weak', perSource: true,
      stats: (m) => ({ moveSpeedPct: -(m.data.ms ?? 0), attackSpeed: -(m.data.as ?? 0), magicResist: m.data.mr ?? 0 }),
    };
    slowDefs.set(key, d);
  }
  return d;
}

export function applySlow(world: World, target: Unit, o: SlowOpts): ModifierInstance | null {
  return addModifier(world, target, slowDef(o.key), {
    sourceId: o.source?.id ?? null, duration: o.duration, ignoreImmunity: o.ignoreImmunity,
    data: { ms: o.moveSlow ?? 0, as: o.attackSlow ?? 0, mr: o.magicResist ?? 0 },
  });
}

export const FEAR: ModifierDef = {
  id: 'status_fear', name: CONTROL_NAMES.fear, debuff: true, dispel: 'weak', fear: true, keepLonger: true,
};

/** 恐惧：远离来源移动、不能下指令。addUpTo：在剩余时间上累加，最多到这个上限（魂之挽歌每道 +0.6 秒，上限 2.15 秒） */
export function applyFear(world: World, target: Unit, o: ControlOpts & { addUpTo?: number }): ModifierInstance | null {
  if (!target.alive) return null;
  if (target.stats.states.has('debuffImmune') && !o.ignoreImmunity) return null;
  const sourceId = o.source?.id ?? null;
  const existing = findModifier(target, FEAR.id);
  let inst: ModifierInstance | null;
  if (existing && o.addUpTo !== undefined) {
    const add = o.duration * (1 - target.stats.statusResist);
    existing.duration = Math.max(existing.duration, Math.min(o.addUpTo, existing.duration + add));
    existing.total = Math.max(existing.total, existing.duration);
    existing.sourceId = sourceId;
    recomputeStats(world, target);
    inst = existing;
  } else {
    const duration = o.addUpTo !== undefined ? Math.min(o.addUpTo, o.duration) : o.duration;
    inst = addModifier(world, target, FEAR, { sourceId, duration, ignoreImmunity: o.ignoreImmunity });
  }
  if (inst) {
    // 恐惧打断施法并清空原有指令（包括回城）
    if (target.cast) cancelCast(world, target, true);
    target.order = { kind: 'idle' };
    target.attack.windup = -1;
  }
  return inst;
}

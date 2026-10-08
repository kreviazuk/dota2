import type { Unit } from './entities/unit';
import type { World } from './world';
import type { DamageInfo } from './systems/damage';
import type { AttackInfo } from './systems/attack';
import type { ComputedStats } from './stats';
import { recomputeStats } from './stats';

export type UnitState =
  | 'stunned' | 'silenced' | 'rooted' | 'disarmed' | 'muted' | 'invulnerable' | 'debuffImmune'
  | 'untargetable' | 'hidden' | 'phased' | 'breakPassives'
  /** 自身技能占用（无敌斩、出钩）：移动 / 攻击 / 施法 / 回城指令无效，不出手、不移动 */
  | 'busy';

export interface StatBonus {
  str?: number; agi?: number; int?: number; allStats?: number;
  maxHp?: number; hpRegen?: number; hpRegenAmp?: number;
  maxMana?: number; manaRegen?: number; manaRegenAmp?: number;
  armor?: number;
  /** 魔抗来源（0–1），多个来源乘算 */
  magicResist?: number;
  bonusDamage?: number; baseDamagePct?: number;
  attackSpeed?: number; attackRange?: number;
  moveSpeed?: number;
  /** 百分比移速（-0.3 = 减速 30%） */
  moveSpeedPct?: number;
  evasion?: number; lifesteal?: number; spellAmp?: number; spellLifesteal?: number;
  castRange?: number; statusResist?: number; slowResist?: number;
  /** 施法速度（加法叠加）：0.3 = 施法前摇 ÷ 1.3 */
  castSpeed?: number;
}

export interface ModifierInstance {
  def: ModifierDef;
  sourceId: number | null;
  abilityLevel: number;
  duration: number;
  total: number;
  stacks: number;
  intervalTimer: number;
  data: Record<string, number>;
}

type Hook<A extends unknown[]> = (m: ModifierInstance, ...args: A) => void;

export interface ModifierDef {
  id: string;
  name?: string;
  debuff?: boolean;
  /** 哪一级驱散能移除它：weak（弱驱散即可）/ strong（只有强驱散）/ none（不可驱散）。缺省 weak */
  dispel?: 'weak' | 'strong' | 'none';
  /** refresh：同 id 只保留一个并刷新时间；independent：每次独立；stacks：叠层并刷新时间 */
  stacking?: 'refresh' | 'independent' | 'stacks';
  /** refresh/stacks 时按来源区分 */
  perSource?: boolean;
  maxStacks?: number;
  /** 刷新时取剩余时间和新时长中更长的一个（控制状态：同类不叠加，长的生效） */
  keepLonger?: boolean;
  persistOnDeath?: boolean;
  hidden?: boolean;
  states?: UnitState[];
  taunt?: boolean;
  fear?: boolean;
  /** 静态加成在 stacking=stacks 时乘以层数；函数形式自行处理层数 */
  stats?: StatBonus | ((m: ModifierInstance, owner: Unit, world: World) => StatBonus);
  /** 第二轮属性：可以读取第一轮算出的面板（例如斧王一人之军按护甲加力量） */
  lateStats?: (m: ModifierInstance, owner: Unit, world: World, s: ComputedStats) => { str?: number; agi?: number; int?: number };
  /** 第三轮：面板全部算完后直接修改 s（神之愤怒按力量加攻击力）；改护甲时同时改 bonusArmor */
  finalStats?: (m: ModifierInstance, owner: Unit, world: World, s: ComputedStats) => void;
  interval?: number;
  onInterval?: Hook<[owner: Unit, world: World]>;
  onTick?: Hook<[owner: Unit, world: World, dt: number]>;
  onApply?: Hook<[owner: Unit, world: World]>;
  onRemove?: Hook<[owner: Unit, world: World]>;
  /** owner 是攻击者：出手时（可以设置暴击） */
  onAttackStart?: Hook<[owner: Unit, target: Unit, world: World, atk: AttackInfo]>;
  /** owner 是攻击者：攻击命中并结算伤害后（info.attack 一定存在；noProcs 的攻击不调用） */
  onAttackLanded?: Hook<[owner: Unit, target: Unit, world: World, info: DamageInfo]>;
  /** owner 是被攻击者：被攻击命中并结算伤害后 */
  onAttacked?: Hook<[owner: Unit, attacker: Unit, world: World, info: DamageInfo]>;
  /** owner 是受伤者：减免后、扣血前，可修改 info.amount（护盾、格挡） */
  onIncomingDamage?: Hook<[owner: Unit, world: World, info: DamageInfo]>;
  /** owner 是伤害来源：减免之前调用（info.preMitigation 已写入）。可以自己再调用 applyDamage（注意用 abilityId 防止递归）；目标在钩子里死亡则这次伤害作废 */
  onBeforeDealDamage?: Hook<[owner: Unit, target: Unit, world: World, info: DamageInfo]>;
  /** owner 是伤害来源：扣血后 */
  onDealtDamage?: Hook<[owner: Unit, target: Unit, world: World, info: DamageInfo]>;
  onKill?: Hook<[owner: Unit, victim: Unit, world: World]>;
  onDeath?: Hook<[owner: Unit, killer: Unit | null, world: World]>;
  onAbilityCast?: Hook<[owner: Unit, abilityId: string, world: World]>;
}

export interface AddModifierOpts {
  sourceId?: number | null;
  duration?: number;
  abilityLevel?: number;
  stacks?: number;
  data?: Record<string, number>;
  ignoreImmunity?: boolean;
}

export function findModifier(u: Unit, id: string, sourceId?: number | null): ModifierInstance | undefined {
  return u.modifiers.find((m) => m.def.id === id && (sourceId === undefined || m.sourceId === sourceId));
}

export function addModifier(world: World, target: Unit, def: ModifierDef, opts: AddModifierOpts = {}): ModifierInstance | null {
  if (!target.alive && !def.persistOnDeath) return null;
  if (def.debuff && target.stats.states.has('debuffImmune') && !opts.ignoreImmunity) return null;
  let duration = opts.duration ?? Infinity;
  if (def.debuff && Number.isFinite(duration)) duration *= 1 - target.stats.statusResist;
  const sourceId = opts.sourceId ?? null;
  const stacking = def.stacking ?? 'refresh';
  if (stacking !== 'independent') {
    const existing = target.modifiers.find((m) => m.def.id === def.id && (!def.perSource || m.sourceId === sourceId));
    if (existing) {
      if (def.keepLonger && existing.duration >= duration) {
        if (stacking === 'stacks') existing.stacks = Math.min(def.maxStacks ?? Infinity, existing.stacks + (opts.stacks ?? 1));
        recomputeStats(world, target);
        return existing;
      }
      if (stacking === 'stacks') existing.stacks = Math.min(def.maxStacks ?? Infinity, existing.stacks + (opts.stacks ?? 1));
      existing.duration = duration;
      existing.total = duration;
      existing.sourceId = sourceId;
      if (opts.abilityLevel !== undefined) existing.abilityLevel = opts.abilityLevel;
      if (opts.data) Object.assign(existing.data, opts.data);
      recomputeStats(world, target);
      return existing;
    }
  }
  const inst: ModifierInstance = {
    def,
    sourceId,
    abilityLevel: opts.abilityLevel ?? 1,
    duration,
    total: duration,
    stacks: Math.min(def.maxStacks ?? Infinity, opts.stacks ?? 1),
    intervalTimer: def.interval ?? 0,
    data: { ...(opts.data ?? {}) },
  };
  target.modifiers.push(inst);
  def.onApply?.(inst, target, world);
  recomputeStats(world, target);
  return inst;
}

export function removeModifier(world: World, u: Unit, m: ModifierInstance): void {
  const i = u.modifiers.indexOf(m);
  if (i < 0) return;
  u.modifiers.splice(i, 1);
  m.def.onRemove?.(m, u, world);
  recomputeStats(world, u);
}

export function tickModifiers(world: World, u: Unit, dt: number): void {
  for (const m of u.modifiers.slice()) {
    if (!u.modifiers.includes(m)) continue;
    m.def.onTick?.(m, u, world, dt);
    const interval = m.def.interval;
    if (interval && m.def.onInterval) {
      m.intervalTimer -= dt;
      while (m.intervalTimer <= 1e-6 && u.modifiers.includes(m)) {
        m.def.onInterval(m, u, world);
        m.intervalTimer += interval;
      }
    }
    if (m.duration !== Infinity && u.modifiers.includes(m)) {
      m.duration -= dt;
      if (m.duration <= 1e-6) removeModifier(world, u, m);
    }
  }
}

export function dispel(world: World, u: Unit, strength: 'weak' | 'strong', which: 'debuffs' | 'buffs'): void {
  for (const m of u.modifiers.slice()) {
    if (!!m.def.debuff !== (which === 'debuffs')) continue;
    const d = m.def.dispel ?? 'weak';
    if (d === 'none' || (d === 'strong' && strength !== 'strong')) continue;
    removeModifier(world, u, m);
  }
}

export function removeModifiersOnDeath(world: World, u: Unit): void {
  for (const m of u.modifiers.slice()) if (!m.def.persistOnDeath) removeModifier(world, u, m);
}

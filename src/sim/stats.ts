import type { Unit } from './entities/unit';
import type { World } from './world';
import type { StatBonus, UnitState } from './modifiers';
import { attackInterval, clamp, combineMultiplicative, scaledAttackPoint } from './formulas';

export interface ComputedStats {
  str: number; agi: number; int: number;
  maxHp: number; hpRegen: number; maxMana: number; manaRegen: number;
  armor: number; magicResist: number;
  damageMin: number; damageMax: number; bonusDamage: number;
  attackSpeed: number; attackInterval: number; attackPoint: number; attackRange: number;
  moveSpeed: number;
  evasion: number; lifesteal: number; spellAmp: number; spellLifesteal: number;
  castRangeBonus: number; statusResist: number; slowResist: number;
  /** 施法速度：施法前摇 ÷ (1 + castSpeed) */
  castSpeed: number;
  states: Set<UnitState>;
  tauntedBy: number | null;
  fearedBy: number | null;
}

export const emptyStats = (): ComputedStats => ({
  str: 0, agi: 0, int: 0, maxHp: 0, hpRegen: 0, maxMana: 0, manaRegen: 0, armor: 0, magicResist: 0,
  damageMin: 0, damageMax: 0, bonusDamage: 0, attackSpeed: 100, attackInterval: 1, attackPoint: 0, attackRange: 0,
  moveSpeed: 0, evasion: 0, lifesteal: 0, spellAmp: 0, spellLifesteal: 0, castRangeBonus: 0, statusResist: 0,
  slowResist: 0, castSpeed: 0, states: new Set(), tauntedBy: null, fearedBy: null,
});

const ADD_KEYS = [
  'str', 'agi', 'int', 'allStats', 'maxHp', 'hpRegen', 'hpRegenAmp', 'maxMana', 'manaRegen', 'manaRegenAmp', 'armor',
  'bonusDamage', 'baseDamagePct', 'attackSpeed', 'attackRange', 'moveSpeed', 'lifesteal', 'spellAmp', 'spellLifesteal',
  'castRange', 'slowResist', 'castSpeed',
] as const;
type AddKey = (typeof ADD_KEYS)[number];

interface Acc {
  flat: Record<AddKey, number>;
  mr: number[];
  evasion: number[];
  statusResist: number[];
  msPos: number;
  msNeg: number;
}

const newAcc = (): Acc => ({
  flat: Object.fromEntries(ADD_KEYS.map((k) => [k, 0])) as Record<AddKey, number>,
  mr: [], evasion: [], statusResist: [], msPos: 0, msNeg: 0,
});

function addBonus(acc: Acc, b: StatBonus, mult: number): void {
  for (const k of ADD_KEYS) {
    const v = b[k];
    if (v) acc.flat[k] += v * mult;
  }
  if (b.magicResist) acc.mr.push(clamp(b.magicResist * mult, -1, 1));
  if (b.evasion) acc.evasion.push(b.evasion);
  if (b.statusResist) acc.statusResist.push(b.statusResist);
  if (b.moveSpeedPct) {
    const v = b.moveSpeedPct * mult;
    if (v > 0) acc.msPos += v;
    else acc.msNeg += v;
  }
}

function derive(world: World, u: Unit, s: ComputedStats, acc: Acc, str: number, agi: number, int: number): void {
  const hb = world.balance.hero;
  const h = u.hero;
  const f = acc.flat;
  s.str = str; s.agi = agi; s.int = int;
  s.maxHp = u.base.maxHp + (h ? str * hb.hpPerStr : 0) + f.maxHp;
  s.hpRegen = (u.base.hpRegen + (h ? str * hb.hpRegenPerStr : 0) + f.hpRegen) * (1 + f.hpRegenAmp);
  s.maxMana = u.base.maxMana + (h ? int * hb.manaPerInt : 0) + f.maxMana;
  s.manaRegen = (u.base.manaRegen + (h ? int * hb.manaRegenPerInt : 0) + f.manaRegen) * (1 + f.manaRegenAmp);
  s.armor = u.base.armor + (h ? agi * hb.armorPerAgi : 0) + f.armor;
  const baseMr = h ? u.base.magicResist + int * hb.magicResistPerInt : u.base.magicResist;
  s.magicResist = combineMultiplicative([baseMr, ...acc.mr]);
  const primary = h ? (h.attrs.primary === 'str' ? str : h.attrs.primary === 'agi' ? agi : int) : 0;
  const dmgMult = 1 + f.baseDamagePct;
  s.damageMin = (u.base.damageMin + primary) * dmgMult;
  s.damageMax = (u.base.damageMax + primary) * dmgMult;
  s.bonusDamage = f.bonusDamage;
  s.attackSpeed = u.base.attackSpeed + (h ? agi * hb.attackSpeedPerAgi : 0) + f.attackSpeed;
  s.attackInterval = attackInterval(u.base.bat, s.attackSpeed);
  s.attackPoint = scaledAttackPoint(u.base.attackPoint, s.attackSpeed);
  s.attackRange = u.base.attackRange + f.attackRange;
}

export function recomputeStats(world: World, u: Unit): void {
  const hb = world.balance.hero;
  const acc = newAcc();
  const states = new Set<UnitState>(u.baseStates);
  let tauntedBy: number | null = null;
  let fearedBy: number | null = null;
  for (const m of u.modifiers) {
    const d = m.def;
    if (d.states) for (const st of d.states) states.add(st);
    if (d.taunt) tauntedBy = m.sourceId;
    if (d.fear) fearedBy = m.sourceId;
    if (d.stats) {
      if (typeof d.stats === 'function') addBonus(acc, d.stats(m, u, world), 1);
      else addBonus(acc, d.stats, d.stacking === 'stacks' ? m.stacks : 1);
    }
  }
  const s = u.stats;
  const oldMaxHp = s.maxHp;
  const oldMaxMana = s.maxMana;
  s.states = states;
  s.tauntedBy = tauntedBy;
  s.fearedBy = fearedBy;

  let str = 0, agi = 0, int = 0;
  const h = u.hero;
  if (h) {
    const lv = h.level - 1;
    const bonus = h.attributeBonusLevel * hb.attributeBonusPerPoint + acc.flat.allStats;
    str = h.attrs.str[0] + h.attrs.str[1] * lv + bonus + acc.flat.str;
    agi = h.attrs.agi[0] + h.attrs.agi[1] * lv + bonus + acc.flat.agi;
    int = h.attrs.int[0] + h.attrs.int[1] * lv + bonus + acc.flat.int;
  }
  derive(world, u, s, acc, str, agi, int);
  let ds = 0, da = 0, di = 0;
  for (const m of u.modifiers) {
    if (!m.def.lateStats) continue;
    const r = m.def.lateStats(m, u, world, s);
    ds += r.str ?? 0; da += r.agi ?? 0; di += r.int ?? 0;
  }
  if (ds || da || di) derive(world, u, s, acc, str + ds, agi + da, int + di);

  s.slowResist = clamp(acc.flat.slowResist, 0, 1);
  const pct = acc.msPos + acc.msNeg * (1 - s.slowResist);
  s.moveSpeed =
    u.base.moveSpeed <= 0 ? 0 : clamp((u.base.moveSpeed + acc.flat.moveSpeed) * (1 + pct), hb.minMoveSpeed, hb.maxMoveSpeed);
  s.evasion = combineMultiplicative(acc.evasion);
  s.statusResist = combineMultiplicative(acc.statusResist);
  s.lifesteal = acc.flat.lifesteal;
  s.spellAmp = acc.flat.spellAmp;
  s.spellLifesteal = acc.flat.spellLifesteal;
  s.castRangeBonus = acc.flat.castRange;
  s.castSpeed = acc.flat.castSpeed;

  if (oldMaxHp > 0 && s.maxHp !== oldMaxHp && u.alive) u.hp = (u.hp / oldMaxHp) * s.maxHp;
  if (oldMaxMana > 0 && s.maxMana !== oldMaxMana) u.mana = (u.mana / oldMaxMana) * s.maxMana;
  if (u.hp > s.maxHp) u.hp = s.maxHp;
  if (u.mana > s.maxMana) u.mana = s.maxMana;
}

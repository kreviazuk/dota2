import type { Vec2 } from '../core/vec2';
import { copy } from '../core/vec2';
import { Team } from '../core/types';
import type { AbilitySlot, ArmorClass, AttackClass, Attribute, UnitKind } from '../core/types';
import type { ModifierInstance, UnitState } from '../modifiers';
import type { ComputedStats } from '../stats';
import { emptyStats } from '../stats';
import type { AbilityInstance, CastState, ResolvedTarget } from '../heroes/types';
import type { ForcedMotion } from '../systems/motion';
import type { SummonState } from '../systems/summons';

export interface UnitBase {
  maxHp: number;
  hpRegen: number;
  maxMana: number;
  manaRegen: number;
  armor: number;
  magicResist: number;
  damageMin: number;
  damageMax: number;
  bat: number;
  attackSpeed: number;
  attackPoint: number;
  attackRange: number;
  /** 0 = 近战（命中立即结算） */
  projectileSpeed: number;
  moveSpeed: number;
  acquireRange: number;
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'moveDir'; dir: Vec2 }
  | { kind: 'moveTo'; point: Vec2 }
  | { kind: 'attack'; targetId: number; persistent: boolean }
  | { kind: 'cast'; ability: AbilityInstance; target: ResolvedTarget }
  | { kind: 'recall'; remaining: number; startedAt: number };

export interface HeroAttrs {
  primary: Attribute;
  str: [number, number];
  agi: [number, number];
  int: [number, number];
}

export interface HeroState {
  heroId: string;
  attrs: HeroAttrs;
  level: number;
  xp: number;
  gold: number;
  skillPoints: number;
  attributeBonusLevel: number;
  /** 10/15/20/25 级天赋的选择（0 左 / 1 右 / null 未选） */
  talents: (0 | 1 | null)[];
  /** key = `${abilityId}.${valueKey}` */
  talentValueBonus: Record<string, number>;
  /** key = `${abilityId}.${valueKey}`，缺省 1 */
  talentValueMult: Record<string, number>;
  respawnTimer: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  streak: number;
  playerControlled: boolean;
  lastDamagedTime: number;
  creepAggroCd: number;
  /** 物品总价值（P3 物品系统接入前恒为 0） */
  itemValue: number;
  /** 对敌方实际造成的伤害（含技能，按扣掉的生命计，不含溢出） */
  damageDealt: { heroes: number; creeps: number; buildings: number };
}

export const newHeroState = (heroId: string, attrs: HeroAttrs, playerControlled: boolean, gold: number): HeroState => ({
  heroId, attrs, level: 1, xp: 0, gold, skillPoints: 1, attributeBonusLevel: 0, talents: [null, null, null, null],
  talentValueBonus: {}, talentValueMult: {}, respawnTimer: 0, kills: 0, deaths: 0, assists: 0, lastHits: 0, streak: 0, playerControlled,
  lastDamagedTime: -999, creepAggroCd: 0, itemValue: 0, damageDealt: { heroes: 0, creeps: 0, buildings: 0 },
});

export type CreepType = 'melee' | 'ranged' | 'siege' | 'superMelee' | 'superRanged';

export interface CreepState {
  type: CreepType | 'elite';
  laneOffset: number;
  aggroTargetId: number | null;
  aggroUntil: number;
  /** 两边第一波兵接触前：不受英雄仇恨和嘲讽影响 */
  protectedUntilContact: boolean;
}

export interface BuildingState {
  type: 'tower' | 'ancient' | 'fountain';
  tier: number;
  key: string;
  prereqIds: number[];
  forcedTargetId: number | null;
  forcedUntil: number;
  goldTeam: number;
  goldLastHit: number;
}

export interface UnitInit {
  id: number;
  kind: UnitKind;
  team: Team;
  defId: string;
  name: string;
  pos: Vec2;
  radius: number;
  base: UnitBase;
  attackClass: AttackClass;
  armorClass: ArmorClass;
  bounty?: { gold: number; xp: number };
}

export class Unit {
  readonly id: number;
  readonly kind: UnitKind;
  readonly team: Team;
  readonly defId: string;
  name: string;
  pos: Vec2;
  prevPos: Vec2;
  facing: number;
  radius: number;
  base: UnitBase;
  attackClass: AttackClass;
  armorClass: ArmorClass;
  hp: number;
  mana: number;
  alive = true;
  removed = false;
  deathTime = -1;
  modifiers: ModifierInstance[] = [];
  stats: ComputedStats = emptyStats();
  order: Order = { kind: 'idle' };
  attack: { targetId: number | null; windup: number; cooldown: number } = { targetId: null, windup: -1, cooldown: 0 };
  cast: CastState | null = null;
  /** 强制位移（击退、拖拽、跳跃……）；不为 null 时不按指令移动 */
  motion: ForcedMotion | null = null;
  abilities: AbilityInstance[] = [];
  bounty: { gold: number; xp: number };
  baseStates = new Set<UnitState>();
  lastHeroDamage: { heroId: number; time: number } | null = null;
  heroDamageTimes = new Map<number, number>();
  autoAttack = true;
  hero?: HeroState;
  creep?: CreepState;
  building?: BuildingState;
  /** kind = 'summon' 的单位：主人、到期时间、按次数死亡、跟随 */
  summon?: SummonState;

  constructor(i: UnitInit) {
    this.id = i.id;
    this.kind = i.kind;
    this.team = i.team;
    this.defId = i.defId;
    this.name = i.name;
    this.pos = copy(i.pos);
    this.prevPos = copy(i.pos);
    this.radius = i.radius;
    this.base = i.base;
    this.attackClass = i.attackClass;
    this.armorClass = i.armorClass;
    this.hp = i.base.maxHp;
    this.mana = i.base.maxMana;
    this.bounty = i.bounty ?? { gold: 0, xp: 0 };
    this.facing = i.team === Team.Radiant ? -Math.PI / 2 : Math.PI / 2;
  }

  hasState(s: UnitState): boolean {
    return this.stats.states.has(s);
  }

  get isMelee(): boolean {
    return this.base.projectileSpeed <= 0;
  }

  ability(slot: AbilitySlot | 'innate'): AbilityInstance | undefined {
    return this.abilities.find((a) => a.def.slot === slot);
  }
}

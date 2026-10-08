import type { AbilityDef, AbilityInstance, HeroDef, ResolvedTarget } from './types';
import type { ModifierDef } from '../modifiers';
import type { Unit } from '../entities/unit';
import type { World } from '../world';
import { addModifier, findModifier } from '../modifiers';
import { applyDamage } from '../systems/damage';
import { rollAttackDamage } from '../systems/attack';
import { abilityValue } from '../systems/abilities';
import { spawnProjectile } from '../systems/projectiles';
import { applyFear, applySlow } from '../status';
import { enemiesInRadius, isHiddenFrom } from '../query';
import { recomputeStats } from '../stats';
import { add, copy, dist, fromAngle, normalize, scale, sub } from '../core/vec2';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));

// ---------- 先天 支配死灵（灵魂） ----------
const NECRO_ID = 'sf_necromastery';

/** 当前灵魂数（支配死灵 Modifier 的 data.souls） */
export const getSouls = (u: Unit): number => findModifier(u, NECRO_ID)?.data.souls ?? 0;

/** 设置灵魂数（不受上限限制，灵魂盛宴可以超过上限）；给了 world 时立即重算属性 */
export function setSouls(u: Unit, n: number, world?: World): void {
  const m = findModifier(u, NECRO_ID);
  if (!m) return;
  m.data.souls = Math.max(0, Math.floor(n));
  if (world) recomputeStats(world, u);
}

/** 支配死灵的数值（含天赋）；没有这个先天技能时 0 */
const necroValue = (u: Unit, key: string): number => {
  const ab = u.ability('innate');
  return ab && ab.def.id === NECRO_ID ? abilityValue(u, ab, key) : 0;
};

const maxSouls = (u: Unit): number => necroValue(u, 'maxSouls');

// ---------- R 魂之挽歌（施放和死亡时共用） ----------
/**
 * 放出 n 道魂之挽歌：从面向开始按 360° / n 均匀分布的直线穿透弹道，速度 / 射程 / 宽度读 R 的数值；
 * 命中敌方非建筑单位造成魔法伤害；withFear 时再恐惧（累加到上限）并按恐惧的剩余时间减速、降低魔抗。
 * 死亡时的魂之挽歌不带恐惧和减速（D23）。数值在放出时确定。
 */
export function releaseRequiem(world: World, sf: Unit, ab: AbilityInstance, n: number, withFear: boolean): void {
  const v = (k: string): number => abilityValue(sf, ab, k);
  const damage = v('damage');
  const distance = v('distance');
  const w0 = v('startWidth');
  const w1 = v('endWidth');
  const speed = v('speed');
  const fearPerLine = v('fearPerLine');
  const fearCap = v('fearCap');
  const slow = v('slow');
  const magicResist = v('magicResist');
  const count = Math.max(0, Math.floor(n));
  for (let i = 0; i < count; i++) {
    const dir = fromAngle(sf.facing + (i * Math.PI * 2) / count);
    spawnProjectile(world, {
      team: sf.team, sourceId: sf.id, pos: copy(sf.pos), speed, kind: 'linear', dir, maxDistance: distance,
      width: w0 / 2, pierce: true, visual: 'sf_requiem_line',
      // 碰撞半径随飞行距离从 125/2 变宽到 300/2
      update: (_w, p) => {
        p.width = lerp(w0, w1, p.traveled / distance) / 2;
        return false;
      },
      onHit: (w, t) => {
        applyDamage(w, { source: sf, target: t, amount: damage, type: 'magical', isAttack: false, abilityId: 'sf_requiem' });
        if (!withFear || !t.alive) return;
        const fear = applyFear(w, t, { source: sf, duration: fearPerLine, addUpTo: fearCap });
        if (!fear) return;
        // 减速和魔抗削减跟恐惧同时结束（恐惧的剩余时间已经按状态抗性缩短过，这里先放大回去）
        const sr = t.stats.statusResist;
        applySlow(w, t, {
          source: sf, key: 'sf_requiem', duration: fear.duration / Math.max(0.01, 1 - sr), moveSlow: slow, magicResist: -magicResist,
        });
      },
    });
  }
  world.events.emit({ type: 'fx', kind: 'sf_requiem', pos: copy(sf.pos), radius: distance, unitId: sf.id });
}

// ---------- Q 毁灭阴影 ----------
/** 连中层数：每个影魔分开算，6 秒内再被毁灭阴影命中时每层加伤害 */
const RAZE_STACK: ModifierDef = { id: 'sf_raze_stack', name: '毁灭阴影', debuff: true, stacking: 'stacks', perSource: true };

/**
 * 轻点：朝 700 + 250 内最近的看得见的敌方英雄（没有就朝面向），在三档里选与它的距离之差 ≤ 250 + 英雄半径、且差最小的一档；
 * 都打不中按中间一档（450）。设计文档 §6.3
 */
function razeSmartTarget(world: World, caster: Unit, ab: AbilityInstance): ResolvedTarget {
  const steps = ab.def.pointSnap ?? [450];
  const radius = abilityValue(caster, ab, 'radius');
  const reach = Math.max(...steps) + radius;
  let hero: Unit | null = null;
  let hd = Infinity;
  for (const h of enemiesInRadius(world, caster.team, caster.pos, reach, { heroesOnly: true })) {
    if (isHiddenFrom(h, caster.team)) continue;
    const d = dist(caster.pos, h.pos);
    if (d < hd) {
      hd = d;
      hero = h;
    }
  }
  let step = steps[Math.floor(steps.length / 2)];
  let dir = fromAngle(caster.facing);
  if (hero) {
    if (hd > 1e-6) dir = normalize(sub(hero.pos, caster.pos));
    let best = Infinity;
    for (const s of steps) {
      const diff = Math.abs(hd - s);
      if (diff <= radius + hero.radius && diff < best) {
        best = diff;
        step = s;
      }
    }
  }
  return { point: add(caster.pos, scale(dir, step)) };
}

const shadowraze: AbilityDef = {
  id: 'sf_shadowraze', name: '毁灭阴影',
  description: '在影魔前方的近、中、远三个距离之一召唤一团暗影，对范围内的所有敌人造成魔法伤害，伤害随灵魂数提高。几秒内连续被毁灭阴影命中的敌人会受到越来越多的额外伤害。有 3 层充能，每层独立恢复。轻点会自动选择能打中最近敌方英雄的距离，拖动时落点在三档之间吸附。',
  slot: 'Q', maxLevel: 4, targetType: 'point', damageType: 'magical', castPoint: 0.55,
  castRange: [700], cooldown: [9], manaCost: [75], charges: 3, chargeMode: 'parallel', pointSnap: [200, 450, 700],
  values: {
    damage: [85, 150, 215, 280], perSoul: [2], radius: [250], stackDamage: [35, 50, 65, 80], stackDuration: [6], attackDamage: [0],
  },
  smartTarget: razeSmartTarget,
  onCast: (ctx) => {
    const { world, caster } = ctx;
    const p = ctx.target.point;
    if (!p) return;
    const radius = ctx.v('radius');
    const damage = ctx.v('damage') + ctx.v('perSoul') * getSouls(caster);
    const stackDamage = ctx.v('stackDamage');
    const stackDuration = ctx.v('stackDuration');
    const withAttack = ctx.v('attackDamage') > 0;
    for (const u of enemiesInRadius(world, caster.team, p, radius)) {
      const stacks = findModifier(u, RAZE_STACK.id, caster.id)?.stacks ?? 0;
      applyDamage(world, {
        source: caster, target: u, amount: damage + stackDamage * stacks, type: 'magical', isAttack: false, abilityId: 'sf_shadowraze',
      });
      if (!u.alive) continue;
      addModifier(world, u, RAZE_STACK, { sourceId: caster.id, duration: stackDuration });
      // 25 级右天赋：再造成一次攻击力的物理伤害（不是普攻，不触发攻击特效）
      if (withAttack) {
        applyDamage(world, {
          source: caster, target: u, amount: rollAttackDamage(world, caster), type: 'physical', isAttack: false,
          abilityId: 'sf_shadowraze', noSpellAmp: true,
        });
      }
    }
    world.events.emit({ type: 'fx', kind: 'sf_raze', pos: copy(p), radius, unitId: caster.id });
  },
};

// ---------- W 灵魂盛宴 ----------
/** 借来的灵魂在 data 里的键：b<单位 id> = 这个敌人借了几个 */
const BORROW = 'b';

const FEAST: ModifierDef = {
  id: 'sf_feast', name: '灵魂盛宴', interval: 0.5,
  stats: (m) => ({ attackSpeed: m.data.as ?? 0, moveSpeedPct: m.data.ms ?? 0, castSpeed: m.data.cs ?? 0 }),
  // 每跳：从范围内还没被收过的敌方英雄 / 小兵里选最多 perTick 个（英雄优先、近的优先），总数不超过 maxEnemies，可以超过灵魂上限
  onInterval: (m, owner, world) => {
    const d = m.data;
    let n = d.n ?? 0;
    const take = Math.min(d.perTick ?? 0, (d.maxEnemies ?? 0) - n);
    if (take <= 0) return;
    const pool = enemiesInRadius(world, owner.team, owner.pos, d.radius ?? 0).filter(
      (u) => u.kind !== 'summon' && d[`${BORROW}${u.id}`] === undefined,
    );
    pool.sort((a, b) => (a.kind === 'hero' ? 0 : 1) - (b.kind === 'hero' ? 0 : 1) || dist(a.pos, owner.pos) - dist(b.pos, owner.pos));
    let souls = getSouls(owner);
    for (const u of pool.slice(0, take)) {
      const gain = u.kind === 'hero' ? d.heroSouls ?? 0 : d.creepSouls ?? 0;
      d[`${BORROW}${u.id}`] = gain;
      souls += gain;
      n++;
      world.events.emit({ type: 'fx', kind: 'sf_feast', pos: copy(u.pos), unitId: owner.id, targetId: u.id });
    }
    d.n = n;
    setSouls(owner, souls);
  },
  // 结束：还活着的敌人借的灵魂收回（不低于 0）；keepTime 秒后去掉超过上限的部分
  onRemove: (m, owner, world) => {
    let back = 0;
    for (const [k, v] of Object.entries(m.data)) {
      if (!k.startsWith(BORROW)) continue;
      const u = world.getUnit(Number(k.slice(BORROW.length)));
      if (u && u.alive && !u.removed) back += v;
    }
    setSouls(owner, getSouls(owner) - back);
    world.after(m.data.keepTime ?? 0, (w) => {
      const cap = maxSouls(owner);
      if (getSouls(owner) > cap) setSouls(owner, cap, w);
    });
  },
};

const feastOfSouls: AbilityDef = {
  id: 'sf_feast_of_souls', name: '灵魂盛宴',
  description: '影魔在一段时间内提高攻击速度和移动速度，并不断从周围的敌人身上吸取灵魂：英雄提供更多灵魂，借来的灵魂可以超过上限。结束时，仍然活着的敌人会把借出的灵魂收回；被击杀的敌人的灵魂留下，超过上限的部分在稍后消散。',
  slot: 'W', maxLevel: 4, targetType: 'none', castPoint: 0,
  cooldown: [21], manaCost: [60, 65, 70, 75],
  values: {
    duration: [8], attackSpeed: [35, 50, 65, 80], moveSpeed: [0.04, 0.06, 0.08, 0.1], radius: [600], perTick: [2], interval: [0.5],
    maxEnemies: [4, 6, 8, 10], heroSouls: [3], creepSouls: [1], keepTime: [8], castSpeed: [0],
  },
  onCast: (ctx) => {
    const { world, caster } = ctx;
    // 数值在施放时确定
    addModifier(world, caster, FEAST, {
      sourceId: caster.id, duration: ctx.v('duration'), abilityLevel: ctx.level,
      data: {
        as: ctx.v('attackSpeed'), ms: ctx.v('moveSpeed'), cs: ctx.v('castSpeed'), radius: ctx.v('radius'), perTick: ctx.v('perTick'),
        maxEnemies: ctx.v('maxEnemies'), heroSouls: ctx.v('heroSouls'), creepSouls: ctx.v('creepSouls'), keepTime: ctx.v('keepTime'),
      },
    });
    world.events.emit({ type: 'fx', kind: 'sf_feast_cast', pos: copy(caster.pos), unitId: caster.id });
  },
};

// ---------- E 魔王降临 ----------
const presenceValue = (owner: Unit, key: string): number => {
  const ab = owner.ability('E');
  return ab && ab.level > 0 ? abilityValue(owner, ab, key) : 0;
};

/** 光环子 Modifier：降低护甲（数值每 tick 由 childData 写入） */
const PRESENCE_DEBUFF: ModifierDef = {
  id: 'sf_presence_debuff', name: '魔王降临', debuff: true,
  stats: (m) => ({ armor: -(m.data.armor ?? 0) }),
};

/** D24：也作用于敌方建筑；被破坏时光环不施加（引擎规则） */
const PRESENCE: ModifierDef = {
  id: 'sf_presence', hidden: true, persistOnDeath: true, dispel: 'none',
  aura: {
    radius: (owner) => presenceValue(owner, 'radius'),
    team: 'enemy',
    includeBuildings: true,
    child: PRESENCE_DEBUFF,
    childData: (owner) => ({ armor: presenceValue(owner, 'armor') }),
  },
};

const presence: AbilityDef = {
  id: 'sf_presence', name: '魔王降临',
  description: '被动光环：影魔周围很大范围内的敌方单位护甲降低，包括敌方防御塔和其他建筑。影魔被破坏时失效。',
  slot: 'E', maxLevel: 4, targetType: 'passive',
  values: { armor: [2.5, 4, 5.5, 7], radius: [1200] },
  passive: PRESENCE,
};

// ---------- R 魂之挽歌 ----------
const requiem: AbilityDef = {
  id: 'sf_requiem', name: '魂之挽歌',
  description: '影魔经过一段较长的蓄力后，把收集的灵魂化作暗影向四周放出，每个灵魂一道（有上限）。每道暗影对路径上的敌人造成魔法伤害、使其恐惧并减速、降低魔法抗性；离影魔越近，被命中的道数越多。没有灵魂时也能施放，但不会放出暗影。影魔死亡时会自动放出一半灵魂的魂之挽歌（不带恐惧和减速）。',
  slot: 'R', maxLevel: 3, requiredHeroLevels: [6, 12, 18], targetType: 'none', damageType: 'magical', castPoint: 1.67,
  cooldown: [120, 110, 100], manaCost: [150, 175, 200],
  values: {
    damage: [80, 120, 160], maxLines: [20], distance: [1000], startWidth: [125], endWidth: [300], speed: [700],
    fearPerLine: [0.6], fearCap: [2.15], slow: [0.2, 0.25, 0.3], magicResist: [0.05, 0.1, 0.15],
  },
  aimShape: (caster, ab) => ({ radius: abilityValue(caster, ab, 'distance') }),
  onCast: (ctx) => {
    const { world, caster, ability } = ctx;
    releaseRequiem(world, caster, ability, Math.min(getSouls(caster), ctx.v('maxLines')), true);
  },
};

// ---------- 先天 支配死灵 ----------
const NECROMASTERY: ModifierDef = {
  id: NECRO_ID, hidden: true, persistOnDeath: true, dispel: 'none',
  // 每个灵魂的攻击力 = perSoulBase + perSoulStep × floor(等级 / stepLevels)
  stats: (m, owner) => {
    const souls = m.data.souls ?? 0;
    if (souls <= 0) return {};
    const lv = owner.hero?.level ?? 1;
    const steps = Math.floor(lv / Math.max(1, necroValue(owner, 'stepLevels')));
    return { bonusDamage: souls * (necroValue(owner, 'perSoulBase') + necroValue(owner, 'perSoulStep') * steps) };
  },
  // 影魔击杀（含反补）小兵 / 英雄：+1 / +heroSouls，不超过上限（已经超过时不减少）；被破坏时不收魂；建筑和召唤物不算
  onKill: (m, owner, victim) => {
    if (owner.hasState('breakPassives') || victim.kind === 'building' || victim.kind === 'summon') return;
    const souls = m.data.souls ?? 0;
    const cap = maxSouls(owner);
    if (souls >= cap) return;
    const gain = victim.kind === 'hero' ? necroValue(owner, 'heroSouls') : 1;
    m.data.souls = Math.min(cap, souls + gain);
  },
  // 死亡：学了魂之挽歌时先放出 floor(灵魂 × deathRelease) 道（不带恐惧），再保留 floor(灵魂 × deathKeep)（D23，按死亡前的灵魂数）
  onDeath: (m, owner, _killer, world) => {
    const souls = m.data.souls ?? 0;
    const r = owner.ability('R');
    if (r && r.level > 0) {
      const n = Math.min(Math.floor(souls * necroValue(owner, 'deathRelease')), abilityValue(owner, r, 'maxLines'));
      if (n > 0) releaseRequiem(world, owner, r, n, false);
    }
    m.data.souls = Math.floor(souls * necroValue(owner, 'deathKeep'));
  },
};

const necromastery: AbilityDef = {
  id: NECRO_ID, name: '支配死灵',
  description: '先天技能：影魔每击杀一个单位就收集一个灵魂，击杀英雄收集更多，灵魂有上限。每个灵魂增加攻击力，影魔每升 6 级每个灵魂提供的攻击力更多。影魔死亡时会失去一部分灵魂。',
  slot: 'innate', maxLevel: 1, targetType: 'passive',
  values: { maxSouls: [20], heroSouls: [4], perSoulBase: [1], perSoulStep: [0.8], stepLevels: [6], deathKeep: [0.7], deathRelease: [0.5] },
  passive: NECROMASTERY,
  counter: (u) => getSouls(u),
  counterLabel: '灵魂',
};

export const SHADOW_FIEND: HeroDef = {
  id: 'shadow_fiend', name: '影魔', title: '奈文摩尔', primary: 'agi',
  str: [19, 2.7], agi: [25, 3.6], int: [16, 2.2],
  baseDamage: [16, 22], baseArmor: 0, baseHpRegen: 0.25, baseManaRegen: 0.3,
  attackRange: 525, bat: 1.6, baseAttackSpeed: 100, attackPoint: 0.5, projectileSpeed: 1200, moveSpeed: 305,
  roles: ['核心', '爆发', '推进'],
  abilities: [shadowraze, feastOfSouls, presence, requiem, necromastery],
  talents: [
    [
      { id: 'sf_t10a', name: '+30 毁灭阴影连中伤害', valueBonus: { abilityId: 'sf_shadowraze', key: 'stackDamage', add: 30 } },
      { id: 'sf_t10b', name: '+30 灵魂盛宴攻速', valueBonus: { abilityId: 'sf_feast_of_souls', key: 'attackSpeed', add: 30 } },
    ],
    [
      { id: 'sf_t15a', name: '魔王降临护甲削减 +1.5', valueBonus: { abilityId: 'sf_presence', key: 'armor', add: 1.5 } },
      { id: 'sf_t15b', name: '灵魂盛宴每名英雄多收 2 个灵魂', valueBonus: { abilityId: 'sf_feast_of_souls', key: 'heroSouls', add: 2 } },
    ],
    [
      { id: 'sf_t20a', name: '+5 灵魂上限', valueBonus: { abilityId: 'sf_necromastery', key: 'maxSouls', add: 5 } },
      {
        id: 'sf_t20b', name: '魂之挽歌每道恐惧 +0.2 秒（上限 +0.45 秒）',
        valueBonus: [{ abilityId: 'sf_requiem', key: 'fearPerLine', add: 0.2 }, { abilityId: 'sf_requiem', key: 'fearCap', add: 0.45 }],
      },
    ],
    [
      { id: 'sf_t25a', name: '灵魂盛宴期间 +30% 施法速度', valueBonus: { abilityId: 'sf_feast_of_souls', key: 'castSpeed', add: 0.3 } },
      { id: 'sf_t25b', name: '毁灭阴影附带一次攻击伤害', valueBonus: { abilityId: 'sf_shadowraze', key: 'attackDamage', add: 1 } },
    ],
  ],
};

import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Team } from '../sim/core/types';
import type { Vec2 } from '../sim/core/vec2';
import { add, dist, dot, fromAngle, normalize, scale, sub } from '../sim/core/vec2';
import { DT } from '../sim/core/constants';
import type { AiSkill } from '../sim/heroes/types';
import { BALANCE } from '../sim/data/balance';
import { forwardY, layoutFor } from '../sim/data/map';
import { armorMultiplier } from '../sim/formulas';
import { edgeDist, enemiesInRadius, isAliveUnit, isHiddenFrom } from '../sim/query';
import { abilityManaCost } from '../sim/systems/abilities';
import type { AiCtx } from './usage/types';

/** 上一个逻辑帧的位移 / DT（AI 在 world.step 之前思考，prevPos 是上一帧开始时的位置） */
export function unitVelocity(u: Unit): Vec2 {
  return { x: (u.pos.x - u.prevPos.x) / DT, y: (u.pos.y - u.prevPos.y) / DT };
}

/**
 * 预判 leadTime 秒后的位置：pos + 速度 × lead × skill.prediction；
 * prediction 为 0（简单难度）时再加一个半径不超过 BALANCE.ai.easyAimError 的随机偏差（world.rng）
 */
export function predictPos(world: World, target: Unit, leadTime: number, skill: AiSkill): Vec2 {
  const p = add(target.pos, scale(unitVelocity(target), leadTime * skill.prediction));
  if (skill.prediction > 0) return p;
  const err = world.balance.ai.easyAimError;
  const a = world.rng.range(0, Math.PI * 2);
  return add(p, scale(fromAngle(a), world.rng.range(0, err)));
}

/** 单位（边缘）是否在以 c 为圆心、半径 r 的圆内（与 unitsInRadius 的判定一致） */
const inCircle = (u: Unit, c: Vec2, r: number): boolean => dist(u.pos, c) - u.radius <= r;

/**
 * 以每个候选单位为圆心试一遍，返回覆盖单位最多（英雄按 heroWeight 个计）且圆心在施法距离内的落点；
 * 没有候选在施法距离内时返回 null。有 world 的调用者传 world.balance.ai.heroWeight（缺省读全局 BALANCE）
 */
export function bestCirclePoint(
  cands: readonly Unit[], radius: number, origin: Vec2, range: number, heroWeight: number = BALANCE.ai.heroWeight,
): { point: Vec2; count: number; heroes: number } | null {
  let best: { point: Vec2; count: number; heroes: number } | null = null;
  let bestScore = -1;
  for (const c of cands) {
    if (dist(origin, c.pos) > range) continue;
    let count = 0;
    let heroes = 0;
    for (const u of cands) {
      if (!inCircle(u, c.pos, radius)) continue;
      count++;
      if (u.kind === 'hero') heroes++;
    }
    const score = count - heroes + heroes * heroWeight;
    if (score > bestScore) {
      bestScore = score;
      best = { point: { x: c.pos.x, y: c.pos.y }, count, heroes };
    }
  }
  return best;
}

/** 单位到"origin 沿 dir 的线段"的投影长度；不在长 length、半宽 halfWidth（加单位半径）的矩形内时返回 null */
function lineProjection(u: Unit, origin: Vec2, dir: Vec2, length: number, halfWidth: number): number | null {
  const d = sub(u.pos, origin);
  const t = dot(d, dir);
  if (t < 0 || t > length + u.radius) return null;
  const perp = Math.abs(d.x * dir.y - d.y * dir.x);
  return perp <= halfWidth + u.radius ? t : null;
}

function sortedInLine(list: readonly Unit[], origin: Vec2, dir: Vec2, length: number, halfWidth: number): Unit[] {
  const n = normalize(dir);
  if (n.x === 0 && n.y === 0) return [];
  const hits: { u: Unit; t: number }[] = [];
  for (const u of list) {
    const t = lineProjection(u, origin, n, length, halfWidth);
    if (t !== null) hits.push({ u, t });
  }
  return hits.sort((a, b) => a.t - b.t).map((h) => h.u);
}

/**
 * 从 origin 沿 dir 的矩形（长 length、半宽 halfWidth，单位按边缘算）内的敌方非建筑单位，按距离排序；
 * 不含无敌单位和对 team 隐藏的单位（AI 看不见它们，不能拿来做决定）
 */
export function unitsInLine(world: World, team: Team, origin: Vec2, dir: Vec2, length: number, halfWidth: number): Unit[] {
  const list = world.units.filter(
    (u) => isAliveUnit(u) && u.team !== team && u.kind !== 'building' && !u.hasState('invulnerable') && !isHiddenFrom(u, team),
  );
  return sortedInLine(list, origin, dir, length, halfWidth);
}

/**
 * 直线上第一个会被碰到的单位（敌我都算，不含自己、建筑、召唤物、无敌 / 不可选中单位，
 * 也不含对我方隐藏的单位——AI 看不见它们）——肉钩用
 */
export function firstInLine(world: World, me: Unit, dir: Vec2, length: number, halfWidth: number): Unit | null {
  return sortedInLine(lineBlockers(world, me), me.pos, dir, length, halfWidth)[0] ?? null;
}

/** firstInLine 考虑的单位：敌我都算，不含自己、建筑、召唤物、无敌 / 不可选中单位和对我方隐藏的单位 */
function lineBlockers(world: World, me: Unit): Unit[] {
  return world.units.filter(
    (u) =>
      isAliveUnit(u) && u.id !== me.id && u.kind !== 'building' && u.kind !== 'summon' &&
      !u.hasState('invulnerable') && !u.hasState('untargetable') && !isHiddenFrom(u, me.team),
  );
}

/**
 * 直线弹道沿 n 方向前进多远时第一次碰到 u（与 linearSweep 一致：到扫过线段的距离 ≤ hitRadius）；碰不到时返回 null。
 * 出手点附近（包括身后）hitRadius 内的单位在出发时就会被碰到，返回 0
 */
function sweepEntry(u: Unit, origin: Vec2, n: Vec2, length: number, hitRadius: number): number | null {
  const d = sub(u.pos, origin);
  const t = dot(d, n);
  const perp = Math.abs(d.x * n.y - d.y * n.x);
  if (perp > hitRadius || t > length + hitRadius) return null;
  const entry = t - Math.sqrt(hitRadius * hitRadius - perp * perp);
  if (entry > length) return null;
  if (t < 0 && Math.hypot(t, perp) > hitRadius) return null;
  return Math.max(0, entry);
}

/**
 * 直线技能（肉钩）是否会先碰到 target：按弹道的扫掠判定（linearSweep：到扫过线段的距离 ≤ 宽度 + 单位半径）
 * 算出每个单位第一次被碰到时弹道走了多远，别的单位（同 firstInLine 的筛选）都要比 target 晚至少 margin。
 * 和 firstInLine 的矩形不同，它包括出手点身后的半圆——贴在施法者身边（甚至身后）的单位出发时就会被碰到。
 * margin 同时把别的单位的碰撞半径加大 margin，补偿它们在前摇和飞行中的移动。
 */
export function lineClearTo(
  world: World, me: Unit, target: Unit, dir: Vec2, length: number, halfWidth: number, margin = 0,
): boolean {
  const n = normalize(dir);
  if (n.x === 0 && n.y === 0) return false;
  const te = sweepEntry(target, me.pos, n, length, halfWidth + target.radius);
  if (te === null) return false;
  for (const u of lineBlockers(world, me)) {
    if (u === target) continue;
    const e = sweepEntry(u, me.pos, n, length, halfWidth + margin + u.radius);
    if (e !== null && e <= te + margin) return false;
  }
  return true;
}

/** 魔法伤害打到目标身上的实际数值（× (1 − 魔抗)） */
export const magicDamageTo = (t: Unit, amount: number): number => amount * (1 - t.stats.magicResist);

/** 物理伤害打到目标身上的实际数值（× 护甲减免） */
export function physicalDamageTo(t: Unit, amount: number): number {
  return amount * armorMultiplier(t.stats.armor);
}

/** 指向己方泉水的单位向量 */
export function towardHome(me: Unit): Vec2 {
  const d = normalize(sub(layoutFor(me.team).fountain, me.pos));
  // 正好站在泉水中心时：朝己方底线
  return d.x === 0 && d.y === 0 ? { x: 0, y: -forwardY(me.team) } : d;
}

/** c.enemyHeroes 里边缘距离不超过 maxDist 的最近一个 */
export function nearestEnemyHero(c: AiCtx, maxDist: number): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const h of c.enemyHeroes) {
    const d = edgeDist(c.me, h);
    if (d <= maxDist && d < bd) { bd = d; best = h; }
  }
  return best;
}

/** c.enemyHeroes 里边缘距离不超过 maxDist、当前生命（绝对值）最低的一个 */
export function lowestHpEnemyHero(c: AiCtx, maxDist: number): Unit | null {
  let best: Unit | null = null;
  for (const h of c.enemyHeroes) {
    if (edgeDist(c.me, h) <= maxDist && (!best || h.hp < best.hp)) best = h;
  }
  return best;
}

/** 我正在攻击的敌方英雄（攻击指令的目标，或者普攻锁定的目标）；没有返回 null */
export function attackedEnemyHero(c: AiCtx): Unit | null {
  const { world, me } = c;
  const id = me.order.kind === 'attack' ? me.order.targetId : me.attack.targetId;
  const t = world.getUnit(id);
  return isAliveUnit(t) && t.kind === 'hero' && t.team !== me.team ? t : null;
}

/** p 周围 r 内（边缘距离）我能看见的敌方小兵（含精英怪，不含英雄、建筑、召唤物） */
export function enemyCreepsNear(world: World, me: Unit, p: Vec2, r: number): Unit[] {
  return enemiesInRadius(world, me.team, p, r).filter(
    (u) => (u.kind === 'creep' || u.kind === 'elite') && !isHiddenFrom(u, me.team),
  );
}

/** 正在被敌方英雄或防御塔攻击（锁定为普攻目标），或最近 1 秒内受到过英雄伤害 */
export function underAttack(world: World, me: Unit): boolean {
  for (const t of me.heroDamageTimes.values()) if (world.time - t <= 1) return true;
  return world.units.some(
    (u) =>
      isAliveUnit(u) && u.team !== me.team && u.attack.targetId === me.id &&
      (u.kind === 'hero' || (u.kind === 'building' && u.base.damageMax > 0)),
  );
}

/**
 * 留蓝给大招（BALANCE.ai.conserveUltMana）：大招已学会、冷却剩余不超过 10 秒时，
 * 施放 c.ab（不是大招本身）后剩下的魔法要够放大招；其他情况恒为 true
 */
export function keepsUltMana(c: AiCtx): boolean {
  if (!c.world.balance.ai.conserveUltMana || c.ab.def.slot === 'R') return true;
  const r = c.me.ability('R');
  if (!r || r.level <= 0 || r.cooldown > 10) return true;
  return c.me.mana - abilityManaCost(c.ab, c.me) >= abilityManaCost(r, c.me);
}

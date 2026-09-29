import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { enemyTeam } from '../core/types';
import { dist } from '../core/vec2';
import { streakBounty } from '../formulas';
import { giveGold, giveXp, netWorth } from './progress';

export function resolveKillCredit(world: World, victim: Unit, killer: Unit | null): Unit | null {
  if (killer && killer.kind === 'hero' && killer.team !== victim.team) return killer;
  const lh = victim.lastHeroDamage;
  if (lh && world.time - lh.time <= world.balance.economy.killCreditWindow) {
    const h = world.getUnit(lh.heroId);
    if (h && h.team !== victim.team) return h;
  }
  return null;
}

function heroKillRewards(world: World, victim: Unit, killer: Unit | null): void {
  const e = world.balance.economy;
  const vh = victim.hero!;
  const credited = resolveKillCredit(world, victim, killer);
  const killerTeam = enemyTeam(victim.team);
  const enemies = world.heroes(killerTeam);
  const gold = e.heroKillBaseGold + e.heroKillGoldPerLevel * vh.level + streakBounty(vh.streak);
  const assisters = enemies.filter(
    (h) =>
      h !== credited &&
      (world.time - (victim.heroDamageTimes.get(h.id) ?? -1e9) <= e.assistWindow ||
        (h.alive && dist(h.pos, victim.pos) <= e.assistRadius)),
  );
  if (credited) {
    giveGold(world, credited, gold);
    credited.hero!.kills++;
    credited.hero!.streak++;
  } else {
    for (const h of enemies) giveGold(world, h, gold / Math.max(1, enemies.length));
  }
  world.teams[killerTeam].kills++;
  if (assisters.length) {
    const each = (e.assistBaseGold + e.assistNetWorthRatio * netWorth(victim)) / assisters.length;
    for (const h of assisters) {
      giveGold(world, h, each);
      h.hero!.assists++;
    }
  }
  const nearby = (h: Unit) => h.alive && dist(h.pos, victim.pos) <= e.xpShareRadius;
  const xpTakers = credited ? [credited, ...assisters.filter(nearby)] : enemies.filter(nearby);
  if (xpTakers.length) {
    const xp = (e.heroKillBaseXp + e.heroKillXpRatio * vh.xp) / xpTakers.length;
    for (const h of xpTakers) giveXp(world, h, xp);
  }
  vh.gold -= Math.min(vh.gold, e.deathGoldLossPerLevel * vh.level);
  vh.deaths++;
  vh.streak = 0;
}

export function onUnitKilledEconomy(world: World, victim: Unit, killer: Unit | null): void {
  const e = world.balance.economy;
  if (victim.kind === 'building') {
    const st = victim.building;
    if (!st) return;
    for (const h of world.heroes(enemyTeam(victim.team))) giveGold(world, h, st.goldTeam);
    if (killer && killer.kind === 'hero' && killer.team !== victim.team) giveGold(world, killer, st.goldLastHit);
    return;
  }
  if (victim.kind === 'hero') {
    if (victim.hero) heroKillRewards(world, victim, killer);
    return;
  }
  const gold = victim.bounty.gold * e.creepGoldMult;
  const xp = victim.bounty.xp * e.creepXpMult;
  if (gold <= 0 && xp <= 0) return;
  const enemies = world.heroes(enemyTeam(victim.team));
  const lastHitter = killer && killer.kind === 'hero' && killer.team !== victim.team ? killer : null;
  if (lastHitter) {
    giveGold(world, lastHitter, gold);
    lastHitter.hero!.lastHits++;
  }
  for (const h of enemies) {
    if (!h.alive || h === lastHitter) continue;
    if (dist(h.pos, victim.pos) <= e.lastHitShareRadius) giveGold(world, h, gold * e.lastHitShareRatio, false);
  }
  const takers = enemies.filter((h) => h.alive && dist(h.pos, victim.pos) <= e.xpShareRadius);
  for (const h of takers) giveXp(world, h, xp / takers.length);
}

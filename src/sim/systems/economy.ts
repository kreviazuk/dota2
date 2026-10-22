import type { World } from '../world';
import type { Unit } from '../entities/unit';
import { Team, enemyTeam } from '../core/types';
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
  const isFirstBlood = !world.firstBloodAwarded && credited !== null;
  if (isFirstBlood && credited) {
    world.firstBloodAwarded = true;
    world.events.emit({
      type: 'announcement',
      category: 'first_blood',
      killerId: credited.id,
      victimId: victim.id,
      team: credited.team,
      title: '第一滴血 (First Blood!)',
      subText: `${credited.name} 击杀了 ${victim.name}！`,
    });
  }

  if (vh.streak >= 3) {
    world.events.emit({
      type: 'announcement',
      category: 'shutdown',
      killerId: credited?.id ?? null,
      victimId: victim.id,
      team: killerTeam,
      title: '终结连杀 (Shutdown!)',
      subText: `${credited ? credited.name : '防御塔'} 终结了 ${victim.name} 的 ${vh.streak} 连杀！`,
    });
  }

  if (credited && credited.hero) {
    giveGold(world, credited, gold);
    credited.hero.kills++;
    credited.hero.streak++;
    const ch = credited.hero;
    if (world.time - ch.lastKillTime <= 18) {
      ch.multiKill++;
    } else {
      ch.multiKill = 1;
    }
    ch.lastKillTime = world.time;

    if (ch.multiKill === 2) {
      world.events.emit({
        type: 'announcement',
        category: 'multikill',
        killerId: credited.id,
        victimId: victim.id,
        team: credited.team,
        title: '双杀！Double Kill!',
        subText: `${credited.name} 斩获双杀！`,
      });
    } else if (ch.multiKill >= 3) {
      world.events.emit({
        type: 'announcement',
        category: 'multikill',
        killerId: credited.id,
        victimId: victim.id,
        team: credited.team,
        title: '三杀！Triple Kill!',
        subText: `${credited.name} 大杀四方，斩获三杀！`,
      });
    }

    const streakTitles: Record<number, { title: string; sub: string }> = {
      3: { title: '大杀特杀 (Killing Spree!)', sub: `${credited.name} 正在大杀特杀！` },
      4: { title: '主宰比赛 (Dominating!)', sub: `${credited.name} 已经主宰比赛！` },
      5: { title: '杀人如麻 (Mega Kill!)', sub: `${credited.name} 杀人如麻！` },
      6: { title: '无人能挡 (Unstoppable!)', sub: `${credited.name} 无人能挡！` },
      7: { title: '变态杀戮 (Wicked Sick!)', sub: `${credited.name} 变态杀戮！` },
      8: { title: '妖怪般的杀戮 (Monster Kill!)', sub: `${credited.name} 妖怪般的杀戮！` },
      9: { title: '如同神一般 (Godlike!)', sub: `${credited.name} 如同神一般！` },
      10: { title: '超越神了 (Beyond Godlike!)', sub: `${credited.name} 已经超越了神！` },
    };
    const streakInfo = streakTitles[Math.min(ch.streak, 10)];
    if (ch.streak >= 3 && streakInfo && !isFirstBlood) {
      world.events.emit({
        type: 'announcement',
        category: 'streak',
        killerId: credited.id,
        victimId: victim.id,
        team: credited.team,
        title: streakInfo.title,
        subText: streakInfo.sub,
      });
    } else if (!isFirstBlood && ch.multiKill < 2) {
      world.events.emit({
        type: 'announcement',
        category: 'kill',
        killerId: credited.id,
        victimId: victim.id,
        team: credited.team,
        title: `${credited.name} 击杀了 ${victim.name}`,
        subText: `+${Math.round(gold)} 金币`,
      });
    }
  } else {
    for (const h of enemies) giveGold(world, h, gold / Math.max(1, enemies.length));
    if (!isFirstBlood) {
      world.events.emit({
        type: 'announcement',
        category: 'kill',
        killerId: null,
        victimId: victim.id,
        team: killerTeam,
        title: `${victim.name} 阵亡`,
        subText: '防御塔/小兵击杀',
      });
    }
  }
  world.teams[killerTeam].kills++;

  // 检查是否团灭（对手队伍当前全部处于阵亡状态）
  const enemyHeroes = world.heroes(victim.team);
  if (enemyHeroes.length >= 3 && enemyHeroes.every((h) => !h.alive || h.id === victim.id)) {
    world.events.emit({
      type: 'announcement',
      category: 'ace',
      team: killerTeam,
      title: '团灭 (Team Wipe!)',
      subText: `${victim.team === Team.Radiant ? '天辉' : '夜魇'} 全员阵亡！`,
    });
  }

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
  vh.multiKill = 0;
}

export function onUnitKilledEconomy(world: World, victim: Unit, killer: Unit | null): void {
  const e = world.balance.economy;
  if (victim.kind === 'building') {
    const st = victim.building;
    if (!st) return;
    if (killer && killer.team === victim.team) {
      if (killer.kind === 'hero' && killer.hero) killer.hero.denies++;
      return;
    }
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
  const beneficiaries = victim.team === Team.Neutral
    ? (killer ? world.heroes(killer.team) : world.heroes().filter((h) => dist(h.pos, victim.pos) <= e.xpShareRadius))
    : world.heroes(enemyTeam(victim.team));
  if (killer && killer.team === victim.team) {
    if (killer.kind === 'hero' && killer.hero) {
      killer.hero.denies++;
    }
    const takers = beneficiaries.filter((h) => h.alive && dist(h.pos, victim.pos) <= e.xpShareRadius);
    if (takers.length) {
      for (const h of takers) giveXp(world, h, (xp * 0.5) / takers.length);
    }
    return;
  }
  const lastHitter = killer && killer.kind === 'hero' && killer.team !== victim.team ? killer : null;
  if (lastHitter) {
    giveGold(world, lastHitter, gold);
    lastHitter.hero!.lastHits++;
  }
  for (const h of beneficiaries) {
    if (!h.alive || h === lastHitter) continue;
    if (dist(h.pos, victim.pos) <= e.lastHitShareRadius) giveGold(world, h, gold * e.lastHitShareRatio, false);
  }
  const takers = beneficiaries.filter((h) => h.alive && dist(h.pos, victim.pos) <= e.xpShareRadius);
  for (const h of takers) giveXp(world, h, xp / takers.length);
}

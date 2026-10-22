import type { Match } from '../game/match';
import { Team } from '../sim/core/types';
import type { World } from '../sim/world';
import { netWorth } from '../sim/systems/progress';
import { findModifier } from '../sim/modifiers';
import { getItemIconCanvas } from '../render/itemIcons';

/**
 * 战绩综合评估与 MVP 算法：
 * Score = Kills * 3 + Assists * 1.5 - Deaths * 2 + LastHits * 0.1 + (HeroDamage / 1000) * 1.2 + (BuildingDamage / 500) * 1.5
 */
export function calculateMvpScore(s: {
  kills: number;
  assists: number;
  deaths: number;
  lastHits: number;
  heroDamage: number;
  buildingDamage: number;
}): number {
  return (
    s.kills * 3 +
    s.assists * 1.5 -
    s.deaths * 2 +
    s.lastHits * 0.1 +
    (s.heroDamage / 1000) * 1.2 +
    (s.buildingDamage / 500) * 1.5
  );
}

export interface HeroMatchRecord {
  unitId: number;
  heroId: string;
  name: string;
  team: Team;
  isPlayer: boolean;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  netWorth: number;
  heroDamage: number;
  buildingDamage: number;
  damageTaken: number;
  score: number;
  isMvp: boolean;
  isSlayer: boolean;
  isSieger: boolean;
  isTycoon: boolean;
  items: (string | null)[];
  hasShard: boolean;
  hasAegis: boolean;
}

export interface MatchResultData {
  radiant: HeroMatchRecord[];
  dire: HeroMatchRecord[];
  all: HeroMatchRecord[];
  mvp: HeroMatchRecord | null;
  slayer: HeroMatchRecord | null;
  sieger: HeroMatchRecord | null;
  tycoon: HeroMatchRecord | null;
  winner: Team | null;
  duration: number;
  maxHeroDamage: number;
  maxBuildingDamage: number;
  maxDamageTaken: number;
  radiantKills: number;
  direKills: number;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function evaluateMatchResult(world: World, playerUnitId: number | null): MatchResultData {
  const heroes = world.heroes();
  const all: HeroMatchRecord[] = heroes.map((u) => {
    const h = u.hero!;
    const heroDamage = Math.round(h.damageDealt.heroes);
    const buildingDamage = Math.round(h.damageDealt.buildings);
    const damageTaken = Math.round(h.damageTaken ?? 0);
    const kills = h.kills;
    const deaths = h.deaths;
    const assists = h.assists;
    const lastHits = h.lastHits;
    const denies = h.denies ?? 0;
    const nw = Math.round(netWorth(u));
    const rawScore = calculateMvpScore({ kills, assists, deaths, lastHits, heroDamage, buildingDamage });
    const score = Math.round(rawScore * 10) / 10;
    const items = (u.inventory ?? []).slice(0, 6).map((it) => (it ? it.id : null));
    while (items.length < 6) items.push(null);
    const hasShard = !!h.hasShard;
    const hasAegis = findModifier(u, 'mod_aegis') !== undefined;

    return {
      unitId: u.id,
      heroId: h.heroId,
      name: u.name,
      team: u.team,
      isPlayer: u.id === playerUnitId,
      level: h.level,
      kills,
      deaths,
      assists,
      lastHits,
      denies,
      netWorth: nw,
      heroDamage,
      buildingDamage,
      damageTaken,
      score,
      isMvp: false,
      isSlayer: false,
      isSieger: false,
      isTycoon: false,
      items,
      hasShard,
      hasAegis,
    };
  });

  // 评定全场最高分 MVP
  let mvp: HeroMatchRecord | null = null;
  if (all.length > 0) {
    let bestScore = -Infinity;
    for (const r of all) {
      if (r.score > bestScore) {
        bestScore = r.score;
        mvp = r;
      }
    }
    if (mvp) mvp.isMvp = true;
  }

  // 评定单项荣誉（>0 时生效）
  let slayer: HeroMatchRecord | null = null;
  let maxKills = 0;
  let sieger: HeroMatchRecord | null = null;
  let maxBuildingDmg = 0;
  let tycoon: HeroMatchRecord | null = null;
  let maxNw = 0;

  for (const r of all) {
    if (r.kills > maxKills) {
      maxKills = r.kills;
      slayer = r;
    }
    if (r.buildingDamage > maxBuildingDmg) {
      maxBuildingDmg = r.buildingDamage;
      sieger = r;
    }
    if (r.netWorth > maxNw) {
      maxNw = r.netWorth;
      tycoon = r;
    }
  }

  if (slayer && maxKills > 0) slayer.isSlayer = true;
  if (sieger && maxBuildingDmg > 0) sieger.isSieger = true;
  if (tycoon && maxNw > 0) tycoon.isTycoon = true;

  const radiant = all.filter((r) => r.team === Team.Radiant);
  const dire = all.filter((r) => r.team === Team.Dire);

  const maxHeroDamage = Math.max(1, ...all.map((r) => r.heroDamage));
  const maxBuildingDamage = Math.max(1, ...all.map((r) => r.buildingDamage));
  const maxDamageTaken = Math.max(1, ...all.map((r) => r.damageTaken));

  const radiantKills = radiant.reduce((sum, r) => sum + r.kills, 0);
  const direKills = dire.reduce((sum, r) => sum + r.kills, 0);

  return {
    radiant,
    dire,
    all,
    mvp,
    slayer,
    sieger,
    tycoon,
    winner: world.winner,
    duration: world.time,
    maxHeroDamage,
    maxBuildingDamage,
    maxDamageTaken,
    radiantKills,
    direKills,
  };
}

export function renderMatchResultScreen(
  parent: HTMLElement,
  match: Match,
  onRestart: () => void,
  onMenu: () => void,
): HTMLDivElement {
  const w = match.world;
  const me = w.getUnit(match.playerUnitId);
  const win = me ? w.winner === me.team : w.winner === Team.Radiant;
  const data = evaluateMatchResult(w, match.playerUnitId);

  const mins = `${Math.floor(data.duration / 60)}分${Math.floor(data.duration % 60)}秒`;

  const d = document.createElement('div');
  d.className = `screen result-screen ${win ? 'win' : 'lose'}`;

  const renderBadges = (r: HeroMatchRecord) => {
    const list: string[] = [];
    if (r.isMvp) list.push('<span class="badge badge-mvp">MVP</span>');
    if (r.isSlayer) list.push('<span class="badge badge-slayer" title="全场最高击杀">击杀王</span>');
    if (r.isSieger) list.push('<span class="badge badge-sieger" title="全场最高攻塔">推塔王</span>');
    if (r.isTycoon) list.push('<span class="badge badge-tycoon" title="全场经济最高">经济领袖</span>');
    return list.join(' ');
  };

  const renderItemSlots = (r: HeroMatchRecord) => {
    const slots = r.items
      .map((id) => {
        if (!id) return '<div class="item-slot empty"></div>';
        const canvas = getItemIconCanvas(id, 32);
        return `<div class="item-slot" title="${id}">${canvas.outerHTML}</div>`;
      })
      .join('');

    const shard = `<span class="special-badge shard${r.hasShard ? ' active' : ''}" title="魔晶：${r.hasShard ? '已购买' : '未购买'}">魔</span>`;
    const aegis = `<span class="special-badge aegis${r.hasAegis ? ' active' : ''}" title="不朽之守护：${r.hasAegis ? '持有中' : '无'}">盾</span>`;

    return `<div class="items-row">${slots}<div class="special-badges">${shard}${aegis}</div></div>`;
  };

  const renderDmgBars = (r: HeroMatchRecord) => {
    const hPct = Math.round((r.heroDamage / data.maxHeroDamage) * 100);
    const bPct = Math.round((r.buildingDamage / data.maxBuildingDamage) * 100);
    const tPct = Math.round((r.damageTaken / data.maxDamageTaken) * 100);

    return `
      <div class="stat-bars">
        <div class="stat-bar-row" title="英雄伤害: ${r.heroDamage}">
          <span class="bar-lbl">英雄</span>
          <div class="bar-track"><div class="bar-fill hero-dmg" style="width: ${hPct}%"></div></div>
          <span class="bar-val">${r.heroDamage}</span>
        </div>
        <div class="stat-bar-row" title="建筑伤害: ${r.buildingDamage}">
          <span class="bar-lbl">建筑</span>
          <div class="bar-track"><div class="bar-fill bld-dmg" style="width: ${bPct}%"></div></div>
          <span class="bar-val">${r.buildingDamage}</span>
        </div>
        <div class="stat-bar-row" title="承受伤害: ${r.damageTaken}">
          <span class="bar-lbl">承伤</span>
          <div class="bar-track"><div class="bar-fill tkn-dmg" style="width: ${tPct}%"></div></div>
          <span class="bar-val">${r.damageTaken}</span>
        </div>
      </div>
    `;
  };

  const renderTeamSection = (title: string, team: Team, list: HeroMatchRecord[]) => {
    const isWinner = w.winner === team;
    const teamClass = team === Team.Radiant ? 'rad' : 'dire';
    const rows = list
      .map((r) => {
        const rowCls = `${r.team === Team.Radiant ? 'rad' : 'dire'}${r.isPlayer ? ' me' : ''}${r.isMvp ? ' mvp-row' : ''}`;
        return `
          <tr class="${rowCls}">
            <td class="col-hero">
              <div class="hero-cell">
                <span class="hero-name">${esc(r.name)}${r.isPlayer ? ' <span class="tag-me">（你）</span>' : ''}</span>
                <div class="badges-row">${renderBadges(r)}</div>
              </div>
            </td>
            <td class="col-lv">${r.level}</td>
            <td class="col-kda"><span class="kda-num">${r.kills}</span> / <span class="kda-num">${r.deaths}</span> / <span class="kda-num">${r.assists}</span></td>
            <td class="col-cs">${r.lastHits} / ${r.denies}</td>
            <td class="col-nw"><span class="gold-text">${r.netWorth}</span></td>
            <td class="col-items">${renderItemSlots(r)}</td>
            <td class="col-bars">${renderDmgBars(r)}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="result-team-section ${teamClass}">
        <div class="team-header">
          <span class="team-title">${title} ${isWinner ? '★ 获胜' : ''}</span>
          <span class="team-score">击杀: ${team === Team.Radiant ? data.radiantKills : data.direKills}</span>
        </div>
        <table class="result-table">
          <thead>
            <tr>
              <th class="col-hero">英雄</th>
              <th class="col-lv">等级</th>
              <th class="col-kda">K / D / A</th>
              <th class="col-cs">正 / 反补</th>
              <th class="col-nw">净资产</th>
              <th class="col-items">最终装备</th>
              <th class="col-bars">对战数据</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  };

  const mvpBanner = data.mvp
    ? `
      <div class="mvp-banner">
        <div class="mvp-badge-icon">MVP</div>
        <div class="mvp-info">
          <div class="mvp-hero">${esc(data.mvp.name)} <span class="mvp-team">(${data.mvp.team === Team.Radiant ? '天辉' : '夜魇'})</span></div>
          <div class="mvp-score">综合评分: <strong>${data.mvp.score}</strong> · KDA: ${data.mvp.kills}/${data.mvp.deaths}/${data.mvp.assists} · 伤害: ${data.mvp.heroDamage}</div>
        </div>
      </div>
    `
    : '';

  d.innerHTML = `
    <div class="result-container">
      <div class="result-header">
        <div class="result-title ${win ? 'win' : 'lose'}">${win ? '胜利' : '失败'}</div>
        <div class="result-subtitle">
          <span class="score-rad">${data.radiantKills}</span>
          <span class="score-vs">VS</span>
          <span class="score-dire">${data.direKills}</span>
          <span class="match-time">· 时长 ${mins}</span>
        </div>
      </div>

      ${mvpBanner}

      <div class="result-tables">
        ${renderTeamSection('天辉 (Radiant)', Team.Radiant, data.radiant)}
        ${renderTeamSection('夜魇 (Dire)', Team.Dire, data.dire)}
      </div>

      <div class="btn-row result-actions">
        <div class="btn again">再来一局</div>
        <div class="btn secondary menu">返回主菜单</div>
      </div>
    </div>
  `;

  d.querySelector('.again')!.addEventListener('click', () => {
    d.remove();
    onRestart();
  });
  d.querySelector('.menu')!.addEventListener('click', () => {
    d.remove();
    onMenu();
  });

  parent.appendChild(d);
  return d;
}

import { describe, it, expect } from 'vitest';
import { World } from '../../src/sim/world';
import { Team } from '../../src/sim/core/types';
import { createHero } from '../../src/sim/systems/heroes';
import { dist } from '../../src/sim/core/vec2';
import { applyDamage, killUnit } from '../../src/sim/systems/damage';

describe('neutral creeps & jungle camps', () => {
  it('spawns 8 neutral camps (4 Radiant, 4 Dire) at match start', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    expect(w.neutralCamps).toBeDefined();
    expect(w.neutralCamps?.camps).toHaveLength(8);

    for (const c of w.neutralCamps!.camps) {
      expect(c.unitIds.length).toBeGreaterThan(0);
      for (const id of c.unitIds) {
        const u = w.getUnit(id);
        expect(u).toBeDefined();
        expect(u!.team).toBe(Team.Neutral);
        expect(u!.neutral?.campId).toBe(c.def.id);
        expect(dist(u!.pos, c.def.pos)).toBeLessThan(100);
      }
    }
  });

  it('neutral creeps aggro when an enemy approaches within 260 range', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    const hero = createHero(w, 'axe', Team.Radiant, false);
    const camp = w.neutralCamps!.camps[0];
    const creep = w.getUnit(camp.unitIds[0])!;

    expect(creep.neutral?.inCombat).toBe(false);

    // 英雄移动到野怪警戒范围外 400 距离：野怪不攻击
    hero.pos = { x: creep.pos.x + 400, y: creep.pos.y };
    w.step();
    expect(creep.neutral?.inCombat).toBe(false);

    // 英雄进入野怪警戒范围 200 距离：野怪警觉并进入战斗
    hero.pos = { x: creep.pos.x + 200, y: creep.pos.y };
    w.step();
    expect(creep.neutral?.inCombat).toBe(true);
    expect(creep.order.kind).toBe('attack');
    if (creep.order.kind === 'attack') {
      expect(creep.order.targetId).toBe(hero.id);
    }
  });

  it('all creeps in camp aggro when one is damaged', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    const hero = createHero(w, 'axe', Team.Dire, false);
    // 小型野怪营地有 2 只狼
    const camp = w.neutralCamps!.camps.find((c) => c.def.id === 'radiant_small')!;
    const [c1, c2] = camp.unitIds.map((id) => w.getUnit(id)!);

    hero.pos = { x: c1.pos.x + 350, y: c1.pos.y };
    applyDamage(w, { source: hero, target: c1, amount: 50, type: 'physical', isAttack: true });

    expect(c1.neutral?.inCombat).toBe(true);
    expect(c2.neutral?.inCombat).toBe(true);
    expect(c1.order.kind).toBe('attack');
    expect(c2.order.kind).toBe('attack');
  });

  it('leashes back and heals when pulled beyond maximum distance', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    const camp = w.neutralCamps!.camps[0];
    const creep = w.getUnit(camp.unitIds[0])!;

    // 触发战斗并受到伤害
    creep.neutral!.inCombat = true;
    creep.hp = creep.stats.maxHp * 0.5;

    // 拉扯到离营地 700 距离（超出 650 最大拉野范围）
    creep.pos = { x: creep.neutral!.spawnPos.x + 700, y: creep.neutral!.spawnPos.y };
    w.step();

    // 触发脱战回巢
    expect(creep.neutral?.inCombat).toBe(false);
    expect(creep.order.kind).toBe('moveTo');

    // 回巢移动过程中生命值恢复
    const hpBefore = creep.hp;
    w.step();
    expect(creep.hp).toBeGreaterThanOrEqual(hpBefore);
  });

  it('rewards gold and xp to killer hero and nearby allies on death', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    const heroRadiant = createHero(w, 'axe', Team.Radiant, false);
    const heroDire = createHero(w, 'sven', Team.Dire, false);

    const campRad = w.neutralCamps!.camps.find((c) => c.def.id === 'radiant_small')!;
    const radCreep = w.getUnit(campRad.unitIds[0])!;

    heroRadiant.pos = { x: radCreep.pos.x, y: radCreep.pos.y };
    const goldBefore = heroRadiant.hero!.gold;
    const xpBefore = heroRadiant.hero!.xp;

    killUnit(w, radCreep, heroRadiant);

    expect(heroRadiant.hero!.gold).toBeGreaterThan(goldBefore);
    expect(heroRadiant.hero!.xp).toBeGreaterThan(xpBefore);
    expect(heroRadiant.hero!.lastHits).toBe(1);

    // 夜魇英雄击杀夜魇野怪同样获得金钱与经验
    const campDire = w.neutralCamps!.camps.find((c) => c.def.id === 'dire_small')!;
    const direCreep = w.getUnit(campDire.unitIds[0])!;
    heroDire.pos = { x: direCreep.pos.x, y: direCreep.pos.y };
    const direGoldBefore = heroDire.hero!.gold;

    killUnit(w, direCreep, heroDire);
    expect(heroDire.hero!.gold).toBeGreaterThan(direGoldBefore);
  });

  it('respawns after 60s when cleared, but respects camp blocking', () => {
    const w = new World({ seed: 1, spawnCreeps: true });
    const hero = createHero(w, 'axe', Team.Radiant, false);
    const camp = w.neutralCamps!.camps[0];

    // 清理该野怪点
    for (const id of camp.unitIds) {
      killUnit(w, w.getUnit(id)!, hero);
    }
    expect(camp.unitIds.every((id) => !w.getUnit(id)?.alive)).toBe(true);

    // 还没到刷新时间：不刷新
    w.time = 50;
    w.step();
    expect(camp.unitIds.every((id) => !w.getUnit(id)?.alive)).toBe(true);

    // 英雄站在营地中间封野 (dist <= 300)
    hero.pos = { ...camp.def.pos };
    w.time = 65;
    w.step();
    expect(camp.unitIds.every((id) => !w.getUnit(id)?.alive)).toBe(true);

    // 英雄离开封野范围
    hero.pos = { x: camp.def.pos.x + 600, y: camp.def.pos.y };
    w.time = 80;
    w.step();
    // 成功刷新出新野怪
    expect(camp.unitIds.some((id) => w.getUnit(id)?.alive)).toBe(true);
  });
});

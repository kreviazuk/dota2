import { describe, it, expect } from 'vitest';
import { makeWorld, heroAt, spawnDummy } from '../helpers';
import { Team } from '../../src/sim/core/types';
import { TeamAI } from '../../src/ai/teamAI';
import { spawnRoshan, ROSHAN_PIT } from '../../src/sim/entities/roshan';
import { createBuildings } from '../../src/sim/systems/buildings';

describe('TeamAI strategic evaluation', () => {
  it('defaults to laning mode early game with creep line rally point', () => {
    const w = makeWorld();
    createBuildings(w);
    heroAt(w, 'axe', { x: 1500, y: 7000 }, { team: Team.Radiant });
    heroAt(w, 'sven', { x: 1500, y: 3000 }, { team: Team.Dire });

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('laning');
    expect(plan.rallyPoint).toBeDefined();
  });

  it('switches to defending when enemy units threaten the front tower', () => {
    const w = makeWorld();
    createBuildings(w);
    heroAt(w, 'axe', { x: 1500, y: 6500 }, { team: Team.Radiant });
    // T1 is at y=6100. Place enemy close to T1 (dist < 800)
    spawnDummy(w, { team: Team.Dire, pos: { x: 1500, y: 6200 } });

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('defending');
    // Rally point should be the threatened T1 tower
    expect(plan.rallyPoint.y).toBe(5800);
  });

  it('switches to pushing when enemy team is down in numbers', () => {
    const w = makeWorld();
    createBuildings(w);
    heroAt(w, 'axe', { x: 1500, y: 5500 }, { team: Team.Radiant });
    heroAt(w, 'sven', { x: 1500, y: 5600 }, { team: Team.Radiant });
    // Dire has only 1 hero alive
    const loneEnemy = heroAt(w, 'lina', { x: 1500, y: 3900 }, { team: Team.Dire });

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('pushing');
    expect(plan.priorityTargetId).toBe(loneEnemy.id);
  });

  it('engages in teamfight when multiple heroes are close to each other', () => {
    const w = makeWorld();
    createBuildings(w);
    heroAt(w, 'axe', { x: 1500, y: 5000 }, { team: Team.Radiant });
    heroAt(w, 'sven', { x: 1550, y: 5050 }, { team: Team.Radiant });
    const lowHpEnemy = heroAt(w, 'lina', { x: 1600, y: 5100 }, { team: Team.Dire });
    lowHpEnemy.hp = 200; // low HP target

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('teamfight');
    expect(plan.priorityTargetId).toBe(lowHpEnemy.id);
  });

  it('switches to roshan when roshan is alive, time >= 15:00 and team has advantage', () => {
    const w = makeWorld();
    createBuildings(w);
    w.time = 950;
    const roshan = spawnRoshan(w);

    // Radiant has 3 heroes alive with full health
    heroAt(w, 'axe', { x: 1500, y: 5500 }, { team: Team.Radiant });
    heroAt(w, 'sven', { x: 1500, y: 5600 }, { team: Team.Radiant });
    heroAt(w, 'pudge', { x: 1500, y: 5700 }, { team: Team.Radiant });
    // Dire only has 1 hero alive
    heroAt(w, 'lina', { x: 1500, y: 3900 }, { team: Team.Dire });

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('roshan');
    expect(plan.rallyPoint.x).toBe(ROSHAN_PIT.x);
    expect(plan.rallyPoint.y).toBe(ROSHAN_PIT.y);
    expect(plan.priorityTargetId).toBe(roshan.id);
  });

  it('switches to retreating when team has suffered heavy damage or wiped', () => {
    const w = makeWorld();
    createBuildings(w);
    const hero = heroAt(w, 'axe', { x: 1500, y: 5000 }, { team: Team.Radiant });
    hero.hp = 100; // critically low HP
    heroAt(w, 'lina', { x: 1500, y: 4800 }, { team: Team.Dire });
    heroAt(w, 'sven', { x: 1500, y: 4700 }, { team: Team.Dire });

    const teamAI = new TeamAI(Team.Radiant);
    const plan = teamAI.update(w);

    expect(plan.mode).toBe('retreating');
  });
});

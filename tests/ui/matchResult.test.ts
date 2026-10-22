import { describe, it, expect, vi } from 'vitest';
import {
  calculateMvpScore,
  evaluateMatchResult,
  renderMatchResultScreen,
} from '../../src/ui/matchResult';
import { makeWorld, heroAt } from '../helpers';
import { Team } from '../../src/sim/core/types';
import { grantItem } from '../../src/sim/items/inventory';
import { grantAegis } from '../../src/sim/items/aegis';
import type { Match } from '../../src/game/match';

describe('MVP Score Calculation', () => {
  it('computes exact score according to the balance formula', () => {
    // Score = Kills * 3 + Assists * 1.5 - Deaths * 2 + LastHits * 0.1 + (HeroDamage / 1000) * 1.2 + (BuildingDamage / 500) * 1.5
    const score = calculateMvpScore({
      kills: 10, // 30
      assists: 8, // 12
      deaths: 2, // -4
      lastHits: 120, // 12
      heroDamage: 25000, // 25 * 1.2 = 30
      buildingDamage: 4000, // 8 * 1.5 = 12
    });
    // Expected = 30 + 12 - 4 + 12 + 30 + 12 = 92
    expect(score).toBeCloseTo(92.0);
  });

  it('penalizes deaths and awards partial credit for farm and assists', () => {
    const feedScore = calculateMvpScore({
      kills: 0,
      assists: 1,
      deaths: 10,
      lastHits: 10,
      heroDamage: 1000,
      buildingDamage: 0,
    });
    // 0 + 1.5 - 20 + 1 + 1.2 + 0 = -16.3
    expect(feedScore).toBeCloseTo(-16.3);
  });
});

describe('Match Result Evaluation', () => {
  it('evaluates heroes, grants MVP to highest score, and assigns honors', () => {
    const w = makeWorld();
    const p1 = heroAt(w, 'axe', { x: -100, y: 0 });
    const p2 = heroAt(w, 'lina', { x: -100, y: 100 });
    const e1 = heroAt(w, 'sven', { x: 100, y: 0 }, { team: Team.Dire });

    // Axe: High kills and building damage
    p1.hero!.kills = 12;
    p1.hero!.deaths = 1;
    p1.hero!.assists = 4;
    p1.hero!.lastHits = 80;
    p1.hero!.damageDealt.heroes = 18000;
    p1.hero!.damageDealt.buildings = 5000;
    p1.hero!.hasShard = true;
    grantItem(w, p1, 'blink_dagger');
    grantItem(w, p1, 'black_king_bar');
    grantAegis(w, p1);

    // Lina: High assists, moderate farm, highest net worth
    p2.hero!.kills = 5;
    p2.hero!.deaths = 2;
    p2.hero!.assists = 14;
    p2.hero!.lastHits = 150;
    p2.hero!.gold = 10000;
    p2.hero!.damageDealt.heroes = 15000;
    p2.hero!.damageDealt.buildings = 1000;

    // Sven: Enemy hero
    e1.hero!.kills = 3;
    e1.hero!.deaths = 8;
    e1.hero!.assists = 2;
    e1.hero!.damageDealt.heroes = 8000;

    w.winner = Team.Radiant;
    w.time = 945; // 15分45秒

    const res = evaluateMatchResult(w, p1.id);

    expect(res.winner).toBe(Team.Radiant);
    expect(res.duration).toBe(945);
    expect(res.radiant.length).toBe(2);
    expect(res.dire.length).toBe(1);

    // Axe should be MVP
    expect(res.mvp).toBeDefined();
    expect(res.mvp?.unitId).toBe(p1.id);
    expect(res.mvp?.isMvp).toBe(true);
    expect(res.mvp?.hasShard).toBe(true);
    expect(res.mvp?.hasAegis).toBe(true);

    // Slayer is Axe (12 kills)
    expect(res.slayer?.unitId).toBe(p1.id);
    expect(res.slayer?.isSlayer).toBe(true);

    // Sieger is Axe (5000 bld damage)
    expect(res.sieger?.unitId).toBe(p1.id);
    expect(res.sieger?.isSieger).toBe(true);

    // Tycoon is Lina (10000 gold net worth)
    expect(res.tycoon?.unitId).toBe(p2.id);
    expect(res.tycoon?.isTycoon).toBe(true);

    // Items array has length 6
    expect(res.mvp?.items.length).toBe(6);
    expect(res.mvp?.items[0]).toBe('blink_dagger');
    expect(res.mvp?.items[1]).toBe('black_king_bar');
    expect(res.mvp?.items[2]).toBeNull();
  });
});

describe('Settlement Screen DOM Rendering', () => {
  it('renders result screen with complete structure and handles button clicks', () => {
    // In node environment without real DOM, mock document.createElement
    const createdElements: any[] = [];
    const origCreateElement = globalThis.document?.createElement;

    // If global document exists (or mock it)
    if (typeof document === 'undefined') {
      const mockElement = (tag: string) => {
        const listeners: Record<string, Function[]> = {};
        const el: any = {
          tagName: tag.toUpperCase(),
          className: '',
          innerHTML: '',
          children: [],
          style: {},
          appendChild: (c: any) => el.children.push(c),
          remove: vi.fn(),
          addEventListener: (evt: string, fn: Function) => {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
          },
          querySelector: (sel: string) => {
            return {
              addEventListener: (evt: string, fn: Function) => {
                listeners[sel + ':' + evt] = listeners[sel + ':' + evt] || [];
                listeners[sel + ':' + evt].push(fn);
              },
              click: () => {
                for (const fn of listeners[sel + ':click'] || []) fn();
              },
            };
          },
          querySelectorAll: () => [],
        };
        createdElements.push(el);
        return el;
      };
      (globalThis as any).document = { createElement: mockElement };
    }

    const w = makeWorld();
    const p1 = heroAt(w, 'axe', { x: 0, y: 0 });
    p1.hero!.kills = 5;
    p1.hero!.damageDealt.heroes = 12000;
    w.winner = Team.Radiant;

    const mockMatch: Match = {
      world: w,
      playerUnitId: p1.id,
    } as any;

    const parent: any = { appendChild: vi.fn() };
    const onRestart = vi.fn();
    const onMenu = vi.fn();

    const screen = renderMatchResultScreen(parent, mockMatch, onRestart, onMenu);

    expect(screen).toBeDefined();
    expect(screen.className).toContain('result-screen');
    expect(screen.innerHTML).toContain('胜利');
    expect(screen.innerHTML).toContain('MVP');
    expect(screen.innerHTML).toContain('再来一局');
    expect(screen.innerHTML).toContain('返回主菜单');

    // Trigger buttons
    const againBtn = screen.querySelector('.again');
    (againBtn as any)?.click?.();
    expect(onRestart).toHaveBeenCalledTimes(1);

    const menuBtn = screen.querySelector('.menu');
    (menuBtn as any)?.click?.();
    expect(onMenu).toHaveBeenCalledTimes(1);

    if (origCreateElement) {
      (globalThis as any).document.createElement = origCreateElement;
    }
  });
});

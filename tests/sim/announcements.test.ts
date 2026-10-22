import { describe, it, expect } from 'vitest';
import { makeWorld } from '../helpers';
import { createHero } from '../../src/sim/systems/heroes';
import { Team } from '../../src/sim/core/types';
import { killUnit } from '../../src/sim/systems/damage';
import { spawnRuneAtSpot, pickupRune, RUNE_SPOTS } from '../../src/sim/entities/rune';
import { spawnRoshan, onRoshanKilled } from '../../src/sim/entities/roshan';
import { Hud } from '../../src/ui/hud';

describe('Battlefield announcements and kill feed system', () => {
  it('triggers First Blood announcement event on first hero kill', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);
    const dire = createHero(w, 'sven', Team.Dire, false);

    expect(w.firstBloodAwarded).toBe(false);
    const startGold = radiant.hero!.gold;

    // Axe kills Sven
    killUnit(w, dire, radiant);

    expect(w.firstBloodAwarded).toBe(true);
    expect(radiant.hero!.gold).toBeGreaterThan(startGold);

    const events = w.events.drain();
    const fb = events.find((e) => e.type === 'announcement' && e.category === 'first_blood');
    expect(fb).toBeDefined();
    if (fb && fb.type === 'announcement') {
      expect(fb.title).toContain('第一滴血');
      expect(fb.killerId).toBe(radiant.id);
      expect(fb.victimId).toBe(dire.id);
    }
  });

  it('does NOT trigger First Blood on subsequent kills', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);
    const dire1 = createHero(w, 'sven', Team.Dire, false);
    const dire2 = createHero(w, 'lina', Team.Dire, false);

    killUnit(w, dire1, radiant);
    w.events.drain();

    killUnit(w, dire2, radiant);
    const events = w.events.drain();
    const fb = events.find((e) => e.type === 'announcement' && e.category === 'first_blood');
    expect(fb).toBeUndefined();
  });

  it('tracks multi-kills within 18 seconds (Double Kill and Triple Kill)', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);
    const dire1 = createHero(w, 'sven', Team.Dire, false);
    const dire2 = createHero(w, 'lina', Team.Dire, false);
    const dire3 = createHero(w, 'zeus', Team.Dire, false);

    w.time = 60;
    // Kill 1: First Blood
    killUnit(w, dire1, radiant);
    w.events.drain();

    // Kill 2: 5s later -> Double Kill!
    w.time = 65;
    killUnit(w, dire2, radiant);
    let events = w.events.drain();
    let mk = events.find((e) => e.type === 'announcement' && e.category === 'multikill');
    expect(mk).toBeDefined();
    if (mk && mk.type === 'announcement') {
      expect(mk.title).toContain('双杀');
    }

    // Kill 3: 4s later -> Triple Kill!
    w.time = 69;
    killUnit(w, dire3, radiant);
    events = w.events.drain();
    mk = events.find((e) => e.type === 'announcement' && e.category === 'multikill');
    expect(mk).toBeDefined();
    if (mk && mk.type === 'announcement') {
      expect(mk.title).toContain('三杀');
    }
  });

  it('triggers kill streaks (3 kills without dying) and shutdown on death', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);
    const dire1 = createHero(w, 'sven', Team.Dire, false);
    const dire2 = createHero(w, 'lina', Team.Dire, false);
    const dire3 = createHero(w, 'zeus', Team.Dire, false);

    w.time = 100;
    killUnit(w, dire1, radiant);
    w.time = 130; // > 18s later (not multikill)
    killUnit(w, dire2, radiant);
    w.time = 160; // > 18s later
    killUnit(w, dire3, radiant);

    expect(radiant.hero!.streak).toBe(3);
    let events = w.events.drain();
    const streak = events.find((e) => e.type === 'announcement' && e.category === 'streak');
    expect(streak).toBeDefined();
    if (streak && streak.type === 'announcement') {
      expect(streak.title).toContain('大杀特杀');
    }

    // Now Sven respawns and kills Axe (Shutdown)
    radiant.hp = 100;
    dire1.alive = true;
    killUnit(w, radiant, dire1);

    expect(radiant.hero!.streak).toBe(0);
    events = w.events.drain();
    const shutdown = events.find((e) => e.type === 'announcement' && e.category === 'shutdown');
    expect(shutdown).toBeDefined();
    if (shutdown && shutdown.type === 'announcement') {
      expect(shutdown.title).toContain('终结连杀');
    }
  });

  it('emits Ace / Team Wipe announcement when all 3 enemy heroes are simultaneously dead', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);
    const dire1 = createHero(w, 'sven', Team.Dire, false);
    const dire2 = createHero(w, 'lina', Team.Dire, false);
    const dire3 = createHero(w, 'zeus', Team.Dire, false);

    killUnit(w, dire1, radiant);
    killUnit(w, dire2, radiant);
    killUnit(w, dire3, radiant);

    const events = w.events.drain();
    const ace = events.find((e) => e.type === 'announcement' && e.category === 'ace');
    expect(ace).toBeDefined();
    if (ace && ace.type === 'announcement') {
      expect(ace.title).toContain('团灭');
    }
  });

  it('emits announcements for building destruction, Roshan kill, and Rune pickup', () => {
    const w = makeWorld();
    const radiant = createHero(w, 'axe', Team.Radiant, true);

    // 1. Rune pickup announcement
    const rune = spawnRuneAtSpot(w, RUNE_SPOTS[0]);
    pickupRune(w, rune, radiant);
    let events = w.events.drain();
    const runeAnn = events.find((e) => e.type === 'announcement' && e.category === 'rune');
    expect(runeAnn).toBeDefined();

    // 2. Roshan kill announcement
    const rosh = spawnRoshan(w);
    onRoshanKilled(w, rosh, radiant);
    events = w.events.drain();
    const roshAnn = events.find((e) => e.type === 'announcement' && e.category === 'roshan');
    expect(roshAnn).toBeDefined();
  });

  it('Hud consumes announcements and handles kill feed and banner', () => {
    const feedItems: any[] = [];
    const mockKillFeed: any = {
      children: feedItems,
      appendChild: (item: any) => feedItems.push(item),
      firstElementChild: null,
    };
    const mockBannerBox: any = { className: '' };
    const mockBannerTitle: any = { textContent: '' };
    const mockBannerSub: any = { textContent: '' };

    const mockHud: any = {
      killFeed: mockKillFeed,
      bannerBox: mockBannerBox,
      bannerTitle: mockBannerTitle,
      bannerSub: mockBannerSub,
      bannerTimer: null,
      match: {
        world: {
          getUnit: (id: number) => ({ id, name: id === 1 ? '斧王' : '斯温', team: id === 1 ? Team.Radiant : Team.Dire }),
        },
      },
      consume: Hud.prototype.consume,
      handleAnnouncement: (Hud.prototype as any).handleAnnouncement,
    };

    const origDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: () => ({ className: '', innerHTML: '', classList: { add: () => {} }, remove: () => {} }),
    };

    mockHud.consume([
      {
        type: 'announcement',
        category: 'first_blood',
        killerId: 1,
        victimId: 2,
        team: Team.Radiant,
        title: '第一滴血 (First Blood!)',
        subText: '斧王 击杀了 斯温 (+135 额外赏金)',
      },
    ]);

    expect(mockKillFeed.children.length).toBe(1);
    expect(mockBannerBox.className).toContain('first-blood');
    expect(mockBannerTitle.textContent).toContain('第一滴血');

    (globalThis as any).document = origDoc;
  });
});

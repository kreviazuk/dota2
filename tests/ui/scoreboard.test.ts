import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScoreboardModal } from '../../src/ui/scoreboard';
import { makeWorld, heroAt } from '../helpers';
import { Team } from '../../src/sim/core/types';
import { grantItem } from '../../src/sim/items/inventory';
import { grantAegis } from '../../src/sim/items/aegis';

interface MockEl {
  tagName: string;
  className: string;
  innerHTML: string;
  textContent: string;
  children: MockEl[];
  dataset: Record<string, string>;
  classList: {
    add: (c: string) => void;
    remove: (c: string) => void;
    contains: (c: string) => boolean;
  };
  appendChild: (c: MockEl) => void;
  prepend: (c: MockEl) => void;
  addEventListener: (evt: string, fn: Function) => void;
  querySelector: (sel: string) => any;
  querySelectorAll: (sel: string) => any[];
  click: () => void;
}

function createMockElement(tag: string): MockEl {
  const listeners: Record<string, Function[]> = {};
  const classes = new Set<string>();

  const el: MockEl = {
    tagName: tag.toUpperCase(),
    get className(): string {
      return [...classes].join(' ');
    },
    set className(val: string) {
      classes.clear();
      val.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    innerHTML: '',
    textContent: '',
    children: [],
    dataset: {},
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
    appendChild: (c: MockEl) => {
      el.children.push(c);
    },
    prepend: (c: MockEl) => {
      el.children.unshift(c);
    },
    addEventListener: (evt: string, fn: Function) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    click: () => {
      for (const fn of listeners['click'] || []) fn();
    },
  };
  return el;
}

describe('ScoreboardModal', () => {
  let origDoc: any;
  let parent: any;

  beforeEach(() => {
    origDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => createMockElement(tag),
    };
    parent = (globalThis as any).document.createElement('div');
  });

  afterEach(() => {
    (globalThis as any).document = origDoc;
  });

  it('initializes hidden and mounts to parent', () => {
    const sb = new ScoreboardModal(parent as any);
    expect(sb.visible).toBe(false);
    expect(sb.root.classList.contains('open')).toBe(false);
    expect(parent.children.includes(sb.root)).toBe(true);
    expect(sb.backdrop).toBeDefined();
    expect(sb.closeBtn).toBeDefined();
    expect(sb.content).toBeDefined();
  });

  it('toggles visibility and renders hero status, items, and net worth', () => {
    const w = makeWorld();
    const radHero = heroAt(w, 'juggernaut', { x: -100, y: 0 }, { team: Team.Radiant });
    const direHero = heroAt(w, 'pudge', { x: 100, y: 0 }, { team: Team.Dire });

    radHero.hero!.kills = 5;
    radHero.hero!.deaths = 1;
    radHero.hero!.assists = 3;
    radHero.hero!.gold = 2500;
    grantItem(w, radHero, 'phase_boots');
    grantItem(w, radHero, 'battle_fury');
    grantAegis(w, radHero);

    direHero.hero!.kills = 1;
    direHero.hero!.deaths = 4;
    direHero.hero!.assists = 2;
    direHero.hero!.gold = 1200;

    const sb = new ScoreboardModal(parent as any);
    sb.toggle(w, radHero.id);

    expect(sb.visible).toBe(true);
    expect(sb.root.classList.contains('open')).toBe(true);
    expect(sb.radScoreEl.textContent).toBe('0');
    expect(sb.direScoreEl.textContent).toBe('0');
    expect(sb.content.innerHTML).toContain('天辉方 (Radiant)');
    expect(sb.content.innerHTML).toContain('夜魇方 (Dire)');
    expect(sb.content.innerHTML).toContain('主宰');
    expect(sb.content.innerHTML).toContain('帕吉');
    expect(sb.content.innerHTML).toContain('is-me');
    expect(sb.content.innerHTML).toContain('👑 玩家');

    // Toggle again closes
    sb.toggle(w, radHero.id);
    expect(sb.visible).toBe(false);
    expect(sb.root.classList.contains('open')).toBe(false);
  });

  it('closes on backdrop or close button click', () => {
    const w = makeWorld();
    const radHero = heroAt(w, 'axe', { x: 0, y: 0 }, { team: Team.Radiant });
    const sb = new ScoreboardModal(parent as any);

    sb.show(w, radHero.id);
    expect(sb.visible).toBe(true);

    sb.closeBtn.click();
    expect(sb.visible).toBe(false);

    sb.show(w, radHero.id);
    expect(sb.visible).toBe(true);

    sb.backdrop.click();
    expect(sb.visible).toBe(false);
  });
});

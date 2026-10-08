import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/sim/world';
import { Team, type Difficulty } from '../src/sim/core/types';
import { createBuildings } from '../src/sim/systems/buildings';
import { createHero } from '../src/sim/systems/heroes';
import { killUnit } from '../src/sim/systems/damage';
import { giveXp, learnAbility } from '../src/sim/systems/progress';
import { xpToReach } from '../src/sim/data/xpTable';
import { SimpleAI } from '../src/ai/simpleAI';
import { nextSkillToLearn, SKILL_BUILDS } from '../src/ai/builds';
import { DIFFICULTY } from '../src/ai/difficulty';
import { TALENT_BUILDS } from '../src/ai/builds';
import { AI_RULES, aiRuleFor, type HeroAiRules } from '../src/ai/usage/index';
import { newAbilityInstance } from '../src/sim/systems/abilities';
import { refreshHero, setHeroLevel } from '../src/game/debug';
import type { Command } from '../src/sim/commands';

const setup = (difficulty: Difficulty = 'normal') => {
  const w = new World({ seed: 1, spawnCreeps: false });
  const b = createBuildings(w);
  const me = createHero(w, 'axe', Team.Radiant, false);
  const enemy = createHero(w, 'axe', Team.Dire, false);
  const ai = new SimpleAI(me.id, DIFFICULTY[difficulty].skill);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      ai.update(w);
      w.step();
    }
  };
  return { w, b, me, enemy, run };
};

describe('ai builds', () => {
  it('learns skills in the preset order', () => {
    const { w, me } = setup();
    giveXp(w, me, xpToReach(7, w.balance.economy.xpTableMult));
    expect(me.hero!.level).toBe(7);
    const learned: string[] = [];
    for (let slot = nextSkillToLearn(me); slot; slot = nextSkillToLearn(me)) {
      learned.push(slot);
      expect(learnAbility(w, me, slot)).toBe(true);
    }
    expect(learned).toEqual(SKILL_BUILDS.axe.slice(0, 7));
  });
});

describe('simple ai', () => {
  it('recalls when low on health and far from the fountain', () => {
    const { me, run } = setup();
    me.pos = { x: 1500, y: 5000 };
    me.hp = me.stats.maxHp * 0.2;
    run(0.5);
    expect(me.order.kind).toBe('recall');
  });
  it('finishes casting even when it thinks faster than the cast point (hard)', () => {
    const { me, enemy, run } = setup('hard');
    me.pos = { x: 1500, y: 5100 };
    enemy.pos = { x: 1500, y: 5000 };
    run(1.5);
    expect(me.ability('Q')!.level).toBe(1);
    expect(me.ability('Q')!.cooldown).toBeGreaterThan(0);
    expect(enemy.modifiers.some((m) => m.def.id === 'axe_berserkers_call_taunt')).toBe(true);
  });
  it('attacks the ancient without creep cover once its towers are down', () => {
    const { w, b, me, enemy, run } = setup();
    for (const k of ['t1', 't2', 't3', 't4a', 't4b'] as const) killUnit(w, b[Team.Dire][k], null);
    enemy.pos = { x: 1500, y: 4500 };
    me.pos = { x: 1500, y: 1000 };
    run(3);
    const ancient = b[Team.Dire].ancient;
    expect(ancient.hp).toBeLessThan(ancient.stats.maxHp);
    // 从正面进攻遗迹时泉水打不到
    expect(me.hp).toBe(me.stats.maxHp);
  });
  it('does not tank a tower without creeps while enemy heroes are alive', () => {
    const { w, b, me, enemy, run } = setup();
    enemy.pos = { x: 1500, y: 1500 };
    me.pos = { x: 1500, y: 4300 };
    run(2);
    const t1 = b[Team.Dire].t1;
    expect(t1.hp).toBe(t1.stats.maxHp);
    expect(me.pos.y).toBeGreaterThan(4300);
    void w;
  });
  it('pushes a tower without creeps when all enemy heroes are dead', () => {
    const { w, b, me, enemy, run } = setup();
    killUnit(w, enemy, null);
    me.pos = { x: 1500, y: 4300 };
    run(2);
    const t1 = b[Team.Dire].t1;
    expect(t1.hp).toBeLessThan(t1.stats.maxHp);
  });
});

describe('ai usage rules', () => {
  const arena = () => {
    const w = new World({ seed: 1, spawnCreeps: false });
    createBuildings(w);
    const me = createHero(w, 'axe', Team.Radiant, false);
    const enemy = createHero(w, 'axe', Team.Dire, false);
    me.pos = { x: 1500, y: 5100 };
    enemy.pos = { x: 1500, y: 4950 };
    return { w, me, enemy };
  };
  const casts = (cmds: Command[]) => cmds.filter((c) => c.type === 'cast' || c.type === 'toggle');

  it('every axe ability with a P1 rule has one in the usage table', () => {
    for (const id of ['axe_berserkers_call', 'axe_battle_hunger', 'axe_culling_blade']) expect(aiRuleFor(id)).toBe(AI_RULES[id]);
    expect(aiRuleFor('axe_counter_helix')).toBeUndefined();
  });

  it('rules are tried in priority order and only when castable', () => {
    const { w, me, enemy } = arena();
    me.ability('Q')!.level = 1;
    me.ability('R')!.level = 1;
    const q = vi.fn(() => ({ cast: {} }));
    const r = vi.fn(() => ({ cast: { unitId: enemy.id } }));
    const wRule = vi.fn(() => ({ cast: {} }));
    const rules: HeroAiRules = {
      axe_berserkers_call: { priority: 5, decide: q },
      axe_battle_hunger: { priority: 99, decide: wRule }, // 没学会：不考虑
      axe_culling_blade: { priority: 50, decide: r },
    };
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill, rules);
    expect(casts(ai.think(w, me))).toEqual([{ type: 'cast', slot: 'R', target: { unitId: enemy.id } }]);
    expect(r).toHaveBeenCalledTimes(1);
    expect(q).not.toHaveBeenCalled();
    expect(wRule).not.toHaveBeenCalled();
    // R 冷却中：不调用它的 decide，轮到 Q
    me.ability('R')!.cooldown = 10;
    expect(casts(ai.think(w, me))).toEqual([{ type: 'cast', slot: 'Q', target: {} }]);
    expect(r).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledTimes(1);
    expect(q.mock.calls[0]).toHaveLength(1);
    // 魔法不够：都不能放
    me.mana = 0;
    expect(casts(ai.think(w, me))).toEqual([]);
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('passes a filled context to the rule', () => {
    const { w, me, enemy } = arena();
    const ally = createHero(w, 'axe', Team.Radiant, false);
    ally.pos = { x: 1600, y: 5200 };
    me.ability('Q')!.level = 1;
    me.hp = me.stats.maxHp * 0.8;
    let seen: unknown = null;
    const ai = new SimpleAI(me.id, DIFFICULTY.hard.skill, {
      axe_berserkers_call: { decide: (c) => { seen = c; return null; } },
    });
    ai.think(w, me);
    expect(seen).toMatchObject({
      world: w, me, ab: me.ability('Q'), skill: DIFFICULTY.hard.skill, enemyHeroes: [enemy], allyHeroes: [ally], retreating: false,
    });
    expect((seen as { hpPct: number }).hpPct).toBeCloseTo(0.8);
  });

  it('escape rules are used while retreating', () => {
    const { w, me } = arena();
    me.ability('Q')!.level = 1;
    me.ability('W')!.level = 1;
    me.hp = me.stats.maxHp * 0.2;
    const esc = vi.fn(() => ({ cast: {} }));
    const normal = vi.fn(() => ({ cast: {} }));
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill, {
      axe_berserkers_call: { escape: true, decide: esc },
      axe_battle_hunger: { priority: 99, decide: normal },
    });
    const cmds = ai.think(w, me);
    expect(casts(cmds)).toEqual([{ type: 'cast', slot: 'Q', target: {} }]);
    expect(cmds.some((c) => c.type === 'moveTo')).toBe(false);
    expect(esc.mock.calls[0]).toMatchObject([{ retreating: true }]);
    expect(normal).not.toHaveBeenCalled();
    // 逃跑技能前摇中：不下移动指令（会打断它）
    for (const c of cmds) w.issue(me.id, c);
    w.step();
    expect(me.cast?.ability.def.id).toBe('axe_berserkers_call');
    expect(ai.think(w, me).filter((c) => c.type !== 'learn')).toEqual([]);
    // 逃跑规则不出手时照常往泉水走
    me.cast = null;
    me.order = { kind: 'idle' };
    me.ability('Q')!.cooldown = 10;
    expect(ai.think(w, me).some((c) => c.type === 'moveTo')).toBe(true);
    expect(normal).not.toHaveBeenCalled();
  });

  it('a disengage cast puts the AI into retreat for BALANCE.ai.disengageTime, without recalling, then it fights again', () => {
    const { w, me, enemy } = arena();
    me.ability('Q')!.level = 1;
    me.ability('W')!.level = 1;
    me.hp = me.stats.maxHp * 0.8;
    const esc = vi.fn(() => ({ cast: {}, disengage: true }));
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill, { axe_berserkers_call: { escape: true, decide: esc } });
    expect(casts(ai.think(w, me))).toEqual([{ type: 'cast', slot: 'Q', target: {} }]);
    expect(esc.mock.calls[0]).toMatchObject([{ retreating: false }]);
    me.ability('Q')!.cooldown = 100;
    // 撤退：往泉水走、不打敌方英雄；离泉水很远且附近没有敌人也不回城
    let cmds = ai.think(w, me);
    expect(cmds.some((c) => c.type === 'moveTo')).toBe(true);
    expect(cmds.some((c) => c.type === 'attack')).toBe(false);
    enemy.pos = { x: 1500, y: 2000 };
    expect(ai.think(w, me).some((c) => c.type === 'recall')).toBe(false);
    // 到时间后恢复正常（敌方英雄回到身边就打）
    enemy.pos = { x: 1500, y: 4950 };
    enemy.hp = enemy.stats.maxHp * 0.3;
    w.time += w.balance.ai.disengageTime + 0.01;
    cmds = ai.think(w, me);
    expect(cmds.some((c) => c.type === 'attack' && c.targetId === enemy.id)).toBe(true);
  });

  it('only whileCasting rules are tried while casting', () => {
    const { w, me, enemy } = arena();
    me.ability('Q')!.level = 1;
    me.ability('W')!.level = 1;
    const during = vi.fn(() => ({ cast: {} }));
    const normal = vi.fn(() => ({ cast: { unitId: enemy.id } }));
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill, {
      axe_berserkers_call: { whileCasting: true, decide: during },
      axe_battle_hunger: { priority: 99, decide: normal },
    });
    w.issue(me.id, { type: 'cast', slot: 'W', target: { unitId: enemy.id } });
    w.step();
    expect(me.cast).not.toBeNull();
    normal.mockClear();
    expect(casts(ai.think(w, me))).toEqual([{ type: 'cast', slot: 'Q', target: {} }]);
    expect(normal).not.toHaveBeenCalled();
  });

  it('toggle decisions issue toggle commands', () => {
    const { w, me } = arena();
    const tog = newAbilityInstance({
      id: 'test_ai_toggle', name: '开关', description: '', slot: 'X2', maxLevel: 1, targetType: 'toggle', values: {},
    });
    tog.level = 1;
    me.abilities.push(tog);
    const ai = new SimpleAI(me.id, DIFFICULTY.normal.skill, { test_ai_toggle: { decide: () => ({ toggle: true }) } });
    const cmds = casts(ai.think(w, me));
    expect(cmds).toEqual([{ type: 'toggle', slot: 'X2' }]);
    for (const c of cmds) w.issue(me.id, c);
    w.step();
    expect(tog.toggled).toBe(true);
  });

  it('debug.setHeroLevel learns the build and talents', () => {
    const { w, me, enemy } = arena();
    setHeroLevel(w, me, 12);
    expect(me.hero!.level).toBe(12);
    expect(me.hero!.skillPoints).toBe(0);
    const expected: Record<string, number> = {};
    for (const s of SKILL_BUILDS.axe.slice(0, 12)) expected[s] = (expected[s] ?? 0) + 1;
    for (const s of ['Q', 'W', 'E', 'R'] as const) expect(me.ability(s)!.level).toBe(expected[s] ?? 0);
    expect(me.hero!.talents).toEqual([TALENT_BUILDS.axe[0], null, null, null]);
    // 只给技能点、不选天赋；队伍经验倍率不影响结果
    w.teams[Team.Dire].xpMult = 1.15;
    setHeroLevel(w, enemy, 25, { learn: 'none', talents: false });
    expect(enemy.hero!.level).toBe(25);
    expect(enemy.hero!.skillPoints).toBe(25);
    expect(enemy.hero!.talents).toEqual([null, null, null, null]);
    setHeroLevel(w, enemy, 25);
    expect(enemy.hero!.talents).toEqual(TALENT_BUILDS.axe);
    expect(enemy.abilities.filter((a) => a.def.slot !== 'innate').every((a) => a.level === a.def.maxLevel)).toBe(true);
    // refreshHero：满血满蓝，冷却清零
    me.hp = 10;
    me.mana = 0;
    me.ability('Q')!.cooldown = 7;
    refreshHero(w, me);
    expect(me.hp).toBe(me.stats.maxHp);
    expect(me.mana).toBe(me.stats.maxMana);
    expect(me.ability('Q')!.cooldown).toBe(0);
  });
});

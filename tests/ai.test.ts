import { describe, it, expect } from 'vitest';
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

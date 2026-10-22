import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import { xpToReach } from '../sim/data/xpTable';
import { giveXp, learnAbility } from '../sim/systems/progress';
import { abilityMaxCharges } from '../sim/systems/abilities';
import { canPickTalent, pickTalent } from '../sim/talents';
import { nextSkillToLearn, TALENT_BUILDS } from '../ai/builds';

export interface SetLevelOpts {
  /** 'build'（缺省）：按 SKILL_BUILDS 用完技能点；'none'：只给技能点 */
  learn?: 'build' | 'none';
  /** 按 TALENT_BUILDS 选完已解锁的天赋（缺省 true） */
  talents?: boolean;
}

/**
 * 把英雄的经验设到 level 级（只升不降，上限 BALANCE.economy.levelCap），按选项加点和选天赋。
 * 测试、开发钩子和 AI 冒烟测试共用。
 */
export function setHeroLevel(world: World, u: Unit, level: number, o: SetLevelOpts = {}): void {
  const h = u.hero;
  if (!h) return;
  const e = world.balance.economy;
  const target = Math.min(Math.max(1, Math.floor(level)), e.levelCap);
  if (target > h.level) {
    // giveXp 会乘以队伍经验倍率，这里先除掉；多给 1 点防止浮点误差差一点升不上去
    const need = xpToReach(target, e.xpTableMult) - h.xp + 1;
    giveXp(world, u, need / (world.teams[u.team].xpMult || 1));
  }
  if ((o.learn ?? 'build') === 'build') {
    for (let slot = nextSkillToLearn(u); slot; slot = nextSkillToLearn(u)) {
      if (!learnAbility(world, u, slot)) break;
    }
  }
  if (o.talents ?? true) {
    for (const tier of [0, 1, 2, 3] as const) {
      if (canPickTalent(world, u, tier)) pickTalent(world, u, tier, TALENT_BUILDS[u.defId]?.[tier] ?? 0);
    }
  }
}

/** 满血满蓝，冷却和充能清零（充能补满） */
export function refreshHero(world: World, u: Unit): void {
  if (!u.alive) return;
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  for (const ab of u.abilities) {
    ab.cooldown = 0;
    ab.chargeTimer = 0;
    ab.chargeTimers = [];
    const max = abilityMaxCharges(u, ab);
    if (max > 0) ab.charges = max;
  }
  void world;
}

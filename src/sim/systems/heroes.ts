import type { World } from '../world';
import { Unit, newHeroState, type UnitBase } from '../entities/unit';
import type { Team } from '../core/types';
import type { Vec2 } from '../core/vec2';
import { forwardY, layoutFor } from '../data/map';
import { respawnTime } from '../formulas';
import { getHeroDef } from '../heroes/index';
import { recomputeStats } from '../stats';
import { newAbilityInstance, syncPassives } from './abilities';
import { giveGold } from './progress';
import { disjointProjectiles } from './projectiles';
import { isDisabled } from '../query';

export function heroSpawnPoint(world: World, team: Team, index: number): Vec2 {
  void world;
  const f = layoutFor(team).fountain;
  return { x: f.x + (index - 1) * 80, y: f.y + forwardY(team) * 150 };
}

export function createHero(world: World, heroId: string, team: Team, playerControlled: boolean): Unit {
  const def = getHeroDef(heroId);
  const hb = world.balance.hero;
  const base: UnitBase = {
    maxHp: hb.baseHp, hpRegen: def.baseHpRegen, maxMana: hb.baseMana, manaRegen: def.baseManaRegen, armor: def.baseArmor,
    magicResist: hb.baseMagicResist, damageMin: def.baseDamage[0], damageMax: def.baseDamage[1], bat: def.bat,
    attackSpeed: def.baseAttackSpeed, attackPoint: def.attackPoint, attackRange: def.attackRange,
    projectileSpeed: def.projectileSpeed, moveSpeed: def.moveSpeed, acquireRange: Math.max(600, def.attackRange + 200),
  };
  const index = world.heroes(team).length;
  const u = new Unit({
    id: world.allocId(), kind: 'hero', team, defId: heroId, name: def.name, pos: heroSpawnPoint(world, team, index),
    radius: hb.radius, base, attackClass: 'hero', armorClass: 'hero',
  });
  u.hero = newHeroState(heroId, { primary: def.primary, str: def.str, agi: def.agi, int: def.int }, playerControlled, world.balance.economy.startingGold);
  u.abilities = def.abilities.map(newAbilityInstance);
  world.addUnit(u);
  syncPassives(world, u);
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  return u;
}

export function respawnHero(world: World, u: Unit): void {
  u.alive = true;
  u.deathTime = -1;
  u.order = { kind: 'idle' };
  u.cast = null;
  u.motion = null;
  u.attack = { targetId: null, windup: -1, cooldown: 0 };
  const idx = world.heroes(u.team).indexOf(u);
  u.pos = heroSpawnPoint(world, u.team, idx);
  u.prevPos = { ...u.pos };
  recomputeStats(world, u);
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  world.events.emit({ type: 'respawn', unitId: u.id });
}

export function updateHeroes(world: World, dt: number): void {
  const perSec = world.balance.economy.passiveGoldPerMin / 60;
  for (const u of world.units) {
    const h = u.hero;
    if (!h) continue;
    giveGold(world, u, perSec * dt, false);
    if (h.creepAggroCd > 0) h.creepAggroCd -= dt;
    if (!u.alive) {
      h.respawnTimer -= dt;
      if (h.respawnTimer <= 1e-6) respawnHero(world, u);
      continue;
    }
    if (u.order.kind === 'recall') {
      const o = u.order;
      // 受到伤害、眩晕或被强制位移都会打断回城
      if (h.lastDamagedTime >= o.startedAt || isDisabled(u)) {
        u.order = { kind: 'idle' };
        continue;
      }
      o.remaining -= dt;
      if (o.remaining <= 1e-6) {
        u.pos = heroSpawnPoint(world, u.team, world.heroes(u.team).indexOf(u));
        u.prevPos = { ...u.pos };
        u.order = { kind: 'idle' };
        // 回城传送会躲掉飞行中的弹道（Dota 规则），否则弹道会跟着飞到泉水
        disjointProjectiles(world, u);
        world.events.emit({ type: 'fx', kind: 'recall', pos: { ...u.pos }, unitId: u.id });
      }
    }
  }
}

export function onHeroKilled(world: World, victim: Unit, killer: Unit | null): void {
  void killer;
  if (!victim.hero) return;
  victim.hero.respawnTimer = respawnTime(victim.hero.level, world.balance);
}

import { Rng } from './core/rng';
import { EventBus } from './core/events';
import { DT } from './core/constants';
import { Team } from './core/types';
import { cloneBalance, type Balance } from './data/balance';
import type { Unit } from './entities/unit';
import type { Projectile } from './entities/projectile';
import type { AreaEffect } from './entities/effect';
import { tickModifiers } from './modifiers';
import { recomputeStats } from './stats';
import { applyCommand, type Command } from './commands';
import { updateMovement } from './systems/movement';
import { updateAttacks } from './systems/attack';
import { updateBuildings, onBuildingKilled } from './systems/buildings';
import { updateProjectiles, updateEffects } from './systems/projectiles';
import { updateAbilities } from './systems/abilities';
import { updateSpawner, updateCreepAI } from './systems/creeps';
import { updateHeroes, onHeroKilled } from './systems/heroes';
import { onUnitKilledEconomy } from './systems/economy';

export interface WorldConfig {
  seed: number;
  balance?: Balance;
  recordEvents?: boolean;
  /** 是否自动刷兵（测试里通常关闭） */
  spawnCreeps?: boolean;
}

export interface TeamState {
  superCreeps: boolean;
  kills: number;
  goldMult: number;
  xpMult: number;
  eliteMult: number;
}

export type SystemFn = (world: World, dt: number) => void;
export type KillListener = (world: World, victim: Unit, killer: Unit | null) => void;

const newTeamState = (): TeamState => ({ superCreeps: false, kills: 0, goldMult: 1, xpMult: 1, eliteMult: 1 });

export class World {
  time = 0;
  tick = 0;
  readonly rng: Rng;
  readonly balance: Balance;
  readonly events: EventBus;
  readonly config: Required<Omit<WorldConfig, 'balance'>>;
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  effects: AreaEffect[] = [];
  winner: Team | null = null;
  spawner: { nextWaveTime: number; waveIndex: number };
  readonly teams: Record<Team, TeamState> = { [Team.Radiant]: newTeamState(), [Team.Dire]: newTeamState() };
  readonly systems: SystemFn[] = [];
  readonly killListeners: KillListener[] = [];
  private byId = new Map<number, Unit>();
  private pending: { unitId: number; cmd: Command }[] = [];
  private nextId = 1;

  constructor(cfg: WorldConfig) {
    this.rng = new Rng(cfg.seed);
    this.balance = cfg.balance ?? cloneBalance();
    this.events = new EventBus(cfg.recordEvents ?? false);
    this.spawner = { nextWaveTime: this.balance.waves.firstWaveTime, waveIndex: 0 };
    this.config = { seed: cfg.seed, recordEvents: cfg.recordEvents ?? false, spawnCreeps: cfg.spawnCreeps ?? true };
    // 系统执行顺序（后续任务在对应位置插入）：
    // spawner → heroes → buildings → creepAI → abilities → attacks → movement → projectiles → effects → regen
    this.systems.push(updateSpawner, updateHeroes, updateBuildings, updateCreepAI, updateAbilities, updateAttacks, updateMovement, updateProjectiles, updateEffects, updateRegen);
    this.killListeners.push(onBuildingKilled, onUnitKilledEconomy, onHeroKilled);
  }

  allocId(): number {
    return this.nextId++;
  }

  addUnit(u: Unit, fullHp = true): Unit {
    this.units.push(u);
    this.byId.set(u.id, u);
    recomputeStats(this, u);
    if (fullHp) {
      u.hp = u.stats.maxHp;
      u.mana = u.stats.maxMana;
    }
    return u;
  }

  getUnit(id: number | null | undefined): Unit | undefined {
    return id == null ? undefined : this.byId.get(id);
  }

  issue(unitId: number, cmd: Command): void {
    this.pending.push({ unitId, cmd });
  }

  heroes(team?: Team): Unit[] {
    return this.units.filter((u) => u.kind === 'hero' && (team === undefined || u.team === team));
  }

  step(): void {
    if (this.winner !== null) return;
    this.time += DT;
    this.tick++;
    for (const u of this.units) {
      u.prevPos.x = u.pos.x;
      u.prevPos.y = u.pos.y;
    }
    for (const p of this.projectiles) {
      p.prevPos.x = p.pos.x;
      p.prevPos.y = p.pos.y;
    }
    const pending = this.pending;
    this.pending = [];
    for (const { unitId, cmd } of pending) {
      const u = this.byId.get(unitId);
      if (u) applyCommand(this, u, cmd);
    }
    for (const u of this.units) if (u.alive) tickModifiers(this, u, DT);
    for (const u of this.units) if (u.alive) recomputeStats(this, u);
    for (const sys of this.systems) {
      sys(this, DT);
      if (this.winner !== null) break;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.units.some((u) => u.removed)) {
      for (const u of this.units) if (u.removed) this.byId.delete(u.id);
      this.units = this.units.filter((u) => !u.removed);
    }
    if (this.projectiles.some((p) => p.done)) this.projectiles = this.projectiles.filter((p) => !p.done);
    if (this.effects.some((e) => e.done)) this.effects = this.effects.filter((e) => !e.done);
  }
}

function updateRegen(world: World, dt: number): void {
  for (const u of world.units) {
    if (!u.alive) continue;
    if (u.hp < u.stats.maxHp) u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.hpRegen * dt);
    if (u.mana < u.stats.maxMana) u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.manaRegen * dt);
  }
}

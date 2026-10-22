import { World } from '../sim/world';
import type { Balance } from '../sim/data/balance';
import { Team, type Difficulty } from '../sim/core/types';
import type { Lane } from '../sim/data/map';
import { createBuildings } from '../sim/systems/buildings';
import { createHero } from '../sim/systems/heroes';
import type { Command } from '../sim/commands';
import { SimpleAI } from '../ai/simpleAI';
import { DIFFICULTY } from '../ai/difficulty';

export interface MatchConfig {
  seed: number;
  radiantHeroes: string[];
  direHeroes: string[];
  /** 玩家控制的天辉英雄下标；null = 全部由 AI 控制 */
  playerSlot: number | null;
  difficulty: Difficulty;
  recordEvents?: boolean;
  balance?: Balance;
}

export class Match {
  readonly world: World;
  readonly playerUnitId: number | null;
  readonly ais: SimpleAI[] = [];
  /** 暂停全部 AI（开发钩子 __game.debug.freezeAI，截图脚本用来摆场景） */
  aiPaused = false;

  constructor(readonly cfg: MatchConfig) {
    const w = new World({ seed: cfg.seed, balance: cfg.balance, recordEvents: cfg.recordEvents ?? false });
    this.world = w;
    createBuildings(w);
    const d = DIFFICULTY[cfg.difficulty];
    const dire = w.teams[Team.Dire];
    dire.goldMult = d.econMult;
    dire.xpMult = d.econMult;
    dire.eliteMult = d.eliteMult;
    const is3v3orLess = cfg.radiantHeroes.length <= 3;
    const DEFAULT_LANES: readonly Lane[] = is3v3orLess
      ? ['mid', 'mid', 'mid']
      : ['mid', 'top', 'top', 'bot', 'bot'];
    let player: number | null = null;
    cfg.radiantHeroes.forEach((id, i) => {
      const isPlayer = i === cfg.playerSlot;
      const u = createHero(w, id, Team.Radiant, isPlayer);
      const lane = DEFAULT_LANES[i % DEFAULT_LANES.length];
      if (isPlayer) player = u.id;
      else this.ais.push(new SimpleAI(u.id, DIFFICULTY.normal.skill, undefined, lane));
    });
    cfg.direHeroes.forEach((id, i) => {
      const u = createHero(w, id, Team.Dire, false);
      const lane = DEFAULT_LANES[i % DEFAULT_LANES.length];
      this.ais.push(new SimpleAI(u.id, d.skill, undefined, lane));
    });
    this.playerUnitId = player;
  }

  get over(): boolean {
    return this.world.winner !== null;
  }

  step(playerCommands: readonly Command[] = []): void {
    if (this.playerUnitId !== null) for (const c of playerCommands) this.world.issue(this.playerUnitId, c);
    if (!this.aiPaused) for (const ai of this.ais) ai.update(this.world);
    this.world.step();
  }
}

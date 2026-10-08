import { World } from '../sim/world';
import type { Balance } from '../sim/data/balance';
import { Team, type Difficulty } from '../sim/core/types';
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
    let player: number | null = null;
    cfg.radiantHeroes.forEach((id, i) => {
      const isPlayer = i === cfg.playerSlot;
      const u = createHero(w, id, Team.Radiant, isPlayer);
      if (isPlayer) player = u.id;
      else this.ais.push(new SimpleAI(u.id, DIFFICULTY.normal.skill));
    });
    for (const id of cfg.direHeroes) {
      const u = createHero(w, id, Team.Dire, false);
      this.ais.push(new SimpleAI(u.id, d.skill));
    }
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

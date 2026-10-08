import { Match } from '../src/game/match';
import { setHeroLevel } from '../src/game/debug';

export interface SkirmishOpts {
  /** 游戏秒数，缺省 180 */
  seconds?: number;
  seed?: number;
  /** 开局前修改 World（例如给影魔 20 个灵魂）；在所有英雄升到 12 级之后调用 */
  setup?: (m: Match) => void;
}

/**
 * 天辉 [id, axe, axe] 对夜魇 [id, axe, axe]，全部 setHeroLevel(12, 按 build 加点 + 天赋)，跑 seconds 游戏秒，
 * 每个逻辑帧 drain 事件，收集这两个 <id> 英雄的 cast 事件里的技能 id。
 */
export function abilitiesCastInSkirmish(heroId: string, o: SkirmishOpts = {}): Set<string> {
  const m = new Match({
    seed: o.seed ?? 1, radiantHeroes: [heroId, 'axe', 'axe'], direHeroes: [heroId, 'axe', 'axe'], playerSlot: null,
    difficulty: 'normal', recordEvents: true,
  });
  const w = m.world;
  for (const h of w.heroes()) setHeroLevel(w, h, 12);
  o.setup?.(m);
  const ids = new Set(w.heroes().filter((h) => h.defId === heroId).map((h) => h.id));
  const cast = new Set<string>();
  const n = Math.round((o.seconds ?? 180) * 30);
  for (let i = 0; i < n && !m.over; i++) {
    m.step();
    for (const e of w.events.drain()) if (e.type === 'cast' && ids.has(e.unitId)) cast.add(e.abilityId);
  }
  return cast;
}

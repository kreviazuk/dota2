import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import { enemyTeam, Team } from '../sim/core/types';
import type { Vec2 } from '../sim/core/vec2';
import { dist } from '../sim/core/vec2';
import { layoutFor, MAP } from '../sim/data/map';
import { getLiveRoshan, ROSHAN_PIT } from '../sim/entities/roshan';

export type TeamMode =
  | 'laning'       // 前期对线期（前 3 分钟或兵线均匀）
  | 'pushing'      // 推进进攻（敌方减员或己方兵线占优）
  | 'defending'    // 防守（兵线压近己方防御塔或己方减员）
  | 'retreating'   // 撤退溃退（全队低血、团战不利）
  | 'teamfight'    // 正面交火（双方多名英雄短兵相接）
  | 'roshan';      // 击杀肉山（肉山存活且敌方减员或兵线安全）

export interface TeamPlan {
  mode: TeamMode;
  /** 团队建议集结/战线坐标 */
  rallyPoint: Vec2;
  /** 团队建议优先集火目标（例如残血敌方英雄、关键输出或肉山） */
  priorityTargetId: number | null;
  /** 计划更新时间点 */
  updatedAt: number;
}

/** 宏观团队战略层（每 1.0 秒周期运行一次） */
export class TeamAI {
  private lastUpdate = -1;
  private plan: TeamPlan;

  constructor(readonly team: Team) {
    this.plan = {
      mode: 'laning',
      rallyPoint: { x: MAP.laneX, y: 5000 },
      priorityTargetId: null,
      updatedAt: 0,
    };
  }

  getPlan(): TeamPlan {
    return this.plan;
  }

  update(world: World): TeamPlan {
    if (world.time < this.lastUpdate + 1.0) {
      return this.plan;
    }
    this.lastUpdate = world.time;
    this.plan = this.evaluate(world);
    return this.plan;
  }

  evaluate(world: World): TeamPlan {
    const t = world.time;
    const oppTeam = enemyTeam(this.team);
    const myHeroes = world.heroes(this.team).filter((h) => h.alive);
    const oppHeroes = world.heroes(oppTeam).filter((h) => h.alive);

    const myHpAvg = myHeroes.length
      ? myHeroes.reduce((s, h) => s + h.hp / h.stats.maxHp, 0) / myHeroes.length
      : 0;

    const L = layoutFor(this.team);
    const oppL = layoutFor(oppTeam);

    // 寻找己方最前沿存活防御塔
    const myTowers = world.units.filter(
      (u) => u.team === this.team && u.alive && u.kind === 'building' && u.building?.type === 'tower',
    );
    // 按推进方向由前到后排序（y 坐标离中路最近的在前）
    myTowers.sort((a, b) => Math.abs(a.pos.y - 5000) - Math.abs(b.pos.y - 5000));
    const frontMyTower = myTowers[0];

    // 寻找敌方最前沿存活防御塔
    const oppTowers = world.units.filter(
      (u) => u.team === oppTeam && u.alive && u.kind === 'building' && u.building?.type === 'tower',
    );
    oppTowers.sort((a, b) => Math.abs(a.pos.y - 5000) - Math.abs(b.pos.y - 5000));
    const frontOppTower = oppTowers[0];

    // 检查是否有敌方单位在冲击己方前沿防御塔
    const underThreat = frontMyTower
      ? world.units.some(
          (u) => u.team === oppTeam && u.alive && dist(u.pos, frontMyTower.pos) <= 800,
        )
      : false;

    // 检查双方英雄交火接触（是否有 2+ 名英雄在 900 范围内）
    let fightCenter: Vec2 | null = null;
    let inFightEnemies: Unit[] = [];
    for (const me of myHeroes) {
      const nearEnemies = oppHeroes.filter((op) => dist(me.pos, op.pos) <= 900);
      if (nearEnemies.length > 0) {
        fightCenter = { ...me.pos };
        inFightEnemies = nearEnemies;
        break;
      }
    }

    // 检查肉山状态
    const roshan = getLiveRoshan(world);

    // === 策略状态机决策 ===
    let mode: TeamMode = 'laning';
    let rallyPoint: Vec2 = { x: MAP.laneX, y: 5000 };
    let priorityTargetId: number | null = null;

    // 1. 撤退判断（全队阵亡或极度残血劣势）
    if (myHeroes.length === 0 || (myHeroes.length < oppHeroes.length && myHpAvg < 0.35)) {
      mode = 'retreating';
      rallyPoint = frontMyTower ? { ...frontMyTower.pos } : { ...L.fountain };
    }
    // 2. 塔下防守判断（防御塔受压制且己方存活）
    else if (underThreat && frontMyTower) {
      mode = 'defending';
      rallyPoint = { ...frontMyTower.pos };
      const nearestThreat = oppHeroes.find((op) => dist(op.pos, frontMyTower.pos) <= 800);
      if (nearestThreat) priorityTargetId = nearestThreat.id;
    }
    // 3. 肉山击杀判断（肉山存活、己方占人数优势且血量充足）
    else if (
      roshan &&
      roshan.alive &&
      t >= 900 &&
      myHeroes.length >= 2 &&
      myHeroes.length > oppHeroes.length &&
      myHpAvg >= 0.60
    ) {
      mode = 'roshan';
      rallyPoint = { ...ROSHAN_PIT };
      priorityTargetId = roshan.id;
    }
    // 4. 正面团战判断（双方英雄在 900 距离内接战且状态允许）
    else if (fightCenter && inFightEnemies.length > 0 && myHpAvg >= 0.35) {
      mode = 'teamfight';
      rallyPoint = fightCenter;
      // 优先集火血量百分比最低的敌方英雄
      inFightEnemies.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
      priorityTargetId = inFightEnemies[0].id;
    }
    // 5. 推进推线判断（敌方减员、或对局进入中期且前线安全）
    else if (oppHeroes.length < myHeroes.length || (t >= 180 && myHpAvg > 0.60)) {
      mode = 'pushing';
      rallyPoint = frontOppTower ? { ...frontOppTower.pos } : { ...oppL.ancient };
      const oppAncient = world.units.find((u) => u.team === oppTeam && u.building?.type === 'ancient' && u.alive);
      const lowOpp = oppHeroes.filter((h) => h.hp / h.stats.maxHp <= 0.4).sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      if (lowOpp) {
        priorityTargetId = lowOpp.id;
      } else if (!frontOppTower && oppAncient) {
        priorityTargetId = oppAncient.id;
      } else if (oppHeroes.length > 0) {
        oppHeroes.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp);
        priorityTargetId = oppHeroes[0].id;
      }
    }
    // 6. 对线期均衡对决
    else {
      mode = 'laning';
      // 寻找最前沿小兵推线点
      const myCreeps = world.units.filter((u) => u.team === this.team && u.alive && u.kind === 'creep');
      if (myCreeps.length > 0) {
        // 天辉向 y 小的方向走，夜魇向 y 大的方向走
        myCreeps.sort((a, b) => (this.team === Team.Radiant ? a.pos.y - b.pos.y : b.pos.y - a.pos.y));
        rallyPoint = { x: MAP.laneX, y: myCreeps[0].pos.y };
      } else {
        rallyPoint = { x: MAP.laneX, y: 5000 };
      }
      if (oppHeroes.length > 0) {
        const lowestOpp = [...oppHeroes].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
        if (lowestOpp.hp / lowestOpp.stats.maxHp <= 0.4) {
          priorityTargetId = lowestOpp.id;
        }
      }
    }

    return {
      mode,
      rallyPoint,
      priorityTargetId,
      updatedAt: t,
    };
  }
}

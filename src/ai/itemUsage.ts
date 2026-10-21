import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Command } from '../sim/commands';
import { add, dist, normalize, scale, sub } from '../sim/core/vec2';
import { layoutFor } from '../sim/data/map';
import { getItemDef } from '../sim/items/definitions';
import { findModifier } from '../sim/modifiers';

export interface AiItemCtx {
  enemyHeroes: Unit[];
  allyHeroes: Unit[];
  hpPct: number;
  manaPct: number;
  retreating: boolean;
}

/**
 * AI 物品战术智能施法规则
 */
export function decideItemUsage(world: World, me: Unit, ctx: AiItemCtx): Command | null {
  if (!me.alive || me.order.kind === 'recall' || me.hasState('busy')) return null;

  const { enemyHeroes, allyHeroes, hpPct, manaPct, retreating } = ctx;
  const L = layoutFor(me.team);

  for (let i = 0; i < me.inventory.length; i++) {
    const item = me.inventory[i];
    if (!item) continue;
    if ((item.cooldownRemaining ?? 0) > 0) continue;

    const def = getItemDef(item.id);
    const active = def?.active;
    if (!active) continue;

    switch (item.id) {
      // 1. 黑皇杖：团战受控或敌方人数劣势时开启减益免疫
      case 'black_king_bar': {
        const inFight = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 700);
        const isStunnedOrSilenced = me.hasState('stunned') || me.hasState('silenced') || me.hasState('disarmed');
        if (isStunnedOrSilenced || (inFight && (hpPct < 0.75 || enemyHeroes.length >= 2))) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 2. 闪烁匕首：撤退时往泉水跳；突进时往最近敌方跳
      case 'blink_dagger': {
        if (retreating) {
          const dir = normalize(sub(L.fountain, me.pos));
          const point = add(me.pos, scale(dir, 1200));
          return { type: 'useItem', index: i, target: { point } };
        } else if (hpPct > 0.6 && enemyHeroes.length > 0) {
          // 突进：如果最近敌人距离在 400 ~ 1200 之间，跳到敌方身边近战开打
          const nearest = enemyHeroes[0];
          const d = dist(me.pos, nearest.pos);
          if (d >= 400 && d <= 1200) {
            return { type: 'useItem', index: i, target: { point: { ...nearest.pos } } };
          }
        }
        break;
      }

      // 3. 刃甲：受到攻击或血量低时开启反伤
      case 'blade_mail': {
        const nearEnemy = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 600);
        if (nearEnemy && (hpPct < 0.8 || me.stats.tauntedBy !== null)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 4. 相位鞋：追击或撤退时开启加速穿行
      case 'phase_boots': {
        if (retreating || (enemyHeroes.length > 0 && dist(me.pos, enemyHeroes[0].pos) > me.stats.attackRange + 150)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 5. 动力鞋：属性智能切换（低血切力，缺蓝切智）
      case 'power_treads': {
        if (hpPct < 0.4 && item.selectedStat !== 'str') {
          return { type: 'useItem', index: i };
        } else if (manaPct < 0.3 && item.selectedStat !== 'int') {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 6. 梅肯斯姆：自身或友军低血群体回复与加甲
      case 'mekansm': {
        const lowSelf = hpPct < 0.55;
        const lowAlly = allyHeroes.some((a) => a.hp / a.stats.maxHp < 0.45 && dist(me.pos, a.pos) <= 900);
        if (lowSelf || lowAlly) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 7. 奥术鞋：缺蓝时群回魔法
      case 'arcane_boots': {
        const lowSelf = manaPct < 0.5;
        const lowAlly = allyHeroes.some((a) => a.mana / Math.max(1, a.stats.maxMana) < 0.4 && dist(me.pos, a.pos) <= 900);
        if (lowSelf || lowAlly) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 8. 赤红甲：护甲与物理护盾保护
      case 'crimson_guard': {
        const inFight = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 800);
        if (inFight && (hpPct < 0.7 || allyHeroes.length >= 1)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 9. 洞察烟斗：魔法护盾保护
      case 'pipe_of_insight': {
        const inFight = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 800);
        if (inFight && hpPct < 0.75) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 10. 希瓦的守护：大范围冰霜伤害与减速
      case 'shivas_guard': {
        const inFight = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 900);
        if (inFight) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 11. 撒旦之邪力：低血反杀吸血
      case 'satanic': {
        if (hpPct < 0.45 && enemyHeroes.some((e) => dist(me.pos, e.pos) <= me.stats.attackRange + 100)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 12. 疯狂面具：攻速狂暴输出
      case 'mask_of_madness': {
        if (!retreating && hpPct > 0.6 && enemyHeroes.some((e) => dist(me.pos, e.pos) <= me.stats.attackRange)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 13. 深渊之刃：贴身无视魔免眩晕核心敌方
      case 'abyssal_blade': {
        for (const e of enemyHeroes) {
          if (dist(me.pos, e.pos) <= 200 && !e.hasState('invulnerable') && !e.hasState('stunned')) {
            return { type: 'useItem', index: i, target: { unitId: e.id } };
          }
        }
        break;
      }

      // 14. 天堂之戟：缴械敌方高物理输出
      case 'heaven_halberd': {
        for (const e of enemyHeroes) {
          if (dist(me.pos, e.pos) <= 600 && !e.hasState('disarmed') && !e.hasState('debuffImmune')) {
            return { type: 'useItem', index: i, target: { unitId: e.id } };
          }
        }
        break;
      }

      // 15. 原力法杖：撤退推自己逃生
      case 'force_staff': {
        if (retreating) {
          return { type: 'useItem', index: i, target: { unitId: me.id } };
        }
        break;
      }

      // 16. Eul的神圣法杖：撤退吹起敌方追击者
      case 'euls_scepter': {
        if (retreating && enemyHeroes.length > 0) {
          const chaser = enemyHeroes[0];
          if (dist(me.pos, chaser.pos) <= 550 && !chaser.hasState('debuffImmune')) {
            return { type: 'useItem', index: i, target: { unitId: chaser.id } };
          }
        }
        break;
      }

      // 17. 莫尔迪基安的臂章：交战开启，平时关闭
      case 'armlet_of_mordiggian': {
        const inFight = enemyHeroes.some((e) => dist(me.pos, e.pos) <= 700);
        const activeState = !!item.toggled;
        if (inFight && !activeState && hpPct > 0.3) {
          return { type: 'useItem', index: i };
        } else if (!inFight && activeState) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 18. 魔棒 / 魔杖：充能 >= 3 且血量或魔法较低时使用
      case 'magic_stick':
      case 'magic_wand': {
        if ((item.charges ?? 0) >= 3 && (hpPct < 0.55 || manaPct < 0.3)) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 19. 仙灵之火：即时救急回血
      case 'faerie_fire': {
        if (hpPct < 0.35 && enemyHeroes.length > 0) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 20. 魔法芒果：即时补蓝
      case 'enchanted_mango': {
        if (manaPct < 0.25) {
          return { type: 'useItem', index: i };
        }
        break;
      }

      // 21. 治疗药膏 / 净化药水：安全脱战状态下回血回蓝
      case 'healing_salve': {
        if (enemyHeroes.length === 0 && hpPct < 0.5) {
          return { type: 'useItem', index: i, target: { unitId: me.id } };
        }
        break;
      }
      case 'clarity': {
        if (enemyHeroes.length === 0 && manaPct < 0.4) {
          return { type: 'useItem', index: i, target: { unitId: me.id } };
        }
        break;
      }
      case 'tango': {
        if (hpPct < 0.75 && !findModifier(me, 'mod_item_tango')) {
          return { type: 'useItem', index: i };
        }
        break;
      }
    }
  }

  return null;
}

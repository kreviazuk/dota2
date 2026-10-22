import type { World } from '../sim/world';
import type { Unit } from '../sim/entities/unit';
import type { Command } from '../sim/commands';
import type { AbilitySlot } from '../sim/core/types';
import type { AiSkill } from '../sim/heroes/types';
import type { Vec2 } from '../sim/core/vec2';
import { dist, normalize, sub } from '../sim/core/vec2';
import { canCast } from '../sim/systems/abilities';
import { predictPos, underEnemyTower } from './aiHelpers';
import { findModifier } from '../sim/modifiers';

/**
 * 微操层（Micro AI）
 * 包含核心英雄技能协同连招序列、走砍与预判施法
 */
export class MicroAI {
  /**
   * 预判目标未来落点
   * @param projectileSpeed 弹道速度（若是瞬发或范围技能传 0）
   * @param castPoint 施法前摇
   */
  leadAim(world: World, caster: Unit, target: Unit, projectileSpeed: number, castPoint: number, skill: AiSkill): Vec2 {
    const d = dist(caster.pos, target.pos);
    const flightTime = projectileSpeed > 0 ? d / projectileSpeed : 0;
    const totalLeadTime = castPoint + flightTime;
    return predictPos(world, target, totalLeadTime, skill);
  }

  /**
   * 尝试执行微操协同连招序列
   * 根据不同英雄的特征连招链以及难度设定的 comboChance 触发
   */
  tryCombo(world: World, me: Unit, target: Unit, skill: AiSkill): Command | null {
    if (!me.alive || !target.alive || target.team === me.team) return null;

    const comboChance = skill.comboChance ?? 0;
    if (comboChance <= 0 || !world.rng.chance(comboChance)) {
      return null;
    }

    switch (me.defId) {
      case 'axe':
        return this.comboAxe(world, me, target);
      case 'lina':
        return this.comboLina(world, me, target, skill);
      case 'pudge':
        return this.comboPudge(world, me, target, skill);
      case 'sven':
        return this.comboSven(world, me, target);
      case 'phantom_assassin':
        return this.comboPA(world, me, target);
      default:
        return null;
    }
  }

  /**
   * 幻影刺客连招：深渊之刃贴脸眩晕 -> BKB 免控 -> 窒碍短匕远程减速 -> 幻影突袭斩杀
   */
  private comboPA(world: World, me: Unit, target: Unit): Command | null {
    const d = dist(me.pos, target.pos);
    const bkbIdx = this.findItemIndex(me, 'black_king_bar');
    const abyssalIdx = this.findItemIndex(me, 'abyssal_blade');
    const hpPct = me.hp / me.stats.maxHp;
    const targetHpPct = target.hp / target.stats.maxHp;
    const towerDanger = underEnemyTower(world, me.team, target.pos);

    // 1. 若拥有深渊之刃且贴身，先手击晕
    if (abyssalIdx >= 0 && d <= 180) {
      const it = me.inventory[abyssalIdx];
      if (it && (it.cooldownRemaining ?? 0) <= 0) {
        return { type: 'useItem', index: abyssalIdx, target: { unitId: target.id } };
      }
    }

    // 2. 切入前若被多名敌人威胁，秒开 BKB 获得减益免疫
    if (bkbIdx >= 0 && d <= 600 && hpPct <= 0.8) {
      const it = me.inventory[bkbIdx];
      if (it && (it.cooldownRemaining ?? 0) <= 0 && !me.hasState('debuffImmune')) {
        return { type: 'useItem', index: bkbIdx };
      }
    }

    // 3. 先施放 Q 窒碍短匕远程减速并压血线
    const q = me.ability('Q');
    if (q && q.level > 0 && canCast(world, me, q) && d <= 1100 && d > 300) {
      return { type: 'cast', slot: 'Q', target: { unitId: target.id } };
    }

    // 4. 自身健康且目标残血（或自身有 BKB）时才突进斩杀，严禁盲目肉身越塔送命
    const canBlink = targetHpPct <= 0.55 || me.hasState('debuffImmune');
    const safeToBlink = hpPct >= 0.45 && (!towerDanger || targetHpPct <= 0.25);
    const w = me.ability('W');
    if (w && w.level > 0 && canCast(world, me, w) && d <= 1000 && d > 160 && safeToBlink && canBlink) {
      return { type: 'cast', slot: 'W', target: { unitId: target.id } };
    }

    return null;
  }

  /**
   * 1. 斧王连招：跳刀 -> 狂战士之吼 -> 开启刃甲 -> 战斗饥渴 -> 淘汰之刃
   */
  private comboAxe(world: World, me: Unit, target: Unit): Command | null {
    const d = dist(me.pos, target.pos);
    const blinkIdx = this.findItemIndex(me, 'blink_dagger');
    const bmIdx = this.findItemIndex(me, 'blade_mail');

    // 斩杀优先：如果目标进入淘汰之刃斩杀线且在施法距离内，立即斩杀
    const cullingBlade = me.ability('R');
    if (cullingBlade && cullingBlade.level > 0 && canCast(world, me, cullingBlade)) {
      const threshold = cullingBlade.def.values?.damage?.[cullingBlade.level - 1] ?? 275;
      if (target.hp <= threshold && d <= 250) {
        return { type: 'cast', slot: 'R', target: { unitId: target.id } };
      }
    }

    // 步骤 1：距离合适（315 ~ 1200）且跳刀就绪，跳向目标身边
    if (blinkIdx >= 0 && d > 315 && d <= 1200) {
      return { type: 'useItem', index: blinkIdx, target: { point: { ...target.pos } } };
    }

    // 步骤 2：在吼叫范围内（<= 315），施放狂战士之吼
    if (d <= 315 && this.isAbilityReady(world, me, 'Q')) {
      return { type: 'cast', slot: 'Q' };
    }

    // 步骤 3：开启刃甲（被攻击或附近有敌方时）
    if (bmIdx >= 0 && d <= 400) {
      return { type: 'useItem', index: bmIdx };
    }

    // 步骤 4：施放战斗饥渴
    if (this.isAbilityReady(world, me, 'W') && !findModifier(target, 'axe_battle_hunger', me.id)) {
      return { type: 'cast', slot: 'W', target: { unitId: target.id } };
    }

    return null;
  }

  /**
   * 2. 莉娜连招：Eul风杖 -> 延迟 2.0s 接光击阵 -> 龙破斩 -> 神灭斩
   */
  private comboLina(world: World, me: Unit, target: Unit, skill: AiSkill): Command | null {
    const d = dist(me.pos, target.pos);
    const eulIdx = this.findItemIndex(me, 'euls_scepter');

    // 检查目标是否处于风杖吹起状态
    const cycloneMod = findModifier(target, 'cyclone') ?? findModifier(target, 'euls_scepter');
    if (cycloneMod) {
      // 风杖总持续时间 2.5 秒，光击阵前摇 0.45 秒 + 0.5 秒延迟 = 0.95 秒
      // 在还剩约 0.5 ~ 0.9 秒结束时在吹风落地点预置光击阵
      if (cycloneMod.duration <= 0.9 && this.isAbilityReady(world, me, 'W')) {
        return { type: 'cast', slot: 'W', target: { point: { ...target.pos } } };
      }
      return null;
    }

    // 步骤 1：如果有风杖且目标未被控制，先吹风控住
    if (eulIdx >= 0 && d <= 600 && !target.hasState('stunned') && !target.hasState('invulnerable')) {
      return { type: 'useItem', index: eulIdx, target: { unitId: target.id } };
    }

    // 步骤 2：如果目标被眩晕或没有风杖，直接预判光击阵
    if (this.isAbilityReady(world, me, 'W') && d <= 700) {
      const aimPoint = this.leadAim(world, me, target, 0, 0.45 + 0.5, skill);
      return { type: 'cast', slot: 'W', target: { point: aimPoint } };
    }

    // 步骤 3：神灭斩斩杀或高爆发
    if (this.isAbilityReady(world, me, 'R') && d <= 600) {
      return { type: 'cast', slot: 'R', target: { unitId: target.id } };
    }

    // 步骤 4：龙破斩
    if (this.isAbilityReady(world, me, 'Q') && d <= 1000) {
      const aimPoint = this.leadAim(world, me, target, 1200, 0.35, skill);
      const dir = normalize(sub(aimPoint, me.pos));
      return { type: 'cast', slot: 'Q', target: { dir } };
    }

    return null;
  }

  /**
   * 3. 帕吉连招：肉钩拉回 -> 即时接肢解压制 -> 开启腐烂
   */
  private comboPudge(world: World, me: Unit, target: Unit, skill: AiSkill): Command | null {
    const d = dist(me.pos, target.pos);

    // 步骤 1：近身（<= 250）立即开启腐烂与接肢解压制
    if (d <= 250) {
      // 开启腐烂
      const rotMod = findModifier(me, 'pudge_rot');
      if (!rotMod && this.isAbilityReady(world, me, 'W')) {
        return { type: 'toggle', slot: 'W' };
      }
      // 肢解压制
      if (this.isAbilityReady(world, me, 'R') && !target.hasState('invulnerable')) {
        return { type: 'cast', slot: 'R', target: { unitId: target.id } };
      }
    }

    // 步骤 2：中远距离施放预判肉钩
    if (d > 250 && d <= 1300 && this.isAbilityReady(world, me, 'Q')) {
      const aimPoint = this.leadAim(world, me, target, 1600, 0.3, skill);
      const dir = normalize(sub(aimPoint, me.pos));
      return { type: 'cast', slot: 'Q', target: { dir } };
    }

    return null;
  }

  /**
   * 4. 斯温连招：战吼 -> 神之力量 -> 风暴之拳突进 -> 狂暴输出
   */
  private comboSven(world: World, me: Unit, target: Unit): Command | null {
    const d = dist(me.pos, target.pos);
    const blinkIdx = this.findItemIndex(me, 'blink_dagger');

    // 步骤 1：交战前开启战吼增加护甲与移速
    if (d <= 900 && this.isAbilityReady(world, me, 'E') && !findModifier(me, 'sven_warcry')) {
      return { type: 'cast', slot: 'E' };
    }

    // 步骤 2：开启神之力量大幅提升攻击力
    if (d <= 800 && this.isAbilityReady(world, me, 'R') && !findModifier(me, 'sven_gods_strength')) {
      return { type: 'cast', slot: 'R' };
    }

    // 步骤 3：跳刀切入
    if (blinkIdx >= 0 && d > 350 && d <= 1200) {
      return { type: 'useItem', index: blinkIdx, target: { point: { ...target.pos } } };
    }

    // 步骤 4：施放风暴之拳远程先手眩晕
    if (d <= 650 && this.isAbilityReady(world, me, 'Q') && !target.hasState('stunned')) {
      return { type: 'cast', slot: 'Q', target: { unitId: target.id } };
    }

    // 步骤 5：近身普攻
    if (d <= me.stats.attackRange + 150) {
      return { type: 'attack', mode: 'smart', targetId: target.id };
    }

    return null;
  }

  private findItemIndex(u: Unit, itemId: string): number {
    for (let i = 0; i < u.inventory.length; i++) {
      const it = u.inventory[i];
      if (it && it.id === itemId && (it.cooldownRemaining ?? 0) <= 0) return i;
    }
    return -1;
  }

  private isAbilityReady(world: World, u: Unit, slot: AbilitySlot): boolean {
    const ab = u.ability(slot);
    return !!ab && ab.level > 0 && canCast(world, u, ab);
  }
}

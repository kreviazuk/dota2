/**
 * 程序化 2D Canvas 技能与动作图标生成器
 * 为全部 10 名英雄的所有技能（Q/W/E/R/X1/X2/先天）以及基础动作键（普攻/补刀/推塔/回城/取消）
 * 提供精美的高清矢量图标，0 外部图片依赖，支持视网膜高清渲染。
 */

export interface AbilityVisual {
  /** 背景渐变色 [起, 止] */
  bg: [string, string];
  /** 边框高亮色 */
  border: string;
  /** 强调光晕色 */
  accent: string;
  /** 图元绘制类型 */
  glyph: string;
  /** 备用中文简称标签（2字） */
  tag: string;
}

const ABILITY_VISUALS: Record<string, AbilityVisual> = {
  // ==================== 斧王 (Axe) ====================
  axe_berserkers_call: { bg: ['#3e1010', '#180404'], border: '#e64030', accent: '#ff7050', glyph: 'shout_helmet', tag: '狂吼' },
  axe_battle_hunger: { bg: ['#441208', '#1a0602'], border: '#f05a28', accent: '#ffa040', glyph: 'burning_skull', tag: '饥渴' },
  axe_counter_helix: { bg: ['#3a1a10', '#160804'], border: '#e88030', accent: '#ffb050', glyph: 'spinning_axes', tag: '螺旋' },
  axe_culling_blade: { bg: ['#550808', '#200202'], border: '#ff2020', accent: '#ff6060', glyph: 'execute_axe', tag: '淘汰' },
  axe_one_man_army: { bg: ['#302010', '#140c06'], border: '#d49a30', accent: '#f5c860', glyph: 'iron_fist', tag: '独军' },

  // ==================== 卓尔游侠 (Drow Ranger) ====================
  drow_frost_arrows: { bg: ['#0c223c', '#040d18'], border: '#40b0ff', accent: '#80d8ff', glyph: 'frost_arrow', tag: '冰箭' },
  drow_gust: { bg: ['#102830', '#061014'], border: '#50d0d8', accent: '#90f0f8', glyph: 'wind_gust', tag: '狂风' },
  drow_multishot: { bg: ['#122040', '#060c1c'], border: '#6090ff', accent: '#a0c4ff', glyph: 'multishot', tag: '齐射' },
  drow_marksmanship: { bg: ['#181a38', '#08081a'], border: '#9070ff', accent: '#c8a8ff', glyph: 'bullseye_arrow', tag: '射手' },
  drow_vantage_point: { bg: ['#0f2530', '#051015'], border: '#40c0b8', accent: '#70f0e0', glyph: 'cliff_crest', tag: '精准' },
  drow_glacier: { bg: ['#0e2d42', '#04121d'], border: '#60d0ff', accent: '#aae8ff', glyph: 'ice_pillar', tag: '冰川' },

  // ==================== 水晶室女 (Crystal Maiden) ====================
  cm_crystal_nova: { bg: ['#0a2542', '#030f1e'], border: '#50b8ff', accent: '#9cd9ff', glyph: 'ice_nova', tag: '新星' },
  cm_frostbite: { bg: ['#0d2238', '#040d18'], border: '#40a0e8', accent: '#88d0ff', glyph: 'ice_cage', tag: '冰封' },
  cm_arcane_aura: { bg: ['#12204a', '#050c20'], border: '#6888ff', accent: '#a8c0ff', glyph: 'mana_halo', tag: '光环' },
  cm_freezing_field: { bg: ['#0e2a52', '#041026'], border: '#70c0ff', accent: '#b8e4ff', glyph: 'blizzard_storm', tag: '极寒' },
  cm_blueheart_floe: { bg: ['#0b1e38', '#030b18'], border: '#4898e0', accent: '#8ac4ff', glyph: 'ice_heart', tag: '蓝心' },
  cm_crystal_clone: { bg: ['#0e2640', '#041020'], border: '#58aae8', accent: '#98d4ff', glyph: 'ice_slide', tag: '滑冰' },

  // ==================== 主宰 (Juggernaut) ====================
  jugg_blade_fury: { bg: ['#38240a', '#180e03'], border: '#e8a020', accent: '#ffd050', glyph: 'blade_spin', tag: '剑暴' },
  jugg_healing_ward: { bg: ['#103018', '#041408'], border: '#48d860', accent: '#80ff98', glyph: 'healing_totem', tag: '棒子' },
  jugg_blade_dance: { bg: ['#381c10', '#160a04'], border: '#f07030', accent: '#ffa060', glyph: 'critical_spark', tag: '剑舞' },
  jugg_omnislash: { bg: ['#44180a', '#1a0602'], border: '#ff8820', accent: '#ffc050', glyph: 'cross_slashes', tag: '斩' },
  jugg_duelist: { bg: ['#302008', '#140c02'], border: '#dca028', accent: '#f8d060', glyph: 'crossed_katanas', tag: '决斗' },
  jugg_swiftslash: { bg: ['#3c1e0c', '#180a03'], border: '#e88828', accent: '#ffb858', glyph: 'fast_slash', tag: '瞬斩' },

  // ==================== 斯温 (Sven) ====================
  sven_storm_hammer: { bg: ['#102244', '#040d20'], border: '#4898ff', accent: '#8cc0ff', glyph: 'lightning_hammer', tag: '风暴' },
  sven_great_cleave: { bg: ['#282038', '#0e0b16'], border: '#a070e0', accent: '#c8a0ff', glyph: 'great_cleave', tag: '挥舞' },
  sven_warcry: { bg: ['#122a3e', '#05111c'], border: '#40b4e8', accent: '#80d8ff', glyph: 'knight_shield', tag: '战吼' },
  sven_gods_strength: { bg: ['#441010', '#1a0404'], border: '#ff3838', accent: '#ff7878', glyph: 'fury_gauntlet', tag: '神力' },
  sven_wrath: { bg: ['#381414', '#160606'], border: '#e04848', accent: '#ff8080', glyph: 'rage_helm', tag: '狂怒' },

  // ==================== 帕吉 (Pudge) ====================
  pudge_meat_hook: { bg: ['#381810', '#160804'], border: '#d46030', accent: '#ff8850', glyph: 'meat_hook', tag: '肉钩' },
  pudge_rot: { bg: ['#182e0e', '#081404'], border: '#6cb828', accent: '#a0f040', glyph: 'rot_gas', tag: '腐烂' },
  pudge_flesh_heap: { bg: ['#301c18', '#140a08'], border: '#b86050', accent: '#e88878', glyph: 'stitched_flesh', tag: '堆积' },
  pudge_dismember: { bg: ['#440c0c', '#1a0303'], border: '#ff2828', accent: '#ff6868', glyph: 'cleaver_fork', tag: '肢解' },
  pudge_fresh_meat: { bg: ['#381014', '#160406'], border: '#d83850', accent: '#ff6880', glyph: 'fresh_meat', tag: '鲜肉' },
  pudge_dismember_swallow: { bg: ['#281020', '#10040c'], border: '#b03888', accent: '#e868b8', glyph: 'swallow_maw', tag: '吞噬' },

  // ==================== 幻影刺客 (Phantom Assassin) ====================
  pa_stifling_dagger: { bg: ['#181a30', '#060814'], border: '#6070d0', accent: '#90a8ff', glyph: 'poison_dagger', tag: '窒息' },
  pa_phantom_strike: { bg: ['#1c1434', '#080416'], border: '#8050e0', accent: '#b890ff', glyph: 'phantom_dash', tag: '突袭' },
  pa_blur: { bg: ['#141824', '#05060a'], border: '#506888', accent: '#88a8d0', glyph: 'shadow_cloak', tag: '魅影' },
  pa_coup_de_grace: { bg: ['#440810', '#1a0205'], border: '#ff2040', accent: '#ff6880', glyph: 'critical_blood', tag: '恩赐' },
  pa_fan_of_knives: { bg: ['#241434', '#0c0516'], border: '#9850d8', accent: '#c888ff', glyph: 'dagger_fan', tag: '刀扇' },
  pa_active: { bg: ['#18182a', '#060610'], border: '#7070a8', accent: '#a8a8e0', glyph: 'shadow_cloak', tag: '隐匿' },

  // ==================== 莉娜 (Lina) ====================
  lina_dragon_slave: { bg: ['#401408', '#1a0602'], border: '#ff6020', accent: '#ffa850', glyph: 'fire_dragon', tag: '龙破' },
  lina_light_strike_array: { bg: ['#442006', '#1c0c02'], border: '#ff8818', accent: '#ffc040', glyph: 'flame_pillar', tag: '光阵' },
  lina_fiery_soul: { bg: ['#48180c', '#1c0803'], border: '#ff7030', accent: '#ffb060', glyph: 'phoenix_wings', tag: '炽魂' },
  lina_laguna_blade: { bg: ['#500818', '#200206'], border: '#ff1850', accent: '#ff6890', glyph: 'crimson_beam', tag: '神灭' },
  lina_slow_burn: { bg: ['#381408', '#160602'], border: '#e05820', accent: '#ff9050', glyph: 'smolder_ember', tag: '慢火' },
  lina_flame_cloak: { bg: ['#421a08', '#1a0802'], border: '#ff7820', accent: '#ffb850', glyph: 'phoenix_wings', tag: '火翼' },

  // ==================== 宙斯 (Zeus) ====================
  zeus_arc_lightning: { bg: ['#102448', '#040e20'], border: '#4098ff', accent: '#88c8ff', glyph: 'arc_fork', tag: '弧电' },
  zeus_lightning_bolt: { bg: ['#122c54', '#051226'], border: '#50a8ff', accent: '#a0d8ff', glyph: 'thunder_strike', tag: '雷击' },
  zeus_heavenly_jump: { bg: ['#18264e', '#060c20'], border: '#6088ff', accent: '#a8c0ff', glyph: 'static_burst', tag: '天跃' },
  zeus_static_field: { bg: ['#142244', '#050c1e'], border: '#5080e0', accent: '#98b8ff', glyph: 'static_burst', tag: '静电' },
  zeus_thundergods_wrath: { bg: ['#1a3068', '#061230'], border: '#68b0ff', accent: '#c0e0ff', glyph: 'celestial_wrath', tag: '雷神' },

  // ==================== 影魔 (Shadow Fiend) ====================
  sf_shadowraze: { bg: ['#281028', '#0e040e'], border: '#b038b0', accent: '#e868e8', glyph: 'shadow_geyser', tag: '影压' },
  sf_necromastery: { bg: ['#220c24', '#0c030e'], border: '#983098', accent: '#d058d0', glyph: 'soul_urn', tag: '死灵' },
  sf_presence: { bg: ['#1a081e', '#08020a'], border: '#802888', accent: '#b848c0', glyph: 'shadow_skull', tag: '魔王' },
  sf_requiem: { bg: ['#360e36', '#140314'], border: '#d038d0', accent: '#ff70ff', glyph: 'soul_nova', tag: '挽歌' },
  sf_feast_of_souls: { bg: ['#2e0e30', '#100312'], border: '#b834ba', accent: '#e860ea', glyph: 'soul_urn', tag: '魂宴' },

  // ==================== 基础操作按键 (Core Actions) ====================
  action_attack: { bg: ['#441410', '#1c0604'], border: '#e84830', accent: '#ff7860', glyph: 'crossed_swords', tag: '普攻' },
  action_lasthit: { bg: ['#382c0e', '#161004'], border: '#e2b430', accent: '#ffd850', glyph: 'lasthit_coin', tag: '补刀' },
  action_push: { bg: ['#282c38', '#0e1016'], border: '#6888b8', accent: '#98bce8', glyph: 'siege_tower', tag: '推塔' },
  action_recall: { bg: ['#102844', '#041020'], border: '#40a0ff', accent: '#88d0ff', glyph: 'warp_portal', tag: '回城' },
  action_cancel: { bg: ['#401014', '#1a0406'], border: '#e03040', accent: '#ff6878', glyph: 'cancel_cross', tag: '取消' },
};

/** 绘制各种矢量符号 */
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: string, size: number, accent: string): void {
  const c = size / 2;
  const s = size * 0.44; // 基准比例
  ctx.save();
  ctx.translate(c, c);

  switch (glyph) {
    // ---------------- 斧王 ----------------
    case 'shout_helmet': {
      // 咆哮斯巴达头盔 + 震荡波
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.04;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.95, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.15, -0.5, 0.5);
      ctx.stroke();

      ctx.fillStyle = '#ffeedd';
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.6);
      ctx.lineTo(-s * 0.5, -s * 0.3);
      ctx.quadraticCurveTo(0, -s * 0.7, s * 0.4, -s * 0.3);
      ctx.lineTo(s * 0.4, s * 0.6);
      ctx.lineTo(s * 0.15, s * 0.6);
      ctx.lineTo(s * 0.15, s * 0.1);
      ctx.lineTo(-s * 0.25, s * 0.1);
      ctx.lineTo(-s * 0.25, s * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'burning_skull': {
      // 饥渴燃烧红颅骨
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.15, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-s * 0.25, s * 0.15, s * 0.5, s * 0.35);
      // 眼窝
      ctx.fillStyle = '#1a0602';
      ctx.beginPath();
      ctx.arc(-s * 0.18, -s * 0.15, s * 0.12, 0, Math.PI * 2);
      ctx.arc(s * 0.18, -s * 0.15, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      // 头顶烈焰
      ctx.fillStyle = '#fff070';
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.45);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.9, 0, -s * 0.95);
      ctx.quadraticCurveTo(s * 0.4, -s * 0.9, s * 0.3, -s * 0.45);
      ctx.fill();
      break;
    }
    case 'spinning_axes': {
      // 旋转双斧旋风
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.06;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.75, 0.4, 2.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.75, 3.5, 5.8);
      ctx.stroke();
      // 双刃
      ctx.fillStyle = '#ffffff';
      for (const rot of [0, Math.PI]) {
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.65);
        ctx.quadraticCurveTo(s * 0.7, -s * 0.85, s * 0.7, -s * 0.35);
        ctx.quadraticCurveTo(s * 0.3, -s * 0.45, s * 0.1, -s * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'execute_axe': {
      // 斩杀巨斧下劈
      ctx.fillStyle = '#f5f5f5';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.6);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.7, s * 0.65, s * 0.3);
      ctx.quadraticCurveTo(0, s * 0.1, -s * 0.2, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 斧柄
      ctx.strokeStyle = '#c48040';
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.7);
      ctx.lineTo(s * 0.4, s * 0.7);
      ctx.stroke();
      // 鲜血溅射
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(s * 0.55, 0, s * 0.15, 0, Math.PI * 2);
      ctx.arc(s * 0.3, s * 0.35, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ---------------- 卓尔游侠 ----------------
    case 'frost_arrow': {
      // 晶莹冰晶箭头
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(s * 0.55, s * 0.2);
      ctx.lineTo(s * 0.2, s * 0.05);
      ctx.lineTo(s * 0.08, s * 0.75);
      ctx.lineTo(-s * 0.08, s * 0.75);
      ctx.lineTo(-s * 0.2, s * 0.05);
      ctx.lineTo(-s * 0.55, s * 0.2);
      ctx.closePath();
      ctx.fill();
      // 冰晶高光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.lineTo(s * 0.2, 0);
      ctx.lineTo(0, -s * 0.1);
      ctx.lineTo(-s * 0.2, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wind_gust': {
      // 狂风呼啸波浪
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = 'round';
      for (const y of [-s * 0.4, 0, s * 0.4]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, y - s * 0.1);
        ctx.quadraticCurveTo(0, y + s * 0.25, s * 0.7, y - s * 0.15);
        ctx.stroke();
      }
      break;
    }
    case 'multishot': {
      // 三重冰箭齐射
      ctx.fillStyle = accent;
      for (const a of [-0.35, 0, 0.35]) {
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.75);
        ctx.lineTo(s * 0.22, -s * 0.1);
        ctx.lineTo(s * 0.06, -s * 0.1);
        ctx.lineTo(s * 0.06, s * 0.6);
        ctx.lineTo(-s * 0.06, s * 0.6);
        ctx.lineTo(-s * 0.06, -s * 0.1);
        ctx.lineTo(-s * 0.22, -s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'bullseye_arrow': {
      // 准星十字 + 穿心箭
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.85, 0);
      ctx.lineTo(s * 0.85, 0);
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(0, s * 0.85);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ---------------- 水晶室女 ----------------
    case 'ice_nova': {
      // 水晶新星绽放
      ctx.fillStyle = accent;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.85);
        ctx.lineTo(s * 0.18, -s * 0.2);
        ctx.lineTo(0, 0);
        ctx.lineTo(-s * 0.18, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ice_cage': {
      // 冰封牢笼
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.07;
      ctx.strokeRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);
      break;
    }
    case 'mana_halo': {
      // 辉光奥术光环
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.35, 0);
      ctx.lineTo(0, s * 0.5);
      ctx.lineTo(-s * 0.35, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'blizzard_storm': {
      // 暴风雪冰锥坠落
      ctx.fillStyle = accent;
      const drops: [number, number, number][] = [
        [-s * 0.45, -s * 0.4, 0.2],
        [0, -s * 0.6, 0.25],
        [s * 0.45, -s * 0.3, 0.18],
        [-s * 0.2, s * 0.1, 0.22],
        [s * 0.3, s * 0.2, 0.26],
      ];
      for (const [x, y, r] of drops) {
        ctx.beginPath();
        ctx.moveTo(x, y - s * r * 2);
        ctx.lineTo(x + s * r, y + s * r * 2);
        ctx.lineTo(x - s * r, y + s * r * 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    // ---------------- 主宰 ----------------
    case 'blade_spin': {
      // 剑刃风暴金色涡流
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.09;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.7, 0, 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 2.2, 4.0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 4.2, 5.8);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'healing_totem': {
      // 治疗守卫图腾
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.6);
      ctx.lineTo(s * 0.35, -s * 0.6);
      ctx.lineTo(s * 0.25, s * 0.65);
      ctx.lineTo(-s * 0.25, s * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.15, -s * 0.3, s * 0.3, s * 0.1);
      ctx.fillRect(-s * 0.05, -s * 0.4, s * 0.1, s * 0.3);
      break;
    }
    case 'critical_spark': {
      // 暴击刀光星芒
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.1, -s * 0.1, s * 0.85, 0);
      ctx.quadraticCurveTo(s * 0.1, s * 0.1, 0, s * 0.85);
      ctx.quadraticCurveTo(-s * 0.1, s * 0.1, -s * 0.85, 0);
      ctx.quadraticCurveTo(-s * 0.1, -s * 0.1, 0, -s * 0.85);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cross_slashes': {
      // 无敌斩交叉双刀破空
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.08;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.65, -s * 0.65);
      ctx.lineTo(s * 0.65, s * 0.65);
      ctx.moveTo(s * 0.65, -s * 0.65);
      ctx.lineTo(-s * 0.65, s * 0.65);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ---------------- 斯温 ----------------
    case 'lightning_hammer': {
      // 风暴之锤
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.45, -s * 0.55, s * 0.9, s * 0.45);
      ctx.strokeStyle = '#c0a060';
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.lineTo(0, s * 0.7);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, -s * 0.3);
      ctx.lineTo(-s * 0.45, -s * 0.1);
      ctx.lineTo(-s * 0.7, s * 0.1);
      ctx.stroke();
      break;
    }
    case 'great_cleave': {
      // 巨力弧形剑浪
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.65, -0.6, 2.2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(s * 0.55, s * 0.4);
      ctx.lineTo(s * 0.85, s * 0.45);
      ctx.lineTo(s * 0.65, s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'knight_shield': {
      // 战吼坚毅骑士盾
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.lineTo(s * 0.55, -s * 0.45);
      ctx.lineTo(s * 0.45, s * 0.35);
      ctx.lineTo(0, s * 0.75);
      ctx.lineTo(-s * 0.45, s * 0.35);
      ctx.lineTo(-s * 0.55, -s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.8);
      ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.2);
      break;
    }
    case 'fury_gauntlet': {
      // 神之力量燃烧铁拳
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-s * 0.35, s * 0.1, s * 0.7, s * 0.55);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.5);
      ctx.lineTo(0, -s * 0.85);
      ctx.lineTo(s * 0.2, -s * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }

    // ---------------- 帕吉 ----------------
    case 'meat_hook': {
      // 夺命屠夫弯钩
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.6, -1.8, 1.2);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.55);
      ctx.lineTo(s * 0.65, s * 0.75);
      ctx.lineTo(s * 0.4, s * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rot_gas': {
      // 腐烂毒气迷雾
      ctx.fillStyle = accent;
      for (const [x, y, r] of [
        [-s * 0.3, -s * 0.2, 0.35],
        [s * 0.25, -s * 0.25, 0.4],
        [0, s * 0.3, 0.45],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, s * r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#1c340e';
      ctx.beginPath();
      ctx.arc(-s * 0.1, -s * 0.05, s * 0.09, 0, Math.PI * 2);
      ctx.arc(s * 0.1, -s * 0.05, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cleaver_fork': {
      // 肢解双刀屠刀
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.6);
      ctx.lineTo(s * 0.1, -s * 0.6);
      ctx.lineTo(s * 0.1, s * 0.1);
      ctx.lineTo(-s * 0.5, s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a5a3a';
      ctx.lineWidth = size * 0.07;
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.1);
      ctx.lineTo(s * 0.5, s * 0.6);
      ctx.stroke();
      break;
    }

    // ---------------- 幻影刺客 ----------------
    case 'poison_dagger': {
      // 淬毒飞刀
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.8);
      ctx.lineTo(s * 0.22, s * 0.1);
      ctx.lineTo(0, s * 0.65);
      ctx.lineTo(-s * 0.22, s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shadow_cloak': {
      // 魅影斗篷
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, -s * 0.4, s * 0.3, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.5, s * 0.65);
      ctx.quadraticCurveTo(0, -s * 0.2, s * 0.5, s * 0.65);
      ctx.quadraticCurveTo(0, s * 0.3, -s * 0.5, s * 0.65);
      ctx.fill();
      break;
    }
    case 'critical_blood': {
      // 恩赐解脱大暴击
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.1;
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.7);
      ctx.lineTo(s * 0.7, s * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of [
        [-s * 0.2, s * 0.4],
        [s * 0.3, -s * 0.3],
        [0, 0],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    // ---------------- 莉娜 ----------------
    case 'fire_dragon': {
      // 龙破斩火龙破浪
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.4);
      ctx.quadraticCurveTo(0, -s * 0.7, s * 0.6, s * 0.4);
      ctx.lineTo(s * 0.35, s * 0.1);
      ctx.lineTo(0, s * 0.55);
      ctx.lineTo(-s * 0.35, s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fffa90';
      ctx.beginPath();
      ctx.arc(0, -s * 0.2, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'flame_pillar': {
      // 光击阵冲天火柱
      ctx.fillStyle = accent;
      ctx.fillRect(-s * 0.25, -s * 0.8, s * 0.5, s * 1.5);
      ctx.strokeStyle = '#fff070';
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.6, s * 0.65, s * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'crimson_beam': {
      // 神灭斩神圣血红激光
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(0, s * 0.85);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.22;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(0, s * 0.85);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      break;
    }

    // ---------------- 宙斯 ----------------
    case 'arc_fork': {
      // 连锁电弧
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.08;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.7);
      ctx.lineTo(0, -s * 0.1);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(s * 0.4, s * 0.7);
      ctx.stroke();
      break;
    }
    case 'thunder_strike': {
      // 天庭雷击
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.85);
      ctx.lineTo(-s * 0.45, 0);
      ctx.lineTo(-s * 0.05, 0);
      ctx.lineTo(-s * 0.2, s * 0.85);
      ctx.lineTo(s * 0.45, -s * 0.05);
      ctx.lineTo(s * 0.05, -s * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'celestial_wrath': {
      // 雷神之怒乌云金电
      ctx.fillStyle = '#3a4a70';
      ctx.beginPath();
      ctx.arc(-s * 0.3, -s * 0.35, s * 0.35, 0, Math.PI * 2);
      ctx.arc(s * 0.3, -s * 0.35, s * 0.35, 0, Math.PI * 2);
      ctx.arc(0, -s * 0.5, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.2);
      ctx.lineTo(-s * 0.1, s * 0.2);
      ctx.lineTo(-s * 0.25, s * 0.3);
      ctx.lineTo(0, s * 0.75);
      ctx.stroke();
      break;
    }

    // ---------------- 影魔 ----------------
    case 'shadow_geyser': {
      // 毁灭阴影喷涌暗泉
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.2, s * 0.35, s * 0.6);
      ctx.lineTo(-s * 0.35, s * 0.6);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, 0, -s * 0.85);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.6, s * 0.5, s * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'soul_nova': {
      // 魂之挽歌辐射黑魂波
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.06;
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.2);
        ctx.lineTo(0, s * 0.85);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ---------------- 核心操作按键 ----------------
    case 'crossed_swords': {
      // 普攻交叉利剑
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.65, -s * 0.65);
      ctx.lineTo(s * 0.65, s * 0.65);
      ctx.moveTo(s * 0.65, -s * 0.65);
      ctx.lineTo(-s * 0.65, s * 0.65);
      ctx.stroke();
      // 剑格
      ctx.fillStyle = accent;
      ctx.fillRect(-s * 0.35, -s * 0.45, s * 0.2, s * 0.1);
      ctx.fillRect(s * 0.15, -s * 0.45, s * 0.2, s * 0.1);
      // 斩击火花
      ctx.fillStyle = '#ffe050';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'lasthit_coin': {
      // 补刀精准匕首与金币
      ctx.fillStyle = '#ffdc30';
      ctx.beginPath();
      ctx.arc(0, s * 0.2, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = `bold ${Math.round(size * 0.25)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, s * 0.22);
      // 刺下的短匕
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.05);
      ctx.lineTo(s * 0.15, -s * 0.6);
      ctx.lineTo(-s * 0.15, -s * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'siege_tower': {
      // 推塔攻城石塔
      ctx.fillStyle = '#c0d0e8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * 0.65);
      ctx.lineTo(-s * 0.3, -s * 0.55);
      ctx.lineTo(-s * 0.4, -s * 0.55);
      ctx.lineTo(-s * 0.4, -s * 0.7);
      ctx.lineTo(-s * 0.15, -s * 0.7);
      ctx.lineTo(-s * 0.15, -s * 0.55);
      ctx.lineTo(s * 0.15, -s * 0.55);
      ctx.lineTo(s * 0.15, -s * 0.7);
      ctx.lineTo(s * 0.4, -s * 0.7);
      ctx.lineTo(s * 0.4, -s * 0.55);
      ctx.lineTo(s * 0.3, -s * 0.55);
      ctx.lineTo(s * 0.45, s * 0.65);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'warp_portal': {
      // 回城传送光环
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.08;
      ctx.beginPath();
      ctx.ellipse(0, s * 0.4, s * 0.65, s * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 上冲光柱
      ctx.fillStyle = 'rgba(120, 210, 255, 0.45)';
      ctx.fillRect(-s * 0.35, -s * 0.75, s * 0.7, s * 1.15);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-s * 0.1, -s * 0.8, s * 0.2, s * 1.2);
      break;
    }
    case 'cancel_cross': {
      // 取消红叉
      ctx.strokeStyle = accent;
      ctx.lineWidth = size * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.55);
      ctx.lineTo(s * 0.55, s * 0.55);
      ctx.moveTo(s * 0.55, -s * 0.55);
      ctx.lineTo(-s * 0.55, s * 0.55);
      ctx.stroke();
      break;
    }

    default: {
      // 默认几何星芒
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/** 渲染技能图标到 Canvas 上 */
export function renderAbilityIcon(ctx: CanvasRenderingContext2D, abilityId: string, size: number): void {
  const v = ABILITY_VISUALS[abilityId] ?? {
    bg: ['#1c2028', '#0c0e12'],
    border: '#6a7888',
    accent: '#90a4b8',
    glyph: 'default',
    tag: '技能',
  };

  const c = size / 2;

  // 1. 背景径向渐变
  const radGrad = ctx.createRadialGradient(c, c * 0.7, 0, c, c, c);
  radGrad.addColorStop(0, v.bg[0]);
  radGrad.addColorStop(1, v.bg[1]);
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. 绘制主要图元
  drawGlyph(ctx, v.glyph, size, v.accent);

  // 3. 内发光光晕与暗边
  const vignette = ctx.createRadialGradient(c, c, size * 0.25, c, c, size * 0.5);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // 4. 金属外框与光边
  ctx.strokeStyle = v.border;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
}

/** 缓存 Canvas 元素以提高复用性能 */
const ICON_CACHE = new Map<string, HTMLCanvasElement>();

/** 获取指定技能的 Canvas 图标元素 */
export function getAbilityIconCanvas(abilityId: string, size = 64): HTMLCanvasElement {
  const key = `${abilityId}_${size}`;
  const hit = ICON_CACHE.get(key);
  if (hit) return hit.cloneNode(true) as HTMLCanvasElement;

  if (typeof document === 'undefined') {
    return { width: size, height: size, toDataURL: () => '', cloneNode: () => ({ width: size, height: size }) } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    renderAbilityIcon(ctx, abilityId, size);
  }
  ICON_CACHE.set(key, canvas);
  return canvas.cloneNode(true) as HTMLCanvasElement;
}

/** 获取基础操作键的 Canvas 图标元素 */
export function getActionIconCanvas(action: 'attack' | 'lasthit' | 'push' | 'recall' | 'cancel', size = 64): HTMLCanvasElement {
  return getAbilityIconCanvas(`action_${action}`, size);
}

/** 获取技能外观配置（用于取渐变底色或外框色） */
export function getAbilityVisual(abilityId: string): AbilityVisual {
  return (
    ABILITY_VISUALS[abilityId] ?? {
      bg: ['#1c2028', '#0c0e12'],
      border: '#6a7888',
      accent: '#90a4b8',
      glyph: 'default',
      tag: '技能',
    }
  );
}

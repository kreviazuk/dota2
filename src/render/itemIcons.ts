export interface ItemVisual {
  bg: [string, string];
  border: string;
  glyph: string;
  accent: string;
  tag: string;
}

// 物品外观配置表：背景渐变色、边框色、图元类型、强调色、中文简称标
const ITEM_VISUALS: Record<string, ItemVisual> = {
  // 消耗品
  tango: { bg: ['#1b3a20', '#0a1a0e'], border: '#4ae26a', glyph: 'leaf', accent: '#62ff85', tag: '吃树' },
  healing_salve: { bg: ['#15382a', '#081c14'], border: '#38d990', glyph: 'flask', accent: '#50ffa8', tag: '大药' },
  clarity: { bg: ['#152038', '#081020'], border: '#3880d9', glyph: 'flask', accent: '#50a8ff', tag: '净化' },
  faerie_fire: { bg: ['#382015', '#1c0e08'], border: '#e27a4a', glyph: 'flame', accent: '#ff9050', tag: '火' },
  enchanted_mango: { bg: ['#383015', '#1c1808'], border: '#e2ba4a', glyph: 'fruit', accent: '#ffda50', tag: '芒果' },

  // 基础属性件
  iron_branch: { bg: ['#282620', '#141310'], border: '#8c8065', glyph: 'branch', accent: '#a89878', tag: '树枝' },
  gauntlets_of_strength: { bg: ['#3a1515', '#1c0a0a'], border: '#d94545', glyph: 'glove', accent: '#ff5555', tag: '力量' },
  slippers_of_agility: { bg: ['#153a1a', '#0a1c0d'], border: '#45d95e', glyph: 'boot', accent: '#55ff73', tag: '敏捷' },
  mantle_of_intelligence: { bg: ['#15223a', '#0a111c'], border: '#4582d9', glyph: 'cloak', accent: '#559eff', tag: '智力' },
  circlet: { bg: ['#302a20', '#181510'], border: '#cca862', glyph: 'crown', accent: '#ffd57a', tag: '圆环' },
  belt_of_strength: { bg: ['#3a1818', '#1c0c0c'], border: '#d94545', glyph: 'belt', accent: '#ff5555', tag: '腰带' },
  band_of_elvenskin: { bg: ['#183a1c', '#0c1c0e'], border: '#45d95e', glyph: 'boot', accent: '#55ff73', tag: '布带' },
  robe_of_the_magi: { bg: ['#18243a', '#0c121c'], border: '#4582d9', glyph: 'cloak', accent: '#559eff', tag: '长袍' },
  crown: { bg: ['#382e18', '#1c170c'], border: '#e2b84a', glyph: 'crown', accent: '#ffda55', tag: '王冠' },
  ogre_axe: { bg: ['#401818', '#200c0c'], border: '#e04848', glyph: 'axe', accent: '#ff6060', tag: '斧头' },
  blade_of_alacrity: { bg: ['#184020', '#0c2010'], border: '#48e065', glyph: 'sword', accent: '#60ff80', tag: '欢欣' },
  staff_of_wizardry: { bg: ['#182840', '#0c1420'], border: '#4890e0', glyph: 'staff', accent: '#60aeff', tag: '魔杖' },
  diadem: { bg: ['#3a321a', '#1d190d'], border: '#f0c850', glyph: 'crown', accent: '#ffe066', tag: '宝冕' },
  reaver: { bg: ['#501515', '#280a0a'], border: '#ff3d3d', glyph: 'axe', accent: '#ff6666', tag: '掠夺' },
  eaglesong: { bg: ['#155022', '#0a2811'], border: '#3dff64', glyph: 'bow', accent: '#66ff88', tag: '鹰歌' },
  mystic_staff: { bg: ['#152e50', '#0a1728'], border: '#3da5ff', glyph: 'staff', accent: '#66bdff', tag: '神秘' },
  ultimate_orb: { bg: ['#303038', '#18181c'], border: '#baa8d6', glyph: 'orb', accent: '#e0c8ff', tag: '极限' },

  // 基础军械 / 配件
  quelling_blade: { bg: ['#282018', '#14100c'], border: '#997a55', glyph: 'axe', accent: '#c29a6b', tag: '补刀' },
  blades_of_attack: { bg: ['#282220', '#141110'], border: '#998075', glyph: 'claw', accent: '#c29a8a', tag: '爪子' },
  gloves_of_haste: { bg: ['#2a2418', '#15120c'], border: '#b89248', glyph: 'glove', accent: '#e6b85a', tag: '手套' },
  orb_of_blight: { bg: ['#301828', '#180c14'], border: '#b84892', glyph: 'orb', accent: '#e65ab8', tag: '枯萎' },
  orb_of_venom: { bg: ['#183018', '#0c180c'], border: '#48b848', glyph: 'orb', accent: '#5ae65a', tag: '毒球' },
  orb_of_frost: { bg: ['#182830', '#0c1418'], border: '#4898b8', glyph: 'orb', accent: '#5ac0e6', tag: '冰珠' },
  morbid_mask: { bg: ['#381515', '#1c0a0a'], border: '#d93b3b', glyph: 'mask', accent: '#ff5555', tag: '吸血' },
  javelin: { bg: ['#302618', '#18130c'], border: '#b88a48', glyph: 'spear', accent: '#e6ae5a', tag: '标枪' },
  broadsword: { bg: ['#24262c', '#121316'], border: '#788299', glyph: 'sword', accent: '#99a6c2', tag: '阔剑' },
  blitz_knuckles: { bg: ['#242c38', '#12161c'], border: '#628bb8', glyph: 'glove', accent: '#7ab0e6', tag: '指套' },
  claymore: { bg: ['#282a30', '#141518'], border: '#8892a6', glyph: 'sword', accent: '#a8b5cc', tag: '大剑' },
  mithril_hammer: { bg: ['#283038', '#14181c'], border: '#88a6c2', glyph: 'hammer', accent: '#a8cce6', tag: '秘银' },
  hyperstone: { bg: ['#183828', '#0c1c14'], border: '#48c282', glyph: 'orb', accent: '#5ae69e', tag: '振奋' },
  demon_edge: { bg: ['#381828', '#1c0c14'], border: '#c24888', glyph: 'sword', accent: '#e65aa6', tag: '恶魔' },
  sacred_relic: { bg: ['#383018', '#1c180c'], border: '#e2ba4a', glyph: 'sword', accent: '#ffda50', tag: '圣者' },

  // 防御基础
  ring_of_protection: { bg: ['#20242a', '#101215'], border: '#6e7f99', glyph: 'ring', accent: '#8da2c2', tag: '守护' },
  ring_of_regen: { bg: ['#2a1c18', '#150e0c'], border: '#b86548', glyph: 'ring', accent: '#e67f5a', tag: '回复' },
  sages_mask: { bg: ['#1c202a', '#0e1015'], border: '#5a6ea0', glyph: 'mask', accent: '#708ac8', tag: '贤者' },
  wind_lace: { bg: ['#242a22', '#121511'], border: '#75996e', glyph: 'shoe', accent: '#95c28d', tag: '风灵' },
  fluffy_hat: { bg: ['#2a201c', '#15100e'], border: '#996e5a', glyph: 'hat', accent: '#c28c72', tag: '毛毛' },
  wizard_hat: { bg: ['#201c2a', '#100e15'], border: '#785a99', glyph: 'hat', accent: '#9972c2', tag: '法帽' },
  shawl: { bg: ['#22242a', '#111215'], border: '#657388', glyph: 'cloak', accent: '#8193ad', tag: '披巾' },
  chainmail: { bg: ['#22242a', '#111215'], border: '#758094', glyph: 'armor', accent: '#96a4bd', tag: '锁甲' },
  ring_of_health: { bg: ['#2e1a18', '#170d0c'], border: '#b85248', glyph: 'ring', accent: '#e6665a', tag: '治愈' },
  void_stone: { bg: ['#182638', '#0c131c'], border: '#487bb8', glyph: 'orb', accent: '#5a9ae6', tag: '虚无' },
  energy_booster: { bg: ['#182038', '#0c101c'], border: '#4868b8', glyph: 'orb', accent: '#5a82e6', tag: '能量' },
  cloak: { bg: ['#26222c', '#131116'], border: '#7d6e94', glyph: 'cloak', accent: '#9f8dbd', tag: '斗篷' },
  chasm_stone: { bg: ['#2a1e28', '#150f14'], border: '#945e8a', glyph: 'orb', accent: '#bd78b0', tag: '裂隙' },
  splintmail: { bg: ['#24262a', '#121315'], border: '#788294', glyph: 'armor', accent: '#9aa7bd', tag: '片甲' },
  helm_of_iron_will: { bg: ['#282424', '#141212'], border: '#8c7575', glyph: 'helm', accent: '#b39595', tag: '铁意' },
  vitality_booster: { bg: ['#381818', '#1c0c0c'], border: '#b84848', glyph: 'orb', accent: '#e65a5a', tag: '活力' },
  point_booster: { bg: ['#2e2438', '#17121c'], border: '#8b5eb8', glyph: 'orb', accent: '#ae76e6', tag: '精气' },
  talisman_of_evasion: { bg: ['#1c2830', '#0e1418'], border: '#5488a8', glyph: 'amulet', accent: '#6aacd1', tag: '闪避' },
  platemail: { bg: ['#24262c', '#121316'], border: '#758399', glyph: 'armor', accent: '#97a8c4', tag: '板甲' },
  ring_of_tarrasque: { bg: ['#38181a', '#1c0c0d'], border: '#ba4850', glyph: 'ring', accent: '#e85a64', tag: '恐鳌' },

  // 鞋类与合成小件
  boots_of_speed: { bg: ['#2a2016', '#15100b'], border: '#996e45', glyph: 'boot', accent: '#c28c58', tag: '草鞋' },
  tranquil_boots: { bg: ['#1a2a1a', '#0d150d'], border: '#52a352', glyph: 'boot', accent: '#69cf69', tag: '绿鞋' },
  power_treads: { bg: ['#2a2218', '#15110c'], border: '#a8854e', glyph: 'boot', accent: '#d4a763', tag: '假腿' },
  phase_boots: { bg: ['#261a2a', '#130d15'], border: '#9e52a3', glyph: 'boot', accent: '#c869cf', tag: '相位' },
  arcane_boots: { bg: ['#182438', '#0c121c'], border: '#4a7ec4', glyph: 'boot', accent: '#5ea0f7', tag: '秘法' },
  magic_stick: { bg: ['#222a22', '#111511'], border: '#659465', glyph: 'wand', accent: '#81bd81', tag: '魔棒' },
  magic_wand: { bg: ['#223022', '#111811'], border: '#6eb86e', glyph: 'wand', accent: '#8ce68c', tag: '大棒' },
  bracer: { bg: ['#3a1a18', '#1d0d0c'], border: '#b84e45', glyph: 'glove', accent: '#e66257', tag: '护腕' },
  wraith_band: { bg: ['#183020', '#0c1810'], border: '#45b862', glyph: 'glove', accent: '#57e67b', tag: '系带' },
  null_talisman: { bg: ['#182238', '#0c111c'], border: '#456bb8', glyph: 'amulet', accent: '#5786e6', tag: '挂件' },
  buckler: { bg: ['#242628', '#121314'], border: '#78808a', glyph: 'shield', accent: '#9aa4b0', tag: '圆盾' },
  headdress: { bg: ['#1e2a20', '#0f1510'], border: '#5c9966', glyph: 'crown', accent: '#74c281', tag: '头巾' },
  ring_of_basilius: { bg: ['#28261e', '#14130f'], border: '#998c5c', glyph: 'ring', accent: '#c2b274', tag: '王者' },
  soul_ring: { bg: ['#381820', '#1c0c10'], border: '#b84562', glyph: 'ring', accent: '#e6577b', tag: '魂戒' },
  orb_of_corrosion: { bg: ['#282c18', '#14160c'], border: '#92a345', glyph: 'orb', accent: '#b7cc57', tag: '腐蚀' },
  perseverance: { bg: ['#2a1e28', '#150f14'], border: '#9e5a8f', glyph: 'ring', accent: '#c772b4', tag: '坚韧' },

  // 防御大件
  vanguard: { bg: ['#381c1c', '#1c0e0e'], border: '#c44d4d', glyph: 'shield', accent: '#f76161', tag: '先锋' },
  blade_mail: { bg: ['#282830', '#141418'], border: '#787899', glyph: 'armor', accent: '#9898c2', tag: '刃甲' },
  mekansm: { bg: ['#1e3028', '#0f1814'], border: '#52ad83', glyph: 'shield', accent: '#67dba5', tag: '梅肯' },
  crimson_guard: { bg: ['#3e1616', '#1f0b0b'], border: '#d93b3b', glyph: 'shield', accent: '#ff5555', tag: '赤红' },
  pipe_of_insight: { bg: ['#1e2e34', '#0f171a'], border: '#4fa3b8', glyph: 'pipe', accent: '#64cfea', tag: '笛子' },
  heaven_halberd: { bg: ['#382c18', '#1c160c'], border: '#c79848', glyph: 'spear', accent: '#fbbd5a', tag: '天堂' },
  black_king_bar: { bg: ['#3c3016', '#1e180b'], border: '#e6b539', glyph: 'staff', accent: '#ffe054', tag: 'BKB' },
  shivas_guard: { bg: ['#182a38', '#0c151c'], border: '#4ea2de', glyph: 'armor', accent: '#63cefa', tag: '希瓦' },
  linkens_sphere: { bg: ['#1a2838', '#0d141c'], border: '#549ee2', glyph: 'orb', accent: '#6bc8ff', tag: '林肯' },
  assault_cuirass: { bg: ['#282a34', '#14151a'], border: '#8b96ba', glyph: 'armor', accent: '#b0bef0', tag: '强袭' },
  heart_of_tarrasque: { bg: ['#441216', '#22090b'], border: '#e63240', glyph: 'heart', accent: '#ff4d5d', tag: '龙心' },

  // 输出与武器大件
  crystalys: { bg: ['#202434', '#10121a'], border: '#6276ba', glyph: 'sword', accent: '#7c96eb', tag: '水晶' },
  armlet_of_mordiggian: { bg: ['#3c161a', '#1e0b0d'], border: '#cf3c4b', glyph: 'glove', accent: '#ff5466', tag: '臂章' },
  mask_of_madness: { bg: ['#3a1a24', '#1d0d12'], border: '#ba486e', glyph: 'mask', accent: '#eb5b8b', tag: '疯脸' },
  sange: { bg: ['#3c1616', '#1e0b0b'], border: '#cf3636', glyph: 'sword', accent: '#ff4d4d', tag: '散华' },
  yasha: { bg: ['#163c20', '#0b1e10'], border: '#36cf58', glyph: 'sword', accent: '#4dff73', tag: '夜叉' },
  sange_and_yasha: { bg: ['#2c2a18', '#16150c'], border: '#cfba36', glyph: 'sword', accent: '#ffea4d', tag: '双刀' },
  skull_basher: { bg: ['#302626', '#181313'], border: '#a87979', glyph: 'hammer', accent: '#d49898', tag: '碎颅' },
  echo_sabre: { bg: ['#1e2838', '#0f141c'], border: '#5582bf', glyph: 'sword', accent: '#6ca5f2', tag: '回音' },
  maelstrom: { bg: ['#1a2838', '#0d141c'], border: '#549ee2', glyph: 'hammer', accent: '#6bc8ff', tag: '电锤' },
  desolator: { bg: ['#441418', '#220a0c'], border: '#e63242', glyph: 'sword', accent: '#ff4d5f', tag: '暗灭' },
  battle_fury: { bg: ['#382416', '#1c120b'], border: '#c77838', glyph: 'axe', accent: '#fa9646', tag: '狂战' },
  radiance: { bg: ['#403014', '#20180a'], border: '#f0b830', glyph: 'sword', accent: '#ffdb5c', tag: '辉耀' },
  monkey_king_bar: { bg: ['#3e2616', '#1f130b'], border: '#d97d34', glyph: 'staff', accent: '#ff9b40', tag: '金箍棒' },
  daedalus: { bg: ['#3a1834', '#1d0c1a'], border: '#ba3eb0', glyph: 'sword', accent: '#eb52de', tag: '大炮' },
  butterfly: { bg: ['#163c2c', '#0b1e16'], border: '#32d490', glyph: 'sword', accent: '#45ffb0', tag: '蝴蝶' },
  satanic: { bg: ['#421214', '#21090a'], border: '#e82e37', glyph: 'axe', accent: '#ff4752', tag: '撒旦' },
  mjollnir: { bg: ['#162a40', '#0b1520'], border: '#429cf0', glyph: 'hammer', accent: '#5ec4ff', tag: '大雷锤' },
  abyssal_blade: { bg: ['#341c28', '#1a0e14'], border: '#ba5084', glyph: 'sword', accent: '#ea65a6', tag: '大晕' },

  // 辅助与法杖
  blink_dagger: { bg: ['#142e3a', '#0a171d'], border: '#36afcf', glyph: 'dagger', accent: '#4fe3ff', tag: '跳刀' },
  force_staff: { bg: ['#283424', '#141a12'], border: '#7cb56a', glyph: 'staff', accent: '#9fe388', tag: '推推' },
  euls_scepter: { bg: ['#1c2e38', '#0e171c'], border: '#5aa3c7', glyph: 'staff', accent: '#72cdfa', tag: '风杖' },

  // 特殊件：神杖与魔晶
  aghanims_scepter: { bg: ['#14303c', '#0a181e'], border: '#3bc0e6', glyph: 'staff', accent: '#57f0ff', tag: 'A杖' },
  aghanims_shard: { bg: ['#16323c', '#0b191e'], border: '#42d4f0', glyph: 'orb', accent: '#5cf2ff', tag: '魔晶' },
};

// 缺省外观
const DEFAULT_VISUAL: ItemVisual = {
  bg: ['#282a30', '#141518'],
  border: '#8892a6',
  glyph: 'orb',
  accent: '#a8b5cc',
  tag: '物',
};

export function getItemVisual(itemId: string): ItemVisual {
  return ITEM_VISUALS[itemId] ?? DEFAULT_VISUAL;
}

/**
 * 绘制特定几何图元符号
 */
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: string, size: number, accent: string): void {
  const c = size / 2;
  const s = size * 0.46; // 核心符号半径
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (glyph) {
    case 'sword': {
      // 斜向长剑
      ctx.rotate(-Math.PI / 4);
      // 剑身
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.22, -s * 0.65);
      ctx.lineTo(s * 0.16, s * 0.35);
      ctx.lineTo(-s * 0.16, s * 0.35);
      ctx.lineTo(-s * 0.22, -s * 0.65);
      ctx.closePath();
      ctx.fill();
      // 护手
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * 0.35);
      ctx.lineTo(s * 0.45, s * 0.35);
      ctx.stroke();
      // 剑柄
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.lineTo(0, s * 0.85);
      ctx.stroke();
      break;
    }
    case 'axe': {
      // 战斧
      ctx.rotate(-Math.PI / 4);
      // 柄
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(0, s * 0.9);
      ctx.stroke();
      // 斧刃
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.quadraticCurveTo(s * 0.75, -s * 0.6, s * 0.8, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.6, s * 0.2, 0, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'dagger': {
      // 匕首
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(s * 0.25, -s * 0.4);
      ctx.lineTo(s * 0.12, s * 0.25);
      ctx.lineTo(-s * 0.12, s * 0.25);
      ctx.lineTo(-s * 0.25, -s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, s * 0.25);
      ctx.lineTo(s * 0.35, s * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, s * 0.25);
      ctx.lineTo(0, s * 0.75);
      ctx.stroke();
      break;
    }
    case 'shield': {
      // 盾牌
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.lineTo(s * 0.7, -s * 0.6);
      ctx.lineTo(s * 0.6, s * 0.2);
      ctx.lineTo(0, s * 0.85);
      ctx.lineTo(-s * 0.6, s * 0.2);
      ctx.lineTo(-s * 0.7, -s * 0.6);
      ctx.closePath();
      ctx.stroke();
      // 盾心微章
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'armor': {
      // 胸甲轮廓
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.7);
      ctx.lineTo(s * 0.5, -s * 0.7);
      ctx.lineTo(s * 0.75, -s * 0.2);
      ctx.lineTo(s * 0.45, s * 0.75);
      ctx.lineTo(-s * 0.45, s * 0.75);
      ctx.lineTo(-s * 0.75, -s * 0.2);
      ctx.closePath();
      ctx.stroke();
      // 护胸中缝
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(0, s * 0.6);
      ctx.stroke();
      break;
    }
    case 'boot':
    case 'shoe': {
      // 战靴
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.75);
      ctx.lineTo(s * 0.2, -s * 0.75);
      ctx.lineTo(s * 0.25, s * 0.1);
      ctx.lineTo(s * 0.7, s * 0.4);
      ctx.lineTo(s * 0.6, s * 0.75);
      ctx.lineTo(-s * 0.4, s * 0.75);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'staff':
    case 'wand': {
      // 法杖 / 权杖
      ctx.rotate(-Math.PI / 4);
      // 杖身
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.35);
      ctx.lineTo(0, s * 0.95);
      ctx.stroke();
      // 顶端宝石 / 聚能球
      ctx.beginPath();
      ctx.arc(0, -s * 0.6, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // 环绕光环
      ctx.beginPath();
      ctx.arc(0, -s * 0.6, s * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'hammer': {
      // 战锤
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(0, s * 0.9);
      ctx.stroke();
      // 锤头
      ctx.fillRect(-s * 0.55, -s * 0.85, s * 1.1, s * 0.5);
      break;
    }
    case 'ring': {
      // 魔法指环
      ctx.beginPath();
      ctx.arc(0, s * 0.1, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // 顶端宝石镶嵌
      ctx.beginPath();
      ctx.arc(0, -s * 0.5, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'orb':
    case 'amulet': {
      // 神秘法球 / 宝石
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.58, 0, Math.PI * 2);
      ctx.fill();
      // 高光内圈
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.beginPath();
      ctx.arc(-s * 0.15, -s * 0.15, s * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'flask': {
      // 药剂瓶
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.75);
      ctx.lineTo(s * 0.2, -s * 0.75);
      ctx.lineTo(s * 0.2, -s * 0.4);
      ctx.lineTo(s * 0.65, s * 0.5);
      ctx.lineTo(-s * 0.65, s * 0.5);
      ctx.lineTo(-s * 0.2, -s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'leaf': {
      // 树叶 / Tango
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.8);
      ctx.quadraticCurveTo(s * 0.7, -s * 0.2, 0, s * 0.8);
      ctx.quadraticCurveTo(-s * 0.7, -s * 0.2, 0, -s * 0.8);
      ctx.fill();
      break;
    }
    case 'heart': {
      // 恐鳌之心
      ctx.beginPath();
      ctx.moveTo(0, s * 0.65);
      ctx.bezierCurveTo(-s * 0.8, s * 0.1, -s * 0.8, -s * 0.6, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.8, -s * 0.6, s * 0.8, s * 0.1, 0, s * 0.65);
      ctx.fill();
      break;
    }
    case 'mask': {
      // 面具
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.6, s * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 眼窝
      ctx.beginPath();
      ctx.ellipse(-s * 0.25, -s * 0.15, s * 0.12, s * 0.18, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.25, -s * 0.15, s * 0.12, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'glove':
    case 'claw': {
      // 护手 / 拳套
      ctx.beginPath();
      ctx.roundRect(-s * 0.45, -s * 0.6, s * 0.9, s * 1.2, s * 0.2);
      ctx.fill();
      break;
    }
    default: {
      // 通用菱形 / 星徽
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.75);
      ctx.lineTo(s * 0.75, 0);
      ctx.lineTo(0, s * 0.75);
      ctx.lineTo(-s * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/**
 * 在 Canvas 上绘制完整的物品图标
 */
export function renderItemIcon(ctx: CanvasRenderingContext2D, itemId: string, size: number): void {
  const v = getItemVisual(itemId);
  ctx.save();
  ctx.clearRect(0, 0, size, size);

  // 1. 圆角底框与渐变背景
  const r = Math.max(3, size * 0.12);
  ctx.beginPath();
  ctx.roundRect(1, 1, size - 2, size - 2, r);
  ctx.clip();

  const grad = ctx.createRadialGradient(size * 0.5, size * 0.35, size * 0.1, size * 0.5, size * 0.5, size * 0.75);
  grad.addColorStop(0, v.bg[0]);
  grad.addColorStop(1, v.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 2. 居中几何矢量图元
  drawGlyph(ctx, v.glyph, size, v.accent);

  // 3. 底部半透明阴影与中文简记标签
  const tagH = Math.max(12, size * 0.28);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, size - tagH, size, tagH);

  ctx.font = `bold ${Math.max(9, Math.round(size * 0.20))}px -apple-system, "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 2;
  ctx.fillText(v.tag, size / 2, size - tagH / 2);
  ctx.shadowBlur = 0;

  // 4. 外边框描边
  ctx.strokeStyle = v.border;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.beginPath();
  ctx.roundRect(1, 1, size - 2, size - 2, r);
  ctx.stroke();

  ctx.restore();
}

// 缓存 Canvas 与 DataUrl
const ICON_CANVAS_CACHE = new Map<string, HTMLCanvasElement>();
const ICON_DATAURL_CACHE = new Map<string, string>();

export function getItemIconCanvas(itemId: string, size = 64): HTMLCanvasElement {
  const key = `${itemId}_${size}`;
  const cached = ICON_CANVAS_CACHE.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    return { width: size, height: size, toDataURL: () => '' } as any;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) renderItemIcon(ctx, itemId, size);
  ICON_CANVAS_CACHE.set(key, canvas);
  return canvas;
}

export function getItemIconDataUrl(itemId: string, size = 64): string {
  const key = `${itemId}_${size}`;
  const cached = ICON_DATAURL_CACHE.get(key);
  if (cached) return cached;

  const canvas = getItemIconCanvas(itemId, size);
  const url = canvas.toDataURL('image/png');
  ICON_DATAURL_CACHE.set(key, url);
  return url;
}

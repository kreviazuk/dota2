export interface ItemVisual {
  bg: [string, string];
  border: string;
  glyph: string;
  accent: string;
  tag: string;
}

// 物品外观配置表：背景渐变色、边框色、图元类型、强调色、中文简称标（保留 tag 供单元测试兼容）
const ITEM_VISUALS: Record<string, ItemVisual> = {
  // 消耗品
  tango: { bg: ['#1d4022', '#081a0c'], border: '#4ae26a', glyph: 'tango', accent: '#62ff85', tag: '吃树' },
  healing_salve: { bg: ['#14422e', '#061c12'], border: '#38d990', glyph: 'healing_salve', accent: '#50ffa8', tag: '大药' },
  clarity: { bg: ['#162a50', '#061022'], border: '#3880d9', glyph: 'clarity', accent: '#50a8ff', tag: '净化' },
  faerie_fire: { bg: ['#442010', '#1c0a04'], border: '#e27a4a', glyph: 'faerie_fire', accent: '#ff9050', tag: '火' },
  enchanted_mango: { bg: ['#443810', '#1c1404'], border: '#e2ba4a', glyph: 'enchanted_mango', accent: '#ffda50', tag: '芒果' },

  // 基础属性件
  iron_branch: { bg: ['#2e2c20', '#12120c'], border: '#8c8065', glyph: 'iron_branch', accent: '#a89878', tag: '树枝' },
  gauntlets_of_strength: { bg: ['#481414', '#1c0606'], border: '#d94545', glyph: 'glove', accent: '#ff5555', tag: '力量' },
  slippers_of_agility: { bg: ['#14441c', '#061c0a'], border: '#45d95e', glyph: 'boot', accent: '#55ff73', tag: '敏捷' },
  mantle_of_intelligence: { bg: ['#142848', '#061020'], border: '#4582d9', glyph: 'cloak', accent: '#559eff', tag: '智力' },
  circlet: { bg: ['#3a3020', '#18120a'], border: '#cca862', glyph: 'crown', accent: '#ffd57a', tag: '圆环' },
  belt_of_strength: { bg: ['#481616', '#1c0808'], border: '#d94545', glyph: 'belt', accent: '#ff5555', tag: '腰带' },
  band_of_elvenskin: { bg: ['#16441a', '#081c0c'], border: '#45d95e', glyph: 'boot', accent: '#55ff73', tag: '布带' },
  robe_of_the_magi: { bg: ['#162848', '#081020'], border: '#4582d9', glyph: 'cloak', accent: '#559eff', tag: '长袍' },
  crown: { bg: ['#443414', '#1c1406'], border: '#e2b84a', glyph: 'crown', accent: '#ffda55', tag: '王冠' },
  ogre_axe: { bg: ['#501616', '#220606'], border: '#e04848', glyph: 'ogre_axe', accent: '#ff6060', tag: '斧头' },
  blade_of_alacrity: { bg: ['#164c20', '#08220c'], border: '#48e065', glyph: 'blade_of_alacrity', accent: '#60ff80', tag: '欢欣' },
  staff_of_wizardry: { bg: ['#162e50', '#081422'], border: '#4890e0', glyph: 'staff_of_wizardry', accent: '#60aeff', tag: '魔杖' },
  diadem: { bg: ['#483c18', '#1e1808'], border: '#f0c850', glyph: 'crown', accent: '#ffe066', tag: '宝冕' },
  reaver: { bg: ['#601212', '#280404'], border: '#ff3d3d', glyph: 'ogre_axe', accent: '#ff6666', tag: '掠夺' },
  eaglesong: { bg: ['#166026', '#082a0e'], border: '#3dff64', glyph: 'blade_of_alacrity', accent: '#66ff88', tag: '鹰歌' },
  mystic_staff: { bg: ['#163660', '#08182a'], border: '#3da5ff', glyph: 'staff_of_wizardry', accent: '#66bdff', tag: '神秘' },
  ultimate_orb: { bg: ['#3c364c', '#181422'], border: '#baa8d6', glyph: 'orb', accent: '#e0c8ff', tag: '极限' },

  // 基础军械 / 配件
  quelling_blade: { bg: ['#36281a', '#161008'], border: '#997a55', glyph: 'quelling_blade', accent: '#c29a6b', tag: '补刀' },
  blades_of_attack: { bg: ['#362b24', '#16110d'], border: '#998075', glyph: 'claw', accent: '#c29a8a', tag: '爪子' },
  gloves_of_haste: { bg: ['#382e18', '#181206'], border: '#b89248', glyph: 'glove', accent: '#e6b85a', tag: '手套' },
  orb_of_blight: { bg: ['#3c1630', '#180612'], border: '#b84892', glyph: 'orb', accent: '#e65ab8', tag: '枯萎' },
  orb_of_venom: { bg: ['#163c16', '#061806'], border: '#48b848', glyph: 'orb', accent: '#5ae65a', tag: '毒球' },
  orb_of_frost: { bg: ['#16303c', '#061218'], border: '#4898b8', glyph: 'orb', accent: '#5ac0e6', tag: '冰珠' },
  morbid_mask: { bg: ['#441212', '#1c0404'], border: '#d93b3b', glyph: 'mask', accent: '#ff5555', tag: '吸血' },
  javelin: { bg: ['#3c2c16', '#181106'], border: '#b88a48', glyph: 'spear', accent: '#e6ae5a', tag: '标枪' },
  broadsword: { bg: ['#282c38', '#101218'], border: '#788299', glyph: 'sword', accent: '#99a6c2', tag: '阔剑' },
  blitz_knuckles: { bg: ['#283446', '#10151e'], border: '#628bb8', glyph: 'glove', accent: '#7ab0e6', tag: '指套' },
  claymore: { bg: ['#2e323c', '#121418'], border: '#8892a6', glyph: 'sword', accent: '#a8b5cc', tag: '大剑' },
  mithril_hammer: { bg: ['#2c3846', '#10161e'], border: '#88a6c2', glyph: 'hammer', accent: '#a8cce6', tag: '秘银' },
  hyperstone: { bg: ['#16442c', '#061a10'], border: '#48c282', glyph: 'orb', accent: '#5ae69e', tag: '振奋' },
  demon_edge: { bg: ['#44142e', '#1c0410'], border: '#c24888', glyph: 'sword', accent: '#e65aa6', tag: '恶魔' },
  sacred_relic: { bg: ['#463a14', '#1c1604'], border: '#e2ba4a', glyph: 'sword', accent: '#ffda50', tag: '圣者' },

  // 防御基础
  ring_of_protection: { bg: ['#242a34', '#0e1116'], border: '#6e7f99', glyph: 'ring', accent: '#8da2c2', tag: '守护' },
  ring_of_regen: { bg: ['#361e16', '#160a06'], border: '#b86548', glyph: 'ring', accent: '#e67f5a', tag: '回复' },
  sages_mask: { bg: ['#1e2434', '#0a0d16'], border: '#5a6ea0', glyph: 'mask', accent: '#708ac8', tag: '贤者' },
  wind_lace: { bg: ['#283224', '#0e140c'], border: '#75996e', glyph: 'boot', accent: '#95c28d', tag: '风灵' },
  fluffy_hat: { bg: ['#34241e', '#140c0a'], border: '#996e5a', glyph: 'hat', accent: '#c28c72', tag: '毛毛' },
  wizard_hat: { bg: ['#282038', '#0e0a16'], border: '#785a99', glyph: 'hat', accent: '#9972c2', tag: '法帽' },
  shawl: { bg: ['#262a34', '#0e1016'], border: '#657388', glyph: 'cloak', accent: '#8193ad', tag: '披巾' },
  chainmail: { bg: ['#262b34', '#0e1116'], border: '#758094', glyph: 'armor', accent: '#96a4bd', tag: '锁甲' },
  ring_of_health: { bg: ['#381c16', '#160a06'], border: '#b85248', glyph: 'ring', accent: '#e6665a', tag: '治愈' },
  void_stone: { bg: ['#162a46', '#06101e'], border: '#487bb8', glyph: 'orb', accent: '#5a9ae6', tag: '虚无' },
  energy_booster: { bg: ['#162446', '#060c1e'], border: '#4868b8', glyph: 'orb', accent: '#5a82e6', tag: '能量' },
  cloak: { bg: ['#2e2838', '#100c16'], border: '#7d6e94', glyph: 'cloak', accent: '#9f8dbd', tag: '斗篷' },
  chasm_stone: { bg: ['#322030', '#140a12'], border: '#945e8a', glyph: 'orb', accent: '#bd78b0', tag: '裂隙' },
  splintmail: { bg: ['#282c34', '#101216'], border: '#788294', glyph: 'armor', accent: '#9aa7bd', tag: '片甲' },
  helm_of_iron_will: { bg: ['#322a2a', '#140e0e'], border: '#8c7575', glyph: 'helm', accent: '#b39595', tag: '铁意' },
  vitality_booster: { bg: ['#441414', '#1c0404'], border: '#b84848', glyph: 'orb', accent: '#e65a5a', tag: '活力' },
  point_booster: { bg: ['#38244c', '#140a20'], border: '#8b5eb8', glyph: 'orb', accent: '#ae76e6', tag: '精气' },
  talisman_of_evasion: { bg: ['#1c3240', '#08141c'], border: '#5488a8', glyph: 'amulet', accent: '#6aacd1', tag: '闪避' },
  platemail: { bg: ['#282c38', '#0e1018'], border: '#758399', glyph: 'armor', accent: '#97a8c4', tag: '板甲' },
  ring_of_tarrasque: { bg: ['#441418', '#1c0406'], border: '#ba4850', glyph: 'ring', accent: '#e85a64', tag: '恐鳌' },

  // 鞋类与合成小件
  magic_stick: { bg: ['#243424', '#0c160c'], border: '#659465', glyph: 'magic_wand', accent: '#81bd81', tag: '魔棒' },
  boots_of_speed: { bg: ['#342416', '#140c06'], border: '#996e45', glyph: 'boots_of_speed', accent: '#c28c58', tag: '草鞋' },
  blink_dagger: { bg: ['#2e144a', '#10041d'], border: '#4fe3ff', glyph: 'blink_dagger', accent: '#70eaff', tag: '跳刀' },
  tranquil_boots: { bg: ['#183a18', '#061606'], border: '#52a352', glyph: 'tranquil_boots', accent: '#69cf69', tag: '绿鞋' },
  power_treads: { bg: ['#382a16', '#160e04'], border: '#f59e0b', glyph: 'power_treads', accent: '#fbbf24', tag: '假腿' },
  phase_boots: { bg: ['#301638', '#120418'], border: '#c084fc', glyph: 'phase_boots', accent: '#e879f9', tag: '相位' },
  arcane_boots: { bg: ['#162c4c', '#061224'], border: '#38bdf8', glyph: 'arcane_boots', accent: '#60a5fa', tag: '秘法' },
  magic_wand: { bg: ['#223a22', '#0a1a0a'], border: '#4ade80', glyph: 'magic_wand', accent: '#86efac', tag: '大棒' },
  bracer: { bg: ['#441a16', '#1c0806'], border: '#b84e45', glyph: 'glove', accent: '#e66257', tag: '护腕' },
  wraith_band: { bg: ['#163824', '#06180c'], border: '#45b862', glyph: 'glove', accent: '#57e67b', tag: '系带' },
  null_talisman: { bg: ['#162846', '#060e1e'], border: '#456bb8', glyph: 'amulet', accent: '#5786e6', tag: '挂件' },
  buckler: { bg: ['#2a2c30', '#101114'], border: '#78808a', glyph: 'shield', accent: '#9aa4b0', tag: '圆盾' },
  headdress: { bg: ['#203224', '#0a160c'], border: '#5c9966', glyph: 'crown', accent: '#74c281', tag: '头巾' },
  ring_of_basilius: { bg: ['#322e20', '#141208'], border: '#998c5c', glyph: 'ring', accent: '#c2b274', tag: '王者' },
  soul_ring: { bg: ['#441624', '#1c040c'], border: '#b84562', glyph: 'ring', accent: '#e6577b', tag: '魂戒' },
  orb_of_corrosion: { bg: ['#303618', '#121606'], border: '#92a345', glyph: 'orb', accent: '#b7cc57', tag: '腐蚀' },
  perseverance: { bg: ['#342032', '#140814'], border: '#9e5a8f', glyph: 'ring', accent: '#c772b4', tag: '坚韧' },

  // 防御大件
  vanguard: { bg: ['#441818', '#1c0606'], border: '#ef4444', glyph: 'vanguard', accent: '#f87171', tag: '先锋' },
  mekansm: { bg: ['#223c30', '#0a1a12'], border: '#10b981', glyph: 'mekansm', accent: '#34d399', tag: '梅肯' },
  blade_mail: { bg: ['#2c2c38', '#101018'], border: '#94a3b8', glyph: 'blade_mail', accent: '#cbd5e1', tag: '刃甲' },
  heaven_halberd: { bg: ['#443416', '#1c1404'], border: '#f59e0b', glyph: 'spear', accent: '#fbbf24', tag: '天堂' },
  crimson_guard: { bg: ['#4a1212', '#200404'], border: '#ef4444', glyph: 'crimson_guard', accent: '#f87171', tag: '赤红' },
  pipe_of_insight: { bg: ['#203640', '#0a161c'], border: '#38bdf8', glyph: 'pipe_of_insight', accent: '#7dd3fc', tag: '笛子' },
  black_king_bar: { bg: ['#4a3c14', '#201604'], border: '#facc15', glyph: 'black_king_bar', accent: '#fef08a', tag: 'BKB' },
  shivas_guard: { bg: ['#163248', '#061422'], border: '#38bdf8', glyph: 'shivas_guard', accent: '#bae6fd', tag: '希瓦' },
  linkens_sphere: { bg: ['#183048', '#061220'], border: '#60a5fa', glyph: 'linkens_sphere', accent: '#93c5fd', tag: '林肯' },
  assault_cuirass: { bg: ['#28322c', '#0e1612'], border: '#4ade80', glyph: 'assault_cuirass', accent: '#86efac', tag: '强袭' },
  heart_of_tarrasque: { bg: ['#520e18', '#240206'], border: '#f43f5e', glyph: 'heart_of_tarrasque', accent: '#fda4af', tag: '龙心' },

  // 输出与武器大件
  mask_of_madness: { bg: ['#441828', '#1c060e'], border: '#f43f5e', glyph: 'mask_of_madness', accent: '#fb7185', tag: '疯脸' },
  crystalys: { bg: ['#1c2e46', '#081422'], border: '#60a5fa', glyph: 'crystalys', accent: '#93c5fd', tag: '水晶' },
  sange: { bg: ['#481414', '#1e0404'], border: '#ef4444', glyph: 'sange', accent: '#f87171', tag: '散华' },
  yasha: { bg: ['#144824', '#041e0a'], border: '#22c55e', glyph: 'yasha', accent: '#4ade80', tag: '夜叉' },
  armlet_of_mordiggian: { bg: ['#481216', '#200204'], border: '#ef4444', glyph: 'armlet_of_mordiggian', accent: '#f87171', tag: '臂章' },
  echo_sabre: { bg: ['#1a2e48', '#061222'], border: '#38bdf8', glyph: 'echo_sabre', accent: '#7dd3fc', tag: '回音' },
  skull_basher: { bg: ['#382a2a', '#160e0e'], border: '#a87979', glyph: 'skull_basher', accent: '#d49898', tag: '碎颅' },
  maelstrom: { bg: ['#18344e', '#061424'], border: '#38bdf8', glyph: 'maelstrom', accent: '#93c5fd', tag: '电锤' },
  desolator: { bg: ['#520c14', '#220204'], border: '#ef4444', glyph: 'desolator', accent: '#fda4af', tag: '暗灭' },
  battle_fury: { bg: ['#482410', '#1c0a02'], border: '#f97316', glyph: 'battle_fury', accent: '#fdba74', tag: '狂战' },
  sange_and_yasha: { bg: ['#382e18', '#161206'], border: '#facc15', glyph: 'sange_and_yasha', accent: '#fef08a', tag: '双刀' },
  radiance: { bg: ['#523c0c', '#241802'], border: '#facc15', glyph: 'radiance', accent: '#fef08a', tag: '辉耀' },
  monkey_king_bar: { bg: ['#4e2410', '#200a02'], border: '#f97316', glyph: 'monkey_king_bar', accent: '#fdba74', tag: '金箍棒' },
  satanic: { bg: ['#540e16', '#240206'], border: '#e11d48', glyph: 'satanic', accent: '#f43f5e', tag: '撒旦' },
  daedalus: { bg: ['#48143a', '#1e0416'], border: '#d946ef', glyph: 'daedalus', accent: '#f0abfc', tag: '大炮' },
  butterfly: { bg: ['#124830', '#041e12'], border: '#10b981', glyph: 'butterfly', accent: '#6ee7b7', tag: '蝴蝶' },
  mjollnir: { bg: ['#143050', '#041224'], border: '#38bdf8', glyph: 'mjollnir', accent: '#93c5fd', tag: '大雷锤' },
  abyssal_blade: { bg: ['#44162e', '#1c0410'], border: '#e11d48', glyph: 'abyssal_blade', accent: '#fb7185', tag: '大晕' },

  // 辅助与法杖
  force_staff: { bg: ['#283c24', '#0c1a0a'], border: '#4ade80', glyph: 'force_staff', accent: '#86efac', tag: '推推' },
  euls_scepter: { bg: ['#1e3848', '#081822'], border: '#38bdf8', glyph: 'euls_scepter', accent: '#7dd3fc', tag: '风杖' },

  // 特殊神杖与魔晶
  aghanims_scepter: { bg: ['#10364c', '#041420'], border: '#38bdf8', glyph: 'aghanims_scepter', accent: '#7dd3fc', tag: 'A杖' },
  aghanims_shard: { bg: ['#0e3c50', '#021624'], border: '#06b6d4', glyph: 'aghanims_shard', accent: '#67e8f9', tag: '魔晶' },
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
 * 核心渲染器：绘制纯粹、华丽、极具 Dota 2 质感的物品矢量图（彻底移除遮挡画面的粗糙文字条）
 */
export function renderItemIcon(ctx: CanvasRenderingContext2D, itemId: string, size: number): void {
  const v = getItemVisual(itemId);
  ctx.save();
  ctx.clearRect(0, 0, size, size);

  // 1. 圆角底框与暗色质感边缘裁剪
  const r = Math.max(4, Math.round(size * 0.12));
  ctx.beginPath();
  ctx.roundRect(1, 1, size - 2, size - 2, r);
  ctx.clip();

  // 2. 深度暗金/魔能径向渐变底色
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.38, size * 0.08, size * 0.5, size * 0.5, size * 0.75);
  grad.addColorStop(0, v.bg[0]);
  grad.addColorStop(1, v.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 3. Dota 2 标志性背景微光与暗角阴影
  const innerVignette = ctx.createLinearGradient(0, 0, 0, size);
  innerVignette.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  innerVignette.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  innerVignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = innerVignette;
  ctx.fillRect(0, 0, size, size);

  // 4. 专属 Dota 2 矢量插画
  drawItemArtwork(ctx, itemId, v.glyph, size, v.accent);

  // 5. 顶部金属高光折射微光（斜切质感）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(size * 0.15, size * 0.05);
  ctx.lineTo(size * 0.85, size * 0.05);
  ctx.stroke();

  // 6. 外边框：Dota 2 精致立体金属框（上亮下暗）
  ctx.strokeStyle = v.border;
  ctx.lineWidth = Math.max(1.5, size * 0.045);
  ctx.beginPath();
  ctx.roundRect(1, 1, size - 2, size - 2, r);
  ctx.stroke();

  ctx.restore();
}

/**
 * 绘制特定物品的精细 Dota 2 风格矢量图形
 */
function drawItemArtwork(ctx: CanvasRenderingContext2D, itemId: string, glyph: string, size: number, accent: string): void {
  const c = size / 2;
  const s = size * 0.44; // 基准核心半径

  ctx.save();
  ctx.translate(c, c);

  // 根据具体物品 ID 或图元类型分发绘制
  switch (itemId) {
    case 'blink_dagger': {
      // 闪烁匕首：弧形紫青流光匕首 + 金色护手 + 蓝白符文闪光
      ctx.rotate(-Math.PI / 4);
      // 刀刃
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.quadraticCurveTo(s * 0.35, -s * 0.35, s * 0.12, s * 0.2);
      ctx.lineTo(-s * 0.12, s * 0.2);
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.4, 0, -s * 0.95);
      ctx.closePath();
      ctx.fill();

      // 刀脊能量光槽
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.8);
      ctx.lineTo(0, s * 0.1);
      ctx.stroke();

      // 护手
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-s * 0.35, s * 0.2, s * 0.7, s * 0.1);

      // 剑柄与宝石柄尾
      ctx.fillStyle = '#475569';
      ctx.fillRect(-s * 0.08, s * 0.3, s * 0.16, s * 0.45);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, s * 0.8, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'black_king_bar': {
      // 黑皇杖：金色天神权杖 + 双翼龙冠 + 金色光芒
      ctx.rotate(-Math.PI / 4);
      // 杖身金纹
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3);
      ctx.lineTo(0, s * 0.95);
      ctx.stroke();

      // 顶部展翅金冠
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.45, -s * 0.6);
      ctx.lineTo(s * 0.25, -s * 0.35);
      ctx.lineTo(0, -s * 0.45);
      ctx.lineTo(-s * 0.25, -s * 0.35);
      ctx.lineTo(-s * 0.45, -s * 0.6);
      ctx.closePath();
      ctx.fill();

      // 核心红宝石
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'power_treads': {
      // 动力鞋：硬朗战靴 + 中心发光切换属性宝石
      drawBootShape(ctx, s, '#78350f', '#f59e0b');
      // 动力切换核心宝石
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.15);
      ctx.lineTo(s * 0.22, s * 0.2);
      ctx.lineTo(-s * 0.22, s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'phase_boots': {
      // 相位鞋：暗紫战靴 + 幽灵相位尾焰
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.6)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.2);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.2, -s * 0.3, -s * 0.5);
      ctx.stroke();

      drawBootShape(ctx, s, '#3b0764', '#c084fc');
      break;
    }

    case 'tranquil_boots': {
      // 静谧之靴：生机绿靴 + 环绕藤蔓叶片
      drawBootShape(ctx, s, '#14532d', '#22c55e');
      ctx.fillStyle = '#86efac';
      ctx.beginPath();
      ctx.arc(s * 0.1, s * 0.1, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'arcane_boots': {
      // 秘法鞋：铁蓝铠靴 + 闪耀法力菱形宝石
      drawBootShape(ctx, s, '#1e3a5f', '#38bdf8');
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.2);
      ctx.lineTo(s * 0.2, 0);
      ctx.lineTo(0, s * 0.2);
      ctx.lineTo(-s * 0.2, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'boots_of_speed': {
      drawBootShape(ctx, s, '#5c3a21', '#d97706');
      break;
    }

    case 'battle_fury': {
      // 狂战斧：双刃巨斧 + 烈焰火星
      ctx.rotate(-Math.PI / 4);
      // 柄
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = Math.max(2.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(0, s * 0.95);
      ctx.stroke();

      // 双刃银月斧身
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.quadraticCurveTo(s * 0.8, -s * 0.55, s * 0.75, s * 0.1);
      ctx.lineTo(0, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.55, -s * 0.75, s * 0.1);
      ctx.closePath();
      ctx.fill();

      // 刃口灼热红炎
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = Math.max(2, size * 0.04);
      ctx.stroke();
      break;
    }

    case 'daedalus': {
      // 代达罗斯之殇（大炮）：金色重弩 + 猩红弩矢
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(3, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.3);
      ctx.quadraticCurveTo(0, -s * 0.85, s * 0.7, -s * 0.3);
      ctx.stroke();

      ctx.fillStyle = '#451a03';
      ctx.fillRect(-s * 0.12, -s * 0.5, s * 0.24, s * 1.1);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.18, -s * 0.55);
      ctx.lineTo(-s * 0.18, -s * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'desolator': {
      // 黯灭：猩红滴血巨镰
      ctx.rotate(-Math.PI / 5);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = Math.max(2.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, s * 0.9);
      ctx.lineTo(s * 0.4, -s * 0.6);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(s * 0.4, -s * 0.6);
      ctx.quadraticCurveTo(-s * 0.8, -s * 0.95, -s * 0.7, -s * 0.1);
      ctx.quadraticCurveTo(-s * 0.3, -s * 0.4, s * 0.35, -s * 0.45);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'aghanims_scepter': {
      // 阿哈利姆神杖：细长权杖 + 聚灵青晶球 + 四爪金托
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = Math.max(3, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3);
      ctx.lineTo(0, s * 0.95);
      ctx.stroke();

      // 金托爪
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.38, 0, Math.PI);
      ctx.stroke();

      // 神秘能量水晶球
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // 核心白亮星光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-s * 0.08, -s * 0.62, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'aghanims_shard': {
      // 阿哈利姆魔晶：悬浮六边形青晶棱柱
      ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = Math.max(2, size * 0.05);

      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(s * 0.6, -s * 0.35);
      ctx.lineTo(s * 0.6, s * 0.35);
      ctx.lineTo(0, s * 0.85);
      ctx.lineTo(-s * 0.6, s * 0.35);
      ctx.lineTo(-s * 0.6, -s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 内部折射棱线
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(0, s * 0.85);
      ctx.moveTo(-s * 0.6, -s * 0.35);
      ctx.lineTo(s * 0.6, s * 0.35);
      ctx.stroke();
      break;
    }

    case 'sange': {
      drawKatana(ctx, s, '#ef4444', '#7f1d1d');
      break;
    }
    case 'yasha': {
      drawKatana(ctx, s, '#22c55e', '#14532d');
      break;
    }
    case 'sange_and_yasha': {
      // 散夜对剑：红绿双刀交错
      ctx.save();
      ctx.rotate(-Math.PI / 4);
      drawKatana(ctx, s * 0.9, '#ef4444', '#7f1d1d');
      ctx.restore();
      ctx.save();
      ctx.rotate(Math.PI / 4);
      drawKatana(ctx, s * 0.9, '#22c55e', '#14532d');
      ctx.restore();
      break;
    }

    case 'butterfly': {
      // 蝴蝶：翠绿蝶翼双刃
      ctx.fillStyle = '#10b981';
      ctx.strokeStyle = '#6ee7b7';
      ctx.lineWidth = Math.max(1.5, size * 0.04);
      // 上翅刃
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.bezierCurveTo(s * 0.7, 0, s * 0.8, -s * 0.8, 0, -s * 0.5);
      ctx.bezierCurveTo(-s * 0.8, -s * 0.8, -s * 0.7, 0, 0, s * 0.3);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'heart_of_tarrasque': {
      // 恐鳌之心：红宝石龙心 + 金色主干脉络
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.75);
      ctx.bezierCurveTo(-s * 0.85, s * 0.1, -s * 0.85, -s * 0.6, 0, -s * 0.25);
      ctx.bezierCurveTo(s * 0.85, -s * 0.6, s * 0.85, s * 0.1, 0, s * 0.75);
      ctx.fill();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.2);
      ctx.lineTo(0, s * 0.5);
      ctx.moveTo(-s * 0.3, -s * 0.05);
      ctx.lineTo(s * 0.3, s * 0.15);
      ctx.stroke();
      break;
    }

    case 'assault_cuirass': {
      // 强袭胸甲：黑铁铠甲 + 辐射绿符文排骨
      drawArmorOutline(ctx, s, '#1e293b');
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = Math.max(2, size * 0.045);
      for (let y = -s * 0.3; y <= s * 0.3; y += s * 0.25) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.35, y);
        ctx.lineTo(s * 0.35, y);
        ctx.stroke();
      }
      break;
    }

    case 'shivas_guard': {
      // 希瓦的守护：冰霜银铠 + 中心璀璨雪花晶核
      drawArmorOutline(ctx, s, '#334155');
      drawSnowflake(ctx, s * 0.35, '#38bdf8');
      break;
    }

    case 'radiance': {
      // 辉耀：太阳神剑 + 日冕金光烈焰
      ctx.rotate(-Math.PI / 4);
      // 日冕辐射
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
      ctx.lineWidth = Math.max(2, size * 0.05);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
        ctx.lineTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85);
        ctx.stroke();
      }
      // 金剑
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-s * 0.12, -s * 0.9, s * 0.24, s * 1.3);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-s * 0.3, s * 0.4, s * 0.6, s * 0.1);
      break;
    }

    case 'monkey_king_bar': {
      // 金箍棒：红身两头金箍
      ctx.rotate(-Math.PI / 4);
      // 红身
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-s * 0.1, -s * 0.9, s * 0.2, s * 1.8);
      // 两头金箍
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-s * 0.15, -s * 0.9, s * 0.3, s * 0.35);
      ctx.fillRect(-s * 0.15, s * 0.55, s * 0.3, s * 0.35);
      break;
    }

    case 'satanic': {
      // 撒旦之邪力：恶魔犄角血刃 + 猩红邪眼
      ctx.rotate(-Math.PI / 5);
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.moveTo(s * 0.4, -s * 0.8);
      ctx.quadraticCurveTo(-s * 0.7, -s * 0.7, -s * 0.5, s * 0.4);
      ctx.lineTo(0, s * 0.2);
      ctx.closePath();
      ctx.fill();

      // 邪眼
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(-s * 0.1, -s * 0.1, s * 0.2, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(-s * 0.12, -s * 0.2, s * 0.05, s * 0.2);
      break;
    }

    case 'tango': {
      // 吃树：三片碧翠绿叶 + 露珠
      ctx.fillStyle = '#22c55e';
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = Math.max(1, size * 0.025);
      for (const rot of [-0.4, 0, 0.4]) {
        ctx.save();
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.85);
        ctx.quadraticCurveTo(s * 0.4, -s * 0.2, 0, s * 0.6);
        ctx.quadraticCurveTo(-s * 0.4, -s * 0.2, 0, -s * 0.85);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case 'healing_salve': {
      // 治疗药膏：饱满玻璃烧瓶 + 绿液 + 木塞
      drawPotionFlask(ctx, s, '#22c55e', '#78350f');
      break;
    }

    case 'clarity': {
      // 净化药水：晶莹长颈瓶 + 蓝光魔力药水
      drawPotionFlask(ctx, s, '#38bdf8', '#0284c7');
      break;
    }

    case 'enchanted_mango': {
      // 魔法芒果：圆润芒果 + 绿叶
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.1, s * 0.55, s * 0.68, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // 叶梗
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(s * 0.25, -s * 0.55, s * 0.25, s * 0.1, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'magic_wand':
    case 'magic_stick': {
      // 魔杖：木质魔杖 + 三颗发光宝珠
      ctx.rotate(-Math.PI / 4);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(0, s * 0.9);
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      for (const y of [-s * 0.65, -s * 0.45, -s * 0.25]) {
        ctx.beginPath();
        ctx.arc(0, y, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'vanguard': {
      // 先锋盾：深红圆盾 + 黄金狮面
      drawRoundShield(ctx, s, '#991b1b', '#facc15');
      break;
    }

    case 'blade_mail': {
      // 刃甲：尖刺黑钢胸甲
      drawArmorOutline(ctx, s, '#334155');
      ctx.fillStyle = '#94a3b8';
      for (const x of [-s * 0.4, -s * 0.15, s * 0.15, s * 0.4]) {
        ctx.beginPath();
        ctx.moveTo(x, -s * 0.3);
        ctx.lineTo(x + s * 0.08, -s * 0.7);
        ctx.lineTo(x + s * 0.16, -s * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'crimson_guard': {
      // 赤红甲：重型赤红棱面塔盾
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.lineTo(s * 0.65, -s * 0.5);
      ctx.lineTo(s * 0.5, s * 0.6);
      ctx.lineTo(0, s * 0.95);
      ctx.lineTo(-s * 0.5, s * 0.6);
      ctx.lineTo(-s * 0.65, -s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'mekansm': {
      // 梅肯：金盾 + 翠绿十字医徽
      drawRoundShield(ctx, s, '#15803d', '#facc15');
      ctx.fillStyle = '#86efac';
      ctx.fillRect(-s * 0.08, -s * 0.35, s * 0.16, s * 0.7);
      ctx.fillRect(-s * 0.35, -s * 0.08, s * 0.7, s * 0.16);
      break;
    }

    case 'pipe_of_insight': {
      // 笛子：木质烟斗 + 苍蓝防护烟圈
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, s * 0.4);
      ctx.quadraticCurveTo(0, s * 0.5, s * 0.4, -s * 0.2);
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.beginPath();
      ctx.arc(s * 0.45, -s * 0.4, s * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    // 默认备用几何图元系统
    default: {
      drawGenericGlyph(ctx, glyph, s, size, accent);
      break;
    }
  }

  ctx.restore();
}

/** 辅助：战靴 */
function drawBootShape(ctx: CanvasRenderingContext2D, s: number, fill: string, stroke: string): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, -s * 0.8);
  ctx.lineTo(s * 0.15, -s * 0.8);
  ctx.lineTo(s * 0.25, s * 0.1);
  ctx.lineTo(s * 0.75, s * 0.4);
  ctx.lineTo(s * 0.65, s * 0.8);
  ctx.lineTo(-s * 0.4, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** 辅助：太刀 */
function drawKatana(ctx: CanvasRenderingContext2D, s: number, blade: string, hilt: string): void {
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.95);
  ctx.quadraticCurveTo(s * 0.18, -s * 0.3, s * 0.1, s * 0.25);
  ctx.lineTo(-s * 0.1, s * 0.25);
  ctx.quadraticCurveTo(0, -s * 0.3, 0, -s * 0.95);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(-s * 0.25, s * 0.25, s * 0.5, s * 0.08);
  ctx.fillStyle = hilt;
  ctx.fillRect(-s * 0.08, s * 0.33, s * 0.16, s * 0.5);
}

/** 辅助：胸甲轮廓 */
function drawArmorOutline(ctx: CanvasRenderingContext2D, s: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s * 0.7);
  ctx.lineTo(s * 0.55, -s * 0.7);
  ctx.lineTo(s * 0.8, -s * 0.15);
  ctx.lineTo(s * 0.5, s * 0.85);
  ctx.lineTo(-s * 0.5, s * 0.85);
  ctx.lineTo(-s * 0.8, -s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** 辅助：圆盾 */
function drawRoundShield(ctx: CanvasRenderingContext2D, s: number, fill: string, rim: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rim;
  ctx.lineWidth = Math.max(3, s * 0.14);
  ctx.stroke();
}

/** 辅助：药剂烧瓶 */
function drawPotionFlask(ctx: CanvasRenderingContext2D, s: number, liquid: string, cork: string): void {
  // 软木塞
  ctx.fillStyle = cork;
  ctx.fillRect(-s * 0.15, -s * 0.85, s * 0.3, s * 0.2);

  // 瓶体
  ctx.fillStyle = liquid;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s * 0.65);
  ctx.lineTo(s * 0.15, -s * 0.65);
  ctx.lineTo(s * 0.15, -s * 0.25);
  ctx.arc(0, s * 0.25, s * 0.55, -Math.PI * 0.25, Math.PI * 1.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** 辅助：雪花晶核 */
function drawSnowflake(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
  }
}

/** 通用图元备用绘制 */
function drawGenericGlyph(ctx: CanvasRenderingContext2D, glyph: string, s: number, size: number, accent: string): void {
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (glyph) {
    case 'sword': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-s * 0.12, -s * 0.9, s * 0.24, s * 1.2);
      ctx.fillRect(-s * 0.35, s * 0.3, s * 0.7, s * 0.1);
      break;
    }
    case 'axe':
    case 'ogre_axe':
    case 'quelling_blade': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-s * 0.08, -s * 0.9, s * 0.16, s * 1.8);
      ctx.beginPath();
      ctx.arc(s * 0.2, -s * 0.4, s * 0.45, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      break;
    }
    case 'staff':
    case 'staff_of_wizardry': {
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-s * 0.08, -s * 0.3, s * 0.16, s * 1.2);
      ctx.beginPath();
      ctx.arc(0, -s * 0.55, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'blade_of_alacrity': {
      drawKatana(ctx, s, accent, '#334155');
      break;
    }
    case 'ring': {
      ctx.beginPath();
      ctx.arc(0, s * 0.1, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.45, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'orb':
    case 'amulet': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, size * 0.035);
      ctx.beginPath();
      ctx.arc(-s * 0.15, -s * 0.15, s * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.4);
      ctx.lineTo(-s * 0.6, -s * 0.3);
      ctx.lineTo(-s * 0.25, 0);
      ctx.lineTo(0, -s * 0.5);
      ctx.lineTo(s * 0.25, 0);
      ctx.lineTo(s * 0.6, -s * 0.3);
      ctx.lineTo(s * 0.6, s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'glove':
    case 'claw': {
      ctx.beginPath();
      ctx.roundRect(-s * 0.45, -s * 0.6, s * 0.9, s * 1.2, s * 0.2);
      ctx.fill();
      break;
    }
    case 'cloak': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.6);
      ctx.lineTo(s * 0.4, -s * 0.6);
      ctx.lineTo(s * 0.65, s * 0.7);
      ctx.lineTo(-s * 0.65, s * 0.7);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'iron_branch': {
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = Math.max(2.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, s * 0.7);
      ctx.lineTo(s * 0.3, -s * 0.7);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(s * 0.15, -s * 0.3, s * 0.18, 0, Math.PI * 2);
      ctx.arc(-s * 0.1, s * 0.2, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
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
}

// 缓存 Canvas、DataUrl 与官方高清图片
const ICON_CANVAS_CACHE = new Map<string, HTMLCanvasElement>();
const ICON_DATAURL_CACHE = new Map<string, string>();
const ITEM_IMG_CACHE = new Map<string, HTMLImageElement>();

function getItemImage(itemId: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = ITEM_IMG_CACHE.get(itemId);
  if (!img) {
    img = new Image();
    img.src = `/assets/items/${itemId}.png`;
    ITEM_IMG_CACHE.set(itemId, img);
  }
  return img;
}

export function drawItemImageOnCanvas(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);

  // 1. 圆角裁切
  const r = Math.max(3, Math.round(size * 0.08));
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.clip();

  // 2. 底色填充
  ctx.fillStyle = '#0f1118';
  ctx.fillRect(0, 0, size, size);

  // 3. 居中覆盖绘制官方图标 (88x64 裁切为方形)
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  let sx = 0, sy = 0, sw = nw, sh = nh;
  if (nw > nh) {
    sw = nh;
    sx = (nw - sw) / 2;
  } else if (nh > nw) {
    sh = nw;
    sy = (nh - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

  // 4. 金属微内边框
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  ctx.restore();
}

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
  if (ctx) {
    const img = getItemImage(itemId);
    if (img && img.complete && img.naturalWidth > 0) {
      drawItemImageOnCanvas(ctx, img, size);
    } else {
      renderItemIcon(ctx, itemId, size);
      if (img && !img.complete) {
        img.addEventListener('load', () => {
          drawItemImageOnCanvas(ctx, img, size);
        }, { once: true });
      }
    }
  }
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

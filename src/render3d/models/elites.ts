import { Group, type BufferGeometry } from 'three';
import { GeoBuilder } from '../geo';
import { PAL, teamColor } from '../materials';
import { type AnimTracker, smooth01 } from '../anim';
import { bone, cachedGeo } from './rig';
import type { CreepPart, CreepRig } from './creeps';

export const ELITE_TYPES = new Set([
  'centaur_conqueror',
  'alpha_wolf',
  'satyr_hellcaller',
  'ancient_black_dragon',
  'ancient_rock_golem',
  'golem_shard',
  'roshan',
]);

export function isEliteType(type: string): boolean {
  return ELITE_TYPES.has(type);
}

export function eliteScale(type: string): number {
  switch (type) {
    case 'roshan':
      return 2.2;
    case 'ancient_black_dragon':
      return 1.7;
    case 'ancient_rock_golem':
      return 1.6;
    case 'centaur_conqueror':
      return 1.5;
    case 'satyr_hellcaller':
      return 1.4;
    case 'alpha_wolf':
      return 1.3;
    case 'golem_shard':
      return 0.95;
    default:
      return 1.4;
  }
}

export function eliteHeadHeight(type: string): number {
  switch (type) {
    case 'roshan':
      return 165;
    case 'ancient_black_dragon':
      return 145;
    case 'ancient_rock_golem':
      return 138;
    case 'centaur_conqueror':
      return 135;
    case 'satyr_hellcaller':
      return 125;
    case 'alpha_wolf':
      return 85;
    case 'golem_shard':
      return 72;
    default:
      return 120;
  }
}

// ==================== 1. 半人马征服者 (Centaur Conqueror) ====================
function centaurTorsoGeo(team: number): BufferGeometry {
  const b = new GeoBuilder(601 + team);
  // 四足马身下盘
  b.box(28, 22, 44, 0x6e3b20, { p: [0, 22, 0] });
  b.box(30, 6, 26, teamColor(team), { p: [0, 32, -4] });
  b.cyl(3, 1.5, 20, 6, 0x4a2414, { p: [0, 22, -24], r: [-0.6, 0, 0] }); // 马尾
  // 人形上半身
  b.box(26, 28, 18, 0x8a4b2a, { p: [0, 48, 14] });
  b.box(28, 10, 16, team === 0 ? 0xb8bcc4 : 0x4a4448, { p: [0, 52, 14] }); // 护胸板甲
  // 头部与双角
  b.box(16, 16, 16, 0x8a4b2a, { p: [0, 72, 14] });
  b.box(18, 6, 18, 0x3a3028, { p: [0, 76, 14] }); // 头盔
  for (const s of [1, -1]) {
    b.cone(3.5, 16, 5, 0xd8ccb0, { p: [s * 11, 80, 14], r: [0, 0, -s * 0.8] }); // 弯角
  }
  return b.build();
}

function centaurLegGeo(): BufferGeometry {
  const b = new GeoBuilder(602);
  b.cyl(5, 4, 24, 6, 0x5a2d18, { p: [0, -12, 0] });
  b.box(9, 7, 12, 0x2b150c, { p: [0, -26, 2] }); // 铁蹄
  return b.build();
}

function centaurAxeGeo(): BufferGeometry {
  const b = new GeoBuilder(603);
  b.sphere(7, 6, 4, 0x6e3b20, { p: [0, 0, 0] });
  b.cyl(4, 3.5, 24, 6, 0x8a4b2a, { p: [0, -12, 0] });
  // 巨大双手战斧
  b.cyl(2.5, 2.5, 65, 6, 0x3e2723, { p: [0, -18, 12], r: [Math.PI / 4, 0, 0] });
  b.box(22, 18, 3.5, 0x9e9e9e, { p: [0, -4, 30] }); // 斧刃
  b.box(14, 10, 4.5, PAL.gold, { p: [0, -4, 24] }); // 斧芯镶金
  return b.build();
}

// ==================== 2. 头狼 (Alpha Wolf) ====================
function wolfBodyGeo(): BufferGeometry {
  const b = new GeoBuilder(611);
  // 狼形躯干
  b.box(20, 18, 40, 0x4a5568, { p: [0, 20, 0] });
  b.box(22, 22, 22, 0x2d3748, { p: [0, 24, 10] }); // 健硕前胸鬃毛
  // 蓬松长尾
  b.cyl(4.5, 2, 28, 6, 0x2d3748, { p: [0, 22, -22], r: [-0.65, 0, 0] });
  return b.build();
}

function wolfHeadGeo(): BufferGeometry {
  const b = new GeoBuilder(612);
  b.box(15, 14, 16, 0x4a5568, { p: [0, 0, 0] });
  b.box(10, 9, 15, 0x2d3748, { p: [0, -2, 12] }); // 狼吻
  b.box(4, 3, 3, 0x1a202c, { p: [0, 1, 20] }); // 鼻头
  // 尖耳
  for (const s of [1, -1]) {
    b.cone(3.5, 10, 4, 0x1a202c, { p: [s * 6, 11, -2], r: [0, 0, -s * 0.3] });
  }
  // 金色双眼
  for (const s of [1, -1]) {
    b.box(2.5, 2, 2, 0xffd700, { p: [s * 4.5, 3, 7] });
  }
  return b.build();
}

function wolfLegGeo(): BufferGeometry {
  const b = new GeoBuilder(613);
  b.cyl(4, 3, 20, 6, 0x4a5568, { p: [0, -10, 0] });
  b.box(7, 6, 11, 0x2d3748, { p: [0, -22, 2] }); // 狼爪
  return b.build();
}

// ==================== 3. 萨特苦难者 (Satyr Hellcaller) ====================
function satyrTorsoGeo(): BufferGeometry {
  const b = new GeoBuilder(621);
  // 恶魔躯干
  b.box(24, 28, 17, 0x4a154b, { p: [0, 42, 0] });
  b.box(26, 12, 18, 0x2d0a30, { p: [0, 52, 0] }); // 肩胛厚甲
  // 头部与弯角
  b.box(16, 16, 16, 0x5c1b5e, { p: [0, 66, 2] });
  for (const s of [1, -1]) {
    b.torus(9, 2.8, 5, 8, 0x1f0624, { p: [s * 10, 72, -2], r: [0.3, s * 0.4, 0] }); // 盘曲羊角
    b.box(3, 2, 2, 0xff2a55, { p: [s * 4, 66, 9] }); // 猩红魔瞳
  }
  return b.build();
}

function satyrStaffGeo(): BufferGeometry {
  const b = new GeoBuilder(622);
  b.sphere(6, 6, 4, 0x4a154b, { p: [0, 0, 0] });
  b.cyl(3.5, 3, 22, 6, 0x5c1b5e, { p: [0, -11, 0] });
  // 邪恶骨杖
  b.cyl(2.5, 2, 65, 6, 0x220826, { p: [0, 8, 6], r: [0, 0, -0.1] });
  b.dodeca(7, 0xba68c8, { p: [0, 42, 6] }); // 杖头发光魔珠
  return b.build();
}

// ==================== 4. 远古黑龙 (Ancient Black Dragon) ====================
function dragonBodyGeo(): BufferGeometry {
  const b = new GeoBuilder(631);
  b.box(30, 24, 52, 0x1f1f24, { p: [0, 36, 0] }); // 龙躯
  b.cyl(6, 2, 34, 6, 0x17171b, { p: [0, 32, -34], r: [-0.4, 0, 0] }); // 巨尾
  // 脊背棘刺
  for (let z = -16; z <= 24; z += 10) {
    b.cone(3, 9, 4, 0xd9483b, { p: [0, 49, z] });
  }
  return b.build();
}

function dragonHeadGeo(): BufferGeometry {
  const b = new GeoBuilder(632);
  b.cone(10, 26, 6, 0x2a2a30, { p: [0, 0, 10], r: [Math.PI / 3, 0, 0] }); // 狰狞龙吻
  // 双龙角
  for (const s of [1, -1]) {
    b.cone(3.5, 18, 5, 0x141418, { p: [s * 8, 12, -4], r: [-0.4, 0, s * 0.4] });
    b.box(3, 2, 2, 0xff5722, { p: [s * 5, 4, 10] }); // 火焰龙目
  }
  return b.build();
}

function dragonWingGeo(side: number): BufferGeometry {
  const b = new GeoBuilder(633 + (side > 0 ? 0 : 1));
  const s = side;
  b.box(42, 3.5, 26, 0x17171b, { p: [s * 24, 0, 0], r: [0, 0, s * 0.25] }); // 龙翼主骨
  b.box(36, 1.5, 22, 0x3d1414, { p: [s * 26, 0, 2], r: [0, 0, s * 0.25] }); // 暗红翼膜
  return b.build();
}

// ==================== 5. 远古岩石傀儡 (Ancient Rock Golem) ====================
function golemTorsoGeo(): BufferGeometry {
  const b = new GeoBuilder(641);
  b.dodeca(24, 0x78716c, { p: [0, 44, 0] }); // 巨石躯干
  b.dodeca(16, 0x57534e, { p: [0, 22, 0] }); // 石质下盘
  // 头部镶嵌在双肩之间
  b.dodeca(12, 0x44403c, { p: [0, 64, 4] });
  b.box(10, 3, 4, 0x06b6d4, { p: [0, 64, 14] }); // 蔚蓝魔光石缝之目
  return b.build();
}

function golemArmGeo(side: number): BufferGeometry {
  const b = new GeoBuilder(642 + (side > 0 ? 0 : 1));
  const s = side;
  b.dodeca(10, 0x57534e, { p: [s * 2, -6, 0] }); // 巨石大臂
  b.box(14, 22, 14, 0x78716c, { p: [s * 4, -20, 2] }); // 重锤前臂
  b.dodeca(12, 0x44403c, { p: [s * 4, -34, 4] }); // 岩石巨拳
  return b.build();
}

function golemLegGeo(): BufferGeometry {
  const b = new GeoBuilder(643);
  b.box(12, 22, 14, 0x57534e, { p: [0, -11, 0] });
  b.dodeca(11, 0x44403c, { p: [0, -24, 3] }); // 稳固石足
  return b.build();
}

// ==================== 6. 远古巨魔肉山 (Roshan Boss) ====================
function roshanTorsoGeo(): BufferGeometry {
  const b = new GeoBuilder(651);
  // 泰坦巨魔重甲躯干
  b.box(50, 44, 42, 0x3b2a22, { p: [0, 48, 0] });
  b.box(56, 18, 46, 0x231812, { p: [0, 62, 0] }); // 尖刺肩甲
  // 头部与巨型弯角
  b.box(26, 26, 28, 0x4d382e, { p: [0, 72, 16] });
  b.box(18, 12, 18, 0x231812, { p: [0, 64, 28] }); // 巨口下颚
  for (const s of [1, -1]) {
    // 粗壮黑曜石弯角
    b.cone(6, 28, 6, 0x140d09, { p: [s * 18, 86, 12], r: [-0.3, s * 0.4, -s * 0.7] });
    b.box(4, 3, 3, 0xffa000, { p: [s * 7, 74, 29] }); // 熔岩恶魔眼
  }
  // 脊背重甲与熔岩尖刺
  for (let z = -14; z <= 18; z += 10) {
    b.cone(4.5, 14, 5, 0xd97706, { p: [0, 72, z], r: [-0.4, 0, 0] });
  }
  return b.build();
}

function roshanArmGeo(side: number): BufferGeometry {
  const b = new GeoBuilder(652 + (side > 0 ? 0 : 1));
  const s = side;
  b.box(16, 26, 16, 0x3b2a22, { p: [s * 4, -12, 0] });
  b.box(20, 24, 20, 0x231812, { p: [s * 6, -30, 4] });
  // 毁灭巨拳
  b.box(24, 24, 24, 0x1a120e, { p: [s * 6, -46, 8] });
  b.cone(3.5, 9, 4, 0xd97706, { p: [s * 6, -46, 21], r: [Math.PI / 2, 0, 0] }); // 拳刺
  return b.build();
}

function roshanLegGeo(): BufferGeometry {
  const b = new GeoBuilder(653);
  b.box(18, 28, 20, 0x3b2a22, { p: [0, -14, 0] });
  b.box(24, 16, 28, 0x1a120e, { p: [0, -32, 4] }); // 踏碎大地的巨足
  return b.build();
}

// ==================== 骨骼装配 (Rig Construction) ====================
export function buildEliteRig(type: string, team = 0): CreepRig {
  const root = new Group();
  root.scale.setScalar(eliteScale(type));
  const body = bone(root, 'body');
  const bones: Record<string, Group> = { body };
  const parts: CreepPart[] = [];

  switch (type) {
    case 'centaur_conqueror': {
      const hips = bone(body, 'hips', [0, 28, 0]);
      const legFL = bone(hips, 'legFL', [10, -8, 14]);
      const legFR = bone(hips, 'legFR', [-10, -8, 14]);
      const legBL = bone(hips, 'legBL', [10, -8, -14]);
      const legBR = bone(hips, 'legBR', [-10, -8, -14]);
      const shR = bone(hips, 'shR', [-18, 56, 14]);
      Object.assign(bones, { hips, legFL, legFR, legBL, legBR, shR });

      parts.push({ bone: hips, key: 'centaur:torso', geo: () => centaurTorsoGeo(team) });
      parts.push({ bone: legFL, key: 'centaur:leg', geo: centaurLegGeo });
      parts.push({ bone: legFR, key: 'centaur:leg', geo: centaurLegGeo });
      parts.push({ bone: legBL, key: 'centaur:leg', geo: centaurLegGeo });
      parts.push({ bone: legBR, key: 'centaur:leg', geo: centaurLegGeo });
      parts.push({ bone: shR, key: 'centaur:axe', geo: centaurAxeGeo });
      break;
    }

    case 'alpha_wolf': {
      const hips = bone(body, 'hips', [0, 24, 0]);
      const head = bone(hips, 'head', [0, 18, 18]);
      const legFL = bone(hips, 'legFL', [8, -6, 12]);
      const legFR = bone(hips, 'legFR', [-8, -6, 12]);
      const legBL = bone(hips, 'legBL', [8, -6, -12]);
      const legBR = bone(hips, 'legBR', [-8, -6, -12]);
      Object.assign(bones, { hips, head, legFL, legFR, legBL, legBR });

      parts.push({ bone: hips, key: 'wolf:body', geo: wolfBodyGeo });
      parts.push({ bone: head, key: 'wolf:head', geo: wolfHeadGeo });
      parts.push({ bone: legFL, key: 'wolf:leg', geo: wolfLegGeo });
      parts.push({ bone: legFR, key: 'wolf:leg', geo: wolfLegGeo });
      parts.push({ bone: legBL, key: 'wolf:leg', geo: wolfLegGeo });
      parts.push({ bone: legBR, key: 'wolf:leg', geo: wolfLegGeo });
      break;
    }

    case 'satyr_hellcaller': {
      const hips = bone(body, 'hips', [0, 36, 0]);
      const legL = bone(hips, 'legL', [8, -4, 0]);
      const legR = bone(hips, 'legR', [-8, -4, 0]);
      const shR = bone(hips, 'shR', [-16, 44, 4]);
      Object.assign(bones, { hips, legL, legR, shR });

      parts.push({ bone: hips, key: 'satyr:torso', geo: satyrTorsoGeo });
      parts.push({ bone: legL, key: 'satyr:leg', geo: wolfLegGeo });
      parts.push({ bone: legR, key: 'satyr:leg', geo: wolfLegGeo });
      parts.push({ bone: shR, key: 'satyr:staff', geo: satyrStaffGeo });
      break;
    }

    case 'ancient_black_dragon': {
      const hips = bone(body, 'hips', [0, 42, 0]);
      const head = bone(hips, 'head', [0, 16, 26]);
      const wingL = bone(hips, 'wingL', [16, 12, 0]);
      const wingR = bone(hips, 'wingR', [-16, 12, 0]);
      Object.assign(bones, { hips, head, wingL, wingR });

      parts.push({ bone: hips, key: 'dragon:body', geo: dragonBodyGeo });
      parts.push({ bone: head, key: 'dragon:head', geo: dragonHeadGeo });
      parts.push({ bone: wingL, key: 'dragon:wingL', geo: () => dragonWingGeo(1) });
      parts.push({ bone: wingR, key: 'dragon:wingR', geo: () => dragonWingGeo(-1) });
      break;
    }

    case 'ancient_rock_golem':
    case 'golem_shard': {
      const hips = bone(body, 'hips', [0, 36, 0]);
      const legL = bone(hips, 'legL', [10, -4, 0]);
      const legR = bone(hips, 'legR', [-10, -4, 0]);
      const armL = bone(hips, 'armL', [20, 32, 0]);
      const armR = bone(hips, 'armR', [-20, 32, 0]);
      Object.assign(bones, { hips, legL, legR, armL, armR });

      parts.push({ bone: hips, key: 'golem:torso', geo: golemTorsoGeo });
      parts.push({ bone: legL, key: 'golem:leg', geo: golemLegGeo });
      parts.push({ bone: legR, key: 'golem:leg', geo: golemLegGeo });
      parts.push({ bone: armL, key: 'golem:armL', geo: () => golemArmGeo(1) });
      parts.push({ bone: armR, key: 'golem:armR', geo: () => golemArmGeo(-1) });
      break;
    }

    case 'roshan': {
      const hips = bone(body, 'hips', [0, 48, 0]);
      const legL = bone(hips, 'legL', [18, -6, 0]);
      const legR = bone(hips, 'legR', [-18, -6, 0]);
      const armL = bone(hips, 'armL', [28, 44, 4]);
      const armR = bone(hips, 'armR', [-28, 44, 4]);
      Object.assign(bones, { hips, legL, legR, armL, armR });

      parts.push({ bone: hips, key: 'roshan:torso', geo: roshanTorsoGeo });
      parts.push({ bone: legL, key: 'roshan:leg', geo: roshanLegGeo });
      parts.push({ bone: legR, key: 'roshan:leg', geo: roshanLegGeo });
      parts.push({ bone: armL, key: 'roshan:armL', geo: () => roshanArmGeo(1) });
      parts.push({ bone: armR, key: 'roshan:armR', geo: () => roshanArmGeo(-1) });
      break;
    }
  }

  for (const p of parts) cachedGeo(p.key, p.geo);
  return { root, body, parts, bones, type };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ==================== 姿态更新 (Pose Execution) ====================
export function poseElite(rig: CreepRig, tr: AnimTracker, t: number): void {
  const b = rig.bones;
  const run = tr.state === 'run' ? Math.min(1, tr.speed / 250) : 0;
  const s = Math.sin(tr.runPhase);
  const c = Math.cos(tr.runPhase);

  const swing = tr.swing >= 0 ? tr.swing : tr.backswing > 0 ? 1 + (1 - tr.backswingK) : -1;
  const raise = swing < 0 ? 0 : swing <= 1 ? (swing < 0.7 ? smooth01(swing / 0.7) : 1 - smooth01((swing - 0.7) / 0.3) * 1.25) : -0.25 * (2 - swing);
  const dead = tr.deadTime >= 0;
  const breathe = Math.sin(t * 2.2);

  b.body.position.set(0, 0, 0);
  b.body.rotation.set(0, 0, 0);

  switch (rig.type) {
    case 'centaur_conqueror': {
      b.body.position.y = run * (Math.abs(c) * 4 - 2) + breathe * 0.8 * (1 - run);
      if (b.legFL && b.legFR && b.legBL && b.legBR) {
        b.legFL.rotation.x = -0.7 * s * run;
        b.legFR.rotation.x = 0.7 * s * run;
        b.legBL.rotation.x = 0.7 * s * run;
        b.legBR.rotation.x = -0.7 * s * run;
      }
      if (b.shR) {
        // 践踏愤怒挥斧
        b.shR.rotation.set(lerp(0.3, -2.6, Math.max(0, raise)), 0, -0.3);
      }
      break;
    }

    case 'alpha_wolf': {
      b.body.position.y = run * (Math.abs(s) * 3 - 1.5) + breathe * 0.5 * (1 - run);
      if (b.legFL && b.legFR && b.legBL && b.legBR) {
        b.legFL.rotation.x = -0.85 * s * run;
        b.legFR.rotation.x = 0.85 * s * run;
        b.legBL.rotation.x = 0.85 * s * run;
        b.legBR.rotation.x = -0.85 * s * run;
      }
      if (b.head) {
        b.head.rotation.x = 0.1 * breathe + Math.max(0, raise) * 0.45;
      }
      break;
    }

    case 'satyr_hellcaller': {
      b.body.position.y = run * (Math.abs(c) * 3 - 1.5) + breathe * 0.6;
      if (b.legL && b.legR) {
        b.legL.rotation.x = -0.8 * s * run;
        b.legR.rotation.x = 0.8 * s * run;
      }
      if (b.shR) {
        b.shR.rotation.set(lerp(-0.2, -1.8, Math.max(0, raise)), 0, -0.2);
      }
      break;
    }

    case 'ancient_black_dragon': {
      // 飞行动画：平稳浮动 + 翅膀扇动
      const wingFlap = Math.sin(t * 7);
      b.body.position.y = 8 + Math.sin(t * 3.5) * 4;
      if (b.wingL && b.wingR) {
        b.wingL.rotation.z = 0.2 + wingFlap * 0.5;
        b.wingR.rotation.z = -0.2 - wingFlap * 0.5;
      }
      if (b.head) {
        b.head.rotation.x = 0.1 * Math.sin(t * 3.5) + Math.max(0, raise) * 0.4;
      }
      break;
    }

    case 'ancient_rock_golem':
    case 'golem_shard': {
      b.body.position.y = run * (Math.abs(c) * 3 - 1.5);
      if (b.legL && b.legR) {
        b.legL.rotation.x = -0.6 * s * run;
        b.legR.rotation.x = 0.6 * s * run;
      }
      if (b.armL && b.armR) {
        // 双手高高举起重重砸下
        const slam = Math.max(0, raise);
        b.armL.rotation.set(lerp(0.1, -2.4, slam), 0, 0.2);
        b.armR.rotation.set(lerp(0.1, -2.4, slam), 0, -0.2);
      }
      break;
    }

    case 'roshan': {
      // 肉山沉重步伐与双拳猛击
      b.body.position.y = run * (Math.abs(c) * 4 - 2) + breathe * 1.0;
      if (b.legL && b.legR) {
        b.legL.rotation.x = -0.55 * s * run;
        b.legR.rotation.x = 0.55 * s * run;
      }
      if (b.armL && b.armR) {
        const slam = Math.max(0, raise);
        b.armL.rotation.set(lerp(0.2 - 0.3 * s * run, -2.7, slam), 0, 0.3);
        b.armR.rotation.set(lerp(0.2 + 0.3 * s * run, -2.7, slam), 0, -0.3);
      }
      break;
    }
  }

  if (dead) {
    const f = smooth01(tr.deadTime / 0.5);
    b.body.rotation.z = 1.35 * f;
    b.body.position.y = -Math.max(0, tr.deadTime - 0.8) * 50;
  }
}

import { DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { groundHeight } from '../coords';
import { GeoBuilder } from '../geo';
import { cachedGeo } from '../models/rig';
import { registerFx, registerModifierVisual, registerProjectileStyle } from './registry';

/**
 * 斯温的 3D 特效：风暴之锤的弹道和命中、战吼的扩散环和胸前盾徽、神之力量的红光（模型发光、放大、肩头冒火）。
 * 巨力挥舞用通用的分裂斩痕（fx/common.ts 的 'cleave'）。
 */
const STORM = 0x7cc8ff;
const STORM_LIGHT = 0xd2eeff;
const GOLD = 0xffd35a;
const RAGE = 0xff3a1e;

// ---------- Q 风暴之拳 ----------
registerProjectileStyle('sven_hammer', {
  mesh: 'hammer', color: STORM, size: 26, halo: 60, spin: 14, arc: 24,
  trail: { color: 0xa8dcff, every: 0.01, size: 15, additive: true },
});

/** 出手：左手一闪蓝光 */
registerFx('sven_storm_hammer', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const h = groundHeight(p.x, p.y) + (u ? c.heightOf(u) * 0.7 : 150);
  c.fx.burst(p.x, p.y, h, 14, STORM_LIGHT, 220, 7, 0.3, true, { up: 40 });
});

/** 命中：蓝色冲击环扩到眩晕半径、电火花爆散、折线电弧、短光柱、震屏 */
registerFx('sven_hammer_hit', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 250;
  c.fx.ring(x, y, 20, r, STORM, 0.5, 46);
  c.fx.ring(x, y, r * 0.7, r * 1.04, STORM_LIGHT, 0.35, 14);
  c.fx.decalFlash(x, y, r * 0.75, 0x4aa8ff, 0.4);
  c.fx.beam(x, y, 34, 190, 0x9fd8ff, 0.32);
  c.fx.beam(x, y, 14, 230, 0xffffff, 0.24);
  c.fx.burst(x, y, gy + 80, 34, STORM_LIGHT, 560, 8, 0.45, true, { grav: 260 });
  c.fx.burst(x, y, gy + 20, 18, 0x5ab4ff, 300, 12, 0.5, true, { flat: true, up: 30 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.random() * 0.8;
    const rr = r * (0.65 + Math.random() * 0.35);
    c.fx.line([{ x, y, h: gy + 70 }, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, h: gy + 6 }], 0xbfe6ff, 7, 0.28, { jag: 16, segs: 5 });
  }
  if (c.cam.visible(e.pos)) c.cam.shake(8);
});

// ---------- E 战吼 ----------
/** 金蓝色的扩散环到 700 + 一圈矮光墙 + 向上飞散的金色火星 */
registerFx('sven_warcry', (e, c) => {
  const { x, y } = e.pos;
  const gy = groundHeight(x, y);
  const r = e.radius ?? 700;
  c.fx.ring(x, y, 40, r, GOLD, 0.7, 60);
  c.fx.ring(x, y, 20, r * 0.8, STORM, 0.6, 26);
  c.fx.ring(x, y, r * 0.92, r * 1.02, 0xfff0b0, 0.8, 12);
  c.fx.beam(x, y, 36, 110, 0xffd870, 0.5, r * 0.55);
  c.fx.burst(x, y, gy + 120, 30, GOLD, 260, 9, 0.7, true, { up: 160, grav: 120 });
  c.fx.burst(x, y, gy + 150, 14, STORM_LIGHT, 180, 8, 0.5, true, { up: 120 });
  if (c.cam.visible(e.pos)) c.cam.shake(4);
});

/** 盾形徽记（半宽 1，按单位大小缩放）：外圈蓝色、中间一道金色竖纹 */
function crestGroup(): Group {
  const geo = cachedGeo('sven:crest', () => {
    const b = new GeoBuilder(291);
    b.extrude([[0, 1.2], [0.85, 0.9], [0.85, -0.1], [0, -1.15], [-0.85, -0.1], [-0.85, 0.9]], 0.08, STORM, { jitter: 0 });
    b.extrude([[0, 0.85], [0.18, 0.7], [0.18, -0.6], [0, -0.8], [-0.18, -0.6], [-0.18, 0.7]], 0.12, GOLD, { jitter: 0 });
    return b.build();
  });
  crestMat ??= new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: DoubleSide, toneMapped: false });
  const g = new Group();
  for (let i = 0; i < CRESTS; i++) {
    const m = new Mesh(geo, crestMat);
    m.renderOrder = 9;
    // 先向上仰（朝着俯视镜头），再绕身体转到各自的方位
    m.rotation.order = 'YXZ';
    g.add(m);
  }
  return g;
}
let crestMat: MeshBasicMaterial | null = null;
const CRESTS = 3;

/** 战吼增益：三枚半透明的蓝色盾徽在胸前高度绕身体旋转（向上仰，俯视镜头下看得到正面）；快结束时缩小消失 */
registerModifierVisual('sven_warcry', (c) => {
  if (!c.u.alive) return;
  const g = c.obj('sven_warcry', crestGroup);
  const fade = Math.min(1, c.m.duration / 0.6, (c.m.total - c.m.duration) / 0.25 + 0.2);
  const s = 24 * Math.max(0.05, fade);
  const rr = Math.max(52, c.u.radius * 2.2);
  g.position.set(c.x, c.gy + c.lift + c.height * 0.5, c.y);
  g.rotation.y = c.time * 2.2;
  g.children.forEach((m, i) => {
    const a = (i / CRESTS) * Math.PI * 2;
    m.position.set(Math.sin(a) * rr, Math.sin(c.time * 3 + i * 2) * 4, Math.cos(a) * rr);
    m.rotation.set(-0.75, a, 0);
    m.scale.setScalar(s);
  });
});

// ---------- R 神之力量 ----------
/** 开大：红色光柱 + 冲击环 + 向上喷出的红色火星 + 轻微震屏 */
registerFx('sven_gods_strength', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  c.fx.pillar(p.x, p.y, 70, 380, RAGE, 0.7);
  c.fx.ring(p.x, p.y, 20, 280, 0xff5a30, 0.6, 30);
  c.fx.ring(p.x, p.y, 10, 170, 0xffb060, 0.45, 18);
  c.fx.burst(p.x, p.y, gy + 140, 40, 0xff4a20, 320, 11, 0.8, true, { up: 260, grav: 200 });
  c.fx.burst(p.x, p.y, gy + 20, 16, 0x8a3020, 220, 26, 0.9, false, { flat: true, up: 30, grow: 30, a: 0.45 });
  if (c.cam.visible(p)) c.cam.shake(9);
});

/** 神之力量持续期间：模型红色描边和自发光脉动、整体放大 1.08 倍、两肩冒红色火焰，脚下一圈暗红光环 */
registerModifierVisual('sven_gods_strength', (c) => {
  if (!c.u.alive) return;
  const pulse = 0.5 + 0.5 * Math.sin(c.time * 6);
  c.view?.tint(0xff1a00, 0.04 + 0.08 * pulse);
  c.view?.rim(0xff2a10, 0.75 + 0.25 * pulse);
  c.view?.scale(1.08);
  c.decal('sven_gods').set(c.x, c.gy + 1.7, c.y, 66, { color: RAGE, opacity: 0.45 + 0.25 * pulse, width: 10, soft: 6 });
  if (c.dt <= 0) return;
  const f = c.u.facing;
  const side = { x: -Math.sin(f), y: Math.cos(f) };
  const back = { x: -Math.cos(f) * 8, y: -Math.sin(f) * 8 };
  const off = c.height * 0.22;
  const h = c.gy + c.lift + c.height * 0.64;
  for (const s of [1, -1]) {
    if (Math.random() > c.dt * 40) continue;
    const px = c.x + side.x * off * s + back.x + (Math.random() - 0.5) * 10;
    const py = c.y + side.y * off * s + back.y + (Math.random() - 0.5) * 10;
    c.fx.emit(px, h, py, (Math.random() - 0.5) * 30, 110 + Math.random() * 70, (Math.random() - 0.5) * 30, Math.random() < 0.3 ? 0xffc060 : 0xff3a14, 13, 0.42, true, -14);
  }
});

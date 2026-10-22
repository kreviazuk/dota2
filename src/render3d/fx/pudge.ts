import { Color, Group, Mesh, NormalBlending, ShaderMaterial, SphereGeometry } from 'three';
import { groundHeight } from '../coords';
import { GeoBuilder } from '../geo';
import { makeLambert } from '../materials';
import { cachedGeo } from '../models/rig';
import { abilityValue } from '../../sim/systems/abilities';
import { registerFx, registerModifierVisual, registerProjectileStyle } from './registry';

/**
 * 帕吉的 3D 特效：肉钩（钩子 + 从右手连到钩尖的铁链、命中时的血雾和金属火花）、腐烂（250 的绿色毒雾贴地圈 + 上升的绿色烟团、
 * 帕吉身上略带绿色）、肉盾（棕红色的肉质光壳 + 环绕的肉块）、肢解（每跳血雾、目标被抬起）、腐肉堆积（头顶绿色"+2 力量"）。
 * 浅色沙地上叠加混合会发白：毒雾、血雾、肉壳都用普通混合的饱和色，只有很小的火花 / 亮芯用叠加。
 */
const ROT_GREEN = 0x4f8f22;
const ROT_DEEP = 0x2f5f12;
const ROT_PALE = 0x8cc43c;
const ROT_YELLOW = 0xb8c840;
const BLOOD = 0x9a1010;
const BLOOD_DARK = 0x5e0808;
const BLOOD_LIGHT = 0xc82a1c;
const SPARK = 0xfff0b0;
const MEAT = 0xa8483a;
const MEAT_DARK = 0x6a2418;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- Q 肉钩 ----------
/** 钩子：银灰色的大钩，贴着胸口的高度水平飞行；铁链从帕吉右手的钩子骨骼连到钩尖 */
registerProjectileStyle('pudge_hook', {
  mesh: 'hook', color: 0xc8ccd2, size: 34, height: 95,
  chain: { color: 0x5a5450, width: 5.5, bone: 'hook' },
});

/** 出钩：右手处一小团扬起的灰尘和几点金属反光 */
registerFx('pudge_meat_hook', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const d = e.dir ?? { x: 0, y: -1 };
  const gy = groundHeight(p.x, p.y);
  const hx = p.x + d.x * 50 - d.y * 30;
  const hy = p.y + d.y * 50 + d.x * 30;
  for (let i = 0; i < 8; i++) {
    c.fx.emit(hx + rnd(-10, 10), gy + rnd(80, 120), hy + rnd(-10, 10), d.x * rnd(150, 260), rnd(-10, 30), d.y * rnd(150, 260), 0x9a8c78, rnd(10, 16), rnd(0.25, 0.4), false, 20, 0.5);
  }
  c.fx.burst(hx, hy, gy + 100, 4, SPARK, 120, 4, 0.18, true);
});

/** 钩中：目标身上一团血雾 + 迸出的金属火花 + 贴地的暗红闪光；涉及玩家时震屏 */
registerFx('pudge_hook_hit', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const h = gy + (t ? c.heightOf(t) * 0.55 : 70);
  const enemy = !!t && t.team !== c.world.getUnit(e.unitId)?.team;
  if (enemy) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(60, 220);
      c.fx.emit(p.x + rnd(-8, 8), h + rnd(-15, 15), p.y + rnd(-8, 8), Math.cos(a) * sp, rnd(20, 160), Math.sin(a) * sp,
        Math.random() < 0.5 ? BLOOD : Math.random() < 0.5 ? BLOOD_DARK : BLOOD_LIGHT, rnd(9, 16), rnd(0.35, 0.6), false, 6);
    }
    c.fx.decalFlash(p.x, p.y, 55, BLOOD_DARK, 0.45);
  }
  // 金属火花（叠加，很小）
  c.fx.burst(p.x, p.y, h + 10, 12, SPARK, 320, 4, 0.22, true, { up: 60 });
  c.fx.burst(p.x, p.y, h + 10, 6, 0xffffff, 200, 3, 0.15, true);
  c.fx.ring(p.x, p.y, 20, 70, 0xd8d0c0, 0.25, 8);
  if (c.playerId !== null && (e.unitId === c.playerId || e.targetId === c.playerId)) c.cam.shake(5);
});

// ---------- W 腐烂 ----------
/** 打开腐烂：身上猛地冒出一团绿色毒气 */
registerFx('pudge_rot', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(80, 200);
    c.fx.emit(p.x + Math.cos(a) * 20, gy + rnd(30, 110), p.y + Math.sin(a) * 20, Math.cos(a) * sp, rnd(20, 70), Math.sin(a) * sp,
      Math.random() < 0.5 ? ROT_GREEN : ROT_DEEP, rnd(22, 34), rnd(0.6, 0.9), false, 40, 0.6);
  }
});

/**
 * 腐烂开启中：250 的绿色毒雾贴地圈（半透明、脉动的填充 + 柔和的外沿），圈里不停冒出上升的绿色烟团和黄绿色的小飞沫，
 * 帕吉身上略带绿色。烟团是普通混合的饱和绿色，在浅色沙地上不发白，也不太浓（不挡住圈里的单位）。
 */
registerModifierVisual('pudge_rot', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const ab = u.ability('W');
  const R = ab ? abilityValue(u, ab, 'radius') : 250;
  const pulse = 0.5 + 0.5 * Math.sin(c.time * 3.2 + u.id);
  const gy = c.gy + 1.5;
  c.decal('pudge_rot_fog').set(c.x, gy, c.y, R, { color: ROT_GREEN, opacity: 0.58 + 0.12 * pulse, width: 40, soft: 34, fill: 0.5 });
  c.decal('pudge_rot_edge').set(c.x, gy + 0.2, c.y, R * (0.96 + 0.03 * pulse), { color: ROT_DEEP, opacity: 0.55, width: 8, soft: 5, dash: 14, dashOffset: c.time * 0.12 });
  c.view?.tint(0x40a020, 0.1 + 0.04 * pulse);
  if (c.dt <= 0) return;
  // 上升的烟团：随机落在圈里，越往上越大、越淡
  for (let i = 0; i < 3; i++) {
    if (Math.random() > c.dt * 22) continue;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R * 0.95;
    c.fx.emit(c.x + Math.cos(a) * r, c.gy + rnd(5, 30), c.y + Math.sin(a) * r, rnd(-12, 12), rnd(40, 80), rnd(-12, 12),
      Math.random() < 0.55 ? ROT_GREEN : Math.random() < 0.5 ? ROT_DEEP : ROT_PALE, rnd(20, 30), rnd(0.9, 1.4), false, 26, 0.42);
  }
  // 从帕吉身上冒出的毒气
  if (Math.random() < c.dt * 12) {
    c.fx.emit(c.x + rnd(-30, 30), c.gy + c.height * rnd(0.3, 0.7), c.y + rnd(-30, 30), rnd(-20, 20), rnd(50, 90), rnd(-20, 20), ROT_GREEN, rnd(16, 24), rnd(0.7, 1.0), false, 22, 0.5);
  }
  // 黄绿色的小飞沫（像苍蝇 / 腐汁），很小
  if (Math.random() < c.dt * 10) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.3, 0.9) * R;
    c.fx.emit(c.x + Math.cos(a) * r, c.gy + rnd(20, 70), c.y + Math.sin(a) * r, -Math.sin(a) * 60, rnd(10, 30), Math.cos(a) * 60, ROT_YELLOW, rnd(5, 7), rnd(0.4, 0.6), false, 0);
  }
});

// ---------- E 肉盾 ----------
/** 棕红色的肉质光壳（普通混合：边缘浓、中间淡，带缓慢起伏的纹理） */
let fleshMat: ShaderMaterial | null = null;
function fleshMaterial(): ShaderMaterial {
  fleshMat ??= new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0x9a3a28) }, uDark: { value: new Color(0x5a1810) }, uOpacity: { value: 0.75 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform vec3 uDark; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 1.6);
        float veins = 0.5 + 0.5 * sin(vP.x * 11.0 + sin(vP.y * 7.0 + uTime * 1.5) * 2.0 + vP.z * 9.0);
        vec3 col = mix(uColor, uDark, veins * 0.6);
        gl_FragColor = vec4(col, (0.08 + f * 0.62) * uOpacity);
      }`,
  });
  return fleshMat;
}
let fleshGeo: SphereGeometry | null = null;
function fleshShell(): Mesh {
  fleshGeo ??= new SphereGeometry(1, 18, 12);
  const m = new Mesh(fleshGeo, fleshMaterial());
  m.renderOrder = 9;
  return m;
}

/** 环绕的肉块：几块低多边形的生肉（每块带一点骨头） */
let chunkMat: ReturnType<typeof makeLambert> | null = null;
function meatChunks(): Group {
  const g = new Group();
  const geo = cachedGeo('pudge_meat_chunk', () => {
    const b = new GeoBuilder(1721);
    b.dodeca(7, MEAT, { s: [1.2, 0.8, 1], jitter: 0.2 });
    b.dodeca(4, MEAT_DARK, { p: [3, 2, 2], jitter: 0.2 });
    b.cyl(1.2, 1.2, 9, 5, 0xeee2c8, { p: [-5, 1, 0], r: [0, 0, 1.2] });
    return b.build();
  });
  chunkMat ??= makeLambert(true);
  for (let i = 0; i < 5; i++) {
    const m = new Mesh(geo, chunkMat);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** 施放：一团肉末和血点向外迸开 */
registerFx('pudge_meat_shield', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(90, 200);
    c.fx.emit(p.x + Math.cos(a) * 30, gy + rnd(50, 130), p.y + Math.sin(a) * 30, Math.cos(a) * sp, rnd(20, 100), Math.sin(a) * sp,
      Math.random() < 0.5 ? MEAT : BLOOD, rnd(10, 15), rnd(0.35, 0.55), false, -4);
  }
  c.fx.ring(p.x, p.y, 40, 110, MEAT, 0.3, 12);
});

registerModifierVisual('pudge_meat_shield', (c) => {
  const u = c.u;
  if (!u.alive) return;
  const fadeIn = Math.min(1, (c.m.total - c.m.duration) / 0.2);
  const fadeOut = Math.min(1, c.m.duration / 0.3);
  const k = Math.min(fadeIn, fadeOut);
  const h = c.height;
  const shell = c.obj('pudge_flesh_shell', fleshShell);
  const rr = Math.max(u.radius * 2.4, h * 0.38) * (0.9 + 0.1 * k);
  const pulse = 1 + 0.035 * Math.sin(c.time * 4);
  shell.position.set(c.x, c.gy + c.lift + h * 0.48, c.y);
  shell.scale.set(rr * pulse, h * 0.6 * pulse, rr * pulse);
  const mat = fleshMaterial();
  mat.uniforms.uTime.value = c.time;
  mat.uniforms.uOpacity.value = 0.75 * k;
  const chunks = c.obj('pudge_meat_chunks', meatChunks);
  chunks.position.set(c.x, c.gy + c.lift + h * 0.45, c.y);
  chunks.rotation.y = c.time * 2.2;
  chunks.children.forEach((m, i) => {
    const a = (i / chunks.children.length) * Math.PI * 2;
    const r = rr * 1.05;
    m.position.set(Math.cos(a) * r, Math.sin(c.time * 3 + i * 1.7) * 14 + (i % 2 ? 18 : -8), Math.sin(a) * r);
    m.rotation.set(c.time * (1.5 + i * 0.3), c.time * 0.9 + i, 0);
    m.scale.setScalar(1.5 * k);
  });
  c.view?.tint(0x8a2a18, 0.08);
});

// ---------- R 肢解 ----------
/** 每一跳：目标身上一团血雾 + 往下滴的血点 + 贴地的暗红斑；第一跳涉及玩家时震屏 */
registerFx('pudge_dismember', (e, c) => {
  const t = c.world.getUnit(e.targetId);
  const p = t?.pos ?? e.pos;
  const gy = groundHeight(p.x, p.y);
  const h = gy + 30 + (t ? c.heightOf(t) * 0.55 : 70);
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rnd(40, 160);
    c.fx.emit(p.x + rnd(-10, 10), h + rnd(-12, 12), p.y + rnd(-10, 10), Math.cos(a) * sp, rnd(30, 140), Math.sin(a) * sp,
      Math.random() < 0.45 ? BLOOD : Math.random() < 0.5 ? BLOOD_DARK : BLOOD_LIGHT, rnd(10, 18), rnd(0.4, 0.65), false, 8);
  }
  for (let i = 0; i < 5; i++) c.fx.emit(p.x + rnd(-15, 15), h - 10, p.y + rnd(-15, 15), 0, -rnd(80, 160), 0, BLOOD_DARK, rnd(6, 9), 0.5, false, 0);
  c.fx.decalFlash(p.x, p.y, 48, BLOOD_DARK, 0.5);
  // 第一跳（刚被抓住）轻微震屏
  const m = t?.modifiers.find((x) => x.def.id === 'pudge_dismembered');
  const first = !m || m.total - m.duration < 0.05;
  const isPlayer = c.playerId !== null && (e.unitId === c.playerId || e.targetId === c.playerId);
  if (isPlayer && first) c.cam.shake(5);
});

/** 被肢解：抬高 30（被帕吉抓起来），脚下一圈暗红，身上不停滴血 */
registerModifierVisual('pudge_dismembered', (c) => {
  const u = c.u;
  if (!u.alive) return;
  c.view?.lift(30);
  c.view?.shake(2);
  c.decal('pudge_dismember_pool').set(c.x, c.gy + 1.4, c.y, 46, { color: BLOOD_DARK, opacity: 0.6, width: 14, soft: 10, fill: 0.5 });
  if (c.dt > 0 && Math.random() < c.dt * 14) {
    c.fx.emit(c.x + rnd(-14, 14), c.gy + 30 + c.height * rnd(0.3, 0.6), c.y + rnd(-14, 14), 0, -rnd(60, 120), 0, BLOOD, rnd(6, 9), 0.5, false, 0);
  }
});

// ---------- 先天 腐肉堆积 ----------
/** 获得一层：帕吉头顶飘起绿色的"+2 力量"，身上冒一圈绿色光点 */
registerFx('pudge_flesh_heap', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  if (!u) return;
  const inn = u.ability('innate');
  const n = inn ? abilityValue(u, inn, 'strPerStack') : 2;
  const gy = groundHeight(u.pos.x, u.pos.y);
  const top = gy + c.heightOf(u);
  c.fx.text(u.pos.x, u.pos.y, top + 80, `+${Number.isInteger(n) ? n : n.toFixed(1)} 力量`, '#7dff4a', 28);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.fx.emit(u.pos.x + Math.cos(a) * 40, gy + 40, u.pos.y + Math.sin(a) * 40, 0, rnd(80, 140), 0, ROT_PALE, rnd(7, 10), rnd(0.5, 0.8), false, -4);
  }
});

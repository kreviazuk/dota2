import { AdditiveBlending, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { shieldTotal } from '../../sim/shields';
import { isSlowed } from '../../render/unitDraw';
import { groundHeight } from '../coords';
import { GeoBuilder } from '../geo';
import { makeLambert } from '../materials';
import { cachedGeo } from '../models/rig';
import { registerFx, registerUnitVisual } from './registry';

/**
 * 通用外观：按状态 / Modifier 自动显示的状态标记（不需要英雄代码），以及通用的 fx 事件（闪烁、分裂斩痕）。
 * 这里画 3D 部分：脚下的缠绕藤蔓和减速细环、护盾光壳、恐惧的紫色滴落和发抖。
 * 头顶的状态图标（沉默、缴械、破坏、恐惧）画在界面层上、血条上方（与 2D 共用 drawStatusIcons2D，手机上也够大）；
 * 眩晕金星（英雄的绕着头转）、嘲讽"!"、战斗饥渴仍然由 renderer3d 的 Marks 画。
 */

// ---------- 脚下的缠绕藤蔓 ----------
let vineMat: ReturnType<typeof makeLambert> | null = null;
function vineMesh(): Mesh {
  const geo = cachedGeo('status:vines', () => {
    const b = new GeoBuilder(51);
    // 半径 1 的藤蔓环（按单位大小缩放）：两圈缠绕的藤条 + 一圈向上弯的尖刺和叶子
    b.torus(1, 0.15, 5, 18, 0x5fb030, { r: [Math.PI / 2, 0, 0], p: [0, 0.08, 0], jitter: 0.2 });
    b.torus(0.8, 0.11, 4, 16, 0x7a5a2a, { r: [Math.PI / 2 + 0.15, 0, 0], p: [0, 0.3, 0], jitter: 0.2 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = i % 2 ? 0.95 : 0.8;
      // 尖刺朝外上方倾斜
      b.cone(0.14, i % 2 ? 1.0 : 0.7, 4, 0x7ac040, { p: [Math.cos(a) * rr, 0.4, Math.sin(a) * rr], r: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45], jitter: 0.15, top: 0xe0f890 });
      b.box(0.3, 0.05, 0.16, 0x8cd050, { p: [Math.cos(a + 0.35) * 0.92, 0.22, Math.sin(a + 0.35) * 0.92], r: [0, -a, 0.5] });
    }
    return b.build();
  });
  vineMat ??= makeLambert(true);
  const m = new Mesh(geo, vineMat);
  m.renderOrder = 3;
  return m;
}

// ---------- 护盾光壳 ----------
let shellMat: ShaderMaterial | null = null;
function shellMaterial(): ShaderMaterial {
  shellMat ??= new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(0xcfe8ff) }, uOpacity: { value: 0.42 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
        float bands = 0.8 + 0.2 * sin(vY * 9.0 - uTime * 4.0);
        gl_FragColor = vec4(uColor * (f * 1.3 + 0.025) * bands * uOpacity, 1.0);
      }`,
  });
  return shellMat;
}
let shellGeo: SphereGeometry | null = null;
function shellMesh(): Mesh {
  shellGeo ??= new SphereGeometry(1, 18, 12);
  const m = new Mesh(shellGeo, shellMaterial());
  m.renderOrder = 9;
  return m;
}

// ---------- 通用状态标记 ----------
registerUnitVisual((c) => {
  const u = c.u;
  if (!u.alive || u.kind === 'building') return;
  const sup = c.suppressed;
  const hero = u.kind === 'hero';
  if (u.stats.fearedBy !== null && !sup.has('fear')) {
    // 头顶滴落的紫色粒子 + 身体发抖
    c.view?.shake(3.5);
    if (c.dt > 0 && Math.random() < c.dt * 14) {
      const a = Math.random() * Math.PI * 2;
      c.fx.emit(c.x + Math.cos(a) * 18, c.top + 6, c.y + Math.sin(a) * 18, 0, -40, 0, 0xa040ff, hero ? 8 : 6, 0.7, true);
    }
  }
  const r = hero ? 54 : u.radius * 2.1;
  if (u.hasState('rooted') && !sup.has('root')) {
    const v = c.obj('root', vineMesh);
    const k = r * 1.1;
    v.position.set(c.x, c.gy + 1, c.y);
    v.scale.set(k, k * 0.9, k);
    v.rotation.y = c.time * 0.4;
  }
  if (isSlowed(u) && !sup.has('slow')) {
    c.decal('slow').set(c.x, Math.max(c.gy, groundHeight(c.x, c.y)) + 1.8, c.y, r * 1.22, {
      color: 0x8fd8ff, opacity: 0.75, width: hero ? 5 : 3.5, soft: 2, dash: hero ? 16 : 10, dashOffset: c.time * 0.25,
    });
  }
  if (shieldTotal(u) > 0 && !sup.has('shield')) {
    const s = c.obj('shield', shellMesh);
    const h = c.height;
    const rr = Math.max(u.radius * 2.2, h * 0.36);
    s.position.set(c.x, c.gy + c.lift + h * 0.5, c.y);
    const pulse = 1 + 0.03 * Math.sin(c.time * 5);
    s.scale.set(rr * pulse, h * 0.62 * pulse, rr * pulse);
    shellMaterial().uniforms.uTime.value = c.time;
  }
});

// ---------- 通用 fx 事件 ----------
/** 闪烁（blinkTo）：起点和终点各一团粒子 + 贴地闪光；pos = 起点，dir = 位移向量 */
registerFx('blink', (e, c) => {
  const from = e.pos;
  const to = { x: from.x + (e.dir?.x ?? 0), y: from.y + (e.dir?.y ?? 0) };
  for (const [p, k] of [[from, 0.8], [to, 1]] as const) {
    const gy = groundHeight(p.x, p.y);
    c.fx.burst(p.x, p.y, gy + 70, Math.round(22 * k), 0xc8b4ff, 240, 8, 0.45, true, { up: 40 });
    c.fx.burst(p.x, p.y, gy + 30, Math.round(10 * k), 0xffffff, 120, 6, 0.3, true, { up: 80 });
    c.fx.decalFlash(p.x, p.y, 75 * k, 0xa890ff, 0.4);
  }
});

/** 分裂（applyCleave）：贴地的扇形斩痕，从攻击者朝 dir 方向、长度 radius */
registerFx('cleave', (e, c) => {
  const u = c.world.getUnit(e.unitId);
  const p = u?.pos ?? e.pos;
  const d = e.dir ?? { x: Math.cos(u?.facing ?? 0), y: Math.sin(u?.facing ?? 0) };
  const ang = Math.atan2(d.y, d.x);
  const len = e.radius ?? 400;
  const gy = groundHeight(p.x, p.y);
  // 水平斩击弧：弧心在攻击者处，参数角 = −朝向（见 Fx3D.slash）
  c.fx.slash(p.x, p.y, gy + 18, len * 0.55, 0xffc890, 0.32, false, -ang);
  c.fx.slash(p.x, p.y, gy + 12, len * 0.9, 0xff8a50, 0.4, false, -ang);
  for (let i = 0; i < 10; i++) {
    const a = ang + (Math.random() - 0.5) * 1.4;
    const r = len * (0.4 + Math.random() * 0.55);
    c.fx.emit(p.x + Math.cos(a) * r, gy + 20, p.y + Math.sin(a) * r, Math.cos(a) * 120, 60, Math.sin(a) * 120, 0xffd0a0, 7, 0.35, true);
  }
});

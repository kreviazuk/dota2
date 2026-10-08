import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedMesh, LinearMipmapLinearFilter, Mesh, MeshLambertMaterial,
  Object3D, RepeatWrapping, ShaderMaterial, SRGBColorSpace, type Texture, type WebGLProgramParametersWithUniforms,
} from 'three';
import { MAP, walkableHalfWidthAt, layoutFor } from '../sim/data/map';
import { Team } from '../sim/core/types';
import { Rng } from '../sim/core/rng';
import { groundHeight, WATER_LEVEL } from './coords';
import { GeoBuilder } from './geo';
import { makeGlow, makeLambert, PAL } from './materials';

/** 地面纹理覆盖的世界范围（之外按边缘颜色延伸，是远处的树林） */
const TX0 = -700, TX1 = 3700, TZ0 = -1300, TZ1 = 11300;
/** 地面网格的总范围 */
const GX0 = -2600, GX1 = 5600, GZ0 = -3200, GZ1 = 13200;

/** 远离道路时地形缓慢抬升，镜头上方两角看到的是山坡上的树林而不是平地 */
export function terrainHeight(x: number, y: number): number {
  const off = Math.abs(x - MAP.laneX) - 1550;
  const offY = y < 0 ? -y : y > MAP.height ? y - MAP.height : 0;
  const rise = Math.max(0, off) * 0.22 + offY * 0.12;
  return groundHeight(x, y) + rise;
}

/** 河岸处（地面高度 = 水面）离河道中线的距离，水面着色器用来画岸边泡沫 */
function shoreDistance(): number {
  for (let d = 0; d < 400; d += 1) if (groundHeight(MAP.laneX, MAP.riverY + d) >= WATER_LEVEL) return d;
  return MAP.riverHalf;
}

/** 非均匀网格：道路附近和河道附近更密，远处稀疏 */
function axisSteps(a: number, b: number, zones: { lo: number; hi: number; step: number }[], coarse: number): number[] {
  const out: number[] = [];
  let v = a;
  while (v < b - 1e-6) {
    out.push(v);
    let step = coarse;
    for (const z of zones) if (v >= z.lo - 1e-6 && v < z.hi - 1e-6) step = Math.min(step, z.step);
    v = Math.min(b, v + step);
  }
  out.push(b);
  return out;
}

function buildGroundGeometry(): BufferGeometry {
  // 只有道路 / 基地边缘的土坡需要细分（道路中间是平的）
  const edges = [MAP.laneX - MAP.baseHalfWidth, MAP.laneX - MAP.laneHalfWidth, MAP.laneX + MAP.laneHalfWidth, MAP.laneX + MAP.baseHalfWidth];
  const xs = axisSteps(GX0, GX1, [
    ...edges.map((e) => ({ lo: e + (e < MAP.laneX ? -140 : 0), hi: e + (e < MAP.laneX ? 0 : 140), step: 20 })),
    { lo: -800, hi: 3800, step: 100 },
  ], 400);
  const zs = axisSteps(GZ0, GZ1, [
    { lo: MAP.riverY - 320, hi: MAP.riverY + 320, step: 20 },
    { lo: MAP.baseDepth - 120, hi: MAP.baseDepth + 120, step: 20 },
    { lo: MAP.height - MAP.baseDepth - 120, hi: MAP.height - MAP.baseDepth + 120, step: 20 },
    { lo: -1400, hi: 11400, step: 100 },
  ], 400);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i], z = zs[j];
      pos[k * 3] = x;
      pos[k * 3 + 1] = terrainHeight(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x - TX0) / (TX1 - TX0);
      uv[k * 2 + 1] = 1 - (z - TZ0) / (TZ1 - TZ0);
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b;
      idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** 程序生成的地面颜色图：树林地面、土路、基地石板、河床（世界坐标绘制） */
function paintGround(trees: TreeInst[]): HTMLCanvasElement {
  const W = 1024, H = Math.round((1024 * (TZ1 - TZ0)) / (TX1 - TX0));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sx = W / (TX1 - TX0), sz = H / (TZ1 - TZ0);
  g.setTransform(sx, 0, 0, sz, -TX0 * sx, -TZ0 * sz);
  const r = new Rng(77);
  const dire = (y: number) => y + r.range(-600, 600) < MAP.height / 2;

  // 1. 树林地面：夜魇一侧偏焦褐、天辉一侧偏青绿
  const grad = g.createLinearGradient(0, 1500, 0, 8500);
  grad.addColorStop(0, '#463424');
  grad.addColorStop(0.42, '#423e24');
  grad.addColorStop(0.58, '#34502a');
  grad.addColorStop(1, '#30582a');
  g.fillStyle = grad;
  g.fillRect(TX0, TZ0, TX1 - TX0, TZ1 - TZ0);
  for (let i = 0; i < 2600; i++) {
    const x = r.range(TX0, TX1), y = r.range(TZ0, TZ1);
    const d = dire(y);
    g.fillStyle = r.pick(d ? ['#2a1d16', '#4a3524', '#56301f', '#3d3a22'] : ['#1f3a1b', '#3a5e2a', '#4a6b2c', '#2a3d1c']);
    g.globalAlpha = r.range(0.12, 0.35);
    g.beginPath();
    g.arc(x, y, r.range(30, 200), 0, Math.PI * 2);
    g.fill();
  }
  // 落叶 / 小草点
  for (let i = 0; i < 9000; i++) {
    const x = r.range(TX0, TX1), y = r.range(TZ0, TZ1);
    const d = dire(y);
    g.fillStyle = r.pick(d ? ['#7a3a20', '#8a5a2a', '#2a1810'] : ['#6a9a3a', '#2a4a1c', '#8aa84a']);
    g.globalAlpha = r.range(0.2, 0.5);
    g.fillRect(x, y, r.range(4, 12), r.range(4, 12));
  }
  g.globalAlpha = 1;

  const top = MAP.baseDepth, bottom = MAP.height - MAP.baseDepth;
  const rect = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient) => {
    g.fillStyle = fill;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  const lx0 = MAP.laneX - MAP.laneHalfWidth, lx1 = MAP.laneX + MAP.laneHalfWidth;
  const bx0 = MAP.laneX - MAP.baseHalfWidth, bx1 = MAP.laneX + MAP.baseHalfWidth;

  // 2. 道路两侧的土坡（暗色），对应 groundHeight 的抬升带
  const edge = 'rgba(46,34,20,0.9)';
  rect(lx0 - 70, top, lx1 + 70, bottom, edge);
  rect(bx0 - 70, TZ0, bx1 + 70, top + 70, edge);
  rect(bx0 - 70, bottom - 70, bx1 + 70, TZ1, edge);

  // 3. 土路
  rect(lx0 - 10, top, lx1 + 10, bottom, '#86704c');
  for (let i = 0; i < 2600; i++) {
    const y = r.range(top, bottom);
    g.fillStyle = r.pick(['#9a8158', '#6f5a3c', '#a38a60', '#7a6444']);
    g.globalAlpha = r.range(0.15, 0.4);
    g.beginPath();
    g.ellipse(r.range(lx0, lx1), y, r.range(20, 90), r.range(10, 50), r.range(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // 中间被踩平的浅色路面
  const mid = g.createLinearGradient(MAP.laneX - 260, 0, MAP.laneX + 260, 0);
  mid.addColorStop(0, 'rgba(190,160,110,0)');
  mid.addColorStop(0.5, 'rgba(190,160,110,0.28)');
  mid.addColorStop(1, 'rgba(190,160,110,0)');
  rect(MAP.laneX - 260, top, MAP.laneX + 260, bottom, mid);
  // 车辙
  g.strokeStyle = 'rgba(70,52,30,0.35)';
  g.lineWidth = 10;
  for (const dx of [-70, 70]) {
    g.beginPath();
    for (let y = top; y <= bottom; y += 60) g.lineTo(MAP.laneX + dx + Math.sin(y * 0.004) * 30, y);
    g.stroke();
  }
  // 路边的草不规则地侵入路面，打破直线边缘
  for (let y = top; y < bottom; y += 14) {
    for (const side of [-1, 1]) {
      const ex = MAP.laneX + side * MAP.laneHalfWidth;
      const d = dire(y);
      g.fillStyle = r.pick(d ? ['#4a3a24', '#3a2c1c', '#5a4428'] : ['#3c5a26', '#4a6a2c', '#33501f']);
      g.globalAlpha = r.range(0.5, 0.9);
      g.beginPath();
      g.arc(ex + side * r.range(-30, 6), y, r.range(8, 26), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // 4. 基地：石板地面
  const paveBase = (y0: number, y1: number, base: string, line: string, accent: string) => {
    rect(bx0 - 10, y0, bx1 + 10, y1, base);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = r.pick(['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)', accent]);
      g.fillRect(Math.floor(r.range(bx0, bx1) / 110) * 110, Math.floor(r.range(y0, y1) / 110) * 110, 110, 110);
    }
    g.strokeStyle = line;
    g.lineWidth = 5;
    for (let x = Math.ceil(bx0 / 110) * 110; x < bx1; x += 110) {
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
    }
    for (let y = Math.ceil(y0 / 110) * 110; y < y1; y += 110) {
      g.beginPath();
      g.moveTo(bx0, y);
      g.lineTo(bx1, y);
      g.stroke();
    }
  };
  paveBase(TZ0, top, '#6a4c44', 'rgba(30,14,12,0.45)', 'rgba(140,40,20,0.12)');
  paveBase(bottom, TZ1, '#8e9a86', 'rgba(40,50,40,0.35)', 'rgba(80,140,80,0.10)');
  // 基地和道路相接处的过渡
  for (const [y, d] of [[top, true], [bottom, false]] as const) {
    const fade = g.createLinearGradient(0, y - 120, 0, y + 120);
    const pave = d ? '106,76,68' : '142,154,134';
    fade.addColorStop(d ? 0 : 1, `rgba(${pave},0.9)`);
    fade.addColorStop(d ? 1 : 0, `rgba(${pave},0)`);
    rect(lx0, y - 120, lx1, y + 120, fade);
  }
  // 遗迹周围的圆形广场纹样
  for (const team of [Team.Radiant, Team.Dire]) {
    const L = layoutFor(team);
    const col = team === Team.Radiant ? 'rgba(230,240,220,0.35)' : 'rgba(255,120,80,0.28)';
    g.strokeStyle = col;
    for (const [rad, w] of [[240, 10], [330, 6], [520, 8]] as const) {
      g.lineWidth = w;
      g.beginPath();
      g.arc(L.ancient.x, L.ancient.y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(L.ancient.x + Math.cos(a) * 240, L.ancient.y + Math.sin(a) * 240);
      g.lineTo(L.ancient.x + Math.cos(a) * 330, L.ancient.y + Math.sin(a) * 330);
      g.stroke();
    }
    // 泉水外圈
    g.fillStyle = team === Team.Radiant ? 'rgba(200,230,200,0.35)' : 'rgba(80,30,24,0.5)';
    g.beginPath();
    g.arc(L.fountain.x, L.fountain.y, 230, 0, Math.PI * 2);
    g.fill();
    // 塔基周围的石板
    for (const k of ['t1', 't2', 't3', 't4a', 't4b'] as const) {
      const p = L[k];
      g.fillStyle = team === Team.Radiant ? 'rgba(170,175,160,0.55)' : 'rgba(70,50,46,0.6)';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        g.lineTo(p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 150);
      }
      g.closePath();
      g.fill();
    }
  }
  // 夜魇基地地面的熔岩裂缝
  g.strokeStyle = 'rgba(255,90,30,0.55)';
  g.lineWidth = 6;
  for (let i = 0; i < 40; i++) {
    let x = r.range(bx0, bx1), y = r.range(-200, top - 100);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += r.range(-60, 60);
      y += r.range(-60, 60);
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // 树的影子直接画进地面纹理（树不参与实时阴影，阴影贴图里只有单位、建筑和石头）
  for (const t of trees) {
    const s = t.s * (t.kind === 1 ? 1.1 : 1);
    g.fillStyle = 'rgba(6,10,4,0.30)';
    g.beginPath();
    g.ellipse(t.x + 44 * s, t.y + 50 * s, 50 * s, 42 * s, 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(6,10,4,0.25)';
    g.beginPath();
    g.ellipse(t.x + 8 * s, t.y + 10 * s, 26 * s, 22 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 5. 河道：沙岸 → 河床
  const ry = MAP.riverY;
  const rg = g.createLinearGradient(0, ry - 300, 0, ry + 300);
  rg.addColorStop(0, 'rgba(150,130,90,0)');
  rg.addColorStop(0.2, 'rgba(165,145,100,0.95)');
  rg.addColorStop(0.36, '#5a6a5a');
  rg.addColorStop(0.5, '#3a5552');
  rg.addColorStop(0.64, '#5a6a5a');
  rg.addColorStop(0.8, 'rgba(165,145,100,0.95)');
  rg.addColorStop(1, 'rgba(150,130,90,0)');
  rect(TX0, ry - 300, TX1, ry + 300, rg);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r.pick(['#7a7a6a', '#4a5a50', '#b0a078', '#8a8068']);
    g.globalAlpha = r.range(0.25, 0.6);
    g.beginPath();
    g.arc(r.range(TX0, TX1), ry + r.range(-240, 240), r.range(3, 12), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

/** 平铺的细节噪声（乘到地面颜色上，近看不会糊成一片） */
function detailTexture(): Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, S, S);
  const r = new Rng(5);
  for (let i = 0; i < 2600; i++) {
    const v = r.chance(0.5) ? r.int(150, 190) : r.int(70, 110);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.globalAlpha = r.range(0.15, 0.5);
    const x = r.range(0, S), y = r.range(0, S), s = r.range(1, 4.5);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.arc(x + ox, y + oy, s, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function groundMaterial(trees: TreeInst[]): MeshLambertMaterial {
  const map = new CanvasTexture(paintGround(trees));
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  map.minFilter = LinearMipmapLinearFilter;
  const mat = new MeshLambertMaterial({ map });
  const detail = { value: detailTexture() };
  const rep = { value: [(TX1 - TX0) / 230, (TZ1 - TZ0) / 230] };
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uDetail = detail;
    sh.uniforms.uDetailRep = rep;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform sampler2D uDetail;\nuniform vec2 uDetailRep;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= texture2D(uDetail, vMapUv * uDetailRep).rgb * 1.9;');
  };
  mat.customProgramCacheKey = () => 'ground-detail';
  return mat;
}

function waterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uRiverY: { value: MAP.riverY }, uEdge: { value: shoreDistance() } },
    vertexShader: `varying vec2 vW;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uTime; uniform float uRiverY; uniform float uEdge; varying vec2 vW;
      void main() {
        float d = abs(vW.y - uRiverY);
        float w1 = sin(vW.x * 0.018 + uTime * 1.2 + sin(vW.y * 0.031 + uTime * 0.4) * 2.0);
        float w2 = sin(vW.x * 0.009 - vW.y * 0.05 + uTime * 0.8);
        float w = (w1 + w2) * 0.25 + 0.5;
        vec3 deep = vec3(0.05, 0.20, 0.28);
        vec3 light = vec3(0.17, 0.42, 0.50);
        vec3 c = mix(deep, light, w * 0.55 + smoothstep(uEdge - 90.0, uEdge, d) * 0.35);
        float s = smoothstep(0.86, 1.0, sin(vW.x * 0.045 + w2 * 3.0 + uTime * 1.7) * sin(vW.y * 0.07 - uTime * 1.3));
        c += s * 0.3;
        float foam = smoothstep(uEdge - 26.0, uEdge - 4.0, d) * (0.55 + 0.45 * sin(vW.x * 0.07 + uTime * 2.5));
        c = mix(c, vec3(0.92, 0.98, 1.0), foam * 0.75);
        float a = mix(0.84, 0.5, smoothstep(0.0, uEdge, d));
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// ---------- 树 ----------
type TreeKind = 'pine' | 'tallPine' | 'leafy';
const TREE_KINDS: TreeKind[] = ['pine', 'tallPine', 'leafy'];
/**
 * 树、草、石头按格子分组（每格每种一个 InstancedMesh），镜头外的格子整组剔除。
 * 横向只分三列（左侧树林 / 道路 / 右侧树林），纵向每 1500 一行：可见的格子少，绘制调用少。
 */
const CELL_Z = 1500;
const cellKey = (x: number, y: number) => `${x < MAP.laneX - 500 ? 0 : x < MAP.laneX + 500 ? 1 : 2}:${Math.floor(y / CELL_Z)}`;

function treeGeometry(kind: TreeKind, dire: boolean, seed: number): BufferGeometry {
  const b = new GeoBuilder(seed);
  const trunk = dire ? 0x3a2418 : 0x4a3220;
  b.cyl(5, 9, 46, 5, trunk, { p: [0, 23, 0], top: 0x5a3a24 }, true);
  // 天辉：鲜绿的松树和阔叶树；夜魇：焦黑发灰的松树和暗红的枯叶树
  const pal = dire
    ? kind === 'leafy' ? [0x3e1614, 0x5a221c, 0x7a3022, 0x9a4a2a] : [0x223a2e, 0x2f4a36, 0x47603e, 0x6e7448]
    : kind === 'leafy' ? [0x2a5a22, 0x3f7a2c, 0x5e9a36, 0x8ab84a] : [0x173f20, 0x24592a, 0x3a7a34, 0x62a044];
  if (kind === 'pine') {
    b.cone(50, 74, 7, pal[0], { p: [0, 70, 0], top: pal[1], jitter: 0.12 }, true);
    b.cone(40, 64, 7, pal[1], { p: [0, 104, 0], r: [0, 0.4, 0], top: pal[2], jitter: 0.12 }, true);
    b.cone(27, 54, 7, pal[2], { p: [0, 136, 0], r: [0, 0.9, 0], top: pal[3], jitter: 0.12 }, true);
  } else if (kind === 'tallPine') {
    b.cone(40, 70, 6, pal[0], { p: [0, 66, 0], top: pal[1], jitter: 0.12 }, true);
    b.cone(34, 62, 6, pal[1], { p: [0, 100, 0], r: [0, 0.5, 0], top: pal[2], jitter: 0.12 }, true);
    b.cone(27, 56, 6, pal[1], { p: [0, 132, 0], r: [0, 1.1, 0], top: pal[2], jitter: 0.12 }, true);
    b.cone(18, 48, 6, pal[2], { p: [0, 162, 0], r: [0, 1.6, 0], top: pal[3], jitter: 0.12 }, true);
  } else {
    b.ico(46, 0, pal[1], { p: [0, 86, 0], s: [1.1, 0.85, 1.1], top: pal[2], jitter: 0.14 });
    b.ico(32, 0, pal[0], { p: [22, 70, 14], top: pal[1], jitter: 0.14 });
    b.ico(28, 0, pal[2], { p: [-6, 118, -4], top: pal[3], jitter: 0.14 });
  }
  return b.build();
}

interface TreeInst { x: number; y: number; s: number; rot: number; kind: number; dire: boolean; tint: number }

function placeTrees(): TreeInst[] {
  const r = new Rng(2026);
  const out: TreeInst[] = [];
  const add = (x: number, y: number, dens: number) => {
    if (!r.chance(dens)) return;
    out.push({
      x: x + r.range(-25, 25), y: y + r.range(-25, 25), s: r.range(0.85, 1.35), rot: r.range(0, Math.PI * 2),
      kind: r.chance(0.5) ? 0 : r.chance(0.55) ? 1 : 2, dire: y + r.range(-500, 500) < MAP.height / 2, tint: r.range(0.82, 1.12),
    });
  };
  for (let y = -1300; y <= MAP.height + 1300; y += 78) {
    if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 70) continue;
    const inMap = y >= -40 && y <= MAP.height + 40;
    if (inMap) {
      const hw = walkableHalfWidthAt(y) + 70;
      for (const side of [-1, 1]) {
        const inner = MAP.laneX + side * hw;
        const outer = side < 0 ? -900 : MAP.width + 900;
        const n = Math.ceil(Math.abs(outer - inner) / 88);
        for (let k = 0; k < n; k++) {
          const x = inner + side * (k * 88 + r.range(0, 30));
          const far = Math.abs(x - MAP.laneX) > 1700;
          add(x, y, far ? 0.6 : 0.97);
        }
      }
    } else {
      // 地图上下边界以外：整片树林
      for (let x = -900; x <= MAP.width + 900; x += 88) add(x, y, Math.abs(x - MAP.laneX) > 1700 ? 0.6 : 0.85);
    }
  }
  return out;
}

/** 石头（几种变形的十二面体） */
function rockGeometry(seed: number, color: number): BufferGeometry {
  const b = new GeoBuilder(seed);
  const r = new Rng(seed);
  b.dodeca(20, color, { s: [r.range(0.9, 1.4), r.range(0.55, 0.9), r.range(0.8, 1.2)], r: [r.range(0, 1), r.range(0, 3), 0], jitter: 0.15 });
  b.dodeca(12, color, { p: [r.range(10, 18), -3, r.range(-8, 8)], s: [1, 0.7, 1], jitter: 0.15 });
  return b.build();
}

function grassGeometry(): BufferGeometry {
  const b = new GeoBuilder(9);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cone(3.5, 22 + (i % 3) * 6, 3, 0x4a7a2e, { p: [Math.cos(a) * 6, 10, Math.sin(a) * 6], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], top: 0x9ac25a, jitter: 0.1 }, true);
  }
  return b.build();
}

/**
 * 静态地图（只在启动时搭建一次）：地形网格 + 程序纹理、河面、分块实例化的树、石头、草丛和基地装饰。
 * 每帧只更新河面和树的摆动时间。
 */
export class MapScene {
  readonly group = new Group();
  private readonly water: ShaderMaterial;
  private readonly treeTime = { value: 0 };

  constructor() {
    const trees = placeTrees();
    const ground = new Mesh(buildGroundGeometry(), groundMaterial(trees));
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);

    this.water = waterMaterial();
    const wg = new BufferGeometry();
    const ry = MAP.riverY, rh = MAP.riverHalf + 160;
    wg.setAttribute('position', new BufferAttribute(new Float32Array([
      GX0, WATER_LEVEL, ry - rh, GX0, WATER_LEVEL, ry + rh, GX1, WATER_LEVEL, ry - rh, GX1, WATER_LEVEL, ry + rh,
    ]), 3));
    wg.setIndex([0, 1, 2, 2, 1, 3]);
    const water = new Mesh(wg, this.water);
    water.renderOrder = -1;
    this.group.add(water);

    this.buildTrees(trees);
    this.buildRocks();
    this.buildDecor();
  }

  private buildTrees(trees: TreeInst[]): void {
    const mat = makeLambert(true);
    const time = this.treeTime;
    mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'uniform float uTime;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             float ph = instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.017;
             float sway = max(0.0, position.y - 40.0) * 0.022;
             transformed.x += sin(uTime * 1.25 + ph) * sway;
             transformed.z += cos(uTime * 1.05 + ph * 1.3) * sway * 0.6;
           #endif`,
        );
    };
    mat.customProgramCacheKey = () => 'tree-sway';
    const geos: BufferGeometry[][] = [0, 1].map((d) => TREE_KINDS.map((k, i) => treeGeometry(k, d === 1, 31 + i * 7 + d * 3)));
    const groups = new Map<string, TreeInst[]>();
    for (const t of trees) {
      const key = `${cellKey(t.x, t.y)}:${t.dire ? 1 : 0}:${t.kind}`;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(t);
    }
    const o = new Object3D();
    const col = new Color();
    for (const [key, arr] of groups) {
      const [, , d, k] = key.split(':').map(Number);
      const mesh = new InstancedMesh(geos[d][k], mat, arr.length);
      arr.forEach((t, i) => {
        o.position.set(t.x, terrainHeight(t.x, t.y) - 2, t.y);
        o.rotation.set(0, t.rot, 0);
        o.scale.setScalar(t.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, col.setScalar(t.tint));
      });
      // 树的影子已经画在地面纹理里
      mesh.castShadow = false;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      this.group.add(mesh);
    }
  }

  private buildRocks(): void {
    const r = new Rng(404);
    const mat = makeLambert(true);
    const geos = [rockGeometry(1, 0x8a8478)];
    const items: { x: number; y: number; s: number; rot: number; v: number; flat: number; tint: number }[] = [];
    // 道路边缘的石块：沿土坡一路排开
    for (let y = -100; y <= MAP.height + 100; y += r.range(40, 110)) {
      if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 40) continue;
      for (const side of [-1, 1]) {
        if (r.chance(0.35)) continue;
        const hw = walkableHalfWidthAt(y);
        items.push({ x: MAP.laneX + side * (hw + r.range(40, 95)), y, s: r.range(0.8, 2.0), rot: r.range(0, 6.3), v: 0, flat: r.range(0.6, 1), tint: r.range(0.75, 1.05) });
      }
    }
    // 河里的卵石和林间散石
    for (let i = 0; i < 70; i++) items.push({ x: r.range(-200, 3200), y: MAP.riverY + r.range(-170, 170), s: r.range(0.6, 1.4), rot: r.range(0, 6.3), v: 0, flat: 0.6, tint: r.range(0.7, 1) });
    for (let i = 0; i < 160; i++) {
      const y = r.range(0, MAP.height);
      const side = r.chance(0.5) ? -1 : 1;
      items.push({ x: MAP.laneX + side * (walkableHalfWidthAt(y) + r.range(150, 1400)), y, s: r.range(1, 2.6), rot: r.range(0, 6.3), v: 0, flat: r.range(0.7, 1), tint: r.range(0.7, 1) });
    }
    const o = new Object3D();
    const col = new Color();
    const groups = new Map<string, typeof items>();
    for (const it of items) {
      const k = `${cellKey(it.x, it.y)}:${it.v}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it);
    }
    for (const [key, arr] of groups) {
      const v = +key.split(':')[2];
      const mesh = new InstancedMesh(geos[v], mat, arr.length);
      arr.forEach((it, i) => {
        o.position.set(it.x, terrainHeight(it.x, it.y) - 3, it.y);
        o.rotation.set(0, it.rot, 0);
        o.scale.set(it.s, it.s * it.flat, it.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(i, col.setScalar(it.tint));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    // 草丛：道路边缘和基地边缘
    const grass: { x: number; y: number; s: number; rot: number; dire: boolean }[] = [];
    for (let i = 0; i < 2200; i++) {
      const y = r.range(-100, MAP.height + 100);
      if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 20) continue;
      const side = r.chance(0.5) ? -1 : 1;
      const hw = walkableHalfWidthAt(y);
      grass.push({ x: MAP.laneX + side * (hw + r.range(-40, 160)), y, s: r.range(0.7, 1.5), rot: r.range(0, 6.3), dire: y + r.range(-500, 500) < MAP.height / 2 });
    }
    const gGeo = grassGeometry();
    const gMat = makeLambert(false);
    const cells = new Map<string, typeof grass>();
    for (const it of grass) {
      const k = cellKey(it.x, it.y);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k)!.push(it);
    }
    for (const arr of cells.values()) {
      const gm = new InstancedMesh(gGeo, gMat, arr.length);
      arr.forEach((it, i) => {
        o.position.set(it.x, terrainHeight(it.x, it.y) - 1, it.y);
        o.rotation.set(0, it.rot, 0);
        o.scale.setScalar(it.s);
        o.updateMatrix();
        gm.setMatrixAt(i, o.matrix);
        gm.setColorAt(i, it.dire ? col.setRGB(1.1, 0.6, 0.35) : col.setRGB(0.9, 1.05, 0.85));
      });
      gm.computeBoundingSphere();
      this.group.add(gm);
    }
  }

  /** 基地装饰：天辉白石柱 + 绿色火盆，夜魇黑色尖石 + 红色熔岩晶体 */
  private buildDecor(): void {
    const rad = new GeoBuilder(11);
    const dire = new GeoBuilder(12);
    const glowR = new GeoBuilder(13);
    const glowD = new GeoBuilder(14);
    const r = new Rng(88);
    for (const team of [Team.Radiant, Team.Dire]) {
      const b = team === Team.Radiant ? rad : dire;
      const gb = team === Team.Radiant ? glowR : glowD;
      const yEdge = team === Team.Radiant ? MAP.height - MAP.baseDepth : MAP.baseDepth;
      const sign = team === Team.Radiant ? 1 : -1;
      // 基地入口两侧的柱子 / 尖石
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const x = MAP.laneX + side * (MAP.laneHalfWidth + 60 + k * 70);
          const y = yEdge + sign * (40 + k * 30);
          const h = terrainHeight(x, y);
          if (team === Team.Radiant) {
            b.cyl(16, 20, 120, 8, 0xd8d4c6, { p: [x, h + 60, y], top: 0xf0ece0 });
            b.box(44, 14, 44, 0xb8b2a2, { p: [x, h + 7, y] });
            b.box(40, 10, 40, 0xc8c2b2, { p: [x, h + 124, y] });
            gb.ico(11, 0, PAL.radiantLight, { p: [x, h + 142, y] });
          } else {
            b.cone(24, 150 + r.range(-20, 30), 5, 0x2a2224, { p: [x, h + 70, y], r: [r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15)], top: 0x4a3434 });
            gb.octa(10, 0xff6a2a, { p: [x + r.range(-20, 20), h + 10, y + r.range(-20, 20)], s: [1, 1.8, 1] });
          }
        }
      }
      // 基地四周散布的装饰
      for (let i = 0; i < 26; i++) {
        const side = r.chance(0.5) ? -1 : 1;
        const x = MAP.laneX + side * r.range(MAP.baseHalfWidth + 80, MAP.baseHalfWidth + 260);
        const y = team === Team.Radiant ? r.range(MAP.height - MAP.baseDepth + 100, MAP.height + 100) : r.range(-100, MAP.baseDepth - 100);
        const h = terrainHeight(x, y);
        if (team === Team.Radiant) b.cyl(13, 16, r.range(60, 110), 7, 0xcfcabc, { p: [x, h + 40, y], r: [r.range(-0.2, 0.2), 0, r.range(-0.2, 0.2)] });
        else b.cone(20, r.range(80, 160), 5, 0x30262a, { p: [x, h + 50, y], r: [r.range(-0.25, 0.25), 0, r.range(-0.25, 0.25)] });
      }
    }
    const m1 = new Mesh(rad.build(), makeLambert(true));
    const m2 = new Mesh(dire.build(), makeLambert(true));
    for (const m of [m1, m2]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.group.add(new Mesh(glowR.build(), Object.assign(makeGlow(0xffffff), { vertexColors: true })));
    this.group.add(new Mesh(glowD.build(), Object.assign(makeGlow(0xffffff), { vertexColors: true })));
  }

  update(time: number): void {
    this.water.uniforms.uTime.value = time;
    this.treeTime.value = time;
  }
}

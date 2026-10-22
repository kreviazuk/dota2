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
const TX0 = -700, TX1 = 10700, TZ0 = -1300, TZ1 = 11300;
/** 地面网格的总范围 */
const GX0 = -2600, GX1 = 12600, GZ0 = -3200, GZ1 = 13200;

/** 远离道路时地形缓慢抬升，镜头上方两角看到的是山坡上的树林而不是平地 */
export function terrainHeight(x: number, y: number): number {
  const offX = x < 0 ? -x : x > MAP.width ? x - MAP.width : 0;
  const offY = y < 0 ? -y : y > MAP.height ? y - MAP.height : 0;
  const rise = offX * 0.22 + offY * 0.22;
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
  const xs = axisSteps(GX0, GX1, [
    { lo: 0, hi: MAP.width, step: 100 },
  ], 300);
  const zs = axisSteps(GZ0, GZ1, [
    { lo: 0, hi: MAP.height, step: 100 },
    { lo: MAP.riverY - 450, hi: MAP.riverY + 450, step: 40 },
  ], 300);
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

  const rect = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient) => {
    g.fillStyle = fill;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  // 2. 三路土路与路标
  const strokePath = (pts: { x: number; y: number }[], width: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, idx) => {
      if (idx === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.stroke();
  };

  const topPts = [{ x: 1500, y: 8500 }, { x: 1500, y: 1500 }, { x: 8500, y: 1500 }];
  const midPts = [{ x: 1500, y: 8500 }, { x: 8500, y: 1500 }];
  const botPts = [{ x: 1500, y: 8500 }, { x: 8500, y: 8500 }, { x: 8500, y: 1500 }];
  const allLanes = [topPts, midPts, botPts];

  // 道路两侧暗色边缘
  for (const pts of allLanes) strokePath(pts, MAP.laneHalfWidth * 2 + 100, 'rgba(46,34,20,0.9)');
  // 土路主面
  for (const pts of allLanes) strokePath(pts, MAP.laneHalfWidth * 2, '#86704c');
  // 中间浅色踩平路面
  for (const pts of allLanes) strokePath(pts, MAP.laneHalfWidth * 1.1, 'rgba(190,160,110,0.28)');

  // 4. 基地：天辉绿石 / 夜魇赤岩
  for (const team of [Team.Radiant, Team.Dire]) {
    const L = layoutFor(team);
    const isRad = team === Team.Radiant;
    g.fillStyle = isRad ? '#7c8e75' : '#5e3e36';
    g.beginPath();
    g.arc(L.ancient.x, L.ancient.y, 1100, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = isRad ? 'rgba(230,240,220,0.35)' : 'rgba(255,120,80,0.28)';
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
    g.fillStyle = isRad ? 'rgba(200,230,200,0.35)' : 'rgba(80,30,24,0.5)';
    g.beginPath();
    g.arc(L.fountain.x, L.fountain.y, 230, 0, Math.PI * 2);
    g.fill();
    // 塔基周围的石板
    const towerKeys = ['topT1', 'topT2', 'topT3', 'midT1', 'midT2', 'midT3', 'botT1', 'botT2', 'botT3', 't4a', 't4b'] as const;
    for (const k of towerKeys) {
      const p = L[k];
      g.fillStyle = isRad ? 'rgba(170,175,160,0.55)' : 'rgba(70,50,46,0.6)';
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
    let x = r.range(7500, 9500), y = r.range(500, 2500);
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
    // 树根接地处环境遮挡（Contact Shadow）
    g.fillStyle = 'rgba(4,6,3,0.36)';
    g.beginPath();
    g.ellipse(t.x, t.y, 20 * s, 16 * s, 0, 0, Math.PI * 2);
    g.fill();

    // 树根周遭落叶与苔藓杂色圈（天辉绿苔 / 夜魇暗红焦土）
    g.fillStyle = t.dire ? 'rgba(42,18,14,0.25)' : 'rgba(24,46,20,0.25)';
    g.beginPath();
    g.ellipse(t.x, t.y, 36 * s, 30 * s, 0.2, 0, Math.PI * 2);
    g.fill();

    // 主树冠斜向投射阴影
    g.fillStyle = 'rgba(6,10,4,0.30)';
    g.beginPath();
    g.ellipse(t.x + 44 * s, t.y + 50 * s, 50 * s, 42 * s, 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(6,10,4,0.20)';
    g.beginPath();
    g.ellipse(t.x + 10 * s, t.y + 12 * s, 26 * s, 22 * s, 0, 0, Math.PI * 2);
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
  // 1. 粗壮且带有外展根系的主树干与分枝
  const trunkBaseCol = dire ? 0x2e1a14 : 0x3d2a1b;
  const trunkTopCol = dire ? 0x442c20 : 0x5e422c;
  const trunkHeight = kind === 'tallPine' ? 58 : kind === 'pine' ? 48 : 56;
  const waistR = kind === 'tallPine' ? 7.5 : kind === 'pine' ? 8.5 : 10.5;

  // 主树干：8段圆柱，平滑过渡
  b.cyl(waistR * 0.72, waistR * 1.15, trunkHeight, 8, trunkBaseCol, {
    p: [0, trunkHeight / 2, 0],
    top: trunkTopCol,
    jitter: 0.03,
  }, true);

  // 底部抓地树根（4条根系外延）
  const rootCol = dire ? 0x221410 : 0x322014;
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.35;
    const rx = Math.cos(ang) * (waistR * 1.35);
    const rz = Math.sin(ang) * (waistR * 1.35);
    b.cone(waistR * 0.55, trunkHeight * 0.36, 6, rootCol, {
      p: [rx, trunkHeight * 0.12, rz],
      r: [Math.sin(ang) * 0.38, 0, -Math.cos(ang) * 0.38],
      s: [1, 1, 0.75],
      top: trunkBaseCol,
      jitter: 0.03,
    }, true);
  }

  // 树叶色板：底层阴影色 -> 中层叶冠色 -> 迎光高亮色 -> 冠顶光华
  const pal = dire
    ? kind === 'leafy'
      ? [0x321210, 0x4e1c18, 0x722820, 0x9a3e2c] // 夜魇血棘红古树
      : [0x1c2e24, 0x283e32, 0x3a5442, 0x567058] // 夜魇针叶暗松
    : kind === 'leafy'
      ? [0x1b441a, 0x2b6a24, 0x468e2e, 0x72b842] // 天辉翡翠阔叶古树
      : [0x15381c, 0x225528, 0x387c32, 0x58a644]; // 天辉翠绿云杉松

  if (kind === 'pine') {
    // 5 层带有向下自然垂坠弧度的多边形伞裙（12-14边形，层次交错）
    const tiers = [
      { r: 52, h: 52, y: 56, seg: 12, rot: 0.0, c0: pal[0], c1: pal[1] },
      { r: 42, h: 48, y: 82, seg: 12, rot: 0.45, c0: pal[0], c1: pal[1] },
      { r: 33, h: 44, y: 108, seg: 12, rot: 0.9, c0: pal[1], c1: pal[2] },
      { r: 23, h: 40, y: 132, seg: 10, rot: 1.35, c0: pal[1], c1: pal[2] },
      { r: 13, h: 36, y: 154, seg: 10, rot: 1.8, c0: pal[2], c1: pal[3] },
    ];
    for (const t of tiers) {
      // 内部阴影暗层
      b.cone(t.r * 0.88, t.h * 0.75, t.seg, pal[0], {
        p: [0, t.y - t.h * 0.1, 0],
        r: [0, t.rot + 0.2, 0],
        jitter: 0.03,
      }, true);
      // 外部迎光层
      b.cone(t.r, t.h, t.seg, t.c0, {
        p: [0, t.y, 0],
        r: [0, t.rot, 0],
        top: t.c1,
        jitter: 0.04,
      }, true);
    }
  } else if (kind === 'tallPine') {
    // 6 层参天高松（修长塔状）
    const tiers = [
      { r: 44, h: 56, y: 58, seg: 12, rot: 0.0, c0: pal[0], c1: pal[1] },
      { r: 37, h: 52, y: 86, seg: 12, rot: 0.4, c0: pal[0], c1: pal[1] },
      { r: 30, h: 48, y: 112, seg: 12, rot: 0.8, c0: pal[0], c1: pal[2] },
      { r: 23, h: 44, y: 136, seg: 10, rot: 1.2, c0: pal[1], c1: pal[2] },
      { r: 16, h: 40, y: 158, seg: 10, rot: 1.6, c0: pal[2], c1: pal[3] },
      { r: 9, h: 36, y: 178, seg: 8, rot: 2.0, c0: pal[2], c1: pal[3] },
    ];
    for (const t of tiers) {
      b.cone(t.r * 0.88, t.h * 0.72, t.seg, pal[0], {
        p: [0, t.y - t.h * 0.08, 0],
        r: [0, t.rot + 0.2, 0],
        jitter: 0.03,
      }, true);
      b.cone(t.r, t.h, t.seg, t.c0, {
        p: [0, t.y, 0],
        r: [0, t.rot, 0],
        top: t.c1,
        jitter: 0.04,
      }, true);
    }
  } else {
    // 阔叶古树：3 根分叉枝干 + 11 簇平滑细分的云朵叶冠（detail: 1）
    for (const [bx, by, bz, rx, rz] of [
      [14, 52, 6, 0.35, -0.25],
      [-12, 54, -8, -0.3, 0.3],
      [4, 60, 12, 0.25, 0.38],
    ]) {
      b.cyl(4.5, 6.5, 26, 6, trunkTopCol, {
        p: [bx, by, bz],
        r: [rx, 0, rz],
        top: trunkTopCol,
        jitter: 0.03,
      }, true);
    }

    // 11 簇丰满圆润的球状叶冠（detail: 1 = 80 三角形平滑多面体）
    const puffs: { p: [number, number, number]; r: number; s: [number, number, number]; col: number; top: number }[] = [
      // 底部下垂大叶簇
      { p: [0, 78, 0], r: 42, s: [1.2, 0.8, 1.2], col: pal[0], top: pal[1] },
      { p: [22, 74, 12], r: 32, s: [1.1, 0.85, 1.0], col: pal[0], top: pal[1] },
      { p: [-22, 76, 10], r: 30, s: [1.0, 0.85, 1.15], col: pal[0], top: pal[1] },
      { p: [8, 74, -22], r: 33, s: [1.15, 0.8, 1.1], col: pal[0], top: pal[1] },
      { p: [-14, 80, -18], r: 28, s: [1.05, 0.9, 1.0], col: pal[0], top: pal[1] },
      // 中部核心与侧翼叶簇
      { p: [0, 98, 0], r: 38, s: [1.15, 0.85, 1.15], col: pal[1], top: pal[2] },
      { p: [18, 102, -12], r: 28, s: [1.05, 0.9, 1.0], col: pal[1], top: pal[2] },
      { p: [-18, 100, -8], r: 26, s: [1.0, 0.9, 1.1], col: pal[1], top: pal[2] },
      { p: [10, 104, 16], r: 26, s: [1.1, 0.85, 1.0], col: pal[1], top: pal[2] },
      // 顶部受光冠顶（金绿色高光）
      { p: [0, 122, 0], r: 28, s: [1.0, 0.9, 1.0], col: pal[2], top: pal[3] },
      { p: [-6, 130, 4], r: 20, s: [0.95, 0.9, 0.95], col: pal[2], top: pal[3] },
    ];
    for (const puff of puffs) {
      b.ico(puff.r, 1, puff.col, {
        p: puff.p,
        s: puff.s,
        top: puff.top,
        jitter: 0.04,
      });
    }
  }
  return b.build();
}

interface TreeInst { x: number; y: number; s: number; rot: number; kind: number; dire: boolean; tint: number }

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function isRoadOrBase(x: number, y: number): boolean {
  if (Math.hypot(x - 1500, y - 8500) < 1400) return true;
  if (Math.hypot(x - 8500, y - 1500) < 1400) return true;
  if (Math.abs(y - MAP.riverY) < MAP.riverHalf + 60) return true;
  const dTop1 = distToSegment(x, y, 1500, 8500, 1500, 1500);
  const dTop2 = distToSegment(x, y, 1500, 1500, 8500, 1500);
  const dMid = distToSegment(x, y, 1500, 8500, 8500, 1500);
  const dBot1 = distToSegment(x, y, 1500, 8500, 8500, 8500);
  const dBot2 = distToSegment(x, y, 8500, 8500, 8500, 1500);
  const minDist = Math.min(dTop1, dTop2, dMid, dBot1, dBot2);
  return minDist < MAP.laneHalfWidth + 60;
}

function placeTrees(): TreeInst[] {
  const r = new Rng(2026);
  const out: TreeInst[] = [];
  const add = (x: number, y: number, dens: number) => {
    if (!r.chance(dens)) return;
    out.push({
      x: x + r.range(-30, 30), y: y + r.range(-30, 30), s: r.range(0.85, 1.35), rot: r.range(0, Math.PI * 2),
      kind: r.chance(0.5) ? 0 : r.chance(0.55) ? 1 : 2, dire: y + r.range(-500, 500) < MAP.height / 2, tint: r.range(0.82, 1.12),
    });
  };
  for (let y = -1200; y <= MAP.height + 1200; y += 130) {
    for (let x = -1200; x <= MAP.width + 1200; x += 130) {
      const inPlay = x >= 100 && x <= MAP.width - 100 && y >= 100 && y <= MAP.height - 100;
      if (!inPlay) {
        add(x, y, 0.75);
      } else {
        if (!isRoadOrBase(x, y)) {
          add(x, y, 0.65);
        }
      }
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
    const mat = makeLambert(false);
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

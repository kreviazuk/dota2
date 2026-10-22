import { AdditiveBlending, Color, DoubleSide, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, type BufferGeometry } from 'three';

/**
 * 贴地的圆形标记（瞄准范围圈、技能落点、引导进度圈、阵营圈、冲击波……）共用一个着色器：
 * 一个铺在地面上的正方形，片元着色器按到中心的距离画环和填充，支持虚线、进度弧和柔边。
 * 半径由 mesh.scale 决定（几何体是 [-1,1]² 的正方形），环宽用世界单位换算成半径的比例传入。
 */
const VERT = `
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = uv * 2.0 - 1.0;
  vTint = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #endif
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uWidth;
uniform float uFill;
uniform float uDash;
uniform float uDashOffset;
uniform float uProgress;
uniform float uSoft;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = fract(atan(vUv.x, vUv.y) / 6.2831853 + 1.0); // 0..1，从正上方（-z 方向，屏幕上方）顺时针
  float inner = 1.0 - uWidth;
  float ring = smoothstep(inner - uSoft, inner, r) * (1.0 - smoothstep(1.0 - uSoft, 1.0, r));
  if (uDash > 0.0) ring *= step(0.45, fract(a * uDash + uDashOffset));
  if (uProgress < 1.0) ring *= step(a, uProgress);
  float fill = uFill * (1.0 - smoothstep(inner - uSoft, inner, r));
  float alpha = (ring + fill * (1.0 - ring)) * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor * vTint, alpha);
}`;

export interface RingParams {
  color?: number | Color;
  opacity?: number;
  /** 环宽（世界单位） */
  width?: number;
  /** 圆内填充的不透明度（相对 opacity） */
  fill?: number;
  /** 虚线段数（0 = 实线） */
  dash?: number;
  dashOffset?: number;
  /** 进度弧 0..1（1 = 整圈） */
  progress?: number;
  /** 柔边宽度（世界单位） */
  soft?: number;
  additive?: boolean;
}

let sharedGeo: PlaneGeometry | null = null;
/** 铺在 XZ 平面上的 [-1,1]² 正方形 */
export function flatQuad(): PlaneGeometry {
  if (!sharedGeo) {
    sharedGeo = new PlaneGeometry(2, 2);
    sharedGeo.rotateX(-Math.PI / 2);
  }
  return sharedGeo;
}

export function makeRingMaterial(additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: additive ? AdditiveBlending : NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uColor: { value: new Color(0xffffff) },
      uOpacity: { value: 1 },
      uWidth: { value: 0.1 },
      uFill: { value: 0 },
      uDash: { value: 0 },
      uDashOffset: { value: 0 },
      uProgress: { value: 1 },
      uSoft: { value: 0.02 },
    },
  });
}

/** 一个贴地圆环（自带材质，参数随时可改） */
export class RingDecal {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  constructor(additive = false, renderOrder = 2) {
    this.mesh = new Mesh(flatQuad(), makeRingMaterial(additive));
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
  }

  /** 放在 (x, 高度 h, z)，外半径 radius */
  set(x: number, h: number, z: number, radius: number, p: RingParams): this {
    const m = this.mesh;
    m.visible = radius > 0.5 && (p.opacity ?? 1) > 0.003;
    m.position.set(x, h, z);
    m.scale.setScalar(Math.max(0.5, radius));
    const u = m.material.uniforms;
    if (p.color !== undefined) (u.uColor.value as Color).set(p.color);
    u.uOpacity.value = p.opacity ?? 1;
    u.uWidth.value = Math.min(1, (p.width ?? 6) / Math.max(1, radius));
    u.uFill.value = p.fill ?? 0;
    u.uDash.value = p.dash ?? 0;
    u.uDashOffset.value = p.dashOffset ?? 0;
    u.uProgress.value = p.progress ?? 1;
    u.uSoft.value = Math.min(0.5, (p.soft ?? 2.5) / Math.max(1, radius));
    return this;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.material.dispose();
  }
}

/** 贴地的矩形（方向技能的指示条、单位技能的连线）：在 XZ 平面上从 (0,0) 指向 +X、宽度 1 的条带 */
let stripGeo: PlaneGeometry | null = null;
export function flatStrip(): PlaneGeometry {
  if (!stripGeo) {
    stripGeo = new PlaneGeometry(1, 1);
    stripGeo.rotateX(-Math.PI / 2);
    stripGeo.translate(0.5, 0, 0);
  }
  return stripGeo;
}

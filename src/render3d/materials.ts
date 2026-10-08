import {
  AdditiveBlending, Color, FrontSide, NormalBlending, DataTexture, DoubleSide, type IUniform, MeshBasicMaterial, MeshLambertMaterial, MeshToonMaterial, NearestFilter,
  RedFormat, type Material, type WebGLProgramParametersWithUniforms,
} from 'three';

/** 统一的风格化调色板（sRGB 十六进制） */
export const PAL = {
  radiant: 0x4fd160,
  radiantLight: 0xa8f5a0,
  radiantDark: 0x1f6a2a,
  dire: 0xe8473a,
  direLight: 0xffa090,
  direDark: 0x6e1a14,
  gold: 0xe0aa3e,
  steel: 0x9aa0aa,
  darkSteel: 0x5b6069,
  leather: 0x6a4428,
  darkLeather: 0x3e2716,
  wood: 0x7a5232,
  stone: 0xa49c8e,
  darkStone: 0x5a5550,
};

export const teamColor = (team: number): number => (team === 0 ? PAL.radiant : PAL.dire);
export const teamLight = (team: number): number => (team === 0 ? PAL.radiantLight : PAL.direLight);
export const teamDark = (team: number): number => (team === 0 ? PAL.radiantDark : PAL.direDark);

let gradient: DataTexture | null = null;
/** 卡通渲染的明暗阶梯（4 阶），最暗一阶不会太黑，阴影面仍然看得清颜色 */
export function toonGradient(): DataTexture {
  if (!gradient) {
    const data = new Uint8Array([96, 150, 210, 255]);
    gradient = new DataTexture(data, data.length, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

/**
 * 给材质加边缘光（rim light）：视线掠过的轮廓边缘提亮，单位在地面上更容易分辨。
 * rim 是共享 uniform，可以每帧改颜色（比如受击闪白）。
 */
export function addRim(mat: Material, color: number, strength: number, key: string): { value: Color } {
  const u: IUniform<Color> = { value: new Color(color).multiplyScalar(strength) };
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uRim = u;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{ float rimK = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
           outgoingLight += uRim * pow(rimK, 4.0); }
         #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${key}`;
  return u;
}

/** 人物 / 建筑：顶点色 + 卡通明暗 + 边缘光 */
export function makeToon(opts: { rim?: number; rimStrength?: number; key?: string; transparent?: boolean } = {}): MeshToonMaterial & { rimU: { value: Color } } {
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), transparent: opts.transparent ?? false });
  const rimU = addRim(m, opts.rim ?? 0xfff2d8, opts.rimStrength ?? 0.35, opts.key ?? 'char');
  return Object.assign(m, { rimU });
}

/** 树、石头等环境物件：顶点色 + 兰伯特光照（比卡通材质便宜，颜色过渡更柔和） */
export const makeLambert = (flat = false): MeshLambertMaterial => new MeshLambertMaterial({ vertexColors: true, flatShading: flat });

/** 发光体（水晶、法球）：不受光照，可选叠加混合 */
export const makeGlow = (color: number, additive = false, opacity = 1): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color, transparent: additive || opacity < 1, opacity, blending: additive ? AdditiveBlending : NormalBlending,
    depthWrite: !additive, side: additive ? DoubleSide : FrontSide, toneMapped: false,
  });

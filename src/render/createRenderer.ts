import type { GameRenderer } from './view';

/** 浏览器是否支持 WebGL 2（Three.js r163 起只支持 WebGL 2） */
export function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * 选择渲染器：默认用 Three.js 3D 渲染器；WebGL 2 不可用、初始化失败，或网址带 `?renderer=2d` 时退回 2D Canvas 渲染器。
 * 3D 渲染器（含 three）是单独的代码块，按需加载。
 * 返回的 canvas 是实际使用的画布（3D 初始化失败时原画布已经有了 WebGL 上下文，会换成一块新画布）。
 */
export async function createRenderer(canvas: HTMLCanvasElement): Promise<GameRenderer> {
  const force = new URLSearchParams(window.location.search).get('renderer');
  if (force !== '2d' && webgl2Available()) {
    try {
      const { Renderer3D } = await import('../render3d/renderer3d');
      return new Renderer3D(canvas);
    } catch (e) {
      console.info('3D 渲染器不可用，改用 2D 渲染器：', e);
      const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(fresh);
      canvas = fresh;
    }
  }
  const { Renderer } = await import('./renderer');
  return new Renderer(canvas);
}

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const PURE_DIRS = ['src/sim', 'src/ai', 'src/game'];
const FORBIDDEN = /\b(document|window|HTMLElement|requestAnimationFrame|localStorage|performance)\b|Math\.random\s*\(/;

describe('simulation purity', () => {
  it('sim/ai/game code has no DOM access and no Math.random', () => {
    const offenders: string[] = [];
    for (const d of PURE_DIRS) for (const f of walk(d)) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (FORBIDDEN.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

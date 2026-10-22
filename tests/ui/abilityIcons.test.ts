import { describe, it, expect } from 'vitest';
import { getAbilityIconCanvas, getActionIconCanvas, getAbilityVisual } from '../../src/render/abilityIcons';

describe('abilityIcons procedural generator', () => {
  it('generates canvas icon for hero abilities', () => {
    const canvas = getAbilityIconCanvas('axe_berserkers_call', 64);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });

  it('generates action button icons', () => {
    for (const act of ['attack', 'lasthit', 'push', 'recall', 'cancel'] as const) {
      const canvas = getActionIconCanvas(act, 48);
      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(48);
      expect(canvas.height).toBe(48);
    }
  });

  it('falls back gracefully to default visual for unknown abilities', () => {
    const vis = getAbilityVisual('unknown_ability_123');
    expect(vis).toBeDefined();
    expect(vis.glyph).toBe('default');
    const canvas = getAbilityIconCanvas('unknown_ability_123', 32);
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(32);
  });
});

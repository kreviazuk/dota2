import { describe, it, expect } from 'vitest';
import { formatClock, vitalText } from '../src/ui/hud';

describe('HUD text', () => {
  it('formats the match clock as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65.9)).toBe('01:05');
    expect(formatClock(40 * 60 + 1)).toBe('40:01');
  });
  it('never shows current hp/mana above the displayed maximum', () => {
    expect(vitalText(693.4, 693.4, true)).toBe('693 / 693');
    expect(vitalText(693.1, 693.4, true)).toBe('693 / 693');
    expect(vitalText(291.6, 291.6, false)).toBe('292 / 292');
    expect(vitalText(150.7, 291.6, false)).toBe('150 / 292');
  });
  it('shows at least 1 hp while alive and 0 when empty', () => {
    expect(vitalText(0.3, 700, true)).toBe('1 / 700');
    expect(vitalText(0, 700, true)).toBe('0 / 700');
    expect(vitalText(-5, 700, true)).toBe('0 / 700');
  });
});

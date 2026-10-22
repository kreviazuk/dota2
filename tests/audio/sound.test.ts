import { describe, it, expect, beforeEach } from 'vitest';
import { sound, type SoundEffect } from '../../src/audio/sound';

describe('SoundSystem', () => {
  beforeEach(() => {
    sound.setEnabled(true);
  });

  it('can enable and disable sound', () => {
    sound.setEnabled(false);
    expect(sound.isEnabled()).toBe(false);
    sound.setEnabled(true);
    expect(sound.isEnabled()).toBe(true);
  });

  it('safely handles play in headless environment without crashing', () => {
    const effects: SoundEffect[] = [
      'attack',
      'hit',
      'cast',
      'levelUp',
      'gold',
      'towerDestroyed',
      'roshan',
      'victory',
      'defeat',
    ];

    for (const sfx of effects) {
      expect(() => sound.play(sfx)).not.toThrow();
    }
  });

  it('does not attempt playback when disabled', () => {
    sound.setEnabled(false);
    expect(() => sound.play('cast')).not.toThrow();
  });
});

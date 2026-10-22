import { loadPrefs } from '../ui/settings';

export type SoundEffect =
  | 'attack'
  | 'hit'
  | 'cast'
  | 'levelUp'
  | 'gold'
  | 'towerDestroyed'
  | 'roshan'
  | 'victory'
  | 'defeat';

class SoundSystem {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private masterGain: GainNode | null = null;
  private lastPlayTime: Record<string, number> = {};

  constructor() {
    this.enabled = loadPrefs().sound;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public play(sfx: SoundEffect): void {
    if (!this.enabled) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // 节流：同类音效 40ms 内只播放一次，避免团战多段音效爆音
    if (this.lastPlayTime[sfx] && now - this.lastPlayTime[sfx] < 40) return;
    this.lastPlayTime[sfx] = now;

    const ctx = this.initCtx();
    if (!ctx || !this.masterGain) return;

    try {
      const t = ctx.currentTime;
      switch (sfx) {
        case 'attack':
          this.playAttack(ctx, t);
          break;
        case 'hit':
          this.playHit(ctx, t);
          break;
        case 'cast':
          this.playCast(ctx, t);
          break;
        case 'levelUp':
          this.playLevelUp(ctx, t);
          break;
        case 'gold':
          this.playGold(ctx, t);
          break;
        case 'towerDestroyed':
          this.playTowerDestroyed(ctx, t);
          break;
        case 'roshan':
          this.playRoshan(ctx, t);
          break;
        case 'victory':
          this.playVictory(ctx, t);
          break;
        case 'defeat':
          this.playDefeat(ctx, t);
          break;
      }
    } catch {
      // 容错处理：音频出错不影响主游戏循环
    }
  }

  /** 普攻挥舞打击声 */
  private playAttack(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** 受击钝击声 */
  private playHit(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  /** 技能释放共鸣声 */
  private playCast(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.18);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** 升级祝贺琶音（C5 - E5 - G5 - C6） */
  private playLevelUp(ctx: AudioContext, t: number): void {
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.35, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.25);
    });
  }

  /** 金币金币声（清脆双声） */
  private playGold(ctx: AudioContext, t: number): void {
    [987.77, 1318.51].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.06;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.3, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.15);
    });
  }

  /** 防御塔崩塌深沉爆炸 */
  private playTowerDestroyed(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.6);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  /** 肉山被击杀震撼怒吼 */
  private playRoshan(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 1.0);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 1.0);
  }

  /** 胜利大调凯歌 */
  private playVictory(ctx: AudioContext, t: number): void {
    const chords = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    chords.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.4, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.8);
    });
  }

  /** 失败小调挽歌 */
  private playDefeat(ctx: AudioContext, t: number): void {
    const chords = [622.25, 523.25, 392.0, 261.63]; // Eb5 C5 G4 C4
    chords.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.18;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.45, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.9);
    });
  }
}

export const sound = new SoundSystem();

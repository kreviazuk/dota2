import { loadPrefs } from '../ui/settings';

export type SoundEffect =
  | 'attack'
  | 'hit'
  | 'cast'
  | 'levelUp'
  | 'gold'
  | 'towerDestroyed'
  | 'roshan'
  | 'rune'
  | 'firstBlood'
  | 'kill'
  | 'doubleKill'
  | 'tripleKill'
  | 'streak'
  | 'teamWipe'
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
        case 'rune':
          this.playRune(ctx, t);
          break;
        case 'firstBlood':
          this.playFirstBlood(ctx, t);
          break;
        case 'kill':
          this.playHeroKill(ctx, t);
          break;
        case 'doubleKill':
          this.playDoubleKill(ctx, t);
          break;
        case 'tripleKill':
          this.playTripleKill(ctx, t);
          break;
        case 'streak':
          this.playStreak(ctx, t);
          break;
        case 'teamWipe':
          this.playTeamWipe(ctx, t);
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

  /** 神符拾取空灵清音 */
  private playRune(ctx: AudioContext, t: number): void {
    const freqs = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.06;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.35, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.45);
    });
  }

  /** 第一滴血雄壮铜管号角 */
  private playFirstBlood(ctx: AudioContext, t: number): void {
    const freqs = [349.23, 440.0, 523.25, 698.46]; // F4, A4, C5, F5
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const st = t + idx * 0.1;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, st);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, st);

      gain.gain.setValueAtTime(0.45, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.6);
    });
  }

  /** 普通英雄击杀打击战音 */
  private playHeroKill(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.2);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** 双杀利落上扬双音 */
  private playDoubleKill(ctx: AudioContext, t: number): void {
    const notes = [587.33, 880.0]; // D5, A5
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.12;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.5, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.4);
    });
  }

  /** 三杀激昂三连音 */
  private playTripleKill(ctx: AudioContext, t: number): void {
    const notes = [523.25, 659.25, 1046.5]; // C5, E5, C6
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.1;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.5, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.45);
    });
  }

  /** 连杀终结与连杀荣耀凯音 */
  private playStreak(ctx: AudioContext, t: number): void {
    const notes = [392.0, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const st = t + idx * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);

      gain.gain.setValueAtTime(0.45, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(st);
      osc.stop(st + 0.5);
    });
  }

  /** 团灭沉雄铜钟长鸣 */
  private playTeamWipe(ctx: AudioContext, t: number): void {
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(196.0, t); // G3
    osc.frequency.exponentialRampToValueAtTime(130.81, t + 1.2); // C3

    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(98.0, t); // G2
    subOsc.frequency.exponentialRampToValueAtTime(65.41, t + 1.2); // C2

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.2);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(t);
    subOsc.start(t);
    osc.stop(t + 1.2);
    subOsc.stop(t + 1.2);
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

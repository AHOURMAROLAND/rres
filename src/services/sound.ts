/**
 * Sound synthesis service using Web Audio API
 * No external audio files needed - runs completely client-side safely
 */

class SoundService {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private lastMilestoneReached: number = 1;

  constructor() {
    // Check saved setting
    const saved = localStorage.getItem('aviator_sound_enabled');
    if (saved !== null) {
      this.enabled = saved === 'true';
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    localStorage.setItem('aviator_sound_enabled', String(val));
    if (!val) {
      this.stopFlightEngine();
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Play button click
  public playClick() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {
      // ignore
    }
  }

  // Play takeoff launch sound
  public playTakeoff() {
    this.lastMilestoneReached = 1;
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // ignore
    }
  }

  // Play countdown tick (3, 2, 1)
  public playTick(isLast: boolean = false) {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isLast ? 880 : 540, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isLast ? 0.15 : 0.06));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (isLast ? 0.16 : 0.07));
    } catch {
      // ignore
    }
  }

  // Play sonic milestone chime (2x, 5x, 10x, etc.)
  public playMilestone(currentMult?: number) {
    if (!this.enabled) return;
    if (currentMult !== undefined) {
      const thresholds = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
      const reached = thresholds.filter((t) => currentMult >= t && this.lastMilestoneReached < t);
      if (reached.length === 0) return;
      this.lastMilestoneReached = Math.max(...reached);
    }

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1); // E6

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // ignore
    }
  }

  // Start continuous engine hum that pitches up with multiplier
  public updateFlightPitch(multiplier: number) {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      if (!this.engineOsc) {
        this.engineOsc = ctx.createOscillator();
        this.engineGain = ctx.createGain();

        this.engineOsc.type = 'triangle';
        this.engineOsc.frequency.setValueAtTime(140, ctx.currentTime);

        this.engineGain.gain.setValueAtTime(0.01, ctx.currentTime);
        this.engineGain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.2);

        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(ctx.destination);

        this.engineOsc.start();
      }

      // Pitch increases smoothly with multiplier (e.g. from 140Hz up to 600Hz)
      const freq = Math.min(650, 140 + (multiplier - 1) * 35);
      this.engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
    } catch {
      // ignore
    }
  }

  public stopFlightEngine() {
    if (this.engineOsc && this.ctx) {
      try {
        const now = this.ctx.currentTime;
        if (this.engineGain) {
          this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, now);
          this.engineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        }
        setTimeout(() => {
          try {
            this.engineOsc?.stop();
            this.engineOsc?.disconnect();
            this.engineOsc = null;
            this.engineGain = null;
          } catch {
            // ignore
          }
        }, 120);
      } catch {
        this.engineOsc = null;
        this.engineGain = null;
      }
    }
  }

  // Play cashout triumph sound
  public playCashout() {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord arpeggio
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.12, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.35);
      });
    } catch {
      // ignore
    }
  }

  // Play crash explosion / flew away sound
  public playCrash() {
    this.stopFlightEngine();
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // White noise buffer for explosion/whoosh
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.35);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
    } catch {
      // ignore
    }
  }
}

export const soundManager = new SoundService();

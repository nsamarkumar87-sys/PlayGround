export class Soundscape {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.muted = false;
    this.started = false;
    this.chordIndex = 0;
    this.musicTimer = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 5;
    comp.attack.value = 0.005;
    comp.release.value = 0.22;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.13;
    this.musicGain.connect(this.master);
    return this.ctx;
  }

  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime + 0.25);
    }
  }

  tone(freq, duration, type = 'sine', volume = 0.15, when = 0, glide = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  noise(duration, volume = 0.1, freq = 1200, q = 0.7, when = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t); src.stop(t + duration);
  }

  move() { this.tone(310, 0.035, 'square', 0.025); }
  rotate() { this.tone(480, 0.055, 'triangle', 0.05, 0, 80); }
  hold() { this.tone(390, 0.07, 'sine', 0.06, 0, 120); }
  softDrop() { this.tone(180, 0.025, 'triangle', 0.02); }
  lock() {
    this.tone(130, 0.09, 'triangle', 0.12, 0, -40);
    this.noise(0.055, 0.045, 900, 0.8);
  }
  hardDrop() {
    this.tone(95, 0.16, 'sine', 0.2, 0, -40);
    this.noise(0.09, 0.07, 480, 0.6);
  }
  clear(lines) {
    const base = 520 + lines * 40;
    [0, 4, 7, 12].slice(0, Math.min(4, lines + 1)).forEach((semi, i) => {
      this.tone(base * Math.pow(2, semi / 12), 0.22, 'triangle', 0.075, i * 0.055);
    });
    this.noise(0.28, 0.035, 2600, 0.8, 0.02);
  }
  build() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.055, i * 0.075));
  }
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, 0.65, 'triangle', 0.09, i * 0.12);
      this.tone(f * 0.5, 0.7, 'sine', 0.04, i * 0.12);
    });
    this.noise(0.8, 0.03, 3000, 0.7, 0.1);
  }
  gameOver() {
    [392, 349.23, 293.66, 220].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.08, i * 0.15, -30));
  }
  click() { this.tone(620, 0.05, 'sine', 0.06, 0, 90); }

  startMusic() {
    const ctx = this.ensure();
    if (!ctx) return;
    const chords = [
      [130.81, 196.0, 261.63, 329.63],
      [110.0, 164.81, 220.0, 293.66],
      [146.83, 220.0, 293.66, 349.23],
      [98.0, 146.83, 196.0, 246.94]
    ];
    const playChord = () => {
      if (!this.ctx || this.muted) return;
      const notes = chords[this.chordIndex % chords.length];
      this.chordIndex++;
      const now = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700 + i * 150;
        osc.type = i === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 7;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.055 / (i + 1.5), now + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, now + 7.4);
        osc.connect(filter); filter.connect(g); g.connect(this.musicGain);
        osc.start(now); osc.stop(now + 7.6);
      });
    };
    playChord();
    this.musicTimer = setInterval(playChord, 7600);
  }
}

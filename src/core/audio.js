// ─────────────────────────────────────────────────────────────
//  PixCity · audio 100 % procédural (WebAudio) — aucun fichier
// ─────────────────────────────────────────────────────────────
export const Audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  ready: false,
  enabled: true,
  musicOn: true,
  _musicTimer: null,
  _step: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.ready = true;
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setEnabled(on) {
    this.enabled = on;
    if (this.ready) this.master.gain.value = on ? 0.75 : 0;
  },

  /** Note simple : type = 'square' | 'triangle' | 'sawtooth' | 'sine' */
  tone(freq, dur, type = 'square', vol = 0.3, when = 0, glide = 0) {
    if (!this.enabled) return;
    this.resume();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return osc;
  },

  noise(dur = 0.12, vol = 0.25, hp = 800) {
    if (!this.enabled) return;
    this.resume();
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start();
  },

  play(name, opt = {}) {
    if (!this.enabled) return;
    switch (name) {
      case 'tap':
        this.tone(520 + (opt.pitch || 0) * 30, 0.055, 'square', 0.16, 0, 1.6);
        break;
      case 'buy':
        this.tone(392, 0.08, 'square', 0.22);
        this.tone(587, 0.11, 'square', 0.2, 0.06);
        break;
      case 'buy10':
        this.tone(392, 0.07, 'square', 0.2);
        this.tone(587, 0.07, 'square', 0.2, 0.05);
        this.tone(784, 0.12, 'square', 0.2, 0.1);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'square', 0.22, i * 0.07));
        break;
      case 'coin':
        this.tone(988, 0.06, 'square', 0.18, 0, 1.5);
        this.tone(1319, 0.09, 'square', 0.14, 0.05);
        break;
      case 'gem':
        this.tone(1568, 0.09, 'triangle', 0.24);
        this.tone(2093, 0.16, 'triangle', 0.2, 0.07);
        break;
      case 'coin_big':
        [1046, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, 'square', 0.2, i * 0.05));
        break;
      case 'error':
        this.tone(160, 0.14, 'sawtooth', 0.22, 0, 0.7);
        break;
      case 'click':
        this.tone(880, 0.03, 'square', 0.12);
        break;
      case 'close':
        this.tone(440, 0.06, 'square', 0.14, 0, 0.5);
        break;
      case 'whoosh':
        this.noise(0.22, 0.16, 500);
        break;
      case 'prestige':
        [392, 523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.11));
        this.noise(0.9, 0.1, 300);
        break;
      case 'cash':
        this.tone(1319, 0.06, 'square', 0.2);
        this.tone(1046, 0.06, 'square', 0.2, 0.07);
        this.tone(1568, 0.2, 'square', 0.22, 0.14);
        this.noise(0.3, 0.08, 2000);
        break;
      case 'ad':
        [659, 784, 988].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.18, i * 0.08));
        break;
      case 'boost':
        this.tone(300, 0.35, 'sawtooth', 0.2, 0, 3);
        this.tone(600, 0.3, 'square', 0.14, 0.1, 2);
        break;
      case 'fail':
        this.tone(220, 0.2, 'square', 0.2, 0, 0.5);
        break;
      default:
        break;
    }
  },

  // ── musique : petite boucle chiptune ───────────────────────
  BPM: 104,
  CHORDS: [
    [261.63, 329.63, 392.0],   // C
    [220.0, 261.63, 329.63],   // Am
    [174.61, 220.0, 261.63],   // F
    [196.0, 246.94, 293.66],   // G
  ],
  MEL: [523, 0, 659, 784, 0, 659, 523, 0, 587, 0, 698, 880, 0, 784, 659, 0],

  startMusic() {
    this.init();
    if (!this.ready || this._musicTimer || !this.musicOn) return;
    const beat = 60 / this.BPM / 2;
    this._step = 0;
    this._musicTimer = setInterval(() => {
      if (!this.enabled || !this.musicOn) return;
      const s = this._step++;
      const bar = Math.floor(s / 8) % this.CHORDS.length;
      const chord = this.CHORDS[bar];
      const t = this.ctx.currentTime;
      // basse
      if (s % 4 === 0) this.musicTone(chord[0] / 2, beat * 3.4, 'triangle', 0.5, t);
      // arpège d'accompagnement
      if (s % 2 === 0) this.musicTone(chord[s % 3], beat * 1.6, 'square', 0.16, t + 0.01);
      // mélodie
      const m = this.MEL[s % this.MEL.length];
      if (m) this.musicTone(m, beat * 1.4, 'square', 0.22, t + 0.02);
      // percussion
      if (s % 4 === 2) this.musicNoise(0.05, 0.1, 4000);
      if (s % 8 === 0) {
        this.musicTone(60, 0.16, 'sine', 0.5, t);
        this.musicNoise(0.08, 0.12, 200);
      }
    }, beat * 1000);
  },

  musicTone(freq, dur, type, vol, when) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  },

  musicNoise(dur, vol, hp) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start();
  },

  toggleMusic(on) {
    this.musicOn = on;
    if (!on) { clearInterval(this._musicTimer); this._musicTimer = null; }
    else this.startMusic();
  },
};

/** Vibration légère (mobile) */
export function haptic(ms = 12) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

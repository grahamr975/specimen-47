'use strict';
// Tiny synth for sound effects + a droning ambience — no audio files needed.

// How loud creature voices are, over all (they sit just under combat sounds).
const VOICE_GAIN = 7;

const Sfx = {
  ctx: null,
  master: null,
  muted: false,
  lastPlayed: {},

  init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        this.startAmbience();
      } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ctx) Music.start();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  },

  // Low, detuned drone that slowly swells — the sound of the lab.
  startAmbience() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.02;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    for (const f of [55, 58.3, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start();
    }
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    lp.connect(g); g.connect(this.master);
  },

  tone(freq, dur, type = 'square', vol = 0.05, slideTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  // White noise, optionally low-passed (lower cutoff = wetter, duller).
  noise(dur, vol = 0.08, cutoff = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = vol;
    let node = src;
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    src.start(t);
  },

  later(ms, fn) { setTimeout(fn, ms); },

  // Creatures making their noises, for ambience: quiet, and quieter the further away (v: 0..1).
  voice(kind, v = 1) {
    if (!this.ctx || v <= 0) return;
    v *= VOICE_GAIN;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (kind) {
      case 'squeak': { // a rat: one or two thin squeaks
        const f = r(2100, 2700);
        this.tone(f, 0.1, 'triangle', 0.018 * v, f * 1.25);
        if (Math.random() < 0.6) this.later(120, () => this.tone(f * 1.1, 0.09, 'triangle', 0.014 * v, f * 0.9));
        break;
      }
      case 'croak': { // a toad: a low, throaty ribbit
        const f = r(85, 105);
        [0, 70, 140].forEach((d, i) => this.later(d, () => { this.tone(f - i * 4, 0.07, 'square', 0.02 * v, f * 0.8); this.noise(0.05, 0.012 * v, 400); }));
        break;
      }
      case 'chitter': // a grub, a crawler: dry clicks
        for (let i = 0; i < 7; i++) this.later(i * r(22, 36), () => this.tone(r(1800, 2800), 0.022, 'square', 0.009 * v));
        break;
      case 'gurgle': // cells, sacs, bloated things: wet bubbling
        this.noise(0.3, 0.025 * v, 320);
        this.tone(r(120, 160), 0.3, 'sine', 0.025 * v, 70);
        for (let i = 0; i < 3; i++) this.later(60 + i * r(50, 90), () => this.tone(r(380, 650), 0.03, 'sine', 0.012 * v, 250));
        break;
      case 'moan': // the frozen dead: a long low groan
        this.tone(r(115, 140), 0.9, 'sawtooth', 0.011 * v, r(85, 100));
        this.noise(0.7, 0.008 * v, 500);
        break;
      case 'whimper': // a clone: a small, high whimper
        this.tone(r(650, 760), 0.18, 'sine', 0.014 * v, 480);
        this.later(200, () => this.tone(r(560, 640), 0.22, 'sine', 0.01 * v, 420));
        break;
      case 'hiss': this.noise(0.35, 0.018 * v, 3200); break; // a mimic, waiting
      case 'rattle': [0, 35, 70, 100].forEach(d => this.later(d, () => this.tone(r(1100, 1500), 0.015, 'square', 0.008 * v))); break; // urchin spines
      case 'beep': this.tone(r(1100, 1400), 0.04, 'square', 0.009 * v); this.later(70, () => this.tone(r(800, 1000), 0.05, 'square', 0.008 * v)); break; // a drone
      case 'radio': this.noise(0.18, 0.02 * v, 3200); this.later(60, () => this.tone(r(900, 1100), 0.04, 'square', 0.006 * v)); break; // static, a click
    }
  },

  play(name) {
    if (!this.ctx) return;
    // Don't stack the same sound many times in one instant.
    const now = performance.now();
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < 40) return;
    this.lastPlayed[name] = now;
    switch (name) {
      case 'shoot': this.noise(0.05, 0.06, 3500); this.tone(520, 0.05, 'triangle', 0.035, 220); break; // dry bony click
      case 'spine': this.noise(0.04, 0.05, 3000); this.tone(600, 0.03, 'square', 0.015, 300); break;
      case 'silkcut': this.noise(0.05, 0.025, 5200); this.tone(1700, 0.05, 'triangle', 0.012, 1100); break; // a thin wire snicking through meat
      case 'hit': this.noise(0.08, 0.09, 700); this.tone(110, 0.06, 'sine', 0.06, 60); break;
      case 'kill': this.noise(0.3, 0.14, 600); this.tone(90, 0.25, 'sawtooth', 0.05, 35); break;
      case 'clank': this.noise(0.2, 0.08, 2500); this.tone(160, 0.2, 'square', 0.03, 80); break;
      case 'hurt': this.tone(220, 0.35, 'sawtooth', 0.07, 50); this.noise(0.25, 0.12, 900); break;
      case 'dash': this.noise(0.14, 0.06, 1200); break;
      case 'pickup': this.tone(330, 0.25, 'sine', 0.06); this.later(90, () => this.tone(311, 0.3, 'sine', 0.05)); break;
      case 'absorb':
        this.noise(0.3, 0.08, 500);
        [220, 196, 165, 147].forEach((f, i) => this.later(i * 80, () => this.tone(f, 0.14, 'triangle', 0.06)));
        break;
      case 'splice': // dissonant, unsettling
        this.noise(0.6, 0.1, 400);
        for (const f of [110, 116.5, 164.8]) this.tone(f, 1.0, 'sawtooth', 0.04, f * 0.7);
        break;
      case 'door': this.noise(0.25, 0.1, 400); this.tone(70, 0.3, 'square', 0.04, 45); break;
      case 'enemyShot': this.tone(260, 0.1, 'sawtooth', 0.025, 140); break;
      case 'splat': this.noise(0.18, 0.08, 500); break;
      case 'scrawl': // one letter of a whisper being written: a dry scratch, a wet tick, now and then a breath
        this.noise(0.035, 0.035, 1400 + Math.random() * 1400);
        this.tone(95 + Math.random() * 45, 0.05, 'triangle', 0.018, 60);
        if (Math.random() < 0.15) this.tone(58 + Math.random() * 6, 0.3, 'sawtooth', 0.008, 45);
        break;
      case 'descend': [196, 185, 165, 147, 110].forEach((f, i) => this.later(i * 140, () => this.tone(f, 0.3, 'sine', 0.07))); break;
      case 'die': this.tone(200, 1.4, 'sawtooth', 0.07, 30); this.noise(0.8, 0.12, 500); break;
      case 'heartbeat':
        this.tone(62, 0.13, 'sine', 0.35, 40);
        this.later(150, () => this.tone(55, 0.13, 'sine', 0.25, 36));
        break;
      case 'flicker': this.tone(120, 0.06, 'square', 0.015); this.noise(0.05, 0.03, 4000); break;
      case 'chomp': this.noise(0.07, 0.1, 500); this.tone(150, 0.07, 'square', 0.03, 70); break;
      case 'gulp': this.tone(220, 0.22, 'sine', 0.12, 80); this.noise(0.15, 0.06, 300); break;
      case 'bite': this.noise(0.05, 0.1, 1600); this.tone(320, 0.05, 'square', 0.04, 140); break;
      case 'whip': this.noise(0.09, 0.07, 5000); this.tone(900, 0.08, 'triangle', 0.03, 200); break;
      case 'ram': this.noise(0.12, 0.14, 800); this.tone(120, 0.12, 'sawtooth', 0.06, 50); break;
      case 'slam': this.noise(0.35, 0.18, 300); this.tone(80, 0.4, 'sine', 0.3, 28); break;
      case 'shield': this.noise(0.2, 0.1, 2500); this.tone(500, 0.2, 'square', 0.04, 180); break;
      case 'shieldUp': this.tone(300, 0.15, 'triangle', 0.04, 450); break;
      case 'evolve':
        this.noise(0.5, 0.08, 400);
        [147, 156, 220, 233].forEach((f, i) => this.later(i * 90, () => this.tone(f, 0.5, 'sawtooth', 0.03, f * 1.5)));
        break;
      case 'scream': this.tone(900, 0.4, 'sawtooth', 0.06, 200); this.tone(620, 0.4, 'square', 0.03, 140); this.noise(0.3, 0.08, 3000); break;
      case 'hatch': this.noise(0.15, 0.08, 1200); [600, 800, 700].forEach((f, i) => this.later(i * 50, () => this.tone(f, 0.05, 'square', 0.02))); break;
      case 'beam': this.tone(180 + Math.random() * 40, 0.08, 'sawtooth', 0.015); break;
      case 'spray': this.noise(0.06, 0.03, 2500); break; // flamethrower hiss
      case 'charge': this.tone(200 + Math.random() * 30, 0.06, 'triangle', 0.02, 320); break;
      case 'chargeFull': this.tone(880, 0.12, 'square', 0.04); this.later(60, () => this.tone(1320, 0.1, 'square', 0.03)); break;
      case 'blast': this.noise(0.3, 0.16, 900); this.tone(90, 0.3, 'sine', 0.3, 35); break;
      // Movement: quiet, so they sit under everything else.
      case 'skitter': this.tone(1700 + Math.random() * 500, 0.015, 'square', 0.006); break;
      case 'squelch': this.noise(0.09, 0.035, 420); break;
      case 'thump': this.tone(70, 0.12, 'sine', 0.12, 40); this.noise(0.06, 0.04, 300); break;
      case 'thudsoft': this.tone(90, 0.08, 'sine', 0.05, 60); break;
      case 'clack': this.tone(900, 0.03, 'triangle', 0.02, 500); this.noise(0.02, 0.02, 3000); break;
      case 'creak': this.tone(140, 0.3, 'sawtooth', 0.012, 95); break;
      case 'buzz': this.tone(150 + Math.random() * 25, 0.06, 'sawtooth', 0.006); break;
      case 'scrape': this.noise(0.06, 0.025, 2200); break;
      case 'rattle': [0, 40, 75].forEach(d => this.later(d, () => this.tone(1200 + Math.random() * 300, 0.015, 'square', 0.006))); break;
      case 'secondHeart':
        [0, 300, 600].forEach(d => this.later(d, () => { this.tone(62, 0.15, 'sine', 0.45, 38); this.noise(0.1, 0.05, 300); }));
        break;
    }
  },
};

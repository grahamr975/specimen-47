'use strict';
// ---------------------------------------------------------------------------
// Procedural music. A slow, unsettling loop in D Phrygian:
//   - detuned pads that swell over each chord
//   - a music-box melody with echo, sometimes slipping a semitone "wrong"
//   - a low, heartbeat-like bass pulse
//   - a COMBAT layer (thumps, metallic clanks, a tense ostinato) that fades
//     in while a room is locked down.
// Everything is synthesized with Web Audio; no audio files.
// ---------------------------------------------------------------------------

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

const Music = {
  started: false,
  bpm: 66,
  step: 0,
  nextTime: 0,
  combatLevel: 0,
  combatTarget: 0,
  volumeTarget: 1,

  // Each chord lasts 2 bars (32 sixteenth-steps). Root is for the bass.
  chords: [
    { root: 38, notes: [50, 53, 57] }, // D minor
    { root: 39, notes: [51, 55, 58] }, // Eb major (the Phrygian "dread" chord)
    { root: 43, notes: [55, 58, 62] }, // G minor
    { root: 45, notes: [57, 61, 64] }, // A major (unresolved tension)
  ],

  start() {
    if (this.started || !Sfx.ctx) return;
    const c = Sfx.ctx;
    this.started = true;

    this.out = c.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(Sfx.master);

    // Echo for the music box.
    this.delay = c.createDelay(2);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = c.createGain(); fb.gain.value = 0.4;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1800;
    this.delay.connect(damp); damp.connect(fb); fb.connect(this.delay);
    this.delay.connect(this.out);

    this.combat = c.createGain();
    this.combat.gain.value = 0;
    this.combat.connect(this.out);

    // Shared noise buffer for percussion.
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.nextTime = c.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
  },

  // Called from the game loop: how intense should the music be right now?
  setMood(combat, volume = 1) {
    this.combatTarget = combat ? 1 : 0;
    this.volumeTarget = volume;
  },

  schedule() {
    const c = Sfx.ctx;
    if (c.state !== 'running') return;
    this.combatLevel += (this.combatTarget - this.combatLevel) * 0.04;
    this.combat.gain.setTargetAtTime(this.combatLevel, c.currentTime, 0.3);
    this.out.gain.setTargetAtTime(0.55 * this.volumeTarget, c.currentTime, 0.5);

    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },

  playStep(step, t, stepDur) {
    const chord = this.chords[Math.floor(step / 32) % this.chords.length];
    const inChord = step % 32;
    const inBar = step % 16;

    // Pad: swell in at the start of each chord.
    if (inChord === 0) {
      for (const n of chord.notes) this.pad(midiHz(n), t, stepDur * 32);
    }

    // Bass pulse, like a slow heartbeat.
    if (inBar === 0) this.bass(midiHz(chord.root - 12), t, 0.16);
    if (inBar === 3) this.bass(midiHz(chord.root - 12), t, 0.09);

    // Music box: sparse, high, sometimes a semitone off.
    if (step % 2 === 0 && Math.random() < (inBar === 0 ? 0.6 : 0.22)) {
      let n = pick(chord.notes) + 24;
      if (Math.random() < 0.15) n += 1; // the wrong note
      this.bell(midiHz(n), t);
    }

    // --- Combat layer ---
    if (inBar % 4 === 0) this.thump(t, 0.35);
    if (inBar === 6 || inBar === 10) this.thump(t, 0.2);
    if (inBar % 8 === 4) this.clank(t);
    if (step % 2 === 0) {
      const pattern = [0, 0, 1, 0, 0, 0, 1, 3]; // root, root, b2...
      const n = chord.root + 12 + pattern[(step / 2) % 8];
      this.ostinato(midiHz(n), t, stepDur * 1.6);
    }
  },

  pad(f, t, dur) {
    const c = Sfx.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const detune of [-7, 6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(this.out);
  },

  bass(f, t, vol) {
    const c = Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.55);
  },

  bell(f, t) {
    const c = Sfx.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    for (const [mult, vol] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) { // inharmonic = music box
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = f * mult; og.gain.value = vol;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 1.7);
    }
    g.connect(this.out);
    g.connect(this.delay);
  },

  thump(t, vol) {
    const c = Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.combat);
    o.start(t); o.stop(t + 0.3);
  },

  clank(t) {
    const c = Sfx.ctx;
    const src = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter();
    src.buffer = this.noiseBuf;
    hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 6;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(hp); hp.connect(g); g.connect(this.combat);
    src.start(t, Math.random() * 0.5, 0.2);
  },

  ostinato(f, t, dur) {
    const c = Sfx.ctx;
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 380;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.combat);
    o.start(t); o.stop(t + dur + 0.05);
  },
};

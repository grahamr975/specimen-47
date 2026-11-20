'use strict';
// ---------------------------------------------------------------------------
// Procedural music: a little sequencer and synth, all Web Audio, no files.
//
// Every floor has its own track and every boss its own song (SONGS below).
// A song is data: tempo, key and scale, a chord per bar, a bass pattern, drum
// patterns and a lead melody, written as scale degrees.
// It plays in three layers:
//   all    - pad, arpeggio, hats: always on (the floor's pulse while you explore)
//   calm   - the light bass and kick, fading out as a fight starts
//   combat - full drums, the driving bass and the lead, in while a room is locked
// Boss songs are always full. Past floor 5 the tracks come back transposed up and faster.
// Songs change on a bar line, with a crash.
// ---------------------------------------------------------------------------

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

const SCALES = {
  aeolian:  [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],     // harmonic minor
  phrydom:  [0, 1, 4, 5, 7, 8, 10],     // phrygian dominant
  dim:      [0, 2, 3, 5, 6, 8, 9, 11],  // diminished (8 notes)
};

// Drum patterns, one bar of 16ths. k kick, s snare, h hat, o open hat, c metal clank, t tom.
const DRUMS = {
  drive:   { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  four:    { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', o: '..x...x...x...x.' },
  half:    { k: 'x.........x.....', s: '........x.......', h: 'x...x...x...x...', t: '............x.x.' },
  frantic: { k: 'x.x.x.x.x.x.x.x.', s: '....x..x....x.x.', h: 'xxxxxxxxxxxxxxxx' },
  march:   { k: 'x...x...x...x...', s: '..x.x.x...xxx.x.', h: 'x.x.x.x.x.x.x.x.' },
  factory: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx', c: '..x.....x.....x.' },
  heart:   { k: 'x..x........x..x', s: '........x.......', h: '..x...x...x...x.' },
  // explore: just a pulse
  pulse:   { k: 'x.......x.......', h: '..x...x...x...x.' },
  tick:    { h: 'x.x.x.x.x.x.x.x.' },
  sparse:  { k: 'x...............', h: '....x.......x...' },
};

// Bass patterns, one bar: 1 chord root, 3 third, 5 fifth, 8 octave, 7 seventh, b the scale step below, . rest.
const BASS = {
  eighths: '1.1.1.1.1.1.1.1.',
  gallop:  '1.18.11.1.18.15.',
  pump:    '1..1..1.1..1..8.',
  hold:    '1.......5.......',
  frantic: '1181118111811181',
  walk:    '1.1.3.3.5.5.8.5.',
  stomp:   '1...1...b...1.8.',
  heart:   '1..1........1..1',
};

// A lead melody: one string per bar, 16 tokens: a scale degree (0 = tonic, 7 = an
// octave up in a 7-note scale, negatives go down), '.' rest, '-' hold the last note.
const SONGS = {
  title: { // slow dread with a pulse under it
    bpm: 84, root: 50, scale: 'phrygian', prog: [0, 1, 5, 6],
    drums: 'sparse', exDrums: 'sparse', bass: 'heart', exBass: 'heart', arp: null, pad: true,
    lead: ['7 . . . 6 . . . 4 . . . 3 . . .', '8 . . . 7 . . . 5 . . . 4 . . .', '7 . . . 5 . . . 4 . . . 2 . . .', '6 . . . 5 . . . 4 . 1 . 0 . . .'],
    leadInst: 'bell', alwaysLead: true,
  },
  floor0: { // PETRI LABS: sickly synth-pop gone wrong
    bpm: 124, root: 52, scale: 'aeolian', prog: [0, 0, 5, 6],
    drums: 'drive', exDrums: 'pulse', bass: 'gallop', exBass: 'eighths', arp: '0121', arpInst: 'pluck', pad: true,
    lead: ['4 . 4 . 3 . 4 . 7 . - . 4 . 3 .', '2 . 2 . 0 . 2 . 3 . - . 2 . 1 .', '2 . 0 . 2 . 5 . 4 . - . 2 . 0 .', '1 . 1 . 3 . 6 . 5 . 4 . 3 . 1 .'],
    leadInst: 'square', bassInst: 'saw',
  },
  floor1: { // CRYO WING: cold bells over a half-time stomp
    bpm: 116, root: 50, scale: 'aeolian', prog: [0, 3, 5, 4],
    drums: 'half', exDrums: 'tick', bass: 'pump', exBass: 'hold', arp: '0212', arpInst: 'bell', pad: true,
    lead: ['7 . . . 4 . . . 5 . . . 2 . . .', '3 . . . 5 . . . 7 . . . 5 . . .', '2 . . . 0 . . . 2 . 4 . 5 . . .', '6 . . . 4 . . . 1 . . . 4 . . .'],
    leadInst: 'glass', bassInst: 'square',
  },
  floor2: { // BIO-WEAPONS: industrial, distorted, clanking
    bpm: 138, root: 45, scale: 'phrydom', prog: [0, 0, 1, 0],
    drums: 'factory', exDrums: 'pulse', bass: 'frantic', exBass: 'pump', arp: null, pad: false, drive: true,
    lead: ['0 0 1 0 . 0 1 0 4 . 3 . 1 . 0 .', '0 0 1 0 . 0 1 0 5 . 4 . 3 . 1 .', '1 1 2 1 . 1 2 1 5 . 4 . 2 . 1 .', '0 . 7 . 6 . 5 . 4 . 3 . 1 . 0 .'],
    leadInst: 'saw', bassInst: 'saw',
  },
  floor3: { // GENE BANK: a crooked organ, arpeggios that won't sit still
    bpm: 128, root: 54, scale: 'harmonic', prog: [0, 5, 3, 4],
    drums: 'four', exDrums: 'tick', bass: 'walk', exBass: 'hold', arp: '0120', arpInst: 'organ', pad: true,
    lead: ['0 . 2 4 7 . 4 2 0 . 2 4 6 . 4 .', '5 . 7 9 12 . 9 7 5 . 4 2 0 . . .', '3 . 5 7 10 . 7 5 3 . 2 0 -1 . . .', '4 . 6 8 11 . 8 6 4 . . . 6 . . .'],
    leadInst: 'organ', bassInst: 'fm',
  },
  floor4: { // DIRECTOR'S WING: a cold, military march
    bpm: 146, root: 48, scale: 'harmonic', prog: [0, 0, 3, 4],
    drums: 'march', exDrums: 'pulse', bass: 'eighths', exBass: 'pump', arp: '0102', arpInst: 'pluck', pad: true, drive: true,
    lead: ['0 . . 0 2 . 4 . 7 . - . 6 . 4 .', '4 . . 4 5 . 4 . 2 . - . 1 . 2 .', '3 . . 3 5 . 7 . 10 . - . 9 . 7 .', '6 . - . 4 . - . 6 . 7 . 8 . 6 .'],
    leadInst: 'saw', bassInst: 'saw',
  },
  // --- Bosses ---
  mother: { // a womb with a heartbeat: music box and pulsing flesh
    bpm: 132, root: 47, scale: 'phrygian', prog: [0, 1, 0, 6], boss: true,
    drums: 'heart', bass: 'heart', arp: '0122', arpInst: 'bell', pad: true,
    lead: ['7 . 6 . 7 . 4 . 5 . 4 . 3 . 1 .', '1 . 2 . 3 . 1 . 0 . - . - . . .', '7 . 8 . 7 . 4 . 3 . 4 . 5 . 7 .', '6 . - . 5 . - . 3 . - . 1 . - .'],
    leadInst: 'bell', bassInst: 'fm', lead2: 'square',
  },
  colossus: { // huge, slow, crushing
    bpm: 96, root: 41, scale: 'aeolian', prog: [0, 5, 2, 6], boss: true,
    drums: 'half', bass: 'stomp', arp: '0101', arpInst: 'glass', pad: true, drive: true,
    lead: ['7 - - - - - 4 - 5 - - - 4 - 2 -', '5 - - - - - 4 - 2 - - - 0 - - -', '4 - - - - - 2 - 4 - - - 6 - 7 -', '8 - - - 7 - - - 6 - - - 4 - - -'],
    leadInst: 'saw', bassInst: 'saw',
  },
  biotank: { // SPECIMEN ZERO: frantic, unstable, screaming
    bpm: 152, root: 43, scale: 'phrydom', prog: [0, 1, 0, 6], boss: true,
    drums: 'frantic', bass: 'frantic', arp: null, pad: false, drive: true,
    lead: ['0 1 0 4 0 1 0 5 0 1 0 4 3 1 0 .', '0 1 0 4 0 1 0 5 7 . 5 . 4 . 1 .', '1 2 1 5 1 2 1 6 1 2 1 5 4 2 1 .', '7 6 5 4 3 1 0 -1 0 . 0 . 7 . . .'],
    leadInst: 'scream', bassInst: 'saw',
  },
  archive: { // every sample at once: glitchy, diminished, never resolving
    bpm: 140, root: 51, scale: 'dim', prog: [0, 2, 4, 6], boss: true,
    drums: 'factory', bass: 'gallop', arp: '0123', arpInst: 'glass', pad: true,
    lead: ['0 2 4 6 8 6 4 2 1 3 5 7 9 7 5 3', '0 . 4 . 8 . 4 . 2 . 6 . 10 . 6 .', '8 7 6 5 4 3 2 1 0 . . . 4 . . .', '6 . 7 . 8 . 9 . 10 . 11 . 12 . . .'],
    leadInst: 'organ', bassInst: 'fm',
  },
  director: { // the man who made you: an organ, a march, everything at once
    bpm: 158, root: 48, scale: 'harmonic', prog: [0, 5, 3, 4], boss: true,
    drums: 'march', bass: 'gallop', arp: '0121', arpInst: 'organ', pad: true, drive: true,
    lead: ['7 . 7 . 6 . 7 . 9 . 7 . 6 . 4 .', '5 . 5 . 4 . 5 . 7 . 5 . 4 . 2 .', '3 . 3 . 2 . 3 . 5 . 3 . 2 . 0 .', '6 . 4 . 6 . 7 . 8 . 9 . 10 . 11 .'],
    leadInst: 'saw', bassInst: 'saw', lead2: 'organ',
  },
};

const Music = {
  started: false,
  step: 0,
  nextTime: 0,
  combatLevel: 0,
  combatTarget: 0,
  volumeTarget: 1,
  song: null, songId: null, pending: null,

  start() {
    if (this.started || !Sfx.ctx) return;
    this.started = true;
    this.build(Sfx.ctx, Sfx.master);
    if (!this.song) this.use('title', 0);
    this.nextTime = Sfx.ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
  },

  // The mixer: three layer buses into a compressor, a shared echo and a drive for the bass.
  build(c, dest) {
    this.c = c;
    this.out = c.createGain(); this.out.gain.value = 0.5;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15;
    comp.connect(this.out); this.out.connect(dest);
    this.bus = {};
    for (const k of ['all', 'calm', 'combat']) { this.bus[k] = c.createGain(); this.bus[k].connect(comp); }
    this.bus.combat.gain.value = 0;
    this.delay = c.createDelay(2);
    const fb = c.createGain(); fb.gain.value = 0.35;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
    this.delay.connect(damp); damp.connect(fb); fb.connect(this.delay);
    const wet = c.createGain(); wet.gain.value = 0.5; this.delay.connect(wet); wet.connect(comp);
    this.drive = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3.5); }
    this.drive.curve = curve;
    this.driveOut = c.createGain(); this.driveOut.gain.value = 0.45;
    this.drive.connect(this.driveOut); this.driveOut.connect(this.bus.combat);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  // Called from the game loop: how intense should the music be right now?
  setMood(combat, volume = 1) {
    this.combatTarget = combat ? 1 : 0;
    this.volumeTarget = volume;
  },

  // Which song (an id in SONGS) and how many times you've looped the floors (key and tempo climb).
  setSong(id, loop = 0) {
    const key = id + '@' + loop;
    if (key === this.songKey || (this.pending && this.pending.key === key)) return;
    if (!this.song) this.use(id, loop); else this.pending = { id, loop, key };
  },

  use(id, loop) {
    const s = SONGS[id] || SONGS.title;
    this.song = Music.compile(s, loop);
    this.songId = id; this.songKey = id + '@' + loop;
    this.step = 0;
    if (this.delay) this.delay.delayTime.value = (60 / this.song.bpm) * 0.75;
  },

  // Parse a song's strings once.
  compile(s, loop = 0) {
    const scale = SCALES[s.scale];
    const lead = s.lead.map(bar => {
      const tk = bar.trim().split(/\s+/);
      if (tk.length !== 16) throw new Error('lead bar needs 16 steps: ' + bar);
      return tk.map(t => t === '.' ? null : t === '-' ? '-' : +t);
    });
    return Object.assign({}, s, { scaleArr: scale, leadBars: lead, root: s.root + loop, bpm: s.bpm + loop * 6 });
  },

  // A scale degree (any octave) to a MIDI note.
  note(song, deg) {
    const sc = song.scaleArr, n = sc.length, o = Math.floor(deg / n);
    return song.root + o * 12 + sc[((deg % n) + n) % n];
  },

  schedule() {
    const c = Sfx.ctx;
    if (!c || c.state !== 'running') return;
    const target = this.song && this.song.boss ? 1 : this.combatTarget;
    this.combatLevel += (target - this.combatLevel) * 0.05;
    this.bus.combat.gain.setTargetAtTime(this.combatLevel, c.currentTime, 0.25);
    this.bus.calm.gain.setTargetAtTime(1 - this.combatLevel, c.currentTime, 0.25);
    this.out.gain.setTargetAtTime(0.5 * this.volumeTarget, c.currentTime, 0.5);
    while (this.nextTime < c.currentTime + 0.15) {
      if (this.pending && this.step % 16 === 0) { // change songs on a bar line
        const p = this.pending; this.pending = null;
        this.use(p.id, p.loop);
        this.crash(this.nextTime);
      }
      const stepDur = 60 / this.song.bpm / 4;
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },

  playStep(step, t, sd) {
    const S = this.song, bar = Math.floor(step / 16), i = step % 16;
    const deg = S.prog[bar % S.prog.length];
    const chord = [deg, deg + 2, deg + 4].map(d => this.note(S, d));
    const B = this.bus;
    // Pad: a new chord every bar.
    if (S.pad && i === 0) for (const n of chord) this.pad(midiHz(n), t, sd * 16, B.all);
    // Arpeggio: chord tones an octave up, every 8th (16ths in a fight).
    if (S.arp && (i % 2 === 0 || this.combatLevel > 0.5)) {
      const k = +S.arp[(i >> (this.combatLevel > 0.5 ? 0 : 1)) % S.arp.length];
      this.voice(S.arpInst, midiHz((k < 3 ? chord[k] : chord[0] + 12) + 12), t, sd * 1.5, 0.028, B.all, true); // (3: the root an octave up)
    }
    // Bass: light while exploring, driving in a fight.
    const bassAt = (pat, bus, vol) => {
      const ch = BASS[pat][i];
      if (ch === '.') return;
      const off = { 1: 0, 3: 2, 5: 4, 7: 6, 8: 7, b: -1 }[ch];
      const d = deg + (off === 7 ? 0 : off);
      let n = this.note(S, d) - 12;
      while (n > 47) n -= 12; while (n < 28) n += 12; // keep it low but audible
      if (off === 7) n += 12;
      this.bass(S.bassInst || 'saw', midiHz(n), t, sd * 1.8, vol, bus);
    };
    if (S.exBass) bassAt(S.exBass, B.calm, 0.12);
    bassAt(S.bass, S.drive ? this.drive : B.combat, S.drive ? 0.3 : 0.13);
    // Drums.
    const play = (pat, bus, vol) => {
      const D = DRUMS[pat]; if (!D) return;
      if (D.k && D.k[i] === 'x') this.kick(t, 0.55 * vol, bus);
      if (D.s && D.s[i] === 'x') this.snare(t, 0.22 * vol, bus);
      if (D.h && D.h[i] === 'x') this.hat(t, 0.05 * vol, 0.04, bus);
      if (D.o && D.o[i] === 'x') this.hat(t, 0.04 * vol, 0.18, bus);
      if (D.c && D.c[i] === 'x') this.clank(t, 0.16 * vol, bus);
      if (D.t && D.t[i] === 'x') this.tom(t, 0.3 * vol, bus);
    };
    if (S.exDrums) play(S.exDrums, B.calm, 0.8);
    play(S.drums, B.combat, 1);
    if (bar % 8 === 7 && i >= 12) this.snare(t, 0.1 + (i - 12) * 0.04, B.combat); // a fill into the next phrase
    // Lead.
    const L = S.leadBars[bar % S.leadBars.length], tok = L[i];
    if (tok !== null && tok !== '-') {
      let len = 1; while (i + len < 16 && L[i + len] === '-') len++;
      const f = midiHz(this.note(S, tok) + 12);
      const bus = S.alwaysLead ? B.all : B.combat;
      this.voice(S.leadInst, f, t, sd * len * 0.95, 0.06, bus);
      if (S.lead2) this.voice(S.lead2, f / 2, t, sd * len * 0.95, 0.03, bus);
    }
  },

  // --- Instruments -------------------------------------------------------------------
  env(t, dur, vol, attack = 0.005) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur));
    return g;
  },
  osc(type, f, t, dur, dest, detune = 0) {
    const o = this.c.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  },

  // A melodic voice. `echo`: also send it to the delay.
  voice(inst, f, t, dur, vol, bus, quiet) {
    const c = this.c;
    if (inst === 'bell' || inst === 'glass') { // inharmonic partials: music box / glass
      const g = this.env(t, inst === 'bell' ? 1.4 : 0.9, vol * 0.9);
      for (const [m, v] of inst === 'bell' ? [[1, 1], [2.76, 0.35], [5.4, 0.12]] : [[1, 1], [3.01, 0.4], [6.2, 0.2]]) {
        const og = c.createGain(); og.gain.value = v; og.connect(g);
        this.osc('sine', f * m, t, 1.5, og);
      }
      g.connect(bus); g.connect(this.delay);
      return;
    }
    if (inst === 'pluck') {
      const g = this.env(t, Math.min(0.25, dur + 0.1), vol), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.2);
      this.osc('square', f, t, 0.3, lp); lp.connect(g); g.connect(bus);
      if (!quiet) g.connect(this.delay);
      return;
    }
    if (inst === 'organ') {
      const g = this.env(t, dur, vol * 0.7, 0.01);
      for (const [m, v] of [[1, 1], [2, 0.5], [3, 0.3], [0.5, 0.4]]) { const og = c.createGain(); og.gain.value = v; og.connect(g); this.osc('sine', f * m, t, dur, og); }
      g.connect(bus); if (!quiet) g.connect(this.delay);
      return;
    }
    // square / saw / scream: a synth lead with vibrato
    const g = this.env(t, dur, vol, 0.008), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = inst === 'scream' ? 3800 : 2400; lp.Q.value = inst === 'scream' ? 6 : 1;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 6; lg.gain.value = inst === 'scream' ? 30 : 9;
    lfo.connect(lg); lfo.start(t + 0.08); lfo.stop(t + dur + 0.05);
    for (const det of inst === 'square' ? [0] : [-9, 9]) {
      const o = this.osc(inst === 'square' ? 'square' : 'sawtooth', f, t, dur, lp, det);
      lg.connect(o.detune);
      if (inst === 'scream') { o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
    }
    lp.connect(g); g.connect(bus); g.connect(this.delay);
  },

  bass(inst, f, t, dur, vol, bus) {
    const c = this.c, g = this.env(t, dur, vol), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(inst === 'fm' ? 900 : 1400, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    if (inst === 'fm') { // a growl: a sine bent by a sine
      const o = this.osc('sine', f, t, dur, lp), m = c.createOscillator(), mg = c.createGain();
      m.frequency.value = f * 2; mg.gain.value = f * 1.5; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.05);
    } else {
      this.osc(inst === 'square' ? 'square' : 'sawtooth', f, t, dur, lp, -6);
      this.osc(inst === 'square' ? 'square' : 'sawtooth', f, t, dur, lp, 6);
    }
    this.osc('sine', f, t, dur, g); // weight under the growl
    lp.connect(g); g.connect(bus);
  },

  pad(f, t, dur, bus) {
    const c = this.c, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.018, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const det of [-8, 7]) this.osc('sawtooth', f, t, dur, lp, det);
    lp.connect(g); g.connect(bus);
  },

  kick(t, vol, bus) {
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
  },
  noise(t, dur, vol, type, freq, q, bus) {
    const c = this.c, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  },
  snare(t, vol, bus) {
    this.noise(t, 0.16, vol, 'bandpass', 1900, 0.8, bus);
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.12);
  },
  hat(t, vol, dur, bus) { this.noise(t, dur, vol, 'highpass', 7000, 0, bus); },
  clank(t, vol, bus) { this.noise(t, 0.18, vol, 'bandpass', 2400, 7, bus); },
  crash(t) { if (this.bus) this.noise(t, 1.2, 0.08, 'highpass', 4000, 0, this.bus.all); },
  tom(t, vol, bus) {
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
  },
};

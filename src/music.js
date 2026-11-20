'use strict';
// ---------------------------------------------------------------------------
// Procedural music: a little sequencer and synth, all Web Audio, no files. Horror
// first: slow-ish tempos, phrygian and diminished keys, a grinding drone under
// everything, notes that slip a semitone wrong, and distant screeches.
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
// Sparse and heavy: industrial thuds and metal, not a dance beat.
const DRUMS = {
  creep:   { k: 'x.....x...x.....', s: '........x.......', c: '...........x....', h: '....x.......x...' },
  doom:    { k: 'x.......x.......', s: '........x.......', t: '......x.....x.x.', c: '..............x.' },
  factory: { k: 'x..x..x...x..x..', s: '....x.......x...', c: '..x...x...x...x.' },
  dirge:   { k: 'x...x...x...x...', s: '..........x.x...', t: '..x.............', h: 'x.......x.......' },
  heart:   { k: 'x..x........x..x', s: '........x.......', c: '......x.........' },
  frantic: { k: 'x.x.x..xx.x.x..x', s: '....x..x....x.xx', c: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.' },
  stagger: { k: 'x....x....x..x..', s: '....x.....x.....', c: '.x.....x.....x..', t: '..............xx' },
  // exploring: just a pulse under the dread
  pulse:   { k: 'x.......x.......' },
  tick:    { c: '....x.......x...' },
  sparse:  { k: 'x...............' },
};

// Bass patterns, one bar: 1 chord root, 3 third, 5 fifth, 8 octave, 7 seventh, b the scale step below, . rest.
const BASS = {
  heart:   '1..1........1..1',
  creep:   '1.....1.....b...',
  doom:    '1.......1...b...',
  pump:    '1..1..1.1..1..b.',
  stomp:   '1...1...b...1.8.',
  gallop:  '1.11.11.1.11.1b.',
  frantic: '1181118111b11181',
  hold:    '1...............',
};

// A lead melody: one string per bar, 16 tokens: a scale degree (0 = tonic, 7 = an
// octave up in a 7-note scale, negatives go down), '.' rest, '-' hold the last note.
// wrong: how often a note slips a semitone off. sting: chance per bar of a distant screech.
const SONGS = {
  title: { // slow dread with a pulse under it
    bpm: 72, root: 50, scale: 'phrygian', prog: [0, 1, 5, 1],
    drums: 'sparse', exDrums: 'sparse', bass: 'heart', exBass: 'heart', arp: null, pad: true,
    lead: ['7 . . . 6 . . . 4 . . . 3 . . .', '8 . . . 7 . . . 5 . . . 4 . . .', '7 . . . 5 . . . 4 . . . 1 . . .', '8 . . . 7 . . . 4 . 1 . 0 . . .'],
    leadInst: 'bell', alwaysLead: true, wrong: 0.15,
  },
  floor0: { // PETRI LABS: a nursery music box over something breathing
    bpm: 100, root: 52, scale: 'phrygian', prog: [0, 1, 0, 4],
    drums: 'creep', exDrums: 'pulse', bass: 'creep', exBass: 'heart', arp: '0102', arpInst: 'bell', pad: true,
    lead: ['4 - - - 5 - 4 - 1 - - - 0 - - -', '0 - - - 1 - 0 - -1 - - - . . . .', '4 - - - 5 - 7 - 8 - - - 7 - 5 -', '4 - - - 3 - 1 - 0 - - - . . . .'],
    leadInst: 'warble', bassInst: 'fm', wrong: 0.12, sting: 0.12,
  },
  floor1: { // CRYO WING: a frozen choir, glass, a slow heavy step
    bpm: 92, root: 50, scale: 'harmonic', prog: [0, 5, 3, 6],
    drums: 'doom', exDrums: 'tick', bass: 'doom', exBass: 'hold', arp: '0212', arpInst: 'glass', pad: true,
    lead: ['7 - - - - - - - 6 - - - 5 - - -', '4 - - - - - - - 3 - - - 1 - - -', '2 - - - - - - - 1 - - - 0 - - -', '6 - - - - - - - -1 - - - . . . .'],
    leadInst: 'choir', bassInst: 'saw', wrong: 0.08, sting: 0.1,
  },
  floor2: { // BIO-WEAPONS: machinery, distortion, a low grinding riff
    bpm: 112, root: 45, scale: 'phrydom', prog: [0, 0, 1, 0],
    drums: 'factory', exDrums: 'tick', bass: 'stomp', exBass: 'creep', arp: null, pad: false, drive: true,
    lead: ['0 . 0 1 0 . . . 0 . 0 1 4 . 3 .', '0 . 0 1 0 . . . 5 . 4 . 1 - - -', '1 . 1 2 1 . . . 1 . 1 2 5 . 4 .', '0 . -1 . 0 . 1 . 0 - - - . . . .'],
    leadInst: 'saw', bassInst: 'saw', leadOct: -12, wrong: 0.06, sting: 0.15,
  },
  floor3: { // GENE BANK: a detuned organ in a diminished scale that never settles
    bpm: 104, root: 54, scale: 'dim', prog: [0, 2, 4, 6],
    drums: 'stagger', exDrums: 'tick', bass: 'pump', exBass: 'hold', arp: '0120', arpInst: 'organ', pad: true,
    lead: ['0 - - 2 - - 4 - 6 - - 4 - - 2 -', '1 - - 3 - - 5 - 7 - - 5 - - 3 -', '0 - 4 - 8 - 4 - 1 - 5 - 9 - 5 -', '8 - - - 7 - - - 6 - - - 5 - - -'],
    leadInst: 'organ', bassInst: 'fm', wrong: 0.1, sting: 0.12,
  },
  floor4: { // DIRECTOR'S WING: a funeral march through clean white halls
    bpm: 116, root: 48, scale: 'harmonic', prog: [0, 5, 1, 4],
    drums: 'dirge', exDrums: 'pulse', bass: 'gallop', exBass: 'doom', arp: '0102', arpInst: 'glass', pad: true, drive: true,
    lead: ['0 - - - 0 - 1 - 2 - - - 1 - 0 -', '6 - - - -1 - - - 0 - - - . . . .', '4 - - - 4 - 5 - 6 - - - 5 - 4 -', '1 - - - 2 - 1 - 0 - - - -1 - - -'],
    leadInst: 'choir', lead2: 'saw', bassInst: 'saw', wrong: 0.06, sting: 0.1,
  },
  // --- Bosses ---
  mother: { // a womb: heartbeat, a lullaby gone wrong, something singing inside
    bpm: 108, root: 47, scale: 'phrygian', prog: [0, 1, 0, 6], boss: true,
    drums: 'heart', bass: 'heart', arp: '0122', arpInst: 'bell', pad: true,
    lead: ['7 - 8 - 7 - 4 - 5 - - - 4 - 1 -', '1 - 2 - 1 - 0 - 0 - - - . . . .', '7 - 8 - 10 - 8 - 7 - - - 5 - 4 -', '4 - 5 - 4 - 1 - 0 - - - . . . .'],
    leadInst: 'bell', lead2: 'choir', bassInst: 'fm', wrong: 0.2, sting: 0.2,
  },
  colossus: { // huge, slow, crushing: every step a landslide
    bpm: 80, root: 41, scale: 'phrygian', prog: [0, 1, 0, 1], boss: true,
    drums: 'doom', bass: 'stomp', arp: '0101', arpInst: 'glass', pad: true, drive: true,
    lead: ['0 - - - - - - - 1 - - - - - - -', '0 - - - - - - - -2 - - - -1 - - -', '4 - - - - - - - 5 - - - 4 - - -', '1 - - - - - - - 0 - - - - - - -'],
    leadInst: 'choir', lead2: 'saw', bassInst: 'saw', wrong: 0.05, sting: 0.25,
  },
  biotank: { // SPECIMEN ZERO: unstable, screaming, the fastest thing in the lab
    bpm: 132, root: 43, scale: 'phrydom', prog: [0, 1, 0, 1], boss: true,
    drums: 'frantic', bass: 'frantic', arp: null, pad: false, drive: true,
    lead: ['0 1 0 . 0 1 0 . 4 . 5 . 4 . 1 .', '0 1 0 . 0 1 0 . 7 - 6 - 5 - 4 -', '1 2 1 . 1 2 1 . 5 . 6 . 5 . 2 .', '0 . -1 . 0 . 1 . 0 - - - - - - -'],
    leadInst: 'scream', bassInst: 'saw', wrong: 0.1, sting: 0.35,
  },
  archive: { // every sample at once: glitching arpeggios that never resolve
    bpm: 116, root: 51, scale: 'dim', prog: [0, 2, 4, 6], boss: true,
    drums: 'stagger', bass: 'pump', arp: '0123', arpInst: 'glass', pad: true,
    lead: ['0 . 2 . 4 . 6 . 8 . 6 . 4 . 2 .', '1 . 3 . 5 . 7 . 9 . 7 . 5 . 3 .', '8 - - - 4 - - - 0 - - - 4 - - -', '7 - 6 - 5 - 4 - 3 - 2 - 1 - 0 -'],
    leadInst: 'organ', bassInst: 'fm', wrong: 0.18, sting: 0.3,
  },
  director: { // the man who made you: a black mass of organ and choir over a march
    bpm: 124, root: 48, scale: 'harmonic', prog: [0, 5, 1, 4], boss: true,
    drums: 'dirge', bass: 'gallop', arp: '0121', arpInst: 'organ', pad: true, drive: true,
    lead: ['7 - - - 6 - 7 - 8 - - - 7 - 6 -', '4 - - - 3 - 4 - 1 - - - 0 - - -', '7 - - - 6 - 7 - 9 - - - 8 - 7 -', '6 - - - 5 - 4 - 6 - - - 7 - - -'],
    leadInst: 'choir', lead2: 'organ', bassInst: 'saw', wrong: 0.08, sting: 0.2,
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
    const B = this.bus, slip = n => Math.random() < (S.wrong || 0) ? n + 1 : n; // a note a semitone wrong
    // Under everything: a low drone on the root and the note a semitone above it, grinding.
    if (i === 0 && bar % 2 === 0) this.drone(midiHz(S.root - 24), midiHz(S.root - 23), t, sd * 32, B.all);
    // Pad: a new chord every bar.
    if (S.pad && i === 0) for (const n of chord) this.pad(midiHz(n), t, sd * 16, B.all);
    // Now and then, somewhere far off, something screeches.
    if (i === 0 && Math.random() < (S.sting || 0)) this.screech(t + sd * randInt(2, 12), B.all);
    // Arpeggio: chord tones an octave up, every 8th (16ths in a fight).
    if (S.arp && (i % 2 === 0 || this.combatLevel > 0.5)) {
      const k = +S.arp[(i >> (this.combatLevel > 0.5 ? 0 : 1)) % S.arp.length];
      this.voice(S.arpInst, midiHz(slip((k < 3 ? chord[k] : chord[0] + 12) + 12)), t, sd * 1.5, 0.02, B.all, true); // (3: the root an octave up)
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
      if (D.h && D.h[i] === 'x') this.hat(t, 0.03 * vol, 0.04, bus);
      if (D.o && D.o[i] === 'x') this.hat(t, 0.04 * vol, 0.18, bus);
      if (D.c && D.c[i] === 'x') this.clank(t, 0.16 * vol, bus);
      if (D.t && D.t[i] === 'x') this.tom(t, 0.3 * vol, bus);
    };
    if (S.exDrums) play(S.exDrums, B.calm, 0.8);
    play(S.drums, B.combat, 1);
    if (bar % 8 === 7 && i >= 12 && i % 2 === 0) this.tom(t, 0.15 + (i - 12) * 0.04, B.combat); // a fill into the next phrase
    // Lead: bells ring high; voices sit low and dark.
    const L = S.leadBars[bar % S.leadBars.length], tok = L[i];
    if (tok !== null && tok !== '-') {
      let len = 1; while (i + len < 16 && L[i + len] === '-') len++;
      const high = S.leadInst === 'bell' || S.leadInst === 'glass';
      const f = midiHz(slip(this.note(S, tok) + (high ? 12 : 0) + (S.leadOct || 0)));
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
    if (inst === 'warble') { // a worn tape: a soft triangle whose pitch drifts and sags
      const g = this.env(t, dur, vol * 1.1, 0.04), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400;
      const o = this.osc('triangle', f, t, dur, lp), o2 = this.osc('sine', f * 0.5, t, dur, lp);
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 0.8 + Math.random() * 0.6; lg.gain.value = 22;
      lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
      o.frequency.setValueAtTime(f, t + dur * 0.6); o.frequency.exponentialRampToValueAtTime(f * 0.97, t + dur); // it sags at the end
      lp.connect(g); g.connect(bus); g.connect(this.delay);
      return;
    }
    if (inst === 'choir') { // a ghostly "aah": detuned saws through two vowel formants, slow to swell
      const g = this.env(t, Math.max(dur, 0.4), vol * 1.4, Math.min(0.35, dur * 0.4)), mix = c.createGain();
      for (const det of [-12, 0, 11]) this.osc('sawtooth', f, t, Math.max(dur, 0.4), mix, det);
      for (const [fq, q, v] of [[700, 6, 1], [1150, 8, 0.6]]) {
        const bp = c.createBiquadFilter(), bg = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = q; bg.gain.value = v;
        mix.connect(bp); bp.connect(bg); bg.connect(g);
      }
      g.connect(bus); g.connect(this.delay);
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

  // Two low tones a semitone apart, beating against each other, filter slowly breathing.
  drone(f1, f2, t, dur, bus) {
    const c = this.c, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(420, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(180, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.25); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    this.osc('sawtooth', f1, t, dur, lp); this.osc('sawtooth', f2, t, dur, lp, 0);
    this.osc('sine', f1 / 2, t, dur, g);
    lp.connect(g); g.connect(bus);
  },

  // Something far off, screaming: a thin high tone sliding down into the echo.
  screech(t, bus) {
    const c = this.c, f = 1400 + Math.random() * 900, dur = 0.9 + Math.random() * 0.7;
    const g = this.env(t, dur, 0.018, 0.12), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
    const o = this.osc('sawtooth', f, t, dur, bp, 0);
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
    bp.connect(g); g.connect(bus); g.connect(this.delay);
  },

  pad(f, t, dur, bus) {
    const c = this.c, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
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

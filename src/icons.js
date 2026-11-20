'use strict';
// ---------------------------------------------------------------------------
// Card art for every part that hasn't got a hand-painted icon (ICON_PAINT).
//
// Every part is named after a body part, so the name picks a MOTIF (a jaw, a
// lung, a gland, an eye, a leg...). The part's set picks the flesh it's made of
// (Bone ivory, Fungal rot, Hive chitin and amber, Predator raw red and fur,
// Abomination swollen pink), how far it has evolved makes it bigger and adds
// growths, and what it does adds marks: acid or blood drips, venom, spores,
// silk, eggs, sound waves, sharp glints, a ghostly shimmer.
// All painted with the same Painter as everything else, 16x16, once, on demand.
// ---------------------------------------------------------------------------

const ICON_SET_LOOK = {
  BONE:        { m: R.bone,   a: R.muscle, k: '#f4ecd8' },
  FUNGAL:      { m: R.rot,    a: R.bile,   k: '#d8f070' },
  HIVE:        { m: R.chitin, a: R.amber,  k: '#f8d070' },
  PREDATOR:    { m: R.flesh,  a: R.fur,    k: '#ff4858' },
  ABOMINATION: { m: R.cyst,   a: R.pink,   k: '#f0a8ff' },
  none:        { m: R.flesh,  a: R.pink,   k: '#f0d0c0' },
};

// Hand-painted icons that get replaced anyway (they didn't read as their part).
const ICON_REDO = new Set(['silk']);

// Name -> motif, first match wins. (Order matters: "Venus Maw" is a flower, not a jaw.)
const ICON_RULES = [
  [/spinneret|silk gland|glue gland|cocoon gland/, 'spinneret'],
  [/petal|stamen|venus|flower/, 'flower'],
  [/fruiting bod/, 'mushroom'],
  [/vent/, 'vents'],
  [/polyp/, 'polyp'],
  [/leech/, 'leech'],
  [/slime|underbelly|mucus/, 'slime'],
  [/bladder/, 'sac'],
  [/jaw|maw|mouth|incisor|teeth|fang|gums/, 'jaw'],
  [/lung|breath/, 'lung'],
  [/pores/, 'pores'],
  [/worm|chestburster/, 'worm'],
  [/tongue/, 'tongue'],
  [/chest|larynx|voicebox|diaphragm|throat|gullet/, 'throat'],
  [/proboscis|tube/, 'proboscis'],
  [/egg|pods|clutch/, 'eggs'],
  [/womb|gestation/, 'womb'],
  [/brain|cerebrum/, 'brain'],
  [/eye|pupil/, 'eye'],
  [/skull/, 'skull'],
  [/\bhorns?\b/, 'horn'],
  [/segment/, 'segments'],
  [/\bspine\b|neck/, 'spine'],
  [/quill|hide|spines|spurs/, 'quills'],
  [/claw|pincer/, 'claw'],
  [/wing/, 'wing'],
  [/leg|heel|shin|haunch|tendon/, 'leg'],
  [/nerve|fiber/, 'nerve'],
  [/skin|husk/, 'skin'],
  [/shell|plate/, 'plate'],
  [/finger|palm|hand/, 'hand'],
  [/heart/, 'heart'],
  [/cage/, 'ribcage'],
  [/marrow/, 'bone'],
  [/tumor|cells/, 'cells'],
  [/twin|embryo/, 'embryo'],
  [/barb|hook/, 'hook'],
  [/thorn/, 'thorns'],
  [/sinus/, 'sinus'],
  [/veins/, 'veins'],
  [/liver|gut|stomach|gizzard/, 'gut'],
  [/hunchback/, 'hump'],
  [/crest/, 'crest'],
  [/tendril|tips|sucker|mass/, 'tendril'],
  [/sac|gland|cyst|jelly|duct|hives/, 'sac'],
  [/lance|spike|splinter|bone/, 'spike'],
  [/flesh/, 'flesh'],
  [/saliva|blood/, 'drop'],
];

// What it does -> marks painted over the motif (at most two).
const ICON_MARKS = [
  ['acid',  /acid|bile|caustic|corrod|melt|digest/],
  ['blood', /blood|bleed|leech|hemorr|flay|gore|rend|frenzy|vampir/],
  ['venom', /venom|plague|toxic|poison/],
  ['spore', /spore|pollen|fung|mycel|rot|fruit|itch|allergen|hay|sneez/],
  ['silk',  /silk|web|cocoon|tripwire|spinner/],
  ['brood', /brood|hatch|queen|swarm|larva|royal|nest/],
  ['sonic', /boom|concuss|thunder|larynx|voice|diaphragm|howl|quak|bullfrog/],
  ['sharp', /razor|blade|shatter|splinter|shrapnel|needle|pierc|glass/],
  ['ghost', /glow|night|phantom|abyss|mirror|prism|shroud|sealed/],
];

// A line through open space (scratch only draws over paint already there).
function iline(P, pts, col) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let k = 0; k <= n; k++) P.dot(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, col);
  }
  return P;
}

function iconMotif(d) {
  const n = d.name.toLowerCase();
  for (const [re, m] of ICON_RULES) if (re.test(n)) return m;
  return 'flesh';
}

// --- Motifs: (P, look, tier 0..2, h = a per-part random in 0..1, name) ---
const MOTIF = {
  jaw(P, c, t, h) { // an open jaw full of teeth
    P.blob(8, 5.5, 6, 3.2, c.m, { spec: 1 }).blob(8, 11.5, 5.4, 2.8, c.m, { spec: 1 });
    P.blob(8, 8.4, 4.6, 1.8, R.socket, { noise: 0 });
    for (let x = 4; x <= 12; x += 2) { P.tube([[x, 6.8], [x + 0.3, 8.2]], 0.7, 0.3, R.bone); P.tube([[x + 1, 10.4], [x + 0.8, 9]], 0.6, 0.3, R.bone); }
    if (t) P.tube([[3, 6.5], [2.4, 9.5]], 0.9, 0.4, R.bone).tube([[13, 6.5], [13.6, 9.5]], 0.9, 0.4, R.bone); // fangs
    P.blob(10.5, 9, 1.4, 0.8, R.blood, { noise: 0 }); // tongue
  },
  lung(P, c, t) { // two lobes on a branching windpipe
    P.blob(5, 9.5, 3.6, 4.8, c.m, { spec: 1, noise: 0.25 }).blob(11, 9.5, 3.6, 4.8, c.m, { spec: 1, noise: 0.25 });
    P.tube([[8, 1.5], [8, 6]], 1, 0.9, R.pink);
    P.scratch([[8, 6], [6, 8], [5, 11]], c.a[1]).scratch([[8, 6], [10, 8], [11, 11]], c.a[1]);
    P.scratch([[6, 8], [4, 9]], c.a[1]).scratch([[10, 8], [12, 9]], c.a[1]);
    if (t > 1) P.blob(5, 12, 1.2, 1, c.a, { spec: 1 }).blob(11.5, 12.5, 1.1, 0.9, c.a, { spec: 1 });
  },
  throat(P, c, t) { // a jaw from the side, the throat beneath it ballooned into a veined vocal sac
    P.blob(6.5, 4.5, 5, 2.8, c.m, { spec: 1, noise: 0.2 });
    P.scratch([[2, 5.5], [9, 6]], R.socket[1]);
    P.dot(4, 3.5, '#1a0608');
    P.blob(7, 10.5, 4.6 + t * 0.4, 4.2 + t * 0.4, R.pink, { spec: 1, noise: 0.06, shift: 0.15 });
    P.vein(4.5, 9, 5, '#8a3a44', 0.6).vein(9, 12, 4, '#8a3a44', 3.4);
    for (const y of [7.5, 9.2]) P.scratch([[4, y], [10, y]], '#b07070');
  },
  proboscis(P, c, t) { // a long sucking tube, curling to a mouth
    P.tube([[3, 13], [5, 9], [9, 7], [12, 4], [13.5, 2.5]], 2.2, 1, c.m, { spec: 1 });
    for (let k = 0; k < 4; k++) P.scratch([[4 + k * 2.6, 11.5 - k * 2.4], [5.5 + k * 2.6, 12 - k * 2.4]], c.m[1]);
    P.blob(13.6, 2.4, 1.3, 1.3, R.socket, { noise: 0 });
    if (t) P.tube([[12, 4], [14.5, 5.5]], 0.8, 0.4, c.m); // forked
  },
  eggs(P, c, t, h) { // a glistening clutch
    const eggs = [[6, 10, 2.6], [10.5, 10.5, 2.4], [8.2, 6.5, 2.3], [4.2, 6.6, 1.8], [12, 6.8, 1.7]].slice(0, 3 + t);
    for (const [x, y, r] of eggs) { P.blob(x, y, r, r * 1.2, R.belly, { spec: 1, noise: 0.08 }); P.dot(x + 0.4, y + 0.3, c.a[1]); }
    P.blob(8, 14, 5, 1.3, c.m, { noise: 0.2 }); // the slime it sits in
  },
  womb(P, c, t) { // a translucent sac with something curled inside
    P.blob(8, 8.5, 6.2, 6, c.m, { spec: 1, noise: 0.1, shift: 0.1 });
    P.blob(8.5, 9, 3.2, 2.4, R.pink, { noise: 0.05, shift: -0.1 }).blob(10.4, 7.6, 1.7, 1.6, R.pink, { noise: 0.05 });
    P.dot(10.8, 7.4, '#2a1418');
    P.vein(3, 9, 5, c.m[1], -0.5).vein(13, 11, 4, c.m[1], 2.6);
  },
  brain(P, c, t) { // folded, wet, too big
    P.blob(8, 8, 6.2 + t * 0.4, 5.2 + t * 0.3, R.pink, { spec: 1, noise: 0.15 });
    P.scratch([[8, 3], [8, 13]], '#5a2e32');
    for (const [x0, y0, x1, y1] of [[4, 6, 6, 8], [5, 10, 7, 9], [10, 5, 12, 7], [11, 10, 9, 11], [4, 8.5, 5.5, 11]]) P.scratch([[x0, y0], [x1, y1]], '#7a3e44');
    P.tube([[8, 13], [8.5, 15.5]], 1.2, 0.9, c.m);
    if (t) P.blob(12, 4, 1.4, 1.2, c.a, { spec: 1 });
  },
  worm(P, c, t) { // a segmented worm, rearing
    P.tube([[2, 13], [5, 12], [8, 9.5], [9.5, 6], [12, 3.5]], 2, 1.4, c.m, { spec: 1 });
    for (const [x, y] of [[4, 12.4], [6.5, 11], [8.5, 8.4], [9.8, 5.6]]) P.scratch([[x - 1, y - 1], [x + 1, y + 1]], c.m[1]);
    P.blob(12.4, 3.2, 1.8, 1.8, c.m, { spec: 1 }); P.blob(13, 3, 1, 1, R.socket, { noise: 0 });
    for (let k = 0; k < 3; k++) P.dot(12.3 + Math.cos(k * 2) * 1.2, 3 + Math.sin(k * 2) * 1.2, '#e8e0c8'); // a ring of teeth
  },
  eye(P, c, t, h) { // eyeballs in a fleshy socket (more when evolved)
    P.blob(8, 8.5, 6.4, 5.2, c.m, { noise: 0.25 });
    const eyes = t === 0 ? [[8, 8.5, 3.3]] : t === 1 ? [[6, 8.5, 2.6], [11, 8, 2.2]] : [[8, 9.5, 2.8], [4.5, 6.6, 1.6], [11.6, 6.2, 1.7]];
    const iris = ['#b02020', '#d0a020', '#30a060', '#7040c0'][Math.floor(h * 4)];
    for (const [x, y, r] of eyes) { P.blob(x, y, r + 0.8, r + 0.6, R.socket, { noise: 0 }); P.eye(x, y, r, iris, { bloodshot: t > 0 }); }
  },
  skull(P, c, t) { // a cracked skull
    P.blob(8, 7, 5.6, 5, R.bone, { spec: 1 }).blob(8, 12, 3.6, 2.4, R.bone);
    P.blob(5.8, 7.5, 1.5, 1.6, R.socket, { noise: 0 }).blob(10.2, 7.5, 1.5, 1.6, R.socket, { noise: 0 });
    P.blob(8, 10, 0.8, 0.8, R.socket, { noise: 0 });
    for (const x of [6.5, 8, 9.5]) P.scratch([[x, 12.5], [x, 13.8]], '#5e5240');
    P.scratch([[8, 2], [7, 4], [8.5, 5]], '#5e5240');
    if (t) P.dot(5.8, 7.4, c.k).dot(10.2, 7.4, c.k);
  },
  horn(P, c, t) { // curling horns off a brow
    P.blob(8, 12, 5, 2.6, c.m, { noise: 0.2 });
    P.tube([[5, 11], [3, 7], [3.5, 3.5], [5.5, 1.5]], 1.8, 0.4, R.bone, { spec: 1 });
    P.tube([[11, 11], [13, 7], [12.5, 3.5], [10.5, 1.5]], 1.8, 0.4, R.bone, { spec: 1 });
    for (const y of [9, 6.5, 4]) { P.scratch([[2.6, y], [4.4, y - 0.4]], '#968868'); P.scratch([[11.6, y - 0.4], [13.4, y]], '#968868'); }
  },
  segments(P, c, t) { // a centipede body
    for (let k = 0; k < 5; k++) {
      const x = 2.5 + k * 2.8, y = 9 - Math.sin(k * 0.9) * 2;
      P.tube([[x, y], [x - 1, y + 4]], 0.5, 0.3, c.m).tube([[x, y], [x + 0.5, y - 4.2]], 0.5, 0.3, c.m);
      P.blob(x, y, 1.9, 1.7, c.m, { spec: 1 });
    }
    P.blob(14, 6.5, 1.5, 1.4, c.a, { spec: 1 }); P.dot(14.6, 6.2, c.k);
  },
  spine(P, c, t) { // a column of vertebrae
    for (let k = 0; k < 5; k++) { const y = 2.5 + k * 2.7; P.blob(8, y, 2.4, 1.2, R.bone, { spec: 1 }); P.tube([[5.2, y], [3.5, y + 0.6]], 0.7, 0.3, R.bone).tube([[10.8, y], [12.5, y + 0.6]], 0.7, 0.3, R.bone); }
    P.scratch([[8, 2], [8, 14]], c.m[2]);
  },
  quills(P, c, t, h) { // a hide bristling with quills
    const n = 6 + t * 2;
    for (let k = 0; k < n; k++) { const a = -Math.PI * 0.95 + (k / (n - 1)) * Math.PI * 0.9; P.tube([[8 + Math.cos(a) * 3, 11 + Math.sin(a) * 3], [8 + Math.cos(a) * 7.5, 11 + Math.sin(a) * 8]], 0.9, 0.25, R.bone); }
    P.blob(8, 12, 6, 3.6, c.m, { spec: 1, noise: 0.25 });
  },
  claw(P, c, t) { // a pincer (crab) or a hooked talon
    P.tube([[2, 14], [5, 11], [7, 9]], 2, 1.8, c.m, { spec: 1 });
    P.tube([[7, 9], [10, 4.5], [13.5, 3.5]], 2.2, 0.5, c.m, { spec: 1 });
    P.tube([[7.5, 10], [11, 9], [13.5, 6.5]], 1.6, 0.4, c.m, { spec: 1 });
    if (t) P.dot(13.4, 3.6, c.k).dot(13.4, 6.4, c.k);
  },
  wing(P, c, t) { // a veined membrane wing
    const W = ['#2a1820', '#4e3040', '#7a5468', '#a88098', '#d0b0c0'];
    P.tube([[2, 13], [6, 8], [13, 2]], 1, 0.6, c.m);
    P.tube([[3, 12], [8, 8], [13, 3]], 0.8, 3.4, W, { noise: 0.2, spec: 1 });
    for (const [x, y] of [[13, 7], [11, 10], [8, 12]]) P.scratch([[3.5, 12], [x, y]], '#3a2230');
    if (t > 1) P.tube([[4, 13], [9, 11], [13, 12]], 0.6, 1.6, W, { noise: 0.2 });
  },
  leg(P, c, t, h, n) { // a jointed leg: crab, insect or a haunch
    if (/crab|scuttl|shin/.test(n)) {
      P.tube([[2, 4], [7, 6], [9, 11], [12.5, 14.5]], 1.8, 0.4, c.m, { spec: 1 });
      P.blob(7, 6, 1.4, 1.4, c.a); P.blob(9, 11, 1.2, 1.2, c.a);
    } else if (/locust|huntsman|antelope|long/.test(n)) {
      P.tube([[2, 13], [6, 3], [9, 9], [14, 14]], 1.2, 0.35, c.m, { spec: 1 });
      P.blob(6, 3.2, 1, 1, c.a);
      for (let k = 0; k < 3; k++) P.dot(10 + k, 10 + k, c.k);
    } else { // a haunch: big thigh, thin shin, a heel spur
      P.blob(6, 6, 4, 4.4, c.m, { spec: 1, noise: 0.2 });
      P.tube([[7, 9], [10, 12], [8, 15]], 1.6, 1, c.m, { spec: 1 });
      P.tube([[9.5, 12], [13, 11.5]], 0.8, 0.3, R.bone);
      P.scratch([[4, 4], [7, 8]], c.m[1]);
    }
  },
  nerve(P, c, t) { // a ganglion firing down branching nerves
    const C = ['#2a2008', '#5a4810', '#a08a20', '#e0c850', '#fff0a0'];
    P.blob(8, 8, 2.4, 2.2, C, { spec: 1 });
    for (const [x, y] of [[2, 2], [14, 3], [2, 14], [14, 13], [8, 1], [8, 15]].slice(0, 4 + t)) {
      const mx = (8 + x) / 2 + (y - 8) * 0.25, my = (8 + y) / 2 - (x - 8) * 0.25;
      P.tube([[8, 8], [mx, my], [x, y]], 0.6, 0.3, C);
    }
  },
  plate(P, c, t, h, n) { // a curved, segmented carapace (with spikes, edges or mirror-shine as it evolves)
    P.blob(8, 9, 6.8, 5.6, c.m, { spec: 1, noise: 0.1 });
    for (const [y, w] of [[6, 5.2], [9, 6.4], [12, 5.6]]) P.scratch([[8 - w, y + 1], [8 - w * 0.5, y], [8 + w * 0.5, y], [8 + w, y + 1]], c.m[0]);
    P.scratch([[8, 4], [8, 14]], c.m[1]);
    if (/thorn|razor|blade|grind/.test(n)) for (let x = 3; x <= 13; x += 2.5) P.tube([[x, 5 + Math.abs(x - 8) * 0.4], [x, 1.5 + Math.abs(x - 8) * 0.4]], 0.7, 0.2, R.bone);
    else if (/mirror|prism/.test(n)) { P.scratch([[4, 6], [6, 4]], '#ffffff').scratch([[5, 8], [8, 5]], '#e8f0f8'); }
    if (/brood|reactive/.test(n)) P.blob(8, 9, 1.6, 1.4, c.a, { spec: 1 });
    P.blob(8, 15, 5.4, 1, R.flesh, { noise: 0.2 }); // the flesh under it
  },
  skin(P, c, t) { // a sheet of skin peeling back, something raw underneath
    P.blob(8, 9, 6, 5.4, R.muscle, { spec: 1, noise: 0.2 });
    P.tube([[2, 4], [5, 3], [9, 4.5], [12, 4], [14, 2]], 1.8, 1.2, c.m, { spec: 1 });
    P.tube([[2, 4], [2.5, 9], [4, 13]], 1.6, 1.2, c.m, { spec: 1 });
    P.tube([[14, 2], [13, 0.8], [11.5, 1.6]], 1, 0.6, c.m); // the curled edge
    P.vein(7, 9, 5, R.blood[3], 0.4);
  },
  hand(P, c, t) { // a long-fingered hand
    P.blob(7, 11, 3.6, 3.2, c.m, { spec: 1 });
    for (const [x, y] of [[3, 3.5], [6, 2], [9, 2.2], [12, 4], [13.5, 9]]) P.tube([[7 + (x - 7) * 0.3, 10 + (y - 10) * 0.3], [x, y]], 0.9, 0.5, c.m, { spec: 1 });
    for (const [x, y] of [[3, 3.5], [6, 2], [9, 2.2], [12, 4]]) P.dot(x, y - 0.5, '#e8e0c8');
  },
  heart(P, c, t) { // a heart with its vessels
    P.tube([[6.5, 4], [6, 1]], 1.2, 1.1, c.a).tube([[9.5, 4], [11, 1.5]], 1.2, 1, c.a);
    P.blob(5.8, 7.5, 3.6, 3.6, R.blood, { spec: 1 }).blob(10.2, 7.5, 3.6, 3.6, R.blood, { spec: 1 }).blob(8, 10.5, 3.6, 4, R.blood, { spec: 1 });
    P.vein(5, 8, 5, '#5a0c12', 0.8);
    if (t) P.blob(11, 6, 1.2, 1.2, c.m, { spec: 1 });
  },
  ribcage(P, c, t) { // a cage of ribs
    P.scratch([[8, 1], [8, 15]], '#c4b898');
    for (let k = 0; k < 4; k++) { const y = 3 + k * 3; P.tube([[8, y], [4, y + 1], [3, y + 3]], 0.7, 0.5, R.bone).tube([[8, y], [12, y + 1], [13, y + 3]], 0.7, 0.5, R.bone); }
    P.blob(8, 8, 1.8, 2, c.m, { spec: 1 });
  },
  bone(P, c, t) { // a cracked bone, oozing marrow
    P.tube([[3, 13], [13, 3]], 1.6, 1.6, R.bone, { spec: 1 });
    P.blob(3, 13, 2, 2, R.bone).blob(13, 3, 2, 2, R.bone);
    P.blob(8, 8, 1.6, 1.6, c.a, { spec: 1 });
    P.scratch([[6.5, 8], [8, 6.5]], '#5e5240');
  },
  cells(P, c, t, h) { // dividing, swollen cells
    const cl = [[5.5, 6, 3.2], [10.5, 8, 3.6], [6.5, 11.5, 2.6], [12, 3.5, 1.8], [3, 12.5, 1.4]].slice(0, 3 + t);
    for (const [x, y, r] of cl) { P.blob(x, y, r, r * 0.95, c.m, { spec: 1, noise: 0.08, shift: 0.1 }); P.blob(x + 0.4, y, r * 0.38, r * 0.34, c.a, { noise: 0.2 }); }
  },
  embryo(P, c, t) { // a pale curled thing on a cord
    P.tube([[2, 2], [5, 4], [6, 7]], 0.6, 0.6, R.blood);
    P.blob(8, 10, 4, 3.4, R.pink, { spec: 1, noise: 0.05 }).blob(10.5, 7, 2.6, 2.4, R.pink, { spec: 1 });
    P.dot(11.2, 6.6, '#2a1418');
    if (t) { P.blob(4.5, 12.5, 2, 1.8, R.pink, { spec: 1 }); P.dot(5, 12, '#2a1418'); } // and its twin
  },
  hook(P, c, t) { // barbed hooks on a line
    iline(P, [[2, 1], [7, 6]], '#8a8478');
    P.tube([[7, 6], [8, 11], [11, 13], [13, 10], [12, 8]], 1, 0.4, R.metal, { spec: 1 });
    P.tube([[12, 8], [13.6, 9.2]], 0.5, 0.3, R.metal);
    if (t) P.tube([[4, 3], [3, 8], [5, 9.5]], 0.7, 0.3, R.metal);
    P.blob(8, 11.5, 1.2, 1, c.m, { noise: 0 }); // something still on it
  },
  thorns(P, c, t) { // a thorny vine bursting outward
    P.tube([[2, 14], [6, 9], [5, 5], [9, 2], [13, 3]], 1.2, 0.8, c.m, { spec: 1 });
    for (const [x, y, dx, dy] of [[5, 11, -2, -1], [6.5, 8, 2, 0], [5, 5, -2, -1], [8, 2.6, 0, -2], [11, 2.6, 1, 2]]) P.tube([[x, y], [x + dx, y + dy]], 0.6, 0.2, R.bone);
  },
  sinus(P, c, t) { // a raw, swollen nose-cavity
    P.blob(8, 8, 5.4, 5.6, c.m, { spec: 1, noise: 0.25 });
    P.blob(5.8, 10, 1.6, 2, R.socket, { noise: 0 }).blob(10.2, 10, 1.6, 2, R.socket, { noise: 0 });
    P.scratch([[8, 3], [8, 9]], c.m[1]);
  },
  veins(P, c, t) { // a tangle of veins around a pulsing node
    P.blob(8, 8, 2.6, 2.4, c.a, { spec: 1 });
    P.vein(8, 8, 8, R.blood[3], 0.3).vein(8, 8, 8, R.blood[3], 2).vein(8, 8, 7, R.blood[3], 3.8).vein(8, 8, 7, R.blood[3], 5.3);
    P.tube([[8, 8], [2, 3]], 0.5, 0.4, R.blood).tube([[8, 8], [14, 13]], 0.5, 0.4, R.blood).tube([[8, 8], [13, 2.5]], 0.5, 0.4, R.blood);
  },
  gut(P, c, t) { // coiled gut / a bulging organ
    P.blob(8, 9, 5.6, 5, c.m, { spec: 1, noise: 0.2 });
    P.scratch([[4, 7], [7, 9], [5, 11], [9, 12], [12, 10], [10, 7], [12, 5]], c.m[1]);
    P.tube([[6, 4], [5, 1]], 1, 0.8, c.a);
  },
  hump(P, c, t) { // a swollen back, vertebrae pushing through
    P.blob(8, 10, 6.5, 5, c.m, { spec: 1, noise: 0.25 });
    for (let k = 0; k < 4; k++) P.blob(4.5 + k * 2.4, 6 - Math.sin(k / 3 * Math.PI) * 2.2, 1, 1, R.bone, { spec: 1 });
    P.blob(11, 12, 1.4, 1.2, c.a, { spec: 1 });
  },
  crest(P, c, t) { // a fanned head-crest
    for (let k = 0; k < 5; k++) { const a = -Math.PI * 0.85 + k * 0.42; P.tube([[8, 12], [8 + Math.cos(a) * 7, 12 + Math.sin(a) * 9]], 1.2, 0.4, c.a, { spec: 1 }); }
    P.blob(8, 12.5, 4.6, 2.8, c.m, { spec: 1 });
    P.dot(10, 12, c.k);
  },
  tongue(P, c, t) { // a long tongue out of a mouth
    P.blob(4, 6, 3.6, 3, c.m, { spec: 1 });
    P.blob(5, 6.6, 1.8, 1, R.socket, { noise: 0 });
    P.tube([[5, 7], [9, 9], [12, 8], [14, 11]], 1.4, 1.2, R.muscle, { spec: 1 });
    P.blob(14, 11.5, 1.6, 1.4, R.muscle, { spec: 1 });
  },
  polyp(P, c, t) { // a stalked polyp opening its mouth
    P.tube([[8, 15], [7.5, 10], [8.5, 7]], 1.6, 1.3, c.m, { spec: 1 });
    P.blob(8.5, 5, 4, 3.2, c.m, { spec: 1 });
    P.blob(8.5, 4.2, 1.6, 1.2, R.socket, { noise: 0 });
    for (let k = 0; k < 5; k++) P.tube([[8.5, 3], [5 + k * 1.8, 0.8]], 0.4, 0.3, c.a);
    if (t) P.blob(4, 13.5, 1.8, 1.4, c.m, { spec: 1 });
  },
  tendril(P, c, t, h) { // a curling tentacle with suckers
    P.tube([[2, 14], [5, 9], [10, 9], [12, 5], [9, 3], [8, 5]], 2.2, 0.6, c.m, { spec: 1 });
    for (const [x, y] of [[4, 11], [6.5, 9], [9.5, 9.2], [11.5, 6.5]]) P.blob(x, y + 0.6, 0.8, 0.7, c.a, { noise: 0 });
  },
  sac(P, c, t) { // a swollen gland on a duct
    P.blob(8, 9, 5.4, 5, c.a, { spec: 1, noise: 0.1, shift: 0.05 });
    P.vein(5, 7, 5, c.a[1], 0.6).vein(11, 11, 4, c.a[1], 3.6);
    P.tube([[8, 4.5], [9, 1.5]], 1.2, 0.8, c.m);
    if (t) P.blob(12.5, 5, 1.8, 1.6, c.a, { spec: 1 });
  },
  spike(P, c, t) { // a jagged spike of bone
    P.tube([[3, 14], [8, 8], [13.5, 1.5]], 2.6, 0.3, R.bone, { spec: 1 });
    P.tube([[6, 11], [3.5, 7.5]], 0.9, 0.2, R.bone);
    if (t) P.tube([[10, 6], [13, 7.5]], 0.8, 0.2, R.bone);
    P.blob(3, 14, 2, 1.4, c.m, { noise: 0.2 });
  },
  flesh(P, c, t) { // a stitched-up lump of meat
    P.blob(8, 9, 6, 4.6, c.m, { spec: 1, noise: 0.25 });
    P.scratch([[3, 9], [13, 8]], '#3a1418');
    for (let x = 4; x <= 12; x += 2) P.scratch([[x, 7.6], [x, 9.6]], '#c4b898');
  },
  drop(P, c, t) { // a fat drop of blood
    P.tube([[8, 1.5], [8, 6]], 0.6, 2.4, R.blood);
    P.blob(8, 10, 4.4, 4.6, R.blood, { spec: 1 });
    P.blob(3.5, 14, 1.2, 0.8, R.blood).blob(12.5, 14, 1.4, 0.8, R.blood);
  },
  spinneret(P, c, t, h, n) { // a spider's swollen abdomen, silk reeling out of it into a web
    const SPIDER = ['#140e10', '#2e2026', '#4a3640', '#6e5460', '#98808a'];
    // the web it's spinning, in the corner
    const wx = 15, wy = 15, W = '#b8b4ac';
    for (let k = 0; k < 3; k++) { const a = Math.PI * 0.5 + k * Math.PI / 4; iline(P, [[wx, wy], [wx + Math.cos(a + Math.PI / 2) * 7, wy + Math.sin(a + Math.PI / 2) * 7]], W); }
    for (const r of [4.5]) { let prev = null; for (let k = 0; k <= 2; k++) { const a = Math.PI + k * Math.PI / 4, p = [wx + Math.cos(a) * r, wy + Math.sin(a) * r]; if (prev) iline(P, [prev, p], W); prev = p; } }
    // legs, the abdomen, its markings
    for (const [x0, y0, x1, y1] of [[5, 7, 1, 3], [5, 8, 0.8, 9], [7, 9.5, 4, 13.5], [8.5, 6, 9.5, 1.5]]) P.tube([[x0, y0], [(x0 + x1) / 2 + 0.6, (y0 + y1) / 2 - 1.2], [x1, y1]], 0.6, 0.35, SPIDER);
    P.blob(6.5, 6, 4.4, 4, SPIDER, { spec: 1, noise: 0.1, specColor: '#c0a0a8' });
    P.blob(9.6, 9.2, 1.2, 1.1, SPIDER); // the spinnerets
    P.scratch([[5, 4], [6.5, 5.5], [8, 4]], c.k).scratch([[5, 6.5], [6.5, 8], [8, 6.5]], c.k);
    if (/razor|tripwire/.test(n)) P.dot(11, 10.5, '#ffffff').dot(13, 11.5, '#ffffff');
    if (/acid/.test(n)) P.tube([[10.5, 11], [10.5, 13]], 0.4, 0.8, R.bile, { spec: 1 });
    // the thread, from the spinnerets to the web
    iline(P, [[10.2, 10], [wx, wy]], '#ffffff');
  },
  flower(P, c, t, h, n) { // fleshy petals around a mouth (a venus maw snaps; stamens shed spores)
    const W = ['#2a0a18', '#5a1a38', '#8a3a5a', '#c06080', '#e8a0b0'];
    P.tube([[8, 15.5], [8, 11]], 0.8, 0.7, R.toad);
    const k = 5 + t;
    for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 - Math.PI / 2; P.blob(8 + Math.cos(a) * 3.8, 7 + Math.sin(a) * 3.4, 2.2, 2, W, { spec: 1, noise: 0.15 }); }
    if (/maw|snap|stomach/.test(n)) { P.blob(8, 7, 2.4, 2, R.socket, { noise: 0 }); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.dot(8 + Math.cos(a) * 2, 7 + Math.sin(a) * 1.6, '#e8e0c8'); } }
    else { P.blob(8, 7, 1.8, 1.8, c.a, { spec: 1 }); for (let i = 0; i < 4; i++) P.tube([[8, 7], [6 + i * 1.4, 2.5]], 0.3, 0.3, R.pus); }
  },
  pores(P, c, t) { // skin riddled with pores, breathing out
    P.blob(8, 9, 6.4, 5.4, c.m, { spec: 1, noise: 0.3 });
    for (const [x, y] of [[5, 7], [9, 6], [11.5, 9], [7, 11], [4.5, 10.5], [10, 12]]) P.blob(x, y, 0.8, 0.8, R.socket, { noise: 0 });
  },
  mushroom(P, c, t) { // fruiting bodies sprouting from flesh
    P.blob(8, 14, 6, 1.8, R.flesh, { noise: 0.2 });
    for (const [x, h2, r] of [[5, 6, 2.6], [10, 4, 3.2], [13, 9, 1.8]]) { P.tube([[x, 14], [x, 14 - h2]], 0.7, 0.6, R.belly); P.blob(x, 14 - h2, r, r * 0.6, c.a, { spec: 1 }); }
  },
  vents(P, c, t) { // chimneys of flesh venting gas
    P.blob(8, 13.5, 6.5, 2.2, c.m, { noise: 0.2 });
    for (const [x, h2] of [[4.5, 5], [8, 7], [11.5, 4.5]]) { P.tube([[x, 13], [x, 13 - h2]], 1.4, 1.1, c.m, { spec: 1 }); P.blob(x, 13 - h2, 1, 0.6, R.socket, { noise: 0 }); }
  },
  leech(P, c, t) { // a fat leech, sucker first
    P.tube([[2, 12], [5, 8], [9, 7], [12, 4]], 2, 2.6, ['#1a0a0c', '#3a1418', '#5a2028', '#7a3038', '#9a4a50'], { spec: 1 });
    P.blob(12.6, 3.4, 2, 2, R.socket, { noise: 0 });
    for (let k = 0; k < 3; k++) P.dot(12 + k * 0.7, 2.8 + k * 0.3, '#e8e0c8');
    if (t) P.tube([[3, 15], [6, 14]], 1, 1.3, ['#1a0a0c', '#3a1418', '#5a2028', '#7a3038', '#9a4a50']);
  },
  slime(P, c, t) { // a gob of slime, dripping
    P.blob(8, 7, 5.4, 4.4, c.a, { spec: 1, noise: 0.08, shift: 0.15 });
    for (const [x, l] of [[4.5, 5], [8, 7], [11.5, 4]]) P.tube([[x, 9], [x, 9 + l]], 0.9, 0.6, c.a, { spec: 1 });
    P.blob(8, 15, 6, 1, c.a, { noise: 0.1 });
  },
};

// --- Marks: what the part does, painted over the motif ---
const MARK = {
  acid(P) { for (const [x, y] of [[4, 12], [12, 13]]) { P.tube([[x, y], [x, y + 2.5]], 0.6, 0.9, R.bile, { spec: 1 }); } P.dot(13.5, 2, '#d8f070'); },
  blood(P) { for (const [x, y] of [[5, 12.5], [11.5, 13]]) P.tube([[x, y], [x, y + 2.2]], 0.5, 0.9, R.blood, { spec: 1 }); },
  venom(P) { P.tube([[13, 10], [13, 13]], 0.5, 1.1, ['#1a0a20', '#3a1a48', '#6a3a8a', '#9a5ab8', '#c890e0'], { spec: 1 }); },
  spore(P, c) { for (const [x, y] of [[2, 2], [4, 1], [13, 2], [14, 5], [1.5, 6]]) P.dot(x, y, c.k); },
  silk(P) { iline(P, [[0.5, 0.5], [4, 3]], '#e8e4dc'); iline(P, [[15.5, 0.5], [12, 3.5]], '#e8e4dc'); iline(P, [[0.5, 4], [3, 1]], '#e8e4dc'); },
  brood(P) { for (const [x, y] of [[2.5, 13.5], [4.5, 14.5]]) P.blob(x, y, 1.1, 1.2, R.belly, { spec: 1 }); },
  sonic(P, c) { for (const r of [2.5, 4.5]) for (let a = -0.9; a <= 0.9; a += 0.3) P.dot(11 + Math.cos(a) * r, 7 + Math.sin(a) * r * 1.2, c.k); }, // ))) sound waves
  sharp(P) { for (const [x, y] of [[13, 2], [3, 3]]) { P.dot(x, y, '#ffffff'); P.dot(x - 1, y, '#c8c8d0'); P.dot(x + 1, y, '#c8c8d0'); P.dot(x, y - 1, '#c8c8d0'); P.dot(x, y + 1, '#c8c8d0'); } },
  ghost(P, c) { for (const [x, y] of [[2, 3], [14, 4], [3, 13], [13.5, 13.5]]) P.dot(x, y, c.k); },
};

const GEN_ICONS = {};
function partIcon(id) {
  if (GEN_ICONS[id]) return GEN_ICONS[id];
  const d = MUTATIONS[id];
  let tier = 0, x = id;
  while (MUTATIONS[x] && MUTATIONS[x].from) { x = MUTATIONS[x].from; tier++; }
  tier = Math.min(2, tier);
  const set = (typeof setOf === 'function' && setOf(id)) || 'none', look = ICON_SET_LOOK[set] || ICON_SET_LOOK.none;
  let seed = 7; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const P = new Painter(16, 16, 90 + seed % 50), h = hash2(seed, 3, 17);
  const motif = iconMotif(d), name = d.name.toLowerCase();
  P.scaleAround(0.86 + tier * 0.07, 8, 8.5); // grows as it evolves
  MOTIF[motif](P, look, tier, h, name);
  P.tf = null;
  if (tier === 2 && motif !== 'eye') P.vein(5 + h * 6, 6 + h * 4, 4, look.m[1], h * 6); // the evolved ones are veined
  const text = (d.name + ' ' + (d.desc || '') + ' ' + id).toLowerCase();
  let marks = 0;
  for (const [k, re] of ICON_MARKS) {
    if (marks >= 2 || !re.test(text)) continue;
    if ((k === 'brood' && motif === 'eggs') || (k === 'silk' && motif === 'spinneret') || (k === 'blood' && motif === 'drop')) continue;
    MARK[k](P, look); marks++;
  }
  return (GEN_ICONS[id] = P.outline().toCanvas());
}

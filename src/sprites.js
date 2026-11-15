'use strict';
// ---------------------------------------------------------------------------
// All sprites, painted procedurally with the Painter (see paint.js).
// Coordinates are in pixels inside each sprite's canvas. Tweak numbers here
// to reshape a creature; colors come from RAMPS.
// ---------------------------------------------------------------------------

const SPR = {};
const R = RAMPS;

// --- The player: Specimen 47 ---------------------------------------------------
// 24x24, side view, facing right. A slug: long low body, raised head at the
// front, tapering tail behind. It starts small and cute, and grows more
// grotesque with every evolution. Stage 3 is the "full" grotesque design.
const SPECIMEN = { w: 24, h: 24, eye: [18.2, 13.4], cuteEye: [18.9, 14], anchor: [12, 22] };
const STAGE_SCALE = [0.72, 0.8, 0.87, 0.94, 1.0];
const STAGE_RAMP = [
  ['#5a3a44', '#a06a78', '#d898a4', '#f4c0c4', '#fff0ee'], // 0: soft pastel pink
  ['#4a2a32', '#8a5a62', '#c08a8c', '#e4b0aa', '#f8dad2'], // 1: paler, blotchier
  RAMPS.flesh,                                             // 2
  RAMPS.flesh,                                             // 3
  ['#1c080c', '#461216', '#742628', '#9c4440', '#c4766a'], // 4: raw
];

// Where a point of the full-size design ends up at a given stage.
function specimenPoint(stage, x, y) {
  const s = STAGE_SCALE[stage], [ax, ay] = SPECIMEN.anchor;
  return [ax + (x - ax) * s, ay + (y - ay) * s];
}

// The slug's basic shape. `br` stretches/contracts it (inching animation).
function paintSlugBody(P, ramp, br, o = {}) {
  const noise = o.smooth ? 0.05 : 0.14;
  P.tube([[4.5 + br, 18.8], [2 + br * 1.5, 20], [1 + br * 1.5, 20.6]], 2.4, 0.6, ramp, { noise });
  P.blob(11 + br * 0.5, 20.4, 8.4 - br, 1.4, ramp, { noise, shift: -0.22 }); // the wet foot
  P.blob(11 + br * 0.5, 18, 8.8 - br, 3.9 + br * 0.3, ramp, { spec: 1, noise });
  P.blob(17.4, 14.8 - br * 0.3, o.headR || 4.4, (o.headR || 4.4) * 0.92, ramp, { spec: 1, noise });
}

// Tiny hand-placed features for the cute early forms (painted at the scaled position).
function cuteEye(P, x, y, big) {
  const [cx, cy] = P._t(x, y).map(Math.round);
  const px = (dx, dy, col) => P.set(cx + dx, cy + dy, col, null);
  for (let dy = -2; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dy === -2 || dy === 1) && dx !== 0 && !big) continue; // rounded corners
    px(dx, dy, '#140a10');
  }
  if (big) { px(-1, -2, '#140a10'); px(2, -1, '#140a10'); px(2, 0, '#140a10'); }
  px(-1, -1, '#ffffff'); px(0, -1, '#ffffff'); px(1, 1, '#c8c0d8'); // sparkle
}

function paintPureSpecimen(stage, breath, scale) {
  const P = new Painter(24, 24, 47);
  P.scaleAround(scale || STAGE_SCALE[stage], ...SPECIMEN.anchor);
  const ramp = STAGE_RAMP[stage], br = breath || 0;
  // Little feelers on top of the head.
  for (const [x0, x1] of [[16, 14.6], [18.8, 20.2]]) {
    P.tube([[x0, 11.5], [x1, 8.2]], 0.6, 0.45, ramp, { noise: 0.05 });
    P.blob(x1, 8, 0.95, 0.95, ramp, { spec: 1, noise: 0.05 });
  }
  paintSlugBody(P, ramp, br, { smooth: true, headR: 4.8 });
  if (stage === 1) { P.blob(8, 16.4, 2, 1.5, ramp, { noise: 0.1 }); P.vein(12, 19, 5, ramp[1], -2.4); }
  // Big glossy eyes, rosy cheeks, a tiny smile.
  cuteEye(P, 16.2, 14.2, false);
  cuteEye(P, SPECIMEN.cuteEye[0] + 0.6, SPECIMEN.cuteEye[1] + 0.2, stage === 1); // one eye starts to swell
  const [bx1, by1] = P._t(14.6, 16.6).map(Math.round), [bx2, by2] = P._t(21.2, 16.6).map(Math.round);
  const blush = stage === 0 ? '#f48898' : '#d8808a';
  P.set(bx1, by1, blush, null); P.set(bx2, by2, blush, null); P.set(bx2 + 1, by2, blush, null);
  const [mx, my] = P._t(18.3, 17.4).map(Math.round);
  P.set(mx - 1, my, '#6a2a38', null); P.set(mx, my + 1, '#6a2a38', null); P.set(mx + 1, my, '#6a2a38', null);
  return P.outline().toCanvas();
}

function paintSpecimen(ramp, o = {}) {
  const stage = o.stage === undefined ? 3 : o.stage;
  if (stage < 2 && !o.stitches) return paintPureSpecimen(stage, o.breath);
  const P = new Painter(24, 24, o.seed || 47);
  P.scaleAround(STAGE_SCALE[stage], ...SPECIMEN.anchor);
  const br = o.breath || 0;
  paintSlugBody(P, ramp, br);
  // Lumps along the back (more as it degenerates).
  P.blob(7, 15.8, 3, 2.2, ramp, { spec: 1 }).blob(12.5, 14.8, 3.2, 2.3, ramp, { spec: 1 });
  if (stage >= 4) P.blob(4, 16.6, 2, 1.8, ramp, { spec: 1 }).blob(14.5, 13.2, 2, 1.8, ramp, { spec: 1 }).blob(9.5, 14, 1.8, 1.5, ramp);
  if (stage >= 3) P.blob(19, 21.6, 0.9, 1.3, ramp); // drip
  if (stage >= 4) P.blob(8, 21.6, 0.8, 1.2, ramp);
  const veins = [[6, 18, 5, -0.4], [13, 19, 5, -2.6], [10, 15.5, 4, 0.4], [16, 17, 4, 1.2], [4, 17.5, 3, -1.5], [14, 14.5, 4, 2.4]];
  veins.slice(0, [0, 1, 2, 4, 6][stage]).forEach(([x, y, l, d]) => P.vein(x, y, l, ramp[1], d));
  if (o.stitches) {
    // Failed specimens are stitched together along the back.
    P.scratch([[3, 17.5], [8, 15], [13, 14.2], [18, 12.5]], '#120e08');
    for (let x = 4; x < 18; x += 2) { P.dot(x, 15.8 - (x - 4) * 0.2, '#a49c80'); P.dot(x + 1, 17.2 - (x - 4) * 0.2, '#a49c80'); }
  }
  // A big sunken eye on the head, a small milky one behind it.
  P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.8, 2.6, R.socket, { noise: 0.05 });
  P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.1, o.iris || '#7a2014', { bloodshot: !o.milky, milky: o.milky });
  P.blob(15.2, 13.2, 1.5, 1.4, R.socket, { noise: 0.05 });
  P.eye(15.2, 13.2, 1.1, '#5a5040', { milky: true });
  if (stage >= 4) { // a third eye opening in the flank
    P.blob(9, 18, 1.5, 1.3, R.socket, { noise: 0.05 });
    P.eye(9, 18, 1.1, '#7a2014', { bloodshot: true });
  }
  // Torn mouth with broken teeth at the front of the head.
  const [m0, m1] = stage === 2 ? [19, 21.5] : stage >= 4 ? [17, 22.5] : [18, 22];
  for (let x = m0; x <= m1; x++) {
    const y = 17.3 + Math.sin(((x - m0) / (m1 - m0)) * Math.PI) * 0.6 + (hash2(x, 3, 47) - 0.5) * 0.7;
    P.dot(x, y, '#120608').dot(x, y + 1, '#1e0a0c');
    if (hash2(x, 9, o.seed || 47) > (stage === 2 ? 0.7 : 0.4)) P.dot(x, y, hash2(x, 2, 47) > 0.5 ? '#d8ccb0' : '#a8987a');
  }
  if (stage >= 4) P.tube([[21.5, 18.5], [22, 21], [21.6, 23]], 0.6, 0.4, R.blood, { spec: 1 }); // drool
  return P.outline().toCanvas();
}

// --- Body forms -------------------------------------------------------------------
// Once two of your parts share a set, your whole body reshapes into that set's
// creature (see specimenForm in player.js). Same 24x24 frame, head at the
// front (right) near SPECIMEN.eye, so mutation overlays still land roughly right.
// `br` is the breathing frame; `st` the stage (1-4: more grotesque each time).
const FORM_RAMP = {
  BONE:        ['#14100c', '#3a2e24', '#6a5444', '#9a8068', '#c8b098'], // gaunt, dried flesh
  FUNGAL:      ['#12160e', '#2e3824', '#566246', '#8a9670', '#c4ccA4'], // pallid, damp
  HIVE:        ['#0c0806', '#2a1a0c', '#5a3a14', '#9a6a24', '#e0b050'], // glossy chitin
  PREDATOR:    ['#160606', '#481414', '#7e2a22', '#ac4e3a', '#dc8a6a'], // skinned muscle
  ABOMINATION: ['#140814', '#3a1434', '#682a5c', '#9c5288', '#d08cb8'], // bruised, raw
  PLANT:       ['#120c06', '#2e2212', '#54401e', '#7e6234', '#ae905a'], // bark
};
const CAP = ['#1e1008', '#4a2a14', '#8a5428', '#c08848', '#ecc888'];

// Teeth along a jaw line from (x0, y) to (x1, y).
function paintTeeth(P, x0, x1, y, seed) {
  for (let x = x0; x <= x1; x++) {
    P.dot(x, y, '#120608').dot(x, y + 1, '#1e0a0c');
    if (hash2(x, 5, seed) > 0.35) P.dot(x, y + (x % 2 ? 0 : 1), hash2(x, 6, seed) > 0.5 ? '#e0d4b8' : '#a8987a');
  }
}

const FORM_PAINT = {
  // A skeletal crawler: gaunt torso inside a ribcage, a spine of plates, a skull.
  BONE(P, ramp, st, br) {
    for (let i = 0; i < 4; i++) P.blob(1.6 + i * 1.7, 20.4 - i * 0.5, 1.05 - i * 0.05, 0.95, R.bone, { spec: 1 }); // vertebrae tail
    P.blob(11, 20.8, 7.4, 1.1, ramp, { shift: -0.3 });
    P.blob(10.5, 18 + br * 0.3, 6.6, 3.1 - br * 0.2, ramp, { spec: 1, shift: -0.2, noise: 0.1 });
    for (let k = 0; k < 5; k++) { // ribs arching over the gut
      const x = 6 + k * 2.1;
      P.tube([[x + 0.6, 15], [x - 0.5, 17.5], [x + 0.2, 20.4]], 0.65, 0.45, R.bone, { spec: 1 });
    }
    for (let k = 0; k < (st >= 3 ? 6 : 5); k++) { // spinal plates
      const x = 3.6 + k * 2.3, y = 14.9 - k * 0.15;
      P.blob(x, y, 1.1, 1.3, R.bone, { spec: 1 });
      if (st >= 4 && k % 2) P.tube([[x, y - 1], [x - 0.6, y - 3.4]], 0.7, 0.2, R.bone, { spec: 1 });
    }
    // Skull: domed cranium, deep sockets, a hinged jaw full of teeth.
    P.blob(17.8, 13.6, 4.3, 3.6, R.bone, { spec: 1 });
    P.tube([[15.2, 17.6], [19, 18.2], [22.2, 17.2]], 1.3, 0.9, R.bone, { spec: 1 });
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.3, 2.2, R.socket, { noise: 0 });
    P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1], 1.2, '#d8b040', { milky: false });
    P.blob(15.4, 13.6, 1.3, 1.3, R.socket, { noise: 0 });
    P.scratch([[20.2, 15.6], [21.4, 15.2]], '#2a2016'); // nasal slit
    paintTeeth(P, 17, 22, 16.4, 11);
    if (st >= 3) P.scratch([[16.5, 10.6], [17.6, 12], [17.2, 13]], '#2e2418'); // cracked dome
  },

  // Bloated and spotted, sprouting caps; threads of mycelium trail beneath.
  FUNGAL(P, ramp, st, br) {
    for (const [x, l] of [[5, 2.5], [9, 3], [13, 2.2], [16, 2.8]]) P.scratch([[x, 21], [x - 0.6, 21 + l * 0.5], [x + 0.4, 21 + l]], '#b8bc98'); // mycelium
    P.tube([[4, 19.2], [1.6, 20.4], [0.6, 21]], 2.2, 0.8, ramp, { noise: 0.15 });
    P.blob(10.5, 20.6, 8.6, 1.4, ramp, { shift: -0.22 });
    P.blob(10.5, 17.6 + br * 0.2, 8.4, 4.4 + br * 0.3, ramp, { spec: 1, noise: 0.18 });
    P.blob(5.5, 16.6, 3.2, 2.6, ramp, { spec: 1, noise: 0.2 });
    for (const [x, y] of [[7, 18.4], [11, 19.4], [13.5, 17], [4, 17.4], [9.5, 15.6]]) P.dot(x, y, '#d8dcb8'); // spots
    // Head: heavy and drooping, with a gill-mouth.
    P.blob(18.2, 15.4, 4, 3.7, ramp, { spec: 1, noise: 0.12 });
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1] + 0.6, 1.9, 1.7, R.socket, { noise: 0 });
    P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1] + 0.6, 1.3, '#9a9a60', { milky: true });
    for (let x = 18; x <= 21.5; x++) P.scratch([[x, 17.2], [x + 0.2, 18.6]], '#2a3020');
    // Caps on stalks, growing out of the back (more each stage).
    const caps = [[11, 9.2, 3.6], [5.6, 11.2, 2.6], [15.2, 8.6, 2.1], [2.6, 13.6, 1.7], [8.4, 7.6, 1.6]].slice(0, st + 1);
    for (const [x, y, r] of caps) {
      P.tube([[x - 0.3, 15.5], [x + 0.2, y + r * 0.3]], r * 0.3, r * 0.24, ['#2a2c20', '#5a5c48', '#8e8e74', '#b8b49a', '#dcd8c0'], { spec: 1 }); // stalk
      P.blob(x, y, r, r * 0.62, CAP, { spec: 1, noise: 0.08 });                                  // domed cap
      P.scratch([[x - r * 0.85, y + r * 0.5], [x + r * 0.85, y + r * 0.5]], '#3a2410');          // gill rim
      for (const [dx, dy] of [[-0.45, -0.25], [0.3, -0.4], [0.55, 0.05]]) P.dot(x + dx * r, y + dy * r, '#f4e8c8'); // spots
    }
  },

  // An insect: banded abdomen, thorax on stubby legs, a head with a compound eye.
  HIVE(P, ramp, st, br) {
    const ab = 4.6 + (st >= 3 ? 0.6 : 0) + br * 0.3;
    if (st >= 4) P.tube([[2.2, 18.6], [0.6, 20.4]], 0.8, 0.2, ramp, { spec: 1 }); // stinger
    P.blob(6.6, 17.6, ab, ab * 0.78, ramp, { spec: 1 });
    for (let k = 0; k < 4; k++) { // amber bands across the abdomen
      const x = 3.6 + k * 2;
      P.scratch([[x + 0.6, 14.4 + k * 0.1], [x, 17.6], [x + 0.5, 20.8]], k % 2 ? '#e0b050' : '#140c06');
    }
    for (const x of [11.2, 13, 14.8]) P.tube([[x, 18.6], [x - 0.6, 20.4], [x + 0.2, 22]], 0.55, 0.35, ramp); // legs
    P.blob(13, 16.6, 3.3, 2.8, ramp, { spec: 1 });                                                       // thorax
    P.blob(18, 14.6, 3.6, 3.2, ramp, { spec: 1 });                                                        // head
    // Compound eye: a dark glossy dome dotted with facets.
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.4, 2.2, ['#0a0204', '#3a0a10', '#6a1418', '#a02a20', '#e06040'], { spec: 1 });
    for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) P.dot(SPECIMEN.eye[0] + dx, SPECIMEN.eye[1] + dy, '#200608');
    P.tube([[20.6, 16.4], [22.6, 17.6], [21.8, 18.8]], 0.7, 0.35, ramp, { spec: 1 });                    // mandible
    P.tube([[19.6, 17], [21, 18.8]], 0.6, 0.3, ramp);
    if (st >= 2) for (const x of [16, 18]) P.tube([[x, 11.8], [x - 1.4 + (x - 16), 8.4]], 0.4, 0.3, ramp);  // feelers
  },

  // A hunched, skinned beast: heavy shoulders, haunches, a long toothed snout.
  PREDATOR(P, ramp, st, br) {
    P.tube([[4.6, 17], [2, 15.6], [0.8, 13.4]], 1, 0.35, ramp, { spec: 1 });                 // whip tail
    for (const [a, b] of [[[6.4, 19], [6, 22]], [[14.8, 18.4], [15.6, 22]]]) P.tube([a, b], 1.5, 1.1, ramp, { spec: 1 }); // legs
    P.blob(6.4, 18, 3.6, 3, ramp, { spec: 1 });                                               // haunch
    P.blob(10.4, 17 + br * 0.2, 6.6, 3.6 + br * 0.3, ramp, { spec: 1, noise: 0.1 });
    P.blob(14, 14.6, 3.8, 3.4, ramp, { spec: 1 });                                            // shoulders
    for (let k = 0; k < 5; k++) P.scratch([[7 + k * 1.7, 15.2], [6.4 + k * 1.7, 19]], ramp[1]); // muscle striations
    for (let k = 0; k < 6; k++) P.tube([[5 + k * 1.9, 14.6 - (k > 3 ? 1 : 0)], [4.4 + k * 1.9, 12.8 - (k > 3 ? 1 : 0)]], 0.6, 0.2, R.fur); // hackles
    // Long head: skull plus snout, teeth bared.
    P.blob(17.8, 13.8, 3.4, 2.9, ramp, { spec: 1 });
    P.tube([[18.4, 15.2], [21, 15.8], [23, 16.2]], 2, 1.3, ramp, { spec: 1 });
    paintTeeth(P, 18, 22.5, 16.8, 23);
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 1.6, 1.4, R.socket, { noise: 0 });
    P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1], 1.1, '#f0c020', {});
    P.tube([[16.6, 11.6], [15.6, 9.4]], 0.9, 0.3, ramp);                                     // ear
    if (st >= 4) P.tube([[21.6, 18], [21.8, 20.6]], 0.5, 0.3, R.blood, { spec: 1 });         // drool
  },

  // A walking plant: bark-skinned body, a leafy crown on its back, hanging
  // vines, roots for a tail, and a carnivorous flower for a head.
  PLANT(P, ramp, st, br) {
    const LEAF = ['#0c1606', '#1e3a10', '#386a1e', '#5e9a30', '#9ad050'];
    const PET = ['#2a0c14', '#6a1a2a', '#a8304a', '#d86a7a', '#f4b0b8'];
    for (const [x, l] of [[2, 3], [4.5, 2.4], [7, 3.2]]) P.tube([[x + 1, 20], [x, 20 + l * 0.6], [x + 0.6, 20 + l]], 0.6, 0.3, ramp); // root tail
    P.blob(10.5, 20.6, 8, 1.3, ramp, { shift: -0.3 });
    P.blob(10, 17.6 + br * 0.2, 7.6, 3.8 + br * 0.3, ramp, { spec: 1, noise: 0.25 });
    for (let k = 0; k < 5; k++) P.scratch([[4.5 + k * 2.6, 15], [4 + k * 2.6, 20]], ramp[0]);          // bark grain
    // Leafy crown along the back (fuller each stage).
    const leaves = [[6, 13.2, 3, 1.8, -0.4], [10, 12.4, 3.4, 2, 0], [13.6, 13, 2.6, 1.6, 0.4], [3.4, 14.6, 2.2, 1.4, -0.7], [8, 11, 2.2, 1.4, 0.2]].slice(0, st + 1);
    for (const [x, y, rx, ry] of leaves) { P.blob(x, y, rx, ry, LEAF, { spec: 1 }); P.scratch([[x - rx * 0.7, y], [x + rx * 0.7, y]], LEAF[1]); }
    for (const [x, l] of [[5, 4], [12.5, 3]].slice(0, st >= 2 ? 2 : 1)) P.tube([[x, 18], [x + 0.6, 18 + l * 0.6], [x - 0.4, 18 + l]], 0.5, 0.3, LEAF); // hanging vines
    // The flower head: petals around a toothed, eyed center.
    P.tube([[15, 17], [17.4, 15]], 1.6, 1.3, LEAF, { spec: 1 });                                    // stem/neck
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.3; P.blob(SPECIMEN.eye[0] + Math.cos(a) * 3.2, SPECIMEN.eye[1] + Math.sin(a) * 3, 1.9, 1.6, PET, { spec: 1 }); }
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.2, 2.1, ['#1a1004', '#4a3010', '#8a6a20', '#c8a830', '#f0e060'], { spec: 1 });
    P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1], 1.2, '#2a6a20', { bloodshot: st >= 3 });
    if (st >= 3) paintTeeth(P, SPECIMEN.eye[0] - 1.5, SPECIMEN.eye[0] + 1.5, SPECIMEN.eye[1] + 1.4, 41);
  },

  // A lopsided mass: a second head on its back, eyes and mouths where they shouldn't be.
  ABOMINATION(P, ramp, st, br) {
    for (const [x, l] of [[7, 2.4], [10.5, 3.2], [13.5, 2]]) P.tube([[x, 20], [x + 0.4, 20 + l * 0.6], [x - 0.4, 20 + l]], 0.6, 0.3, ramp); // dangling tendrils
    P.blob(10.5, 18.4 + br * 0.2, 8.6, 3.8 + br * 0.3, ramp, { spec: 1, noise: 0.22 });
    P.blob(5.4, 16, 3.6, 3, ramp, { spec: 1, noise: 0.25 });
    P.blob(13.2, 15.4, 3.2, 2.6, ramp, { spec: 1, noise: 0.2 });
    if (st >= 3) P.blob(2.8, 18.6, 2.4, 2, ramp, { spec: 1, noise: 0.3 });
    // The second head, growing from the back, with its own eye and mouth.
    P.tube([[8.6, 15.4], [7.6, 12.6], [6.4, 10.6]], 1.9, 1.5, ramp, { spec: 1 });
    P.blob(5.8, 9.4, 3.1, 2.7, ramp, { spec: 1 });
    P.blob(5, 8.8, 1.5, 1.4, R.socket, { noise: 0 });
    P.eye(5, 8.8, 1.1, '#e0c040', { bloodshot: true });
    paintTeeth(P, 3.4, 7.4, 10.6, 31);
    // Eyes scattered across the flank.
    for (const [x, y, r] of [[10, 17.8, 1.1], [5, 17.4, 0.9], [13.4, 19, 0.9], [8, 20, 0.7]].slice(0, st + 1)) {
      P.blob(x, y, r + 0.4, r + 0.3, R.socket, { noise: 0 });
      P.eye(x, y, r, '#7a2014', { bloodshot: true });
    }
    P.scratch([[3, 15.5], [8, 14.4], [12, 16.6]], '#120e08'); // stitches
    for (let x = 4; x < 12; x += 2) P.dot(x, 14.6 + (x > 8 ? 1 : 0), '#a49c80');
    // Main head with a mouth that opens down its whole front.
    P.blob(18.2, 14.6, 4.4, 4, ramp, { spec: 1, noise: 0.12 });
    P.blob(SPECIMEN.eye[0], SPECIMEN.eye[1], 2.6, 2.4, R.socket, { noise: 0 });
    P.eye(SPECIMEN.eye[0], SPECIMEN.eye[1], 1.9, '#7a2014', { bloodshot: true });
    P.scratch([[21.4, 13.8], [22, 16], [21.2, 18.4]], '#120608');
    for (let y = 14; y <= 18; y += 1.5) P.dot(21.2 + (y % 3 ? 0.4 : -0.2), y, '#d8ccb0');
  },
};

function paintForm(form, stage, breath) {
  const P = new Painter(24, 24, 60 + stage);
  P.scaleAround(STAGE_SCALE[stage], ...SPECIMEN.anchor);
  FORM_PAINT[form](P, FORM_RAMP[form], stage, breath || 0);
  return P.outline().toCanvas();
}

// --- Mutation overlays (same 24x24 frame as the specimen, scaled per stage) ------
function paintOverlay(fn, stage, seed = 5) {
  const P = new Painter(24, 24, seed);
  P.scaleAround(STAGE_SCALE[stage], ...SPECIMEN.anchor);
  fn(P);
  return P.outline().toCanvas();
}

const WING = ['#2a1a22', '#5a3a48', '#8a6070', '#b8909a', '#e0c4c8']; // veined membrane

// Positions follow the slug: head at the front (right), back along the top,
// foot along the bottom, tail at the left.
const OVERLAY_PAINT = {
  eyes: P => { // eye stalks sprouting from the head
    P.tube([[16.5, 12], [15.6, 8], [14.4, 4.5]], 1, 0.7, R.flesh).tube([[19.5, 12], [20.6, 8], [21.6, 4.5]], 1, 0.7, R.flesh);
    P.eye(14.4, 4.2, 1.7, '#8a2a14', { bloodshot: true, look: [-0.3, 0.2] }).eye(21.6, 4.2, 1.7, '#8a2a14', { bloodshot: true });
  },
  acid: P => { // bile gland + bile drool
    P.blob(15.2, 16.8, 1.8, 2, R.bile, { spec: 1 });
    P.tube([[21.5, 18], [21.8, 20.5], [21.5, 22.6]], 0.9, 0.5, R.bile, { spec: 1 });
  },
  spines: P => { // bone spurs along the back
    for (const [a, b] of [[[5, 15.5], [3, 10.5]], [[8.5, 14], [7.6, 8]], [[12, 13], [12, 7]], [[15, 12.2], [16, 7]], [[2.5, 18.2], [0.6, 15]]]) P.tube([a, b], 1.3, 0.3, R.bone);
  },
  twitch: P => { // exposed, striated muscle along the flank
    P.blob(9, 17.6, 3.2, 1.9, R.muscle, { spec: 1 });
    for (let k = -2; k <= 2; k++) P.scratch([[9 + k * 1.2 - 0.6, 16.2], [9 + k * 1.2 + 0.6, 19]], '#d8705a');
  },
  mitosis: P => { // a dividing cyst on the back
    P.blob(6.5, 15.4, 2.4, 2, R.cyst, { spec: 1 }).blob(4.4, 16.5, 1.5, 1.4, R.cyst, { spec: 1 });
  },
  thirdeye: P => { // abyssal eye on the brow
    P.blob(20.2, 12.4, 2.2, 1.8, R.socket, { noise: 0.05 });
    P.eye(20.2, 12.4, 1.6, '#e8a020', { look: [0, 0] });
  },
  horns: P => { // battering skull plate + stubby horns
    P.blob(18.5, 12, 3.6, 1.6, R.bone, { spec: 1 });
    P.tube([[17, 11.8], [15.6, 8.6], [15, 6]], 1.6, 0.5, R.bone).tube([[20, 11.8], [21.5, 8.6], [22, 6]], 1.6, 0.5, R.bone);
  },
  gorehorns: P => { // long curving horns, bloodied at the tips
    P.tube([[17, 12.5], [14.6, 9], [13.2, 5], [13.6, 2]], 1.5, 0.4, R.bone).tube([[20, 12.5], [22, 9], [22.8, 5], [22.3, 2]], 1.5, 0.4, R.bone);
    P.blob(13.6, 2.2, 0.8, 0.9, R.blood).blob(22.3, 2.2, 0.8, 0.9, R.blood);
  },
  mandibles: P => { // pincers either side of the mouth
    P.tube([[21, 15.6], [23, 14], [23.5, 16.4]], 1.2, 0.4, R.chitin).tube([[21, 18.4], [23, 20.2], [23.4, 18]], 1.2, 0.4, R.chitin);
  },
  tentacles: P => { // mouth tendrils dangling from under the head
    P.tube([[19.5, 19], [21.2, 21], [23, 22.6]], 1.3, 0.4, R.flesh, { spec: 1 });
    P.tube([[17.5, 20], [17.8, 22.4], [16.8, 23.5]], 1.1, 0.4, R.flesh, { spec: 1 });
    P.tube([[21, 17.6], [23, 18.6], [23.5, 20.6]], 1.1, 0.4, R.flesh, { spec: 1 });
  },
  chitin: P => { // armored plates along the back
    P.blob(6.5, 15.5, 3, 1.8, R.chitin, { spec: 1 }).blob(10.5, 14.2, 3.4, 2, R.chitin, { spec: 1 }).blob(14.6, 13.4, 3, 1.9, R.chitin, { spec: 1 });
  },
  barbs: P => {
    for (const [x, y, dx, dy] of [[4, 16.2, -1.5, -2], [8, 14.5, -0.5, -2.5], [12, 13.4, 0, -2.5], [15.5, 12.8, 0.5, -2.5], [3, 20, -2, 1], [11, 21.6, 0, 1.6], [18.5, 20.4, 1, 1.6]]) {
      P.tube([[x, y], [x + dx, y + dy]], 0.9, 0.3, R.bone);
    }
  },
  drool: P => { // hemophage: blood running from the mouth
    P.tube([[21, 18.2], [21.3, 21], [21, 23]], 0.7, 0.5, R.blood, { spec: 1 }).tube([[19.5, 18.6], [19.5, 21]], 0.6, 0.5, R.blood, { spec: 1 });
  },
  heart2: P => { P.blob(7.5, 17.4, 2.1, 1.9, R.blood, { spec: 1 }); P.vein(7.5, 17.4, 4, '#3a0608', 3.5); },
  bigheart: P => { // overgrown heart bulging from the back
    P.tube([[11.5, 11.5], [13, 9.2], [13.6, 7.6]], 1, 0.8, R.blood);
    P.blob(10.6, 13.8, 3.8, 3.1, R.blood, { spec: 1 });
    P.vein(10, 13.5, 5, '#3a0608', 1.5);
  },
  ribs: P => { for (let k = 0; k < 5; k++) P.tube([[4.5 + k * 2.5, 15.8], [5.2 + k * 2.5, 17.7], [4.6 + k * 2.5, 19.6]], 0.5, 0.5, R.bone, { noise: 0.05 }); },
  tumor: P => { P.blob(5, 15, 2.4, 2.1, R.cyst, { spec: 1 }).blob(3, 16.8, 1.4, 1.3, R.cyst).blob(14, 13.2, 1.8, 1.6, R.cyst, { spec: 1 }); },
  fangs: P => { P.tube([[20, 17.2], [20.2, 19.8]], 0.9, 0.3, R.bone).tube([[22, 17.2], [22.2, 19.6]], 0.9, 0.3, R.bone); },

  // --- Limbs (drawn BEHIND the body) ---
  spiderlegs: P => spiderLegs(P, 0),
  spiderlegs2: P => spiderLegs(P, 1),
  wings: P => insectWings(P, 0),
  wings2: P => insectWings(P, 1),
  hindlegs: P => { // folded frog legs at the rear
    P.blob(7.5, 17.6, 3.4, 2.6, R.flesh, { spec: 1 }).tube([[6, 19.5], [3.5, 21.5], [6.5, 22.6]], 1.3, 0.9, R.flesh).blob(7.8, 22.8, 1.8, 0.8, R.flesh);
    P.blob(11.5, 19, 2, 1.6, R.flesh).tube([[11, 20], [12.5, 22.6]], 0.9, 0.7, R.flesh);
  },
  tentlimbs: P => { // long grasping tentacles trailing behind
    P.tube([[7, 20], [4.5, 22], [2, 22.6], [0.6, 21.4]], 1.4, 0.4, R.flesh, { spec: 1 });
    P.tube([[11, 20.5], [10, 23], [7.5, 23.6]], 1.2, 0.4, R.flesh, { spec: 1 });
    P.tube([[14, 20.2], [15.5, 23], [13.5, 23.6]], 1, 0.4, R.flesh, { spec: 1 });
  },
};

function spiderLegs(P, frame) {
  for (const [i, x] of [6, 9.5, 13, 16.5].entries()) {
    const f = (i + frame) % 2 ? 1 : -1;
    P.tube([[x, 18.5], [x - 2 + f * 0.5, 14.5], [x - 3.2 + f, 22.6]], 0.75, 0.4, R.chitin);
    P.tube([[x + 0.6, 19], [x + 2.4 - f * 0.5, 15.5], [x + 3.2 - f, 23]], 0.7, 0.4, R.chitin, { shift: 0.15 });
  }
}

// A leaf-shaped membrane wing from root to tip, with veins.
function wing(P, rx, ry, tx, ty, width) {
  const mx = (rx + tx) / 2, my = (ry + ty) / 2;
  P.tube([[rx, ry], [mx, my]], 0.8, width, WING, { noise: 0.25, spec: 1 });
  P.tube([[mx, my], [tx, ty]], width, 0.7, WING, { noise: 0.25, spec: 1 });
  P.scratch([[rx, ry], [tx, ty]], '#3a2230');
  P.scratch([[mx, my], [mx + (ty - ry) * 0.18, my - (tx - rx) * 0.18]], '#3a2230');
}

function insectWings(P, frame) {
  if (frame) { wing(P, 11, 13.5, 1.5, 11.5, 2.4); wing(P, 12.5, 13.5, 20, 11, 2); }   // swept down
  else { wing(P, 11, 13, 3, 4, 2.8); wing(P, 12.5, 13, 18.5, 4.5, 2.3); }             // raised
}
// --- Enemies -------------------------------------------------------------------------
function paintRat(frame) {
  const P = new Painter(24, 20, 11);
  P.tube([[7, 13], [4, 14], [2, 16], [1, 18.5]], 1.1, 0.4, R.pink);
  const lf = frame ? 1 : 0;
  P.blob(9 - lf, 16.4, 1.4, 1, R.fur).blob(16 + lf, 16.2, 1.3, 1, R.fur);
  P.blob(8.5, 12.5, 4, 4, R.fur, { noise: 0.3 });
  P.blob(12.5, 12.4, 6.5, 4.3, R.fur, { noise: 0.3 });
  P.blob(18.3, 11.5, 3.6, 3, R.fur, { noise: 0.25 });
  P.blob(21.2, 12.4, 1.8, 1.4, R.pink, { spec: 1 });
  P.blob(16.6, 8.3, 1.6, 1.8, R.pink);
  P.blob(12, 10.6, 2.4, 1.5, R.blood, { spec: 1 }); // open wound
  P.scratch([[11, 10.4], [13, 10.4]], '#c4b898');
  P.dot(19.6, 10.4, '#1a0608').dot(20, 11, '#e01828');
  return P.outline().toCanvas();
}

function paintDrone(frame) {
  const P = new Painter(20, 20, 23);
  P.tube([[10, 7], [10, 3.5]], 0.8, 0.8, R.metal);
  if (frame) P.scratch([[6, 3], [14, 3]], '#5e5e66'); else { for (let x = 2; x <= 18; x++) P.set(x, 3, x % 2 ? '#6a6a72' : '#3e3e46', R.metal); }
  P.tube([[7, 15], [6, 18.5]], 0.6, 0.5, R.metal).tube([[13, 15], [14, 18.5]], 0.6, 0.5, R.metal);
  P.blob(4, 12, 2, 2.6, R.metal).blob(16, 12, 2, 2.6, R.metal);
  P.blob(10, 11, 6.5, 5, R.metal, { spec: 1, noise: 0.1 });
  for (let k = 0; k < 7; k++) P.scratch([[5 + hash2(k, 1, 23) * 10, 8 + hash2(k, 2, 23) * 6], [6 + hash2(k, 1, 23) * 10, 8 + hash2(k, 2, 23) * 6]], '#552a16'); // rust
  P.blob(10, 12.6, 3, 2.9, R.metal, { shift: -0.3 });
  P.blob(10, 12.6, 2, 2, R.glow, { spec: 1, specColor: '#ffe0d0' });
  return P.outline().toCanvas();
}

function paintUrchin(frame) {
  const P = new Painter(20, 20, 31);
  const rot = frame ? 0.18 : 0;
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + rot;
    const len = 8 + hash2(k, 4, 31) * 1.8;
    P.tube([[10 + Math.cos(a) * 3.5, 10.5 + Math.sin(a) * 3.5], [10 + Math.cos(a) * len, 10.5 + Math.sin(a) * len]], 1.3, 0.3, R.bone);
  }
  P.blob(10, 10.5, 5.5, 5, R.urchin, { spec: 1 });
  P.blob(8, 9.3, 1.1, 1, R.socket, { noise: 0 }).blob(12, 9.3, 1.1, 1, R.socket, { noise: 0 });
  P.dot(8, 9, '#e0c040').dot(12, 9, '#e0c040');
  P.scratch([[8.5, 13], [11.5, 13]], '#0e0408');
  return P.outline().toCanvas();
}

function paintMini() {
  const P = new Painter(14, 14, 37);
  P.blob(7, 8.3, 5, 4.4, R.rot, { spec: 1 });
  P.vein(4, 10, 4, R.rot[1], -0.4);
  P.blob(7, 7.2, 2, 1.8, R.socket, { noise: 0 });
  P.eye(7, 7.2, 1.4, '#5a5040', { milky: true });
  P.scratch([[5, 10.6], [9, 10.8]], '#0e1008');
  return P.outline().toCanvas();
}

function paintToad() {
  const P = new Painter(22, 20, 41);
  P.blob(4, 15, 3.2, 2.4, R.toad).blob(18, 15, 3.2, 2.4, R.toad);
  P.blob(11, 12.5, 8, 6, R.toad, { spec: 1, noise: 0.22 });
  P.blob(11, 15.6, 4.6, 2.6, R.belly, { spec: 1 });
  P.blob(11, 9, 6, 4, R.toad, { spec: 1, noise: 0.2 });
  P.blob(7, 6.6, 2.3, 2.3, R.toad).blob(15, 6.6, 2.3, 2.3, R.toad);
  P.eye(7, 6.2, 1.6, '#b08a20', { look: [-0.4, 0] }).eye(15, 6.2, 1.6, '#b08a20', { look: [0.4, 0] });
  for (const [x, y, r] of [[5, 11, 1.2], [8.5, 13.5, 0.9], [16, 11.5, 1.3], [17.5, 13.8, 0.9], [13.5, 8.5, 0.9], [4, 13.5, 0.8]]) P.blob(x, y, r, r, R.pus, { spec: 1 });
  P.scratch([[6, 11], [8, 11.6], [11, 11.8], [14, 11.6], [16, 11]], '#0e1008');
  P.blob(7, 18.3, 1.6, 1, R.toad).blob(15, 18.3, 1.6, 1, R.toad);
  return P.outline().toCanvas();
}

// --- Pickups ----------------------------------------------------------------------
function paintHeart(ramp) {
  const P = new Painter(9, 9, 3);
  // Two round lobes on top, tapering to a point at the bottom.
  P.tube([[4.5, 3.6], [4.5, 7.6]], 3.3, 0.5, ramp);
  P.blob(2.6, 2.7, 2.1, 2.1, ramp, { spec: 1 }).blob(6.4, 2.7, 2.1, 2.1, ramp, { spec: 1 });
  return P.outline().toCanvas();
}

function paintVial(color) {
  const P = new Painter(10, 14, 7);
  P.cyl(2, 7, 4, 12, R.murk, { noise: 0.05 });
  const lr = rampFrom(color);
  P.cyl(3, 6, 7, 12, lr, { noise: 0.1, shift: 0.1 });
  P.blob(4.5, 3, 2.2, 1.5, R.wood);
  P.scratch([[3, 5], [3, 11]], '#a8c0b8');
  return P.outline().toCanvas();
}

// --- Obstacles (16x16 tiles) --------------------------------------------------------
function paintCrate(seed) {
  const P = new Painter(16, 16, seed);
  P.rect(1, 1, 14, 4, R.wood, 0.75).rect(1, 5, 14, 14, R.wood, 0.4);
  for (const y of [8, 11]) P.scratch([[1, y], [14, y]], '#140c08');
  P.scratch([[1, 5], [14, 5]], '#86623c');
  for (let i = 0; i < 6; i++) P.dot(2 + hash2(i, 1, seed) * 12, 6 + hash2(i, 2, seed) * 8, '#552a16');
  P.dot(2, 2, '#8a8a92').dot(13, 2, '#8a8a92').dot(2, 13, '#3e3e46').dot(13, 13, '#3e3e46');
  return P.outline().toCanvas();
}

function paintBarrel(seed) {
  const P = new Painter(16, 16, seed);
  P.cyl(2, 13, 3, 14, R.rust, { bands: [6, 11] });
  P.blob(7.5, 3, 6, 2, R.rust, { shift: 0.2 });
  P.blob(7.5, 3, 4, 1.2, R.rust, { shift: -0.35 });
  P.blob(5, 9, 1.6, 2.5, R.bile, { spec: 1 }); // something leaking
  return P.outline().toCanvas();
}

function paintTank(seed, broken) {
  const P = new Painter(16, 16, seed);
  P.cyl(2, 13, 3, 13, broken ? R.stone : R.murk, { noise: 0.08, shift: broken ? -0.4 : 0 });
  if (!broken) {
    P.blob(7.5, 8, 2.6, 3, R.flesh, { shift: -0.25 }).blob(8.5, 5.5, 1.8, 1.6, R.flesh, { shift: -0.2 });
    P.dot(9, 5.4, '#0a0404');
    for (let i = 0; i < 4; i++) P.dot(4 + hash2(i, 3, seed) * 8, 4 + hash2(i, 4, seed) * 8, '#5a8a7a');
  } else {
    P.blob(7.5, 12, 4, 1.6, R.blood, { spec: 1 });
    P.scratch([[3, 3], [5, 6], [4, 9]], '#a8c0b8').scratch([[12, 4], [10, 7]], '#a8c0b8');
  }
  P.cyl(1, 14, 1, 3, R.metal).cyl(1, 14, 13, 15, R.metal);
  if (!broken) P.scratch([[3.5, 4], [3.5, 12]], '#8ab0a0');
  return P.outline().toCanvas();
}

function paintRubble(seed) {
  const P = new Painter(16, 16, seed);
  P.blob(5, 10, 4, 3.5, R.stone).blob(11, 11, 4.2, 3.4, R.stone).blob(8, 6.5, 3.8, 3.2, R.stone, { spec: 0 });
  P.scratch([[6, 7], [8, 9]], '#121012');
  return P.outline().toCanvas();
}

function paintHatch() {
  const P = new Painter(26, 26, 61);
  P.blob(13, 13, 12, 12, R.metal, { spec: 1 });
  P.blob(13, 13, 9.5, 9.5, R.glow, { shift: -0.55, noise: 0.25 });
  for (let k = -8; k <= 8; k += 4) P.tube([[13 + k, 4.5], [13 + k, 21.5]], 0.9, 0.9, R.metal);
  return P.outline().toCanvas();
}

// Doors: dark arched opening, or a rusted shutter when locked.
function paintDoor(horiz, locked) {
  const w = horiz ? 32 : 16, h = horiz ? 16 : 32;
  const P = new Painter(w, h, 71);
  if (locked) {
    P.rect(0, 0, w - 1, h - 1, R.rust, 0.45, { noise: 0.25 });
    if (horiz) for (let y = 2; y < h; y += 3) P.scratch([[1, y], [w - 2, y]], '#160c08');
    else for (let x = 2; x < w; x += 3) P.scratch([[x, 1], [x, h - 2]], '#160c08');
    for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) P.dot(x, y, '#a0643a');
    P.blob(w / 2, h / 2, 2, 2, R.glow, { spec: 1 }); // red warning light
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = horiz ? Math.abs(x - w / 2 + 0.5) / (w / 2) : Math.abs(y - h / 2 + 0.5) / (h / 2);
      if (d > 0.92) P.set(x, y, '#2e2826', R.stone);
      else P.set(x, y, hash2(x, y, 3) > 0.9 ? '#0a0708' : '#040304', null);
    }
  }
  return P.outline().toCanvas();
}

// The Mutagen Vault's hazmat seal: a heavy plate with yellow-black hazard
// stripes and a hazard roundel. `dmg` 0-2 dents and cracks it.
function paintHazmat(horiz, dmg) {
  const w = horiz ? 32 : 16, h = horiz ? 16 : 32;
  const P = new Painter(w, h, 77 + dmg);
  P.rect(0, 0, w - 1, h - 1, R.metal, 0.5, { noise: 0.2 });
  // Hazard stripes along both long edges.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = horiz ? (y < 3 || y > h - 4) : (x < 3 || x > w - 4);
    if (edge) P.set(x, y, Math.floor((x + y) / 3) % 2 ? '#e8c020' : '#1a1610', null);
  }
  // Hazard roundel in the middle.
  P.blob(w / 2, h / 2, 4, 4, R.amber, { spec: 1 });
  P.blob(w / 2, h / 2, 1.5, 1.5, R.metal);
  for (let a = 0; a < 3; a++) {
    const ang = a * Math.PI * 2 / 3 - Math.PI / 2;
    P.dot(Math.round(w / 2 + Math.cos(ang) * 2.8), Math.round(h / 2 + Math.sin(ang) * 2.8), '#1a1610');
  }
  for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) P.dot(x, y, '#8a8a92');
  // Damage: dents and cracks.
  if (dmg >= 1) {
    P.blob(w * 0.3, h * 0.35, 2.4, 2, R.rust, { shift: -0.3 });
    P.scratch([[w * 0.2, h * 0.25], [w * 0.4, h * 0.5], [w * 0.35, h * 0.7]], '#060404');
  }
  if (dmg >= 2) {
    P.blob(w * 0.7, h * 0.65, 2.6, 2.2, R.rust, { shift: -0.3 });
    P.scratch([[w * 0.55, h * 0.3], [w * 0.7, h * 0.55], [w * 0.85, h * 0.6], [w * 0.75, h * 0.85]], '#060404');
    P.dot(Math.round(w * 0.7), Math.round(h * 0.6), '#c96a8f'); // the vault's glow leaks through
  }
  return P.outline().toCanvas();
}

// A planted polyp: a fleshy bulb on a stalk with a toothed mouth on top.
function paintPolypAlly() {
  const P = new Painter(12, 14, 83);
  P.blob(6, 12.6, 3.4, 1.2, R.flesh, { shift: -0.3 });
  P.tube([[6, 12.4], [5.6, 9.5], [6, 7.6]], 1.4, 1.1, R.flesh, { spec: 1 });
  P.blob(6, 5.4, 3.6, 3.2, R.cyst, { spec: 1, noise: 0.15 });
  P.blob(6, 4, 1.7, 1.2, R.socket, { noise: 0 });
  for (let x = 4.5; x <= 7.5; x++) P.dot(x, 3.2, '#e0d4b8');
  return P.outline().toCanvas();
}

// A boss's core: a dark, veined heart, still beating. `big` = mid-beat.
function paintBossCore(big) {
  const P = new Painter(16, 16, 81);
  const k = big ? 1.12 : 1;
  P.tube([[8, 4], [7, 1.2]], 1.1, 0.8, R.blood, { spec: 1 }).tube([[10, 4.5], [12, 1.8]], 0.9, 0.6, R.cyst);
  P.blob(8, 9, 5.4 * k, 5 * k, ['#1a0408', '#4a0c18', '#7a1828', '#b03040', '#e87080'], { spec: 1, noise: 0.15 });
  P.blob(6, 8, 2.4 * k, 2.6 * k, ['#1a0408', '#4a0c18', '#7a1828', '#b03040', '#e87080'], { spec: 1 });
  P.vein(4, 9, 5, '#2a0410', 0.6).vein(9, 12, 4, '#2a0410', -1.4).vein(10, 6, 3, '#2a0410', 1.2);
  if (big) P.dot(8, 9, '#ffb0c0');
  return P.outline().toCanvas();
}

// --- Mutation art (16x16 illustrations for cards and the slot bar) ---------------
const ICON_PAINT = {
  // MOUTH
  spike: P => { P.blob(3.5, 12.5, 2.2, 1.6, R.blood, { spec: 1 }); P.tube([[3, 13], [8, 8], [13.5, 2.5]], 2.3, 0.4, R.bone, { spec: 1 }); },
  bile: P => {
    P.tube([[6, 10], [5.8, 14.5]], 1.1, 0.5, R.bile, { spec: 1 }).tube([[10.5, 10.5], [10.8, 15]], 0.9, 0.4, R.bile, { spec: 1 });
    P.blob(8, 7.5, 5, 4.4, R.bile, { spec: 1, noise: 0.2 }).blob(10, 5.5, 1.3, 1.2, R.bile, { shift: 0.3 });
  },
  mandibles: P => {
    P.tube([[4, 1.5], [2.5, 6], [4, 10.5], [7.5, 13]], 1.8, 0.5, R.chitin, { spec: 1 });
    P.tube([[12, 1.5], [13.5, 6], [12, 10.5], [8.5, 13]], 1.8, 0.5, R.chitin, { spec: 1 });
  },
  tentacles: P => P.tube([[3, 15], [3.5, 10], [6, 6.5], [10, 5], [13, 6.5], [12.5, 9.5], [10, 10], [9.5, 8]], 2.4, 0.5, R.flesh, { spec: 1 }),
  feral: P => {
    P.blob(8, 8.5, 6.6, 5.2, R.flesh, { spec: 1 });
    P.blob(8, 9.5, 4.8, 2.7, R.socket, { noise: 0 });
    for (const x of [5, 7, 9, 11]) P.tube([[x, 7], [x + 0.2, 9.8]], 0.8, 0.3, R.bone);
    for (const x of [6, 10]) P.tube([[x, 12.5], [x, 10]], 0.7, 0.3, R.bone);
  },
  bloom: P => {
    const PET = ['#2a0c14', '#6a1a2a', '#a8304a', '#d86a7a', '#f4b0b8'];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P.blob(8 + Math.cos(a) * 4.2, 8 + Math.sin(a) * 4.2, 2.6, 2.2, PET, { spec: 1 }); }
    P.blob(8, 8, 3, 3, ['#1a1004', '#4a3010', '#8a6a20', '#c8a830', '#f0e060'], { spec: 1 });
    P.blob(8, 8.4, 1.6, 1.3, R.socket, { noise: 0 });
    for (const x of [7, 8, 9]) P.dot(x, 7.4, '#e0d4b8');
  },
  thornbark: P => {
    const BARK = ['#140c06', '#2e2010', '#4e3a20', '#7a5a32', '#a8844a'];
    P.blob(8, 10, 6.6, 4.6, BARK, { spec: 1, noise: 0.3 });
    for (let k = 0; k < 4; k++) P.scratch([[3 + k * 3, 7], [3.6 + k * 3, 13]], '#140c06');
    for (const [x, y, dx, dy] of [[3, 7, -1.6, -3], [7, 5.6, 0, -3.6], [11, 5.8, 1, -3.4], [14, 8, 2.4, -2]]) P.tube([[x, y], [x + dx, y + dy]], 0.9, 0.2, R.bone, { spec: 1 });
  },
  rootlegs: P => {
    const BARK = ['#140c06', '#2e2010', '#4e3a20', '#7a5a32', '#a8844a'];
    P.blob(8, 4.6, 4.6, 3, BARK, { spec: 1, noise: 0.2 });
    for (const [a, b, c] of [[[5, 6], [3, 10], [1, 14.5]], [[7, 7], [6.4, 11], [5, 15]], [[9, 7], [10, 11], [11.5, 15]], [[11, 6], [13, 10], [15, 13.5]]]) P.tube([a, b, c], 1.1, 0.35, BARK, { spec: 1 });
  },
  heartwood: P => {
    const WOOD = ['#1a0e06', '#3e2412', '#6a4022', '#9a6a3a', '#c89a60'];
    P.blob(6, 7, 3.8, 3.6, WOOD, { spec: 1 }).blob(10, 7, 3.8, 3.6, WOOD, { spec: 1 }).blob(8, 10.4, 4.4, 3.8, WOOD, { spec: 1 });
    for (const r of [1.2, 2.6]) for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; P.dot(8 + Math.cos(a) * r, 9 + Math.sin(a) * r * 0.8, '#3e2412'); }
    P.tube([[8, 3.6], [8.6, 1]], 0.6, 0.4, ['#0e1a08', '#24401a', '#3e6a2a', '#6a9a3a', '#a8d060']);
  },
  ovipositor: P => {
    P.tube([[2.5, 14], [6, 10], [10, 6.5], [12.5, 4.5]], 2.4, 1.2, R.flesh, { spec: 1 });
    for (let k = 0; k < 4; k++) P.scratch([[3 + k * 2.4, 11.6 - k * 2.4], [5 + k * 2.4, 13.4 - k * 2.4]], '#5e2229');
    for (const [x, y, r] of [[13.5, 3, 1.5], [11.6, 2, 1.1], [14.6, 5.4, 1]]) P.blob(x, y, r, r * 0.9, R.pus, { spec: 1 });
  },
  miasma: P => {
    const G = ['#141a0c', '#2e3a18', '#4e6428', '#7a9a3a', '#b8d070'];
    P.blob(6, 9.5, 4.2, 3.4, G, { spec: 1, noise: 0.25 }).blob(10.5, 7, 3.8, 3.2, G, { spec: 1, noise: 0.25 }).blob(9.5, 11.6, 3.2, 2.4, G, { noise: 0.25 });
    P.blob(5, 9, 0.9, 1, R.socket, { noise: 0 }).blob(7.4, 9, 0.9, 1, R.socket, { noise: 0 }); // a face in the fumes
    P.scratch([[5, 11], [7.6, 11]], '#141a0c');
  },
  howl: P => {
    P.blob(5.5, 8, 4.6, 4.4, R.flesh, { spec: 1 });
    P.blob(6.6, 8.4, 2.6, 3.2, R.socket, { noise: 0 });
    for (const y of [5.4, 11.4]) for (let x = 5; x <= 8; x++) P.dot(x, y, '#e0d4b8');
    for (const r of [3, 5.5]) P.scratch([[10 + r * 0.3, 8 - r], [11 + r * 0.6, 8], [10 + r * 0.3, 8 + r]], '#e8dcc8');
  },
  polyp: P => {
    P.tube([[8, 15.5], [7.6, 12], [8, 9.5]], 1.6, 1.2, R.flesh, { spec: 1 });
    P.blob(8, 7, 4.6, 4.2, R.cyst, { spec: 1, noise: 0.15 });
    P.blob(8, 5.4, 2, 1.5, R.socket, { noise: 0 });
    for (let x = 6.5; x <= 9.5; x++) P.dot(x, 4.4, '#e0d4b8');
    P.vein(5, 8, 3, '#7a1420', 1);
  },
  tongue: P => {
    P.blob(4, 8.5, 3.6, 3.2, R.flesh, { spec: 1 });
    P.blob(5, 9, 1.6, 1.8, R.socket, { noise: 0 });
    P.tube([[5.5, 9.4], [9, 10], [12.5, 8.4], [13.6, 5.4]], 1.3, 1.1, R.pink, { spec: 1 });
    P.blob(13.4, 4.6, 1.8, 1.6, R.pink, { spec: 1 });
  },
  silk: P => {
    const c = '#d8d0c8';
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.scratch([[8, 8], [8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7]], c); }
    for (const r of [2.6, 5]) for (let k = 0; k < 8; k++) {
      const a1 = k * Math.PI / 4, a2 = (k + 1) * Math.PI / 4;
      P.scratch([[8 + Math.cos(a1) * r, 8 + Math.sin(a1) * r], [8 + Math.cos(a2) * r, 8 + Math.sin(a2) * r]], '#a8a098');
    }
    P.blob(10.5, 5.5, 1.4, 1.3, R.chitin, { spec: 1 });
  },
  slime: P => {
    P.blob(8, 9.5, 5.4, 4.6, R.murk, { spec: 1, noise: 0.25 });
    P.blob(12.5, 4.5, 1.8, 1.6, R.murk, { spec: 1 }).blob(3.5, 4, 1.1, 1, R.murk, { spec: 1 });
    P.tube([[6, 13.5], [5.6, 15.5]], 0.8, 0.4, R.murk);
  },
  proboscis: P => {
    P.blob(4, 12, 3.4, 2.8, R.flesh, { spec: 1 });
    P.tube([[5.5, 10.5], [9, 7], [13.5, 2.5]], 1.4, 0.5, R.flesh, { spec: 1 });
    P.blob(13.6, 2.4, 1.1, 1, R.blood, { spec: 1 }).tube([[13.2, 3.4], [13, 6]], 0.4, 0.3, R.blood);
  },
  eggsac: P => {
    P.blob(8, 9, 6.6, 5.6, R.cyst, { shift: 0.1, noise: 0.3 });
    for (const [x, y, r] of [[5.5, 7.5, 1.6], [9.5, 6.5, 1.4], [8, 10.5, 1.7], [11.5, 10, 1.2], [4.5, 11, 1.1]]) P.blob(x, y, r, r, R.pus, { spec: 1 });
    P.vein(3, 9, 5, '#7a1420', 0.4);
  },
  // HEAD
  antennae: P => {
    P.tube([[6.5, 15], [5.5, 9], [3, 4], [1.5, 1.5]], 0.9, 0.4, R.chitin).tube([[9.5, 15], [10.5, 9], [13, 4], [14.5, 1.5]], 0.9, 0.4, R.chitin);
    P.blob(1.6, 1.8, 1.2, 1.2, R.chitin, { spec: 1 }).blob(14.4, 1.8, 1.2, 1.2, R.chitin, { spec: 1 });
  },
  echo: P => {
    P.blob(6, 9, 5, 4.6, R.bone, { spec: 1 });
    P.blob(4.5, 8.5, 1.1, 1.1, R.socket, { noise: 0 }).blob(7.6, 8.5, 1.1, 1.1, R.socket, { noise: 0 });
    P.blob(6, 12, 1.8, 1.4, R.socket, { noise: 0 });
    for (const r of [3, 5.5]) P.scratch([[11 + r * 0.4, 9 - r], [12 + r * 0.6, 9], [11 + r * 0.4, 9 + r]], '#c8c0b0');
  },
  parasite: P => {
    P.blob(8, 9, 6.6, 5.4, R.cyst, { spec: 1, noise: 0.3 });
    P.vein(4, 8, 5, '#5a0c12', 0.3).vein(9, 11, 4, '#5a0c12', -1.5);
    P.tube([[12, 6], [14, 3], [12.5, 1.2]], 1, 0.5, R.muscle, { spec: 1 });
    P.eye(10, 7.5, 1.5, '#a04ad0');
  },
  eyes: P => {
    for (const [x, y] of [[3.5, 5], [8, 3], [12.5, 5]]) P.tube([[8, 15], [x, y]], 1.2, 0.8, R.flesh);
    for (const [x, y] of [[3.5, 5], [8, 3], [12.5, 5]]) P.eye(x, y, 2, '#8a2a14', { bloodshot: true });
  },
  skull: P => {
    P.tube([[5, 8], [2.5, 4.5], [3, 1.5]], 1.8, 0.5, R.bone).tube([[11, 8], [13.5, 4.5], [13, 1.5]], 1.8, 0.5, R.bone);
    P.blob(8, 10, 5.8, 4.2, R.bone, { spec: 1 });
    P.blob(6, 10, 1.3, 1.2, R.socket, { noise: 0 }).blob(10, 10, 1.3, 1.2, R.socket, { noise: 0 });
    P.scratch([[8, 6.5], [7.5, 8.5], [8.3, 9.5]], '#2e2618');
  },
  horns: P => {
    P.tube([[2.5, 14.5], [4.5, 9.5], [8.5, 5.5], [12.5, 3], [14, 1.2]], 2.6, 0.4, R.bone, { spec: 1 });
    P.blob(13.6, 1.8, 1.2, 1.1, R.blood, { spec: 1 }).tube([[13, 2.5], [12.8, 5]], 0.5, 0.4, R.blood);
  },
  abyssal: P => { P.blob(8, 8, 7, 5.5, R.socket, { noise: 0.1 }); P.eye(8, 8, 4.2, '#e8a020', { look: [0, 0] }); },
  nighteyes: P => {
    P.blob(8, 8, 7, 5, R.socket, { noise: 0.1 }).blob(8, 8, 4.2, 3.8, R.murk, { spec: 1 });
    for (let y = 6; y <= 10; y++) P.dot(8, y, '#f0e060');
  },
  // BACK
  spines: P => {
    for (const [x, y] of [[2, 9], [3.5, 3.5], [8, 1.5], [12.5, 3.5], [14, 9]]) P.tube([[8, 13], [x, y]], 1.6, 0.3, R.bone, { spec: 1 });
    P.blob(8, 13.5, 5, 2.5, R.flesh, { spec: 1 });
  },
  barbs: P => {
    for (const [x, y, dx, dy] of [[3, 7, -2, -3], [8, 4.5, 0, -3.5], [13, 7, 2, -3], [2.5, 11, -2.5, 0.5], [13.5, 11, 2.5, 0.5]]) P.tube([[x, y], [x + dx, y + dy]], 1.1, 0.3, R.bone);
    P.blob(8, 10, 6, 4.5, R.flesh, { spec: 1, noise: 0.25 });
  },
  chitin: P => {
    P.blob(8, 9, 7, 5.6, R.chitin, { spec: 1 });
    P.scratch([[5, 4], [4.5, 9], [5, 14]], '#0e0a06').scratch([[11, 4], [11.5, 9], [11, 14]], '#0e0a06');
  },
  toxic: P => {
    P.tube([[8, 1.5], [8, 8]], 0.5, 3.8, R.bile, { spec: 1 });
    P.blob(8, 10.5, 4.6, 4.2, R.bile, { spec: 1 });
    P.vein(6, 11, 4, '#5a0c12', 0.4).vein(10, 9, 3, '#5a0c12', 2);
  },
  membrane: P => {
    P.blob(8, 8, 6.8, 6.4, R.cyst, { shift: 0.1, noise: 0.35 });
    P.vein(4, 6, 6, '#cc8aa0', 0.6).vein(10, 12, 5, '#cc8aa0', -2);
    P.tube([[1, 14.5], [15, 1.5]], 0.9, 0.6, R.bone, { spec: 1 });
  },
  // LIMBS
  twitch: P => {
    P.blob(2.5, 12.5, 1.8, 1.6, R.bone).blob(13.5, 3.5, 1.8, 1.6, R.bone);
    P.tube([[3, 12], [8, 8], [13, 4]], 3.1, 2.2, R.muscle, { spec: 1 });
    for (let k = 0; k < 5; k++) P.scratch([[4 + k * 2, 13 - k * 2], [5.5 + k * 2, 9.5 - k * 2]], '#d8705a');
  },
  marrow: P => {
    P.tube([[3.5, 12.5], [12.5, 3.5]], 2.3, 2.3, R.bone, { spec: 1 });
    P.blob(2.6, 12, 1.9, 1.9, R.bone).blob(4, 13.4, 1.9, 1.9, R.bone).blob(12, 2.6, 1.9, 1.9, R.bone).blob(13.4, 4, 1.9, 1.9, R.bone);
    P.scratch([[6.5, 8], [8, 9], [7.5, 10.5]], '#5a0c12');
    P.blob(8.5, 7.5, 1, 1, R.blood, { spec: 1 });
  },
  adrenal: P => {
    P.tube([[8, 15], [8, 11]], 1, 1, R.blood).tube([[5, 14.5], [6, 11]], 0.8, 0.8, R.blood);
    P.blob(8, 7.5, 5.4, 4.6, R.pus, { spec: 1, noise: 0.25 });
    P.vein(5, 7, 5, '#7a1420', 0.2).vein(10, 9, 4, '#7a1420', -1.8);
  },
  slam: P => {
    for (const [x, w] of [[3.5, 2.2], [12, 2.4]]) P.blob(x, 14.5, w, 1, R.stone);
    P.tube([[14, 1], [11, 6], [8, 9.5]], 2.8, 2.2, R.flesh, { spec: 1 });
    P.blob(7, 11, 3.6, 2.8, R.flesh, { spec: 1 });
    P.scratch([[2, 15.5], [5, 13.5]], '#060404').scratch([[9, 15.5], [11, 13.8], [14, 15]], '#060404');
  },
  // LIMBS
  spider: P => {
    for (const [a, b, d] of [[[7, 8], [3, 4.5], [1, 8.5]], [[7, 9], [2.5, 9], [1, 13]], [[7, 9.5], [3.5, 12.5], [2.5, 15]], [[7.5, 7.5], [5, 2.5], [3, 3.5]]]) {
      P.tube([a, b, d], 0.8, 0.4, R.chitin); P.tube([[16 - a[0], a[1]], [16 - b[0], b[1]], [16 - d[0], d[1]]], 0.8, 0.4, R.chitin);
    }
    P.blob(8, 9.5, 3, 3, R.chitin, { spec: 1 }).blob(8, 6, 1.8, 1.6, R.chitin, { spec: 1 });
  },
  wings: P => { wing(P, 2, 14, 13, 2.5, 3.4); wing(P, 2.5, 14, 14.5, 10, 2.4); },
  hindlegs: P => {
    P.blob(6, 6, 3.8, 3.2, R.flesh, { spec: 1 });
    P.tube([[7, 8.5], [11, 11], [8.5, 14]], 1.7, 1, R.flesh, { spec: 1 }).tube([[8.5, 14], [14.5, 14.6]], 1, 0.6, R.flesh);
  },
  grapple: P => {
    P.tube([[1, 15], [4.5, 11.5], [8, 8], [12, 4]], 1.9, 0.9, R.flesh, { spec: 1 });
    for (const [x, y] of [[4, 12.5], [7, 9.5], [10, 6.5]]) P.dot(x, y, '#d09a90');
    P.tube([[12, 4], [14, 2], [14.5, 4]], 0.8, 0.4, R.bone);
  },  // CORE
  mitosis: P => {
    P.blob(5.5, 8, 4.4, 4.4, R.cyst, { spec: 1 }).blob(10.5, 8, 4.4, 4.4, R.cyst, { spec: 1 });
    P.blob(5, 8, 1.6, 1.5, R.urchin, { noise: 0.05 }).blob(11, 8, 1.6, 1.5, R.urchin, { noise: 0.05 });
    P.scratch([[8, 4.5], [8, 11.5]], '#2a1020');
  },
  hide: P => {
    P.blob(8, 12, 6.6, 2.6, R.flesh, { shift: -0.15 }).blob(8, 8.5, 6.8, 2.8, R.flesh).blob(8, 5, 6.2, 2.6, R.flesh, { spec: 1 });
    for (const x of [4, 7, 10, 13]) P.dot(x, 6.8, '#d8ccb0');
  },
  regrow: P => {
    P.blob(8, 13, 5.5, 2.6, R.flesh, { shift: -0.2 });
    P.tube([[8, 13], [7.3, 9], [8.6, 5], [8, 2.5]], 2.3, 1, R.pink, { spec: 1 });
    P.tube([[7.5, 8], [4.5, 6]], 0.9, 0.4, R.pink).tube([[8.4, 6], [11.5, 4.5]], 0.8, 0.4, R.pink);
  },
  hemophage: P => {
    P.tube([[8, 0.5], [8, 7], [7.2, 10.5]], 2.8, 0.4, R.bone, { spec: 1 });
    P.blob(7.2, 13.2, 1.4, 1.8, R.blood, { spec: 1 }).blob(7.2, 11.3, 0.7, 1, R.blood);
  },
  secondheart: P => {
    for (const [x, y, s] of [[5.5, 5.5, 0.8], [10.5, 10, 1]]) {
      P.tube([[x, y + 0.6 * s], [x, y + 4 * s]], 3 * s, 0.5, R.blood);
      P.blob(x - 1.6 * s, y, 1.9 * s, 1.9 * s, R.blood, { spec: 1 }).blob(x + 1.6 * s, y, 1.9 * s, 1.9 * s, R.blood, { spec: 1 });
    }
  },
  overgrown: P => {
    P.tube([[6, 6], [5, 1.5]], 1.5, 1.2, R.blood).tube([[10, 5.5], [11.5, 1.2]], 1.3, 1, R.blood);
    P.blob(8, 9.5, 6, 5.4, R.blood, { spec: 1 });
    P.vein(5, 9, 6, '#2a0608', 0.4).vein(10, 12, 5, '#2a0608', -2.2);
  },
  starving: P => {
    P.tube([[8, 1], [8, 15]], 0.9, 0.9, R.bone);
    for (let k = 0; k < 4; k++) {
      const y = 3.5 + k * 3;
      P.tube([[8, y], [4, y + 0.5], [2.5, y + 2.5]], 0.6, 0.5, R.bone).tube([[8, y], [12, y + 0.5], [13.5, y + 2.5]], 0.6, 0.5, R.bone);
    }
  },
  cancer: P => {
    for (const [x, y, r] of [[6, 9, 3.6], [10.5, 7, 3.2], [9.5, 12, 2.6], [4, 13, 1.8], [12.5, 11.5, 1.6], [7.5, 4, 1.8]]) P.blob(x, y, r, r * 0.9, R.cyst, { spec: 1, noise: 0.2 });
    P.dot(6, 9, '#2a1020').dot(10, 6.5, '#2a1020');
  },
};

function paintIcon(id) {
  const P = new Painter(16, 16, 90 + id.length);
  ICON_PAINT[id](P);
  return P.outline().toCanvas();
}

// Combined mutations: both parts side by side.
function comboIcon(a, b) {
  const c = makeCanvas(16, 16), x = c.getContext('2d');
  x.drawImage(SPR.icons[a], -3, -2);
  x.drawImage(SPR.icons[b], 3, 2);
  return c;
}

// A node's art: its own painting, a pair it borrows (`icon: ['a', 'b']` or
// 'a'), or failing that, its parent's.
function mutIcon(id) {
  if (SPR.icons[id]) return SPR.icons[id];
  const d = MUTATIONS[id];
  if (!d) return null;
  if (Array.isArray(d.icon)) return (SPR.icons[id] = comboIcon(d.icon[0], d.icon[1]));
  if (d.icon) return (SPR.icons[id] = mutIcon(d.icon));
  return d.from ? mutIcon(d.from) : null;
}

// --- HUD art --------------------------------------------------------------------
const HUD_RAMP = ['#070506', '#0e0b0c', '#151112', '#1d1718', '#272021'];

// A grimy riveted metal strip with rust and blood smears.
function paintHudBar(h, seed, panels) {
  const P = new Painter(VIEW_W, h, seed);
  P.rect(0, 0, VIEW_W - 1, h - 1, HUD_RAMP, 0.42, { noise: 0.3 });
  for (let i = 0; i < 6; i++) P.blob(rand(10, VIEW_W - 10), rand(2, h - 2), rand(4, 12), rand(2, 4), R.rust, { shift: -0.45, noise: 0.3 });
  for (let i = 0; i < 3; i++) P.blob(rand(10, VIEW_W - 10), rand(2, h - 2), rand(3, 8), rand(1.5, 3), R.blood, { shift: -0.5, noise: 0.3 });
  for (const p of panels || []) {
    // A recessed panel.
    P.rect(p[0], p[1], p[0] + p[2] - 1, p[1] + p[3] - 1, HUD_RAMP, 0.08, { noise: 0.12 });
    P.scratch([[p[0], p[1] + p[3]], [p[0] + p[2], p[1] + p[3]]], '#2e2627');
    P.scratch([[p[0] + p[2], p[1]], [p[0] + p[2], p[1] + p[3]]], '#2e2627');
  }
  for (let x = 6; x < VIEW_W; x += 52) for (const y of [2, h - 3]) { P.dot(x, y, '#3e3434'); P.dot(x + 1, y + 1, '#060404'); }
  return P.toCanvas();
}

function bakeHud() {
  if (SPR.hudTop) return;
  SPR.hudTop = paintHudBar(ROOM_Y, 101, [[106, 2, 108, 13], [VIEW_W - 70, 1, 68, 29]]);
  SPR.hudBottom = paintHudBar(VIEW_H - ROOM_Y - ROOM_PX_H, 102, []); // slot panels are drawn live (drawMutationList)
  SPR.dnaTube = paintDnaTube(100);
}

// Empty glass tube for the DNA meter (the fluid is drawn live).
function paintDnaTube(w) {
  const P = new Painter(w, 9, 81);
  for (let x = 0; x < w; x++) for (let y = 0; y < 9; y++) {
    const edge = y === 0 || y === 8 || x < 2 || x >= w - 2;
    if (edge) P.set(x, y, y === 0 ? '#5a6a66' : '#2a3432', R.murk);
    else P.set(x, y, y === 1 ? '#1e2a28' : '#0a100e', R.murk);
  }
  P.blob(1.5, 4.5, 2.5, 4.2, R.metal).blob(w - 1.5, 4.5, 2.5, 4.2, R.metal);
  return P.toCanvas();
}

// ---------------------------------------------------------------------------
// Art for the second batch of mutations (limbs, senses, organs...).
// ---------------------------------------------------------------------------
const SHELL = ['#1e140c', '#3e2c1a', '#6a4c2c', '#9a7444', '#c8a26a'];

function spiral(P, cx, cy, r, turns, color) {
  const pts = [];
  for (let a = 0; a < turns * Math.PI * 2; a += 0.3) {
    const rr = r * (1 - a / (turns * Math.PI * 2));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
  }
  P.scratch(pts, color);
}

Object.assign(OVERLAY_PAINT, {
  // --- limbs ---
  scythes: P => {
    P.tube([[16, 18], [18, 13], [20.5, 10]], 1.1, 0.7, R.chitin).tube([[20.5, 10], [23, 12.5], [22.6, 16]], 1, 0.3, R.bone, { spec: 1 });
    P.tube([[14, 18.5], [15.5, 13.5], [17.5, 11]], 1, 0.6, R.chitin, { shift: 0.15 }).tube([[17.5, 11], [19.5, 13], [19.2, 16]], 0.9, 0.3, R.bone);
  },
  centlegs: P => { for (let x = 3; x <= 19; x += 2) P.tube([[x, 20], [x - 1, 23]], 0.5, 0.4, R.chitin); },
  claws: P => {
    P.tube([[17, 19], [19.5, 21], [21.5, 21.8]], 1.4, 1, R.flesh);
    for (const dy of [-1, 0.5, 2]) P.tube([[21.5, 21.5 + dy * 0.5], [23.5, 21 + dy]], 0.6, 0.3, R.bone);
  },
  shell: P => { P.blob(9.5, 13.5, 6, 5, SHELL, { spec: 1, noise: 0.2 }); spiral(P, 9.5, 13.5, 5, 2.2, '#2a1c10'); },
  fins: P => { P.blob(7, 20.2, 3.2, 1.3, R.cyst, { spec: 1 }).blob(12.5, 20.8, 3.2, 1.3, R.cyst, { spec: 1 }).blob(17, 20.2, 2.4, 1.1, R.cyst); },
  cilia: P => { for (let x = 2.5; x <= 20; x += 1.5) P.tube([[x, 20.5], [x + 0.6, 22.8]], 0.4, 0.3, R.pink, { noise: 0.05 }); },
  hands: P => {
    for (const hx of [8, 15.5]) {
      P.blob(hx, 21.2, 1.9, 1.2, R.pink, { spec: 1 });
      for (let k = -1; k <= 2; k++) P.tube([[hx + k * 0.9, 21.8], [hx + k * 1.1, 23.6]], 0.45, 0.35, R.pink);
    }
  },
  // --- mouth ---
  proboscis: P => P.tube([[20.5, 16.8], [22.5, 17.2], [23.6, 18.6]], 1.1, 0.5, R.pink, { spec: 1 }),
  sporepods: P => { for (const [x, y, r] of [[15.5, 11.6, 1.5], [18.2, 10.8, 1.3], [20.4, 11.8, 1.1]]) { P.blob(x, y, r, r, R.rot, { spec: 1 }); P.dot(x, y, '#c8d090'); } },
  leech: P => { P.blob(21.5, 17, 2, 2, R.pink, { spec: 1 }); P.blob(21.5, 17, 1.1, 1.1, R.socket, { noise: 0 }); P.dot(21, 16, '#e6dcc0').dot(22.3, 16.3, '#e6dcc0').dot(21.3, 18, '#e6dcc0'); },
  // --- head ---
  antennae: P => P.tube([[17, 11.5], [15, 6], [11, 1.5]], 0.5, 0.4, R.chitin).tube([[19.2, 11.5], [20.8, 6], [23.2, 2]], 0.5, 0.4, R.chitin),
  echo: P => { P.blob(17.6, 11.6, 3.2, 1.6, R.bone, { spec: 1 }); P.dot(16.4, 11.6, '#2e2618').dot(18.6, 11.4, '#2e2618'); },
  compound: P => { P.blob(18.6, 13.2, 2.8, 2.6, R.murk, { spec: 1 }); for (let y = 11.5; y < 15; y += 1.5) for (let x = 17; x < 20.5; x += 1.5) P.dot(x, y, '#5a8a7a'); },
  parasite: P => { P.tube([[14.5, 12.5], [16.5, 10], [19, 10.2], [20.6, 8.8]], 1.1, 0.7, R.cyst, { spec: 1 }); P.dot(20.6, 8.6, '#140a10'); },
  // --- back ---
  eggs: P => { for (const [x, y, r] of [[6, 14.2, 1.4], [8.2, 13.6, 1.3], [7, 15.6, 1.2], [9.8, 14.6, 1.2], [5, 15.8, 1]]) P.blob(x, y, r, r * 1.1, R.belly, { spec: 1, noise: 0.05 }); },
  pustules: P => { for (const [x, y, r] of [[6, 16, 1.2], [10, 15, 1], [13.5, 15.5, 1.1], [8, 18.5, 0.9], [15.5, 17.6, 0.9]]) P.blob(x, y, r, r, R.pus, { spec: 1 }); },
  moltshell: P => { P.blob(10, 14.4, 5.4, 2.2, R.chitin, { shift: 0.2, noise: 0.3 }); P.scratch([[7, 13], [8.5, 15], [10, 13.5], [12, 15.2]], '#120c08'); },
  lure: P => { P.tube([[11, 13.5], [9.5, 8.5], [12.5, 5]], 0.6, 0.5, R.flesh); P.blob(13, 4.8, 1.5, 1.5, R.pus, { spec: 1, specColor: '#ffffd0' }); },
  // --- core ---
  brood: P => { for (const [x, y, r] of [[9, 18, 1.4], [12, 18.4, 1.2], [10.6, 16.8, 1]]) P.blob(x, y, r * 1.4, r, R.belly, { spec: 1 }); },
  calcified: P => { P.blob(7, 16.2, 2.2, 1.3, R.bone, { spec: 1 }).blob(11.2, 15, 2.4, 1.3, R.bone, { spec: 1 }).blob(14.6, 16.2, 1.8, 1.1, R.bone); },
  hollow: P => { for (const [x, y, r] of [[8, 17.4, 1.3], [12, 16.2, 1.1], [15, 17.8, 0.9], [5.5, 18.6, 0.8]]) P.blob(x, y, r, r * 0.9, R.socket, { noise: 0 }); },
});

Object.assign(ICON_PAINT, {
  mantis: P => { P.tube([[3, 15], [6, 9], [10, 4]], 1.6, 1, R.chitin).tube([[10, 4], [14, 7], [13.5, 13]], 1.4, 0.3, R.bone, { spec: 1 }); },
  centipede: P => { for (let k = 0; k < 5; k++) { const x = 2.5 + k * 2.8, y = 12 - k * 1.8; P.tube([[x, y], [x - 1.5, y + 3]], 0.5, 0.4, R.chitin).tube([[x, y], [x + 1.5, y + 3]], 0.5, 0.4, R.chitin); P.blob(x, y, 1.8, 1.5, R.chitin, { spec: 1 }); } },
  burrow: P => { P.blob(8, 13, 7, 2.6, R.stone); P.tube([[4, 4], [7, 8.5], [9, 12]], 1.8, 1.2, R.flesh); for (const dx of [-1.5, 0, 1.5]) P.tube([[9 + dx * 0.5, 11.5], [10 + dx, 14]], 0.6, 0.3, R.bone); },
  shell: P => { P.blob(8, 8.5, 6.5, 6, SHELL, { spec: 1, noise: 0.2 }); spiral(P, 8, 8.5, 5.5, 2.4, '#2a1c10'); },
  fins: P => { P.tube([[2, 13], [7, 9], [13, 3]], 1, 3.2, R.cyst, { spec: 1 }); P.scratch([[3, 13], [12, 4]], '#52223e'); },
  stilts: P => { P.blob(8, 3.5, 4, 2.2, R.flesh, { spec: 1 }); for (const [a, b] of [[5, 2], [7, 6], [9, 10], [11, 14]]) P.tube([[a + 1, 5], [b, 15]], 0.6, 0.5, R.bone); },
  cilia: P => { P.blob(8, 8, 5, 4.5, R.pink, { spec: 1 }); for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; P.tube([[8 + Math.cos(a) * 5, 8 + Math.sin(a) * 4.5], [8 + Math.cos(a) * 7.2, 8 + Math.sin(a) * 6.8]], 0.4, 0.3, R.pink); } },
  hands: P => { P.blob(8, 10, 4, 3.6, R.pink, { spec: 1 }); for (let k = 0; k < 4; k++) P.tube([[5.5 + k * 1.7, 7.5], [5 + k * 2, 2]], 0.9, 0.6, R.pink); P.tube([[4.5, 10.5], [1.5, 8.5]], 0.9, 0.6, R.pink); },
  proboscis: P => { P.blob(4, 11, 3.5, 3, R.flesh, { spec: 1 }); P.tube([[6.5, 10], [10, 7], [13, 3.5], [14.5, 2]], 1.2, 0.5, R.pink, { spec: 1 }); P.blob(14.5, 2, 0.8, 0.8, R.blood); },
  spores: P => { for (const [x, y, r] of [[5, 10, 3.4], [10.5, 7.5, 3.8], [9, 12.5, 2.5], [13, 12, 2]]) P.blob(x, y, r, r, R.rot, { noise: 0.35 }); for (const [x, y] of [[4, 4], [8, 2.5], [13, 3]]) P.dot(x, y, '#9aae50'); },
  vomit: P => { P.blob(3, 8, 2.6, 3, R.flesh, { spec: 1 }); for (let k = 0; k < 9; k++) P.blob(6 + k * 1.1, 8 + (hash2(k, 1, 3) - 0.5) * k * 1.1, 1.2, 1, R.bile, { spec: 1 }); },
  leech: P => { P.blob(8, 8, 6.5, 6.5, R.pink, { spec: 1 }); P.blob(8, 8, 3.5, 3.5, R.socket, { noise: 0 }); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; P.dot(8 + Math.cos(a) * 3.2, 8 + Math.sin(a) * 3.2, '#e6dcc0'); } },
  antennae: P => { P.blob(8, 13, 3.5, 2.5, R.chitin, { spec: 1 }); P.tube([[6.5, 11], [4, 6], [1.5, 1.5]], 0.6, 0.4, R.chitin).tube([[9.5, 11], [12, 6], [14.5, 1.5]], 0.6, 0.4, R.chitin); },
  echo: P => { P.blob(7, 9, 5, 4.5, R.bone, { spec: 1 }); P.blob(5.5, 9, 1.2, 1.2, R.socket, { noise: 0 }).blob(8.5, 9, 1.2, 1.2, R.socket, { noise: 0 }); for (const r of [2.5, 4.5]) P.scratch([[12, 9 - r], [12 + r * 0.6, 9], [12, 9 + r]], '#c4b898'); },
  compound: P => { P.blob(8, 8, 6.6, 6, R.murk, { spec: 1 }); for (let y = 3; y < 14; y += 2) for (let x = 3 + (y % 4 ? 1 : 0); x < 14; x += 2) P.dot(x, y, '#5a8a7a'); },
  parasite: P => { P.tube([[2, 14], [5, 10], [9, 11], [11, 7], [13.5, 4]], 1.8, 1, R.cyst, { spec: 1 }); P.dot(13.5, 3.8, '#140a10').dot(14.2, 4.4, '#140a10'); },
  eggsac: P => { for (const [x, y, r] of [[5, 6, 2.6], [10, 5.5, 2.4], [7.5, 10, 2.6], [12, 10.5, 2.2], [4, 11.5, 2]]) P.blob(x, y, r, r * 1.1, R.belly, { spec: 1, noise: 0.05 }); },
  pustules: P => { P.blob(8, 9, 6.5, 5, R.flesh, { noise: 0.2 }); for (const [x, y, r] of [[5, 7, 1.8], [10, 6.5, 1.5], [8, 11, 1.7], [12, 10.5, 1.2]]) P.blob(x, y, r, r, R.pus, { spec: 1 }); },
  molt: P => { P.blob(8, 8.5, 6.5, 5.5, R.chitin, { shift: 0.15, noise: 0.35 }); P.scratch([[3, 5], [6, 8], [5, 11], [9, 13]], '#120c08').scratch([[10, 3], [9, 7], [12, 10]], '#120c08'); },
  lure: P => { P.tube([[2, 15], [4, 8], [8, 4], [11, 4.5]], 0.8, 0.6, R.flesh); P.blob(12, 5.5, 3, 3, R.pus, { spec: 1, specColor: '#ffffd0' }); },
  brood: P => { for (const [x, y] of [[5, 6], [10.5, 8], [6.5, 12]]) { P.blob(x, y, 3, 1.8, R.belly, { spec: 1 }); P.scratch([[x - 1, y - 1.5], [x - 1, y + 1.5]], '#7a7448').scratch([[x + 1, y - 1.5], [x + 1, y + 1.5]], '#7a7448'); } },
  bacteria: P => { for (const [x, y, a] of [[4, 5, 0.5], [10, 4, -0.4], [6, 11, -0.2], [12, 11, 0.7]]) P.tube([[x - Math.cos(a) * 2.5, y - Math.sin(a) * 2.5], [x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5]], 1.3, 1.3, R.bile, { spec: 1 }); },
  twin: P => { P.blob(5.5, 10, 4.5, 3, ['#5a3a44', '#a06a78', '#d898a4', '#f4c0c4', '#fff0ee'], { spec: 1 }); P.blob(11.5, 8, 3, 2.2, ['#5a3a44', '#a06a78', '#d898a4', '#f4c0c4', '#fff0ee'], { spec: 1 }); P.dot(6, 9.5, '#140a10').dot(12.2, 7.6, '#140a10'); },
  calcified: P => { P.blob(8, 8.5, 6, 5.5, R.blood, { spec: 1 }); P.blob(5.5, 6.5, 2.4, 1.6, R.bone, { spec: 1 }).blob(10, 10.5, 2.6, 1.6, R.bone, { spec: 1 }).blob(11, 5.5, 1.8, 1.3, R.bone); },
  hollow: P => { P.blob(8, 8.5, 6.5, 6, R.flesh, { spec: 1 }); for (const [x, y, r] of [[5.5, 6.5, 1.6], [10, 8, 1.9], [6.5, 11.5, 1.3], [11, 12, 1]]) P.blob(x, y, r, r, R.socket, { noise: 0 }); },
});

// --- Floor 1: Petri Labs ------------------------------------------------------------------
const CULTURE = ['#2a1c22', '#5a4048', '#8a6a70', '#b8969a', '#e0c8c8'];
const GRUB = ['#1a1814', '#3a3428', '#6a5e48', '#9a8c70', '#c4b898'];

function paintCulture(swollen) {
  const P = new Painter(20, 16, swollen ? 52 : 51);
  if (swollen) { // pinching in two, about to divide
    P.blob(6.5, 9, 5, 4.8, CULTURE, { spec: 1, noise: 0.08 }).blob(13.5, 9, 5, 4.8, CULTURE, { spec: 1, noise: 0.08 });
    P.blob(6, 9, 1.8, 1.6, R.cyst, { noise: 0 }).blob(14, 9, 1.8, 1.6, R.cyst, { noise: 0 });
    P.scratch([[10, 5], [10, 13]], '#5a4048');
  } else {
    P.blob(10, 9, 5.5, 4.6, CULTURE, { spec: 1, noise: 0.08 });
    P.blob(10, 9, 2, 1.8, R.cyst, { noise: 0 });
  }
  for (let i = 0; i < 4; i++) P.dot(5 + hash2(i, 1, 51) * 10, 6 + hash2(i, 2, 51) * 6, '#e0c8c8');
  return P.outline().toCanvas();
}

function paintScavenger() {
  const P = new Painter(14, 9, 53);
  P.blob(6, 5, 5, 2.4, GRUB, { spec: 1 });
  for (const x of [3, 5, 7]) P.scratch([[x, 3], [x, 7]], '#3a3428');
  P.blob(11, 5, 1.6, 1.5, R.chitin, { spec: 1 });
  P.tube([[12, 4.5], [13.5, 4]], 0.4, 0.3, R.chitin).tube([[12, 5.5], [13.5, 6.2]], 0.4, 0.3, R.chitin);
  return P.outline().toCanvas();
}

// Engorged: a swollen, translucent sack with stolen DNA glowing inside.
// `glow` = the brighter frame it pulses to when it's about to escape.
function paintScavengerFat(glow) {
  const P = new Painter(17, 13, 54);
  P.blob(7, 7, 6.6, 5, GRUB, { spec: 1, shift: 0.15 });
  for (const [x, y, r] of [[5, 6, 1.4], [8.5, 8, 1.2], [6.5, 9.5, 0.9], [9, 5, 0.8]]) P.blob(x, y, r, r, R.pink, { spec: 1, shift: glow ? 0.35 : 0 });
  P.vein(3, 7, 4, '#6a2a44', 0.3).vein(10, 9, 3, '#6a2a44', -1.5);
  P.blob(14, 7, 1.6, 1.5, R.chitin, { spec: 1 });
  P.tube([[15, 6.5], [16.5, 6]], 0.4, 0.3, R.chitin).tube([[15, 7.5], [16.5, 8.2]], 0.4, 0.3, R.chitin);
  return P.outline().toCanvas();
}

// The Mother Culture: a vast sac of culture with half-formed specimens inside.
function paintMother(frame, small) {
  const W = small ? 30 : 50, H = small ? 26 : 42;
  const P = new Painter(W, H, small ? 57 : 55);
  const k = small ? 0.58 : 1, cx = W / 2, cy = H / 2 + 1, sw = frame ? 1 : 0;
  const S = (x, y) => [cx + x * k, cy + y * k];
  P.blob(...S(0, 3), (21 + sw) * k, (15 + sw) * k, CULTURE, { spec: 1, noise: 0.1 });
  P.blob(...S(-9, -6), 10 * k, (9 + sw * 0.5) * k, CULTURE, { spec: 1, noise: 0.1 });
  P.blob(...S(9, -7), 11 * k, (9 + sw * 0.5) * k, CULTURE, { spec: 1, noise: 0.1 });
  // Embryos curled up inside: little pale slugs, like you once were.
  const embryos = small ? [[0, 3]] : [[-10, 4], [8, 6], [-1, -3]];
  for (const [ex, ey] of embryos) {
    P.blob(...S(ex, ey), 4.2 * k, 2.4 * k, ['#5a3a44', '#8a5a64', '#b08088', '#cca0a4', '#e0bcbc'], { noise: 0.05, shift: -0.15 });
    P.blob(...S(ex + 3.5, ey - 1), 2.2 * k, 2 * k, ['#5a3a44', '#8a5a64', '#b08088', '#cca0a4', '#e0bcbc'], { noise: 0.05, shift: -0.15 });
    P.dot(...S(ex + 4, ey - 1.5), '#2a1418');
  }
  for (const [vx, vy, l, d] of [[-14, 8, 8, -0.5], [12, 10, 7, -2.5], [0, -10, 6, 1.4], [-6, 12, 6, 0.2]]) P.vein(...S(vx, vy), l * k, '#5a4048', d);
  // Eyes opening in the membrane.
  P.blob(...S(0, -8), 3.4 * k, 3 * k, R.socket, { noise: 0 }); P.eye(...S(0, -8), 2.6 * k, '#7a2014', { bloodshot: true });
  if (!small) {
    P.blob(...S(-12, 0), 2.2, 2, R.socket, { noise: 0 }); P.eye(...S(-12, 0), 1.6, '#5a5040', { milky: true });
    P.blob(...S(12, 2), 2.4, 2.2, R.socket, { noise: 0 }); P.eye(...S(12, 2), 1.8, '#7a2014', { bloodshot: true });
  }
  // The birth canal at the bottom.
  P.blob(...S(0, 14), 5 * k, 2.4 * k, R.socket, { noise: 0 });
  P.tube([S(-3, 16), S(-3.5, 19)], 0.9 * k, 0.6 * k, CULTURE).tube([S(4, 16), S(4.5, 20)], 0.8 * k, 0.5 * k, CULTURE);
  return P.outline().toCanvas();
}

// Little things that live with you.
function paintSpiderling() {
  const P = new Painter(10, 8, 17);
  for (const [a, b] of [[[4, 4], [1, 2]], [[4, 5], [0.5, 6.5]], [[6, 4], [9, 2]], [[6, 5], [9.5, 6.5]]]) P.tube([a, b], 0.5, 0.4, R.chitin);
  P.blob(5, 4.5, 2.2, 2, R.chitin, { spec: 1 }).blob(7, 3.8, 1.3, 1.2, R.chitin);
  P.dot(7.5, 3.5, '#e01828');
  return P.outline().toCanvas();
}

function paintMaggot() {
  const P = new Painter(10, 6, 19);
  P.blob(5, 3.4, 4.2, 2, R.belly, { spec: 1 });
  for (const x of [3, 5, 7]) P.scratch([[x, 2], [x, 4.8]], '#7a7448');
  P.dot(8.5, 3, '#2a2418');
  return P.outline().toCanvas();
}

function paintSegment() {
  const P = new Painter(12, 10, 21);
  for (const x of [3, 6, 9]) P.tube([[x, 6], [x - 1, 9.5]], 0.5, 0.4, R.chitin);
  P.blob(6, 5, 5, 3.4, R.chitin, { spec: 1 });
  P.scratch([[3, 3], [3, 7]], '#120c08').scratch([[9, 3], [9, 7]], '#120c08');
  return P.outline().toCanvas();
}
// ---------------------------------------------------------------------------
// Bake everything into canvases once at startup.
// ---------------------------------------------------------------------------

// Darkened copy of a sprite, used for corpses left on the floor.
function darkened(src) {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = 'rgba(20,4,8,0.6)';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// Registers a sprite plus its left-facing, white-flash, red-outline and corpse versions.
function withFlash(name, img) {
  for (const [n, i] of [[name, img], [name + '_L', flipH(img)]]) {
    SPR[n] = i;
    SPR[n + '_flash'] = silhouette(i, '#f4e8dc');
    SPR[n + '_elite'] = silhouette(i, PAL.red);
    SPR[n + '_dead'] = darkened(i);
  }
}

(function bakeSprites() {
  // The specimen at each of its 5 stages: [stage] -> { body, body2 (breathing), _L versions, hurt, overlays }
  SPR.stages = STAGE_SCALE.map((_, st) => {
    const body = paintSpecimen(STAGE_RAMP[st], { stage: st });
    const body2 = paintSpecimen(STAGE_RAMP[st], { stage: st, breath: 0.5 });
    const o = { body, body2, body_L: flipH(body), body2_L: flipH(body2), hurt: silhouette(body, PAL.red), overlay: {}, overlay_L: {} };
    for (const id in OVERLAY_PAINT) {
      o.overlay[id] = paintOverlay(OVERLAY_PAINT[id], st);
      o.overlay_L[id] = flipH(o.overlay[id]);
    }
    return o;
  });
  // Each set's body form at each stage: SPR.forms[set][stage] -> { body, body2, _L versions, hurt }
  SPR.forms = {};
  for (const f in FORM_PAINT) {
    SPR.forms[f] = STAGE_SCALE.map((_, st) => {
      const body = paintForm(f, st), body2 = paintForm(f, st, 0.5);
      return { body, body2, body_L: flipH(body), body2_L: flipH(body2), hurt: silhouette(body, PAL.red) };
    });
  }
  // Full-grown versions (used by the title screen).
  SPR.blob = SPR.stages[3].body;
  SPR.overlay = SPR.stages[3].overlay;

  SPR.bossCore = paintBossCore(false); SPR.bossCore2 = paintBossCore(true);
  SPR.icons = {};
  for (const id in ICON_PAINT) SPR.icons[id] = paintIcon(id);

  // Allies & body parts for the extra mutations.
  for (const [name, img] of [['spiderling', paintSpiderling()], ['maggot', paintMaggot()], ['twin', paintPureSpecimen(0, 0, 0.42)], ['polyp', paintPolypAlly()]]) { SPR[name] = img; SPR[name + '_L'] = flipH(img); }
  SPR.segment = paintSegment();

  // (HUD art is baked on first use by bakeHud(), since it needs the room size from world.js.)

  withFlash('rat', paintRat(0));
  withFlash('rat2', paintRat(1));
  withFlash('drone', paintDrone(0));
  withFlash('drone2', paintDrone(1));
  withFlash('urchin', paintUrchin(0));
  withFlash('splitter', paintSpecimen(R.rot, { seed: 13, stitches: true, milky: true }));
  withFlash('mini', paintMini());
  withFlash('spitter', paintToad());
  // Floor 1
  withFlash('culture', paintCulture(false));
  withFlash('culture2', paintCulture(true));
  withFlash('scavenger', paintScavenger());
  withFlash('scavengerfat', paintScavengerFat(false));
  withFlash('scavengerfat2', paintScavengerFat(true));
  withFlash('mother', paintMother(0, false));
  withFlash('mother2', paintMother(1, false));
  withFlash('motherling', paintMother(0, true));
  withFlash('motherling2', paintMother(1, true));

  SPR.heart = paintHeart(R.blood);
  SPR.heartEmpty = paintHeart(R.empty);
  SPR.vials = {};
  SPR.hatch = paintHatch();

  SPR.crates = [1, 2, 3].map(paintCrate);
  SPR.barrels = [4, 5].map(paintBarrel);
  SPR.tanks = [6, 7].map(s => paintTank(s, false));
  SPR.tankBroken = paintTank(8, true);
  SPR.rubble = [9, 10, 11].map(paintRubble);
  SPR.doors = {
    h_open: paintDoor(true, false), h_locked: paintDoor(true, true),
    v_open: paintDoor(false, false), v_locked: paintDoor(false, true),
  };
  for (const horiz of [true, false]) {
    const k = horiz ? 'h_' : 'v_';
    for (const d of [0, 1, 2]) SPR.doors[k + 'hazmat' + d] = paintHazmat(horiz, d);
    SPR.doors[k + 'hazmatFlash'] = silhouette(SPR.doors[k + 'hazmat0'], '#fff0c0');
  }
})();

function vialSprite(color) {
  if (!SPR.vials[color]) SPR.vials[color] = paintVial(color);
  return SPR.vials[color];
}

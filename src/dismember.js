'use strict';
// ---------------------------------------------------------------------------
// Dismemberment: enemies lose parts as they're hurt, and the parts fly.
//
// An enemy's parts come from its painter layers (see Painter.part / ANATOMY in
// sprites.js). e.missing lists the parts torn off; it's drawn with raw stumps
// (anatSprite), and losing a part changes how it fights:
//   leg  - it slows (no legs left: it drags itself)
//   arm  - it attacks less often
//   head - it can't see you, and bleeds out
// A severed part tumbles away trailing its fluid, splats on walls, then lies
// on the floor. Walk over it and you eat it (a little biomass, taken from what
// its corpse would have held). Past LIMB_CAP the oldest are painted into the floor.
// ---------------------------------------------------------------------------

const LIMB_CAP = 60;
const LIMB_SHARE = { head: 0.3 }; // of the enemy's DNA, per part (others: LIMB_SHARE_DEFAULT)
const LIMB_SHARE_DEFAULT = 0.15;
const SEVER_HP = [0.66, 0.33];   // crossing these fractions of max HP may cost it a part...
const SEVER_HP_CHANCE = 0.5;     // ...with this chance each
const LIMB_EAT_R = 6;

// Parts it still has.
function intactParts(e) {
  const A = ANATOMY[e.type];
  return A ? Object.keys(A).filter(n => !(e.missing && e.missing.includes(n))) : [];
}

// Where a part sits on the enemy right now (offset from its center), facing included.
function partOffset(e, part) {
  const s = limbSprite(e.type, part), img = SPR[e.type], k = e.drawScale || 1;
  const ox = (s.cx - img.width / 2) * k, oy = (s.cy - img.height / 2) * k;
  return [e.face < 0 ? -ox : ox, oy];
}

// A hit travelling (dx, dy): maybe tear off the part on the side it struck.
function trySever(e, dx, dy, chance) {
  const parts = intactParts(e);
  if (!parts.length || Math.random() >= chance) return false;
  let part = pick(parts);
  if (dx || dy) { // the part facing the blow
    let best = Infinity;
    for (const n of parts) { const [ox, oy] = partOffset(e, n), d = ox * dx + oy * dy + rand(-2, 2); if (d < best) { best = d; part = n; } }
  }
  severPart(e, part, dx, dy);
  return true;
}

// Tear one part off: it's gone from the body (with what that costs it) and flies.
function severPart(e, part, dx = 0, dy = 0, speed = 120) {
  const A = ANATOMY[e.type];
  if (!A || !A[part] || (e.missing && e.missing.includes(part))) return null;
  const was = e.missing || [];
  e.missing = Object.keys(A).filter(n => n === part || was.includes(n)); // canonical order (sprite cache key)
  loseLimb(e, A[part]);
  return spawnLimb(e, part, dx, dy, speed);
}

// Every part left, flung outward (overkill).
function severAll(e) {
  for (const n of intactParts(e)) { const [ox, oy] = partOffset(e, n); severPart(e, n, ox || rand(-1, 1), oy || rand(-1, 1), 170); }
}

// What losing it does to how it fights.
function loseLimb(e, kind) {
  if (kind === 'leg') {
    const A = ANATOMY[e.type], left = intactParts(e).filter(n => A[n] === 'leg').length;
    e.speed *= left ? 0.72 : 0.5; // no legs left: it drags itself
    if (!left) e.legless = true;
  } else if (kind === 'arm') e.rateMul = (e.rateMul || 1) * 0.6;
  else if (kind === 'head') {
    e.headless = true;
    inflict(e, 'blind', { t: 99 });
    if (!ENEMY_TYPES[e.type].robot) inflict(e, 'bleed', { t: 99, dps: e.maxHp / 6 }); // it won't last long (a machine just can't see)
  } else if (kind === 'fin') e.speed *= 0.8;       // it flies crooked
  else if (kind === 'plate') e.plateLost = true;   // the Enforcer's riot plate: hits from the front land now
  else if (kind === 'organ') e.rateMul = (e.rateMul || 1) * 0.8; // the frost gland: less to spit
  else if (kind === 'growth') e.contactDmg = Math.max(1, (e.contactDmg || 1) - 0.5); // spines gone: it hurts less to touch
}

// Called as an enemy takes a (non-tiny) hit: dropping past a threshold can cost it a part.
function severOnHurt(e, dx, dy) {
  if (!ANATOMY[e.type] || e.dead) return;
  const k = e.hp / e.maxHp;
  while ((e.sevStage || 0) < SEVER_HP.length && k < SEVER_HP[e.sevStage || 0]) {
    e.sevStage = (e.sevStage || 0) + 1;
    if (Math.random() < SEVER_HP_CHANCE) trySever(e, dx, dy, 1);
  }
}

function spawnLimb(e, part, dx, dy, speed) {
  const T = ENEMY_TYPES[e.type], s = limbSprite(e.type, part);
  if (!s || !GORE) return null; // gore off: the part is lost, but nothing flies
  const [ox, oy] = partOffset(e, part);
  const d = Math.hypot(dx, dy), ux = d ? dx / d : Math.sign(ox) || 1, uy = d ? dy / d : 0;
  const a = Math.atan2(uy, ux) + rand(-0.6, 0.6), v = rand(speed * 0.6, speed) * (GORE > 1 ? 1 : 0.3);
  const share = T.robot ? 0 : (LIMB_SHARE[ANATOMY[e.type][part]] || LIMB_SHARE_DEFAULT) * (T.dna || 0) * (e.elite ? 3 : 1);
  e.limbDna = (e.limbDna || 0) + share;
  const l = {
    x: e.x + ox, y: e.y + oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 2, vz: rand(40, 90),
    a: 0, va: rand(8, 16) * (Math.random() < 0.5 ? -1 : 1), flip: e.face < 0, scale: e.drawScale || 1,
    type: e.type, part, kind: ANATOMY[e.type][part], img: s.img, fluid: T.fluid, robot: !!T.robot, dna: share, t: 0,
  };
  game.limbs.push(l);
  if (T.robot) burst(l.x, l.y, "#ffd070", 6, 120, 0.25);
  else if (GORE > 1) { bloodSpray(l.x, l.y, ux, uy, 10, T.fluid, 130); bloodSpray(e.x + ox, e.y + oy, -ux, -uy, 4, T.fluid, 60); } // spurts from both ends
  if (game.limbs.length > LIMB_CAP) bakeLimb(game.limbs.shift());
  return l;
}

// Rotated copies of a limb sprite, 16 angles, made once (rotating on the fly would blur the pixels).
const LIMB_ROT = new Map();
function severedFrame(l) {
  const key = l.img;
  let set = LIMB_ROT.get(key);
  if (!set) LIMB_ROT.set(key, set = { n: [], f: [], dark: [] });
  const i = (((Math.round(l.a / (Math.PI / 8)) % 16) + 16) % 16) || 0, side = l.flip ? 'f' : 'n';
  if (!set[side][i]) {
    const src = l.img, sz = Math.ceil(Math.hypot(src.width, src.height)) + 2, c = makeCanvas(sz, sz), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(sz / 2, sz / 2); g.rotate(i * Math.PI / 8); if (l.flip) g.scale(-1, 1);
    g.drawImage(src, -src.width / 2, -src.height / 2);
    set[side][i] = c;
  }
  return set[side][i];
}

function updateLimbs(dt) {
  rotCorpses(dt);
  const room = game.room, p = game.player;
  for (const l of game.limbs) {
    l.t += dt;
    if (l.settled) continue;
    l.vz -= 300 * dt; l.z += l.vz * dt;
    if (l.z <= 0) { // hits the floor: bounce, slap down a little of its fluid
      l.z = 0;
      if (l.vz < -45) { l.vz = -l.vz * 0.35; l.vx *= 0.6; l.vy *= 0.6; l.va *= 0.6; if (!l.robot) stain(l.x, l.y, 1.2, l.fluid); }
      else l.vz = 0;
    }
    const nx = l.x + l.vx * dt, ny = l.y + l.vy * dt;
    if (room && pointSolid(room, nx, ny)) { // splat against the wall, drop back
      if (!l.robot && Math.hypot(l.vx, l.vy) > 50) {
        const d = decalCtx(), x = clamp(nx, 3, ROOM_PX_W - 3), y = clamp(ny, 3, ROOM_PX_H - 3);
        pxCircle(d, x, y, 2, pick(l.fluid));
        for (let i = 0; i < 2; i++) { d.fillStyle = pick(l.fluid); d.fillRect(Math.round(x + rand(-2, 2)), Math.round(y), 1, randInt(3, 7)); }
        Sfx.play('splat');
      }
      l.vx *= -0.3; l.vy *= -0.3;
    } else { l.x = nx; l.y = ny; }
    l.a += l.va * dt;
    if (l.z === 0) { const f = Math.pow(0.015, dt); l.vx *= f; l.vy *= f; l.va *= f; }
    if (!l.robot && Math.random() < 0.6 && Math.hypot(l.vx, l.vy) > 10) stainPx(l.x + rand(-1, 1), l.y + rand(-1, 1), l.fluid); // a trail
    if (l.z === 0 && l.vz === 0 && Math.hypot(l.vx, l.vy) < 6) {
      l.settled = true; l.a = Math.round(l.a / (Math.PI / 8)) * (Math.PI / 8);
      if (!l.robot) stain(l.x, l.y + 1, 1.6, l.fluid); // it lies in a little pool
    }
  }
  // Walk over meat and you eat it.
  if (p && !p.dead && p.burrowT <= 0 && p.evolveT <= 0 && !p.withdrawn) {
    const l = game.limbs.find(l => !l.robot && !l.inert && l.t > 0.3 && Math.hypot(l.x - p.x, l.y - p.y) < LIMB_EAT_R + p.r);
    if (l) eatLimb(p, l);
  }
}

// Gulp: a little biomass (carried over as fractions), and it counts as feeding.
function eatLimb(p, l) {
  game.limbs.splice(game.limbs.indexOf(l), 1);
  p.limbDna = (p.limbDna || 0) + l.dna * p.stats.dnaMul;
  while (p.limbDna >= 1) { p.limbDna--; gainDna(1); burst(p.x, p.y, VIAL_COLOR, 3, 30, 0.2); }
  p.eatT = 0.25; p.hungerT = 0;
  if (p.stats.feedFrenzy) { if (!(p.frenzyT > 0)) floatText(p.x, p.y - 22, 'FRENZY', PAL.red); p.frenzyT = Math.max(p.frenzyT || 0, 2.5); recomputeStats(p); }
  bloodSpray(l.x, l.y, 0, 0, 8, l.fluid, 70);
  Sfx.play('chomp');
  game.limbsEaten = (game.limbsEaten || 0) + 1;
}

// Too many: the oldest becomes part of the floor for good.
function bakeLimb(l) {
  if (!game.room || !inRoom(l.x, l.y)) return;
  const img = severedFrame(l);
  if (!img.dead) img.dead = darkened(img); // like corpses: dull and dark
  decalCtx().drawImage(img.dead, Math.round(l.x - img.width / 2), Math.round(l.y - img.height / 2));
}

// Leaving a room: what's left lies there for good.
function bakeAllLimbs() {
  for (const l of game.limbs) bakeLimb(l);
  game.limbs = [];
}

function drawLimbs(ctx) {
  drawFlies(ctx);
  for (const l of game.limbs) {
    const img = severedFrame(l);
    if (l.z > 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(l.x - 2), Math.round(l.y + 1), 4, 2); }
    const w = Math.round(img.width * l.scale), h = Math.round(img.height * l.scale);
    ctx.drawImage(img, Math.round(l.x - w / 2), Math.round(l.y - l.z - h / 2), w, h);
  }
}

// Hacking at a corpse tears more off it before it bursts. What comes off takes its
// share of the corpse's biomass with it (eat it, or lose it).
function tearCorpse(c, dx, dy) {
  if (!ANATOMY[c.type] || !GORE) return null;
  const body = { x: c.x, y: c.y, type: c.type, face: c.sprite.endsWith('_L') ? -1 : 1, missing: c.missing, maxHp: 1, speed: 0, dead: true };
  const parts = intactParts(body);
  if (!parts.length) return null;
  let part = pick(parts), best = Infinity;
  if (dx || dy) for (const n of parts) { const [ox, oy] = partOffset(body, n), d = ox * dx + oy * dy + rand(-2, 2); if (d < best) { best = d; part = n; } }
  const l = severPart(body, part, dx, dy, 90);
  c.missing = body.missing;
  if (l) { const share = Math.min(l.dna, c.dna); l.dna = share; c.dna -= share; }
  return l;
}

// Corpses rot where they lie: the pool under them spreads (twice), and after a while flies find them.
const POOL_SPREAD = [3, 8], FLIES_AFTER = 20;
function rotCorpses(dt) {
  if (!game.room || !game.room.corpses) return;
  for (const c of game.room.corpses) {
    const a0 = c.age || 0; c.age = a0 + dt;
    if (GORE) POOL_SPREAD.forEach((at, i) => { if (a0 < at && c.age >= at) stain(c.x + rand(-1, 1), c.y + 3, c.r * 0.6 + 1.5 + i * 1.2, c.fluid); });
  }
}
function drawFlies(ctx) {
  if (!GORE || !game.room || !game.room.corpses) return;
  ctx.fillStyle = '#0a0606';
  for (const c of game.room.corpses) {
    if (!(c.age > FLIES_AFTER) || c.held) continue;
    for (let i = 0; i < 3; i++) {
      const t = game.time * (2.2 + i * 0.7) + i * 2.1 + c.x;
      ctx.fillRect(Math.round(c.x + Math.cos(t) * (4 + i * 2)), Math.round(c.y - 4 + Math.sin(t * 1.3) * (2 + i)), 1, 1);
    }
  }
}

// --- Viscera: devour a corpse and it doesn't just vanish ------------------------------
// It bursts, and what spills out depends on what it was (VISCERA_BIO): a rat is gut,
// intestine, ribs and an eye; a culture is jelly and nuclei; a crawler is chitin and goo;
// a frozen thing is pale meat and ice. Bigger bodies spill more, and bigger pieces.
// Kept dark (this is floor mess, not loot): nothing in it can be eaten.
const VISCERA_PAL = { // darkest -> lightest, all held low so it doesn't pull the eye
  gut:    ['#1c0608', '#3a1218', '#58222a', '#6e343a', '#844a4e'],
  toad:   ['#121408', '#262a14', '#3e4222', '#525a30', '#6a7244'],
  pale:   ['#1c181c', '#36303a', '#544a56', '#6a6070', '#82788a'],
  sick:   ['#141808', '#2a3010', '#46501c', '#5e6a28', '#76843a'],
  cyst:   ['#1a0812', '#341424', '#4e2238', '#663248', '#7c4458'],
  purple: ['#140814', '#2a1028', '#421c3e', '#582850', '#6e3864'],
  jelly:  ['#1c1418', '#342a30', '#4e4248', '#665860', '#7e7078'],
  goo:    ['#1a1608', '#342c10', '#50441c', '#665a28', '#7c7038'],
  bone:   ['#1e1a10', '#3a3424', '#5a5038', '#746a4e', '#8c8266'],
  chitin: ['#0c0806', '#1c140c', '#2e2216', '#423222', '#564430'],
  ice:    ['#101a26', '#1e3044', '#30506a', '#4a7090', '#6890b0'],
};
const VISCERA_PAINT = { // (P, palette) for each kind of piece
  gut(P, c) { P.tube([[2, 6], [4, 3], [7, 2], [10, 4], [9, 7], [6, 8], [4, 6.5], [6, 5]], 1.4, 1.1, c, { spec: 1, specColor: c[4] }); },
  strand(P, c) { P.tube([[1, 3], [4, 1.5], [7, 4], [10, 2], [13, 3.5]], 1, 0.9, c); },
  bone(P) { const b = VISCERA_PAL.bone; P.tube([[2.5, 2.5], [8, 2.5]], 0.8, 0.8, b); P.blob(1.8, 2, 1.3, 1.3, b).blob(8.6, 3, 1.3, 1.3, b); },
  rib(P) { P.tube([[1, 4], [4, 1.5], [8, 1.2], [11, 2.5]], 0.8, 0.5, VISCERA_PAL.bone); },
  organ(P, c) { P.blob(3.5, 3, 3, 2.5, c, { shift: -0.1 }); P.vein(2, 3, 3, c[0], 0.4); },
  eye(P) { P.tube([[1, 4], [2.5, 3]], 0.5, 0.5, VISCERA_PAL.gut); P.blob(3.2, 2.4, 1.8, 1.8, VISCERA_PAL.pale, { noise: 0 }); P.dot(3.6, 2.4, '#3a0a0e'); },
  egg(P, c) { for (const [x, y] of [[2, 2.5], [4.5, 3], [3, 4.6]]) P.blob(x, y, 1.3, 1.3, c, { shift: 0.1 }); },
  chitin(P) { P.tube([[1, 4], [6, 1], [8, 3.5]], 1.2, 0.3, VISCERA_PAL.chitin); },
  goo(P, c) { P.blob(4, 3, 3.4, 2.2, c, { noise: 0.05 }); P.blob(6.5, 4.4, 1.2, 0.8, c); },
  nucleus(P, c) { P.blob(4, 3.5, 3.4, 3, VISCERA_PAL.jelly, { noise: 0.05 }); P.blob(4.4, 3.4, 1.3, 1.1, c, { noise: 0.2 }); },
  spine(P) { P.tube([[1, 4], [11, 1]], 0.7, 0.2, VISCERA_PAL.bone); },
  ice(P) { P.tube([[2, 5], [5, 1], [7, 4]], 1.4, 0.4, VISCERA_PAL.ice); },
  pus(P) { P.blob(3.5, 3, 2.8, 2.4, VISCERA_PAL.sick, { shift: 0.15 }); P.dot(3, 2.2, '#8a9040'); },
};
const VISCERA_SIZE = { gut: [12, 10], strand: [14, 6], bone: [11, 5], rib: [12, 5], organ: [7, 6], eye: [6, 5], egg: [7, 7], chitin: [10, 6], goo: [9, 7], nucleus: [8, 7], spine: [12, 5], ice: [9, 7], pus: [7, 6] };
// What each creature is made of: a palette for its soft insides, and the pieces it spills.
const VISCERA_BIO = {
  flesh:  { pal: 'gut',    kinds: ['gut', 'gut', 'strand', 'strand', 'bone', 'rib', 'rib', 'organ', 'eye'] },
  toad:   { pal: 'toad',   kinds: ['gut', 'strand', 'strand', 'bone', 'organ', 'egg', 'egg', 'eye'] },
  bug:    { pal: 'goo',    kinds: ['chitin', 'chitin', 'chitin', 'goo', 'goo', 'strand'] },
  cell:   { pal: 'jelly',  kinds: ['nucleus', 'nucleus', 'goo', 'goo', 'strand'] },
  frozen: { pal: 'pale',   kinds: ['gut', 'strand', 'strand', 'rib', 'bone', 'ice', 'ice', 'organ'] },
  sick:   { pal: 'sick',   kinds: ['gut', 'strand', 'pus', 'pus', 'pus', 'organ', 'bone'] },
  polyp:  { pal: 'cyst',   kinds: ['gut', 'strand', 'strand', 'organ', 'organ', 'goo'] },
  urchin: { pal: 'purple', kinds: ['spine', 'spine', 'spine', 'gut', 'strand', 'organ'] },
};
const VISCERA_OF = {
  spitter: 'toad', chimera: 'toad',
  scavenger: 'bug', cryocrawler: 'bug',
  culture: 'cell', mini: 'cell', splitter: 'cell', mother: 'cell', motherling: 'cell',
  frostbitten: 'frozen', jarthing: 'frozen', colossus: 'frozen',
  carrier: 'sick', bloater: 'sick', biotank: 'sick',
  gunpolyp: 'polyp', archive: 'polyp',
  urchin: 'urchin',
};
const VISCERA_CACHE = {};
function visceraSprite(kind, pal) {
  const v = Math.floor(Math.random() * 2), key = kind + pal + v;
  if (!VISCERA_CACHE[key]) {
    const [w, h] = VISCERA_SIZE[kind], P = new Painter(w, h, 300 + v * 17 + kind.length);
    VISCERA_PAINT[kind](P, VISCERA_PAL[pal]);
    VISCERA_CACHE[key] = P.outline().toCanvas();
  }
  return VISCERA_CACHE[key];
}

// A body of radius r bursts open: pieces of what it was made of, flung out in a heap.
function visceraBurst(x, y, fluid, r = 5, type) {
  if (!GORE) return;
  const bio = VISCERA_BIO[VISCERA_OF[type] || 'flesh'];
  const scale = clamp(0.7 + (r - 4) * 0.15, 0.7, 1.6), n = GORE > 1 ? Math.max(2, Math.round(1 + (r - 3) * 1.1)) : Math.max(1, Math.round((r - 3) * 0.5)); // (a rat: 3 pieces; a chimera: 7)
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(20, 55 + r * 3) * (GORE > 1 ? 1 : 0.4); // (a heap around the body, not across the room)
    game.limbs.push({
      x: x + rand(-2, 2), y: y + rand(-2, 2), vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 3, vz: rand(40, 80),
      a: rand(0, Math.PI * 2), va: rand(6, 14) * (Math.random() < 0.5 ? -1 : 1), flip: Math.random() < 0.5, scale: scale * rand(0.85, 1.1),
      img: visceraSprite(pick(bio.kinds), bio.pal), fluid, robot: false, inert: true, dna: 0, t: 0,
    });
  }
  while (game.limbs.length > LIMB_CAP) bakeLimb(game.limbs.shift());
  // A burst of it on the floor, and a spray.
  stain(x, y + 1, 2.5 + r * 0.35, fluid);
  for (let i = 0; i < 3 + Math.round(r * 0.4); i++) { const a = rand(0, Math.PI * 2), d = rand(r, r * 2.5); stain(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rand(1, 2.2), fluid); }
  bloodSpray(x, y, 0, 0, 14 + r * 3, fluid, 150);
}

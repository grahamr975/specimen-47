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
    inflict(e, 'bleed', { t: 99, dps: e.maxHp / 6 }); // it won't last long
  }
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
    const l = game.limbs.find(l => !l.robot && l.t > 0.3 && Math.hypot(l.x - p.x, l.y - p.y) < LIMB_EAT_R + p.r);
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
  for (const l of game.limbs) {
    const img = severedFrame(l);
    if (l.z > 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(l.x - 2), Math.round(l.y + 1), 4, 2); }
    const w = Math.round(img.width * l.scale), h = Math.round(img.height * l.scale);
    ctx.drawImage(img, Math.round(l.x - w / 2), Math.round(l.y - l.z - h / 2), w, h);
  }
}

'use strict';
// ---------------------------------------------------------------------------
// BODY FX: how your body looks and feels as it moves.
//
//   pose:      altitude, squash & stretch, tilt (hops, landings, flight,
//              pseudopods, breathing, Dive Bomb)
//   limbs:     procedural tentacles (like the spider legs), pseudopod lobes,
//              cilia shimmer, centipede leg ripples, footprints and step sounds
//   sets:      ambience for your body form (eye-shine, glowing spores, hive
//              flies, bone dust, falling leaves, blinking extra eyes) and an
//              aura for a full set
//   splices:   the fusion moment, a stitched seam, and marks for the big ones
//
// Nothing here changes gameplay; it's all looks, particles and sound.
// ---------------------------------------------------------------------------

const limbRoot = p => { const m = partAt(p, 'LIMBS'); return m && !(p.limbWear > 0) ? m.path[0] : null; };

// --- Pose ------------------------------------------------------------------------------
// Returns how high you are off the floor (alt), how the body is squashed or
// stretched (sx, sy, anchored at your feet) and tilted (rot).
function bodyPose(p) {
  const s = p.stats, mv = movement(p);
  let alt = 0, sx = 1, sy = 1, rot = 0;
  if (mv.stilts) alt = 6 + (p.moving ? Math.round(Math.sin(p.t * 9)) : 0);
  else if (mv.flyover) {
    const sp = Math.hypot(p.mvx || 0, p.mvy || 0);
    alt = 4 + Math.min(4, sp / 40) + Math.round(Math.sin(p.t * 6) * 1.2); // faster = higher
    rot = clamp((p.mvx || 0) / 500, -0.15, 0.15);                          // bank into turns
  } else if (s.hop && p.hopAir > 0) {
    alt = Math.round(Math.sin((p.hopAir / 0.2) * Math.PI) * 5);
    sx = 0.9; sy = 1.12;                                                   // stretched in the air
  } else if (s.hop && p.moving && p.hopT < 0.08) { sx = 1.1; sy = 0.9; }  // crouched to spring
  else if (p.moving && !s.slug) alt = Math.round(Math.abs(Math.sin(p.t * 12)));
  if (p.landT > 0) { const k = p.landT / LAND_TIME; sx *= 1 + 0.2 * k; sy *= 1 - 0.18 * k; } // landing squash
  // Pseudopods: the body reaches toward where you're going, then flows after it.
  if (limbRoot(p) === 'fins' && p.moving) {
    const k = Math.sin(p.t * 3.2 * Math.PI * 2) * 0.14, ax = Math.abs(p.inX || 0), ay = Math.abs(p.inY || 0);
    sx *= 1 + k * ax - k * 0.5 * ay; sy *= 1 + k * ay - k * 0.5 * ax;
  }
  if (!p.moving) sy *= 1 + (p.form === 'PREDATOR' ? 0.05 : 0.025) * Math.sin(p.t * (p.form === 'PREDATOR' ? 4 : 2.5)); // breathing
  if (p.form === 'ABOMINATION') { sx *= 1 + 0.04 * Math.sin(p.t * 5); sy *= 1 + 0.04 * Math.sin(p.t * 3.7 + 1); } // lopsided pulse
  if (s.diveBomb && p.dashT > 0) rot = 0.5 * (p.dashX >= 0 ? 1 : -1); // Dive Bomb: nose down
  return { alt, sx, sy, rot };
}

const LAND_TIME = 0.14;
// A heavy landing: squash, dust and a thump.
function landing(p, power = 0.6) {
  p.landT = LAND_TIME;
  game.fx.push({ kind: 'ring', x: p.x, y: p.y + 5, r: 2, max: 8 + 6 * power, t: 0.18 });
  burst(p.x, p.y + 5, '#3a3230', 5, 40, 0.25);
  game.shake = Math.max(game.shake, 1.5 * power);
  Sfx.play('thump');
}

// Where your head (the big eye) is on screen, given where the body is drawn.
function headPoint(p, x, y) {
  const pt = p.stage < 2 ? SPECIMEN.cuteEye : SPECIMEN.eye;
  const [ex, ey] = specimenPoint(p.stage, pt[0], pt[1]);
  return { x: x + (p.aimX < 0 ? (24 - ex) - 12 : ex - 12), y: y + ey - 12 };
}

// --- Tentacle limbs: soft, gripping, wet --------------------------------------------------
// Like the spider legs, each tip plants on the floor and steps when the body
// gets too far ahead, but slower, and the tentacle between is a curling curve.
const TENTACLES = [
  { hx: -3, hy: 0, fx: -15, fy: -2, near: false, g: 0 },
  { hx: 3, hy: 0, fx: 15, fy: -2, near: false, g: 1 },
  { hx: -2, hy: 2, fx: -12, fy: 7, near: true, g: 1 },
  { hx: 0, hy: 2, fx: 1, fy: 10, near: true, g: 0 },
  { hx: 2, hy: 2, fx: 12, fy: 7, near: true, g: 1 },
];
const TENT_STEP = 0.13, TENT_STRIDE = 14;

function tentaclesActive(p) {
  return limbRoot(p) === 'grapple' && p.burrowT <= 0 && !p.withdrawn;
}

function updateTentacles(p, dt) {
  if (!tentaclesActive(p)) { p.tents = null; return; }
  const k = STAGE_SCALE[p.stage] * 1.1;
  const vx = (p.x - (p.lastTentX ?? p.x)) / dt, vy = (p.y - (p.lastTentY ?? p.y)) / dt;
  p.lastTentX = p.x; p.lastTentY = p.y;
  const rest = (T, lead) => ({ x: p.x + T.fx * k + vx * lead, y: p.y + 2 + T.fy * k + vy * lead });
  if (!p.tents) p.tents = TENTACLES.map(T => { const r = rest(T, 0); return { x: r.x, y: r.y, sx: r.x, sy: r.y, tx: r.x, ty: r.y, t: 0 }; });
  const stepping = g => p.tents.some((f, i) => f.t > 0 && TENTACLES[i].g === g);
  p.tents.forEach((f, i) => {
    const T = TENTACLES[i];
    if (f.t > 0) {
      f.t = Math.max(0, f.t - dt);
      const u = 1 - f.t / TENT_STEP;
      f.x = f.sx + (f.tx - f.sx) * u; f.y = f.sy + (f.ty - f.sy) * u;
      if (f.t === 0) { // it grips: a wet smear and a squelch
        if (Math.random() < 0.5) stainPx(f.x, f.y, ['#2a1420', '#3a1a2a'], 1);
        if (Math.random() < 0.4) Sfx.play('squelch');
      }
      return;
    }
    const want = rest(T, 0.15), d = Math.hypot(want.x - f.x, want.y - f.y);
    if (d > 45) { f.x = want.x; f.y = want.y; return; }
    if ((d > TENT_STRIDE * k && !stepping(1 - T.g)) || d > TENT_STRIDE * 1.8 * k) { f.sx = f.x; f.sy = f.y; f.tx = want.x; f.ty = want.y; f.t = TENT_STEP; }
    else if (!p.moving && d > 2) { f.x += (want.x - f.x) * Math.min(1, dt * 4); f.y += (want.y - f.y) * Math.min(1, dt * 4); }
  });
}

function drawTentacles(ctx, p, bx, by, which) {
  if (!p.tents) return;
  const k = STAGE_SCALE[p.stage] * 1.1, grappling = !!p.grappleShot || p.pullT > 0;
  p.tents.forEach((f, i) => {
    const T = TENTACLES[i];
    if (T.near !== (which === 'near') || (grappling && i === 3)) return; // one is out on the grapple
    const hx = bx + T.hx * k, hy = by + 3 + T.hy * k;
    const lift = f.t > 0 ? Math.sin((1 - f.t / TENT_STEP) * Math.PI) * 5 : 0;
    const tx = f.x, ty = f.y - lift;
    const wave = Math.sin(p.t * 5 + i * 1.3) * 3, dx = tx - hx, dy = ty - hy, d = Math.hypot(dx, dy) || 1;
    const cx = (hx + tx) / 2 - dy / d * wave, cy = (hy + ty) / 2 + dx / d * wave - 4; // arched, curling
    let px = hx, py = hy;
    for (let n = 1; n <= 10; n++) {
      const u = n / 10, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const qx = a * hx + b * cx + c * tx, qy = a * hy + b * cy + c * ty;
      const thick = u < 0.55 ? 2 : 1;
      pxLine(ctx, px, py + 1, qx, qy + 1, '#1a0810', thick, 0);
      pxLine(ctx, px, py, qx, qy, u < 0.4 ? '#8a3a6a' : '#a84a7a', 1, 0);
      if (n % 3 === 0 && thick === 2) { ctx.fillStyle = '#e8b0c8'; ctx.fillRect(Math.round(qx), Math.round(qy + 1), 1, 1); } // suckers
      px = qx; py = qy;
    }
    // The tip curls when lifted.
    if (lift > 1) { ctx.fillStyle = '#a84a7a'; ctx.fillRect(Math.round(tx + (dx > 0 ? -1 : 1)), Math.round(ty - 1), 1, 1); }
  });
}

// --- Other limbs -------------------------------------------------------------------------
// Pseudopods: a lobe of you reaching ahead (drawn behind the body).
function drawPseudopod(ctx, p, x, y) {
  if (limbRoot(p) !== 'fins' || !p.moving) return;
  const reach = Math.max(0, Math.sin(p.t * 3.2 * Math.PI * 2)), dx = p.inX || 0, dy = p.inY || 0;
  const len = 3 + 7 * reach, col = p.tint ? p.tint.color : '#8a9a7a';
  for (let n = 0; n <= 3; n++) {
    const u = n / 3, r = 3.2 - 1.2 * u, cx = x + dx * (5 + len * u), cy = y + 6 + dy * (4 + len * u);
    pxCircle(ctx, cx, cy, r + 1, '#141a14');
    pxCircle(ctx, cx, cy, r, col);
  }
}

// Gloss streak when you slide on your own slime; cilia shimmer underneath.
function drawLimbDetails(ctx, p, x, y) {
  const root = limbRoot(p);
  if (root === 'fins' && p.moving && (onSlime(p.x, p.y + 3, 6) || inOwnPool(p.x, p.y))) {
    const sx = x - 6 + ((p.t * 50) % 12);
    ctx.fillStyle = 'rgba(240,250,240,0.7)'; ctx.fillRect(Math.round(sx), Math.round(y - 2), 3, 1); ctx.fillRect(Math.round(sx) + 1, Math.round(y - 1), 2, 1);
  }
  if (root === 'fins' && hasMutation(p, 'cilia')) {
    for (let i = -6; i <= 6; i++) {
      const ph = (i + Math.floor(p.t * (p.moving ? 24 : 8))) % 3;
      ctx.fillStyle = ph === 0 ? '#d8e8d0' : ph === 1 ? '#7a8a72' : '#3a4436';
      ctx.fillRect(Math.round(x + i), Math.round(y + 7 + (ph === 0 ? 1 : 0)), 1, 1);
    }
  }
}

// --- Movement feel: footprints and step sounds ------------------------------------------
function updateBodyFx(p, dt) {
  const s = p.stats, root = limbRoot(p), mv = movement(p);
  if (p.landT > 0) p.landT -= dt;
  updateTentacles(p, dt);
  p.stepT = (p.stepT || 0) - dt;
  if (p.moving && p.burrowT <= 0 && p.stepT <= 0) {
    if (mv.flyover) { p.stepT = 0.1; Sfx.play('buzz'); }                                  // wings hum
    else if (mv.stilts) { p.stepT = 0.33; Sfx.play('clack'); stainPx(p.x + rand(-6, 6), p.y + 5, ['#2e2618'], 1); } // bone stilts
    else if (root === 'burrow') { p.stepT = 0.22; Sfx.play('scrape'); for (let i = 0; i < 3; i++) stainPx(p.x - (p.inX || 0) * 4 + rand(-3, 3), p.y + 5 + i, ['#141010', '#1e1818'], 1); } // claw scratches
    else if (root === 'fins') { p.stepT = 0.31; Sfx.play('squelch'); }                    // each reach
    else if (s.centipede) { p.stepT = 0.08; if (Math.random() < 0.5) Sfx.play('skitter'); }
    else if (root === 'rootlegs') { p.stepT = 0.3; Sfx.play('thudsoft'); }
  }
  // Root Legs: taking root creaks, and roots spread over the floor.
  if (p.rooted && !p.wasRooted) {
    Sfx.play('creak');
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + rand(-0.3, 0.3); for (let r = 4; r < 11; r += 1.5) stainPx(p.x + Math.cos(a) * r, p.y + 6 + Math.sin(a) * r * 0.5, ['#1e140a', '#2a1c10'], 1); }
  }
  p.wasRooted = p.rooted;
  // Dive Bomb: wind streaks off the dive.
  if (s.diveBomb && p.dashT > 0) for (let i = 0; i < 2; i++) game.particles.push({ x: p.x + rand(-5, 5), y: p.y + rand(-6, 2), vx: -p.dashX * 160, vy: -p.dashY * 160, life: 0.12, color: '#c8c0d8', size: 1 });
  updateSetFx(p, dt);
}

// --- Sets: your body form's ambience ------------------------------------------------------
function updateSetFx(p, dt) {
  const f = p.form;
  if (p.bloodyT > 0) {
    p.bloodyT -= dt;
    if (Math.random() < 0.15) { const h = headPoint(p, p.x, p.y - 4); game.particles.push({ x: h.x + (p.aimX < 0 ? -2 : 2), y: h.y + 3, vx: 0, vy: 30, life: 0.25, color: '#8a1420', size: 1, fluid: FLUID.blood }); }
  }
  if (!f) return;
  p.setFxT = (p.setFxT || 0) - dt;
  if (p.setFxT > 0) return;
  if (f === 'FUNGAL') { p.setFxT = 0.6; game.particles.push({ x: p.x + rand(-5, 5), y: p.y - 8, vx: rand(-6, 6), vy: -14, life: 1.1, color: '#c4cca4', size: 1 }); }
  else if (f === 'BONE') { p.setFxT = 0.25; if (p.moving) { game.particles.push({ x: p.x + rand(-5, 5), y: p.y, vx: rand(-10, 10), vy: 20, life: 0.3, color: '#c4b898', size: 1 }); if (Math.random() < 0.3) Sfx.play('rattle'); } }
  else if (f === 'PLANT') { p.setFxT = 1.4; const c = Math.random() < 0.5 ? '#5a8a3a' : '#7ab84a'; game.particles.push({ x: p.x + rand(-6, 6), y: p.y - 8, vx: rand(-14, 14), vy: 26, life: 0.9, color: c, size: 1 }); }
  else if (f === 'HIVE') { p.setFxT = 0.5; if (Math.random() < 0.4) Sfx.play('buzz'); }
  else p.setFxT = 1;
}

// Drawn with the body (under the darkness): flies, cracks, extra eyes, splice marks.
function drawBodyMarks(ctx, p, x, y) {
  const f = p.form, s = p.stats;
  if (f === 'HIVE') for (let i = 0; i < 3; i++) { // a few insects orbit you
    const a = p.t * 4 + i * 2.1, fx = x + Math.cos(a) * (10 + i), fy = y - 6 + Math.sin(a * 1.3) * 5;
    ctx.fillStyle = '#1a1418'; ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
    if (Math.floor(p.t * 30 + i) % 2) { ctx.fillStyle = '#c8c0b0'; ctx.fillRect(Math.round(fx), Math.round(fy) - 1, 1, 1); }
  }
  if (f === 'BONE' && p.hp <= p.maxHp / 2) { // cracks
    ctx.fillStyle = '#1a1410';
    for (const [cx, cy, n] of [[-3, -4, 4], [2, -1, 3], [-1, 2, 3]]) for (let k = 0; k < n; k++) ctx.fillRect(Math.round(x + cx + k * (k % 2 ? 1 : 0)), Math.round(y + cy + k), 1, 1);
  }
  if (f === 'ABOMINATION') for (let i = 0; i < 3; i++) { // extra eyes blink at random
    const ex = Math.round(x - 5 + hash2(i, 7, 3) * 9), ey = Math.round(y - 5 + hash2(i, 9, 3) * 7);
    const open = hash2(i, Math.floor(p.t * 1.5), 11) > 0.25;
    ctx.fillStyle = '#1a0a10'; ctx.fillRect(ex - 1, ey - (open ? 1 : 0), 3, open ? 3 : 1);
    if (open) { ctx.fillStyle = '#e8dcc8'; ctx.fillRect(ex, ey, 1, 1); ctx.fillStyle = '#100808'; ctx.fillRect(ex + (p.aimX < 0 ? -1 : 1) * 0, ey, 1, 1); ctx.fillStyle = '#e8dcc8'; ctx.fillRect(ex + (p.aimX < 0 ? 1 : -1), ey, 1, 1); }
  }
  // Splices: a stitched seam across the body for each fusion.
  p.splices.slice(0, 3).forEach((k, i) => {
    const y0 = y - 3 + i * 3;
    for (let n = -5; n <= 5; n++) { ctx.fillStyle = n % 2 ? VIAL_COLOR : '#3a0e22'; ctx.fillRect(Math.round(x + n), Math.round(y0 + Math.abs(n) * 0.2), 1, 1); }
    ctx.fillStyle = '#3a0e22'; for (let n = -4; n <= 4; n += 3) ctx.fillRect(Math.round(x + n), Math.round(y0 - 1), 1, 3);
  });
  // A full gullet bulges (Frog Tongue); Blood Gulp's bulges throb red.
  for (let i = 0; i < p.gullet; i++) {
    const bx = x - (p.gullet - 1) * 2 + i * 4, by = y + 5, throb = s.bloodGulp && Math.floor(p.t * 3 + i) % 2;
    pxCircle(ctx, bx, by, 2.2, '#2a0a10'); pxCircle(ctx, bx, by, 1.5, throb ? '#c02a34' : '#8a3a3a');
  }
  const h = headPoint(p, x, y);
  if (s.boneCannon) { // a bone barrel out of the skull
    pxLine(ctx, h.x, h.y - 2, h.x + p.aimX * 6, h.y - 2 + p.aimY * 6, '#2e2618', 3, 0);
    pxLine(ctx, h.x, h.y - 2, h.x + p.aimX * 6, h.y - 2 + p.aimY * 6, '#e8e0c8', 1, 0);
  }
  if (s.broodHowl) for (let i = 0; i < 3; i++) { // egg clusters on the throat
    const r = 1 + (Math.floor(p.t * 2 + i) % 2) * 0.4;
    pxCircle(ctx, h.x - (p.aimX < 0 ? -1 : 1) * (2 + i), h.y + 4 + (i % 2), r, '#e8e0b8');
  }
  if (s.silkNursery) for (let i = 0; i < 2; i++) { // babies crawling on you
    const a = p.t * 1.5 + i * Math.PI, sx = x + Math.cos(a) * 5, sy = y - 2 + Math.sin(a * 2) * 3;
    ctx.fillStyle = '#100808'; ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1); ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + (Math.floor(p.t * 12) % 2), 4, 1);
  }
  if (s.batteringRam && p.shieldUp) { // the shell has grown over the skull
    ctx.fillStyle = '#6a5038'; for (let n = -3; n <= 3; n++) ctx.fillRect(Math.round(h.x + n * 0.6 - p.aimX * 2), Math.round(h.y - 5 + Math.abs(n) * 0.5), 1, 2);
  }
}

// Drawn over the darkness: things that glow.
function drawBodyGlow(ctx, p) {
  if (p.burrowT > 0 || p.withdrawn) return;
  const f = p.form, y = p.y - 4 - (p.pose ? p.pose.alt : 0);
  if (f === 'PREDATOR' && hash2(Math.floor(p.t * 0.4), 1, 13) > 0.08 + (Math.floor(p.t * 8) % 24 === 0 ? 1 : 0)) { // eye-shine (it blinks)
    const h = headPoint(p, p.x, y);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(Math.round(h.x), Math.round(h.y), 1, 1); ctx.fillRect(Math.round(h.x - (p.aimX < 0 ? -2 : 2)), Math.round(h.y), 1, 1);
  }
  if (f === 'FUNGAL') for (let i = 0; i < 5; i++) { // glowing spots
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(p.t * 2 + i * 1.7);
    ctx.fillStyle = i % 2 ? '#a0f080' : '#70e0a0';
    ctx.fillRect(Math.round(p.x - 6 + hash2(i, 3, 5) * 12), Math.round(y - 6 + hash2(i, 4, 5) * 9), 1, 1);
  }
  if (f === 'HIVE' && (p.t % 2.5) < 0.25) { // a glint slides over the carapace
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff4d0';
    ctx.fillRect(Math.round(p.x - 6 + (p.t % 2.5) * 48), Math.round(y - 5), 1, 1);
  }
  ctx.globalAlpha = 1;
  const set = activeSet(p);
  if (set && set.tier === 1) { // a full set: a faint aura in the set's color
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(p.t * 3);
    pxRing(ctx, p.x, p.y - 2, 12 + Math.sin(p.t * 2) * 1.5, SETS[set.set].color);
    ctx.globalAlpha = 1;
  }
}

// Hurt: what comes out of you depends on what you are.
function bodyHurtFx(p) {
  if (p.form === 'BONE') gibs(p.x, p.y, 3, ['#e8e0c8', '#c4b898', '#968868'], FLUID.blood);
  else if (p.form === 'PLANT') for (let i = 0; i < 6; i++) game.particles.push({ x: p.x, y: p.y - 6, vx: rand(-50, 50), vy: rand(-40, 30), life: 0.7, color: i % 2 ? '#e88aa8' : '#d86a8a', size: 1 });
  else if (p.form === 'FUNGAL') spawnCloud(p.x, p.y, 10);
}

// The splice moment: threads of flesh stitch the two parts together.
function drawStitchFx(ctx, f) {
  const k = f.t / f.max;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + (1 - k) * 2, r = 4 + 10 * k;
    const x1 = f.x + Math.cos(a) * r, y1 = f.y + Math.sin(a) * r * 0.8, x2 = f.x - Math.cos(a) * r, y2 = f.y - Math.sin(a) * r * 0.8;
    pxLine(ctx, x1, y1, x2, y2, i % 2 ? VIAL_COLOR : '#a8534f', 1, 2);
  }
}

// Seismic Howl: the floor cracks open around where you erupt.
function groundCracks(x, y) {
  const d = decalCtx();
  d.fillStyle = '#0c0808';
  for (let i = 0; i < 7; i++) {
    let a = i * Math.PI * 2 / 7 + rand(-0.3, 0.3), cx = x, cy = y;
    const len = rand(16, 30);
    for (let r = 0; r < len; r += 1.5) { a += rand(-0.35, 0.35); cx += Math.cos(a) * 1.5; cy += Math.sin(a) * 1.0; d.fillRect(Math.round(cx), Math.round(cy), 1, 1); }
  }
}

// Bone Plates orbiting you; the Mirror Cyst's membrane (bright when ready).
function drawDefense(ctx, p) {
  for (let i = 0; i < (p.plates || 0); i++) {
    const q = platePos(p, i, p.plates), qx = Math.round(q.x), qy = Math.round(q.y);
    ctx.fillStyle = '#2e2618'; ctx.fillRect(qx - 2, qy - 1, 4, 3);
    ctx.fillStyle = '#d8ccb0'; ctx.fillRect(qx - 1, qy - 1, 3, 2);
    ctx.fillStyle = '#f4ecd8'; ctx.fillRect(qx - 1, qy - 1, 1, 1);
  }
  const m = p.stats.mirror;
  if (!m || p.burrowT > 0) return;
  const ready = !(p.mirrorT > 0), span = m.arc <= -1 ? Math.PI : Math.acos(m.arc), a0 = Math.atan2(p.aimY, p.aimX);
  ctx.globalAlpha = ready ? 0.75 : 0.2; ctx.fillStyle = '#c8e8ff';
  for (let k = -10; k <= 10; k++) {
    if (ready && hash2(k, Math.floor(p.t * 8), 21) < 0.15) continue; // shimmer
    const a = a0 + span * k / 10;
    ctx.fillRect(Math.round(p.x + Math.cos(a) * 12), Math.round(p.y - 2 + Math.sin(a) * 12), 1, 1);
  }
  ctx.globalAlpha = 1;
}

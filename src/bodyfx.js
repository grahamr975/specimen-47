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
  if (p.snapT > 0) { sx *= 1 + 0.25 * Math.abs(p.snapX); sy *= 1 + 0.25 * Math.abs(p.snapY); sx *= 1 - 0.1 * Math.abs(p.snapY); sy *= 1 - 0.12 * Math.abs(p.snapX); } // stretched into the snap
  if (p.apex) { sx *= 1.12; sy *= 1.12; } // the final form is bigger
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
    if (p.stats.hands && T.near && !(grappling && i === 3)) { // Grasping Hands: the near tentacles end in hands
      pxCircle(ctx, tx, ty, 2, '#2a0a14'); pxCircle(ctx, tx, ty, 1.4, '#c87a8a');
      ctx.fillStyle = '#e8a0b0'; for (let n = -1; n <= 1; n++) ctx.fillRect(Math.round(tx + n * 1.5), Math.round(ty - 2 - (n === 0 ? 1 : 0)), 1, 2);
      return;
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
  updateProceduralLimbs(p, dt);
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
  if (hasStatus(p, 'net')) { // pinned under a containment net
    ctx.fillStyle = '#e8e0c8';
    for (let n = -8; n <= 8; n += 4) { for (let k = -8; k <= 8; k++) { if ((k + n) % 2) continue; ctx.fillRect(Math.round(x + n + k * 0.3), Math.round(y + k * 0.6), 1, 1); ctx.fillRect(Math.round(x + k), Math.round(y + n * 0.6), 1, 1); } }
  }
  if (hasStatus(p, 'chill') && Math.random() < 0.3) game.particles.push({ x: x + rand(-6, 6), y: y + rand(-6, 4), vx: 0, vy: -8, life: 0.3, color: '#d8f0ff', size: 1 }); // frost
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
  if (p.apex) { // the final form: a slow golden aura and eyes that shine in the dark
    const sets = Object.keys(p.stats.apex || {}), col = sets.length ? SETS[sets[Math.floor(p.t / 2) % sets.length]].color : '#ffd070';
    ctx.globalAlpha = 0.3 + 0.15 * Math.sin(p.t * 2);
    pxRing(ctx, p.x, p.y - 2, 15 + Math.sin(p.t * 1.5) * 2, col); pxRing(ctx, p.x, p.y - 2, 11, '#ffd070');
    ctx.globalAlpha = 1;
    if (Math.floor(p.t * 8) % 30) { const h = headPoint(p, p.x, y); ctx.fillStyle = '#fff0c0'; ctx.fillRect(Math.round(h.x), Math.round(h.y), 1, 1); ctx.fillRect(Math.round(h.x - (p.aimX < 0 ? -2 : 2)), Math.round(h.y), 1, 1); }
  }
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

// --- The cocoon: wet, pulsing, sized to whatever you are right now -------------------------
// Bands of flesh and silk wrap up from the floor around the body's actual
// pixels; your silhouette shifts inside; veins throb with the heartbeat;
// near the end it splits along a glowing seam.
const BODY_BOUNDS = new WeakMap();
function bodyBounds(img) { // the opaque pixels of a body frame (cached)
  if (BODY_BOUNDS.has(img)) return BODY_BOUNDS.get(img);
  const w = img.width, h = img.height, d = img.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const b = x1 < 0 ? { cx: 0, cy: 0, w: 12, h: 12 } : { cx: (x0 + x1 + 1) / 2 - w / 2, cy: (y0 + y1 + 1) / 2 - h / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  BODY_BOUNDS.set(img, b);
  return b;
}

// 0..1: a sharp throb on every heartbeat (the same beat the cocoon's heartbeat sound uses).
function cocoonBeat(p) {
  if (!(p.evolveT > 0)) return 0;
  const beat = p.evolveT > COCOON_TIME * 0.6 ? 0.25 : 0.45, ph = (p.evolveT % beat) / beat;
  return Math.max(0, 1 - ph * 3.5);
}
const apexCocoon = () => game.pendingEvolutions.some(e => e.apex);

function drawCocoon(ctx, p, x, y) {
  const k = Math.min(1, p.evolveT / COCOON_TIME), beat = cocoonBeat(p);
  const fb = bodyFrames(p), body = fb[(p.aimX < 0 ? 'body_L' : 'body')] || fb.body, b = bodyBounds(body);
  const big = apexCocoon() ? 1.5 : 1;
  const swell = 1 + 0.07 * beat;                       // it throbs with your heart
  const rx = (b.w / 2 + 2) * big * swell * (p.pose ? p.pose.sx : 1), ry = (b.h / 2 + 2) * big * swell * (p.pose ? p.pose.sy : 1);
  const jx = k > 0.6 ? rand(-1, 1) * (k - 0.6) * 3 : 0; // it trembles near the end
  const cx = x + b.cx + jx, cy = y + b.cy - (big - 1) * ry * 0.4;
  const floor = cy + ry, top = floor - 2 * ry * Math.min(1, k * 1.15); // wrapped up to here
  const pal = apexCocoon() ? ['#2a1c10', '#7a5a2a', '#b08a40', '#e0c070', '#fff0c0'] : ['#1e1012', '#5a2a2e', '#8a5048', '#b88a78', '#e0c4b0'];
  // Inside: your silhouette, shifting as you change.
  const key = 'cocoonSil'; if (!body[key]) body[key] = silhouette(body, '#140608');
  ctx.globalAlpha = 0.85;
  ctx.drawImage(body[key], Math.round(x - body.width / 2 + Math.sin(p.evolveT * 9) * 0.8), Math.round(y - body.height / 2));
  ctx.globalAlpha = 1;
  // The membrane: layered bands wrapping up from the floor, each its own wobble.
  for (let yy = Math.ceil(top); yy <= floor; yy++) {
    const v = (yy - cy) / ry; if (Math.abs(v) > 1) continue;
    const half = rx * Math.sqrt(1 - v * v);
    const band = Math.floor((floor - yy) / 2.2), wob = Math.sin(band * 1.7 + p.evolveT * 5) * 0.8;
    for (let xx = -Math.ceil(half); xx <= Math.ceil(half); xx++) {
      if (Math.abs(xx) > half + wob * 0.5) continue;
      const edge = Math.abs(xx) >= half - 1 || yy <= Math.ceil(top) + 0.5;
      const u = xx / (half || 1);                       // -1..1 across: light from the upper left
      const strand = Math.sin(xx * 0.9 + band * 2.3 + yy * 0.4) > 0.55;
      let shade = 2 + Math.round(-u * 1.2) + (band % 2 ? 0 : 1) + (strand ? 1 : 0);
      if (edge) shade = 0;
      ctx.fillStyle = pal[clamp(shade, 0, 4)];
      ctx.fillRect(Math.round(cx + xx), yy, 1, 1);
    }
  }
  // Veins: they spread up from the floor and throb on every beat.
  if (k > 0.3) {
    ctx.fillStyle = beat > 0.4 ? '#e0304a' : '#7a1420';
    for (let i = 0; i < 4; i++) {
      let vx = cx - rx * 0.6 + i * rx * 0.4, vy = floor - 1;
      const len = (k - 0.3) / 0.7 * ry * 1.6;
      for (let s = 0; s < len; s++) { vx += Math.sin(i * 3.1 + s * 0.7) * 0.6; vy -= 1; if (vy < top) break; ctx.fillRect(Math.round(vx), Math.round(vy), 1, 1); }
    }
  }
  // Drips off the bottom.
  if (Math.random() < 0.25) game.particles.push({ x: cx + rand(-rx, rx) * 0.7, y: floor, vx: 0, vy: 18, life: 0.25, color: pick(['#8a5048', '#5e2229', '#c8b4a0']), size: 1, fluid: FLUID.blood });
  // Near the end: it splits along a seam, and light leaks out.
  if (k > 0.8) {
    const open = (k - 0.8) / 0.2;
    ctx.fillStyle = apexCocoon() ? '#fff0c0' : '#f4a0b8';
    for (let s = 0; s < ry * 2 * open; s++) ctx.fillRect(Math.round(cx + Math.sin(s * 0.8) * 1.2), Math.round(cy - ry * open + s), 1, 1);
  }
}

// The whole screen throbs with the cocoon's heartbeat (gold for the last one),
// and flashes when it splits.
function drawCocoonPulse(ctx) {
  const p = game.player;
  if (game.cocoonFlash > 0) {
    ctx.globalAlpha = Math.min(1, game.cocoonFlash / 0.3) * 0.7;
    ctx.fillStyle = game.cocoonFlashColor || '#f4c8d8'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
  if (!p || !(p.evolveT > 0)) return;
  const k = Math.min(1, p.evolveT / COCOON_TIME), beat = cocoonBeat(p), apex = apexCocoon();
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.25, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75);
  const a = (0.18 + 0.4 * beat) * (0.4 + 0.6 * k);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, apex ? `rgba(200,150,40,${a.toFixed(3)})` : `rgba(130,10,30,${a.toFixed(3)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// =========================================================================================
// PROCEDURAL LIMBS: crab legs, haunches, digging claws, root legs, hands, stilts.
// Like the spider legs: real feet that plant and step, drawn every frame.
// =========================================================================================

// A generic walker: each foot plants on the floor and steps (in alternating
// groups) when the body gets too far ahead. defs: [{ hx, hy, fx, fy, near, g }].
function updateWalker(p, key, defs, active, stride, stepTime, dt, onPlant) {
  if (!active) { p[key] = null; return; }
  const k = STAGE_SCALE[p.stage] * 1.1, lx = key + 'LX', ly = key + 'LY';
  const vx = (p.x - (p[lx] ?? p.x)) / dt, vy = (p.y - (p[ly] ?? p.y)) / dt;
  p[lx] = p.x; p[ly] = p.y;
  const rest = (L, lead) => ({ x: p.x + L.fx * k + vx * lead, y: p.y + 2 + L.fy * k + vy * lead });
  if (!p[key]) p[key] = defs.map(L => { const r = rest(L, 0); return { x: r.x, y: r.y, sx: r.x, sy: r.y, tx: r.x, ty: r.y, t: 0 }; });
  const feet = p[key], stepping = g => feet.some((f, i) => f.t > 0 && defs[i].g === g), fast = Math.hypot(vx, vy) > 150;
  feet.forEach((f, i) => {
    const L = defs[i];
    if (f.t > 0) {
      f.t = Math.max(0, f.t - dt);
      const u = 1 - f.t / stepTime;
      f.x = f.sx + (f.tx - f.sx) * u; f.y = f.sy + (f.ty - f.sy) * u;
      if (f.t === 0 && onPlant) onPlant(f, i);
      return;
    }
    const want = rest(L, 0.12), d = Math.hypot(want.x - f.x, want.y - f.y);
    if (d > 40) { f.x = want.x; f.y = want.y; return; }
    if ((d > stride * k && (fast || !stepping(1 - L.g))) || d > stride * 1.8 * k) { f.sx = f.x; f.sy = f.y; f.tx = want.x; f.ty = want.y; f.t = stepTime * (fast ? 0.6 : 1); }
    else if (!p.moving && d > 2) { f.x += (want.x - f.x) * Math.min(1, dt * 6); f.y += (want.y - f.y) * Math.min(1, dt * 6); }
  });
}

// A two-bone leg, hip -> knee -> foot; the knee bends up and outward.
function drawJointLeg(ctx, hx, hy, fx, fy, L1, L2, col, thick = 1) {
  const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1, reach = Math.min(d, L1 + L2 - 0.5);
  const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / d, uy = dy / d;
  let nx = -uy, ny = ux; if (ny > 0 || (ny === 0 && nx * ux < 0)) { nx = -nx; ny = -ny; }
  const kx = hx + ux * a + nx * h, ky = hy + uy * a + ny * h, ex = hx + ux * reach, ey = hy + uy * reach;
  pxLine(ctx, hx, hy + 1, kx, ky + 1, col.dark, thick + 1, 0); pxLine(ctx, kx, ky + 1, ex, ey + 1, col.dark, thick, 0);
  pxLine(ctx, hx, hy, kx, ky, col.mid, thick, 0); pxLine(ctx, kx, ky, ex, ey, col.mid, Math.max(1, thick - 1), 0);
  ctx.fillStyle = col.hi; ctx.fillRect(Math.round(kx), Math.round(ky) - 1, 1, 1);
  return { kx, ky, ex, ey };
}

const limbRootIs = (p, id) => { const m = partAt(p, 'LIMBS'); return !!m && m.path[0] === id && !(p.limbWear > 0) && p.burrowT <= 0 && !p.withdrawn; };

// --- Crab Legs: six armored legs scuttling sideways, and two snapping pincers --------------
const CRAB_LEGS = [
  { hx: -3, hy: 0, fx: -14, fy: -3, near: false, g: 0 }, { hx: -2, hy: 1, fx: -16, fy: 2, near: false, g: 1 }, { hx: -1, hy: 2, fx: -12, fy: 7, near: true, g: 0 },
  { hx: 3, hy: 0, fx: 14, fy: -3, near: false, g: 1 }, { hx: 2, hy: 1, fx: 16, fy: 2, near: false, g: 0 }, { hx: 1, hy: 2, fx: 12, fy: 7, near: true, g: 1 },
];
const CRAB_COL = { dark: '#1a0c08', mid: '#8a3a24', hi: '#d88a5a' };
function drawCrab(ctx, p, bx, by, which) {
  if (!p.crab) return;
  const k = STAGE_SCALE[p.stage] * 1.1;
  p.crab.forEach((f, i) => {
    const L = CRAB_LEGS[i]; if (L.near !== (which === 'near')) return;
    const lift = f.t > 0 ? Math.sin((1 - f.t / 0.07) * Math.PI) * 2.5 : 0;
    drawJointLeg(ctx, bx + L.hx * k, by + 3 + L.hy * k, f.x, f.y - lift, 8 * k, 9 * k, CRAB_COL, 1);
    ctx.fillStyle = CRAB_COL.dark; ctx.fillRect(Math.round(f.x), Math.round(f.y - lift), 1, 2); // pointed tip
  });
  if (which !== 'near') return;
  // The pincers, reaching toward where you aim: they idly open and close, and snap shut on use.
  const ang = Math.atan2(p.aimY, p.aimX), snap = p.pincerAnimT > 0 ? 1 - p.pincerAnimT / 0.18 : 0;
  for (const side of [-1, 1]) {
    const base = { x: bx + Math.cos(ang + side * 1.2) * 5, y: by + 3 + Math.sin(ang + side * 1.2) * 3 };
    const reach = 7 + (snap > 0 ? Math.sin(snap * Math.PI) * 4 : 0) + (p.stats.pincerWide ? 2 : 0);
    const cx = base.x + Math.cos(ang + side * 0.35) * reach, cy = base.y + Math.sin(ang + side * 0.35) * reach;
    pxLine(ctx, base.x, base.y + 1, cx, cy + 1, CRAB_COL.dark, 2, 0); pxLine(ctx, base.x, base.y, cx, cy, CRAB_COL.mid, 2, 0);
    const open = (snap > 0 ? 0.05 + 0.6 * Math.abs(Math.cos(snap * Math.PI)) : 0.45 + 0.15 * Math.sin(p.t * 3 + side)) * (p.stats.pincerWide ? 1.2 : 1);
    for (const jaw of [-1, 1]) {
      const ja = ang + jaw * open, jl = jaw === side ? 5 : 4;
      pxLine(ctx, cx, cy, cx + Math.cos(ja) * jl, cy + Math.sin(ja) * jl, CRAB_COL.dark, 2, 0);
      pxLine(ctx, cx, cy, cx + Math.cos(ja) * jl, cy + Math.sin(ja) * jl, jaw === side ? CRAB_COL.hi : CRAB_COL.mid, 1, 0);
    }
  }
}

// --- Haunches: big folded hind legs that crouch, spring, extend in the air, and land -------
const HAUNCH_COL = { dark: '#140a08', mid: '#6a4632', hi: '#a87a58' };
function drawHaunches(ctx, p, bx, by, which) {
  if (!limbRootIs(p, 'haunches')) return;
  const f = p.aimX < 0 ? -1 : 1, s = p.stats;
  const air = (s.hop && p.hopAir > 0) || p.dashT > 0, crouch = p.landT > 0 ? p.landT / LAND_TIME : (s.hop && p.moving && p.hopT < 0.1 && !air) ? 1 : 0.2;
  // Knee, ankle, toe (relative to the hip, facing right; y down): folded, standing, flung out behind.
  const POSES = { crouch: [[4, 3], [-5, 4], [0, 6]], stand: [[3, 3], [-4, 6], [1, 7]], air: [[-2, 4], [-7, 6], [-12, 6]] };
  const lerp = (A, B, t) => A.map((pt, i) => [pt[0] + (B[i][0] - pt[0]) * t, pt[1] + (B[i][1] - pt[1]) * t]);
  const pose = air ? POSES.air : lerp(POSES.stand, POSES.crouch, crouch);
  const k = STAGE_SCALE[p.stage] * 1.5;
  const leg = (dx, dy, col, thigh) => {
    const hx = bx - f * 5 + dx, hy = by + 3 + dy, pts = [[hx, hy]].concat(pose.map(([x, y]) => [hx + f * x * k, hy + y * k]));
    // A heavy, muscled thigh, then a long shin and a springy foot.
    pxCircle(ctx, hx + f * 1, hy + 1, 3.6, HAUNCH_COL.dark); pxCircle(ctx, hx + f * 1, hy + 1, 2.8, thigh);
    for (let i = 0; i < 3; i++) { const w = i === 0 ? 3 : 2; pxLine(ctx, pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, HAUNCH_COL.dark, w + 1, 0); pxLine(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, w, 0); }
    ctx.fillStyle = HAUNCH_COL.hi; ctx.fillRect(Math.round(pts[1][0]), Math.round(pts[1][1]) - 1, 2, 1); ctx.fillRect(Math.round(hx), Math.round(hy), 2, 1); // knee and thigh highlights
    ctx.fillStyle = HAUNCH_COL.dark; ctx.fillRect(Math.round(pts[3][0]) - (f > 0 ? 0 : 2), Math.round(pts[3][1]), 3, 1);     // long toes
  };
  if (which === 'far') leg(-2, -1, '#4e3424', '#5a3a28'); else {
    leg(1, 1, HAUNCH_COL.mid, '#8a5a40');
    // Small forelegs, pawing the ground.
    const ph = p.moving && !air ? Math.sin(p.t * 14) * 1.5 : air ? 2 : 0;
    for (const d of [0, 2]) { pxLine(ctx, bx + f * (4 + d), by + 4, bx + f * (5 + d) + ph * (d ? -1 : 1), p.y + 5 - (air ? 2 : 0), HAUNCH_COL.dark, 2, 0); pxLine(ctx, bx + f * (4 + d), by + 4, bx + f * (5 + d) + ph * (d ? -1 : 1), p.y + 5 - (air ? 2 : 0), HAUNCH_COL.mid, 1, 0); }
  }
}

// --- Burrowing Claws: stubby forelimbs with huge curved talons, scooping as you move ------
const CLAW_COL = { dark: '#1a1410', arm: '#5a4a3a', bone: '#e8e0c8', boneD: '#968868' };
function drawDiggingClaws(ctx, p, bx, by, which) {
  if (!limbRootIs(p, 'burrow')) return;
  const f = p.aimX < 0 ? -1 : 1, near = which === 'near';
  const ph = p.moving ? p.t * 14 + (near ? 0 : Math.PI) : 0;
  const scoop = p.moving ? Math.sin(ph) : 0.3; // -1 reaching forward .. 1 raked back
  const sx = bx + f * (near ? 4 : 2), sy = by + (near ? 5 : 4);
  const ex = sx + f * (3 - scoop * 2), ey = sy + 3 - Math.abs(scoop);
  pxLine(ctx, sx, sy + 1, ex, ey + 1, CLAW_COL.dark, 3, 0); pxLine(ctx, sx, sy, ex, ey, CLAW_COL.arm, 2, 0);
  for (let t = -1; t <= 1; t++) { // three curved talons
    const a = (f > 0 ? 0 : Math.PI) + t * 0.45 + scoop * 0.6 * f, len = 4 + (t === 0 ? 1 : 0);
    const mx = ex + Math.cos(a) * len * 0.6, my = ey + Math.sin(a) * len * 0.6 + 1, tx = ex + Math.cos(a + f * 0.6) * len, ty = ey + Math.sin(a + f * 0.6) * len + 2;
    pxLine(ctx, ex, ey, mx, my, CLAW_COL.boneD, 1, 0); pxLine(ctx, mx, my, tx, ty, CLAW_COL.bone, 1, 0);
  }
  if (!near) { // stubby hind feet
    ctx.fillStyle = CLAW_COL.arm; ctx.fillRect(Math.round(bx - f * 5), Math.round(p.y + 4), 3, 2); ctx.fillRect(Math.round(bx - f * 2), Math.round(p.y + 5), 3, 2);
  }
}

// --- Root Legs: gnarled roots that step like legs, then spread and dig in when you root ------
const ROOT_LEGS = [
  { hx: -3, hy: 1, fx: -9, fy: 2, near: false, g: 0 }, { hx: 3, hy: 1, fx: 9, fy: 2, near: false, g: 1 },
  { hx: -2, hy: 3, fx: -6, fy: 7, near: true, g: 1 }, { hx: 2, hy: 3, fx: 6, fy: 7, near: true, g: 0 },
];
function drawRootWalker(ctx, p, bx, by, which) {
  if (!p.roots) return;
  const k = STAGE_SCALE[p.stage] * 1.1;
  p.roots.forEach((f, i) => {
    const L = ROOT_LEGS[i]; if (L.near !== (which === 'near')) return;
    let fx = f.x, fy = f.y;
    if (p.rooted) { const sp = Math.min(1, (p.rootedFor || 0) / 0.3); fx += (fx - p.x) * 0.6 * sp; fy += 2 * sp; } // splayed wide when rooted
    const lift = f.t > 0 ? Math.sin((1 - f.t / 0.11) * Math.PI) * 2 : 0, hx = bx + L.hx * k, hy = by + 3 + L.hy * k;
    const mx = (hx + fx) / 2 + Math.sin(i * 2.1 + p.t * 2) * 1.2, my = (hy + fy) / 2 - 2;
    pxLine(ctx, hx, hy + 1, mx, my + 1, '#140c06', 3, 0.4); pxLine(ctx, mx, my + 1, fx, fy - lift + 1, '#140c06', 2, 0.4);
    pxLine(ctx, hx, hy, mx, my, '#5a4024', 2, 0.4); pxLine(ctx, mx, my, fx, fy - lift, '#6a5030', 1, 0.4);
    ctx.fillStyle = '#8a6a40'; ctx.fillRect(Math.round(mx), Math.round(my) - 1, 1, 1); // a knot in the bark
    if (p.rooted) { ctx.fillStyle = '#140c06'; for (const d of [-1, 1]) ctx.fillRect(Math.round(fx + d * 2), Math.round(fy + 1), 1, 2); } // rootlets digging in
  });
}

// --- Bone Stilts: two long bone legs taking slow, swaying strides --------------------------
function drawStiltLegs(ctx, p, bx, by) {
  const stride = p.moving ? Math.sin(p.t * 9) : 0;
  for (const [side, ph] of [[-1, 1], [1, -1]]) {
    const hx = bx + side * 3, hy = by + 5, fx = bx + side * 4 + stride * ph * 5, fy = p.y + 5 - Math.max(0, stride * ph) * 2;
    const kx = (hx + fx) / 2 + side * 2, ky = (hy + fy) / 2;
    pxLine(ctx, hx, hy, kx, ky, '#2e2618', 2, 0); pxLine(ctx, kx, ky, fx, fy, '#2e2618', 2, 0);
    pxLine(ctx, hx, hy, kx, ky, '#c4b898', 1, 0); pxLine(ctx, kx, ky, fx, fy, '#e8e0c8', 1, 0);
    ctx.fillStyle = '#e8e0c8'; ctx.fillRect(Math.round(kx) - 1, Math.round(ky), 2, 2);
  }
}

// --- Pseudopods: small nubs of you reaching out and pulling back all around your base -----
function drawPseudopodNubs(ctx, p, x, y) {
  if (limbRootIs(p, 'fins') === false) return;
  const col = p.tint ? p.tint.color : '#8a9a7a';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.6, ext = 1.5 + 2 * Math.max(0, Math.sin(p.t * (p.moving ? 9 : 3) + i * 1.7));
    const nx = x + Math.cos(a) * (6 + ext), ny = y + 6 + Math.sin(a) * (2 + ext * 0.4);
    pxCircle(ctx, nx, ny, 1.8, '#141a14'); pxCircle(ctx, nx, ny, 1.2, col);
  }
}

// Everything above, behind the body ('far') or in front ('near').
function drawProceduralLimbs(ctx, p, x, y, which) {
  if (p.limbWear > 0) return;
  drawCrab(ctx, p, x, y, which);
  drawHaunches(ctx, p, x, y, which);
  drawDiggingClaws(ctx, p, x, y, which);
  drawRootWalker(ctx, p, x, y, which);
  if (which === 'far') { if (movement(p).stilts) drawStiltLegs(ctx, p, x, y); if (limbRootIs(p, 'fins')) drawPseudopodNubs(ctx, p, x, y); }
}

function updateProceduralLimbs(p, dt) {
  if (p.pincerAnimT > 0) p.pincerAnimT -= dt;
  updateWalker(p, 'crab', CRAB_LEGS, limbRootIs(p, 'crablegs') && !p.flying, 10, 0.07, dt, (f) => { if (Math.random() < 0.3) Sfx.play('clack'); if (Math.random() < 0.3) stainPx(f.x, f.y, ['#141010'], 1); });
  updateWalker(p, 'roots', ROOT_LEGS, limbRootIs(p, 'rootlegs'), 9, 0.11, dt, (f) => { if (Math.random() < 0.4) stainPx(f.x, f.y, ['#1e140a', '#2a1c10'], 1); });
  if (limbRootIs(p, 'burrow') && p.moving && Math.random() < 0.35) { const f = p.aimX < 0 ? -1 : 1; game.particles.push({ x: p.x + f * 4, y: p.y + 5, vx: -f * rand(30, 70), vy: rand(-50, -15), life: 0.3, color: Math.random() < 0.5 ? '#3a3230' : '#5a4a3a', size: 1 }); } // dirt flung back
}

// Painted overlays the procedural limbs replace.
function limbOverlayHidden(p, ov) {
  return (ov === 'claws' && limbRootIs(p, 'burrow')) || (ov === 'hindlegs' && limbRootIs(p, 'haunches'));
}

'use strict';
// ---------------------------------------------------------------------------
// Abilities: the mechanics behind mutations that do more than change stats:
//   slime terrain, allies (spiderlings, maggots, your twin), spore clouds,
//   the molted decoy, enemy targeting (decoy / lure), burrowing, the snail
//   shell, centipede segments, grabbing & throwing, the parasite, limb wear.
// ---------------------------------------------------------------------------

// --- Slime: your trail is terrain ------------------------------------------------
function addSlime(x, y) {
  const s = game.room.slime;
  s.push({ x, y, t: 8 });
  if (s.length > 500) s.shift();
}

function onSlime(x, y, r = 5) {
  for (const s of game.room.slime) if (Math.abs(s.x - x) < r && Math.abs(s.y - y) < r) return true;
  return false;
}

function inOwnPool(x, y) {
  return game.puddles.some(pd => pd.team === 'player' && Math.hypot(pd.x - x, pd.y - y) < pd.r);
}

// --- Where enemies think you are -----------------------------------------------------
function enemyTarget(e) {
  const p = game.player;
  // Swarm Queen: an infested host hunts its own kind.
  if (e.infest && p.stats.oviCharm) {
    let best = null, bd = 999;
    for (const o of game.enemies) { if (o === e || o.dead || o.infest) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
    if (best) return best;
  }
  if (e.blindT > 0 || (p.stats.gasInvis && p.venting)) { // blinded (or you vanished in your gas): wander
    if (!e.wander || Math.hypot(e.wander.x - e.x, e.wander.y - e.y) < 6) e.wander = randomFloorSpot(game.room, null, 0);
    return e.wander;
  }
  if (game.decoy) return game.decoy;
  if (p.stats.lure) return lurePoint(p);
  return p;
}

function lurePoint(p) {
  return { x: p.x - p.aimX * 16, y: p.y - p.aimY * 16 - 6 };
}

// --- Allies -----------------------------------------------------------------------------
function spawnAlly(kind, x, y) {
  const a = { kind, x, y, r: kind === 'twin' ? 4 : 3, t: Math.random() * 3, biteT: 0, hp: kind === 'twin' ? 2 : 1, inv: 0, flying: false };
  a.life = (kind === 'spiderling' ? 8 : kind === 'maggot' ? 18 : Infinity) * ((game.player && game.player.stats.allyLife) || 1);
  if (kind === 'spiderling' && game.player && game.player.stats.flyingBrood) a.flying = true; // Winged Brood
  if (kind === 'polyp') { const pp = game.player.stats.polyp || game.player.stats.grovePolyp; a.r = 4; a.life = pp ? pp.life : 10; }
  game.allies.push(a);
  return a;
}

function ensureTwin() {
  const p = game.player;
  if (p.stats.twin && !p.twinDead && !game.allies.some(a => a.kind === 'twin')) spawnAlly('twin', p.x - 10, p.y);
}

function updateAllies(dt) {
  const p = game.player;
  for (const a of game.allies) {
    a.t += dt; a.life -= dt; a.biteT -= dt; a.inv -= dt;
    if (a.life <= 0) {
      a.dead = true; burst(a.x, a.y, '#5a3a28', 4, 30);
      if (a.kind === 'maggot' && p.stats.maggotBurst) { spawnPuddle(a.x, a.y, 14, 3, 'player'); Sfx.play('splat'); }
      if (a.kind === 'polyp' && p.stats.polypBurst) polypPop(a);
      continue;
    }
    if (a.kind === 'polyp') { updatePolyp(a, dt); continue; } // rooted in place
    let tx, ty, speed;
    if (a.kind === 'twin') {
      // Hover just behind you, mirroring your aim.
      tx = p.x - p.aimX * 12 + p.aimY * 8; ty = p.y - p.aimY * 12 - p.aimX * 8; speed = 120;
    } else {
      const e = nearestEnemy(a.x, a.y, 200);
      if (e) {
        tx = e.x; ty = e.y; speed = (a.kind === 'spiderling' ? 95 : 42) * (a.flying ? 1.5 : 1);
        if (Math.hypot(e.x - a.x, e.y - a.y) < e.r + a.r + 1 && a.biteT <= 0) {
          a.biteT = 0.5;
          damageEnemy(e, (a.kind === 'maggot' ? 1 : 0.8) * (p.stats.allyDmg || 1), e.x - a.x, e.y - a.y, true);
          if (a.kind === 'spiderling' && p.stats.venomBrood) spawnPuddle(e.x, e.y, 7, 1.5, 'player');
          bloodSpray(e.x, e.y, e.x - a.x, e.y - a.y, 3, ENEMY_TYPES[e.type].fluid, 60);
        }
      } else { tx = p.x + Math.cos(a.t) * 14; ty = p.y + Math.sin(a.t) * 10; speed = 50; }
    }
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d > 2) moveEntity(game.room, a, (dx / d) * speed * dt, (dy / d) * speed * dt);
  }
  // Your twin can be hurt by enemies (contact) just like you.
  const twin = game.allies.find(a => a.kind === 'twin' && !a.dead);
  if (twin && twin.inv <= 0) {
    for (const e of game.enemies) {
      if (e.spawnT <= 0 && !e.dead && Math.hypot(e.x - twin.x, e.y - twin.y) < e.r + twin.r) { hurtTwin(twin); break; }
    }
  }
  game.allies = game.allies.filter(a => !a.dead);
}

function hurtTwin(twin) {
  if (twin.inv > 0) return;
  twin.hp--; twin.inv = 1;
  bloodSpray(twin.x, twin.y, 0, 0, 8, FLUID.blood, 70);
  Sfx.play('hurt');
  if (twin.hp <= 0) {
    const p = game.player;
    twin.dead = true;
    p.twinDead = true;
    p.twinLost = (p.twinLost || 0) + 1;
    gibs(twin.x, twin.y, 5, ['#f4c0c4', '#d898a4', '#a06a78'], FLUID.blood);
    floatText(p.x, p.y - 22, 'YOUR TWIN IS DEAD', COST_COLOR);
    recomputeStats(p);
  }
}

function drawAllies(ctx) {
  // Mycelial Web: threads joining your polyps.
  if (game.player.stats.polypLink) {
    const ps = game.allies.filter(a => a.kind === 'polyp' && !a.dead);
    for (let i = 0; i < ps.length - 1; i++) pxLine(ctx, ps[i].x, ps[i].y, ps[i + 1].x, ps[i + 1].y, '#c8c0a0', 1, 1);
  }
  for (const a of game.allies) {
    if (a.inv > 0 && Math.floor(a.inv * 16) % 2) continue;
    const left = a.kind === 'twin' ? game.player.aimX < 0 : (nearestEnemy(a.x, a.y, 200) || game.player).x < a.x;
    const img = SPR[a.kind + (left ? '_L' : '')];
    if (img) drawCentered(ctx, img, a.x, a.y - (a.kind === 'twin' ? 3 : 1) + (Math.floor(a.t * 8) % 2 ? 0 : -1));
  }
}

// --- Spore clouds ------------------------------------------------------------------------
function spawnCloud(x, y, r) {
  game.clouds.push({ x, y, r, life: 3.2 });
  Sfx.play('splat');
}

function updateClouds(dt) {
  const s = game.player.stats;
  for (const c of game.clouds) {
    c.life -= dt;
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - c.x, e.y - c.y) < c.r) {
        if (!(e.blindT > 0)) floatText(e.x, e.y - 10, '?', '#9aae50');
        e.blindT = Math.max(e.blindT || 0, 2);
        if (s.cloudDps) damageEnemy(e, s.cloudDps * s.damage * dt, 0, 0, true); // Rot Bloom
        if (c.fire) damageEnemy(e, 3 * s.damage * dt, 0, 0, true);               // Firestorm
        if (c.toxic) damageEnemy(e, 1.5 * s.damage * dt, 0, 0, true);            // Rot Halo, Toxic Wings
      }
    }
  }
  game.clouds = game.clouds.filter(c => c.life > 0);
}

// Spore Fire: a bile flame touching a spore cloud sets it off.
function igniteCloudAt(x, y) {
  const c = game.clouds.find(c => Math.hypot(c.x - x, c.y - y) < c.r);
  if (!c) return false;
  c.life = 0;
  const dmg = 4 * game.player.stats.damage;
  game.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 4, max: c.r + 10, t: 0.25 });
  for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - c.x, e.y - c.y) < c.r + 10 + e.r) damageEnemy(e, dmg, e.x - c.x, e.y - c.y, true);
  for (let i = 0; i < 3; i++) spawnPuddle(c.x + rand(-8, 8), c.y + rand(-8, 8), 10, 2.5, 'player');
  burst(c.x, c.y, '#e8a020', 24, 140, 0.5);
  burst(c.x, c.y, '#b0c040', 14, 90, 0.4);
  game.shake = Math.max(game.shake, 5);
  Sfx.play('blast');
  return true;
}

function drawClouds(ctx) {
  for (const c of game.clouds) {
    const fade = Math.min(1, c.life / 0.8);
    ctx.globalAlpha = 0.5 * fade;
    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 1, 9) * Math.PI * 2 + c.life * 0.4, d = Math.sqrt(hash2(i, 2, 9)) * c.r;
      pxCircle(ctx, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2 + hash2(i, 3, 9) * 2, c.fire ? (i % 3 ? '#a04018' : '#e8a020') : c.toxic ? (i % 3 ? '#3e5a1e' : '#8aaa3a') : i % 3 ? '#5a6a3a' : '#7a8a52');
    }
    ctx.globalAlpha = 1;
  }
  drawMiasma(ctx);
}

// --- Decoy husk (Exoskeleton Molt) ----------------------------------------------------
function updateDecoy(dt) {
  if (game.decoy && (game.decoy.t -= dt) <= 0) {
    burst(game.decoy.x, game.decoy.y, '#8a7a5a', 10, 60);
    if (game.player.stats.huskBomb) {
      const d = game.decoy;
      spawnPuddle(d.x, d.y, 22, 3.5, 'player');
      for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - d.x, e.y - d.y) < 30 + e.r) damageEnemy(e, 4 * game.player.stats.damage, e.x - d.x, e.y - d.y, true);
      game.shake = Math.max(game.shake, 4);
      Sfx.play('splat');
    }
    game.decoy = null;
  }
}

function drawDecoy(ctx) {
  const d = game.decoy;
  if (!d) return;
  if (!d.husk) d.husk = darkened(d.body || SPR.stages[d.stage].body); // a dried shell of whatever you were
  drawCentered(ctx, d.husk, d.x, d.y - 4);
}

// --- Centipede body: segments trailing behind you -------------------------------------
function updateCentipede(p) {
  const n = p.stats.centipede;
  if (!n) { p.trail = []; return; }
  const last = p.trail[0];
  if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1.5) p.trail.unshift({ x: p.x, y: p.y });
  if (p.trail.length > n * 5 + 1) p.trail.length = n * 5 + 1;
}

function centipedeSegments(p) {
  const out = [];
  for (let k = 1; k <= p.stats.centipede; k++) if (p.trail[k * 5]) out.push(p.trail[k * 5]);
  return out;
}

// Enemy shots smash against your segments.
function segmentBlocks(b) {
  const p = game.player;
  if (!p.stats.centipede) return false;
  for (const s of centipedeSegments(p)) {
    if (Math.hypot(s.x - b.x, s.y - b.y) < 5) {
      burst(b.x, b.y, '#8e7254', 4, 40); Sfx.play('clank');
      if (p.stats.spinedSegments) ringFrom(s.x, s.y, 6);
      return true;
    }
  }
  return false;
}

// Biting Segments: each segment bites whatever touches it.
function updateSegments(p, dt) {
  if (!p.stats.segBite) return;
  for (const seg of centipedeSegments(p)) {
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || e.segT > 0 || Math.hypot(e.x - seg.x, e.y - seg.y) > e.r + 4) continue;
      e.segT = 0.5;
      damageEnemy(e, p.stats.segBite * p.stats.damage, e.x - seg.x, e.y - seg.y, true);
      game.fx.push({ kind: 'bite', x: (e.x + seg.x) / 2, y: (e.y + seg.y) / 2, t: 0.1 });
    }
  }
  for (const e of game.enemies) if (e.segT > 0) e.segT -= dt;
}

// A small ring of bone shards from any point (Spined Segments).
function ringFrom(x, y, n) {
  const off = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    spawnBullet({ x, y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 1.5, kind: 'spine', dmg: 0.8 * game.player.stats.damage, life: 0.45, color: PAL.white });
  }
}

function drawCentipede(ctx, p) {
  const segs = centipedeSegments(p);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const ph = Math.floor(p.t * (p.moving ? 16 : 3) + i * 2) % 2; // a ripple of little legs down the body
    ctx.fillStyle = '#2a1c14';
    ctx.fillRect(Math.round(s.x - 5), Math.round(s.y - 1 + ph), 2, 1); ctx.fillRect(Math.round(s.x + 4), Math.round(s.y - ph), 2, 1);
    drawCentered(ctx, SPR.segment, s.x, s.y - 2 + (Math.floor(p.t * 10 + i) % 2 ? 0 : -1));
  }
}

// --- Grasping hands: grab & throw ---------------------------------------------------------
function handAction(p) {
  const s = p.stats;
  if (p.held) { throwHeld(p); return; }
  // Grab the nearest corpse or small enemy in front of you.
  let best = null, bd = 24;
  for (const c of game.room.corpses) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bd && (d < 8 || ((c.x - p.x) * p.aimX + (c.y - p.y) * p.aimY) / d > 0.2)) { bd = d; best = { kind: 'corpse', ref: c }; }
  }
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || e.elite || e.r > 6) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
    if (d < bd && (d < 6 || ((e.x - p.x) * p.aimX + (e.y - p.y) * p.aimY) / (d + e.r) > 0.2)) { bd = d; best = { kind: 'enemy', ref: e }; }
  }
  if (!best) { Sfx.play('whip'); return; }
  grab(p, best);
}

// Bile Bomb: whatever you throw lands in a burst of burning bile.
function bileBombAt(x, y) {
  if (!game.player.stats.bileBomb) return;
  spawnPuddle(x, y, 18, 3, 'player');
  burst(x, y, '#b0c040', 12, 90, 0.4);
  Sfx.play('splat');
}

function grab(p, h) {
  p.held = h;
  h.ref.held = true;
  Sfx.play('chomp');
}

function heldPos(p) {
  return { x: p.x + p.aimX * 10, y: p.y + p.aimY * 10 - 4 };
}

function updateHeld(p) {
  const h = p.held;
  if (!h) return;
  if (h.ref.dead && h.kind === 'enemy') { p.held = null; return; }
  const pos = heldPos(p);
  h.ref.x = pos.x; h.ref.y = pos.y;
  if (h.kind === 'enemy') { h.ref.kx = h.ref.ky = 0; }
}

function throwHeld(p) {
  const h = p.held, s = p.stats;
  p.held = null;
  h.ref.held = false;
  const sp = 230;
  if (h.kind === 'corpse') {
    game.room.corpses = game.room.corpses.filter(c => c !== h.ref);
    spawnBullet({
      x: h.ref.x, y: h.ref.y, vx: p.aimX * sp, vy: p.aimY * sp, r: 5, dmg: s.handDmg, life: 0.7,
      kind: 'thrown', corpse: h.ref, color: '#5a2a2a',
    });
  } else {
    const e = h.ref;
    e.thrown = { vx: p.aimX * sp, vy: p.aimY * sp, t: 0.6, dmg: s.handDmg, hit: new Set([e]), bomb: s.bileBomb };
  }
  Sfx.play('dash');
}

// A thrown corpse splatters where it lands, spilling its DNA there.
function landThrownCorpse(b) {
  const c = b.corpse;
  c.x = clamp(b.x, TILE + 4, ROOM_PX_W - TILE - 4);
  c.y = clamp(b.y, TILE + 4, ROOM_PX_H - TILE - 4);
  game.room.corpses.push(c);
  for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - c.x, e.y - c.y) < 18 + e.r) damageEnemy(e, b.dmg, e.x - c.x, e.y - c.y, true);
  bileBombAt(c.x, c.y);
  burstCorpse(c);
}

// Thrown enemies fly, hurting whatever they hit (and themselves on impact).
function updateThrownEnemy(e, dt) {
  const t = e.thrown;
  t.t -= dt;
  const bumped = moveEntity(game.room, e, t.vx * dt, t.vy * dt);
  const s = game.player.stats;
  for (const o of game.enemies) {
    if (o.dead || t.hit.has(o) || Math.hypot(o.x - e.x, o.y - e.y) > o.r + e.r) continue;
    t.hit.add(o);
    damageEnemy(o, t.dmg, t.vx, t.vy, true);
    // Avalanche: what a howled body hits gets flung too.
    if (t.howled && s.howlChain && !o.dead && !o.thrown && !ENEMY_TYPES[o.type].boss) o.thrown = { vx: t.vx * 0.8, vy: t.vy * 0.8, t: 0.3, dmg: t.dmg * 0.8, hit: new Set([o, e]), howled: true };
    bloodSpray(o.x, o.y, t.vx, t.vy, 8, ENEMY_TYPES[o.type].fluid, 100);
    Sfx.play('ram');
  }
  if (bumped || t.t <= 0) {
    e.thrown = null;
    if (bumped) strikeSeal(e.x, e.y, 8); // thrown into the seal
    if (t.bomb) bileBombAt(e.x, e.y);
    // A howled body only hurts when it hits something (Wallbreaker: walls hurt far more).
    const mul = t.howled ? (bumped ? s.wallSlamMul || 1 : 0) : bumped ? 1 : 0.5;
    if (mul) damageEnemy(e, t.dmg * mul, t.vx, t.vy, true);
    if (bumped && t.howled && s.wallSlamMul) ringFrom(e.x, e.y, 4);
    game.shake = Math.max(game.shake, 3);
  }
}

// --- Burrowing claws ------------------------------------------------------------------------
function startBurrow(p) {
  p.burrowT = p.stats.burrow;
  p.inv = Math.max(p.inv, p.burrowT + 0.1);
  p.burrowHit = new Set();
  burst(p.x, p.y + 3, '#3a3230', 12, 70);
  Sfx.play('slam');
}

function updateBurrow(p, dt, ix, iy) {
  p.burrowT -= dt;
  moveEntity(game.room, p, ix * 115 * dt, iy * 115 * dt);
  if (Math.random() < 0.5) game.particles.push({ x: p.x + rand(-3, 3), y: p.y + rand(0, 3), vx: rand(-20, 20), vy: rand(-30, -5), life: 0.25, color: '#3a3230', size: 2 });
  if (p.stats.moleworm) {
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || p.burrowHit.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > e.r + 6) continue;
      p.burrowHit.add(e);
      damageEnemy(e, p.stats.burrowDmg * 0.6, 0, -1, true);
      bloodSpray(e.x, e.y, 0, -1, 8, ENEMY_TYPES[e.type].fluid, 90);
    }
  }
  if (p.burrowT <= 0) {
    // Erupt!
    const s = p.stats;
    game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 24, t: 0.25 });
    strikeSeal(p.x, p.y, 24);
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) >= 24 + e.r) continue;
      damageEnemy(e, s.burrowDmg, (e.x - p.x) || 1, e.y - p.y, true);
      if (s.burrowBleed && !e.dead) { e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, s.burrowBleed); }
    }
    if (s.eruptStun) { // Quake
      game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 56, t: 0.35 });
      for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 56 + e.r) e.stunT = Math.max(e.stunT || 0, s.eruptStun);
    }
    if (s.eruptRing) fireRing(p, s.eruptRing);
    if (s.seismicHowl && s.howl) { howl(p, 1.5, true); groundCracks(p.x, p.y + 4); } // Seismic Howl
    for (let i = 0; i < (s.eruptBrood || 0); i++) spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3));
    if (s.ambush) p.ambushT = 1.5;
    for (const c of corpsesNear(p.x, p.y, 24)) damageCorpse(c, s.burrowDmg);
    burst(p.x, p.y, '#4e4642', 18, 120, 0.5);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('slam');
  }
}

// --- Parasite Brain: sometimes it drives --------------------------------------------------
// It drives, but it needs its host alive: it heads somewhere clear of
// enemies (bosses most of all), enemy acid and enemy shots, and turns away
// if danger appears ahead. At 1 health it doesn't dare take over.
function parasiteRisk(p, ax, ay) {
  let risk = 0;
  for (let d = 0; d <= 40; d += 8) {
    const x = p.x + ax * d, y = p.y + ay * d;
    for (const pd of game.puddles) if (pd.team !== 'player' && Math.hypot(x - pd.x, y - pd.y) < pd.r + 5) risk += 3;
    for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(x - e.x, y - e.y) < e.r + (ENEMY_TYPES[e.type].boss ? 22 : 10)) risk += ENEMY_TYPES[e.type].boss ? 6 : 3;
    for (const b of game.bullets) if (b.team === 'enemy' && Math.hypot(x - b.x, y - b.y) < 8) risk += 1;
  }
  return risk;
}
function parasiteHeading(p) {
  let best = [0, 0], bestRisk = Infinity;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + rand(-0.2, 0.2), ax = Math.cos(a), ay = Math.sin(a);
    const r = parasiteRisk(p, ax, ay) + Math.random() * 0.5;
    if (r < bestRisk) { bestRisk = r; best = [ax, ay]; }
  }
  return best;
}

function updateParasite(p, dt) {
  if (!p.stats.parasite || p.stats.symbiote) { p.controlT = 0; return; }
  if (p.controlT > 0 && p.stats.parasiteInv && Math.random() < dt * 20) burst(p.x, p.y - 2, MALIGNANT_COLOR, 1, 30, 0.2);
  if (p.controlT > 0) {
    p.controlT -= dt;
    if ((p.steerT = (p.steerT || 0) - dt) <= 0) { // look ahead; swerve away from danger
      p.steerT = 0.1;
      if (parasiteRisk(p, p.controlX, p.controlY) > 0) [p.controlX, p.controlY] = parasiteHeading(p);
    }
    return;
  }
  const gap = () => p.stats.parasiteOften ? rand(5, 9) : rand(10, 18);
  p.parasiteT = (p.parasiteT === undefined ? gap() : p.parasiteT) - dt;
  if (p.parasiteT <= 0 && p.hp <= 1) p.parasiteT = 1; // too close to death: it waits
  if (p.parasiteT <= 0) {
    p.parasiteT = gap();
    p.controlT = 1.2;
    [p.controlX, p.controlY] = parasiteHeading(p);
    floatText(p.x, p.y - 22, 'IT TAKES CONTROL', MALIGNANT_COLOR);
    for (let i = 0; i < (p.stats.parasiteBrood || 0); i++) spawnAlly('maggot', p.x + rand(-4, 4), p.y + rand(-3, 3)); // Parasitic Brood
    Sfx.play('flicker');
  }
}

// --- Echo Skull: a scream that stuns ------------------------------------------------------
function scream(p) {
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 50, t: 0.3 });
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    if (d >= 50 + e.r) continue;
    e.stunT = p.stats.echo;
    if (p.stats.banshee && !ENEMY_TYPES[e.type].boss) { e.kx += (e.x - p.x) / d * 300; e.ky += (e.y - p.y) / d * 300; }
  }
  if (p.stats.banshee) { // Banshee: shreds enemy shots out of the air
    for (const b of game.bullets) if (b.team === 'enemy' && Math.hypot(b.x - p.x, b.y - p.y) < 60) { b.dead = true; burst(b.x, b.y, PAL.red, 2, 30); }
  }
  if (p.stats.screamRing) fireRing(p, p.stats.screamRing); // Echo Chamber
  if (p.stats.dashHowl && p.stats.howl) howl(p, 1, true);   // Resonance
  Sfx.play('scream');
}

// --- Playstyle attacks: MOUTH roots that replace shooting ---------------------------------

// Ovipositor: a slow larva that burrows into a host, eats it, and bursts out.
function fireLarva(p, mul = 1, spread = 0) {
  const s = p.stats, a = Math.atan2(p.aimY, p.aimX) + rand(-spread, spread);
  spawnBullet({ x: p.x + Math.cos(a) * 5, y: p.y + Math.sin(a) * 5, vx: Math.cos(a) * 105, vy: Math.sin(a) * 105, r: 3, dmg: 0.4 * mul, life: 1.6, kind: 'shot', larva: true, homing: Math.max(s.homing, 1.5), round: true, color: '#e8dcc0' });
  Sfx.play('splat');
}

function infest(e) {
  const s = game.player.stats;
  if (!s.ovi || e.dead) return;
  if (e.infest) { e.infest.t = Math.max(e.infest.t, s.ovi.time * 0.5); return; }
  e.infest = { t: s.ovi.time, carried: 0, wriggle: rand(0, 6) };
  floatText(e.x, e.y - 10, 'INFESTED', '#e8dcc0');
}

function updateInfested(dt) {
  const s = game.player.stats;
  for (const e of game.enemies) {
    if (!e.infest || e.dead) continue;
    if (!s.ovi) { e.infest = null; continue; }
    const inf = e.infest;
    inf.t -= dt; inf.carried += dt;
    damageEnemy(e, s.ovi.dps * dt, 0, 0, true);
    if (e.dead || !e.infest) continue; // its death already burst it
    if (s.oviConfuse) { e.blindT = Math.max(e.blindT || 0, 0.4); e.slowT = Math.max(e.slowT || 0, 0.3); }
    if (s.oviCharm) { // Swarm Queen: it savages its own kind
      for (const o of game.enemies) if (o !== e && !o.dead && o.spawnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < o.r + e.r + 3) damageEnemy(o, 3 * s.damage * dt, 0, 0, true);
    }
    if (Math.random() < dt * 4) stainPx(e.x + rand(-2, 2), e.y + rand(1, 3), ENEMY_TYPES[e.type].fluid, 1);
    if (inf.t <= 0) hostBurst(e);
  }
}

// The brood bursts out of its host and goes looking for more.
function hostBurst(e) {
  const s = game.player.stats, inf = e.infest;
  e.infest = null;
  if (!s.ovi || !inf) return;
  const n = s.ovi.brood + (s.oviGrow ? Math.min(4, Math.floor(inf.carried / 1.5)) : 0);
  bloodSpray(e.x, e.y, 0, 0, 18, ENEMY_TYPES[e.type].fluid, 130);
  Sfx.play('hatch');
  if (s.oviBurst) { // Chestburster
    for (const o of game.enemies) if (o !== e && !o.dead && o.spawnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < 30 + o.r) damageEnemy(o, s.oviBurst * s.damage, o.x - e.x, o.y - e.y, true);
    game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 4, max: 30, t: 0.25 });
    game.shake = Math.max(game.shake, 3);
  }
  if (!e.dead) damageEnemy(e, s.ovi.burstDmg + (s.oviBurst ? s.oviBurst * s.damage : 0), 0, 0, true); // tearing its way out
  if (s.oviMaggots) spawnAlly('maggot', e.x, e.y); // Plaguebearer
  const spiders = s.oviSpider ? Math.ceil(n / 2) : 0;
  for (let i = 0; i < spiders; i++) spawnAlly('spiderling', e.x + rand(-3, 3), e.y + rand(-3, 3));
  for (let i = 0; i < n - spiders; i++) {
    const a = rand(0, Math.PI * 2);
    spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 2, dmg: 0.2 * s.damage, life: 1.4, kind: 'shot', larva: true, homing: 6, round: true, color: '#e8dcc0', hitSet: new Set([e]) });
  }
}

// Miasma: a toxic cloud that always surrounds you. Hold fire to vent it wider.
function updateMiasma(p, dt) {
  const s = p.stats;
  if (!s.miasma) { p.gasR = 0; return; }
  const r = s.miasma.r * (p.venting ? 1.6 : 1) * (STAGE_SCALE[p.stage] + 0.1);
  p.gasR = r;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > r + e.r) { if (e.gasT) e.gasT = Math.max(0, e.gasT - dt * 2); continue; }
    e.gasT = (e.gasT || 0) + dt;
    const ramp = s.gasRamp ? 1 + Math.min(3, e.gasT * 0.6) : 1; // Caustic Lungs
    damageEnemy(e, s.miasma.dps * ramp * dt, 0, 0, true);
    if (s.gasHide) e.blindT = Math.max(e.blindT || 0, 0.4);
    if (s.gasCorrode) e.corrodeUntil = game.time + 0.3;
    if (s.gasChoke) e.slowT = Math.max(e.slowT || 0, 0.3);
    if (s.toxicBloom) pollinate(e, s); // Toxic Bloom: the gas carries pollen
  }
  strikeSeal(p.x, p.y, r); // the gas eats through hazmat seals (one hit at a time)
  for (const c of game.room.corpses) { // corpses dissolve in it too (that's your DNA)
    if (c.dead || Math.hypot(c.x - p.x, c.y - p.y) > r + c.r) continue;
    c.hp -= s.miasma.dps * dt; c.shake = 0.1;
    if (c.hp <= 0) burstCorpse(c);
  }
  if (s.gasTrail && p.flying && p.moving && (p.gasTrailT = (p.gasTrailT || 0) - dt) <= 0) { // Toxic Wings
    p.gasTrailT = 0.4; game.clouds.push({ x: p.x, y: p.y, r: 12, life: 2.5, toxic: true });
  }
}

function drawMiasma(ctx) {
  const p = game.player;
  if (!p || !p.gasR || game.state !== 'play') return;
  ctx.globalAlpha = p.venting ? 0.32 : 0.22;
  for (let i = 0; i < 34; i++) {
    const a = hash2(i, 4, 7) * Math.PI * 2 + game.time * (0.4 + hash2(i, 5, 7) * 0.6) * (i % 2 ? 1 : -1);
    const d = Math.sqrt(hash2(i, 6, 7)) * p.gasR;
    pxCircle(ctx, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8, 2 + hash2(i, 8, 7) * 3, i % 3 ? '#4a6a2a' : '#7a9a3a');
  }
  ctx.globalAlpha = 1;
}

// Howl: barely hurts, but hurls things into walls and into each other.
function howl(p, mul = 1, around = false) {
  const s = p.stats, h = s.howl;
  const cone = around ? -1 : h.cone, range = h.range;
  game.fx.push({ kind: 'howl', x: p.x, y: p.y - 2, a: Math.atan2(p.aimY, p.aimX), cone, r: 6, max: range, t: 0.22 });
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > range + e.r || (d > 10 && (dx * p.aimX + dy * p.aimY) / d < cone)) continue;
    if (s.broodHowl) e.eggs = s.broodHowl; // Brood Howl: laid with eggs
    damageEnemy(e, h.dmg * mul, dx, dy, true, 0);
    if (e.dead) continue;
    if (s.howlStun) e.stunT = Math.max(e.stunT || 0, s.howlStun);
    if (s.howlBleed) { e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, s.howlBleed); }
    if (ENEMY_TYPES[e.type].boss) continue;
    const sp = Math.min(380, h.force * mul / enemyMass(e));
    e.thrown = { vx: dx / d * sp, vy: dy / d * sp, t: 0.35, dmg: h.slam, hit: new Set([e]), howled: true };
  }
  for (const c of corpsesNear(p.x, p.y, range, p.aimX, p.aimY, cone)) damageCorpse(c, 1.5 + h.dmg * 3, c.x - p.x, c.y - p.y);
  strikeSeal(p.x + p.aimX * 20, p.y + p.aimY * 20, around ? range : 20);
  game.shake = Math.max(game.shake, 3);
  Sfx.play('scream');
}

// Polyp Seeder: plant fleshy turrets.
function plantPolyp(p) {
  const s = p.stats;
  const polyps = game.allies.filter(a => a.kind === 'polyp' && !a.dead);
  if (polyps.length >= s.polyp.max) witherPolyp(polyps[0]);
  let x = p.x + p.aimX * 14, y = p.y + p.aimY * 14;
  if (pointSolid(game.room, x, y)) { x = p.x; y = p.y; }
  strikeSeal(x, y, 8);
  const a = spawnAlly('polyp', x, y);
  a.shootT = 0.4;
  burst(x, y, '#a8534f', 6, 40);
  Sfx.play('splat');
}

function witherPolyp(a) {
  a.dead = true;
  burst(a.x, a.y, '#5e2229', 6, 40);
  if (game.player.stats.polypBurst) polypPop(a);
}

// Fruiting Bodies: a polyp bursts in burning bile.
function polypPop(a) {
  const s = game.player.stats;
  a.dead = true;
  spawnPuddle(a.x, a.y, 14, 3, 'player');
  for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - a.x, e.y - a.y) < 26 + e.r) damageEnemy(e, 4 * s.damage, e.x - a.x, e.y - a.y, true);
  game.fx.push({ kind: 'ring', x: a.x, y: a.y, r: 3, max: 26, t: 0.2 });
  Sfx.play('splat');
}

function updatePolyp(a, dt) {
  const p = game.player, s = p.stats;
  const pp = s.polyp || s.grovePolyp; // Polyp Seeder, or a grove growing around you
  if (!pp) { a.dead = true; return; }
  a.shootT -= dt;
  if (s.polypBurst) for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - a.x, e.y - a.y) < e.r + a.r + 1) { polypPop(a); return; }
  let e = nearestEnemy(a.x, a.y, s.polypLash ? 34 : 95);
  if (a.shootT > 0) return;
  if (!e) { // nothing alive in reach: spit at meat instead (that's your DNA)
    const c = corpsesNear(a.x, a.y, s.polypLash ? 34 : 95)[0];
    if (!c) return;
    a.shootT = pp.rate;
    if (s.polypLash) { game.fx.push({ kind: 'whip', x1: a.x, y1: a.y - 2, x2: c.x, y2: c.y, t: 0.12 }); damageCorpse(c, pp.dmg * 1.8); }
    else { const d = Math.hypot(c.x - a.x, c.y - a.y) || 1; spawnBullet({ x: a.x, y: a.y - 3, vx: (c.x - a.x) / d * 140, vy: (c.y - a.y) / d * 140, r: 1.5, dmg: pp.dmg, life: 0.8, kind: 'shot', round: true, color: '#c870a0', polyp: true }); }
    return;
  }
  if (s.polypLash) { // Tendril Polyp
    a.shootT = 0.6;
    game.fx.push({ kind: 'whip', x1: a.x, y1: a.y - 2, x2: e.x, y2: e.y, t: 0.12 });
    damageEnemy(e, pp.dmg * 1.8, e.x - a.x, e.y - a.y, true);
    if (s.polypGrab && !e.dead) { e.slowT = Math.max(e.slowT || 0, 1); knock(e, a.x - e.x, a.y - e.y, 120); }
    if (e.dead && s.polypFeed) polypFed(p);
    Sfx.play('whip');
  } else {
    a.shootT = pp.rate;
    const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
    if (s.bilePolyps) { // Bile Garden: a spray of burning bile, twice as often
      a.shootT = pp.rate * 0.5;
      for (let k = 0; k < 3; k++) { const ang = Math.atan2(e.y - a.y, e.x - a.x) + rand(-0.2, 0.2); spawnBullet({ x: a.x, y: a.y - 3, vx: Math.cos(ang) * 165, vy: Math.sin(ang) * 165, r: 1.5, dmg: pp.dmg * 0.6, life: 0.5, kind: 'shot', round: true, fade: true, color: '#b0c040', acid: 8, polyp: true, pollen: s.polypPollen }); }
    } else spawnBullet({ x: a.x, y: a.y - 3, vx: (e.x - a.x) / d * 140, vy: (e.y - a.y) / d * 140, r: 1.5, dmg: pp.dmg, life: 0.8, kind: 'shot', round: true, color: '#c870a0', spore: s.polypCloud ? 12 : 0, polyp: true, pollen: s.polypPollen });
  }
}

// Feeding Polyps: their kills feed you.
function polypFed(p) {
  if (++p.polypKills % p.stats.polypFeed === 0 && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
}

// Frog Tongue: the tongue shoots out (see updateTongue). Small prey sticks to
// it and is reeled in and swallowed whole; fire again to spit it back out.
const TONGUE_OUT = 560, TONGUE_BACK = 380;
function tongueAttack(p, mul = 1) {
  const s = p.stats, t = s.tongue;
  if (p.tongue) return; // it's already out there
  if (p.gullet > 0) { // spit something back out
    p.gullet--;
    spawnBullet({ x: p.x + p.aimX * 6, y: p.y + p.aimY * 6, vx: p.aimX * 210, vy: p.aimY * 210, r: 4, dmg: t.spit * mul, life: 0.7, knock: 220, kind: 'shot', round: true, color: '#a8534f', acid: s.spitAcid || 0, split: s.spitSplit || 0, bloodBomb: s.bloodGulp ? 5 * s.damage : 0 });
    bloodSpray(p.x, p.y, p.aimX, p.aimY, 6, FLUID.blood, 90);
    Sfx.play('splat');
    return;
  }
  p.tongue = { len: 4, dirX: p.aimX, dirY: p.aimY, out: true, hits: [], carry: null, corpse: null, mul };
  Sfx.play('whip');
}

function tongueTip(p) {
  const T = p.tongue;
  return { x: p.x + T.dirX * T.len, y: p.y - 2 + T.dirY * T.len };
}

function updateTongue(p, dt) {
  const T = p.tongue, s = p.stats, t = s.tongue;
  if (!T) return;
  if (!t) { if (T.carry) T.carry.held = false; p.tongue = null; return; }
  if (T.out) {
    for (let n = Math.ceil(TONGUE_OUT * dt / 3); n > 0 && T.out; n--) {
      T.len += 3;
      const { x, y } = tongueTip(p);
      if (pointSolid(game.room, x, y)) { // a wall: it slaps and comes back (or reels you in)
        T.out = false; strikeSeal(x, y, 6);
        if (s.tongueYank) { reelIn(p, x - T.dirX * 6, y - T.dirY * 6, null); return; }
        break;
      }
      const e = game.enemies.find(o => !o.dead && o.spawnT <= 0 && !o.held && !T.hits.includes(o) && Math.hypot(o.x - x, o.y - y) < o.r + 2);
      if (e) {
        T.hits.push(e);
        if (!T.carry && T.hits.length === 1 && !ENEMY_TYPES[e.type].boss && !e.elite && e.r <= t.size && p.gullet < t.max) {
          T.carry = e; e.held = true; e.kx = e.ky = 0; // stuck to the tongue
          Sfx.play('chomp');
          if (!s.tonguePierce) T.out = false;
        } else {
          damageEnemy(e, t.dmg * T.mul, p.x - e.x, p.y - e.y, true, 160); // yanked toward you
          if (s.tongueVenom && !e.dead) { e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, 2); e.slowT = Math.max(e.slowT || 0, 1.5); }
          if (!s.tonguePierce) {
            T.out = false;
            if (s.tongueYank && !e.dead && !T.carry) { reelIn(p, e.x, e.y, e); return; } // too big: it reels YOU in
          }
        }
        continue;
      }
      if (!T.carry && !T.hits.length && !T.corpse) {
        const c = game.room.corpses.find(c => !c.dead && Math.hypot(c.x - x, c.y - y) < c.r + 2);
        if (c) { T.corpse = c; T.out = false; break; }
      }
      if (T.len >= t.range) T.out = false;
    }
    return;
  }
  // Reeling back in, with whatever is stuck to it.
  T.len -= TONGUE_BACK * dt;
  const { x, y } = tongueTip(p);
  if (T.carry) { if (T.carry.dead) T.carry = null; else { T.carry.x = x; T.carry.y = y + 2; } }
  if (T.corpse && !T.corpse.dead) { T.corpse.x = x; T.corpse.y = y + 2; }
  if (T.len > 5) return;
  // In the mouth: gulp.
  if (T.carry) swallow(p, T.carry);
  if (T.corpse && !T.corpse.dead) {
    burstCorpse(T.corpse);
    if (p.gullet < t.max) p.gullet++;
    p.eatT = 0.4;
    Sfx.play('gulp');
  }
  p.tongue = null;
}

// Swallowed whole: the body bulges, and it's gone (DNA and all).
function swallow(p, e) {
  e.held = false;
  e.swallowed = true;
  damageEnemy(e, e.hp + 1, 0, 0, true);
  p.gullet++;
  p.eatT = 0.4;
  bloodSpray(p.x + p.aimX * 5, p.y - 2, 0, 0, 6, ENEMY_TYPES[e.type].fluid, 50);
  floatText(p.x, p.y - 16, 'GULP', PAL.red);
  if (p.hp < p.maxHp && (p.stats.bloodGulp || Math.random() < 0.15)) { p.hp++; floatText(p.x, p.y - 22, '+1 HP', PAL.red); } // Blood Gulp: always
  Sfx.play('gulp');
}

// Grapple Tongue: the tongue sticks, and drags YOU in.
function reelIn(p, x, y, enemy) {
  p.tongue = null;
  p.pull = { x, y, enemy: enemy || null, hit: new Set() };
  p.pullT = 0.5; p.dashT = 0; p.inv = Math.max(p.inv, 0.15);
}

function drawTongue(ctx, p) {
  if (!p.tongue) return;
  const { x, y } = tongueTip(p);
  const mx = p.x + p.tongue.dirX * 4, my = p.y - 2;
  pxLine(ctx, mx, my, x, y, '#3a0a14', 3, 0);
  pxLine(ctx, mx, my, x, y, '#d86a7a', 1, 0);
  pxCircle(ctx, x, y, 2, '#e88a9a');
}

// Silk Spinner: lay sticky web lines on the floor.
function spinWeb(p) {
  const s = p.stats, w = s.silk;
  let len = 8;
  for (; len < w.len; len += 3) if (pointSolid(game.room, p.x + p.aimX * len, p.y + p.aimY * len)) break;
  game.webs.push({ x1: p.x, y1: p.y + 2, x2: p.x + p.aimX * len, y2: p.y + 2 + p.aimY * len, t: w.life, touched: new Set() });
  strikeSeal(p.x + p.aimX * len, p.y + p.aimY * len, 8);
  while (game.webs.length > w.max) game.webs.shift();
  Sfx.play('whip');
}

function onWeb(x, y) {
  return game.webs.some(w => distToSegment(x, y, w.x1, w.y1, w.x2, w.y2) < 4);
}

function updateWebs(dt) {
  const s = game.player.stats;
  for (const w of game.webs) {
    w.t -= dt;
    if (!s.silk) { w.t = 0; continue; }
    for (const e of game.enemies) {
      if (w.t <= 0) break;
      if (e.dead || e.spawnT > 0) continue;
      if (distToSegment(e.x, e.y, w.x1, w.y1, w.x2, w.y2) > e.r + 2) continue;
      damageEnemy(e, s.silk.dmg * dt, 0, 0, true);
      if (ENEMY_TYPES[e.type].boss) continue; // the silk cuts a boss, but can't hold one
      e.webT = 0.25;
      if (w.touched.has(e)) continue;
      w.touched.add(e);
      if (s.webHold) { e.stunT = Math.max(e.stunT || 0, s.webHold); floatText(e.x, e.y - 10, 'STUCK', '#e0d8d0'); } // Sticky Web
      if (s.webAcid) e.leakT = 3;  // Acid Silk
      if (s.webSnap) snapWeb(w);   // Tripwire
    }
  }
  // The silk cuts through meat lying across it, too.
  if (s.silk) for (const w of game.webs) for (const c of game.room.corpses) {
    if (c.dead || w.t <= 0 || distToSegment(c.x, c.y, w.x1, w.y1, w.x2, w.y2) > c.r + 2) continue;
    c.hp -= s.silk.dmg * 2 * dt; c.shake = 0.1;
    if (c.hp <= 0) burstCorpse(c);
  }
  game.webs = game.webs.filter(w => w.t > 0);
}

// Tripwire: the web snaps, firing bone shards all along it.
function snapWeb(w) {
  w.t = 0;
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1, nx = -(w.y2 - w.y1) / len, ny = (w.x2 - w.x1) / len;
  for (let k = 0; k <= len; k += 8) for (const side of [-1, 1]) {
    const x = w.x1 + (w.x2 - w.x1) * k / len, y = w.y1 + (w.y2 - w.y1) * k / len;
    spawnBullet({ x, y, vx: nx * side * 160, vy: ny * side * 160, r: 1.5, kind: 'spine', dmg: 1.2 * game.player.stats.damage, life: 0.4, color: PAL.white });
  }
  Sfx.play('spine');
}

function drawWebs(ctx) {
  for (const w of game.webs) {
    ctx.globalAlpha = Math.min(1, w.t) * 0.85;
    pxLine(ctx, w.x1, w.y1, w.x2, w.y2, '#d8d0c8', 1, 0.6);
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    ctx.fillStyle = '#a8a098';
    for (let k = 6; k < len; k += 7) { // cross threads
      const x = Math.round(w.x1 + (w.x2 - w.x1) * k / len), y = Math.round(w.y1 + (w.y2 - w.y1) * k / len);
      ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1);
    }
    ctx.globalAlpha = 1;
  }
}

// --- The Plant path ------------------------------------------------------------------------
function pollinate(e, s) {
  e.pollenUntil = game.time + 4;
  if (s.pollenBlind) e.blindT = Math.max(e.blindT || 0, s.pollenBlind); // Spore Bloom
  if (s.pollenSlow) e.slowT = Math.max(e.slowT || 0, s.pollenSlow);    // Hay Fever
}

// A polyp sprouting from the ground around you (Grove, Seedfall, Overgrowth).
function sproutPolyp(p, x, y) {
  if (pointSolid(game.room, x, y)) return;
  const grown = game.allies.filter(a => a.kind === 'polyp' && a.grove && !a.dead);
  if (grown.length >= 3) witherPolyp(grown[0]);
  const a = spawnAlly('polyp', x, y);
  a.grove = true; a.shootT = 0.5;
  burst(x, y + 3, '#4e3a20', 6, 40);
}

function updatePlant(p, dt) {
  const s = p.stats;
  // Bloom: puffs of pollen.
  if (s.pollen && s.pollen.r && game.room.locked && (p.pollenT = (p.pollenT ?? 1) - dt) <= 0) {
    p.pollenT = s.pollen.every;
    game.fx.push({ kind: 'ring', x: p.x, y: p.y - 6, r: 4, max: s.pollen.r, t: 0.3 });
    burst(p.x, p.y - 8, '#e8d040', 14, 70, 0.7);
    for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < s.pollen.r + e.r) pollinate(e, s);
  }
  // Standing still: Root Legs take root; the Plant set photosynthesizes.
  if (!p.moving && p.dashT <= 0 && p.pullT <= 0) p.stillT = (p.stillT || 0) + dt; else p.stillT = 0;
  const was = p.rooted;
  p.rooted = !!(s.rootLegs && !(p.limbWear > 0) && p.stillT >= s.rootLegs.delay);
  if (p.rooted && !was) { burst(p.x, p.y + 5, '#3a2a18', 8, 40); Sfx.play('chomp'); }
  if (!p.rooted && was) burst(p.x, p.y + 5, '#3a2a18', 6, 60);
  let rate = p.rooted ? s.rootLegs.heal : 0;
  if (s.setStillRegen && p.stillT > 1) rate = rate ? Math.min(rate, s.setStillRegen) : s.setStillRegen;
  if (rate && p.hp < p.maxHp) {
    if ((p.stillHealT = (p.stillHealT || 0) + dt) >= rate) { p.stillHealT = 0; p.hp++; floatText(p.x, p.y - 14, '+1 HP', '#7ab84a'); }
  } else p.stillHealT = 0;
  if (p.rooted) {
    if (s.taproot) for (const c of game.room.corpses) { // Taproot: the dead dissolve into you
      if (c.dead || Math.hypot(c.x - p.x, c.y - p.y) > s.taproot + c.r) continue;
      c.hp -= 1.5 * dt; c.shake = 0.1;
      if (Math.random() < dt * 6) game.particles.push({ x: c.x + rand(-3, 3), y: c.y, vx: (p.x - c.x) * 2, vy: (p.y - c.y) * 2, life: 0.4, color: '#5e2229', size: 1 });
      if (c.hp <= 0) burstCorpse(c);
    }
    if (s.rootDrain) for (const e of game.enemies) { // Leech Roots
      if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 40 + e.r) continue;
      damageEnemy(e, s.rootDrain * s.damage * dt, 0, 0, true);
      p.drained = (p.drained || 0) + s.rootDrain * dt;
      if (p.drained >= 12) { p.drained = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
    }
    if (s.rootLash && (p.rootLashT = (p.rootLashT || 0) - dt) <= 0) { // Strangler
      p.rootLashT = s.rootLash;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 36 + e.r) continue;
        game.fx.push({ kind: 'whip', x1: p.x, y1: p.y + 2, x2: e.x, y2: e.y, t: 0.12 });
        damageEnemy(e, Math.max(2, s.thorns) * 0.8, e.x - p.x, e.y - p.y, true);
      }
    }
  }
  // Grove / Overgrowth: polyps sprout around you while you stand still.
  if (s.grove && (p.rooted || (s.groveAnywhere && p.stillT > 1)) && game.room.locked && (p.groveT = (p.groveT ?? 1) - dt) <= 0) {
    p.groveT = s.grove;
    const a = rand(0, Math.PI * 2);
    sproutPolyp(p, p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 12);
  }
  // Seedfall: seeds drop as you walk.
  if (s.seedfall && p.moving && game.room.locked && (p.seedT = (p.seedT ?? s.seedfall) - dt) <= 0) {
    p.seedT = s.seedfall;
    sproutPolyp(p, p.x, p.y + 2);
  }
}

// Root Legs: knotted roots for legs; when you stand still they dig into the floor.
function drawRootLegs(ctx, p, x, y) {
  const dark = '#140c06', bark = '#5a4024', moving = p.moving && !p.rooted;
  for (let k = 0; k < 5; k++) {
    const hx = x - 4 + k * 2, hy = y + 4;
    let fx, fy;
    if (p.rooted) { fx = x - 10 + k * 5; fy = p.y + 7 + (k % 2); }
    else { fx = x - 5 + k * 2.5 + (moving ? Math.sin(p.t * 12 + k * 1.7) * 2 : 0); fy = p.y + 5; }
    pxLine(ctx, hx, hy + 1, fx, fy + 1, dark, 1, 0.5);
    pxLine(ctx, hx, hy, fx, fy, bark, 1, 0.5);
    if (p.rooted) { // tendrils into the floor
      ctx.fillStyle = dark;
      ctx.fillRect(Math.round(fx + (k % 2 ? 1 : -1)), Math.round(fy + 1), 1, 2);
    }
  }
}

// --- Branch upkeep: things that tick along while you play --------------------------------
function updateBranchUpkeep(p, dt) {
  const s = p.stats;
  if (p.moltT > 0) p.moltT -= dt;
  // Carrion Fly / Plague Swarm: flies around you bite anything close.
  if (s.flySwarm && p.flying) {
    const r = s.flySwarm > 1 ? 36 : 26;
    if (Math.random() < 0.5 * s.flySwarm) game.particles.push({ x: p.x + rand(-r, r) * 0.6, y: p.y - 4 + rand(-r, r) * 0.4, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.2, color: '#1a1418', size: 1 });
    p.swarmT = (p.swarmT || 0) - dt;
    if (p.swarmT <= 0) {
      p.swarmT = 0.4;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > r + e.r) continue;
        damageEnemy(e, 0.6 * s.damage, 0, 0, true);
        if (s.flySwarm > 1 && !e.dead) { e.bleedT = 2; e.bleedDps = Math.max(e.bleedDps || 0, 1); }
      }
    }
  }
  // Crop Duster: flying drops a trail of spore clouds.
  if (s.cropDuster && p.flying && p.moving) {
    p.dustT = (p.dustT || 0) - dt;
    if (p.dustT <= 0) { p.dustT = 0.5; game.clouds.push({ x: p.x, y: p.y, r: 14, life: 2.2, fire: !!s.fireTrail }); }
  }
  // Quill Pulse: the shard ring fires on its own.
  if (s.autoRing && s.ring > 0 && game.room.locked) {
    p.ringT -= dt;
    if (p.ringT <= 0) { p.ringT = s.autoRing; fireRing(p, s.ring); }
  }
  // Glare: a flash that blinds everything close.
  if (s.glare && game.room.locked) {
    p.glareT -= dt;
    if (p.glareT <= 0) {
      p.glareT = s.glare;
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 48 + e.r) continue;
        e.blindT = Math.max(e.blindT || 0, 1.8); hit = true;
      }
      if (hit) { game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 48, t: 0.2 }); burst(p.x, p.y - 4, '#fff0c0', 10, 90, 0.25); Sfx.play('flicker'); }
    }
  }
  // Anglerfish: the lure bites whatever reaches it.
  if (s.lureBite && s.lure) {
    const lp = lurePoint(p);
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || e.lureT > 0 || Math.hypot(e.x - lp.x, e.y - lp.y) > e.r + 7) continue;
      e.lureT = 0.6;
      damageEnemy(e, s.lureBite * s.damage, e.x - lp.x, e.y - lp.y, true);
      game.fx.push({ kind: 'bite', x: lp.x, y: lp.y, t: 0.12 });
      Sfx.play('bite');
    }
    for (const e of game.enemies) if (e.lureT > 0) e.lureT -= dt;
  }
  if (s.nightLure && s.lure) { // Nightmare Lure
    const lp = lurePoint(p);
    for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - lp.x, e.y - lp.y) < 20 + e.r && !(e.blindT > 0)) { e.blindT = 1.5; floatText(e.x, e.y - 10, '?', '#7a5aa0'); }
  }
  updateMiasma(p, dt);
  updatePlant(p, dt);
  // Mycelial Web: threads between polyps eat what crosses them.
  if (s.polypLink) {
    const ps = game.allies.filter(a => a.kind === 'polyp' && !a.dead);
    for (let i = 0; i < ps.length - 1; i++) for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && distToSegment(e.x, e.y, ps[i].x, ps[i].y, ps[i + 1].x, ps[i + 1].y) < e.r + 2) damageEnemy(e, 2 * s.damage * dt, 0, 0, true);
    }
  }
  updateSegments(p, dt);
}

// --- Per-frame upkeep for all of the above ----------------------------------------------
function updateExtras(dt) {
  for (const s of game.room.slime) s.t -= dt;
  if (game.room.slime.length && game.room.slime[0].t <= 0) game.room.slime = game.room.slime.filter(s => s.t > 0);
  updateAllies(dt);
  updateClouds(dt);
  updateDecoy(dt);
  updateInfested(dt);
  updateWebs(dt);
  updateHeld(game.player);
}

// ---------------------------------------------------------------------------
// ACTIVE ABILITIES. Your LIMBS give you a right-click (or E) ability, and your
// HEAD a Q ability. The root decides which; growing the part makes it
// stronger (l = how far the path has grown). Tentacles and Grasping Hands
// keep their own right-click (grapple / grab).
// ---------------------------------------------------------------------------
const ACTIVES = {
  web:         { name: 'WEB SNARE',    key: 'limb', cd: l => 3.6 - 0.3 * l },
  gust:        { name: 'WING GUST',    key: 'limb', cd: l => 4.2 - 0.3 * l },
  tremor:      { name: 'TREMOR',       key: 'limb', cd: l => 5.2 - 0.4 * l },
  slimewave:   { name: 'SLIME WAVE',   key: 'limb', cd: l => 3.6 - 0.3 * l },
  entangle:    { name: 'ENTANGLE',     key: 'limb', cd: l => 5.2 - 0.4 * l },
  mark:        { name: 'MARK PREY',    key: 'head', cd: () => 4.5 },
  headbutt:    { name: 'HEADBUTT',     key: 'head', cd: l => 2.6 - 0.2 * l },
  blackout:    { name: 'BLACKOUT',     key: 'head', cd: l => 10 - l },
  mindspike:   { name: 'MIND SPIKE',   key: 'head', cd: l => 4.6 - 0.3 * l },
  pollenburst: { name: 'POLLEN BURST', key: 'head', cd: l => 6 - 0.5 * l },
};

// Where you're pointing, at most `range` away (mouse, or the arrow-key aim).
function aimPoint(p, range) {
  let tx = p.x + p.aimX * range, ty = p.y + p.aimY * range;
  if (!Input.down('arrowleft', 'arrowright', 'arrowup', 'arrowdown')) {
    const mx = Input.mouse.x, my = Input.mouse.y - ROOM_Y, d = Math.hypot(mx - p.x, my - p.y);
    if (d > 1) { const k = Math.min(1, range / d); tx = p.x + (mx - p.x) * k; ty = p.y + (my - p.y) * k; }
  }
  return { x: tx, y: ty };
}

// The enemy you mean: the one nearest where you're pointing.
function pointedEnemy(p, range) {
  const pt = aimPoint(p, range);
  let best = null, bd = 48;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - pt.x, e.y - pt.y) - e.r;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const isBoss = e => !!ENEMY_TYPES[e.type].boss;

// Right-click / E (key 'limb') or Q (key 'head').
function tryActive(p, key) {
  const s = p.stats, a = key === 'limb' ? s.limbActive : s.headActive;
  if (!a || p.dashT > 0 || p.pullT > 0 || p.withdrawn || p.burrowT > 0) return;
  if (key === 'limb' && p.limbWear > 0) { floatText(p.x, p.y - 18, 'LIMBS TORN', COST_COLOR); return; }
  const cdKey = key === 'limb' ? 'limbCd' : 'headCd';
  if (p[cdKey] > 0) return;
  if (useActive(p, a)) { p[cdKey] = ACTIVES[a.kind].cd(a.l) * (key === 'limb' ? s.limbCdMul : s.headCdMul); p[cdKey + 'Max'] = p[cdKey]; }
}

function useActive(p, a) {
  const s = p.stats, l = a.l, dmg = s.damage;
  const ang = Math.atan2(p.aimY, p.aimX);
  switch (a.kind) {
    case 'web': // Spider Legs: a glob of silk that bursts into a sticky web
      game.actShots.push({ kind: 'web', x: p.x, y: p.y - 2, vx: p.aimX * 200, vy: p.aimY * 200, life: 0.6, r: 3, l });
      Sfx.play('spine');
      return true;
    case 'slimewave': // Pseudopods: a rolling wave of slime you can ride
      game.actShots.push({ kind: 'slime', x: p.x, y: p.y + 2, vx: p.aimX * 150, vy: p.aimY * 150, life: 0.65, r: 7, l, hit: new Set(), dropT: 0 });
      Sfx.play('splat');
      return true;
    case 'gust': { // Wings: one huge beat blows enemies and their shots away
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > 66 + e.r || (dx * p.aimX + dy * p.aimY) / d < 0.45) continue;
        damageEnemy(e, (1 + 0.5 * l) * dmg, dx / d, dy / d, true, isBoss(e) ? 60 : 300 + 40 * l);
      }
      for (const b of game.bullets) {
        if (b.team !== 'enemy') continue;
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < 72 && (dx * p.aimX + dy * p.aimY) / d > 0.35) { b.life = 0; burst(b.x, b.y, '#c8c0d8', 2, 40, 0.2); }
      }
      game.fx.push({ kind: 'howl', x: p.x, y: p.y, a: ang, cone: 0.45, r: 6, max: 66, t: 0.25 });
      for (let i = 0; i < 10; i++) game.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang + rand(-0.6, 0.6)) * rand(120, 220), vy: Math.sin(ang + rand(-0.6, 0.6)) * rand(120, 220), life: 0.25, color: '#8a809a', size: 1 });
      Sfx.play('dash');
      return true;
    }
    case 'tremor': { // Burrowing Claws: claws into the floor; the ground heaves
      const R = 44 + 4 * l;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > R + e.r) continue;
        e.stunT = Math.max(e.stunT || 0, isBoss(e) ? 0.3 : 1 + 0.25 * l);
        damageEnemy(e, (1.5 + l) * dmg, dx / d, dy / d, true, 90);
      }
      game.fx.push({ kind: 'ring', x: p.x, y: p.y + 3, r: 4, max: R, t: 0.3 });
      burst(p.x, p.y + 4, '#3a3230', 14, 90, 0.4);
      game.shake = Math.max(game.shake, 4);
      Sfx.play('slam');
      return true;
    }
    case 'entangle': { // Root Legs: roots burst up where you point and hold everything
      const pt = aimPoint(p, 110), R = 22 + 2 * l;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - pt.x, e.y - pt.y) > R + e.r) continue;
        if (!isBoss(e)) e.webT = Math.max(e.webT || 0, 1.4 + 0.3 * l);
        damageEnemy(e, (2 + l) * dmg, 0, 0, true);
      }
      game.fx.push({ kind: 'act', what: 'roots', x: pt.x, y: pt.y, r: R, t: 1.2, max: 1.2 });
      burst(pt.x, pt.y, '#6a5030', 12, 70, 0.4);
      Sfx.play('whip');
      return true;
    }
    case 'mark': { // Extra Eyes: mark one victim; everything hits it harder
      const e = pointedEnemy(p, 170);
      if (!e) return false;
      e.markUntil = game.time + 6; e.markMul = 0.4 + 0.15 * l;
      floatText(e.x, e.y - 12, 'MARKED', PAL.red);
      Sfx.play('flicker');
      return true;
    }
    case 'headbutt': { // Battering Skull: a short, brutal butt
      moveEntity(game.room, p, p.aimX * 10, p.aimY * 10);
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > 18 + e.r || (dx * p.aimX + dy * p.aimY) / d < 0.2) continue;
        e.stunT = Math.max(e.stunT || 0, isBoss(e) ? 0.2 : 0.6 + 0.2 * l);
        damageEnemy(e, (3 + 2 * l) * dmg + s.dashDmg * 0.5, p.aimX, p.aimY, false, isBoss(e) ? 60 : 280);
        hit = true;
      }
      if (hit) { hitstop(0.05); game.shake = Math.max(game.shake, 3); }
      if (s.boneCannon) { // Bone Cannon: a huge lance out of your skull
        spawnBullet({ x: p.x + p.aimX * 8, y: p.y - 2 + p.aimY * 8, vx: p.aimX * 260, vy: p.aimY * 260, r: 3.5, dmg: 6 * dmg, life: 0.9, pierce: 6, kind: 'shot', color: PAL.white });
        game.shake = Math.max(game.shake, 4); Sfx.play('blast');
        moveEntity(game.room, p, -p.aimX * 6, -p.aimY * 6); burst(p.x + p.aimX * 10, p.y - 2 + p.aimY * 10, '#e8e0c8', 6, 60, 0.3); // recoil
      }
      Sfx.play('ram');
      return true;
    }
    case 'blackout': { // Night Eyes: snuff your own light; it's all dark out there now
      p.blackoutT = 3 + 0.5 * l;
      for (const e of game.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 90) e.blindT = Math.max(e.blindT || 0, 1.5 + 0.25 * l);
      floatText(p.x, p.y - 18, 'BLACKOUT', '#6a6aa0');
      Sfx.play('flicker');
      return true;
    }
    case 'mindspike': { // Parasite Brain: it lashes out with your mind
      const e = pointedEnemy(p, 170);
      if (!e) return false;
      e.stunT = Math.max(e.stunT || 0, isBoss(e) ? 0.4 : 1.2 + 0.2 * l);
      damageEnemy(e, (4 + 2 * l) * dmg, 0, 0, false);
      game.fx.push({ kind: 'beam', x1: p.x, y1: p.y - 6, x2: e.x, y2: e.y, t: 0.15 });
      burst(e.x, e.y, '#b464c8', 8, 60, 0.3);
      Sfx.play('scream');
      return true;
    }
    case 'pollenburst': { // Bloom: the flower bursts, dusting everything around you
      const R = 66 + 6 * l;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > R + e.r) continue;
        pollinate(e, s);
        if (s.toxicBloom) game.clouds.push({ x: e.x, y: e.y, r: 14, life: 3, toxic: true }); // Toxic Bloom
        if (!isBoss(e)) knock(e, dx / d, dy / d, 120);
      }
      game.fx.push({ kind: 'act', what: 'pollen', x: p.x, y: p.y - 6, r: 4, max: R, t: 0.45, life: 0.45 });
      burst(p.x, p.y - 6, '#e8c860', 18, 110, 0.6);
      Sfx.play('splat');
      return true;
    }
  }
  return false;
}

function updateActives(p, dt) {
  p.limbCd -= dt; p.headCd -= dt;
  updateNursery(p, dt);
  updateDefense(p, dt);
  updateApex(p, dt);
  if (p.blackoutT > 0) p.blackoutT -= dt;
  for (const b of game.actShots) {
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const wall = circleHitsWall(game.room, b.x, b.y, 1, true);
    if (b.kind === 'web') {
      const e = game.enemies.find(o => !o.dead && o.spawnT <= 0 && Math.hypot(o.x - b.x, o.y - b.y) < o.r + b.r);
      if (e || wall || b.life <= 0) { webBurst(b); b.dead = true; }
    } else if (b.kind === 'slime') {
      if ((b.dropT -= dt) <= 0) { b.dropT = 0.02; addSlime(b.x + rand(-3, 3), b.y + rand(-3, 3)); stainPx(b.x + rand(-4, 4), b.y + rand(-2, 2), ['#2a2e28', '#323630', '#3c4238'], 2); }
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || b.hit.has(e) || Math.hypot(e.x - b.x, e.y - b.y) > e.r + b.r) continue;
        b.hit.add(e);
        e.slowT = Math.max(e.slowT || 0, 2 + 0.5 * b.l);
        damageEnemy(e, (0.6 + 0.3 * b.l) * p.stats.damage, b.vx, b.vy, true, isBoss(e) ? 0 : 160);
      }
      if (wall || b.life <= 0) b.dead = true;
    }
  }
  game.actShots = game.actShots.filter(b => !b.dead);
}

function webBurst(b) {
  const R = 18 + 3 * b.l;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || Math.hypot(e.x - b.x, e.y - b.y) > R + e.r) continue;
    if (!isBoss(e)) e.webT = Math.max(e.webT || 0, 1.6 + 0.35 * b.l);
    damageEnemy(e, (0.8 + 0.3 * b.l) * game.player.stats.damage, 0, 0, true);
  }
  game.fx.push({ kind: 'act', what: 'web', x: b.x, y: b.y, r: R, t: 0.6, max: 0.6 });
  Sfx.play('splat');
}

function drawActShots(ctx) {
  for (const b of game.actShots) {
    if (b.kind === 'web') { pxCircle(ctx, b.x, b.y, 2.5, '#3a3436'); pxCircle(ctx, b.x, b.y, 1.8, '#e0d8d0'); }
    else { pxCircle(ctx, b.x, b.y, 5 + Math.sin(game.time * 30) * 1, '#2a3a2a'); pxCircle(ctx, b.x, b.y, 3.5, '#9aae8a'); }
  }
}

// Effects for the actives (drawn by drawFx).
function drawActFx(ctx, f) {
  const k = f.t / (f.max || f.life || 1);
  if (f.what === 'web') {
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.fillStyle = '#e0d8d0';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (let rr = 3; rr < f.r; rr += 2) ctx.fillRect(Math.round(f.x + Math.cos(a) * rr), Math.round(f.y + Math.sin(a) * rr * 0.8), 1, 1); }
    pxRing(ctx, f.x, f.y, f.r * 0.5, '#9a9294'); pxRing(ctx, f.x, f.y, f.r * 0.9, '#9a9294');
    ctx.globalAlpha = 1;
  } else if (f.what === 'roots') {
    ctx.fillStyle = '#4a3420';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, rr = f.r * (0.3 + (i % 3) * 0.3), up = Math.round(6 * Math.min(1, (f.max - f.t) * 8) * (k > 0.15 ? 1 : k / 0.15));
      const x = Math.round(f.x + Math.cos(a) * rr), y = Math.round(f.y + Math.sin(a) * rr * 0.7);
      ctx.fillRect(x, y - up, 2, up);
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(x, y - up, 1, 1); ctx.fillStyle = '#4a3420';
    }
  } else if (f.what === 'stitch') {
    drawStitchFx(ctx, f);
  } else if (f.what === 'pollen') {
    const rr = f.max * (1 - k);
    ctx.fillStyle = '#e8c860';
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12 + rr * 0.05; ctx.fillRect(Math.round(f.x + Math.cos(a) * rr), Math.round(f.y + Math.sin(a) * rr), 1, 1); }
  }
}

// --- Big splices -------------------------------------------------------------------------
// Dive Bomb: the dash lands in a swooping bite.
function diveBomb(p) {
  const s = p.stats;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 22 + e.r) continue;
    damageEnemy(e, s.biteDmg * 1.5 + 3 * s.damage, e.x - p.x, e.y - p.y, false, 200);
    if (!e.dead) e.stunT = Math.max(e.stunT || 0, isBoss(e) ? 0.2 : 0.7);
    game.fx.push({ kind: 'bite', x: e.x, y: e.y, t: 0.12 });
  }
  for (const c of corpsesNear(p.x, p.y, 22)) damageCorpse(c, s.biteDmg * 1.5);
  game.fx.push({ kind: 'ring', x: p.x, y: p.y + 3, r: 4, max: 24, t: 0.2 });
  game.shake = Math.max(game.shake, 3);
  Sfx.play('bite');
}

// Silk Nursery: spiderlings keep hatching on whatever is stuck in your webs.
function updateNursery(p, dt) {
  const every = p.stats.silkNursery;
  if (!every) return;
  const kids = game.allies.filter(a => a.kind === 'spiderling' && !a.dead).length;
  for (const e of game.enemies) {
    if (e.dead || !(e.webT > 0)) continue;
    if ((e.nurseryT = (e.nurseryT ?? every * 0.5) - dt) > 0) continue;
    e.nurseryT = every;
    if (kids < 10) { spawnAlly('spiderling', e.x + rand(-4, 4), e.y + rand(-3, 3)); Sfx.play('hatch'); }
  }
}

// --- Bone Plates & Mirror Cyst: defense you can see ----------------------------------------
function platePos(p, i, n) {
  const s = p.stats, a = p.t * (s.plateWide ? 3 : 2.2) + i * Math.PI * 2 / n, r = s.plateWide ? 17 : 13;
  return { x: p.x + Math.cos(a) * r, y: p.y - 2 + Math.sin(a) * r * 0.8 };
}

function updateDefense(p, dt) {
  const s = p.stats;
  if (p.mirrorT > 0) p.mirrorT -= dt;
  if (!s.plates) { p.plates = 0; return; }
  p.plates = Math.min(p.plates, s.plates);
  if (s.plateRegrow && p.plates < s.plates && (p.plateT -= dt) <= 0) { p.plateT = s.plateRegrow; p.plates++; Sfx.play('clack'); } // Ossuary
  if (s.plateDmg) for (let i = 0; i < p.plates; i++) { // Razor Plates
    const q = platePos(p, i, p.plates);
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || (e.plateHitT || 0) > game.time || Math.hypot(e.x - q.x, e.y - q.y) > e.r + 3) continue;
      e.plateHitT = game.time + 0.25;
      damageEnemy(e, s.plateDmg * s.damage, e.x - p.x, e.y - p.y, true, 60);
      if (e.dead && s.plateMill) ringFrom(e.x, e.y, s.plateMill); // Bone Mill
    }
  }
}

function breakPlate(p, x, y) {
  const s = p.stats;
  p.plates--; p.plateT = s.plateRegrow || 0;
  ringFrom(x, y, s.plateShards || 4);
  burst(x, y, '#e8e0c8', 6, 70, 0.3);
  Sfx.play('clank');
  if (s.plateHeal && ++p.platesBroken % s.plateHeal === 0 && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } // Shrapnel Heart
}

// An enemy shot meets a plate: the plate breaks, the shot is stopped.
function plateBlocks(b) {
  const p = game.player;
  if (!(p.plates > 0) || p.burrowT > 0) return false;
  for (let i = 0; i < p.plates; i++) {
    const q = platePos(p, i, p.plates);
    if (Math.hypot(b.x - q.x, b.y - q.y) < (b.r || 2) + 3) { breakPlate(p, q.x, q.y); return true; }
  }
  return false;
}

// An enemy shot meets the Mirror Cyst: thrown back the way it came, harder.
function mirrorReflects(b) {
  const p = game.player, s = p.stats, m = s.mirror;
  if (!m || p.mirrorT > 0 || p.burrowT > 0) return false;
  const dx = b.x - p.x, dy = b.y - p.y + 2, d = Math.hypot(dx, dy) || 1;
  if (d > 15 || d < 3) return false;
  if (m.arc > -1 && (dx * p.aimX + dy * p.aimY) / d < m.arc) return false;
  p.mirrorT = m.cd;
  const sp = (Math.hypot(b.vx, b.vy) || 120) * 1.3, a = Math.atan2(-b.vy, -b.vx);
  const shoot = ang => spawnBullet({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 2, dmg: (b.dmg || 1) * m.mul * s.damage, life: 1.2, kind: 'shot', round: true, color: '#c8e8ff', homing: m.homing || 0, mirrorStun: m.stun || 0 });
  shoot(a);
  if (m.split) { shoot(a - 0.25); shoot(a + 0.25); } // Prism
  if (m.ring) fireRing(p, m.ring);                    // Echo Shell
  if (m.heal && ++p.mirrorHits % m.heal === 0 && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } // Feeding Glass
  burst(b.x, b.y, '#c8e8ff', 6, 70, 0.25);
  Sfx.play('shield');
  return true;
}

// --- The final form's passives: one per set among your parts -----------------------------
// n = how many of your parts share the set (more parts: faster, stronger).
function updateApex(p, dt) {
  const ap = p.stats.apex;
  if (!ap || !game.room.locked || p.evolveT > 0) return;
  p.apexT = p.apexT || {};
  const every = (k, base) => { const n = ap[k]; if (!n) return false; if ((p.apexT[k] = (p.apexT[k] ?? base / n) - dt) > 0) return false; p.apexT[k] = base / n; return true; };
  const s = p.stats;
  if (every('HIVE', 6) && game.allies.filter(a => a.kind === 'spiderling' && !a.dead).length < 4 + 2 * ap.HIVE) { // a swarm hatches around you
    for (let i = 0; i < 1 + (ap.HIVE >= 3 ? 1 : 0); i++) spawnAlly('spiderling', p.x + rand(-8, 8), p.y + rand(-6, 6));
    Sfx.play('hatch');
  }
  if (every('BONE', 5)) fireRing(p, 4 + 2 * ap.BONE);                               // shards burst from you
  if (every('FUNGAL', 2.4) && p.moving) game.clouds.push({ x: p.x, y: p.y, r: 10 + 2 * ap.FUNGAL, life: 3, toxic: true }); // toxic spores
  if (every('PLANT', 9) && game.allies.filter(a => a.kind === 'polyp' && !a.dead).length < 1 + ap.PLANT) { // polyps sprout
    const a = rand(0, Math.PI * 2), x = p.x + Math.cos(a) * 18, y = p.y + Math.sin(a) * 14;
    if (!pointSolid(game.room, x, y)) { const q = spawnAlly('polyp', x, y); q.shootT = 0.5; burst(x, y, '#7ab84a', 6, 40); }
  }
  if (every('ABOMINATION', 3)) { // tendrils lash out on their own
    const e = nearestEnemy(p.x, p.y, 60);
    if (e && !e.dead) { game.fx.push({ kind: 'whip', x1: p.x, y1: p.y - 2, x2: e.x, y2: e.y, t: 0.15 }); damageEnemy(e, (2 + ap.ABOMINATION) * s.damage, e.x - p.x, e.y - p.y, true); Sfx.play('whip'); }
  }
}

// Predator: kills feed you and speed you up.
function apexKill(p) {
  const n = p.stats.apex && p.stats.apex.PREDATOR;
  if (!n) return;
  p.adrenalT = Math.max(p.adrenalT || 0, 0.6 + 0.4 * n);
  if (++p.apexKills % Math.max(4, 12 - 2 * n) === 0 && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
}

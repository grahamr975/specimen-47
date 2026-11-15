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
  if (e.blindT > 0) { // blinded by spores: wander toward a random point
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
  a.life = kind === 'spiderling' ? 8 : kind === 'maggot' ? 18 : Infinity;
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
    if (a.life <= 0) { a.dead = true; burst(a.x, a.y, '#5a3a28', 4, 30); continue; }
    let tx, ty, speed;
    if (a.kind === 'twin') {
      // Hover just behind you, mirroring your aim.
      tx = p.x - p.aimX * 12 + p.aimY * 8; ty = p.y - p.aimY * 12 - p.aimX * 8; speed = 120;
    } else {
      const e = nearestEnemy(a.x, a.y, 200);
      if (e) {
        tx = e.x; ty = e.y; speed = a.kind === 'spiderling' ? 95 : 42;
        if (Math.hypot(e.x - a.x, e.y - a.y) < e.r + a.r + 1 && a.biteT <= 0) {
          a.biteT = 0.5;
          damageEnemy(e, a.kind === 'maggot' ? 1 : 0.8, e.x - a.x, e.y - a.y, true);
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
  for (const c of game.clouds) {
    c.life -= dt;
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - c.x, e.y - c.y) < c.r) {
        if (!(e.blindT > 0)) floatText(e.x, e.y - 10, '?', '#9aae50');
        e.blindT = Math.max(e.blindT || 0, 2);
      }
    }
  }
  game.clouds = game.clouds.filter(c => c.life > 0);
}

function drawClouds(ctx) {
  for (const c of game.clouds) {
    const fade = Math.min(1, c.life / 0.8);
    ctx.globalAlpha = 0.5 * fade;
    for (let i = 0; i < 26; i++) {
      const a = hash2(i, 1, 9) * Math.PI * 2 + c.life * 0.4, d = Math.sqrt(hash2(i, 2, 9)) * c.r;
      pxCircle(ctx, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2 + hash2(i, 3, 9) * 2, i % 3 ? '#5a6a3a' : '#7a8a52');
    }
    ctx.globalAlpha = 1;
  }
}

// --- Decoy husk (Exoskeleton Molt) ----------------------------------------------------
function updateDecoy(dt) {
  if (game.decoy && (game.decoy.t -= dt) <= 0) {
    burst(game.decoy.x, game.decoy.y, '#8a7a5a', 10, 60);
    game.decoy = null;
  }
}

function drawDecoy(ctx) {
  const d = game.decoy;
  if (!d) return;
  if (!SPR.husks) SPR.husks = SPR.stages.map(st => darkened(st.body));
  drawCentered(ctx, SPR.husks[d.stage], d.x, d.y - 4);
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
    if (Math.hypot(s.x - b.x, s.y - b.y) < 5) { burst(b.x, b.y, '#8e7254', 4, 40); Sfx.play('clank'); return true; }
  }
  return false;
}

function drawCentipede(ctx, p) {
  const segs = centipedeSegments(p);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
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
    e.thrown = { vx: p.aimX * sp, vy: p.aimY * sp, t: 0.6, dmg: s.handDmg, hit: new Set([e]) };
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
  burstCorpse(c);
}

// Thrown enemies fly, hurting whatever they hit (and themselves on impact).
function updateThrownEnemy(e, dt) {
  const t = e.thrown;
  t.t -= dt;
  const bumped = moveEntity(game.room, e, t.vx * dt, t.vy * dt);
  for (const o of game.enemies) {
    if (o.dead || t.hit.has(o) || Math.hypot(o.x - e.x, o.y - e.y) > o.r + e.r) continue;
    t.hit.add(o);
    damageEnemy(o, t.dmg, t.vx, t.vy, true);
    bloodSpray(o.x, o.y, t.vx, t.vy, 8, ENEMY_TYPES[o.type].fluid, 100);
    Sfx.play('ram');
  }
  if (bumped || t.t <= 0) {
    e.thrown = null;
    damageEnemy(e, t.dmg * (bumped ? 1 : 0.5), t.vx, t.vy, true);
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
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 24 + e.r) damageEnemy(e, s.burrowDmg, (e.x - p.x) || 1, e.y - p.y, true);
    }
    for (const c of corpsesNear(p.x, p.y, 24)) damageCorpse(c, s.burrowDmg);
    burst(p.x, p.y, '#4e4642', 18, 120, 0.5);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('slam');
  }
}

// --- Parasite Brain: sometimes it drives --------------------------------------------------
function updateParasite(p, dt) {
  if (!p.stats.parasite || p.stats.symbiote) { p.controlT = 0; return; }
  if (p.controlT > 0) { p.controlT -= dt; return; }
  p.parasiteT = (p.parasiteT === undefined ? rand(10, 18) : p.parasiteT) - dt;
  if (p.parasiteT <= 0) {
    p.parasiteT = rand(10, 18);
    p.controlT = 1.2;
    const a = rand(0, Math.PI * 2);
    p.controlX = Math.cos(a); p.controlY = Math.sin(a);
    floatText(p.x, p.y - 22, 'IT TAKES CONTROL', MALIGNANT_COLOR);
    Sfx.play('flicker');
  }
}

// --- Echo Skull: a scream that stuns ------------------------------------------------------
function scream(p) {
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 50, t: 0.3 });
  for (const e of game.enemies) {
    if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 50 + e.r) e.stunT = p.stats.echo;
  }
  Sfx.play('scream');
}

// --- Per-frame upkeep for all of the above ----------------------------------------------
function updateExtras(dt) {
  for (const s of game.room.slime) s.t -= dt;
  if (game.room.slime.length && game.room.slime[0].t <= 0) game.room.slime = game.room.slime.filter(s => s.t > 0);
  updateAllies(dt);
  updateClouds(dt);
  updateDecoy(dt);
  updateHeld(game.player);
}

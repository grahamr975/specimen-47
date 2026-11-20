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
  if (hasStatus(e, 'blind') || (p.stats.gasInvis && p.venting)) { // blinded (or you vanished in your gas): wander
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
// --- The brood: spiderlings and maggots ---------------------------------------------------
// Hatched allies share a cap (BROOD_CAP, raised by the Hive set bonus); when a
// new one hatches over it, the oldest withers away. Each kind fights its own way:
//   SPIDERLING: twitchy hit-and-run. It darts in bursts with pauses between,
//     pounces on prey, bites and webs it for a moment, then springs back out.
//     Fragile (1 HP), short-lived, but untouchable mid-pounce.
//   MAGGOT: slow and relentless. It inches along, latches onto prey and stays
//     on, chewing it bloody, until the prey dies or shakes it off. Tough (3 HP),
//     long-lived, and safe from the thing it's latched onto.
// Enemies that touch a spiderling or maggot hurt it.
const BROOD_KINDS = new Set(['spiderling', 'maggot']);
const BROOD = {
  spiderling: { hp: 1, life: 8 },
  maggot:     { hp: 3, life: 18 },
  flesh:      { hp: 3, life: 14 }, // Splitter / Runaway Cells: torn-off pieces of you (they fight like maggots)
};
const BROOD_CAP = 2;
const broodCap = (p = game.player) => BROOD_CAP + ((p && p.stats.broodCap) || 0);
const FLESH_CAP = 2; // pieces of you have their own cap (Abomination), apart from Hive's brood

function spawnAlly(kind, x, y) {
  const a = { kind, x, y, r: kind === 'twin' ? 4 : 3, t: Math.random() * 3, biteT: 0, hp: kind === 'twin' ? 2 : 1, inv: 0, flying: false, born: game.time };
  a.life = (BROOD[kind] ? BROOD[kind].life : Infinity) * ((game.player && game.player.stats.allyLife) || 1);
  if (BROOD[kind]) { a.hp = BROOD[kind].hp + ((game.player && game.player.stats.broodHp) || 0); a.inv = 0.7; } // freshly hatched: a moment before anything can hurt it (Royal Jelly: tougher)
  if (kind === 'spiderling' && game.player && game.player.stats.flyingBrood) a.flying = true; // Winged Brood
  if (kind === 'polyp') { const pp = game.player.stats.polyp; a.r = 4; a.life = pp ? pp.life : 10; }
  if (kind === 'flesh') { // over its own cap: the oldest piece of you rots away
    const fl = game.allies.filter(o => o.kind === 'flesh' && !o.dead).sort((m, n) => m.born - n.born);
    for (let i = 0; i <= fl.length - FLESH_CAP; i++) killAlly(fl[i], true);
  }
  if (BROOD_KINDS.has(kind)) { // over the cap: the oldest of the brood withers
    const brood = game.allies.filter(o => BROOD_KINDS.has(o.kind) && !o.dead).sort((m, n) => m.born - n.born);
    for (let i = 0; i <= brood.length - broodCap(); i++) killAlly(brood[i], true);
  }
  game.allies.push(a);
  return a;
}

function killAlly(a, withered = false) {
  if (a.dead) return;
  const p = game.player;
  a.dead = true; burst(a.x, a.y, withered ? '#4a3a30' : '#5a3a28', withered ? 3 : 5, 30);
  if (a.kind === 'maggot' && p.stats.maggotBurst) { spawnPuddle(a.x, a.y, 14, 3, 'player'); Sfx.play('splat'); } // Rupturing Maggots
  if (a.kind === 'polyp' && p.stats.polypBurst) polypPop(a);
}

function ensureTwin() {
  const p = game.player;
  if (p.stats.twin && !p.twinDead && !game.allies.some(a => a.kind === 'twin')) spawnAlly('twin', p.x - 10, p.y);
}

const allyDmg = () => game.player.stats.allyDmg || 1;
function allyBite(a, e, dmg) {
  damageEnemy(e, dmg * allyDmg() * (game.player.broodFedT > 0 ? 1.6 : 1), e.x - a.x, e.y - a.y, true); // (Blood Queen: fed on your blood)
  if (a.kind === 'spiderling' && game.player.stats.venomBrood) spawnPuddle(e.x, e.y, 7, 1.5, 'player'); // Venom Brood
  if (game.player.stats.broodSlow && !e.dead) inflict(e, 'slow', { t: 1.2 }); // Pheromone Glands
  bloodSpray(e.x, e.y, e.x - a.x, e.y - a.y, 3, ENEMY_TYPES[e.type].fluid, 60);
}

// The prey the brood goes for: whatever Brood Crest called them onto, else the nearest.
function broodPrey(a, p) { const t = p.broodTarget; return p.broodRushT > 0 && t && !t.dead ? t : nearestEnemy(a.x, a.y, 200); }
const broodHaste = p => (p.stats.broodHaste || 1) * (p.broodRushT > 0 ? 0.5 : 1); // Swarm Heart, a swarm call

function updateSpiderling(a, dt, p) {
  const e = broodPrey(a, p), fly = a.flying ? 1.4 : 1;
  if (a.leapT > 0) { // mid-pounce: untouchable
    a.leapT -= dt;
    moveEntity(game.room, a, a.vx * dt, a.vy * dt);
    const t = a.prey;
    if (t && !t.dead && Math.hypot(t.x - a.x, t.y - a.y) < t.r + a.r + 1) {
      allyBite(a, t, 0.9);
      if (!t.dead) inflict(t, 'web', { t: 0.6 }); // pinned for a moment
      a.leapT = 0; a.backT = 0.3; a.biteT = 1.1 * broodHaste(p); a.inv = Math.max(a.inv, 0.3); // spring back out (untouchable as it goes)
      const d = Math.hypot(a.x - t.x, a.y - t.y) || 1; a.vx = (a.x - t.x) / d * 120; a.vy = (a.y - t.y) / d * 120;
    }
    return;
  }
  if (a.backT > 0) { a.backT -= dt; moveEntity(game.room, a, a.vx * dt, a.vy * dt); return; }
  if (e && a.biteT <= 0 && Math.hypot(e.x - a.x, e.y - a.y) < e.r + 24) { // pounce
    const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
    a.prey = e; a.leapT = 0.16; a.inv = 0.25; a.vx = (e.x - a.x) / d * 230 * fly; a.vy = (e.y - a.y) / d * 230 * fly;
    return;
  }
  // Dart, pause, dart: short bursts toward prey (or around you), a little off-line.
  if ((a.dartT = (a.dartT || 0) - dt) <= -rand(0.15, 0.35)) {
    const tx = e ? e.x : p.x + Math.cos(a.t) * 14, ty = e ? e.y : p.y + Math.sin(a.t) * 10;
    const d = Math.hypot(tx - a.x, ty - a.y) || 1, side = rand(-0.6, 0.6);
    a.dx = (tx - a.x) / d - (ty - a.y) / d * side; a.dy = (ty - a.y) / d + (tx - a.x) / d * side;
    a.dartT = e ? 0.12 : 0.08;
  }
  if (a.dartT > 0) moveEntity(game.room, a, a.dx * 150 * fly * dt, a.dy * 150 * fly * dt);
}

function updateMaggot(a, dt, p) {
  const host = a.latch;
  if (host && !host.dead) { // latched on: ride it, chewing
    a.x = host.x + a.ox; a.y = host.y + a.oy;
    if (a.biteT <= 0) { a.biteT = 0.45 * broodHaste(p); allyBite(a, host, 0.5); if (!host.dead) inflict(host, 'bleed', { t: 1.2, dps: 1 * allyDmg() }); }
    if (Math.random() < dt * 0.15) { a.latch = null; a.dazeT = 0.8; const d = Math.hypot(a.ox, a.oy) || 1; moveEntity(game.room, a, a.ox / d * 6, a.oy / d * 6); } // shaken off
    return;
  }
  a.latch = null;
  if (a.dazeT > 0) { a.dazeT -= dt; return; }
  const e = broodPrey(a, p);
  const tx = e ? e.x : p.x + Math.cos(a.t * 0.7) * 12, ty = e ? e.y : p.y + Math.sin(a.t * 0.7) * 8;
  const d = Math.hypot(tx - a.x, ty - a.y);
  if (e && d < e.r + a.r + 1) { a.latch = e; const k = Math.atan2(a.y - e.y, a.x - e.x); a.ox = Math.cos(k) * e.r * 0.8; a.oy = Math.sin(k) * e.r * 0.8; a.biteT = 0; return; }
  // Inching: stretch, then bunch up.
  const inch = Math.max(0, Math.sin(a.t * 6)), speed = 44 * inch * (a.flying ? 1.4 : 1);
  if (d > 2) moveEntity(game.room, a, (tx - a.x) / d * speed * dt, (ty - a.y) / d * speed * dt);
}

function updateAllies(dt) {
  const p = game.player;
  for (const a of game.allies) {
    a.t += dt; a.life -= dt; a.biteT -= dt; a.inv -= dt;
    if (a.life <= 0) { killAlly(a, true); continue; }
    if (a.kind === 'polyp') { updatePolyp(a, dt); continue; } // rooted in place
    if (a.kind === 'spiderling') { updateSpiderling(a, dt, p); continue; }
    if (a.kind === 'maggot' || a.kind === 'flesh') { updateMaggot(a, dt, p); continue; }
    // Your twin hovers just behind you, mirroring your aim. Stuck far behind (a crate in the way)? It squeezes back to you.
    if (Math.hypot(p.x - a.x, p.y - a.y) > 70) { burst(a.x, a.y, '#a8534f', 4, 40); a.x = p.x; a.y = p.y; }
    const tx = p.x - p.aimX * 12 + p.aimY * 8, ty = p.y - p.aimY * 12 - p.aimX * 8;
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d > 2) moveEntity(game.room, a, (dx / d) * 120 * dt, (dy / d) * 120 * dt);
  }
  // Enemies that touch the brood hurt it (not mid-pounce, and never a maggot's own host).
  for (const a of game.allies) {
    if (a.dead || !(BROOD_KINDS.has(a.kind) || a.kind === 'flesh') || a.inv > 0 || a.leapT > 0) continue;
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || e === a.latch || Math.hypot(e.x - a.x, e.y - a.y) >= e.r + a.r) continue;
      a.hp -= 1; a.inv = 0.6; burst(a.x, a.y, '#7a3a2a', 3, 40);
      if (a.hp <= 0) killAlly(a);
      break;
    }
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
// Spore Vents: dash or get hurt, and your back vents a corroding cloud (Rot Vents: harder, burning; Fruiting Vents: it fades into bile).
function ventCloud(p) {
  const s = p.stats;
  game.clouds.push({ x: p.x, y: p.y, r: s.ventCloud, life: 3.2, corrode: true, hard: !!s.ventHard, toxic: !!s.ventHard, pool: !!s.ventPool });
  Sfx.play('splat');
}

function spawnCloud(x, y, r) {
  game.clouds.push({ x, y, r, life: 3.2 });
  Sfx.play('splat');
}

function updateClouds(dt) {
  const s = game.player.stats;
  for (const c of game.clouds) {
    c.life -= dt;
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && e.cloudAt !== game.time && Math.hypot(e.x - c.x, e.y - c.y) < c.r) {
        e.cloudAt = game.time; // overlapping clouds don't stack: one cloud's worth a frame
        if (!hasStatus(e, 'blind')) floatText(e.x, e.y - 10, '?', '#9aae50');
        inflict(e, 'blind', { t: 2 });
        if (s.cloudCorrode || c.corrode) { const o = corrodeOpts(s); if (c.hard) o.mul = Math.max(o.mul, 0.45); inflict(e, 'corrode', o); } // Fungal set, final form, Spore Vents (Rot Vents: harder)
        if (s.cloudDps) damageEnemy(e, s.cloudDps * s.damage * dt, 0, 0, true); // Rot Bloom
        if (c.fire) damageEnemy(e, 3 * s.damage * dt, 0, 0, true);               // Firestorm
        if (c.toxic) damageEnemy(e, 1.5 * s.damage * dt, 0, 0, true);            // Rot Halo, Toxic Wings
      }
    }
  }
  for (const c of game.clouds) if (c.life <= 0 && c.pool && !c.pooled) { c.pooled = true; spawnPuddle(c.x, c.y, c.r * 0.6, 3, 'player'); } // Fruiting Vents
  game.clouds = game.clouds.filter(c => c.life > 0);
  for (const sh of game.shells || []) { sh.t -= dt; if ((sh.next -= dt) <= 0 && sh.t > 0) { sh.next = 0.8; spawnCloud(sh.x + rand(-4, 4), sh.y + rand(-4, 4), 12); } } // Rot Shells
  if (game.shells) game.shells = game.shells.filter(sh => sh.t > 0);
}

// Spore Fire: a bile flame touching a spore cloud sets it off.
function igniteCloudAt(x, y) {
  const c = game.clouds.find(c => Math.hypot(c.x - x, c.y - y) < c.r);
  if (!c) return false;
  c.life = 0;
  const dmg = 3.2 * game.player.stats.damage; // (was 4: Spore Lungs led the simulator by a wide margin)
  game.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 4, max: c.r + 10, t: 0.25 });
  for (const e of enemiesNear(c.x, c.y, c.r + 10)) damageEnemy(e, dmg, e.x - c.x, e.y - c.y, true);
  for (let i = 0; i < 2; i++) spawnPuddle(c.x + rand(-8, 8), c.y + rand(-8, 8), 10, 2.5, 'player'); // (was 3)
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
      for (const e of enemiesNear(d.x, d.y, 30)) damageEnemy(e, 4 * game.player.stats.damage, e.x - d.x, e.y - d.y, true);
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
  if (h.ref.fluid && GORE && Math.hypot(pos.x - h.ref.x, pos.y - h.ref.y) > 0.5) { stainPx(pos.x + rand(-1, 1), pos.y + 3, h.ref.fluid); if (Math.random() < 0.1) markWet(pos.x, pos.y + 3, 2, pick(h.ref.fluid)); } // a carried corpse drags a smear
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
  for (const e of enemiesNear(c.x, c.y, 18)) damageEnemy(e, b.dmg, e.x - c.x, e.y - c.y, true);
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
    if (t.howled && s.howlChain && !o.dead && !o.thrown && !isBoss(o)) o.thrown = { vx: t.vx * 0.8, vy: t.vy * 0.8, t: 0.3, dmg: t.dmg * 0.8, hit: new Set([o, e]), howled: true };
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
      applyHitEffects(e, 'burrow');
    }
    if (s.eruptStun) { // Quake
      game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 56, t: 0.35 });
      for (const e of enemiesNear(p.x, p.y, 56)) inflict(e, 'stun', { t: s.eruptStun });
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
    for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(x - e.x, y - e.y) < e.r + (isBoss(e) ? 22 : 10)) risk += isBoss(e) ? 6 : 3;
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
  if (p.parasiteT <= 0 && p.hp <= HP_PER_HEART) p.parasiteT = 1; // too close to death (your last heart): it waits
  if (p.parasiteT <= 0) {
    p.parasiteT = gap();
    p.controlT = 1.2;
    [p.controlX, p.controlY] = parasiteHeading(p);
    floatText(p.x, p.y - 22, 'IT TAKES CONTROL', MALIGNANT_COLOR);
    for (let i = 0; i < (p.stats.parasiteBrood || 0); i++) spawnAlly('maggot', p.x + rand(-4, 4), p.y + rand(-3, 3)); // Parasitic Brood
    Sfx.play('flicker');
  }
}

// --- Overmind: a scream that stuns ------------------------------------------------------
function scream(p) {
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 50, t: 0.3 });
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    if (d >= 50 + e.r) continue;
    inflict(e, 'stun', { t: p.stats.echo });
  }
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
    damageEnemy(e, s.ovi.dps * dt, 0, 0, true); dotFlash(e, 'infest');
    if (e.dead || !e.infest) continue; // its death already burst it
    applyHitEffects(e, 'ovi'); // Confuse
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
    for (const o of enemiesNear(e.x, e.y, 30, e)) damageEnemy(o, s.oviBurst * s.damage, o.x - e.x, o.y - e.y, true);
    game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 4, max: 30, t: 0.25 });
    game.shake = Math.max(game.shake, 3);
  }
  if (!e.dead) damageEnemy(e, s.ovi.burstDmg + (s.oviBurst ? s.oviBurst * s.damage : 0), 0, 0, true); // tearing its way out
  if (s.oviMaggots) spawnAlly('flesh', e.x, e.y); // Plaguebearer: hosts burst into pieces of you
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
    applyHitEffects(e, 'gas'); // Hide, Choke
    if (s.gasCorrode && !e.dead) inflict(e, 'corrode', corrodeOpts(s)); // Corrode: your gas corrodes too
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
    applyHitEffects(e, 'howl');
    if (isBoss(e)) continue;
    const sp = Math.min(380, h.force * mul / enemyMass(e));
    e.thrown = { vx: dx / d * sp, vy: dy / d * sp, t: 0.35, dmg: h.slam, hit: new Set([e]), howled: true };
  }
  for (const c of corpsesNear(p.x, p.y, range, p.aimX, p.aimY, cone)) damageCorpse(c, 1.5 + h.dmg * 3, c.x - p.x, c.y - p.y);
  // The howl shreds enemy shots out of the air.
  for (const b of game.bullets) {
    if (b.team !== 'enemy' || b.dead) continue;
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > range || (d > 10 && (dx * p.aimX + dy * p.aimY) / d < cone)) continue;
    b.dead = true; burst(b.x, b.y, PAL.red, 2, 30); boneBlock(p);
  }
  // Bone Choir: bone shards ride the howl.
  if (s.howlShards) {
    const base = Math.atan2(p.aimY, p.aimX);
    for (let i = 0; i < s.howlShards; i++) {
      const a = around ? base + (i / s.howlShards) * Math.PI * 2 : base + (i / (s.howlShards - 1) - 0.5) * 0.5;
      spawnBullet({ x: p.x, y: p.y - 2, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 1.5, kind: 'spine', dmg: 0.9 * s.damage * mul, life: range / 210 + 0.1, color: PAL.white });
    }
  }
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
  for (const e of enemiesNear(a.x, a.y, 26)) damageEnemy(e, 4 * s.damage, e.x - a.x, e.y - a.y, true);
  game.fx.push({ kind: 'ring', x: a.x, y: a.y, r: 3, max: 26, t: 0.2 });
  Sfx.play('splat');
}

function updatePolyp(a, dt) {
  const p = game.player, s = p.stats;
  const pp = s.polyp; // Polyp Seeder
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
    if (s.polypGrab && !e.dead) { inflict(e, 'slow', { t: 1 }); knock(e, a.x - e.x, a.y - e.y, 120); }
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
  if (++p.polypKills % p.stats.polypFeed === 0) healPlayer(1);
}

// Frog Tongue: the tongue shoots out (see updateTongue). Small prey sticks to
// it and is reeled in and swallowed whole; fire again to spit it back out.
const TONGUE_OUT = 560, TONGUE_BACK = 380;
// The tongue is a CHARGE attack: hold fire to coil it, release to send it
// (further the longer you held). A quick tap spits back what you've swallowed.
const TONGUE_CHARGE = 0.6, TONGUE_TAP = 0.18;
function updateTongueCharge(p, dt, firing, canAttack) {
  const t = p.stats.tongue;
  if (!t) { p.tongueCharge = 0; return; }
  if (firing && canAttack && !p.tongue) {
    const before = p.tongueCharge || 0;
    p.tongueCharge = Math.min(TONGUE_CHARGE, before + dt);
    if (Math.floor(p.tongueCharge * 10) > Math.floor(before * 10) && p.tongueCharge > TONGUE_TAP && p.tongueCharge < TONGUE_CHARGE) Sfx.play('charge');
    if (p.tongueCharge >= TONGUE_CHARGE && before < TONGUE_CHARGE) Sfx.play('chargeFull');
    return;
  }
  if (firing || !(p.tongueCharge > 0)) return;
  const held = p.tongueCharge; p.tongueCharge = 0;
  if (!canAttack || p.tongue || (p.cd.tongue || 0) > 0) return;
  // A tap spits; so does any release once your gut is full (it can't swallow more, so spitting is the attack).
  if (held < TONGUE_TAP || p.gullet >= t.max) { if (p.gullet > 0) { spitBack(p); p.cd.tongue = 0.25; } return; }
  p.cd.tongue = t.delay * attackRate(p);
  tongueAttack(p, takeAmbush(p), held / TONGUE_CHARGE);
}

function spitBack(p, mul = 1) {
  const s = p.stats, t = s.tongue;
  p.gullet--;
  spawnBullet({ x: p.x + p.aimX * 6, y: p.y + p.aimY * 6, vx: p.aimX * 210, vy: p.aimY * 210, r: 4, dmg: t.spit * mul, life: 0.7, knock: 220, kind: 'shot', round: true, color: '#a8534f', acid: s.spitAcid || 0, split: s.spitSplit || 0, bloodBomb: s.bloodGulp ? 5 * s.damage : 0 });
  bloodSpray(p.x, p.y, p.aimX, p.aimY, 6, FLUID.blood, 90);
  Sfx.play('splat');
}

// Send the tongue out. `reach` 0-1: how far a charge sends it. Without a
// charge (Bone Shotgun-style blasts call it directly) a full gullet spits first.
function tongueAttack(p, mul = 1, reach = null) {
  if (p.tongue) return; // it's already out there
  if (reach === null && p.gullet > 0) { spitBack(p, mul); return; }
  p.tongue = { len: 4, dirX: p.aimX, dirY: p.aimY, out: true, hits: [], carry: null, corpse: null, mul, reach: reach === null ? 1 : clamp(reach, 0, 1) };
  Sfx.play('whip');
}

function tongueTip(p) {
  const T = p.tongue;
  return { x: p.x + T.dirX * T.len, y: p.y - 2 + T.dirY * T.len };
}

const DIGEST_TIME = 6; // seconds for one swallowed meal to digest on its own
function updateTongue(p, dt) {
  const T = p.tongue, s = p.stats, t = s.tongue;
  // What you've swallowed slowly digests, so your gut never stays stuck full.
  if (p.gullet > 0) { if ((p.digestT = (p.digestT || 0) + dt) >= DIGEST_TIME) { p.digestT = 0; p.gullet--; } }
  else p.digestT = 0;
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
        if (!T.carry && T.hits.length === 1 && !isBoss(e) && !e.elite && e.r <= t.size && p.gullet < t.max) {
          T.carry = e; e.held = true; e.kx = e.ky = 0; // stuck to the tongue
          Sfx.play('chomp');
          if (!s.tonguePierce) T.out = false;
        } else {
          damageEnemy(e, t.dmg * T.mul, p.x - e.x, p.y - e.y, true, 160); // yanked toward you
          applyHitEffects(e, 'tongue');
          if (!s.tonguePierce) {
            T.out = false;
            if (s.tongueYank && !e.dead && !T.carry && !isBoss(e)) { reelIn(p, e.x, e.y, e); return; } // too big: it reels YOU in (never into a boss)
          }
        }
        continue;
      }
      if (!T.carry && !T.hits.length && !T.corpse) {
        const c = game.room.corpses.find(c => !c.dead && Math.hypot(c.x - x, c.y - y) < c.r + 2);
        if (c) { T.corpse = c; T.out = false; break; }
      }
      if (T.len >= t.range * (0.45 + 0.55 * (T.reach ?? 1))) T.out = false; // a fuller charge reaches further
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
  const full = p.stats.tongue && p.gullet >= p.stats.tongue.max;
  floatText(p.x, p.y - 16, full ? 'GUT FULL - FIRE TO SPIT' : 'GULP', PAL.red);
  if ((p.stats.bloodGulp || Math.random() < 0.15)) healPlayer(1); // Blood Gulp: always
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
      if (isBoss(e)) continue; // the silk cuts a boss, but can't hold one
      inflict(e, 'web', { t: 0.25 });
      if (w.touched.has(e)) continue;
      w.touched.add(e);
      applyHitEffects(e, 'silk'); // Sticky Web, Acid Silk
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

// --- Bloom: pollen ------------------------------------------------------------------------
function pollinate(e, s) {
  inflict(e, 'pollen', { t: 4 });
  applyHitEffects(e, 'pollen'); // Hay Fever and friends
}

function updatePlant(p, dt) {
  const s = p.stats;
  // Bloom: puffs of pollen.
  if (s.pollen && s.pollen.r && game.room.locked && (p.pollenT = (p.pollenT ?? 1) - dt) <= 0) {
    p.pollenT = s.pollen.every;
    game.fx.push({ kind: 'ring', x: p.x, y: p.y - 6, r: 4, max: s.pollen.r, t: 0.3 });
    burst(p.x, p.y - 8, '#e8d040', 14, 70, 0.7);
    for (const e of enemiesNear(p.x, p.y, s.pollen.r)) pollinate(e, s);
  }
  // How long you've stood still (Snail Shell and friends read it).
  if (!p.moving && p.dashT <= 0 && p.pullT <= 0) p.stillT = (p.stillT || 0) + dt; else p.stillT = 0;
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
        if (s.flySwarm > 1 && !e.dead) { inflict(e, 'bleed', { t: 2, dps: 1 }); }
      }
    }
  }
  // Crop Duster: flying drops a trail of spore clouds.
  if (s.cropDuster && p.flying && p.moving) {
    p.dustT = (p.dustT || 0) - dt;
    if (p.dustT <= 0) { p.dustT = 0.5; game.clouds.push({ x: p.x, y: p.y, r: 14, life: 2.2, fire: !!s.fireTrail }); }
  }
  // Glare: a flash that blinds everything close.
  if (s.glare && game.room.locked) {
    p.glareT -= dt;
    if (p.glareT <= 0) {
      p.glareT = s.glare;
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 48 + e.r) continue;
        inflict(e, 'blind', { t: 1.8 }); hit = true;
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
    for (const e of enemiesNear(lp.x, lp.y, 20)) if (!hasStatus(e, 'blind')) { inflict(e, 'blind', { t: 1.5 }); floatText(e.x, e.y - 10, '?', '#7a5aa0'); }
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
// HEAD one that fires by itself (autoHead). The root decides which; growing the part makes it
// stronger (l = how far the path has grown). Tentacles and Grasping Hands
// keep their own right-click (grapple / grab).
// ---------------------------------------------------------------------------
const ACTIVES = {
  web:         { name: 'WEB SNARE',    key: 'limb', cd: l => 3.6 - 0.3 * l },
  gust:        { name: 'WING GUST',    key: 'limb', cd: l => 4.2 - 0.3 * l },
  tremor:      { name: 'TREMOR',       key: 'limb', cd: l => 5.2 - 0.4 * l },
  slimewave:   { name: 'SLIME WAVE',   key: 'limb', cd: l => 3.6 - 0.3 * l },
  mark:        { name: 'MARK PREY',    key: 'head', cd: () => 4.5 },
  headbutt:    { name: 'HEADBUTT',     key: 'head', cd: l => 2.6 - 0.2 * l },
  blackout:    { name: 'BLACKOUT',     key: 'head', cd: l => 10 - l },
  mindspike:   { name: 'MIND SPIKE',   key: 'head', cd: l => 4.6 - 0.3 * l },
  pollenburst: { name: 'POLLEN BURST', key: 'head', cd: l => 6 - 0.5 * l },
  swarmcall:   { name: 'SWARM CALL',   key: 'head', cd: l => Math.max(2.5, 5.5 - 0.5 * l) },
  pincer:      { name: 'PINCER',       key: 'limb', cd: l => 2.8 - 0.2 * l },
  leap:        { name: 'LEAP',         key: 'limb', cd: l => 3.4 - 0.3 * l },
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


// Right-click / E (key 'limb'), or the head firing by itself (key 'head', see autoHead).
function tryActive(p, key, target) {
  const s = p.stats, a = key === 'limb' ? s.limbActive : s.headActive;
  if (!a || p.dashT > 0 || p.pullT > 0 || p.withdrawn || p.burrowT > 0) return;
  if (key === 'limb' && p.limbWear > 0) { floatText(p.x, p.y - 18, 'LIMBS TORN', COST_COLOR); return; }
  const cdKey = key === 'limb' ? 'limbCd' : 'headCd';
  if (p[cdKey] > 0) return;
  if (useActive(p, a, target)) {
    p[cdKey] = ACTIVES[a.kind].cd(a.l) * (key === 'limb' ? s.limbCdMul : s.headCdMul); p[cdKey + 'Max'] = p[cdKey];
    if (p.pincerRefresh) { p.pincerRefresh = false; p[cdKey] = 0; p.dashCd = 0; floatText(p.x, p.y - 14, 'CRUSHED', '#e8a020'); } // Coconut Crab
  }
}

// HEAD abilities have no button: each one fires by itself once it's ready and
// something worth using it on is close. Returns the target it picked (or true), or null.
function headTarget(p, kind) {
  let best = null, score = -Infinity;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
    let v;
    if (kind === 'mark') v = d < 170 && !hasStatus(e, 'mark') ? e.hp : null;   // the toughest prey in sight
    else if (kind === 'mindspike') v = d < 170 ? -d : null;                       // the nearest
    else if (kind === 'headbutt') v = d < 16 ? -d : null;                         // whatever gets in your face
    else if (kind === 'blackout') v = d < 90 ? 1 : null;                          // anything closing in
    else if (kind === 'pollenburst') v = d < 50 ? 1 : null;                       // anything close
    else if (kind === 'swarmcall') v = d < 180 && (p.stats.crestHatch || game.allies.some(a => BROOD_KINDS.has(a.kind) && !a.dead)) ? ((e.x - p.x) * p.aimX + (e.y - p.y) * p.aimY) / (d + e.r) : null; // the prey nearest your aim (if you have a brood to call)
    if (v != null && v > score) { score = v; best = e; }
  }
  return best;
}
function autoHead(p) {
  const a = p.stats.headActive;
  if (!a || p.headCd > 0 || game.state !== 'play') return;
  const e = headTarget(p, a.kind);
  if (e) tryActive(p, 'head', e);
}

function useActive(p, a, target) {
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
        inflict(e, 'stun', { t: 1 + 0.25 * l });
        damageEnemy(e, (1.5 + l) * dmg, dx / d, dy / d, true, 90);
      }
      game.fx.push({ kind: 'ring', x: p.x, y: p.y + 3, r: 4, max: R, t: 0.3 });
      burst(p.x, p.y + 4, '#3a3230', 14, 90, 0.4);
      game.shake = Math.max(game.shake, 4);
      Sfx.play('slam');
      return true;
    }
    case 'mark': { // Extra Eyes: mark one victim; everything hits it harder
      const e = target || pointedEnemy(p, 170);
      if (!e) return false;
      inflict(e, 'mark', { t: 6 * (p.stats.markTime || 1), mul: 0.4 + 0.15 * l });
      floatText(e.x, e.y - 12, 'MARKED', PAL.red);
      Sfx.play('flicker');
      return true;
    }
    case 'headbutt': { // Battering Skull: a short, brutal butt at whatever got in your face
      let ux = p.aimX, uy = p.aimY;
      if (target) { const tx = target.x - p.x, ty = target.y - p.y, td = Math.hypot(tx, ty) || 1; ux = tx / td; uy = ty / td; }
      moveEntity(game.room, p, ux * 10, uy * 10);
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > 18 + e.r || (dx * ux + dy * uy) / d < 0.2) continue;
        inflict(e, 'stun', { t: 0.6 + 0.2 * l });
        damageEnemy(e, (3 + 2 * l) * dmg + s.dashDmg * 0.5, ux, uy, false, isBoss(e) ? 60 : 280);
        hit = true;
      }
      if (hit) { hitstop(0.05); game.shake = Math.max(game.shake, 3); }
      if (s.skullRing) fireRing(p, s.skullRing);           // Bone Echo: your skull rings
      if (s.boneCannon) { // Bone Cannon: a huge lance out of your skull
        spawnBullet({ x: p.x + ux * 8, y: p.y - 2 + uy * 8, vx: ux * 260, vy: uy * 260, r: 3.5, dmg: 6 * dmg, life: 0.9, pierce: 6, kind: 'shot', color: PAL.white });
        game.shake = Math.max(game.shake, 4); Sfx.play('blast');
        moveEntity(game.room, p, -ux * 6, -uy * 6); burst(p.x + ux * 10, p.y - 2 + uy * 10, '#e8e0c8', 6, 60, 0.3); // recoil
      }
      Sfx.play('ram');
      return true;
    }
    case 'blackout': { // Night Eyes: snuff your own light; it's all dark out there now
      p.blackoutT = 3 + 0.5 * l;
      for (const e of game.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 90) inflict(e, 'blind', { t: 1.5 + 0.25 * l });
      floatText(p.x, p.y - 18, 'BLACKOUT', '#6a6aa0');
      Sfx.play('flicker');
      return true;
    }
    case 'swarmcall': { // Brood Crest: your brood swarms the prey you aim at, biting faster for a while
      const e = target; if (!e) return false;
      p.broodTarget = e; p.broodRushT = 3;
      if (s.crestHatch) spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3)); // Hatching Crest
      floatText(e.x, e.y - 14, 'SWARM', SETS.HIVE.color); Sfx.play('hatch');
      return true;
    }
    case 'mindspike': { // Parasite Brain: it lashes out with your mind
      const e = target || pointedEnemy(p, 170);
      if (!e) return false;
      inflict(e, 'stun', { t: 1.2 + 0.2 * l });
      damageEnemy(e, (4 + 2 * l) * dmg, 0, 0, false);
      game.fx.push({ kind: 'beam', x1: p.x, y1: p.y - 6, x2: e.x, y2: e.y, t: 0.15 });
      burst(e.x, e.y, '#b464c8', 8, 60, 0.3);
      Sfx.play('scream');
      return true;
    }
    case 'pincer': { // Crab Legs: a pincer snaps shut on what's in front of you
      p.pincerAnimT = 0.18;
      const reach = s.pincerWide ? 30 : 22, cone = s.pincerWide ? -0.2 : 0.3;
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > reach + e.r || (dx * p.aimX + dy * p.aimY) / d < cone) continue;
        damageEnemy(e, (4 + 2 * l) * dmg * (s.pincerMul || 1), dx / d, dy / d, false, isBoss(e) ? 40 : 220);
        if (!e.dead) inflict(e, 'stun', { t: s.pincerStun || 0.8 });
        else if (s.pincerReset) p.pincerRefresh = true;
        game.fx.push({ kind: 'bite', x: e.x, y: e.y, t: 0.12 });
        hit = true;
      }
      if (s.shellClaw) for (const b of game.bullets) { // Shell Claw: the snapping claw is a shield too
        if (b.team !== 'enemy' || b.dead) continue;
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > reach + 14 || (dx * p.aimX + dy * p.aimY) / d < -0.1) continue;
        b.dead = true; burst(b.x, b.y, '#d8ccb0', 3, 50); boneBlock(p);
      }
      if (s.pincerShock) spawnBullet({ x: p.x + p.aimX * 8, y: p.y - 2 + p.aimY * 8, vx: p.aimX * 230, vy: p.aimY * 230, r: 3, dmg: 3 * dmg, life: 0.45, pierce: 3, kind: 'shot', color: '#d8ccb0' }); // Pistol Shrimp
      if (hit) { hitstop(0.04); game.shake = Math.max(game.shake, 3); }
      game.fx.push({ kind: 'bite', x: p.x + p.aimX * 14, y: p.y + p.aimY * 14, t: 0.12 });
      Sfx.play('bite'); Sfx.play('ram');
      return true;
    }
    case 'leap': { // Haunches: spring to where you point; you land with a shockwave
      const pt = aimPoint(p, s.leapRange || 85), dx = pt.x - p.x, dy = pt.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.dashX = dx / d; p.dashY = dy / d; p.dashT = Math.max(0.1, Math.min(0.32, d / Math.max(150, s.dashSpeed)));
      p.inv = Math.max(p.inv, p.dashT + (s.leapInv ? 0.35 : 0.05)); p.dashHit.clear();
      burst(p.x, p.y + 4, '#3a3230', 6, 50, 0.3);
      Sfx.play('dash');
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
        inflict(e, 'slow', { t: 2 + 0.5 * b.l });
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
    if (!isBoss(e)) inflict(e, 'web', { t: 1.6 + 0.35 * b.l });
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
    if (!e.dead) inflict(e, 'stun', { t: 0.7 });
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
    if (e.dead || !hasStatus(e, 'web')) continue;
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
  // Brood Crest's swarm call wears off (the call itself is a head ability: see 'swarmcall').
  if (p.broodRushT > 0) p.broodRushT -= dt;
  if (p.broodFedT > 0) p.broodFedT -= dt; // Blood Queen
  // Hive Womb: in a fight, spiderlings keep hatching (only into room under the cap: it never culls your brood).
  if (s.wombHatch && game.room.locked && (p.wombT = (p.wombT ?? s.wombHatch) - dt) <= 0) {
    p.wombT = s.wombHatch;
    if (game.allies.filter(a => BROOD_KINDS.has(a.kind) && !a.dead).length < broodCap(p)) { spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3)); Sfx.play('hatch'); }
  }
  // Second Mouth: the hump bites whatever comes up behind you.
  if (s.backMouth && (p.backMouthT = (p.backMouthT || 0) - dt) <= 0) {
    const e = game.enemies.find(o => !o.dead && o.spawnT <= 0 && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 14 && ((o.x - p.x) * p.aimX + (o.y - p.y) * p.aimY) < 0);
    if (e) {
      p.backMouthT = s.backMouth;
      damageEnemy(e, 1.5 * s.damage, e.x - p.x, e.y - p.y, true);
      bloodSpray(e.x, e.y, e.x - p.x, e.y - p.y, 4, ENEMY_TYPES[e.type].fluid, 70);
      game.fx.push({ kind: 'bite', x: (p.x + e.x) / 2, y: (p.y + e.y) / 2, t: 0.1 }); Sfx.play('bite');
    }
  }
  if (p.marrowT > 0 && (p.marrowT -= dt) <= 0) p.marrowStacks = 0; // Dense Marrow fades
  if (s.splitPulse && game.room.locked && (p.splitT = (p.splitT ?? s.splitPulse) - dt) <= 0) { p.splitT = s.splitPulse; spawnAlly('flesh', p.x + rand(-5, 5), p.y + rand(-4, 4)); floatText(p.x, p.y - 22, 'IT SPLITS OFF', '#9a8c70'); Sfx.play('squelch'); } // Runaway Mitosis
  if (s.quillPulse && game.room.locked && (p.quillT = (p.quillT ?? s.quillPulse) - dt) <= 0) { p.quillT = s.quillPulse; fireRing(p, s.quillCount || 6); } // Urchin Quills
  if (!s.plates) { p.plates = 0; return; }
  p.plates = Math.min(p.plates, s.plates);
  if (s.plateRegrow && p.plates < s.plates && (p.plateT -= dt) <= 0) { p.plateT = s.plateRegrow; p.plates++; Sfx.play('clack'); } // Ossuary
  // Bladestorm: in a fight, a plate flings itself at the nearest enemy (it swings back into orbit).
  if (s.plateFling && p.plates > 0 && game.room.locked && (p.flingT = (p.flingT ?? s.plateFling) - dt) <= 0) {
    p.flingT = s.plateFling;
    const q = platePos(p, 0, p.plates), e = nearestEnemy(q.x, q.y, 110);
    if (e) {
      const dx = e.x - q.x, dy = e.y - q.y, d = Math.hypot(dx, dy) || 1;
      spawnBullet({ x: q.x, y: q.y, vx: dx / d * 220, vy: dy / d * 220, r: 3, kind: 'spine', dmg: (s.plateDmg || 1.5) * 1.5 * s.damage, life: d / 220 + 0.15, pierce: 2, color: '#e8e0c8' });
      Sfx.play('whip');
    }
  }
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
}

// An enemy shot meets a plate: the plate breaks, the shot is stopped.
// Mirror Plates: the glazed plate throws the shot back first.
function plateBlocks(b) {
  const p = game.player;
  if (!(p.plates > 0) || p.burrowT > 0) return false;
  for (let i = 0; i < p.plates; i++) {
    const q = platePos(p, i, p.plates);
    if (Math.hypot(b.x - q.x, b.y - q.y) < (b.r || 2) + 3) {
      if (p.stats.plateMirror) throwBack(p, b, p.stats.plateMirror);
      breakPlate(p, q.x, q.y);
      return true;
    }
  }
  return false;
}

// Throw an enemy shot back the way it came, harder (Mirror Plates, Prism, Feeding Glass).
function throwBack(p, b, m) {
  const s = p.stats, sp = (Math.hypot(b.vx, b.vy) || 120) * 1.3, a = Math.atan2(-b.vy, -b.vx);
  const shoot = ang => spawnBullet({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 2, dmg: (b.dmg || 1) * m.mul * s.damage, life: 1.2, kind: 'shot', round: true, color: '#c8e8ff', homing: m.homing || 0 });
  shoot(a);
  if (m.split) { shoot(a - 0.25); shoot(a + 0.25); } // Prism
  if (m.heal && ++p.mirrorHits % m.heal === 0) healPlayer(1); // Feeding Glass
  burst(b.x, b.y, '#c8e8ff', 6, 70, 0.25);
  Sfx.play('shield');
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
  if (every('BONE', 5)) fireRing(p, 6 + 3 * ap.BONE);                               // shards burst from you
  if (every('FUNGAL', 2.4) && p.moving) game.clouds.push({ x: p.x, y: p.y, r: 10 + 2 * ap.FUNGAL, life: 3, toxic: true, corrode: true }); // corroding spores
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
  if (++p.apexKills % Math.max(4, 12 - 2 * n) === 0) healPlayer(1);
}

// Barb Flinger: the barbs stuck in an enemy tear out at once.
function ripBarbs(e) {
  const p = game.player, s = p.stats, n = e.barbs || 1, per = e.barbDmg || 1;
  e.barbs = 0;
  if (e.dead) return;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  const bundle = s.barbBundle ? 1 + s.barbBundle * (n - 1) : 1; // Barb Volley: stuck together, they tear out harder
  damageEnemy(e, per * n * bundle, -dx / d, -dy / d, false, 120);
  bloodSpray(e.x, e.y, dx / d, dy / d, 8 + 4 * n, ENEMY_TYPES[e.type].fluid, 140);
  if (s.barbBurst) ringFrom(e.x, e.y, s.barbBurst + n);                                        // Thorn Burst
  if (!e.dead && s.barbPull && !isBoss(e)) knock(e, dx / d, dy / d, 260);                         // Fishhooks
  applyHitEffects(e, 'barb'); // Gut Hooks
  if (s.barbChain) { // Chain Hooks: on into the next one
    let o = null, bd = 80;
    for (const q of game.enemies) { if (q === e || q.dead || q.spawnT > 0) continue; const qd = Math.hypot(q.x - e.x, q.y - e.y); if (qd < bd) { bd = qd; o = q; } }
    if (o) { const ox = o.x - e.x, oy = o.y - e.y, od = Math.hypot(ox, oy) || 1; spawnBullet({ x: e.x, y: e.y, vx: ox / od * 190, vy: oy / od * 190, r: 2, dmg: 0.5 * s.damage, life: 0.6, kind: 'shot', color: '#d8ccb0', barb: per, hitSet: new Set([e]) }); }
  }
  Sfx.play('chomp');
}

'use strict';
// ---------------------------------------------------------------------------
// Corpses & DNA.
// Some kills leave a usable corpse. Attack it (with anything) until it
// bursts, spilling glowing DNA globules. Globules drift toward you when you
// get close and stay in the room until collected. Fill the bar to evolve.
// ---------------------------------------------------------------------------

const ORB_MAGNET = 38; // globules within this range drift to you

function dnaNeeded(level) {
  return Math.round(7 + level * 5 + level * level * 0.5);
}

// Called when an enemy dies: maybe leave meat worth bursting.
function spawnCorpse(e, spriteName) {
  const T = ENEMY_TYPES[e.type];
  stain(e.x, e.y + 2, e.r + 1, T.fluid);
  game.room.corpses.push({
    x: e.x, y: e.y, r: Math.max(5, e.r), sprite: spriteName,
    // Gut Bacteria: richer corpses that take longer to burst.
    dna: T.dna * (e.elite ? 3 : 1) + game.player.stats.bacteria,
    hp: (e.elite ? 6 : 2.5) + game.player.stats.bacteria,
    fluid: T.fluid, gib: T.gib, t: Math.random() * 5, shake: 0,
  });
}

function damageCorpse(c, dmg, dx = 0, dy = 0) {
  if (c.dead) return;
  c.hp -= dmg;
  c.shake = 0.15;
  bloodSpray(c.x, c.y, dx, dy, 5, c.fluid, 90);
  Sfx.play('chomp');
  if (c.hp <= 0) burstCorpse(c);
}

function burstCorpse(c) {
  const p = game.player, s = p.stats;
  c.dead = true;
  bloodSpray(c.x, c.y, 0, 0, 26, c.fluid, 140);
  gibs(c.x, c.y, randInt(4, 7), c.gib, c.fluid);
  stain(c.x, c.y + 1, c.r + 2, c.fluid);
  // Picked-clean bones left behind.
  const d = decalCtx();
  for (let i = 0; i < 4; i++) {
    d.fillStyle = Math.random() < 0.5 ? '#cfc4a4' : '#9a9284';
    d.fillRect(Math.round(c.x + rand(-5, 5)), Math.round(c.y + rand(-3, 3)), randInt(1, 3), 1);
  }
  // Brood Chamber: sometimes a maggot crawls out instead of DNA.
  const hatched = s.brood && Math.random() < s.brood;
  if (hatched) {
    spawnAlly('maggot', c.x, c.y);
    floatText(c.x, c.y - 10, 'IT HATCHED', '#c8c08e');
    Sfx.play('hatch');
  }
  // Spill the DNA (none if a maggot ate it).
  const n = hatched ? 0 : Math.round(c.dna * s.dnaMul);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(30, 80);
    game.room.orbs.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
  }
  p.hungerT = 0; // Starving Cells: the smell of it is enough
  if (s.feedFrenzy) { // Feeding Frenzy
    if (!(p.frenzyT > 0)) floatText(p.x, p.y - 22, 'FRENZY', PAL.red);
    p.frenzyT = 5;
    recomputeStats(p);
  }
  if (s.hemophage > 0 && p.hp < p.maxHp && Math.random() < s.hemophage) {
    p.hp++;
    floatText(p.x, p.y - 20, '+1 HP', PAL.red);
  }
  game.shake = Math.max(game.shake, 2);
  Sfx.play('kill');
  game.room.corpses = game.room.corpses.filter(k => !k.dead);
}

// Every corpse within `range` of (x, y) in the direction (ax, ay).
// minDot = how wide the cone is (-1 = all around).
function corpsesNear(x, y, range, ax = 0, ay = 0, minDot = -1) {
  return game.room.corpses.filter(c => {
    const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
    if (d > range + c.r) return false;
    return d < 6 || minDot <= -1 || (dx * ax + dy * ay) / d >= minDot;
  });
}

// DNA just piles up. Once the bar is full you can evolve, but only by
// cocooning yourself (hold F; see updateCocoon in player.js).
function gainDna(n) {
  const p = game.player;
  const wasReady = evolveReady(p);
  p.dna += n;
  if (!wasReady && evolveReady(p)) { floatText(p.x, p.y - 22, 'HOLD F TO COCOON', VIAL_COLOR); Sfx.play('evolve'); }
}

// Is there an evolution waiting (a full DNA bar, or a mutagen vial)?
function evolveReady(p) {
  return p.dna >= dnaNeeded(p.level) || game.pendingEvolutions.length > 0;
}

// After the cocoon splits: one card screen per vial, then per full bar of DNA.
function nextEvolution() {
  const p = game.player;
  if (game.pendingEvolutions.length) return game.pendingEvolutions.shift();
  if (p.dna >= dnaNeeded(p.level)) {
    p.dna -= dnaNeeded(p.level);
    p.level++;
    return { minRarity: null, title: 'EVOLUTION' };
  }
  return null;
}

function updateCorpses(dt) {
  const p = game.player;
  for (const c of game.room.corpses) { c.t += dt; c.shake -= dt; }

  for (const o of game.room.orbs) {
    o.t += dt;
    const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (o.t > 0.35 && d < ORB_MAGNET) {
      const pull = 260 * (1 - d / ORB_MAGNET) + 60;
      o.vx += (dx / d) * pull * dt * 4; o.vy += (dy / d) * pull * dt * 4;
    }
    o.vx *= 0.9; o.vy *= 0.9;
    o.x += o.vx * dt; o.y += o.vy * dt;
    o.x = clamp(o.x, TILE + 2, ROOM_PX_W - TILE - 2);
    o.y = clamp(o.y, TILE + 2, ROOM_PX_H - TILE - 2);
    if (o.t > 0.35 && d < 7) {
      o.dead = true;
      gainDna(1);
      burst(o.x, o.y, VIAL_COLOR, 3, 30, 0.2);
      Sfx.play('pickup');
    }
  }
  game.room.orbs = game.room.orbs.filter(o => !o.dead);
}

// Corpses sit in the dark, twitching when hit.
function drawCorpses(ctx) {
  for (const c of game.room.corpses) {
    const img = SPR[c.sprite + '_dead'];
    if (!img || c.held) continue;
    const jx = c.shake > 0 ? (Math.floor(c.t * 40) % 2 ? 1 : -1) : 0;
    drawCentered(ctx, img, c.x + jx, c.y + 1);
  }
}

// Drawn above the darkness: a faint glint on meat that still holds DNA,
// and the glowing globules themselves.
function drawCorpseGlow(ctx) {
  for (const c of game.room.corpses) {
    if (Math.sin(c.t * 3) <= 0.2) continue;
    ctx.fillStyle = VIAL_COLOR;
    ctx.fillRect(Math.round(c.x), Math.round(c.y - 7), 1, 1);
    ctx.fillStyle = '#5a2a3a';
    ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y - 7), 1, 1);
    ctx.fillRect(Math.round(c.x) + 1, Math.round(c.y - 7), 1, 1);
  }
  for (const o of game.room.orbs) {
    const pulse = Math.floor((game.time + o.x * 0.01) * 6) % 2;
    const bob = Math.round(Math.sin(game.time * 5 + o.x) * 1);
    if (pulse) pxRing(ctx, o.x, o.y + bob, 4, '#6a2a44');
    pxCircle(ctx, o.x, o.y + bob, 2.6, '#3a0e22');
    pxCircle(ctx, o.x, o.y + bob, 1.9, pulse ? '#e8a0b8' : VIAL_COLOR);
    ctx.fillStyle = '#fff0f4';
    ctx.fillRect(Math.round(o.x) - 1, Math.round(o.y + bob) - 1, 1, 1);
  }
}

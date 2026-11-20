'use strict';
// ---------------------------------------------------------------------------
// Gore: blood spray, gibs, floor stains and corpses.
// Stains are painted onto room.decals, a canvas that persists for the floor,
// so every fight leaves its mark on the room.
// ---------------------------------------------------------------------------

function decalCtx() {
  return game.room.decals.getContext('2d');
}

function inRoom(x, y) {
  return x > 2 && y > 2 && x < ROOM_PX_W - 2 && y < ROOM_PX_H - 2;
}

// An irregular pool of fluid.
// Fresh blood on the floor is also noted on a coarse grid (room.wet), so
// whatever walks through it can track it around (see bloody footprints).
const WET_CELL = 6, WET_TIME = 30;
function markWet(x, y, r, color) {
  const room = game.room; if (!room) return;
  room.wet = room.wet || new Map();
  for (let cy = Math.floor((y - r) / WET_CELL); cy <= Math.floor((y + r) / WET_CELL); cy++)
    for (let cx = Math.floor((x - r) / WET_CELL); cx <= Math.floor((x + r) / WET_CELL); cx++) room.wet.set(cx + "," + cy, { t: game.time, color });
}
function wetAt(x, y) {
  const w = game.room && game.room.wet && game.room.wet.get(Math.floor(x / WET_CELL) + "," + Math.floor(y / WET_CELL));
  return w && game.time - w.t < WET_TIME ? w : null;
}

function stain(x, y, r, fluid) {
  if (!inRoom(x, y)) return;
  const d = decalCtx();
  const col = pick(fluid);
  pxCircle(d, x, y, r, col);
  if (r >= 1.5) markWet(x, y, r, col);
  for (let i = 0; i < Math.ceil(r) + 1; i++) {
    const a = rand(0, Math.PI * 2), dd = rand(r * 0.4, r * 1.2);
    pxCircle(d, x + Math.cos(a) * dd, y + Math.sin(a) * dd, rand(r * 0.25, r * 0.6), pick(fluid));
  }
}

function stainPx(x, y, fluid, size = 1) {
  if (!inRoom(x, y)) return;
  const d = decalCtx();
  d.fillStyle = pick(fluid);
  d.fillRect(Math.round(x), Math.round(y), size, size);
}

// Droplets that fly out and stain the floor where they land.
// dirX/dirY = direction of the hit (0,0 for all directions).
function bloodSpray(x, y, dirX, dirY, n, fluid, speed = 90) {
  const hasDir = dirX || dirY;
  const base = Math.atan2(dirY, dirX);
  for (let i = 0; i < n; i++) {
    const a = hasDir ? base + rand(-0.7, 0.7) : rand(0, Math.PI * 2);
    const s = rand(speed * 0.25, speed);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.15, 0.5), color: pick(fluid), size: Math.random() < 0.3 ? 2 : 1, fluid,
    });
  }
}

// Chunks of flesh/metal that tumble and leave a smear.
function gibs(x, y, n, colors, fluid) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(30, 110);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.3, 0.7), color: pick(colors), size: randInt(2, 3), fluid, gib: true,
    });
  }
}

// Called by the particle system when a gore particle comes to rest.
function landParticle(p) {
  if (!p.fluid) return;
  if (p.gib) {
    stain(p.x, p.y, 1.2, p.fluid);
    const d = decalCtx();
    d.fillStyle = p.color;
    d.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  } else {
    stainPx(p.x, p.y, p.fluid, p.size);
  }
}

// Leave the body behind as a darkened sprite in a pool of its own fluid.
function leaveCorpse(e, spriteName, fluid) {
  stain(e.x, e.y + 2, e.r + 1, fluid);
  if (!inRoom(e.x, e.y)) return;
  const img = anatSprite(spriteName, e.missing, '_dead');
  if (img) drawCentered(decalCtx(), img, e.x, e.y + 1);
}

// --- Gore escalation: the harder you hit, the worse it gets -------------------------------
// A heavy hit tears a CHUNK off: it tumbles away trailing blood and splats
// against whatever wall it hits, running down it. Overkill bursts the body.
function severChunk(e, dx, dy, speed = 200) {
  const T = ENEMY_TYPES[e.type];
  if (T.robot) { burst(e.x, e.y, '#ffd070', 6, 140, 0.3); return; } // sparks, not meat
  const base = (dx || dy) ? Math.atan2(dy, dx) : rand(0, Math.PI * 2), a = base + rand(-0.5, 0.5), s = rand(speed * 0.7, speed);
  game.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 0.8), color: pick(T.gib), size: randInt(3, 4), fluid: T.fluid, gib: true, chunk: true });
}

// Called each frame for a flying chunk: it bleeds as it goes, and sticks to walls.
function chunkStep(p) {
  if (Math.random() < 0.5) stainPx(p.x + rand(-1, 1), p.y + rand(-1, 1), p.fluid, 1);
  if (game.room && pointSolid(game.room, p.x, p.y)) {
    // Splat: a smear on the wall, and a few drips running down it.
    const d = decalCtx(), x = clamp(p.x, 3, ROOM_PX_W - 3), y = clamp(p.y, 3, ROOM_PX_H - 3);
    pxCircle(d, x, y, 2.2, pick(p.fluid));
    for (let i = 0; i < 3; i++) { const dx = Math.round(x + rand(-2, 2)), len = randInt(3, 8); d.fillStyle = pick(p.fluid); d.fillRect(dx, Math.round(y), 1, len); }
    d.fillStyle = p.color; d.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    p.life = 0; p.fluid = null; // done (no second stain)
    Sfx.play('splat');
  }
}

// Overkill: the body bursts.
function goreExplode(e) {
  const T = ENEMY_TYPES[e.type];
  bloodSpray(e.x, e.y, 0, 0, 40, T.fluid, 190);
  gibs(e.x, e.y, 8, T.gib, T.fluid);
  for (let i = 0; i < 4; i++) severChunk(e, 0, 0, 230);
  for (let i = 0; i < 6; i++) { const a = rand(0, Math.PI * 2), r = rand(6, 16); stain(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * 0.7, rand(1, 2.5), T.fluid); }
  game.shake = Math.max(game.shake, 3);
  hitstop(0.04);
  Sfx.play('splat');
}

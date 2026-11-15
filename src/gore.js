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
function stain(x, y, r, fluid) {
  if (!inRoom(x, y)) return;
  const d = decalCtx();
  pxCircle(d, x, y, r, pick(fluid));
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
  const img = SPR[spriteName + '_dead'];
  if (img) drawCentered(decalCtx(), img, e.x, e.y + 1);
}

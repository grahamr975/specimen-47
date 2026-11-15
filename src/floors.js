'use strict';
// ---------------------------------------------------------------------------
// FLOORS: each floor has its own enemies, hazard and boss.
//
//   pool:       which enemies appear in its rooms (repeat a type to make it common)
//   scavengers: Scavenger Maggots crawl in to eat corpses
//   hazard:     floor hazard painted into its rooms ('sticky' = slowing culture spills)
//   boss:       enemy type fought in the floor's final room (null = an elite instead)
//
// Floors 2-5 are placeholders using the original enemy mix until they get
// their own enemies and bosses.
// ---------------------------------------------------------------------------

const FLOORS = [
  {
    name: 'PETRI LABS', sub: 'The nursery',
    pool: ['rat', 'rat', 'culture', 'culture', 'culture', 'spitter', 'splitter'],
    scavengers: true, hazard: 'sticky', boss: 'mother', cultureSplit: 15,
  },
  { name: 'CRYO WING', sub: 'Cold storage', pool: ['rat', 'rat', 'drone', 'urchin', 'splitter', 'spitter'], cultureSplit: 13 },
  { name: 'BIO-WEAPONS', sub: 'The armory', pool: ['rat', 'drone', 'drone', 'urchin', 'splitter', 'spitter'], cultureSplit: 12 },
  { name: 'GENE BANK', sub: 'The archive', pool: ['rat', 'drone', 'urchin', 'urchin', 'splitter', 'spitter'], cultureSplit: 11 },
  { name: "DIRECTOR'S WING", sub: 'The end', pool: ['rat', 'drone', 'drone', 'urchin', 'splitter', 'spitter', 'spitter'], cultureSplit: 10 },
];

function floorDef(depth) {
  return FLOORS[(depth - 1) % FLOORS.length];
}

// --- Hazards -------------------------------------------------------------------------
// Placed when a room is built; painted into its background by bakeRoom().
function makeHazards(room, depth) {
  const fd = floorDef(depth);
  if (fd.hazard !== 'sticky' || room.type !== 'combat') return [];
  const out = [];
  const n = randInt(2, 4);
  for (let i = 0; i < n; i++) {
    const s = randomFloorSpot(room, null, 0);
    out.push({ kind: 'sticky', x: s.x + rand(-6, 6), y: s.y + rand(-6, 6), r: rand(12, 20) });
  }
  return out;
}

function paintHazards(ctx, room) {
  for (const h of room.hazards || []) {
    if (h.kind !== 'sticky') continue;
    // A glossy spill of escaped culture.
    pxCircle(ctx, h.x, h.y, h.r, '#18221c');
    for (let k = 0; k < 6; k++) pxCircle(ctx, h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.5, rand(3, h.r * 0.6), '#223028');
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#4a6a5a' : '#38503f';
      ctx.fillRect(Math.round(h.x + rand(-h.r, h.r) * 0.7), Math.round(h.y + rand(-h.r, h.r) * 0.6), 1, 1);
    }
  }
}

function onHazard(x, y, kind) {
  for (const h of game.room.hazards || []) {
    if (h.kind === kind && Math.hypot(h.x - x, h.y - y) < h.r) return true;
  }
  return false;
}

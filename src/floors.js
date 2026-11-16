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
  { name: 'CRYO WING', sub: 'Cold storage', boss: 'colossus', hazard: 'ice', tint: 'rgba(110,170,230,0.13)', cultureSplit: 13,
    pool: ['frostbitten', 'frostbitten', 'cryocrawler', 'cryocrawler', 'jarthing', 'rat', 'spitter'] },
  { name: 'BIO-WEAPONS', sub: 'The armory', boss: 'biotank', hazard: 'vents', tint: 'rgba(140,180,40,0.11)', cultureSplit: 12,
    pool: ['carrier', 'carrier', 'bloater', 'bloater', 'gunpolyp', 'splitter', 'rat'] },
  { name: 'GENE BANK', sub: 'The archive', boss: 'archive', hazard: 'mutagen', tint: 'rgba(150,80,180,0.12)', cultureSplit: 11,
    pool: ['mimic', 'chimera', 'clone', 'clone', 'urchin', 'splitter', 'rat'] },
  { name: "DIRECTOR'S WING", sub: 'The end', boss: 'director', hazard: 'lasers', tint: 'rgba(225,225,235,0.09)', cultureSplit: 10,
    pool: ['enforcer', 'hunter', 'hunter', 'handler', 'handler', 'drone', 'rat'] },
];

function floorDef(depth) {
  return FLOORS[(depth - 1) % FLOORS.length];
}

// --- Hazards -------------------------------------------------------------------------
// Placed when a room is built; painted into its background by bakeRoom().
// Each floor has its own:
//   sticky  (Petri Labs)      spills of culture that slow you
//   ice     (Cryo Wing)       patches you slide on
//   vents   (Bio-Weapons)     grates that puff toxic gas on a cycle
//   mutagen (Gene Bank)       pink pools that heal enemies standing in them
//   lasers  (Director's Wing) security beams that blink on and off
const LASER_CYCLE = 3.6, LASER_ON = 2.0, LASER_WARN = 0.5; // seconds
const VENT_CYCLE = 3.4, VENT_ON = 1.1;

function makeHazards(room, depth) {
  const fd = floorDef(depth);
  if (!fd.hazard || room.type !== 'combat') return [];
  const out = [], spot = () => randomFloorSpot(room, null, 0);
  if (fd.hazard === 'sticky' || fd.hazard === 'ice' || fd.hazard === 'mutagen') {
    const n = fd.hazard === 'mutagen' ? randInt(1, 2) : randInt(2, 4);
    for (let i = 0; i < n; i++) { const s = spot(); out.push({ kind: fd.hazard, x: s.x + rand(-6, 6), y: s.y + rand(-6, 6), r: fd.hazard === 'ice' ? rand(16, 26) : fd.hazard === 'mutagen' ? rand(11, 16) : rand(12, 20) }); }
  } else if (fd.hazard === 'vents') {
    for (let i = 0; i < randInt(2, 3); i++) { const s = spot(); out.push({ kind: 'vent', x: s.x, y: s.y, r: 15, phase: rand(0, VENT_CYCLE) }); }
  } else if (fd.hazard === 'lasers') {
    // A beam or two across the room, off the door lines, so it can always be timed.
    const rows = [TILE * 3 + 4, ROOM_PX_H - TILE * 3 - 4], cols = [TILE * 5, ROOM_PX_W - TILE * 5];
    const n = randInt(1, 2), opts = [...rows.map(y => ({ x1: TILE, y1: y, x2: ROOM_PX_W - TILE, y2: y })), ...cols.map(x => ({ x1: x, y1: TILE, x2: x, y2: ROOM_PX_H - TILE }))].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) out.push(Object.assign({ kind: 'laser', phase: rand(0, LASER_CYCLE) }, opts[i]));
  }
  return out;
}

function paintHazards(ctx, room) {
  for (const h of room.hazards || []) {
    if (h.kind === 'sticky') { // a glossy spill of escaped culture
      pxCircle(ctx, h.x, h.y, h.r, '#18221c');
      for (let k = 0; k < 6; k++) pxCircle(ctx, h.x + rand(-h.r, h.r) * 0.6, h.y + rand(-h.r, h.r) * 0.5, rand(3, h.r * 0.6), '#223028');
      for (let k = 0; k < 8; k++) { ctx.fillStyle = Math.random() < 0.5 ? '#4a6a5a' : '#38503f'; ctx.fillRect(Math.round(h.x + rand(-h.r, h.r) * 0.7), Math.round(h.y + rand(-h.r, h.r) * 0.6), 1, 1); }
    } else if (h.kind === 'ice') { // a slick sheet of ice with cracks and glints
      pxCircle(ctx, h.x, h.y, h.r, '#3a5a74');
      pxCircle(ctx, h.x, h.y, h.r - 2, '#4e7896');
      for (let k = 0; k < 5; k++) pxCircle(ctx, h.x + rand(-h.r, h.r) * 0.5, h.y + rand(-h.r, h.r) * 0.4, rand(2, h.r * 0.4), '#5e8aa8');
      ctx.fillStyle = '#2a4258'; for (let k = 0; k < 3; k++) { let cx = h.x + rand(-h.r, h.r) * 0.4, cy = h.y + rand(-h.r, h.r) * 0.4; for (let s = 0; s < 8; s++) { cx += rand(-1.5, 1.5); cy += rand(-1, 1); ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1); } }
      ctx.fillStyle = '#d8f0ff'; for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(h.x + rand(-h.r, h.r) * 0.6), Math.round(h.y + rand(-h.r, h.r) * 0.5), 1, 1);
    } else if (h.kind === 'vent') { // a rusted floor grate
      ctx.fillStyle = '#0e0c0a'; ctx.fillRect(Math.round(h.x - 8), Math.round(h.y - 5), 16, 10);
      ctx.fillStyle = '#4a4238'; for (let k = -6; k <= 6; k += 3) ctx.fillRect(Math.round(h.x + k), Math.round(h.y - 4), 1, 8);
      ctx.fillStyle = '#2e3a18'; ctx.fillRect(Math.round(h.x - 8), Math.round(h.y + 5), 16, 1);
    } else if (h.kind === 'mutagen') { // a spill of pink mutagen
      pxCircle(ctx, h.x, h.y, h.r, '#3a1028');
      pxCircle(ctx, h.x, h.y, h.r - 2, '#6a2050');
      ctx.fillStyle = '#c96a8f'; for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(h.x + rand(-h.r, h.r) * 0.6), Math.round(h.y + rand(-h.r, h.r) * 0.5), 1, 1);
    } else if (h.kind === 'laser') { // emitters at both ends, and a faint scorched track
      for (const [ex, ey] of [[h.x1, h.y1], [h.x2, h.y2]]) { ctx.fillStyle = '#2a2a30'; ctx.fillRect(Math.round(ex) - 3, Math.round(ey) - 3, 6, 6); ctx.fillStyle = '#601010'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2); }
      ctx.fillStyle = 'rgba(40,10,10,0.35)'; const n = Math.round(Math.hypot(h.x2 - h.x1, h.y2 - h.y1)); for (let i = 0; i < n; i += 2) ctx.fillRect(Math.round(h.x1 + (h.x2 - h.x1) * i / n), Math.round(h.y1 + (h.y2 - h.y1) * i / n), 1, 1);
    }
  }
}

// A laser's state: 'on', 'warn' (about to come on), or 'off'.
function laserState(h) {
  const t = (game.time + h.phase) % LASER_CYCLE;
  return t < LASER_ON ? 'on' : t > LASER_CYCLE - LASER_WARN ? 'warn' : 'off';
}
const ventOn = h => (game.time + h.phase) % VENT_CYCLE < VENT_ON;

// The live part of the hazards: gas, lasers, healing pools.
function updateHazards(dt) {
  const p = game.player, room = game.room;
  if (!room.hazards || !room.hazards.length) return;
  for (const h of room.hazards) {
    if (h.kind === 'vent' && ventOn(h)) {
      if (Math.random() < dt * 30) game.particles.push({ x: h.x + rand(-6, 6), y: h.y + rand(-3, 3), vx: rand(-15, 15), vy: rand(-45, -20), life: 0.6, color: Math.random() < 0.5 ? '#aac25a' : '#7a9238', size: 2 });
      if (room.locked && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r && p.burrowT <= 0) hurtPlayer(1); // toxic gas
    } else if (h.kind === 'laser' && laserState(h) === 'on') {
      if (distToSegment(p.x, p.y, h.x1, h.y1, h.x2, h.y2) < p.r + 1 && p.burrowT <= 0 && room.locked) hurtPlayer(1);
    } else if (h.kind === 'mutagen') {
      for (const e of game.enemies) {
        if (e.dead || e.spawnT > 0 || ENEMY_TYPES[e.type].boss || Math.hypot(e.x - h.x, e.y - h.y) > h.r + e.r * 0.5 || e.hp >= e.maxHp) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15 * dt); // it knits itself back together
        if (Math.random() < dt * 6) game.particles.push({ x: e.x + rand(-4, 4), y: e.y + rand(-4, 2), vx: 0, vy: -20, life: 0.4, color: '#e8a0b8', size: 1 });
      }
    }
  }
}

// Drawn with the floor: venting gas.
function drawHazards(ctx) {
  for (const h of game.room.hazards || []) {
    if (h.kind !== 'vent' || !ventOn(h)) continue;
    ctx.globalAlpha = 0.35; pxCircle(ctx, h.x, h.y - 3, h.r * (0.7 + 0.3 * Math.sin(game.time * 9)), '#7a9238'); ctx.globalAlpha = 1;
  }
}

// Drawn over the darkness: lasers (a thin flicker before they come on), the
// mutagen's glow, and a vent's warning light just before it puffs.
function drawHazardGlow(ctx) {
  for (const h of game.room.hazards || []) {
    if (h.kind === 'laser') {
      const st = laserState(h);
      if (st === 'off') continue;
      const n = Math.max(1, Math.round(Math.hypot(h.x2 - h.x1, h.y2 - h.y1)));
      if (st === 'warn') { if (Math.floor(game.time * 16) % 2) { ctx.fillStyle = '#ff6060'; for (let i = 0; i < n; i += 4) ctx.fillRect(Math.round(h.x1 + (h.x2 - h.x1) * i / n), Math.round(h.y1 + (h.y2 - h.y1) * i / n), 1, 1); } continue; }
      pxLine(ctx, h.x1, h.y1, h.x2, h.y2, '#600808', 3, 0);
      pxLine(ctx, h.x1, h.y1, h.x2, h.y2, Math.random() < 0.5 ? '#ff3030' : '#ff8080', 1, 0);
    } else if (h.kind === 'mutagen') {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(game.time * 3 + h.x); pxRing(ctx, h.x, h.y, h.r, '#e8a0b8'); ctx.globalAlpha = 1;
    } else if (h.kind === 'vent' && !ventOn(h) && (game.time + h.phase) % VENT_CYCLE > VENT_CYCLE - 0.5 && Math.floor(game.time * 12) % 2) {
      ctx.fillStyle = '#c0e040'; ctx.fillRect(Math.round(h.x) - 1, Math.round(h.y) - 1, 2, 2);
    }
  }
}

function onHazard(x, y, kind) {
  for (const h of game.room.hazards || []) {
    if (h.kind === kind && Math.hypot(h.x - x, h.y - y) < h.r) return true;
  }
  return false;
}

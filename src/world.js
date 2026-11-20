'use strict';
// ---------------------------------------------------------------------------
// World: rooms, floor generation, tile collision.
// Room coordinates are local (0..320 x 0..192); the renderer offsets them.
// ---------------------------------------------------------------------------

const TILE = 16;
const ROOM_W = 20;           // tiles
const ROOM_H = 12;
const ROOM_PX_W = ROOM_W * TILE;
const ROOM_PX_H = ROOM_H * TILE;
const ROOM_Y = 32;           // screen y where the room is drawn (HUD above)

const T_FLOOR = 0, T_WALL = 1, T_BLOCK = 2, T_DOOR = 3;

const DIRS = {
  up: { dx: 0, dy: -1, opp: 'down' },
  down: { dx: 0, dy: 1, opp: 'up' },
  left: { dx: -1, dy: 0, opp: 'right' },
  right: { dx: 1, dy: 0, opp: 'left' },
};

// Door tiles (2 tiles wide) for each side.
const DOOR_TILES = {
  up: [[9, 0], [10, 0]],
  down: [[9, ROOM_H - 1], [10, ROOM_H - 1]],
  left: [[0, 5], [0, 6]],
  right: [[ROOM_W - 1, 5], [ROOM_W - 1, 6]],
};

// Where the player appears when entering through each door.
const DOOR_SPAWN = {
  up: { x: ROOM_PX_W / 2, y: TILE + 14 },
  down: { x: ROOM_PX_W / 2, y: ROOM_PX_H - TILE - 14 },
  left: { x: TILE + 14, y: ROOM_PX_H / 2 },
  right: { x: ROOM_PX_W - TILE - 14, y: ROOM_PX_H / 2 },
};

// Obstacle layouts for the 18x10 interior. '#' = crate, barrel, rubble or tank.
// Keep the middle row/column paths to the doors open.
const LAYOUTS = [
  [],
  [
    '..................',
    '..................',
    '...##........##...',
    '...##........##...',
    '..................',
    '..................',
    '...##........##...',
    '...##........##...',
  ],
  [
    '..................',
    '..................',
    '..................',
    '.......####.......',
    '.......####.......',
    '.......####.......',
    '.......####.......',
  ],
  [
    '..................',
    '.###..........###.',
    '.#..............#.',
    '..................',
    '..................',
    '..................',
    '..................',
    '.#..............#.',
    '.###..........###.',
  ],
  [
    '..................',
    '..................',
    '..#####....#####..',
    '..................',
    '..................',
    '..................',
    '..................',
    '..#####....#####..',
  ],
  [
    '..................',
    '..#............#..',
    '..................',
    '.....#......#.....',
    '..................',
    '..................',
    '.....#......#.....',
    '..................',
    '..#............#..',
  ],
  [
    '..................',
    '..................',
    '....#........#....',
    '....#...##...#....',
    '....#........#....',
    '....#........#....',
    '....#...##...#....',
    '....#........#....',
  ],
];

function generateFloor(depth) {
  const grid = new Map();
  const key = (x, y) => x + ',' + y;
  const rooms = [];
  const target = Math.min(5 + depth, 12) + 1; // + the vault

  const add = (gx, gy, type) => {
    const r = {
      gx, gy, type, doors: {}, cleared: false, visited: false, seen: false,
      locked: false, pickups: [], corpses: [], orbs: [], slime: [], hatch: false, tiles: null, bg: null,
    };
    grid.set(key(gx, gy), r);
    rooms.push(r);
    return r;
  };

  const start = add(0, 0, 'start');
  const dirList = Object.values(DIRS);
  let guard = 0;
  while (rooms.length < target - 1 && guard++ < 2000) { // (the vault is added last)
    const base = pick(rooms);
    const d = pick(dirList);
    const nx = base.gx + d.dx, ny = base.gy + d.dy;
    if (grid.has(key(nx, ny))) continue;
    if (Math.abs(nx) > 4 || Math.abs(ny) > 2) continue; // keep it fitting the minimap
    let neighbors = 0;
    for (const dd of dirList) if (grid.has(key(nx + dd.dx, ny + dd.dy))) neighbors++;
    if (neighbors > 1) continue; // tree-like layouts feel more like a dungeon
    add(nx, ny, 'combat');
  }

  for (const r of rooms) {
    for (const name in DIRS) {
      const nb = grid.get(key(r.gx + DIRS[name].dx, r.gy + DIRS[name].dy));
      if (nb) r.doors[name] = nb;
    }
  }

  // Farthest room from the start holds the exit hatch.
  const distMap = new Map([[rooms[0], 0]]);
  const queue = [rooms[0]];
  while (queue.length) {
    const r = queue.shift();
    for (const name in r.doors) {
      const nb = r.doors[name];
      if (!distMap.has(nb)) { distMap.set(nb, distMap.get(r) + 1); queue.push(nb); }
    }
  }
  let exit = rooms.find(r => r.type === 'combat');
  for (const r of rooms) if (r.type === 'combat' && distMap.get(r) > distMap.get(exit)) exit = r;
  exit.type = 'exit';

  // The Mutagen Vault: a sealed dead end off a random room, wherever it lands this time
  // (never off the exit). On floor 1 it stays within a room of the start, so the slug can
  // reach the limbs inside. Its only door is the sealed one.
  const spots = [], loose = [];
  for (const r of rooms) {
    if (r === exit || (depth === 1 && distMap.get(r) > 1)) continue;
    for (const name in DIRS) {
      const nx = r.gx + DIRS[name].dx, ny = r.gy + DIRS[name].dy;
      if (grid.has(key(nx, ny)) || Math.abs(nx) > 4 || Math.abs(ny) > 2) continue;
      let touching = 0;
      for (const dd of dirList) if (grid.has(key(nx + dd.dx, ny + dd.dy))) touching++;
      (touching === 1 ? spots : loose).push([r, name, nx, ny]); // (prefer a spot only its host touches)
    }
  }
  const at = pick(spots.length ? spots : loose);
  if (at) {
    const [host, name, nx, ny] = at, vault = add(nx, ny, 'vault'), seal = { hits: 0, broken: false, cd: 0 }; // both sides share the door
    host.doors[name] = vault; vault.doors[DIRS[name].opp] = host;
    host.seals = Object.assign(host.seals || {}, { [name]: seal });
    vault.seals = { [DIRS[name].opp]: seal };
  }

  for (const r of rooms) buildRoom(r, depth);
  return { rooms, start: rooms[0], depth };
}

function buildRoom(room, depth) {
  const tiles = new Array(ROOM_W * ROOM_H).fill(T_FLOOR);
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      if (x === 0 || y === 0 || x === ROOM_W - 1 || y === ROOM_H - 1) tiles[y * ROOM_W + x] = T_WALL;
    }
  }
  for (const name in room.doors) {
    for (const [x, y] of DOOR_TILES[name]) tiles[y * ROOM_W + x] = T_DOOR;
  }
  // Boss rooms are open arenas.
  const bossRoom = room.type === 'exit' && floorDef(depth).boss;
  const layout = room.type === 'combat' ? pick(LAYOUTS) : room.type === 'exit' && !bossRoom ? LAYOUTS[1] : [];
  layout.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') tiles[(j + 1) * ROOM_W + (i + 1)] = T_BLOCK;
  });
  room.tiles = tiles;
  room.hazards = makeHazards(room, depth);
  room.bg = bakeRoom(room);
  room.decals = makeCanvas(ROOM_PX_W, ROOM_PX_H); // fresh blood & corpses, kept for the whole floor
}

const FLOOR_RAMP = ['#0d0b0d', '#151215', '#1c181b', '#241f22', '#2d2729'];
const GRIME_RAMP = ['#0e0b09', '#17120e', '#201912', '#2a2117', '#33291d'];
const WALL_RAMP = ['#090707', '#141010', '#201a19', '#2d2524', '#3e3431'];

// Brightness of the concrete floor at a pixel (0..1).
function floorValue(px, py, seed, W, H) {
  let v = 0.52 + (vnoise(px, py, 28, seed) - 0.5) * 0.4 + (vnoise(px, py, 7, seed + 1) - 0.5) * 0.2 + (hash2(px, py, seed) - 0.5) * 0.12;
  v += (hash2(px >> 4, py >> 4, seed + 2) - 0.5) * 0.14; // each slab slightly different
  const tx = px % 16, ty = py % 16;
  if (tx === 0 || ty === 0) v -= 0.32;
  else if (tx === 1 || ty === 1) v += 0.07;
  const dx = (px - W / 2) / (W / 2), dy = (py - H / 2) / (H / 2);
  v -= 0.32 * (dx * dx * 0.55 + dy * dy * 0.85); // darker toward the edges
  return v;
}

// Paints floor (and walls, if `walls`) pixel by pixel into an ImageData.
function paintSurface(ctx, W, H, seed, walls) {
  const img = ctx.createImageData(W, H);
  const put = (i, hex) => { const [r, g, b] = hexRgb(hex); img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255; };
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const dither = ((BAYER[py & 3][px & 3] + 0.5) / 16 - 0.5) * 0.5;
      const depth = Math.min(px, py, W - 1 - px, H - 1 - py); // distance from the outer edge
      if (walls && depth < TILE) {
        // Thick brick walls: dark at the outer edge, lit lip where they meet the floor.
        const horiz = (py < TILE || py >= H - TILE) && px >= depth && px < W - depth;
        const u = horiz ? px : py, v = horiz ? py : px;
        const row = Math.floor(v / 5), seam = v % 5 === 0 || (u + (row % 2) * 5) % 10 === 0;
        let val = 0.22 + 0.42 * (depth / (TILE - 1)) + (hash2(px, py, seed + 5) - 0.5) * 0.14 + (vnoise(px, py, 6, seed + 6) - 0.5) * 0.2;
        if (seam) val -= 0.2;
        if (depth >= TILE - 2) val += 0.2;
        let ramp = WALL_RAMP;
        // Rust / blood streaks running down the walls.
        const streak = hash2(horiz ? px : py, 99, seed) > 0.93 && hash2(Math.floor(u / 3), 98, seed) > 0.4;
        if (streak) { ramp = hash2(u, 97, seed) > 0.5 ? RAMPS.rust : RAMPS.blood; val -= 0.15; }
        put(i, ramp[clamp(Math.floor(val * 5 + dither), 0, 4)]);
        continue;
      }
      const v = floorValue(px, py, seed, W, H);
      const g = vnoise(px, py, 12, seed + 3);
      const ramp = g > 0.7 ? GRIME_RAMP : FLOOR_RAMP;
      put(i, ramp[clamp(Math.floor((v - Math.max(0, g - 0.68) * 0.9) * 5 + dither), 0, 4)]);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function crack(ctx, x, y, len) {
  let a = rand(0, Math.PI * 2);
  ctx.fillStyle = '#070506';
  for (let i = 0; i < len; i++) {
    a += rand(-0.7, 0.7);
    x += Math.cos(a); y += Math.sin(a);
    if (x < TILE || y < TILE || x > ROOM_PX_W - TILE || y > ROOM_PX_H - TILE) break;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    if (Math.random() < 0.08) crack(ctx, x, y, len * 0.4);
  }
}

function bakeRoom(room) {
  const c = makeCanvas(ROOM_PX_W, ROOM_PX_H);
  const x = c.getContext('2d');
  paintSurface(x, ROOM_PX_W, ROOM_PX_H, randInt(1, 999999), true);
  const tint = floorDef(game.depth).tint; // each floor's own cast: icy, sickly, violet, sterile
  if (tint) { x.fillStyle = tint; x.fillRect(0, 0, ROOM_PX_W, ROOM_PX_H); }
  const cracks = randInt(2, 5);
  for (let i = 0; i < cracks; i++) crack(x, rand(TILE * 2, ROOM_PX_W - TILE * 2), rand(TILE * 2, ROOM_PX_H - TILE * 2), randInt(12, 30));

  // Old, dried bloodstains: something bad happened here before you.
  const old = ['#24100f', '#1c0c0b', '#2c1212'];
  const stains = randInt(1, 4);
  for (let i = 0; i < stains; i++) {
    const sx = rand(TILE * 2, ROOM_PX_W - TILE * 2), sy = rand(TILE * 2, ROOM_PX_H - TILE * 2);
    pxCircle(x, sx, sy, rand(3, 7), pick(old));
    for (let j = 0; j < 6; j++) pxCircle(x, sx + rand(-10, 10), sy + rand(-7, 7), rand(1, 3), pick(old));
  }
  if (Math.random() < 0.45) { // a long drag mark
    let dx = rand(TILE * 2, ROOM_PX_W - TILE * 2), dy = rand(TILE * 2, ROOM_PX_H - TILE * 2);
    const a = rand(0, Math.PI * 2);
    for (let s = 0; s < 55; s++) {
      dx += Math.cos(a) * 1.5; dy += Math.sin(a) * 1.5;
      if (dx < TILE || dy < TILE || dx > ROOM_PX_W - TILE || dy > ROOM_PX_H - TILE) break;
      x.fillStyle = pick(old);
      x.fillRect(Math.round(dx), Math.round(dy), 3, 2);
    }
  }

  paintHazards(x, room);

  // Shadow cast by the walls onto the floor.
  x.fillStyle = 'rgba(0,0,0,0.5)';
  x.fillRect(TILE, TILE, ROOM_PX_W - TILE * 2, 6);
  x.fillRect(TILE, TILE, 5, ROOM_PX_H - TILE * 2);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(TILE, TILE + 6, ROOM_PX_W - TILE * 2, 4);

  // Obstacles, themed per room.
  const theme = pick(['crates', 'barrels', 'tanks', 'rubble', 'mixed']);
  const pickObstacle = () => {
    const t = theme === 'mixed' ? pick(['crates', 'barrels', 'tanks', 'rubble']) : theme;
    if (t === 'crates') return pick(SPR.crates);
    if (t === 'barrels') return pick(SPR.barrels);
    if (t === 'rubble') return pick(SPR.rubble);
    return Math.random() < 0.3 ? SPR.tankBroken : pick(SPR.tanks);
  };
  for (let ty = 0; ty < ROOM_H; ty++) for (let tx = 0; tx < ROOM_W; tx++) {
    if (room.tiles[ty * ROOM_W + tx] !== T_BLOCK) continue;
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(tx * TILE + 3, ty * TILE + 12, 14, 5);
    x.drawImage(pickObstacle(), tx * TILE, ty * TILE);
  }
  return c;
}

// Dark concrete for the title screen.
function bakeTitleBg() {
  const c = makeCanvas(VIEW_W, VIEW_H);
  paintSurface(c.getContext('2d'), VIEW_W, VIEW_H, 4747, false);
  return c;
}

function isSolid(room, tx, ty, flying) {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return true;
  const t = room.tiles[ty * ROOM_W + tx];
  if (t === T_FLOOR) return false;
  if (t === T_DOOR) return room.locked || !!sealAt(room, doorDirOfTile(tx, ty));
  if (t === T_BLOCK) return !flying;
  return true;
}

function circleHitsWall(room, x, y, r, flying) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r - 0.01) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolid(room, tx, ty, flying)) return true;
  }
  return false;
}

// Move an entity, sliding along walls. Returns true if it bumped something.
function moveEntity(room, e, dx, dy) {
  let bumped = false;
  const you = typeof game !== 'undefined' && e === game.player;
  if (dx) {
    if (!circleHitsWall(room, e.x + dx, e.y, e.r, e.flying)) e.x += dx;
    else { bumped = true; if (you && Math.abs(dx) >= Math.abs(dy)) cornerSlide(room, e, dx, 0); }
  }
  if (dy) {
    if (!circleHitsWall(room, e.x, e.y + dy, e.r, e.flying)) e.y += dy;
    else { bumped = true; if (you && Math.abs(dy) > Math.abs(dx)) cornerSlide(room, e, 0, dy); }
  }
  return bumped;
}

// Clip the edge of a doorway or a crate by a few pixels and you slide around it instead
// of sticking: if a small sidestep would clear the way, ease that way.
const CORNER_SLIDE = 6;
function cornerSlide(room, e, dx, dy) {
  const step = Math.min(1.5, Math.max(0.6, Math.abs(dx || dy)));
  for (let off = 1; off <= CORNER_SLIDE; off++) for (const side of [1, -1]) {
    const ox = dy ? side * off : 0, oy = dx ? side * off : 0;
    if (circleHitsWall(room, e.x + ox + dx, e.y + oy + dy, e.r, e.flying)) continue; // still blocked from there
    const sx = Math.sign(ox) * step, sy = Math.sign(oy) * step;
    if (circleHitsWall(room, e.x + sx, e.y + sy, e.r, e.flying)) continue;
    e.x += sx; e.y += sy;
    return true;
  }
  return false;
}

// --- Hazmat seals --------------------------------------------------------------------
// The Mutagen Vault's door is sealed. A few attacks (any kind) break it open.
const SEAL_HITS = 4;

function doorDirOfTile(tx, ty) {
  if (ty === 0) return 'up';
  if (ty === ROOM_H - 1) return 'down';
  return tx === 0 ? 'left' : 'right';
}

function doorCenter(dir) {
  const [[x1, y1], [x2, y2]] = DOOR_TILES[dir];
  return { x: (x1 + x2 + 1) * TILE / 2, y: (y1 + y2 + 1) * TILE / 2 };
}

function sealAt(room, dir) {
  const s = room.seals && room.seals[dir];
  return s && !s.broken ? s : null;
}

// An attack landing at (x, y) with some `reach`: hit any sealed door there.
function strikeSeal(x, y, reach) {
  const room = game.room;
  if (!room || !room.seals) return false;
  for (const dir in room.seals) {
    const s = sealAt(room, dir);
    if (!s) continue;
    const c = doorCenter(dir);
    if (Math.hypot(c.x - x, c.y - y) > reach + 16) continue;
    if (s.cd > game.time) return true; // one hit per attack, not one per pellet
    s.cd = game.time + 0.18;
    s.hits++;
    s.flash = 0.08;
    burst(c.x, c.y, '#ffd070', 6, 80, 0.25);
    burst(c.x, c.y, '#e8c020', 3, 50, 0.3);
    game.shake = Math.max(game.shake, 2);
    Sfx.play('clank');
    if (s.hits >= SEAL_HITS) {
      s.broken = true;
      burst(c.x, c.y, '#e8c020', 20, 130, 0.6);
      burst(c.x, c.y, '#3e3e46', 16, 110, 0.6);
      burst(c.x, c.y, VIAL_COLOR, 10, 60, 0.8); // the vault breathes out
      floatText(c.x, c.y + 10, 'SEAL BROKEN', '#e8c020');
      game.shake = Math.max(game.shake, 5);
      Sfx.play('slam');
    }
    return true;
  }
  return false;
}

function pointSolid(room, x, y) {
  return isSolid(room, Math.floor(x / TILE), Math.floor(y / TILE), false);
}

// Random open floor position, at least `minDist` from `avoid`.
function randomFloorSpot(room, avoid, minDist) {
  for (let i = 0; i < 200; i++) {
    const tx = randInt(2, ROOM_W - 3), ty = randInt(2, ROOM_H - 3);
    if (room.tiles[ty * ROOM_W + tx] !== T_FLOOR) continue;
    const spot = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    if (avoid && dist(spot, avoid) < minDist) continue;
    return spot;
  }
  return { x: ROOM_PX_W / 2, y: ROOM_PX_H / 2 };
}

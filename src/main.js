'use strict';
// ---------------------------------------------------------------------------
// Main: game state, room transitions, the update/render loop.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');


const game = {
  state: 'title',      // 'title' | 'play' | 'dead'
  time: 0, depth: 1, kills: 0, overT: 0,
  floor: null, room: null, player: null,
  enemies: [], bullets: [], puddles: [], particles: [], texts: [],
  fx: [], pendingEvolutions: [], allies: [], clouds: [], shells: [], deathFx: [], decoy: null, webs: [], actShots: [],
  telegraphs: [], bombs: [], bossName: null, bossMax: 1, whips: [],
  shake: 0, fade: 0, banner: null, menu: null, paused: false,
};

function newRun() {
  game.depth = 1;
  game.kills = 0;
  game.player = makePlayer();
  recomputeStats(game.player);
  game.player.hp = game.player.maxHp; // born whole (after your birth defect)
  game.state = 'play';
  game.menu = null;
  game.pendingEvolutions = [];
  game.evolving = false;
  game.hitstop = 0;
  game.allies = [];
  game.paused = false;
  startFloor();
}

function startFloor() {
  if (game.player.parts) recomputeStats(game.player); // Rings of Age count floors
  game.player.twinDead = false; // a new twin grows each floor
  if (game.player.stats && game.player.stats.calcified) game.player.armor = Math.min(2, (game.player.armor || 0) + 1); // Calcified Organs
  game.floor = generateFloor(game.depth);
  // Each vault's vial color is decided now, so the minimap and its seal can show it.
  // Floor 1's is LIMBS while you're still a slug.
  for (const r of game.floor.rooms) if (r.type === 'vault') r.vialLoc = game.depth === 1 && !partAt(game.player, 'LIMBS') ? 'LIMBS' : pick(VIAL_LOCS);
  game.player.x = ROOM_PX_W / 2;
  game.player.y = ROOM_PX_H / 2;
  enterRoom(game.floor.start, null);
  const fd = floorDef(game.depth);
  const loop = Math.floor((game.depth - 1) / FLOORS.length); // past the Director, the lab goes deeper (and harder)
  game.banner = { text: `FLOOR ${game.depth}: ${fd.name}` + (loop ? ' ' + '+'.repeat(loop) : ''), sub: loop ? 'Deeper still. Everything is stronger.' : fd.sub, color: PAL.red, t: 2.4 };
}

// `side` = which door of the new room the player comes through.
function enterRoom(room, side) {
  game.room = room;
  if (!room.cleared && game.player && game.player.stats && game.player.stats.roomArmor) game.player.armor = Math.max(game.player.armor || 0, 1); // Bone Colossus
  room.visited = true;
  for (const d in room.doors) room.doors[d].seen = true;
  game.enemies = []; game.bullets = []; game.puddles = []; game.deathFx = []; game.particles = []; game.texts = []; game.fx = [];
  game.allies = game.allies.filter(a => a.kind === 'twin'); game.clouds = []; game.shells = []; game.decoy = null; game.webs = []; game.actShots = [];
  game.telegraphs = []; game.bombs = []; game.bossName = null;
  game.player.held = null; game.player.trail = []; game.player.burrowT = 0;
  game.player.tongue = null; game.player.grappleShot = null; game.whips = [];
  game.player.plates = game.player.stats.plates || 0; // Bone Plates regrow in every room

  const p = game.player;
  if (side) { p.x = DOOR_SPAWN[side].x; p.y = DOOR_SPAWN[side].y; }
  for (const a of game.allies) { a.x = p.x; a.y = p.y; } // your twin comes in with you (after you're placed: it used to arrive at the far door)
  p.dashT = 0;
  game.slowT = 0;
  // Broodmother: a fresh litter in every room.
  for (let i = 0; i < (p.stats.roomBrood || 0); i++) spawnAlly('spiderling', p.x + rand(-6, 6), p.y + rand(-4, 4));

  if (!room.cleared) {
    if (room.type === 'combat' || room.type === 'exit') {
      room.locked = true;
      spawnRoomEnemies(room);
      Sfx.play('door');
    } else {
      room.cleared = true;
      if (room.type === 'vault') spawnPickup('vial', ROOM_PX_W / 2, ROOM_PX_H / 2, game.depth === 1 && room.vialLoc === 'LIMBS' ? { loc: 'LIMBS', minRarity: null, plain: true } : { loc: room.vialLoc }); // floor 1's limbs: any limbs, and maybe a wild card
      // You're born with nothing, sealed in a containment cell with your first weapon's vial.
      // Eat it and the glass gives way.
      if (room.type === 'start' && game.depth === 1 && !partAt(p, 'MOUTH')) {
        const cx = ROOM_PX_W / 2, cy = ROOM_PX_H / 2;
        room.cage = { x0: cx - CAGE_W / 2, y0: cy - CAGE_H / 2, x1: cx + CAGE_W / 2, y1: cy + CAGE_H / 2 };
        p.x = cx - 12; p.y = cy;
        spawnPickup('vial', cx + 14, cy, { loc: 'MOUTH', minRarity: null, plain: true });
      }
    }
  }
  game.fade = 0.2;
}

// --- The containment cell you wake up in ------------------------------------------
const CAGE_W = 56, CAGE_H = 40;
function holdInCage(p) {
  const c = game.room && game.room.cage;
  if (!c) return;
  const m = p.r + 2;
  p.x = clamp(p.x, c.x0 + m, c.x1 - m);
  p.y = clamp(p.y, c.y0 + m, c.y1 - m);
}
function breakCage(room) {
  const c = room.cage;
  if (!c) return;
  room.cage = null;
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  for (let i = 0; i < 46; i++) { // the glass bursts outward
    const t = Math.random(), side = i % 4;
    const x = side === 0 ? c.x0 + t * CAGE_W : side === 1 ? c.x1 : side === 2 ? c.x0 + t * CAGE_W : c.x0;
    const y = side === 0 ? c.y0 : side === 1 ? c.y0 + t * CAGE_H : side === 2 ? c.y1 : c.y0 + t * CAGE_H;
    const a = Math.atan2(y - cy, x - cx) + rand(-0.4, 0.4), v = rand(60, 170);
    game.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), color: Math.random() < 0.6 ? '#bfe0e8' : '#6a8a94', size: Math.random() < 0.3 ? 2 : 1 });
  }
  game.shake = Math.max(game.shake, 6);
  hitstop(0.06);
  Sfx.play('blast');
  whisper('The glass was never going to hold you.');
}
function drawCage(ctx) {
  const c = game.room && game.room.cage;
  if (!c) return;
  const w = c.x1 - c.x0, h = c.y1 - c.y0;
  ctx.fillStyle = 'rgba(150,200,215,0.10)'; ctx.fillRect(c.x0, c.y0, w, h);       // the glass
  ctx.fillStyle = 'rgba(190,230,240,0.35)';                                        // glints
  ctx.fillRect(c.x0 + 4, c.y0 + 3, 10, 1); ctx.fillRect(c.x0 + 4, c.y0 + 3, 1, 6); ctx.fillRect(c.x1 - 12, c.y1 - 4, 8, 1);
  ctx.fillStyle = '#4a5458';                                                       // steel frame
  ctx.fillRect(c.x0 - 1, c.y0 - 1, w + 2, 2); ctx.fillRect(c.x0 - 1, c.y1 - 1, w + 2, 2);
  ctx.fillRect(c.x0 - 1, c.y0 - 1, 2, h + 2); ctx.fillRect(c.x1 - 1, c.y0 - 1, 2, h + 2);
  ctx.fillStyle = '#7a868a';
  for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) ctx.fillRect(x - 2, y - 2, 4, 4); // corner bolts
  drawText(ctx, 'SPECIMEN 47', (c.x0 + c.x1) / 2, c.y0 - 9, '#7a868a', 1, 'center', null);
}

// Walk through a doorway to change rooms. The first time, a boss lair's door
// holds you at the threshold: keep walking for a moment to go in.
const LAIR_HOLD = 0.5;
function checkDoors(dt = 1 / 60) {
  const p = game.player, room = game.room;
  if (room.locked) return;
  // Past the doorway by more than `m` pixels?
  const past = (d, m) => d === 'up' ? p.y < TILE - m : d === 'down' ? p.y > ROOM_PX_H - TILE + m : d === 'left' ? p.x < TILE - m : p.x > ROOM_PX_W - TILE + m;
  const lair = Object.keys(room.doors).find(d => isLairDoor(room, d) && !room.doors[d].visited && past(d, 1));
  if (lair) {
    const pushing = (p.inX || 0) * DIRS[lair].dx + (p.inY || 0) * DIRS[lair].dy > 0.5;
    p.lairT = pushing ? (p.lairT || 0) + dt : 0;
    if (p.lairT < LAIR_HOLD) { // held at the threshold
      if (lair === 'up') p.y = Math.max(p.y, TILE - 1.5); else if (lair === 'down') p.y = Math.min(p.y, ROOM_PX_H - TILE + 1.5);
      else if (lair === 'left') p.x = Math.max(p.x, TILE - 1.5); else p.x = Math.min(p.x, ROOM_PX_W - TILE + 1.5);
      if (!p.lairWarned) { p.lairWarned = true; floatText(p.x, p.y - 12, 'KEEP WALKING TO ENTER', '#e05050'); Sfx.play('heartbeat'); }
      return;
    }
    p.lairT = 0; p.lairWarned = false;
    enterRoom(room.doors[lair], DIRS[lair].opp);
    return;
  }
  p.lairT = 0; p.lairWarned = false;
  let dir = null;
  if (past('up', 2) && room.doors.up) dir = 'up';
  else if (past('down', 2) && room.doors.down) dir = 'down';
  else if (past('left', 2) && room.doors.left) dir = 'left';
  else if (past('right', 2) && room.doors.right) dir = 'right';
  if (dir) enterRoom(room.doors[dir], DIRS[dir].opp);
}

function gameOver() {
  game.state = 'dead';
  game.overT = 0;
  const p = game.player;
  bloodSpray(p.x, p.y, 0, 0, 60, FLUID.blood, 160);
  gibs(p.x, p.y, 12, ['#a8534f', '#d98a7a', '#5e2229', '#d9cfa0'], FLUID.blood);
  stain(p.x, p.y + 2, 6, FLUID.blood);
  game.shake = 6;
  Sfx.play('die');
}

// Music follows the action: the combat layer swells during lockdowns.
function updateMusicMood() {
  if (!Music.started) return;
  if (game.state === 'title') Music.setMood(false, 0.8);
  else if (game.state === 'dead') Music.setMood(false, 0.35);
  else Music.setMood(game.room && game.room.locked, game.paused ? 0.4 : 1);
}

function update(dt) {
  game.time += dt;
  if (Input.hit('m')) Sfx.setMuted(!Sfx.muted);
  updateMusicMood();

  if (game.journal) { updateJournal(); return; }
  if (game.state === 'title') {
    if (Input.hit('j')) { openJournal(); return; }
    if (Input.mouse.clicked || Input.hit(' ', 'enter')) newRun();
    return;
  }
  if (game.state === 'dead') {
    game.overT += dt;
    game.shake = Math.max(0, game.shake - dt * 20);
    updateParticles(dt);
    if (game.overT > 1 && (Input.mouse.clicked || Input.hit(' ', 'enter'))) newRun();
    return;
  }
  if (game.menu) { updateMenu(dt); return; }
  // The cocoon has split: work through every evolution that was waiting.
  if (game.evolving) {
    const next = nextEvolution();
    if (next) { openEvolution(next); return; }
    game.evolving = false;
    emergeFromCocoon(game.player);
  }
  if (Input.hit('p', 'escape')) game.paused = !game.paused;
  if (game.paused) { if (Input.hit('j')) openJournal(); return; }

  // Hitstop: a heavy hit freezes everything for a beat.
  if (game.hitstop > 0) { game.hitstop -= dt; return; }

  game.shake = Math.max(0, game.shake - dt * 20);
  game.fade = Math.max(0, game.fade - dt);
  if (game.banner && (game.banner.t -= dt) <= 0) game.banner = null;
  updateWhisper(dt);

  updatePlayer(dt);
  holdInCage(game.player);
  // Fight or Flight: for a moment after you're hurt, everything else crawls.
  let wdt = dt;
  if (game.slowT > 0) { game.slowT -= dt; wdt = dt * 0.35; }
  updateEnemies(wdt);
  updateBullets(wdt);
  updatePuddles(dt);
  updateDeathFuses(dt);
  updateHazards(dt);
  updatePickups(dt);
  updateCorpses(dt);
  updateFx(dt);
  updateExtras(dt);
  updateBossFx(dt);
  ensureTwin();
  updateParticles(dt);
  updateTexts(dt);
  updateLighting(dt);
  if (game.state !== 'play') return;

  const room = game.room, p = game.player;

  // Heartbeat when you're close to death.
  if (p.hp <= 2 * HP_PER_HEART) {
    game.beatT = (game.beatT || 0) - dt;
    if (game.beatT <= 0) { game.beatT = p.hp <= HP_PER_HEART ? 0.7 : 0.95; Sfx.play('heartbeat'); }
  }

  // Room cleared?
  // Room cleared? (Harmless scavengers don't keep the doors shut.)
  if (room.locked && !game.enemies.some(e => !ENEMY_TYPES[e.type].harmless && e.state !== 'disguise')) { // (a disguised Mimic waits for you after)
    room.locked = false;
    room.cleared = true;
    Sfx.play('door');
    // Cancerous Growth feeds on every victory.
    if (hasMutation(p, 'cancer')) {
      p.cancerRooms++;
      const takes = p.cancerRooms % 3 === 0;
      floatText(p.x, p.y - 14, takes ? 'THE GROWTH TAKES' : 'THE GROWTH SPREADS', takes ? COST_COLOR : MALIGNANT_COLOR);
      recomputeStats(p);
    }
    if (room.type === 'exit') {
      room.hatch = true;
      game.banner = { text: 'HATCH OPEN', sub: 'Step on it to descend deeper', color: PAL.lime, t: 2 };
    } else if (p.hp < p.maxHp && Math.random() < 0.3) {
      spawnPickup('heart', ROOM_PX_W / 2, ROOM_PX_H / 2);
    }
  }

  // Exit hatch
  if (room.hatch && !game.menu && Math.hypot(p.x - ROOM_PX_W / 2, p.y - ROOM_PX_H / 2) < 9) {
    // Anything worth taking comes down with you: a core you left, vials, loose biomass.
    let took = false;
    for (const k of room.pickups) if (k.kind === 'core' || k.kind === 'vial') { k.x = p.x; k.y = p.y; k.waitForLeave = false; took = true; }
    if (took) updatePickups(0);
    if (room.orbs.length) { gainDna(room.orbs.length); room.orbs = []; }
    game.depth++;
    p.hp = Math.min(p.maxHp, p.hp + 1);
    Sfx.play('descend');
    startFloor();
    return;
  }

  checkDoors(dt);
}

// --- Rendering -----------------------------------------------------------------
function drawDoors(ctx) {
  const room = game.room;
  for (const name in room.doors) {
    const [tx, ty] = DOOR_TILES[name][0];
    const horiz = name === 'up' || name === 'down';
    const seal = sealAt(room, name);
    if (seal) {
      // Hazmat seal: dents and cracks as you hit it; flashes on each hit.
      const dmg = Math.min(2, Math.floor(seal.hits * 3 / SEAL_HITS));
      let img = SPR.doors[(horiz ? 'h_' : 'v_') + 'hazmat' + dmg];
      if (seal.flash > 0) { seal.flash -= 1 / 60; img = SPR.doors[(horiz ? 'h_' : 'v_') + 'hazmatFlash']; }
      ctx.drawImage(img, tx * TILE, ty * TILE);
      const behind = room.doors[name]; // a glint of the vial waiting behind the seal
      if (behind && behind.vialLoc && Math.floor(game.time * 2) % 2) { const c = doorCenter(name); ctx.fillStyle = vialColor(behind.vialLoc); ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 3, 3); }
      continue;
    }
    const lair = isLairDoor(room, name);
    ctx.drawImage(SPR.doors[(horiz ? 'h_' : 'v_') + (lair ? (room.locked ? 'bossLocked' : 'bossOpen') : (room.locked ? 'locked' : 'open'))], tx * TILE, ty * TILE);
    if (lair) { // a pulsing label just inside the door
      const label = floorDef(game.depth).boss ? 'BOSS' : 'WARDEN';
      const c = doorCenter(name), lx = clamp(c.x, TILE + 14, ROOM_PX_W - TILE - 14), ly = clamp(c.y, TILE + 5, ROOM_PX_H - TILE - 7);
      const col = Math.floor(game.time * 2.5) % 2 ? '#e05050' : '#8a1420';
      drawText(ctx, label, lx, ly - 3, col, 1, 'center');
    }
  }
}

// Does this door lead into the floor's boss (or warden) room?
function isLairDoor(room, name) {
  const to = room.doors[name];
  return !!to && to.type === 'exit' && room.type !== 'exit';
}

function drawHatch(ctx) {
  if (!game.room.hatch) return;
  // A drainage hatch leading down, glowing red from below.
  drawCentered(ctx, SPR.hatch, ROOM_PX_W / 2, ROOM_PX_H / 2);
  if (Math.floor(game.time * 2) % 2) pxRing(ctx, ROOM_PX_W / 2, ROOM_PX_H / 2, 14, '#3a0608');
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (game.state === 'title') {
    drawTitle(ctx);
    if (game.journal) drawJournal(ctx);
    drawCrosshair(ctx);
    return;
  }

  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const sx = game.shake > 0 ? Math.round(rand(-game.shake, game.shake)) : 0;
  const sy = game.shake > 0 ? Math.round(rand(-game.shake, game.shake)) : 0;
  ctx.save();
  ctx.translate(sx, ROOM_Y + sy);
  // Everything in the dark...
  ctx.drawImage(game.room.bg, 0, 0);
  ctx.drawImage(game.room.decals, 0, 0);
  drawCorpses(ctx);
  drawDoors(ctx);
  drawHatch(ctx);
  drawPuddles(ctx);
  drawHazards(ctx);
  drawWebs(ctx);
  drawDecoy(ctx);
  drawEnemies(ctx);
  drawAllies(ctx);
  if (game.state === 'play') drawPlayer(ctx);
  drawCage(ctx);
  drawParticles(ctx, false);
  drawClouds(ctx);
  drawLighting(ctx);
  // ...and everything that glows through it.
  drawPickups(ctx);
  drawCorpseGlow(ctx);
  drawPuddleGlow(ctx);
  drawHazardGlow(ctx);
  drawEnemyGlow(ctx);
  drawDeathFuses(ctx);
  drawBossFx(ctx);
  if (game.state === 'play') drawPlayerGlow(ctx);
  drawFx(ctx);
  drawBullets(ctx);
  drawParticles(ctx, true);
  drawTexts(ctx);
  ctx.restore();

  if (game.fade > 0) {
    ctx.fillStyle = `rgba(4,2,4,${game.fade / 0.2})`;
    ctx.fillRect(0, ROOM_Y, VIEW_W, ROOM_PX_H);
  }
  drawLowHealth(ctx);

  drawCocoonPulse(ctx); // the screen throbs with the cocoon's heartbeat
  if (game.cocoonFlash > 0) game.cocoonFlash -= 1 / 60;
  drawHUD(ctx);
  drawBossBar(ctx);
  drawWhisper(ctx);
  drawBanner(ctx);
  if (game.menu) drawMenu(ctx);
  if (game.paused) {
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawText(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2 - 10, PAL.white, 3, 'center');
    drawText(ctx, 'PRESS P TO RESUME  -  J: SPLICE JOURNAL', VIEW_W / 2, VIEW_H / 2 + 14, PAL.silver, 1, 'center');
  }
  if (game.journal) drawJournal(ctx);
  if (game.state === 'dead') drawGameOver(ctx);
  drawCrosshair(ctx);
}

// --- Scaling: biggest whole-number zoom that fits the window ---------------------
function resize() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = VIEW_W * scale + 'px';
  canvas.style.height = VIEW_H * scale + 'px';
}
window.addEventListener('resize', resize);
resize();

// --- Fixed-timestep loop ---------------------------------------------------------
Input.init(canvas);
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    update(STEP);
    Input.endFrame();
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

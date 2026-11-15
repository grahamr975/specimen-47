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
  fx: [], pendingEvolutions: [], allies: [], clouds: [], decoy: null, webs: [],
  telegraphs: [], bombs: [], bossName: null, bossMax: 1,
  shake: 0, fade: 0, banner: null, menu: null, paused: false,
};

function newRun() {
  game.depth = 1;
  game.kills = 0;
  game.player = makePlayer();
  recomputeStats(game.player);
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
  if (game.player.slots) recomputeStats(game.player); // Rings of Age count floors
  game.player.twinDead = false; // a new twin grows each floor
  game.floor = generateFloor(game.depth);
  game.player.x = ROOM_PX_W / 2;
  game.player.y = ROOM_PX_H / 2;
  enterRoom(game.floor.start, null);
  const fd = floorDef(game.depth);
  game.banner = { text: `FLOOR ${game.depth}: ${fd.name}`, sub: fd.sub, color: PAL.red, t: 2.4 };
}

// `side` = which door of the new room the player comes through.
function enterRoom(room, side) {
  game.room = room;
  room.visited = true;
  for (const d in room.doors) room.doors[d].seen = true;
  game.enemies = []; game.bullets = []; game.puddles = []; game.particles = []; game.texts = []; game.fx = [];
  game.allies = game.allies.filter(a => a.kind === 'twin'); game.clouds = []; game.decoy = null; game.webs = [];
  game.telegraphs = []; game.bombs = []; game.bossName = null;
  game.player.held = null; game.player.trail = []; game.player.burrowT = 0;
  for (const a of game.allies) { a.x = game.player.x; a.y = game.player.y; }

  const p = game.player;
  if (side) { p.x = DOOR_SPAWN[side].x; p.y = DOOR_SPAWN[side].y; }
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
      if (room.type === 'vault') spawnPickup('vial', ROOM_PX_W / 2, ROOM_PX_H / 2);
    }
  }
  game.fade = 0.2;
}

function checkDoors() {
  const p = game.player, room = game.room;
  if (room.locked) return;
  let dir = null;
  if (p.y < TILE - 2 && room.doors.up) dir = 'up';
  else if (p.y > ROOM_PX_H - TILE + 2 && room.doors.down) dir = 'down';
  else if (p.x < TILE - 2 && room.doors.left) dir = 'left';
  else if (p.x > ROOM_PX_W - TILE + 2 && room.doors.right) dir = 'right';
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

  if (game.state === 'title') {
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
  if (game.paused) return;

  // Hitstop: a heavy hit freezes everything for a beat.
  if (game.hitstop > 0) { game.hitstop -= dt; return; }

  game.shake = Math.max(0, game.shake - dt * 20);
  game.fade = Math.max(0, game.fade - dt);
  if (game.banner && (game.banner.t -= dt) <= 0) game.banner = null;
  updateWhisper(dt);

  updatePlayer(dt);
  // Fight or Flight: for a moment after you're hurt, everything else crawls.
  let wdt = dt;
  if (game.slowT > 0) { game.slowT -= dt; wdt = dt * 0.35; }
  updateEnemies(wdt);
  updateBullets(wdt);
  updatePuddles(dt);
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
  if (p.hp <= 2) {
    game.beatT = (game.beatT || 0) - dt;
    if (game.beatT <= 0) { game.beatT = p.hp === 1 ? 0.7 : 0.95; Sfx.play('heartbeat'); }
  }

  // Room cleared?
  // Room cleared? (Harmless scavengers don't keep the doors shut.)
  if (room.locked && !game.enemies.some(e => !ENEMY_TYPES[e.type].harmless)) {
    room.locked = false;
    room.cleared = true;
    Sfx.play('door');
    if (p.stats.roomFruit) { spawnPickup('heart', ROOM_PX_W / 2 - 24, ROOM_PX_H / 2); floatText(p.x, p.y - 14, 'YOUR HEART FRUITS', '#7ab84a'); } // Fruiting Heart
    if (p.stats.setRoomHeal && p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', SETS.ABOMINATION.color); }
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
    game.depth++;
    p.hp = Math.min(p.maxHp, p.hp + 1);
    Sfx.play('descend');
    startFloor();
    return;
  }

  checkDoors();
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
      continue;
    }
    ctx.drawImage(SPR.doors[(horiz ? 'h_' : 'v_') + (room.locked ? 'locked' : 'open')], tx * TILE, ty * TILE);
  }
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
  drawWebs(ctx);
  drawDecoy(ctx);
  drawEnemies(ctx);
  drawAllies(ctx);
  if (game.state === 'play') drawPlayer(ctx);
  drawParticles(ctx, false);
  drawClouds(ctx);
  drawLighting(ctx);
  // ...and everything that glows through it.
  drawPickups(ctx);
  drawCorpseGlow(ctx);
  drawEnemyGlow(ctx);
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

  drawHUD(ctx);
  drawBossBar(ctx);
  drawWhisper(ctx);
  drawBanner(ctx);
  if (game.menu) drawMenu(ctx);
  if (game.paused) {
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawText(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2 - 10, PAL.white, 3, 'center');
    drawText(ctx, 'PRESS P TO RESUME', VIEW_W / 2, VIEW_H / 2 + 14, PAL.silver, 1, 'center');
  }
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

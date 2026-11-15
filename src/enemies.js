'use strict';
// ---------------------------------------------------------------------------
// Enemies. Each type has a simple, readable behavior. Their corpses are
// worth DNA (`dna`) when you eat them; drones leave inedible scrap.
// ---------------------------------------------------------------------------

// dna: DNA in a usable corpse. corpse: chance to leave one (elites always do).
// fluid: what they bleed. gib: colors of the chunks. eyes: glint pixels
// (offsets from center, facing right) that shine in the dark.
const ENEMY_TYPES = {
  rat:      { name: 'Lab Rat',         hp: 3, r: 5, speed: 60, dna: 1, corpse: 0.5, fluid: FLUID.blood, gib: ['#5e5450', '#7a0f1a', '#a8534f'], eyes: [[8, 1]] },
  drone:    { name: 'Security Drone',  hp: 4, r: 6, speed: 48, dna: 0, corpse: 0, fluid: FLUID.oil,   gib: ['#5e5a5a', '#3e3c40', '#8a8478'], eyes: [[0, 2], [-1, 2], [0, 3]], flying: true, robot: true },
  urchin:   { name: 'Bone Urchin',     hp: 6, r: 6, speed: 22, dna: 2, corpse: 0.6, fluid: FLUID.ichor, gib: ['#cfc4a4', '#3a1020', '#6a1a2a'], eyes: [[-2, -1], [2, -1]] },
  splitter: { name: 'Failed Specimen', hp: 8, r: 7, speed: 28, dna: 3, corpse: 1, fluid: FLUID.rot,   gib: ['#5e6a48', '#2e3424', '#7e8a62'], eyes: [[6, 1], [3, 1]] },
  mini:     { name: 'Spawnling',       hp: 2, r: 4, speed: 55, dna: 0, corpse: 0, fluid: FLUID.rot,   gib: ['#5e6a48', '#2e3424'], eyes: [[0, 0]] },
  spitter:  { name: 'Bloat Toad',      hp: 5, r: 6, speed: 34, dna: 2, corpse: 0.7, fluid: FLUID.bile,  gib: ['#3e4a2a', '#8a9a30', '#232a18'], eyes: [[-4, -4], [4, -4]] },
  // --- Floor 1: Petri Labs ---
  culture:  { name: 'Culture Blob',    hp: 4, r: 6, speed: 8,  dna: 1, corpse: 0.4, fluid: FLUID.rot,   gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [] },
  scavenger:{ name: 'Scavenger Maggot', hp: 1, r: 4, speed: 34, dna: 0, corpse: 0,  fluid: FLUID.bile,  gib: ['#9a8c70', '#6a5e48'], eyes: [[4, -1]], harmless: true },
  // --- Bosses ---
  mother:   { name: 'The Mother Culture', hp: 60, r: 17, speed: 0, dna: 0, corpse: 0, fluid: FLUID.rot, gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [[0, -8], [-12, 0], [12, 2]], boss: true },
  motherling:{ name: 'Mother Culture',  hp: 18, r: 10, speed: 22, dna: 0, corpse: 0, fluid: FLUID.rot, gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [[0, -4]], boss: true },
};

const ENEMY_POOL = ['rat', 'rat', 'drone', 'urchin', 'splitter', 'spitter'];

function makeEnemy(type, x, y, elite = false) {
  const T = ENEMY_TYPES[type];
  const depth = game.depth;
  const hp = T.hp * (1 + (depth - 1) * 0.3) * (elite ? 3 : 1);
  return {
    type, x, y, r: T.r, hp, maxHp: hp, elite,
    speed: T.speed * (1 + (depth - 1) * 0.05),
    flying: !!T.flying,
    spawnT: 0.7,                 // warp-in delay before it becomes active
    flash: 0, kx: 0, ky: 0,      // hit flash + knockback velocity
    t: Math.random() * 10,
    timer: rand(1, 2.5),
    state: 'move', dirX: 0, dirY: 0,
    strafe: Math.random() < 0.5 ? 1 : -1,
    face: 1, dead: false,
  };
}

function spawnEnemy(type, x, y, elite) {
  const e = makeEnemy(type, x, y, elite);
  game.enemies.push(e);
  return e;
}

function spawnRoomEnemies(room) {
  const fd = floorDef(game.depth);
  // The floor's last room holds its boss (if it has one yet).
  if (room.type === 'exit' && fd.boss) { spawnBoss(fd.boss); return; }

  // Floor 1 is gentler: you start weak and need a few meals to get going.
  let n = game.depth === 1 ? randInt(3, 4) : 3 + Math.min(game.depth, 6) + randInt(0, 2);
  if (room.type === 'exit') n += 1;
  n = Math.min(n, 13);
  for (let i = 0; i < n; i++) {
    const spot = randomFloorSpot(room, game.player, 70);
    const e = spawnEnemy(pick(fd.pool), spot.x, spot.y);
    e.spawnT += i * 0.08;
  }
  // An elite with affixes: always in the exit room, sometimes elsewhere.
  if (room.type === 'exit' || Math.random() < 0.08 + 0.07 * game.depth) {
    const spot = randomFloorSpot(room, game.player, 90);
    const e = spawnEnemy(pick(fd.pool.filter(t => t !== 'culture')), spot.x, spot.y, true);
    rollAffixes(e);
  }
  // Scavengers crawl in a little later, looking for meat.
  if (fd.scavengers) {
    const k = randInt(1, 2);
    for (let i = 0; i < k; i++) {
      const spot = randomFloorSpot(room, game.player, 60);
      spawnEnemy('scavenger', spot.x, spot.y).spawnT = 3 + i * 2;
    }
  }
}

function damageEnemy(e, dmg, vx, vy, quiet) {
  if (e.dead) return;
  dmg = affixDamage(e, dmg); // shielded / shelled elites
  if (dmg <= 0) return;
  e.hp -= dmg;
  const T = ENEMY_TYPES[e.type];
  if (dmg < 0.3) { if (e.hp <= 0) killEnemy(e); return; } // tiny damage ticks (bleed) stay quiet
  e.flash = 0.08;
  if (vx || vy) {
    const s = Math.hypot(vx, vy) || 1;
    const kb = T.boss ? 0 : e.elite ? 35 : 90;
    e.kx += (vx / s) * kb;
    e.ky += (vy / s) * kb;
    bloodSpray(e.x, e.y, vx, vy, 6, T.fluid, 110); // spurts out the far side
  } else if (Math.random() < 0.3) {
    bloodSpray(e.x, e.y, 0, 0, 1, T.fluid, 30);
  }
  if (T.robot && !quiet) burst(e.x, e.y, '#ffd070', 3, 70, 0.2); // sparks
  if (!quiet) Sfx.play('hit');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  game.kills++;
  const T = ENEMY_TYPES[e.type];
  bloodSpray(e.x, e.y, 0, 0, e.elite ? 40 : 22, T.fluid, 130);
  gibs(e.x, e.y, e.elite ? 10 : randInt(3, 6), T.gib, T.fluid);
  if (T.robot) {
    leaveCorpse(e, enemySpriteName(e), T.fluid); // scrap: nothing to harvest
    burst(e.x, e.y, '#ffd070', 10, 110, 0.35);
    Sfx.play('clank');
  } else if (T.dna && (e.elite || Math.random() < T.corpse)) {
    spawnCorpse(e, enemySpriteName(e)); // usable: burst it open for DNA
  } else {
    // Torn apart: just a smear, nothing worth harvesting.
    stain(e.x, e.y + 1, e.r + 2, T.fluid);
    gibs(e.x, e.y, 3, T.gib, T.fluid);
  }
  Sfx.play('kill');
  game.shake = Math.max(game.shake, e.elite ? 5 : 2);

  if (e.type === 'splitter') {
    for (const side of [-1, 1]) {
      const m = makeEnemy('mini', e.x + side * 3, e.y, false);
      m.spawnT = 0;
      m.kx = side * 120;
      game.enemies.push(m);
    }
  }

  onAffixDeath(e);
  if (T.boss) { onBossPartKilled(e); return; }

  // Drops: elites often drop a mutagen vial; anything might drop a heart.
  const room = game.room;
  let x = e.x, y = e.y;
  if (pointSolid(room, x, y)) ({ x, y } = randomFloorSpot(room, null, 0));
  if (e.elite && Math.random() < 0.45) spawnPickup('vial', x, y);
  else if (!T.harmless && Math.random() < 0.05) spawnPickup('heart', x, y);
}

function updateEnemies(dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    e.t += dt; e.flash -= dt; e.timer -= dt; e.blindT -= dt;
    // Held in your hands, flying through the air, or stunned: no thinking.
    if (e.held) continue;
    if (e.thrown) { updateThrownEnemy(e, dt); continue; }
    if (e.grabOnArrive) {
      if (!p.held && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 12) { e.grabOnArrive = false; grab(p, { kind: 'enemy', ref: e }); continue; }
      if (Math.hypot(e.kx, e.ky) < 30) e.grabOnArrive = false;
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      moveEntity(game.room, e, e.kx * dt, e.ky * dt); e.kx *= 0.85; e.ky *= 0.85;
      continue;
    }

    // Where it thinks you are (a decoy, your lure, or nowhere if blinded).
    const tg = enemyTarget(e);
    const dx = tg.x - e.x, dy = tg.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const pd = Math.hypot(p.x - e.x, p.y - e.y);
    const ux = dx / d, uy = dy / d;
    let mx = 0, my = 0;
    updateAffixes(e, dt);

    switch (e.type) {
      case 'culture': // drifts, swells, divides
        updateCulture(e, dt);
        mx = ux * e.speed + Math.sin(e.t * 2) * 4; my = uy * e.speed + Math.cos(e.t * 1.7) * 4;
        break;
      case 'scavenger': [mx, my] = updateScavenger(e, dt); break;
      case 'mother': [mx, my] = updateMother(e, dt, p); break;
      case 'motherling': [mx, my] = updateMotherling(e, dt, p); break;
      case 'rat': { // fast, wiggly chaser
        const w = Math.sin(e.t * 8) * 0.6;
        mx = (ux - uy * w) * e.speed;
        my = (uy + ux * w) * e.speed;
        break;
      }
      case 'splitter':
      case 'mini': // slow, relentless chasers
        mx = ux * e.speed; my = uy * e.speed;
        break;
      case 'drone': { // keeps its distance, strafes, shoots
        const f = d > 95 ? 1 : d < 65 ? -1 : 0;
        mx = (ux * f - uy * e.strafe * 0.7) * e.speed;
        my = (uy * f + ux * e.strafe * 0.7) * e.speed;
        if (Math.random() < dt * 0.4) e.strafe *= -1;
        if (e.timer <= 0) {
          e.timer = rand(1.6, 2.4);
          const angles = e.elite ? [-0.3, 0, 0.3] : [0];
          const base = Math.atan2(uy, ux);
          for (const off of angles) {
            spawnBullet({ x: e.x, y: e.y, vx: Math.cos(base + off) * 95, vy: Math.sin(base + off) * 95, r: 2, team: 'enemy', kind: 'enemy', life: 3, color: PAL.red });
          }
          Sfx.play('enemyShot');
        }
        break;
      }
      case 'urchin': { // creeps, winds up, then charges in a straight line
        if (e.state === 'move') {
          mx = ux * e.speed; my = uy * e.speed;
          if (e.timer <= 0) { e.state = 'wind'; e.timer = 0.5; }
        } else if (e.state === 'wind') {
          if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.6; e.dirX = ux; e.dirY = uy; }
        } else if (e.state === 'charge') {
          mx = e.dirX * 190; my = e.dirY * 190;
          if (e.timer <= 0) { e.state = 'rest'; e.timer = 0.6; }
        } else if (e.timer <= 0) {
          e.state = 'move'; e.timer = rand(1.2, 2.2);
        }
        break;
      }
      case 'spitter': { // keeps range and lobs acid where you're standing
        const f = d > 120 ? 1 : d < 80 ? -1 : 0;
        mx = (ux * f - uy * e.strafe * 0.4) * e.speed;
        my = (uy * f + ux * e.strafe * 0.4) * e.speed;
        if (e.timer <= 0) {
          e.timer = rand(2, 2.8);
          const flight = clamp(d / 90, 0.4, 1.4);
          spawnBullet({ x: e.x, y: e.y, vx: dx / flight, vy: dy / flight, r: 3, team: 'enemy', kind: 'glob', life: flight, maxLife: flight, color: PAL.lime });
          if (e.elite) {
            for (const side of [-1, 1]) {
              spawnBullet({ x: e.x, y: e.y, vx: (dx - uy * 40 * side) / flight, vy: (dy + ux * 40 * side) / flight, r: 3, team: 'enemy', kind: 'glob', life: flight, maxLife: flight, color: PAL.lime });
            }
          }
          Sfx.play('enemyShot');
        }
        break;
      }
    }

    if (e.blindT > 0 && e.type !== 'urchin') e.timer = Math.max(e.timer, 0.5); // blind things don't shoot
    // Your slime is slippery: things crawling through it slow and slide.
    if (!e.flying && game.room.slime.length && onSlime(e.x, e.y + 2, 5)) {
      mx = mx * 0.55 + rand(-25, 25); my = my * 0.55 + rand(-25, 25);
      if (p.stats.toxicBlood > 0) damageEnemy(e, 0.8 * dt, 0, 0, true); // toxic slime
    }
    const bumped = moveEntity(game.room, e, (mx + e.kx) * dt, (my + e.ky) * dt);
    e.kx *= 0.85; e.ky *= 0.85;
    if (bumped && e.state === 'charge') {
      e.state = 'rest'; e.timer = 0.7;
      game.shake = Math.max(game.shake, 2);
      burst(e.x + e.dirX * e.r, e.y + e.dirY * e.r, PAL.silver, 6, 60);
    }
    if (Math.abs(mx) > 1) e.face = mx > 0 ? 1 : -1;

    // Bleeding from Gore Horns.
    if (e.bleedT > 0) {
      e.bleedT -= dt;
      damageEnemy(e, e.bleedDps * dt, 0, 0, true);
      if (Math.random() < dt * 8) stainPx(e.x + rand(-3, 3), e.y + rand(0, 4), ENEMY_TYPES[e.type].fluid);
      if (e.dead) continue;
    }

    if (pd < e.r + p.r - 1 && p.burrowT <= 0 && !ENEMY_TYPES[e.type].harmless) {
      // Pustule Field: touching you pops a pustule of burning bile.
      if (p.stats.pustules && !(e.pusT > 0)) {
        e.pusT = 0.8; e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, p.stats.pustules);
        spawnPuddle(e.x, e.y, 8, 1.5, 'player');
        Sfx.play('splat');
      }
      // Barbed Hide shreds anything that touches you.
      if (p.stats.thorns > 0 && !(e.thornT > 0)) {
        e.thornT = 0.4;
        damageEnemy(e, p.stats.thorns, e.x - p.x, e.y - p.y, true);
        if (e.dead) continue;
      }
      if (hurtPlayer(1) && hasAffix(e, 'vampiric')) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3); floatText(e.x, e.y - 12, 'IT FEEDS', PAL.red); }
    }
    if (e.thornT > 0) e.thornT -= dt;
    if (e.pusT > 0) e.pusT -= dt;
  }

  // Keep enemies from stacking on top of each other.
  const list = game.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead || a.spawnT > 0 || b.spawnT > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const overlap = a.r + b.r - d;
      if (overlap > 0) {
        const px = (dx / d) * overlap * 0.25, py = (dy / d) * overlap * 0.25;
        moveEntity(game.room, a, -px, -py);
        moveEntity(game.room, b, px, py);
      }
    }
  }
  game.enemies = game.enemies.filter(e => !e.dead);
}

function enemySpriteName(e) {
  let n = e.type;
  if (e.type === 'rat' && Math.floor(e.t * 10) % 2) n = 'rat2';
  if (e.type === 'drone' && Math.floor(e.t * 16) % 2) n = 'drone2';
  if (e.type === 'culture' && (e.growT || 0) > floorDef(game.depth).cultureSplit * 0.6) n = 'culture2'; // swelling, about to divide
  if ((e.type === 'mother' || e.type === 'motherling') && Math.floor(e.t * 2.5) % 2) n = e.type + '2'; // pulsing
  if (e.face < 0) n += '_L';
  return n;
}

function enemyDrawPos(e) {
  let x = e.x, y = e.y;
  if (e.type === 'drone') y += Math.round(Math.sin(e.t * 4) * 1.5) - 3;
  if (e.type === 'urchin' && e.state === 'wind') x += Math.floor(e.t * 30) % 2 ? -1 : 1;
  return { x, y };
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    if (e.spawnT > 0 || e.held) continue; // spawning: drawn above the darkness; held: drawn in your hands
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(e.x - e.r - 2), Math.round(e.y + e.r - 1), e.r * 2 + 4, 3);

    const name = enemySpriteName(e);
    const { x, y } = enemyDrawPos(e);
    const winding = e.type === 'urchin' && e.state === 'wind';

    if (e.elite) {
      const outline = SPR[name + '_elite'];
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawCentered(ctx, outline, x + ox, y + oy);
    }
    const flash = e.flash > 0 || (winding && Math.floor(e.t * 20) % 2);
    drawCentered(ctx, SPR[flash ? name + '_flash' : name], x, y);

  }
}

// Drawn on top of the darkness: spawn warnings, glinting eyes, elite health.
function drawEnemyGlow(ctx) {
  const p = game.player;
  for (const e of game.enemies) {
    if (p.stats.antennae && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) > 50) {
      ctx.globalAlpha = 0.22;
      drawCentered(ctx, SPR[enemySpriteName(e) + '_flash'], e.x, e.y);
      ctx.globalAlpha = 1;
    }
    if (e.stunT > 0 && Math.floor(game.time * 8) % 2) drawText(ctx, '*', e.x, e.y - 12, PAL.yellow, 1, 'center');
    if (e.spawnT > 0) {
      // Something is crawling out: a warning so spawns are never unfair.
      if (Math.floor(e.spawnT * 14) % 2 === 0) pxRing(ctx, e.x, e.y, 2 + e.spawnT * 9, PAL.red);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, 3, 3);
      continue;
    }
    const { x, y } = enemyDrawPos(e);
    const T = ENEMY_TYPES[e.type];
    const charging = e.type === 'urchin' && (e.state === 'wind' || e.state === 'charge');
    ctx.fillStyle = charging ? '#ff8040' : '#ff2a3a';
    for (const [ex, ey] of T.eyes) {
      const gx = e.face < 0 ? -ex - 1 : ex;
      ctx.fillRect(Math.round(x + gx), Math.round(y + ey), 1, 1);
    }
    if (e.elite) {
      const w = 16, fill = Math.max(0, Math.round((e.hp / e.maxHp) * w));
      ctx.fillStyle = PAL.black; ctx.fillRect(Math.round(e.x - w / 2) - 1, Math.round(y - 12), w + 2, 3);
      ctx.fillStyle = PAL.red; ctx.fillRect(Math.round(e.x - w / 2), Math.round(y - 11), fill, 1);
      if (e.affixes) drawText(ctx, e.affixes.map(a => AFFIXES[a]).join(' '), e.x, y - 19, '#e8a020', 1, 'center');
      if (hasAffix(e, 'shielded') && !(e.shieldT > 0)) pxRing(ctx, x, y, e.r + 3, Math.floor(game.time * 4) % 2 ? '#8a7a5a' : '#5a4a3a');
    }
  }
}

'use strict';
// ---------------------------------------------------------------------------
// Bullets, acid puddles, particles, pickups and floating text.
// All of these live in arrays on the global `game` object (see main.js).
// ---------------------------------------------------------------------------

// --- Bullets -------------------------------------------------------------------
// kind: 'shot' (player), 'frag' (split fragment), 'spine', 'enemy', 'glob'
function spawnBullet(o) {
  const b = Object.assign({
    x: 0, y: 0, vx: 0, vy: 0, r: 2, dmg: 1, life: 1, team: 'player', kind: 'shot',
    homing: 0, split: 0, acid: 0, pierce: 0, color: PAL.lime,
  }, o);
  if (b.team === 'enemy' && b.kind !== 'glob') { const k = threatShotSpeed(); b.vx *= k; b.vy *= k; b.life /= k; } // deeper: faster shots (same reach)
  game.bullets.push(b);
  return b;
}

function nearestEnemy(x, y, maxDist) {
  let best = null, bd = maxDist;
  for (const e of game.enemies) {
    if (e.spawnT > 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Larvae look for a fresh host: not one that's already infested, nor the one they just left.
function nearestHost(b) {
  let best = null, bd = 160;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || e.infest || (b.hitSet && b.hitSet.has(e))) continue;
    const d = Math.hypot(e.x - b.x, e.y - b.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function updateBullets(dt) {
  const room = game.room;
  for (const b of game.bullets) {
    // Homing: rotate velocity toward the nearest enemy.
    if (b.homing && b.team === 'player') {
      const t = b.larva ? nearestHost(b) : nearestEnemy(b.x, b.y, 140);
      if (t) {
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(t.y - b.y, t.x - b.x);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(cur + turn) * sp;
        b.vy = Math.sin(cur + turn) * sp;
      }
    }
    if (b.venomBurst && Math.random() < 0.35) game.particles.push({ x: b.x, y: b.y, vx: 0, vy: 25, life: 0.2, color: '#9ac030', size: 1 }); // Venom Barrage drips
    // Compound Eyes: enemy shots crawl when they get close to you.
    let bdt = dt;
    if (b.team === 'enemy' && game.player.stats.compound && Math.hypot(b.x - game.player.x, b.y - game.player.y) < 42) bdt *= game.player.stats.compound;
    if (b.team === 'enemy' && game.player.dashT > 0 && game.player.stats.dashEat && Math.hypot(b.x - game.player.x, b.y - game.player.y) < game.player.r + b.r + 4) { b.dead = true; burst(b.x, b.y, '#c8c0b0', 4, 60, 0.2); continue; } // Sidestep
    if (b.team === 'enemy' && game.player.rootZone > 0 && Math.hypot(b.x - game.player.x, b.y - game.player.y) < game.player.rootZone) bdt *= 0.5; // Root Legs: shots wade through the roots
    if (b.team === 'enemy' && game.player.stats.gasChoke && Math.hypot(b.x - game.player.x, b.y - game.player.y) < (game.player.gasR || 0)) bdt *= 0.4; // Choke
    b.x += b.vx * bdt;
    b.y += b.vy * bdt;
    b.life -= dt;
    // Venom Lance: spikes drip burning bile as they fly.
    if (b.venom && (b.dripT = (b.dripT || 0) - dt) <= 0) { b.dripT = 0.08; spawnPuddle(b.x, b.y, 4, 1.2, 'player'); }
    // Spore Fire: bile flame sets off any spore cloud it touches.
    if (b.flame && game.clouds.length && igniteCloudAt(b.x, b.y)) { b.dead = true; continue; }

    if (b.kind === 'lob') {
      // Your spore mortar: flies over everything, bursts where it lands.
      if (b.life <= 0) {
        b.dead = true;
        for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - b.x, e.y - b.y) < 14 + e.r) damageEnemy(e, b.dmg, e.x - b.x, e.y - b.y, true);
        for (const c of corpsesNear(b.x, b.y, 14)) damageCorpse(c, b.dmg);
        strikeSeal(b.x, b.y, 14);
        if (b.lobAcid) spawnPuddle(b.x, b.y, b.lobAcid, 3, 'player'); // Bile Mortar
        burst(b.x, b.y, '#7a8a52', 8, 60);
        endPlayerBullet(b);
      }
      continue;
    }
    if (b.kind === 'glob') {
      // Lobbed acid: lands when its timer runs out.
      if (b.life <= 0 || pointSolid(room, b.x, b.y)) {
        b.dead = true;
        spawnPuddle(b.x, b.y, 13, 3.5, 'enemy');
        Sfx.play('splat');
      }
      continue;
    }

    if (b.life <= 0) { b.dead = true; endPlayerBullet(b); continue; }
    // Bone Stilts: your shots fly over crates and tanks.
    const overCover = b.team === 'player' && game.player.stats.stilts;
    if (overCover ? isSolid(room, Math.floor(b.x / TILE), Math.floor(b.y / TILE), true) : pointSolid(room, b.x, b.y)) {
      b.dead = true;
      endPlayerBullet(b);
      burst(b.x, b.y, b.color, 3, 40);
      if (b.team === 'player') strikeSeal(b.x, b.y, 4); // hazmat seals
      if (b.team === 'player' && b.acid) spawnPuddle(b.x - b.vx * dt * 2, b.y - b.vy * dt * 2, b.acid * 0.7, 2, 'player');
      continue;
    }

    if (b.team === 'player') {
      for (const e of game.enemies) {
        if (e.spawnT > 0 || e.dead || (b.hitSet && b.hitSet.has(e))) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
          damageEnemy(e, b.dmg * nightEyesMul(e), b.vx, b.vy, false, b.dmg * KNOCK_PER_DMG + (b.knock || 0));
          onPlayerBulletHit(b, e);
          if (b.kind === 'thrown' || b.spore) { b.dead = true; endPlayerBullet(b); break; }
          if (b.pierce > 0) {
            b.pierce--;
            b.hitSet = b.hitSet || new Set();
            b.hitSet.add(e);
          } else {
            b.dead = true;
          }
          break;
        }
      }
      // Shots tear into corpses as they pass over them (without stopping,
      // so meat on the floor never soaks up shots meant for the living).
      if (!b.dead && game.room.corpses.length) {
        for (const c of game.room.corpses) {
          if ((b.hitSet && b.hitSet.has(c)) || Math.hypot(c.x - b.x, c.y - b.y) > c.r + b.r) continue;
          b.hitSet = b.hitSet || new Set();
          b.hitSet.add(c);
          damageCorpse(c, b.dmg, b.vx, b.vy);
          if (b.acid) spawnPuddle(c.x, c.y, b.acid * 0.6, 1.5, 'player');
          break;
        }
      }
    } else {
      const p = game.player;
      if (segmentBlocks(b) || mirrorReflects(b) || plateBlocks(b)) { b.dead = true; continue; }
      const twin = game.allies.find(a => a.kind === 'twin' && !a.dead);
      if (twin && Math.hypot(twin.x - b.x, twin.y - b.y) < twin.r + b.r) { hurtTwin(twin); b.dead = true; continue; }
      if (Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r - 1) {
        if (b.net) { // a containment net: it pins you, no damage
          if (!(p.inv > 0) && p.dashT <= 0) { p.netT = 1.1; floatText(p.x, p.y - 14, 'NETTED', '#e8e0c8'); Sfx.play('whip'); }
          b.dead = true;
        } else if (hurtPlayer(1)) { b.dead = true; if (b.chill) { p.chillT = 2.5; floatText(p.x, p.y - 14, 'CHILLED', '#a0e0ff'); } }
      }
    }
  }
  game.bullets = game.bullets.filter(b => !b.dead);
}

// When a player shot stops (hit a wall, ran out, or hit something).
function endPlayerBullet(b) {
  if (b.team !== 'player') return;
  if (b.spore) spawnCloud(b.x, b.y, b.spore);
  if (b.kind === 'thrown' && b.corpse) { landThrownCorpse(b); b.corpse = null; }
}

// Hit effects come from the bullet's flags, which come from mutations.
function onPlayerBulletHit(b, enemy) {
  const p = game.player, s = p.stats;
  if (b.acid) spawnPuddle(b.x, b.y, b.acid, 2.2, 'player');
  if (b.venomBurst) { spawnPuddle(b.x, b.y, 14, 3, 'player'); burst(b.x, b.y, '#b0c040', 6, 70, 0.3); } // Venom Barrage
  if (b.bloodBomb) { // Blood Gulp: the spat-back prey bursts
    for (const o of game.enemies) if (o !== enemy && !o.dead && o.spawnT <= 0 && Math.hypot(o.x - b.x, o.y - b.y) < 26 + o.r) damageEnemy(o, b.bloodBomb, o.x - b.x, o.y - b.y, true);
    bloodSpray(b.x, b.y, 0, 0, 24, FLUID.blood, 140); game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 3, max: 26, t: 0.2 }); b.bloodBomb = 0;
  }
  if (b.larva && !enemy.dead) infest(enemy);                 // Ovipositor
  if (b.polyp && enemy.dead && s.polypFeed) polypFed(p);     // Feeding Polyps
  if (b.pollen && !enemy.dead) pollinate(enemy, s);          // Greenhouse
  // Clutch: whatever your fragments kill hatches a maggot.
  if (b.kind === 'frag' && enemy.dead && s.clutch) { spawnAlly('maggot', enemy.x, enemy.y); Sfx.play('hatch'); }
  if (!enemy.dead) {
    if (s.darkStun && Math.hypot(enemy.x - p.x, enemy.y - p.y) > 45) enemy.stunT = Math.max(enemy.stunT || 0, s.darkStun); // Abyss Stare
    if (s.stunChance && Math.random() < s.stunChance) enemy.stunT = Math.max(enemy.stunT || 0, 0.8);    // Brain Worm
  }
  if (b.barb && !enemy.dead) { enemy.barbs = (enemy.barbs || 0) + 1; enemy.barbDmg = b.barb; enemy.barbT = 0.8; } // a barb sticks
  if (b.blind && !enemy.dead) enemy.blindT = Math.max(enemy.blindT || 0, b.blind);                              // Spore Sneeze
  if (b.mirrorStun && !enemy.dead) enemy.stunT = Math.max(enemy.stunT || 0, b.mirrorStun); // Blinding Lens
  if (b.bleed) { enemy.bleedT = 3; enemy.bleedDps = b.bleed; }
  if (b.slow && !enemy.dead) enemy.slowT = Math.max(enemy.slowT || 0, b.slow); // sticky slime
  if (b.split > 0) spawnFragments(b.x, b.y, Math.atan2(b.vy, b.vx), b.split, b.dmg * 0.5, b.homing, b.acid ? b.acid * 0.6 : 0, enemy);
}

// Mitosis: fragments of you fan out forward from whatever got hit.
function spawnFragments(x, y, angle, n, dmg, homing, acid, exclude) {
  for (let i = 0; i < n; i++) {
    const a = angle + ((i + 0.5) / n - 0.5) * Math.PI * 1.4;
    spawnBullet({
      x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 1.5,
      dmg, life: 0.4, kind: 'frag', color: '#c96a8f',
      homing, acid, split: 0, hitSet: new Set([exclude]),
    });
  }
}

function drawBullets(ctx) {
  for (const b of game.bullets) {
    const x = Math.round(b.x), y = Math.round(b.y);
    if (b.kind === 'spine') {
      const a = Math.atan2(b.vy, b.vx);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(Math.round(x - Math.cos(a) * 2), Math.round(y - Math.sin(a) * 2), 1, 1);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(Math.round(x + Math.cos(a)), Math.round(y + Math.sin(a)), 1, 1);
    } else if (b.kind === 'lob') {
      const t = 1 - b.life / b.maxLife, h = Math.sin(t * Math.PI) * 18;
      pxCircle(ctx, x, y, 2, 'rgba(0,0,0,0.35)');
      pxCircle(ctx, x, y - h, b.r + 1, '#1e2414');
      pxCircle(ctx, x, y - h, b.r, b.color);
      ctx.fillStyle = '#c8d090'; ctx.fillRect(x - 1, Math.round(y - h) - 1, 1, 1);
    } else if (b.kind === 'glob') {
      // Show a shadow on the ground and the glob "arcing" above it.
      const t = 1 - b.life / b.maxLife;
      const h = Math.sin(t * Math.PI) * 14;
      pxCircle(ctx, x, y, 2, 'rgba(0,0,0,0.35)');
      pxCircle(ctx, x, y - h, 3, PAL.red);
      pxCircle(ctx, x, y - h, 2, '#6a1440');
    } else if (b.team === 'enemy') {
      // Enemy shots get a red danger rim so they read clearly in the dark.
      pxCircle(ctx, x, y, b.r + 1, PAL.red);
      pxCircle(ctx, x, y, b.r, '#f0e890');
    } else if (b.kind === 'thrown') {
      const img = b.corpse && SPR[b.corpse.sprite + '_dead'];
      if (img) drawCentered(ctx, img, x, y - 3);
    } else if (b.kind === 'shot' && !b.round) {
      // A bone spike pointing the way it flies: shadow, shaft, bright tip.
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const cx = b.vx / sp, cy = b.vy / sp;
      const len = 3 + Math.round(b.r * 1.5);
      const thick = b.r >= 3 ? 2 : 1;
      for (let i = 0; i <= len; i++) {
        const px = Math.round(b.x - cx * i), py = Math.round(b.y - cy * i);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px, py + 1, thick, thick);
      }
      for (let i = 0; i <= len; i++) {
        const px = Math.round(b.x - cx * i), py = Math.round(b.y - cy * i);
        ctx.fillStyle = i === 0 ? '#fff4e0' : i === len ? '#5e5450' : b.color;
        ctx.fillRect(px, py, thick, thick);
      }
    } else if (b.fade) {
      // Flamethrower bile: bright, shrinking droplets that flicker like flame.
      const r = Math.max(0.6, b.r * Math.min(1, b.life / 0.18));
      pxCircle(ctx, x, y, r + 0.6, '#3a4214');
      pxCircle(ctx, x, y, r, Math.random() < 0.3 ? '#e8f080' : b.color);
    } else {
      pxCircle(ctx, x, y, b.r + 1, PAL.black);
      pxCircle(ctx, x, y, b.r, b.color);
      ctx.fillStyle = '#ffd0c0';
      ctx.fillRect(x - 1, y - 1, 1, 1);
    }
  }
}

// --- Acid puddles ---------------------------------------------------------------
function spawnPuddle(x, y, r, life, team) {
  game.puddles.push({ x, y, r, life, maxLife: life, team, tick: 0 });
}

function updatePuddles(dt) {
  for (const p of game.puddles) {
    p.life -= dt;
    if (p.team === 'player') {
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = 0.3;
        for (const e of game.enemies) {
          if (e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r * 0.5) damageEnemy(e, 0.5, 0, 0, true);
        }
      }
    } else {
      const pl = game.player;
      if (!pl.stats.stilts && !pl.flying && pl.burrowT <= 0 && Math.hypot(pl.x - p.x, pl.y - p.y) < p.r + 2) hurtPlayer(1); // stilts and wings keep you out of it
    }
  }
  game.puddles = game.puddles.filter(p => p.life > 0);
}

function drawPuddles(ctx) {
  for (const p of game.puddles) {
    const fade = Math.min(1, p.life / 0.6);
    const r = p.r * (0.6 + 0.4 * Math.min(1, (p.maxLife - p.life) * 6)) * (0.5 + 0.5 * fade);
    const enemy = p.team === 'enemy'; // enemy pools are necrotic rot; yours are bile
    pxCircle(ctx, p.x, p.y, r, enemy ? '#2a0a1a' : '#3a4214');
    pxCircle(ctx, p.x, p.y, r - 2, enemy ? '#4a1030' : '#5e6a1e');
    if (enemy) { // it's dangerous: a seething surface, bubbles swelling and popping
      const seed = (p.x * 7 + p.y * 13) % 17;
      for (let i = 0; i < 4; i++) {
        const ph = (game.time * 1.3 + i * 0.27 + seed * 0.05) % 1, cyc = Math.floor(game.time * 1.3 + i * 0.27 + seed * 0.05);
        const a = hash2(i, cyc, seed) * Math.PI * 2, d = hash2(cyc, i, 7) * r * 0.6;
        const bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d * 0.7;
        if (ph < 0.8) pxRing(ctx, bx, by, 0.5 + ph * 1.6, '#c02040');
        else { ctx.fillStyle = '#ff6080'; ctx.fillRect(Math.round(bx) - 1, Math.round(by), 3, 1); } // pop
      }
      ctx.fillStyle = '#7a1838'; // a slow sheen drifting across it
      const sx = p.x - r * 0.6 + ((game.time * 6 + seed) % (r * 1.2));
      ctx.fillRect(Math.round(sx), Math.round(p.y - r * 0.3), 2, 1);
    }
    // Bubbles
    if (Math.random() < 0.15) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.7;
      ctx.fillStyle = enemy ? '#c02040' : '#b0c040';
      ctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1);
    }
  }
}

// Drawn over the darkness: enemy acid has a pulsing, glowing rim so you can
// see where not to step even outside your light.
function drawPuddleGlow(ctx) {
  for (const p of game.puddles) {
    if (p.team !== 'enemy') continue;
    const fade = Math.min(1, p.life / 0.6), r = p.r * (0.6 + 0.4 * Math.min(1, (p.maxLife - p.life) * 6)) * (0.5 + 0.5 * fade);
    ctx.globalAlpha = (0.35 + 0.3 * Math.sin(game.time * 5 + p.x * 0.1)) * fade;
    pxRing(ctx, p.x, p.y, r, '#ff3a5a');
    ctx.globalAlpha = 1;
  }
}

// --- Particles -----------------------------------------------------------------
function burst(x, y, color, n, speed = 60, life = 0.4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), color, size: Math.random() < 0.3 ? 2 : 1 });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.chunk ? 0.96 : 0.9; // chunks of meat fly further
    p.vx *= drag; p.vy *= drag;
    if (p.chunk && p.fluid) chunkStep(p);
    p.life -= dt;
    if (p.life <= 0 && p.fluid) landParticle(p); // blood stains where it lands
  }
  game.particles = game.particles.filter(p => p.life > 0);
}

// glowing=false: blood & gibs (drawn under the darkness)
// glowing=true:  sparks & flashes (drawn on top so they light up)
function drawParticles(ctx, glowing) {
  for (const p of game.particles) {
    if (!!p.fluid === glowing) continue;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
}

// --- Floating text --------------------------------------------------------------
function floatText(x, y, text, color = PAL.white) {
  game.texts.push({ x, y, text, color, life: 1.2 });
}

function updateTexts(dt) {
  for (const t of game.texts) { t.y -= 14 * dt; t.life -= dt; }
  game.texts = game.texts.filter(t => t.life > 0);
}

function drawTexts(ctx) {
  for (const t of game.texts) {
    if (t.life < 0.3 && Math.floor(t.life * 20) % 2) continue;
    drawText(ctx, t.text, t.x, t.y, t.color, 1, 'center');
  }
}

// --- Pickups ---------------------------------------------------------------------
// kind: 'vial', 'heart' or 'core'. Stored per room so they persist.
// A VIAL is colored by the kind of part it grows: red MOUTH, blue LIMBS,
// yellow HEAD, bone BACK. Picking one up is a free evolution offering only
// that kind (uncommon or better, except the first room's mouth vial).
const VIAL_COLOR = '#c96a8f'; // biomass pink (the HUD, globules)
const VIAL_LOCS = ['MOUTH', 'LIMBS', 'HEAD', 'BACK'];
const VIAL_COLORS = { MOUTH: '#e04848', LIMBS: '#4a8ae0', HEAD: '#e8c020', BACK: '#e0d8b8' };
const vialColor = loc => VIAL_COLORS[loc] || VIAL_COLOR;

function spawnPickup(kind, x, y, extra) {
  const p = Object.assign({ kind, x, y, t: Math.random() * 6, waitForLeave: false }, extra);
  if (kind === 'vial' && !p.loc) p.loc = pick(VIAL_LOCS);
  game.room.pickups.push(p);
  return p;
}

function updatePickups(dt) {
  const pl = game.player;
  for (const p of game.room.pickups) {
    p.t += dt;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (p.waitForLeave) { if (d > 18) p.waitForLeave = false; continue; }
    if (d > 10) continue;
    if (p.kind === 'heart') {
      if (pl.hp < pl.maxHp) {
        pl.hp++;
        p.dead = true;
        floatText(p.x, p.y - 8, '+1 HP', PAL.red);
        Sfx.play('pickup');
      }
    } else if (p.kind === 'core') {
      // A boss's core: eat it. Your body makes room (+1 slot), and the core
      // offers CORE growth (or, if there's none left, makes you tougher).
      p.dead = true;
      bloodSpray(p.x, p.y, 0, 0, 24, FLUID.blood, 130);
      game.shake = Math.max(game.shake, 4);
      Sfx.play('gulp');
      // It always makes you tougher: +1 max health, and it heals you.
      pl.coreBonus = (pl.coreBonus || 0) + 1;
      recomputeStats(pl);
      pl.hp = Math.min(pl.maxHp, pl.hp + 2);
      floatText(pl.x, pl.y - 30, '+1 MAX HP', PAL.red);
      if (pl.capacity < MAX_SLOTS) { pl.capacity++; floatText(pl.x, pl.y - 24, 'YOUR BODY MAKES ROOM', VIAL_COLOR); }
      if (bodyOffers(pl, 'CORE').length) {
        game.pendingEvolutions.push({ slot: 'CORE', title: 'DEVOURED CORE' });
        floatText(pl.x, pl.y - 14, 'YOU DEVOUR ITS CORE', PAL.red);
      }
    } else if (p.kind === 'vial') {
      p.dead = true;
      Sfx.play('gulp');
      floatText(p.x, p.y - 8, p.loc + ' VIAL', vialColor(p.loc));
      game.pendingEvolutions.push({ loc: p.loc, minRarity: p.minRarity === undefined ? 'uncommon' : p.minRarity, plain: !!p.plain, defects: !!p.defects, title: p.loc + ' VIAL', color: vialColor(p.loc) });

    }
  }
  game.room.pickups = game.room.pickups.filter(p => !p.dead);
}

function drawPickups(ctx) {
  for (const p of game.room.pickups) {
    const bob = Math.round(Math.sin(p.t * 4) * 1.5);
    pxCircle(ctx, p.x, p.y + 5, 3, 'rgba(0,0,0,0.35)');
    if (p.kind === 'heart') {
      drawCentered(ctx, SPR.heart, p.x, p.y + bob);
    } else if (p.kind === 'core') {
      // Still beating.
      const beat = Math.floor(p.t * 2.5) % 3 === 0;
      if (beat) pxRing(ctx, p.x, p.y + bob, 10, '#7a1420');
      drawCentered(ctx, beat ? SPR.bossCore2 : SPR.bossCore, p.x, p.y + bob);
    } else {
      if (Math.floor(p.t * 3) % 2) pxRing(ctx, p.x, p.y + bob, 8, vialColor(p.loc));
      drawCentered(ctx, vialSprite(vialColor(p.loc)), p.x, p.y + bob);
    }
  }
}

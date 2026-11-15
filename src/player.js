'use strict';
// ---------------------------------------------------------------------------
// The player: Specimen 47.
// ---------------------------------------------------------------------------

const BASE_HP = 3; // three hits and you're dead

function makePlayer() {
  return {
    x: ROOM_PX_W / 2, y: ROOM_PX_H / 2, r: 5,
    hp: BASE_HP, maxHp: BASE_HP,
    // One mutation per body slot. You're born with a bone spike in your mouth.
    slots: { MOUTH: { id: 'spike', level: 1 }, HEAD: null, BACK: null, LIMBS: null, CORE: null },
    dna: 0, level: 0,
    evolutions: 0, stage: 0,  // how far it has degenerated from its pure form
    stats: baseStats(),
    fireT: 0, dashT: 0, dashCd: 0, dashX: 1, dashY: 0, dashHit: new Set(), inv: 0,
    aimX: 1, aimY: 0, trailT: 0, ghostT: 0, t: 0, moving: false,
    regenT: 0, adrenalT: 0, dripT: 0, chompT: 0,
    lungeT: 0, lungeX: 1, lungeY: 0, hungerT: 0, cancerRooms: 0,
    chargeT: 0, dmgBoost: 1,
    mvx: 0, mvy: 0, hopT: 0, hopAir: 0, hopX: 0, hopY: 0, slimeT: 0, flying: false,
    grappleCd: 0, pullT: 0, pull: null,
    limbWear: 0, withdrawT: 0, withdrawn: false, cocoonT: 0, burrowT: 0, trail: [], held: null,
    controlT: 0, twinDead: false, twinLost: 0, leechHits: 0,
    shieldUp: false, shieldT: 0, secondHeartUsed: false,
  };
}

// Rebuild the stat sheet from scratch from all five slots.
function recomputeStats(p) {
  const s = baseStats();
  for (const slot of SLOTS) if (p.slots[slot]) applyMutation(s, p.slots[slot], p);
  finalizeStats(s);
  p.stats = s;
  p.maxHp = Math.max(1, Math.floor((BASE_HP + s.maxHp) * s.hpMul));
  if (!s.flyover && game.room && circleHitsWall(game.room, p.x, p.y, p.r, false)) {
    const spot = randomFloorSpot(game.room, null, 0);
    p.x = spot.x; p.y = spot.y; // lost your wings over a crate: drop to the floor nearby
  }
  p.hp = Math.min(p.hp, p.maxHp);

  // The body grows more grotesque as it evolves.
  const stage = specimenStage(p);
  if (stage > p.stage && game.room) {
    bloodSpray(p.x, p.y, 0, 0, 30, FLUID.blood, 120);
    gibs(p.x, p.y, 5, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
    floatText(p.x, p.y - 22, 'YOU ARE CHANGING', PAL.red);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('gulp');
  }
  p.stage = stage;
}

// Evolutions needed to reach each stage. Owning anything malignant adds a stage.
const STAGE_AT = [0, 2, 4, 7, 11];
function specimenStage(p) {
  let st = 0;
  STAGE_AT.forEach((n, i) => { if (p.evolutions >= n) st = i; });
  const malignant = SLOTS.some(s => {
    const m = p.slots[s];
    if (!m) return false;
    if (m.parts) return Object.keys(m.parts).some(pt => MUTATIONS[pt].malignant);
    return !!MUTATIONS[m.id].malignant;
  });
  return Math.min(4, st + (malignant ? 1 : 0));
}

// Movement abilities right now. Torn limbs (limb wear) leave you a slug again.
function movement(p) {
  const s = p.stats;
  if (p.limbWear > 0 && p.slots.LIMBS) {
    return { slug: true, speed: 50 * s.speedMul, accel: 0, drag: 0, hop: 0, flyover: false, grapple: 0, hands: false, shell: false, fins: 0, burrow: 0, stilts: false, slime: true };
  }
  return { slug: s.slug, speed: s.speed, accel: s.accel, drag: s.drag, hop: s.hop, flyover: s.flyover, grapple: s.grapple, hands: s.hands, shell: s.shell, fins: s.fins, burrow: s.burrow, stilts: s.stilts, slime: s.slimeTrail };
}

function updatePlayer(dt) {
  const p = game.player, s = p.stats;
  p.t += dt; p.inv -= dt; p.dashCd -= dt; p.fireT -= dt; p.adrenalT -= dt; p.limbWear -= dt;
  const mv = movement(p);

  // --- Movement input (WASD) ---
  let ix = 0, iy = 0;
  if (Input.down('a')) ix--;
  if (Input.down('d')) ix++;
  if (Input.down('w')) iy--;
  if (Input.down('s')) iy++;
  // Parasite Brain: sometimes it drives.
  updateParasite(p, dt);
  if (p.controlT > 0) { ix = p.controlX; iy = p.controlY; }
  const il = Math.hypot(ix, iy);
  if (il) { ix /= il; iy /= il; }
  p.moving = il > 0;

  // --- Aim: arrow keys (Isaac-style) or mouse ---
  let ax = 0, ay = 0, firing;
  if (Input.down('arrowleft')) ax--;
  if (Input.down('arrowright')) ax++;
  if (Input.down('arrowup')) ay--;
  if (Input.down('arrowdown')) ay++;
  if (ax || ay) {
    const l = Math.hypot(ax, ay);
    p.aimX = ax / l; p.aimY = ay / l;
    firing = true;
  } else {
    const dx = Input.mouse.x - p.x, dy = (Input.mouse.y - ROOM_Y) - p.y, l = Math.hypot(dx, dy);
    if (l > 1) { p.aimX = dx / l; p.aimY = dy / l; }
    firing = Input.mouse.down;
  }

  // --- Burrowed underground: nothing else happens until you erupt ---
  if (p.burrowT > 0) { updateBurrow(p, dt, ix, iy); return; }

  // --- Snail shell: hold still to withdraw ---
  if (mv.shell && !p.moving && !firing && p.dashT <= 0) p.withdrawT += dt; else p.withdrawT = 0;
  p.withdrawn = p.withdrawT > 0.25;
  if (p.withdrawn && s.pupa) { // cocoon: slowly heal
    p.cocoonT += dt;
    if (p.cocoonT > 2.5) { p.cocoonT = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
  }

  // --- Dash / charge / burrow ---
  if (Input.hit(' ', 'shift') && p.dashCd <= 0 && !p.withdrawn) {
    p.dashCd = s.dashCd;
    if (s.echo) scream(p);
    if (mv.burrow) { startBurrow(p); return; }
    p.dashT = s.dashTime;
    p.lungeT = 0;
    p.inv = Math.max(p.inv, s.dashTime + 0.06);
    p.dashHit.clear();
    if (il) { p.dashX = ix; p.dashY = iy; } else { p.dashX = p.aimX; p.dashY = p.aimY; }
    Sfx.play('dash');
  }

  // --- Limb ability: right-click (or E) ---
  p.grappleCd -= dt;
  const limbAbility = Input.mouse.rightClicked || Input.hit('e');
  if (limbAbility && mv.hands && !(s.puppeteer && !p.held && mv.grapple && p.grappleCd <= 0)) handAction(p);
  else if (limbAbility && mv.grapple && p.grappleCd <= 0 && p.dashT <= 0) fireGrapple(p);

  p.flying = mv.flyover; // wings carry you over obstacles
  let vx = 0, vy = 0;
  if (p.pullT > 0) {
    // Being yanked along a tentacle.
    p.pullT -= dt;
    const tx = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.x : p.pull.x;
    const ty = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.y : p.pull.y;
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    if (s.pullThrough) chargeHitsWith(p, s.pullDmg * 0.5, dx / d, dy / d);
    const bumped = moveEntity(game.room, p, (dx / d) * 340 * dt, (dy / d) * 340 * dt);
    if (d < (p.pull.enemy ? p.pull.enemy.r + p.r + 2 : 8) || bumped || p.pullT <= 0) endGrapple(p, dx / d, dy / d);
    p.mvx = p.mvy = 0;
  } else if (p.dashT > 0) {
    p.dashT -= dt;
    vx = p.dashX * s.dashSpeed; vy = p.dashY * s.dashSpeed;
    p.mvx = vx * 0.5; p.mvy = vy * 0.5;
    p.ghostT -= dt;
    if (p.ghostT <= 0) {
      p.ghostT = 0.025;
      game.particles.push({ x: p.x - 3, y: p.y - 3, vx: 0, vy: 0, life: 0.12, color: '#5e2229', size: 6 });
    }
    if (s.dashDmg > 0) chargeHits(p);
    if (p.dashT <= 0) {
      if (s.ring > 0) fireRing(p, s.ring);
      if (s.slamDmg > 0) slam(p);
    }
  } else if (p.lungeT > 0) {
    // Feral lunge: a short, savage leap that bites at the end.
    p.lungeT -= dt;
    vx = p.lungeX * 230; vy = p.lungeY * 230;
    if (p.lungeT <= 0) lungeBite(p);
  } else if (!p.withdrawn) {
    const boost = p.adrenalT > 0 ? 1.5 : 1;
    let top = mv.speed * boost;
    // Pseudopods: fast on your own slime and bile, sluggish elsewhere.
    if (mv.fins && (onSlime(p.x, p.y + 3, 6) || inOwnPool(p.x, p.y))) top = mv.fins * s.speedMul * boost;
    // Sticky culture spills (Floor 1) drag at you, unless you fly or walk on stilts.
    if (!mv.flyover && !mv.stilts && onHazard(p.x, p.y + 3, 'sticky')) top *= 0.55;
    if (mv.accel) {
      // Wings / cilia: momentum. You accelerate, drift and overshoot.
      p.mvx += ix * mv.accel * dt; p.mvy += iy * mv.accel * dt;
      p.mvx -= p.mvx * mv.drag * dt; p.mvy -= p.mvy * mv.drag * dt;
      const sp = Math.hypot(p.mvx, p.mvy);
      if (sp > top) { p.mvx *= top / sp; p.mvy *= top / sp; }
      vx = p.mvx; vy = p.mvy;
    } else if (mv.hop) {
      // Hind legs: bursts of hopping.
      p.hopT -= dt;
      if (il && p.hopT <= 0 && p.hopAir <= 0) { p.hopT = mv.hop; p.hopAir = 0.2; p.hopX = ix; p.hopY = iy; }
      if (p.hopAir > 0) {
        p.hopAir -= dt;
        vx = p.hopX * top; vy = p.hopY * top;
        if (p.hopAir <= 0) burst(p.x, p.y + 5, '#3a3230', 4, 30, 0.25); // landing dust
      } else { vx = ix * 18; vy = iy * 18; }
    } else {
      // Legs: snappy. No limbs: a slow, pulsing slug crawl.
      let spd = top;
      if (mv.slug) spd *= 0.7 + 0.55 * Math.max(0, Math.sin(p.t * 7));
      vx = ix * spd; vy = iy * spd;
    }
  }
  if (p.pullT <= 0 && moveEntity(game.room, p, vx * dt, vy * dt) && mv.accel) { p.mvx *= 0.3; p.mvy *= 0.3; }
  updateCentipede(p);

  // Slugs, snails and pseudopods leave a glistening trail of slime.
  if (mv.slime && p.moving && p.dashT <= 0) {
    p.slimeT -= dt;
    if (p.slimeT <= 0) {
      p.slimeT = 0.06;
      stainPx(p.x + rand(-3, 3), p.y + rand(3, 5), ['#2a2e28', '#323630', '#3c4238'], 2);
      addSlime(p.x, p.y + 3);
    }
  }

  // --- Upkeep: shell, regrowth, hunger, bleeding ---
  if (s.shieldCd > 0 && !p.shieldUp) {
    p.shieldT -= dt;
    if (p.shieldT <= 0) { p.shieldUp = true; Sfx.play('shieldUp'); burst(p.x, p.y, '#8a7a5a', 8, 50); }
  }
  if (s.regen > 0) {
    if (p.hp >= p.maxHp) p.regenT = 0;
    else if ((p.regenT += dt) >= s.regen) {
      p.regenT = 0; p.hp++;
      floatText(p.x, p.y - 14, '+1 HP', PAL.red);
    }
  }
  if (s.starve > 0) {
    p.hungerT += dt;
    if (p.hungerT >= s.starve) {
      p.hungerT = s.starve - 10; // keeps hurting every 10s until you eat
      if (p.hp > 1) {
        p.hp--;
        bloodSpray(p.x, p.y, 0, 0, 8, FLUID.blood, 60);
        floatText(p.x, p.y - 14, 'STARVING', COST_COLOR);
        Sfx.play('hurt');
      }
    }
  }
  if (p.hp <= 2) {
    p.dripT -= dt;
    if (p.dripT <= 0) {
      p.dripT = p.hp === 1 ? 0.12 : 0.3;
      stainPx(p.x + rand(-3, 3), p.y + rand(2, 5), FLUID.blood, Math.random() < 0.3 ? 2 : 1);
    }
  }

  // --- Attack (whatever is in your MOUTH). Not while dashing or in your shell. ---
  const canAttack = p.dashT <= 0 && p.lungeT <= 0 && !p.withdrawn;
  if (s.charge && !s.beam) {
    // Dense Marrow: hold to charge, release to blast.
    if (firing && canAttack && p.fireT <= 0) {
      const before = p.chargeT;
      p.chargeT = Math.min(CHARGE_TIME, p.chargeT + dt);
      if (Math.floor(p.chargeT * 8) > Math.floor(before * 8) && p.chargeT < CHARGE_TIME) Sfx.play('charge');
      if (p.chargeT >= CHARGE_TIME && before < CHARGE_TIME) Sfx.play('chargeFull');
    } else if (!firing && p.chargeT > 0) {
      if (p.chargeT > 0.1 && canAttack) {
        releaseCharge(p, p.chargeT / CHARGE_TIME);
        p.fireT = s.fireDelay * 1.1;
      }
      p.chargeT = 0;
    }
  } else if (firing && p.fireT <= 0 && canAttack) {
    p.fireT = s.fireDelay * (s.adrenalRage && p.adrenalT > 0 ? 0.5 : 1);
    attack(p);
  }
}

const CHARGE_TIME = 1.0; // seconds to a full charge

// Releasing a charge: melee hits much harder, ranged weapons fire a blast.
function releaseCharge(p, frac) {
  const s = p.stats;
  p.dmgBoost = 1 + 1.5 * frac;
  if (s.lunge) { p.lungeT = 0.1; p.lungeX = p.aimX; p.lungeY = p.aimY; } // dmgBoost is read when the lunge lands
  if (s.lash) lash(p);
  if (s.bite) bite(p, s.biteDmg);
  if (!s.lunge) p.dmgBoost = 1;
  if (s.spike || s.vomit) blast(p, frac);
  if (frac > 0.95) game.shake = Math.max(game.shake, 4);
  Sfx.play(frac > 0.6 ? 'blast' : 'shoot');
}

// A charged blast of whatever your mouth fires: bone shrapnel, acid
// buckshot, a cluster of spore mortars, a gut-gush...
function blast(p, frac) {
  const s = p.stats, base = Math.atan2(p.aimY, p.aimX);
  const more = s.chargeBonus ? 1.5 : 1;
  if (s.lob) {
    const n = Math.round((2 + 3 * frac) * more);
    for (let i = 0; i < n; i++) lobAt(p, 10 + 22 * frac);
    return;
  }
  const n = Math.round((3 + 7 * frac) * more);
  const dmg = (s.spike ? s.spikeDmg : s.vomitDmg) * (0.6 + 0.3 * frac);
  for (let i = 0; i < n; i++) {
    const a = base + (Math.random() - 0.5) * 0.6, sp = (s.spike ? s.shotSpeed : 160) * rand(0.9, 1.3);
    spawnBullet({
      x: p.x + p.aimX * 5, y: p.y + p.aimY * 5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: Math.max(1.5, s.shotR - 0.5), dmg, life: (s.spike ? Math.max(0.3, s.range) : 0.3) * rand(0.55, 0.85),
      pierce: s.pierce, homing: s.homing * 0.5, split: s.split ? 1 : 0, bleed: s.spikeBleed,
      acid: s.acid && Math.random() < 0.4 ? s.acid * 0.7 : 0,
      knock: 60 + 120 * frac, kind: 'shot', round: s.spit || !s.spike, color: s.spike ? shotColor(s) : '#9aae50',
    });
  }
  // Recoil.
  moveEntity(game.room, p, -p.aimX * 6 * frac, -p.aimY * 6 * frac);
}

// Fire button: every attack part in your mouth acts at once.
function attack(p) {
  const s = p.stats;
  if (s.lunge) { p.lungeT = 0.1; p.lungeX = p.aimX; p.lungeY = p.aimY; }
  if (s.lash) lash(p);
  if (s.bite) bite(p, s.biteDmg);
  if (s.spike) shoot(p);
  if (s.beam) drainBeam(p);
  if (s.vomit) vomit(p);
  // Your twin copies you with a weaker spike of its own.
  const twin = game.allies.find(a => a.kind === 'twin' && !a.dead);
  if (twin && !s.beam) {
    spawnBullet({ x: twin.x, y: twin.y - 2, vx: p.aimX * 150, vy: p.aimY * 150, r: 1.5, dmg: 0.6 * s.damage, life: 0.6, kind: 'shot', color: '#f4c0c4' });
  }
}

// Spikes: bone, or bile for Bile Spit. Mutations tint them.
function shotColor(s) {
  if (s.sporeCloud) return '#7a8a52';
  if (s.pierce) return '#e8a020';  // abyssal
  if (s.spit || s.acid) return '#b0c040';
  if (s.homing) return '#e0d0a0';
  if (s.split) return '#c96a8f';
  return '#cfc4a4';                // plain bone
}

function shoot(p) {
  const s = p.stats;
  if (s.lob) { lobAt(p, s.spread > 0 ? 22 : 0); Sfx.play('splat'); return; } // spore mortar
  const n = s.spikeCount;
  const base = Math.atan2(p.aimY, p.aimX);
  for (let i = 0; i < n; i++) {
    // Streams (bile flamethrower, Twitch Fibers) spray wide and uneven.
    const a = base + (i - (n - 1) / 2) * 0.14 + rand(-s.spread, s.spread);
    const sp = s.shotSpeed * (s.spread ? rand(0.85, 1.15) : 1);
    spawnBullet({
      x: p.x + Math.cos(a) * 5, y: p.y + Math.sin(a) * 5,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: s.shotR, dmg: s.spikeDmg, life: s.range * (s.spread ? rand(0.8, 1.1) : 1), pierce: s.pierce,
      homing: s.homing, split: s.split, bleed: s.spikeBleed, spore: s.sporeCloud,
      acid: s.acidChance && Math.random() > s.acidChance ? 0 : s.acid,
      kind: 'shot', round: s.spit, fade: s.nativeStream, // bile flies as round globs that shrink like flame
      color: shotColor(s),
    });
  }
  Sfx.play(s.nativeStream ? 'spray' : s.spit ? 'splat' : 'shoot');
}

// Spore Cough: lob a spore glob in an arc to where you're aiming. It flies
// over cover and bursts where it lands. `scatter` spreads multiple lobs.
function lobAt(p, scatter) {
  const s = p.stats;
  let tx, ty;
  if (Input.mouse.x || Input.mouse.y) { tx = Input.mouse.x; ty = Input.mouse.y - ROOM_Y; }
  const aimDist = tx === undefined ? 110 : Math.hypot(tx - p.x, ty - p.y);
  const d = clamp(aimDist, 24, 150);
  tx = p.x + p.aimX * d + rand(-scatter, scatter);
  ty = p.y + p.aimY * d + rand(-scatter, scatter);
  tx = clamp(tx, TILE + 6, ROOM_PX_W - TILE - 6); ty = clamp(ty, TILE + 6, ROOM_PX_H - TILE - 6);
  const flight = clamp(Math.hypot(tx - p.x, ty - p.y) / 120, 0.3, 1.1);
  spawnBullet({
    x: p.x, y: p.y, vx: (tx - p.x) / flight, vy: (ty - p.y) / flight, r: s.shotR, life: flight, maxLife: flight,
    dmg: s.spikeDmg, spore: s.sporeCloud, kind: 'lob', color: '#7a8a52',
  });
}

// Proboscis: latch onto the nearest prey in front of you and drain it.
function drainBeam(p) {
  const s = p.stats, range = s.beamRange + s.reach;
  let target = null, best = range;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d < best && (dx * p.aimX + dy * p.aimY) / d > 0.55) { best = d; target = e; }
  }
  if (!target) {
    const c = corpsesNear(p.x, p.y, range, p.aimX, p.aimY, 0.55)[0];
    if (c) { damageCorpse(c, s.beam); game.fx.push({ kind: 'beam', x1: p.x, y1: p.y - 2, x2: c.x, y2: c.y, t: 0.1 }); }
    return;
  }
  damageEnemy(target, s.beam, 0, 0, true);
  if (Math.random() < 0.3) bloodSpray(target.x, target.y, p.x - target.x, p.y - target.y, 2, ENEMY_TYPES[target.type].fluid, 60);
  game.fx.push({ kind: 'beam', x1: p.x, y1: p.y - 2, x2: target.x, y2: target.y, t: 0.1 });
  p.drained = (p.drained || 0) + s.beam;
  if (p.drained >= 12) { p.drained = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
  Sfx.play('beam');
}

// Vomit Stream: a short, wide gush that shoves enemies back.
function vomit(p) {
  const s = p.stats, base = Math.atan2(p.aimY, p.aimX);
  for (let i = 0; i < s.vomit; i++) {
    const a = base + rand(-0.35 - s.spread, 0.35 + s.spread), sp = rand(130, 175);
    spawnBullet({
      x: p.x + p.aimX * 6, y: p.y + p.aimY * 6 - 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 1.5, dmg: s.vomitDmg, life: rand(0.16, 0.26), knock: 150, kind: 'shot', round: true, color: '#9aae50',
      homing: s.homing * 0.5, split: 0, acid: Math.random() < 0.15 ? 7 : 0,
    });
  }
  Sfx.play('splat');
}
// A ring of bone shards around the player.
function fireRing(p, n) {
  const s = p.stats, off = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    spawnBullet({
      x: p.x, y: p.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 1.5,
      kind: 'spine', dmg: 0.8 * s.damage, life: 0.55,
      color: s.ringAcid ? '#b0c040' : PAL.white,
      homing: s.ringHoming, acid: s.ringAcid ? 8 : 0, split: s.ringSplit,
    });
  }
  Sfx.play('spine');
}

// --- Melee ------------------------------------------------------------------------

// Things that happen whenever a melee attack connects.
function meleeHit(p, e, dmg, dx, dy) {
  const s = p.stats;
  dmg *= p.dmgBoost || 1; // charged melee
  damageEnemy(e, dmg, dx, dy, true);
  bloodSpray(e.x, e.y, dx, dy, 8, ENEMY_TYPES[e.type].fluid, 110);
  if (s.split) spawnFragments(e.x, e.y, Math.atan2(dy, dx), s.split, dmg * 0.25, s.homing, 0, e);
}

// Mandibles: bite the nearest enemy in front of you.
function bite(p, dmg) {
  const s = p.stats, reach = s.biteReach;
  let target = null, best = reach;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) - e.r;
    if (d > best) continue;
    if (d > 4 && (dx * p.aimX + dy * p.aimY) / (d + e.r) < 0.3) continue; // must be in front
    best = d; target = e;
  }
  const fx = p.x + p.aimX * 10, fy = p.y + p.aimY * 10;
  if (!target) {
    const c = corpsesNear(p.x, p.y, reach, p.aimX, p.aimY, 0.3)[0];
    if (c) damageCorpse(c, dmg, c.x - p.x, c.y - p.y);
    game.fx.push({ kind: 'bite', x: c ? (p.x + c.x) / 2 : fx, y: c ? (p.y + c.y) / 2 : fy, t: 0.1 });
    Sfx.play('bite');
    return;
  }
  meleeHit(p, target, dmg, target.x - p.x, target.y - p.y);
  if (s.leech && ++p.leechHits >= s.leech) { p.leechHits = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
  if (s.biteAcid) spawnPuddle(target.x, target.y, s.biteAcid, 2, 'player');
  if (s.biteHeal && p.hp < p.maxHp && Math.random() < s.biteHeal) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
  game.fx.push({ kind: 'bite', x: (p.x + target.x) / 2, y: (p.y + target.y) / 2, t: 0.12 });
  Sfx.play('bite');
}

// Tentacles: lash the nearest few enemies in front of you.
function lash(p) {
  const s = p.stats;
  const targets = game.enemies
    .filter(e => {
      if (e.dead || e.spawnT > 0) return false;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      return d < s.lashRange + e.r && (d < 10 || (dx * p.aimX + dy * p.aimY) / d > 0.35);
    })
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    .slice(0, s.lashTargets);
  const spare = s.lashTargets - targets.length;
  if (spare > 0) {
    for (const c of corpsesNear(p.x, p.y, s.lashRange, p.aimX, p.aimY, 0.35).slice(0, spare)) {
      game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: c.x, y2: c.y, t: 0.14 });
      damageCorpse(c, s.lashDmg, c.x - p.x, c.y - p.y);
    }
  }
  if (!targets.length) {
    // A lash at nothing, so the attack still feels responsive.
    game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: p.x + p.aimX * s.lashRange * 0.8, y2: p.y + p.aimY * s.lashRange * 0.8, t: 0.1 });
    Sfx.play('whip');
    return;
  }
  for (const e of targets) {
    game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: e.x, y2: e.y, t: 0.14 });
    meleeHit(p, e, s.lashDmg, e.x - p.x, e.y - p.y);
    if (s.lashBleed) { e.bleedT = 3; e.bleedDps = s.lashBleed; }
    if (s.lashAcid) spawnPuddle(e.x, e.y, s.lashAcid, 2, 'player');
    if (s.pull && !e.dead) {
      // Drag them in toward your jaws.
      const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
      e.kx -= (e.x - p.x) / d * 260; e.ky -= (e.y - p.y) / d * 260;
    }
  }
  Sfx.play('whip');
}

// Feral Lunge: savage everything in a cone in front of you at the end of a leap.
function lungeBite(p) {
  const s = p.stats;
  let hit = 0;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > 20 + e.r + s.reach) continue;
    if (d > 6 && (dx * p.lungeX + dy * p.lungeY) / d < 0.3) continue;
    for (let k = 0; k < (s.doubleBite ? 2 : 1); k++) if (!e.dead) meleeHit(p, e, s.lungeDmg, dx, dy);
    e.kx += p.lungeX * 120; e.ky += p.lungeY * 120;
    if (s.biteHeal && p.hp < p.maxHp && Math.random() < s.biteHeal) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
    hit++;
  }
  for (const c of corpsesNear(p.x, p.y, 20 + s.reach, p.lungeX, p.lungeY, 0.3)) damageCorpse(c, s.lungeDmg, p.lungeX, p.lungeY);
  game.fx.push({ kind: 'bite', x: p.x + p.lungeX * 12, y: p.y + p.lungeY * 12, t: 0.14 });
  if (hit) { game.shake = Math.max(game.shake, 3); Sfx.play('ram'); }
  Sfx.play('bite');
  p.dmgBoost = 1; // a charged lunge only boosts this one landing
}

// --- Tentacle grapple ----------------------------------------------------------------
// Fire a tentacle along your aim. It sticks to the first wall, obstacle or
// enemy it touches, then yanks you there.
function fireGrapple(p) {
  const s = p.stats;
  p.grappleCd = s.grapple;
  let x = p.x, y = p.y, anchor = null, enemy = null;
  for (let d = 6; d <= s.grappleRange; d += 3) {
    x = p.x + p.aimX * d; y = p.y + p.aimY * d;
    enemy = game.enemies.find(e => !e.dead && e.spawnT <= 0 && Math.hypot(e.x - x, e.y - y) < e.r + 2);
    if (enemy) { anchor = [enemy.x, enemy.y]; break; }
    if (pointSolid(game.room, x, y)) { anchor = [x - p.aimX * 4, y - p.aimY * 4]; break; }
  }
  Sfx.play('whip');
  if (!anchor) { // nothing to grab: it flops out and back
    game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: x, y2: y, t: 0.15 });
    return;
  }
  if (enemy && s.puppeteer) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y) || 1;
    enemy.kx += (p.x - enemy.x) / d * 520; enemy.ky += (p.y - enemy.y) / d * 520;
    enemy.grabOnArrive = !enemy.elite && enemy.r <= 6;
    game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: enemy.x, y2: enemy.y, t: 0.2 });
    return;
  }
  p.pull = { x: anchor[0], y: anchor[1], enemy: enemy || null, hit: new Set() };
  p.pullT = 0.6;
  p.dashT = 0; p.lungeT = 0;
  p.inv = Math.max(p.inv, 0.15);
}

function endGrapple(p, dx, dy) {
  const e = p.pull && p.pull.enemy;
  if (e && !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r + 6) {
    damageEnemy(e, p.stats.pullDmg, dx, dy, true);
    e.kx += dx * 160; e.ky += dy * 160;
    bloodSpray(e.x, e.y, dx, dy, 10, ENEMY_TYPES[e.type].fluid, 130);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('ram');
  }
  p.pullT = 0; p.pull = null;
  p.inv = Math.max(p.inv, 0.2);
}

// Silk Tendril: shred everything you're dragged through.
function chargeHitsWith(p, dmg, dx, dy) {
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || p.pull.hit.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r + 3) continue;
    p.pull.hit.add(e);
    damageEnemy(e, dmg, dx, dy, true);
    bloodSpray(e.x, e.y, dx, dy, 8, ENEMY_TYPES[e.type].fluid, 110);
  }
}

// --- Charge -----------------------------------------------------------------------

// While dashing with a charge mutation, ram anything you touch.
function chargeHits(p) {
  const s = p.stats;
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || p.dashHit.has(e)) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r + 3) continue;
    p.dashHit.add(e);
    damageEnemy(e, s.dashDmg, p.dashX * 3, p.dashY * 3, true);
    e.kx += p.dashX * 180; e.ky += p.dashY * 180;
    if (s.bleed > 0) { e.bleedT = 3; e.bleedDps = s.bleed; }
    bloodSpray(e.x, e.y, p.dashX, p.dashY, 10, ENEMY_TYPES[e.type].fluid, 140);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('ram');
    if (e.dead && s.dashReset) { p.dashCd = 0; floatText(p.x, p.y - 14, 'RAMPAGE', '#e8a020'); }
  }
  for (const c of corpsesNear(p.x, p.y, p.r + 2)) if (!p.dashHit.has(c)) { p.dashHit.add(c); damageCorpse(c, s.dashDmg, p.dashX, p.dashY); }
}

function slam(p) {
  const s = p.stats;
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: s.slamR, t: 0.25 });
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < s.slamR + e.r) damageEnemy(e, s.slamDmg, (e.x - p.x) || 1, e.y - p.y, true);
  }
  for (const c of corpsesNear(p.x, p.y, s.slamR)) damageCorpse(c, s.slamDmg, c.x - p.x, c.y - p.y);
  burst(p.x, p.y, '#5e5450', 14, 120, 0.4);
  game.shake = Math.max(game.shake, 5);
  Sfx.play('slam');
}

// --- Getting hurt -------------------------------------------------------------

// Returns true if the hit landed (or was blocked by the shell).
function hurtPlayer(dmg) {
  const p = game.player, s = p.stats;
  if (p.inv > 0 || p.dashT > 0 || p.burrowT > 0 || game.state !== 'play') return false;

  // Withdrawn into your snail shell: nothing gets through.
  if (p.withdrawn) {
    burst(p.x, p.y - 3, '#9a7444', 4, 50);
    Sfx.play('clank');
    return true;
  }
  // Exoskeleton Molt: once per room, slip out of your skin and leave a decoy.
  if (s.molt && !game.room.moltUsed) {
    game.room.moltUsed = true;
    game.decoy = { x: p.x, y: p.y, t: 3, stage: p.stage };
    p.inv = 0.8;
    burst(p.x, p.y, '#8a7a5a', 16, 90);
    floatText(p.x, p.y - 14, 'MOLTED', '#8a7a5a');
    Sfx.play('shield');
    return true;
  }

  if (p.shieldUp) {
    p.shieldUp = false;
    p.shieldT = s.shieldCd;
    p.inv = 0.6;
    burst(p.x, p.y, '#8a7a5a', 14, 90);
    if (s.shieldRing) fireRing(p, s.shieldRing);
    floatText(p.x, p.y - 14, 'BLOCKED', '#8a7a5a');
    Sfx.play('shield');
    return true;
  }

  p.hp -= dmg * s.hitCost; // Hollow Body: every hit costs double
  p.inv = s.invuln;
  if (s.eggsac) { for (let i = 0; i < s.eggsac; i++) spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3)); Sfx.play('hatch'); }
  // Limb wear: the hit tears your limbs; for a moment you're a slug again.
  if (p.slots.LIMBS && p.hp > 0) { p.limbWear = 2.5; p.held && throwHeld(p); floatText(p.x, p.y - 22, 'LIMBS TORN', COST_COLOR); }
  if (s.adrenal) p.adrenalT = s.adrenal;
  game.shake = 5;
  Sfx.play('hurt');
  bloodSpray(p.x, p.y, 0, 0, 16, FLUID.blood, 100);
  stain(p.x, p.y + 3, 2.5, FLUID.blood);
  if (s.ring > 0) fireRing(p, s.ring);
  if (s.toxicBlood > 0) {
    spawnPuddle(p.x, p.y, 20, 2.5, 'player');
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 40) damageEnemy(e, s.toxicBlood, e.x - p.x, e.y - p.y, true);
    }
  }

  if (p.hp <= 0) {
    if (s.secondHeart && !p.secondHeartUsed) {
      p.secondHeartUsed = true;
      // Reborn small and pure: your limbs are gone and the body starts over.
      p.slots.LIMBS = null;
      p.evolutions = 0;
      p.limbWear = 0;
      recomputeStats(p);
      p.hp = 3;
      p.inv = 2;
      gibs(p.x, p.y, 10, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
      game.banner = { text: 'SECOND HEART', sub: 'You are born again.', color: '#e8a020', t: 2.5 };
      Sfx.play('secondHeart');
    } else {
      p.hp = 0;
      gameOver();
    }
  }
  return true;
}

// --- Visual effects for melee (drawn above the darkness) -------------------------
function updateFx(dt) {
  for (const f of game.fx) {
    f.t -= dt;
    if (f.kind === 'ring') f.r += (f.max - f.r) * Math.min(1, dt * 18);
  }
  game.fx = game.fx.filter(f => f.t > 0);
}

function pxLine(ctx, x1, y1, x2, y2, color, w = 1, wiggle = 2) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // A little wave so it looks like a tentacle, not a laser.
    const wob = Math.sin(t * Math.PI) * Math.sin(t * 9 + game.time * 30) * wiggle;
    const nx = -(y2 - y1) / steps, ny = (x2 - x1) / steps;
    ctx.fillRect(Math.round(x1 + (x2 - x1) * t + nx * wob), Math.round(y1 + (y2 - y1) * t + ny * wob), w, w);
  }
}

function drawFx(ctx) {
  for (const f of game.fx) {
    if (f.kind === 'whip') {
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#120a0e', 2);
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#a8534f', 1);
    } else if (f.kind === 'ring') {
      pxRing(ctx, f.x, f.y, f.r, '#9a9284');
      pxRing(ctx, f.x, f.y, f.r - 2, '#5e5450');
    } else if (f.kind === 'slamline') {
      // A huge tendril slamming down along a telegraphed line.
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#2a1c22', 4, 1);
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#b8969a', 2, 1);
    } else if (f.kind === 'beam') {
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#3a0a14', 2);
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, Math.random() < 0.5 ? '#e05070' : '#b01e30', 1);
    } else if (f.kind === 'bite') {
      // Two rows of teeth snapping shut.
      const gap = Math.round(f.t * 30);
      ctx.fillStyle = '#e6dcc0';
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(Math.round(f.x + i * 2), Math.round(f.y - gap - 1), 1, 2);
        ctx.fillRect(Math.round(f.x + i * 2), Math.round(f.y + gap), 1, 2);
      }
    }
  }
}

const OVERLAY_ORDER = ['shell', 'hollow', 'calcified', 'brood', 'eggs', 'pustules', 'moltshell', 'lure', 'ribs', 'bigheart', 'tumor', 'claws', 'scythes', 'leech', 'proboscis', 'sporepods', 'compound', 'echo', 'parasite', 'antennae', 'fangs', 'heart2', 'mitosis', 'chitin', 'twitch', 'tentacles', 'barbs', 'mandibles', 'drool', 'acid', 'thirdeye', 'gorehorns', 'horns', 'eyes', 'spines'];
// Limbs are drawn behind the body.
const BEHIND_ORDER = ['wings', 'tentlimbs', 'hindlegs', 'spiderlegs', 'centlegs', 'cilia', 'fins', 'hands'];
const LIMB_OVERLAYS = new Set(['wings', 'tentlimbs', 'hindlegs', 'spiderlegs', 'centlegs', 'cilia', 'fins', 'hands', 'scythes', 'claws', 'shell']);

function playerOverlays(p) {
  const set = new Set();
  for (const slot of SLOTS) if (p.slots[slot]) for (const ov of mutOverlays(p.slots[slot].id)) set.add(ov);
  return set;
}

// Animation frame for limbs: legs skitter and wings flap.
function limbFrame(p, ov) {
  if (ov === 'spiderlegs' && p.moving && Math.floor(p.t * 14) % 2) return 'spiderlegs2';
  if (ov === 'wings' && Math.floor(p.t * (p.moving ? 18 : 9)) % 2) return 'wings2';
  return ov;
}

function drawPlayer(ctx) {
  const p = game.player, s = p.stats;
  // Burrowed: just a moving mound of dirt.
  if (p.burrowT > 0) {
    pxCircle(ctx, p.x, p.y + 3, 5, '#1e1a18');
    pxCircle(ctx, p.x, p.y + 2, 3.5, '#3a3230');
    return;
  }
  drawCentipede(ctx, p);
  if (p.inv > 0 && p.dashT <= 0 && !p.withdrawn && Math.floor(p.inv * 16) % 2) return;

  // Soft shadow (grows with the body; stays on the floor when you fly)
  const sw = Math.round(7 * STAGE_SCALE[p.stage]);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(Math.round(p.x - sw), Math.round(p.y + 4), sw * 2, 3);
  ctx.fillRect(Math.round(p.x - sw + 2), Math.round(p.y + 3), sw * 2 - 4, 5);

  let bob = 0;
  const mvNow = movement(p);
  if (mvNow.stilts) bob = -6 + (p.moving ? Math.round(Math.sin(p.t * 9)) : 0);  // up on stilts
  else if (mvNow.flyover) bob = -4 + Math.round(Math.sin(p.t * 6) * 1.2);       // hovering
  else if (s.hop && p.hopAir > 0) bob = -Math.round(Math.sin((p.hopAir / 0.2) * Math.PI) * 5); // mid-hop
  else if (p.moving && !s.slug) bob = -Math.round(Math.abs(Math.sin(p.t * 12)));
  const x = p.x, y = p.y - 4 + bob;
  const hurt = p.inv > s.invuln - 0.2;
  const left = p.aimX < 0;
  // A slug inches along: its body stretches and contracts as it crawls.
  const squash = s.slug && p.moving ? Math.floor(p.t * 3.5) % 2 : !p.moving && Math.floor(p.t * 1.6) % 2;
  const st = SPR.stages[p.stage];
  const overlays = playerOverlays(p);
  const ovSet = left ? st.overlay_L : st.overlay;

  // Withdrawn into the shell: only the shell shows.
  if (p.withdrawn) { drawCentered(ctx, ovSet.shell, x, y + 2); return; }
  if (mvNow.stilts) { // long bone legs down to the floor
    for (const lx of [-5, -1, 3, 6]) { pxLine(ctx, x + lx, y + 6, x + lx * 1.3, p.y + 5, '#2e2618', 2, 0); pxLine(ctx, x + lx, y + 6, x + lx * 1.3, p.y + 5, '#c4b898', 1, 0); }
  }
  const limbsOk = !(p.limbWear > 0); // torn limbs aren't drawn
  for (const ov of BEHIND_ORDER) if (overlays.has(ov) && (limbsOk || !LIMB_OVERLAYS.has(ov))) drawCentered(ctx, ovSet[limbFrame(p, ov)], x, y);
  const body = hurt ? st.hurt : st[(squash ? 'body2' : 'body') + (left ? '_L' : '')];
  drawCentered(ctx, body, x, y);
  for (const ov of OVERLAY_ORDER) if (overlays.has(ov) && (limbsOk || !LIMB_OVERLAYS.has(ov))) drawCentered(ctx, ovSet[ov], x, y);
  if (p.limbWear > 0 && p.slots.LIMBS) bloodSpray(p.x, p.y + 2, 0, 0, Math.random() < 0.1 ? 1 : 0, FLUID.blood, 30); // stumps bleed

  // Whatever you're holding in your hands.
  if (p.held) {
    const h = p.held, img = h.kind === 'corpse' ? SPR[h.ref.sprite + '_dead'] : SPR[enemySpriteName(h.ref)];
    if (img) drawCentered(ctx, img, h.ref.x, h.ref.y);
  }

  ctx.fillStyle = PAL.white;
  ctx.fillRect(Math.round(p.x + p.aimX * 11), Math.round(p.y + p.aimY * 11), 1, 1);
}

// Drawn above the darkness: grapple tentacle, shell ring, glowing night eye.
function drawPlayerGlow(ctx) {
  const p = game.player;
  if (game.state !== 'play') return;
  if (p.pullT > 0 && p.pull) {
    const tx = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.x : p.pull.x;
    const ty = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.y : p.pull.y;
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#120a0e', 2);
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#a8534f', 1);
  }
  if (p.shieldUp) pxRing(ctx, p.x, p.y, 9, Math.floor(p.t * 3) % 2 ? '#8a7a5a' : '#5a4a3a');
  if (p.chargeT > 0) {
    // Charging: a ring tightens around you, and flashes when full.
    const k = p.chargeT / CHARGE_TIME;
    const full = k >= 1;
    pxRing(ctx, p.x, p.y - 2, 16 - 8 * k, full ? (Math.floor(p.t * 20) % 2 ? '#ffffff' : '#e8a020') : '#cfc4a4');
    if (Math.random() < k * 0.5) {
      const a = rand(0, Math.PI * 2);
      game.particles.push({ x: p.x + Math.cos(a) * 14, y: p.y - 2 + Math.sin(a) * 14, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.2, color: '#cfc4a4', size: 1 });
    }
  }
  if (p.stats.nightEyes) {
    ctx.fillStyle = '#f0e060';
    // The big eye, wherever it sits at this stage (sprite is drawn centered 4px above p.y).
    const pt = p.stage < 2 ? SPECIMEN.cuteEye : SPECIMEN.eye;
    const [ex, ey] = specimenPoint(p.stage, pt[0], pt[1]);
    const rx = p.aimX < 0 ? (24 - ex) - 12 : ex - 12;
    ctx.fillRect(Math.round(p.x + rx), Math.round(p.y - 4 + ey - 12), 1, 1);
  }
}
// Night Eyes bonus: is this enemy out in the dark?
function nightEyesMul(e) {
  const s = game.player.stats;
  if (!s.nightEyes) return 1;
  return Math.hypot(e.x - game.player.x, e.y - game.player.y) > 45 ? 1 + s.nightEyes : 1;
}

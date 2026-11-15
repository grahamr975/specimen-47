'use strict';
// ---------------------------------------------------------------------------
// The player: Specimen 47.
// ---------------------------------------------------------------------------

const BASE_HP = 3; // three hits and you're dead

function makePlayer() {
  return {
    x: ROOM_PX_W / 2, y: ROOM_PX_H / 2, r: 5,
    hp: BASE_HP, maxHp: BASE_HP,
    // Your parts, one per slot: { id: where it is now, path: [root, branch, branch], loc }.
    // You're born spitting slime; your first MOUTH pick replaces it.
    parts: [{ id: 'slime', path: ['slime'], loc: 'MOUTH', starter: true }], capacity: START_SLOTS,
    limbCd: 0, headCd: 0,
    cd: {}, twinT: 0,         // per-weapon cooldowns (every weapon fires on its own timer)
    moltT: 0, ringT: 0, glareT: 0, frenzyT: 0, ambushT: 0, hitsTaken: 0, setKills: 0, setKey: '', splices: [], armorKills: 0, bloodDna: 0,
    dna: 0, level: 0,
    evolutions: 0, stage: 0,  // how far it has degenerated from its pure form
    stats: baseStats(),
    fireT: 0, dashT: 0, dashCd: 0, dashX: 1, dashY: 0, dashHit: new Set(), inv: 0,
    aimX: 1, aimY: 0, trailT: 0, ghostT: 0, t: 0, moving: false,
    regenT: 0, adrenalT: 0, dripT: 0, chompT: 0,
    lungeT: 0, lungeX: 1, lungeY: 0, hungerT: 0, cancerRooms: 0,
    chargeT: 0, dmgBoost: 1, evolveT: 0, form: null, lastSet: null, gullet: 0, polypKills: 0, venting: false, gasR: 0,
    stillT: 0, rooted: false, guardHits: 0,
    mvx: 0, mvy: 0, hopT: 0, hopAir: 0, hopX: 0, hopY: 0, slimeT: 0, flying: false,
    grappleCd: 0, pullT: 0, pull: null,
    limbWear: 0, withdrawT: 0, withdrawn: false, cocoonT: 0, burrowT: 0, trail: [], held: null,
    controlT: 0, twinDead: false, twinLost: 0, leechHits: 0,
    shieldUp: false, shieldT: 0, secondHeartUsed: false,
  };
}

// Rebuild the stat sheet from scratch from all your parts.
function recomputeStats(p) {
  const s = baseStats();
  for (const m of p.parts) applyMutation(s, m, p);
  if (p.frenzyT > 0 && s.feedFrenzy) s.damageMul *= 1 + s.feedFrenzy; // Feeding Frenzy
  // Set bonus: 3 (or 5) parts of the same set.
  const set = activeSet(p);
  if (set) SETS[set.set].bonus[set.tier].apply(s, p);
  if (p.frenzyT > 0 && s.setKillFrenzy) s.damageMul *= 1.4; // Apex frenzy
  // Splices: parts that have fused (each one frees a slot).
  const splices = activeSplices(p);
  for (const k of splices) SPLICES[k].apply(s, p);
  s.power = bodyPower(p);
  s.damageMul *= s.power; // weak when fresh, strong when fully evolved
  finalizeStats(s);
  for (const k of splices) {
    // The two parts fuse into one: the slot it frees is yours for good (up to the cap).
    if (!(p.splicedEver = p.splicedEver || []).includes(k)) { p.splicedEver.push(k); p.capacity = Math.min(MAX_SLOTS, Math.max(p.capacity, slotsUsed(p)) + 1); }
    if (p.splices.includes(k) || !game.room) continue;
    game.banner = { text: 'SPLICED', sub: SPLICES[k].name + ' - A SLOT FREES UP', color: VIAL_COLOR, t: 2.8 };
    game.fx.push({ kind: 'act', what: 'stitch', x: p.x, y: p.y - 4, t: 0.8, max: 0.8 }); // threads of flesh stitch you together
    whisper(SPLICES[k].whisper);
    bloodSpray(p.x, p.y, 0, 0, 20, FLUID.blood, 120);
    burst(p.x, p.y, VIAL_COLOR, 24, 110, 0.8);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('splice');
  }
  p.splices = splices;
  const key = set ? set.set + set.tier : '';
  if (key !== (p.setKey || '')) {
    if (set && game.room) {
      const S = SETS[set.set], b = S.bonus[set.tier];
      game.banner = { text: (set.tier ? 'FULL SET: ' : 'SET: ') + S.name, sub: b.name, color: S.color, t: 2.6 };
      whisper(S.whisper[set.tier]);
      burst(p.x, p.y, S.color, 30, 120, 0.8);
      Sfx.play('splice');
    } else if (p.setKey && game.room) floatText(p.x, p.y - 24, 'SET BROKEN', PAL.slate);
    p.setKey = key;
  }
  p.stats = s;
  p.maxHp = Math.max(1, Math.floor((BASE_HP + s.maxHp + (p.coreBonus || 0)) * s.hpMul));
  if (!s.flyover && game.room && circleHitsWall(game.room, p.x, p.y, p.r, false)) {
    const spot = randomFloorSpot(game.room, null, 0);
    p.x = spot.x; p.y = spot.y; // lost your wings over a crate: drop to the floor nearby
  }
  p.hp = Math.min(p.hp, p.maxHp);

  // The body grows more grotesque as it evolves.
  const stage = specimenStage(p), form = specimenForm(p, stage);
  if ((stage > p.stage || form !== p.form) && game.room) {
    bloodSpray(p.x, p.y, 0, 0, 30, FLUID.blood, 120);
    gibs(p.x, p.y, 5, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
    floatText(p.x, p.y - 22, 'YOU ARE CHANGING', PAL.red);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('gulp');
  }
  p.stage = stage;
  p.form = form;
  p.tint = bodyTint(p);
}

// Your coloration. Averaging colors turns everything brown, so instead the
// body is TWO-TONE: a main color (your strongest, most vivid tint) and an
// accent along the back (the next tint whose hue is clearly different).
// Dark parts darken the whole body. Pale tints (bone, hide) only win when
// nothing more colorful is there.
function bodyTint(p) {
  const all = [];
  for (const m of p.parts) {
    if (m.starter) continue;
    for (const id of m.path) if (TINTS[id]) all.push(TINTS[id]);
  }
  if (!all.length) return null;
  const hsl = hex => {
    const c = parseInt(hex.slice(1), 16), r = (c >> 16 & 255) / 255, g = (c >> 8 & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60 < 0 ? h * 60 + 360 : h * 60, s, l];
  };
  const ranked = all.map(t => ({ color: t[0], amt: t[1], dark: t[2] || 0, hsl: hsl(t[0]) }))
    .map(t => ({ ...t, score: t.amt * (0.35 + t.hsl[1]) }))
    .sort((a, b) => b.score - a.score);
  const main = ranked[0];
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const accent = ranked.slice(1).find(t => t.hsl[1] > 0.25 && hueGap(t.hsl[0], main.hsl[0]) > 45);
  const dark = Math.max(...ranked.map(t => t.dark));
  const tint = { color: main.color, amt: Math.min(0.7, main.amt), dark };
  if (accent) { tint.accent = accent.color; tint.accentAmt = Math.min(0.9, accent.amt + 0.35); }
  tint.key = [tint.color, tint.amt, dark, tint.accent || '', tint.accentAmt || 0].join('|');
  return tint;
}

// Which creature your body has become: the set most of your parts share
// (at least 2), once you've started to degenerate. Ties go to the set you grew
// most recently. null = still the slug.
function specimenForm(p, stage) {
  if (stage < 1) return null;
  const n = setCounts(p);
  let best = null;
  for (const k in n) {
    if (n[k] < 2) continue;
    if (!best || n[k] > n[best] || (n[k] === n[best] && k === p.lastSet)) best = k;
  }
  return best;
}

// The body frames to draw right now.
function bodyFrames(p) {
  return p.form ? SPR.forms[p.form][p.stage] : SPR.stages[p.stage];
}

// Evolutions needed to reach each stage. Owning anything malignant adds a stage.
const STAGE_AT = [0, 2, 4, 7, 11];
function specimenStage(p) {
  let st = 0;
  STAGE_AT.forEach((n, i) => { if (p.evolutions >= n) st = i; });
  const malignant = p.parts.some(slotMalignant);
  return Math.min(4, st + (malignant ? 1 : 0));
}

// Movement abilities right now. Torn limbs (limb wear) leave you a slug again.
function movement(p) {
  const s = p.stats;
  if (p.limbWear > 0 && partAt(p, 'LIMBS')) {
    return { slug: true, speed: SLUG_SPEED * s.speedMul, accel: 0, drag: 0, hop: 0, flyover: false, grapple: 0, hands: false, shell: false, fins: 0, burrow: 0, stilts: false, slime: true };
  }
  return { slug: s.slug, speed: s.speed, accel: s.accel, drag: s.drag, hop: s.hop, flyover: s.flyover, grapple: s.grapple, hands: s.hands, shell: s.shell, fins: s.fins, burrow: s.burrow, stilts: s.stilts, slime: s.slimeTrail };
}

function updatePlayer(dt) {
  const p = game.player, s = p.stats;
  p.t += dt; p.inv -= dt; p.dashCd -= dt; p.fireT -= dt; p.adrenalT -= dt; p.limbWear -= dt; p.twinT -= dt; p.ambushT -= dt;
  for (const k in p.cd) p.cd[k] -= dt;
  if (p.frenzyT > 0 && (p.frenzyT -= dt) <= 0) recomputeStats(p); // a frenzy wears off
  if (s.setSporeAura && game.room.locked && (p.sporeT = (p.sporeT || s.setSporeAura) - dt) <= 0) { p.sporeT = s.setSporeAura; spawnCloud(p.x, p.y, 24); } // Fruiting Body
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
  p.inX = ix; p.inY = iy; // (a boss lair's door checks you're walking into it)

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
  p.venting = !!(s.miasma && firing && !p.withdrawn); // Miasma: hold fire to vent
  // Berserker Host: while the parasite drives, it hunts the nearest enemy for you.
  if (s.parasiteFrenzy && p.controlT > 0) {
    const prey = nearestEnemy(p.x, p.y, 200);
    if (prey) { const d = Math.hypot(prey.x - p.x, prey.y - p.y) || 1; p.aimX = (prey.x - p.x) / d; p.aimY = (prey.y - p.y) / d; firing = true; }
  }

  // --- Burrowed underground: nothing else happens until you erupt ---
  if (p.burrowT > 0) { updateBurrow(p, dt, ix, iy); return; }

  // --- Cocooning to evolve: hold F, helpless, until it splits ---
  if (updateCocoon(p, dt)) return;

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
    // Huntsman: the pounce leaps straight at the nearest prey.
    const prey = s.homingPounce && nearestEnemy(p.x, p.y, 130);
    if (prey) { const d = Math.hypot(prey.x - p.x, prey.y - p.y) || 1; p.dashX = (prey.x - p.x) / d; p.dashY = (prey.y - p.y) / d; }
    if (s.dashReload) p.cd = {}; // Jitter: every dash reloads every weapon
    Sfx.play('dash');
  }

  // --- Limb ability: right-click (or E) ---
  p.grappleCd -= dt;
  const limbAbility = Input.mouse.rightClicked || Input.hit('e');
  if (limbAbility && mv.hands && !(s.puppeteer && !p.held && mv.grapple && p.grappleCd <= 0)) handAction(p);
  else if (limbAbility && mv.grapple && p.grappleCd <= 0 && p.dashT <= 0 && !p.grappleShot) fireGrapple(p);
  else if (limbAbility && !mv.grapple && !mv.hands) tryActive(p, 'limb');
  // --- Head ability: Q ---
  if (Input.hit('q')) tryActive(p, 'head');
  updateActives(p, dt);
  updateGrappleShot(p, dt);
  updateTongue(p, dt);
  if (p.eatT > 0) p.eatT -= dt;

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
    if (s.boneSaw && (p.sawT = (p.sawT || 0) - dt) <= 0) { // Bone Saw
      p.sawT = 0.03;
      for (const side of [-1, 1]) spawnBullet({ x: p.x, y: p.y, vx: -p.dashY * side * 170 - p.dashX * 30, vy: p.dashX * side * 170 - p.dashY * 30, r: 1.5, kind: 'spine', dmg: 0.7 * s.damage, life: 0.35, color: PAL.white });
    }
    if (p.dashT <= 0) {
      if (s.ring > 0) fireRing(p, s.ring);
      if (s.slamDmg > 0) slam(p);
      if (s.diveBomb) diveBomb(p);
    }
  } else if (p.lungeT > 0) {
    // Feral lunge: a short, savage leap that bites at the end.
    p.lungeT -= dt;
    vx = p.lungeX * 230; vy = p.lungeY * 230;
    if (p.lungeT <= 0) lungeBite(p);
  } else if (!p.withdrawn) {
    const boost = p.adrenalT > 0 ? 1.5 : 1;
    let top = mv.speed * boost;
    if (p.venting) top *= 0.6;                          // venting Miasma slows you
    if (s.webLair && game.webs.length && onWeb(p.x, p.y)) top *= 1.4; // Spider's Lair
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
        if (p.hopAir <= 0) landing(p, 0.5); // squash, dust, thump
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
  updateBranchUpkeep(p, dt);
  updateSpiderLegs(p, dt);
  updateBodyFx(p, dt);

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

  // --- Attack (everything in your MOUTH). Not while dashing or in your shell. ---
  const canAttack = p.dashT <= 0 && p.lungeT <= 0 && !p.withdrawn && p.fireT <= 0;
  if (s.charge) {
    // Hold to charge, release to blast with everything at once.
    if (firing && canAttack) {
      const before = p.chargeT;
      p.chargeT = Math.min(CHARGE_TIME, p.chargeT + dt * (s.chargeSpeed || 1));
      if (Math.floor(p.chargeT * 8) > Math.floor(before * 8) && p.chargeT < CHARGE_TIME) Sfx.play('charge');
      if (p.chargeT >= CHARGE_TIME && before < CHARGE_TIME) Sfx.play('chargeFull');
      if (s.beam) fireWeapons(p, ['beam']); // the proboscis keeps draining while you charge
    } else if (!firing && p.chargeT > 0) {
      if (p.chargeT > 0.1 && canAttack) { releaseCharge(p, p.chargeT / CHARGE_TIME); p.fireT = 0.3; }
      p.chargeT = 0;
    }
  } else if (firing && canAttack) {
    fireWeapons(p);
  }
}

const CHARGE_TIME = 1.0; // seconds to a full charge

// Hitstop: freeze the action for a split second on a heavy hit, so it lands.
function hitstop(t) {
  game.hitstop = Math.min(0.08, Math.max(game.hitstop || 0, t));
}

// --- Cocoon: how you evolve ---------------------------------------------------------
// DNA banks during a fight. Once the room is clear (doors open), a full bar
// (or a mutagen vial, or a boss core) wraps you in a cocoon by itself; it
// splits and the cards appear. Never during combat. If you put an evolution
// off (Esc on the cards), hold F in any cleared room to cocoon when you like.
// Getting hit tears the cocoon. Returns true while you're inside it.
const COCOON_TIME = 1.0;
const COCOON_WAIT = 0.6; // a beat after the room clears before it starts
function updateCocoon(p, dt) {
  const can = evolveReady(p) && !game.room.locked && p.dashT <= 0 && p.pullT <= 0 && p.lungeT <= 0 && !p.withdrawn && !p.tongue && safeToCocoon(p);
  const auto = can && p.snoozeRoom !== game.room;
  if (auto && p.evolveT === 0) { // let the room settle a moment first
    p.cocoonWait = (p.cocoonWait || 0) + dt;
    if (p.cocoonWait < COCOON_WAIT && !Input.down('f')) return false;
  }
  if (!can) p.cocoonWait = 0;
  if (!(can && (auto || Input.down('f')))) {
    if (p.evolveT > 0) {
      if (p.evolveT > 0.3) { burst(p.x, p.y - 3, '#c8b4a0', 8, 50); floatText(p.x, p.y - 18, 'TORN', PAL.slate); }
      p.evolveT = 0;
    }
    return false;
  }
  const before = p.evolveT;
  p.evolveT += dt;
  p.chargeT = 0; p.mvx = p.mvy = 0;
  if (p.held) throwHeld(p);
  // Wet, wrapping sounds, then a heartbeat that quickens.
  if (before === 0) Sfx.play('gulp');
  const beat = p.evolveT > COCOON_TIME * 0.6 ? 0.25 : 0.45;
  if (Math.floor(p.evolveT / beat) > Math.floor(before / beat)) { Sfx.play('heartbeat'); game.shake = Math.max(game.shake, 1 + 2 * p.evolveT / COCOON_TIME); }
  if (Math.random() < dt * 10) stainPx(p.x + rand(-5, 5), p.y + rand(3, 6), ['#c8b4a0', '#8a6a5a', '#5e2229'], 1);
  if (p.evolveT >= COCOON_TIME) {
    // It splits open. Evolve!
    p.evolveT = 0; p.cocoonWait = 0;
    game.evolving = true;
    bloodSpray(p.x, p.y, 0, 0, 24, FLUID.blood, 120);
    gibs(p.x, p.y, 6, ['#c8b4a0', '#a8907e', '#5e2229'], FLUID.blood);
    game.shake = Math.max(game.shake, 5);
    Sfx.play('hatch');
  }
  return true;
}

// Never wrap up somewhere that hurts (enemy acid).
function safeToCocoon(p) {
  return p.stats.stilts || !game.puddles.some(pd => pd.team !== 'player' && Math.hypot(p.x - pd.x, p.y - pd.y) < pd.r + 4);
}

// Out of the cocoon after the last card: shed the husk.
function emergeFromCocoon(p) {
  burst(p.x, p.y, '#c8b4a0', 16, 90, 0.5);
  for (let i = 0; i < 12; i++) stainPx(p.x + rand(-6, 6), p.y + rand(1, 6), ['#3a2e28', '#4a3a30', '#8a6a5a'], 2);
  p.inv = Math.max(p.inv, 0.8); // a moment to get your bearings
}

// How much faster you attack right now (Blood Rage, Slipstream, the Berserker Host).
function attackRate(p) {
  const s = p.stats;
  let rate = 1;
  if (s.adrenalRage && p.adrenalT > 0) rate *= 0.5;
  if (s.parasiteFrenzy && p.controlT > 0) rate *= 0.5;
  if (s.slimeRate && (onSlime(p.x, p.y + 3, 6) || inOwnPool(p.x, p.y))) rate *= s.slimeRate;
  if (p.rooted) rate *= s.rootLegs.rate; // Root Legs
  return rate;
}

// Ambush: the first attack after erupting from the ground hits three times as hard.
function takeAmbush(p) {
  if (!(p.ambushT > 0)) return 1;
  p.ambushT = 0;
  floatText(p.x, p.y - 14, 'AMBUSH', '#e8a020');
  return 3;
}

// Every weapon in your mouth fires on its own timer, so they all stack:
// a slow bone spike never holds back a quick bite.
function fireWeapons(p, only) {
  const s = p.stats, cd = p.cd, rate = attackRate(p);
  const ready = (k, delay) => {
    if (only && !only.includes(k)) return false;
    if ((cd[k] || 0) > 0) return false;
    cd[k] = delay * rate;
    return true;
  };
  let fired = false, mul = 1;
  const boost = () => { if (!fired) mul = takeAmbush(p); fired = true; };
  s.guns.forEach((g, i) => { if (ready('gun' + i, g.delay)) { boost(); fireGun(p, g, mul); } });
  if (s.lunge && ready('lunge', s.lungeDelay)) { boost(); p.dmgBoost = mul; p.lungeT = 0.1; p.lungeX = p.aimX; p.lungeY = p.aimY; }
  if (s.lash && ready('lash', s.lashDelay)) { boost(); p.dmgBoost = mul; lash(p); }
  if (s.bite && ready('bite', s.biteDelay)) { boost(); p.dmgBoost = mul; bite(p, s.biteDmg); }
  if (!s.lunge) p.dmgBoost = 1;
  if (s.beam && ready('beam', 0.1)) drainBeam(p);
  if (s.vomit && ready('vomit', s.vomitDelay)) { boost(); vomit(p); }
  if (s.ovi && ready('ovi', s.ovi.delay)) { boost(); fireLarva(p, mul); }
  if (s.howl && ready('howl', s.howl.delay)) { boost(); howl(p, mul); }
  if (s.polyp && ready('polyp', s.polyp.delay)) { boost(); plantPolyp(p); }
  if (s.tongue && ready('tongue', s.tongue.delay)) { boost(); tongueAttack(p, mul); }
  if (s.silk && ready('silk', s.silk.delay)) { boost(); spinWeb(p); }
  if (fired) twinCopy(p);
}

// Your twin copies you with a spike of its own (at most a few a second).
function twinCopy(p) {
  const twin = game.allies.find(a => a.kind === 'twin' && !a.dead);
  if (!twin || p.twinT > 0) return;
  p.twinT = 0.35;
  spawnBullet({ x: twin.x, y: twin.y - 2, vx: p.aimX * 150, vy: p.aimY * 150, r: 1.5, dmg: 0.6 * (p.stats.twinMul || 1) * p.stats.damage, life: 0.6, kind: 'shot', color: '#f4c0c4' });
}

// Releasing a charge: melee hits much harder, every ranged weapon fires a blast.
function releaseCharge(p, frac) {
  const s = p.stats;
  p.dmgBoost = (1 + 1.5 * frac) * takeAmbush(p);
  if (s.lunge) { p.lungeT = 0.1; p.lungeX = p.aimX; p.lungeY = p.aimY; } // dmgBoost is read when the lunge lands
  if (s.lash) lash(p);
  if (s.bite) bite(p, s.biteDmg);
  const mul = p.dmgBoost / (1 + 1.5 * frac);
  if (!s.lunge) p.dmgBoost = 1;
  for (const g of s.guns) blast(p, frac, g, mul);
  if (s.vomit) blast(p, frac, { id: 'vomit', dmg: s.vomitDmg, speed: 160, range: 0.3, r: 1.5, round: true, color: '#9aae50', acid: 0, bleed: 0 }, mul);
  if (s.ovi) for (let i = 0; i < 1 + Math.round(2 * frac); i++) fireLarva(p, mul, 0.3 * i);
  if (s.howl) howl(p, mul * (1 + frac));
  if (s.polyp) plantPolyp(p);
  if (s.tongue) tongueAttack(p, mul * (1 + frac));
  if (s.silk) spinWeb(p);
  // Overcharge: a full charge bursts out of you as a shard ring too.
  if (s.chargeRing && frac > 0.95) fireRing(p, s.chargeRing);
  if (frac > 0.95) game.shake = Math.max(game.shake, 4);
  if (frac > 0.5) hitstop(0.05 * frac);
  // Every weapon reloads after a blast.
  s.guns.forEach((g, i) => { p.cd['gun' + i] = g.delay; });
  Sfx.play(frac > 0.6 ? 'blast' : 'shoot');
  twinCopy(p);
}

// A charged blast of one weapon: bone shrapnel, acid buckshot, a cluster of
// spore mortars, a gut-gush...
function blast(p, frac, g, mul = 1) {
  const s = p.stats, base = Math.atan2(p.aimY, p.aimX);
  const more = s.chargeBonus ? 1.5 : 1;
  if (g.lob) {
    const n = Math.round((2 + 3 * frac) * more);
    for (let i = 0; i < n; i++) lobAt(p, g, 10 + 22 * frac, mul);
    return;
  }
  const n = Math.round((3 + 7 * frac) * more);
  for (let i = 0; i < n; i++) {
    const a = base + (Math.random() - 0.5) * 0.6, sp = g.speed * rand(0.9, 1.3);
    spawnBullet({
      x: p.x + p.aimX * 5, y: p.y + p.aimY * 5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: Math.max(1.5, g.r - 0.5), dmg: g.dmg * (0.6 + 0.3 * frac) * mul, life: Math.max(0.3, g.range) * rand(0.55, 0.85),
      pierce: s.pierce, homing: s.homing * 0.5, split: s.blastSplit || (s.split ? 1 : 0), bleed: g.bleed,
      acid: g.acid && Math.random() < 0.4 ? g.acid * 0.7 : 0, venom: g.id === 'spike' && s.venomSpike,
      flame: g.id === 'bile' && s.sporeFire, knock: 20 + 45 * frac, kind: 'shot', round: g.round, color: shotColor(s, g),
    });
  }
  // Recoil.
  moveEntity(game.room, p, -p.aimX * 9 * frac, -p.aimY * 9 * frac);
}

// Bone spikes are tinted by what's modifying them; other weapons keep their color.
function shotColor(s, g) {
  if (g.id !== 'spike') return g.color;
  if (s.venomBarrage) return '#9ac030';
  if (s.venomSpike) return '#b0c040';
  if (s.pierce) return '#e8a020';  // abyssal / lance
  if (s.homing) return '#e0d0a0';
  if (s.split) return '#c96a8f';
  return g.color;                  // plain bone
}

function fireGun(p, g, mul = 1) {
  const s = p.stats;
  if (g.lob) { lobAt(p, g, g.spread > 0 ? 22 : 0, mul); Sfx.play(g.sound); return; } // spore mortar
  const base = Math.atan2(p.aimY, p.aimX);
  for (let i = 0; i < g.count; i++) {
    // Streams (bile flamethrower, Stream Fibers) spray wide and uneven.
    const a = base + (i - (g.count - 1) / 2) * 0.14 + rand(-g.spread, g.spread);
    const sp = g.speed * (g.spread ? rand(0.85, 1.15) : 1);
    spawnBullet({
      x: p.x + Math.cos(a) * 5, y: p.y + Math.sin(a) * 5,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: g.r, dmg: g.dmg * mul, life: g.range * (g.spread ? rand(0.8, 1.1) : 1), pierce: s.pierce,
      homing: s.homing, split: s.split, bleed: g.bleed, slow: g.slow,
      acid: g.acidChance && Math.random() > g.acidChance ? 0 : g.acid,
      venom: g.id === 'spike' && s.venomSpike,      // Venom Lance: drips bile as it flies
      venomBurst: g.id === 'spike' && s.venomBarrage, // Venom Barrage: bursts into bile
      flame: g.id === 'bile' && s.sporeFire,        // Spore Fire: the flame ignites spore clouds
      kind: 'shot', round: g.round, fade: g.fade, color: shotColor(s, g),
    });
  }
  Sfx.play(g.sound);
}

// Spore Cough: lob a spore glob in an arc to where you're aiming. It flies
// over cover and bursts where it lands. `scatter` spreads multiple lobs.
function lobAt(p, g, scatter, mul = 1) {
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
    x: p.x, y: p.y, vx: (tx - p.x) / flight, vy: (ty - p.y) / flight, r: g.r, life: flight, maxLife: flight,
    dmg: g.dmg * mul, spore: g.cloud * (s.cloudMul || 1), lobAcid: s.lobAcid || 0, kind: 'lob', color: g.color,
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
    else if (strikeSeal(p.x + p.aimX * range * 0.5, p.y + p.aimY * range * 0.5, range * 0.5)) game.fx.push({ kind: 'beam', x1: p.x, y1: p.y - 2, x2: p.x + p.aimX * 18, y2: p.y + p.aimY * 18, t: 0.1 });
    return;
  }
  drainOne(p, target, s.beam, p.x, p.y - 2);
  // Siphon: the beam forks into a second victim.
  if (s.beamChain && !target.dead) {
    const next = game.enemies.find(o => o !== target && !o.dead && o.spawnT <= 0 && Math.hypot(o.x - target.x, o.y - target.y) < 40);
    if (next) drainOne(p, next, s.beam * 0.7, target.x, target.y);
  }
  Sfx.play('beam');
}

function drainOne(p, target, dmg, fromX, fromY) {
  const s = p.stats;
  damageEnemy(target, dmg, 0, 0, true);
  if (s.beamBleed) { target.bleedT = 2; target.bleedDps = Math.max(target.bleedDps || 0, s.beamBleed); }
  if (Math.random() < 0.3) bloodSpray(target.x, target.y, p.x - target.x, p.y - target.y, 2, ENEMY_TYPES[target.type].fluid, 60);
  game.fx.push({ kind: 'beam', x1: fromX, y1: fromY, x2: target.x, y2: target.y, t: 0.1 });
  p.drained = (p.drained || 0) + dmg;
  if (s.drainDna && (p.bloodDna += dmg) >= s.drainDna) { p.bloodDna = 0; gainDna(1); floatText(p.x, p.y - 22, '+BIOMASS', VIAL_COLOR); } // Blood Pump
  if (p.drained >= (s.drainHeal || 12)) { p.drained = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
  // Bloat: drained to death, it bursts.
  if (target.dead && s.drainBurst) {
    bloodSpray(target.x, target.y, 0, 0, 30, ENEMY_TYPES[target.type].fluid, 160);
    for (const e of game.enemies) if (!e.dead && e.spawnT <= 0 && Math.hypot(e.x - target.x, e.y - target.y) < 30 + e.r) damageEnemy(e, 3 * s.damage, e.x - target.x, e.y - target.y, true);
    if (s.burstSpores) spawnCloud(target.x, target.y, 26);
    game.shake = Math.max(game.shake, 3);
  }
}

// Vomit Stream: a short, wide gush that shoves enemies back.
function vomit(p) {
  const s = p.stats, base = Math.atan2(p.aimY, p.aimX);
  for (let i = 0; i < s.vomit; i++) {
    const a = base + rand(-0.35, 0.35), sp = rand(130, 175);
    spawnBullet({
      x: p.x + p.aimX * 6, y: p.y + p.aimY * 6 - 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 1.5, dmg: s.vomitDmg, life: rand(0.16, 0.26), knock: 150, kind: 'shot', round: true, color: '#9aae50',
      homing: s.homing * 0.5, split: 0, acid: Math.random() < 0.25 ? 7 : 0,
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
  // Melee shoves much harder than shots, but keeps prey just inside your reach.
  damageEnemy(e, dmg, dx, dy, true, 50 + dmg * 12);
  hitstop(0.02 + Math.min(0.04, dmg * 0.003));
  if (s.stunChance && !e.dead && Math.random() < s.stunChance) e.stunT = Math.max(e.stunT || 0, 0.8);
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
    else strikeSeal(p.x + p.aimX * reach * 0.6, p.y + p.aimY * reach * 0.6, reach * 0.6);
    game.fx.push({ kind: 'bite', x: c ? (p.x + c.x) / 2 : fx, y: c ? (p.y + c.y) / 2 : fy, t: 0.1 });
    Sfx.play('bite');
    return;
  }
  if (s.meltBite && inOwnPool(target.x, target.y)) { dmg *= 3; floatText(target.x, target.y - 10, 'MELT', '#b0c040'); }
  const bleeding = target.bleedT > 0;
  // Devour: a badly wounded enemy is swallowed whole.
  if (s.devour && !ENEMY_TYPES[target.type].boss && target.hp <= target.maxHp * s.devour) {
    floatText(target.x, target.y - 10, 'DEVOURED', PAL.red);
    dmg = target.hp + 1;
  }
  meleeHit(p, target, dmg, target.x - p.x, target.y - p.y);
  if (s.boneJaws) {
    // Bone Jaws: a spike bursts out through the back of the victim.
    const d = Math.hypot(target.x - p.x, target.y - p.y) || 1, ux = (target.x - p.x) / d, uy = (target.y - p.y) / d;
    spawnBullet({ x: target.x + ux * 4, y: target.y + uy * 4, vx: ux * 190, vy: uy * 190, r: 2, dmg: dmg * 0.8, life: 0.5, pierce: 1, kind: 'shot', color: '#cfc4a4', hitSet: new Set([target]) });
  }
  if (s.acidMaw) target.acidMarked = true; // Acid Maw: it bursts into bile when it dies
  if (s.bleedFeed && bleeding && p.hp < p.maxHp && Math.random() < s.bleedFeed) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
  if (s.leech && ++p.leechHits >= s.leech) { p.leechHits = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
  if (s.biteAcid) spawnPuddle(target.x, target.y, s.biteAcid, 2, 'player');
  if (s.biteHeal && p.hp < p.maxHp && Math.random() < s.biteHeal) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
  game.fx.push({ kind: 'bite', x: (p.x + target.x) / 2, y: (p.y + target.y) / 2, t: 0.12 });
  Sfx.play('bite');
}

// Tentacles: lash the nearest few enemies in front of you.
// Tendrils: lash the nearest few enemies in front of you. Each lash takes
// time to reach its target (see updateWhips); it hits when the tip arrives.
const LASH_SPEED = 520;
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
  const boost = p.dmgBoost || 1;
  const send = (tx, ty, target, corpse) => game.whips.push({ tx, ty, target, corpse, len: 0, out: true, boost });
  const spare = s.lashTargets - targets.length;
  if (spare > 0) for (const c of corpsesNear(p.x, p.y, s.lashRange, p.aimX, p.aimY, 0.35).slice(0, spare)) send(c.x, c.y, null, c);
  for (const e of targets) send(e.x, e.y, e, null);
  if (!targets.length) { // a lash at nothing: it cracks against the first wall (or sealed door) in the way
    let reach = s.lashRange * 0.8;
    for (let d = 6; d < reach; d += 3) if (pointSolid(game.room, p.x + p.aimX * d, p.y + p.aimY * d)) { reach = d; break; }
    send(p.x + p.aimX * reach, p.y + p.aimY * reach, null, null);
  }
  Sfx.play('whip');
}

function updateWhips(dt) {
  const p = game.player;
  for (const w of game.whips) {
    if (w.target && !w.target.dead) { w.tx = w.target.x; w.ty = w.target.y; } // the tip follows its prey
    const dist = Math.hypot(w.tx - p.x, w.ty - p.y);
    if (w.out) {
      w.len += LASH_SPEED * dt;
      if (w.len >= dist) { w.len = dist; w.out = false; whipLands(p, w); }
    } else if ((w.len -= LASH_SPEED * 1.4 * dt) <= 0) w.done = true;
  }
  game.whips = game.whips.filter(w => !w.done);
}

function whipLands(p, w) {
  const s = p.stats;
  if (w.target && !w.target.dead) {
    const keep = p.dmgBoost; p.dmgBoost = w.boost; // a charged lash keeps its charge in flight
    lashHit(p, w.target);
    p.dmgBoost = keep;
  } else if (w.corpse && !w.corpse.dead) damageCorpse(w.corpse, s.lashDmg, w.corpse.x - p.x, w.corpse.y - p.y);
  else strikeSeal(w.tx, w.ty, 10);
}

function drawWhips(ctx) {
  const p = game.player;
  for (const w of game.whips) {
    const d = Math.hypot(w.tx - p.x, w.ty - p.y) || 1;
    const x2 = p.x + (w.tx - p.x) / d * w.len, y2 = p.y + (w.ty - p.y) / d * w.len;
    pxLine(ctx, p.x, p.y, x2, y2, '#120a0e', 2);
    pxLine(ctx, p.x, p.y, x2, y2, '#a8534f', 1);
  }
}

// What a lash does when it lands.
function lashHit(p, e) {
  const s = p.stats;
  {
    const wasBleeding = e.bleedT > 0;
    meleeHit(p, e, s.lashDmg, e.x - p.x, e.y - p.y);
    if (s.flay && wasBleeding) { // Flay: open wounds tear into a spray of shards
      spawnFragments(e.x, e.y, Math.atan2(e.y - p.y, e.x - p.x), 5, s.lashDmg * 0.4, 0, 0, e);
      bloodSpray(e.x, e.y, e.x - p.x, e.y - p.y, 12, ENEMY_TYPES[e.type].fluid, 140);
    }
    if (s.lashBleed) { e.bleedT = 3; e.bleedDps = s.lashBleed; }
    if (s.caustic) e.leakT = 3; // Caustic Tendrils: it leaks burning bile as it crawls
    if (s.lashStun && !e.dead) e.stunT = Math.max(e.stunT || 0, s.lashStun);
    if (s.lashDrain) {
      p.drained = (p.drained || 0) + s.lashDmg * 0.35;
      if (p.drained >= 12) { p.drained = 0; if (p.hp < p.maxHp) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); } }
    }
    if (s.barbedLash) {
      // Barbed Lash: a bone spike is flung from the victim to the next enemy.
      const next = game.enemies.filter(o => o !== e && !o.dead && o.spawnT <= 0)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (next) {
        const d = Math.hypot(next.x - e.x, next.y - e.y) || 1;
        spawnBullet({ x: e.x, y: e.y, vx: (next.x - e.x) / d * 200, vy: (next.y - e.y) / d * 200, r: 2, dmg: s.lashDmg * 0.8, life: 0.8, kind: 'shot', color: '#cfc4a4', hitSet: new Set([e]) });
      }
    }
    if (s.lashAcid) spawnPuddle(e.x, e.y, s.lashAcid, 2, 'player');
    if (s.pull && !e.dead) {
      // Drag them in toward your jaws.
      const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
      e.kx -= (e.x - p.x) / d * 260; e.ky -= (e.y - p.y) / d * 260;
    }
  }
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
    if (s.lungeBleed && !e.dead) { e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, s.lungeBleed); }
    if (e.dead && s.lungeChain) { p.cd.lunge = 0; floatText(p.x, p.y - 14, 'AGAIN', '#e8a020'); }
    knock(e, p.lungeX, p.lungeY, 120);
    if (s.biteHeal && p.hp < p.maxHp && Math.random() < s.biteHeal) { p.hp++; floatText(p.x, p.y - 14, '+1 HP', PAL.red); }
    hit++;
  }
  for (const c of corpsesNear(p.x, p.y, 20 + s.reach, p.lungeX, p.lungeY, 0.3)) damageCorpse(c, s.lungeDmg, p.lungeX, p.lungeY);
  strikeSeal(p.x + p.lungeX * 12, p.y + p.lungeY * 12, 14 + s.reach);
  game.fx.push({ kind: 'bite', x: p.x + p.lungeX * 12, y: p.y + p.lungeY * 12, t: 0.14 });
  if (hit) { game.shake = Math.max(game.shake, 3); Sfx.play('ram'); }
  Sfx.play('bite');
  p.dmgBoost = 1; // a charged lunge only boosts this one landing
}

// --- Tentacle grapple ----------------------------------------------------------------
// Fire a tentacle along your aim. It sticks to the first wall, obstacle or
// enemy it touches, then yanks you there.
// The tentacle flies out along your aim (see updateGrappleShot) and sticks
// to the first wall, obstacle or enemy it touches, then yanks you there.
function fireGrapple(p) {
  p.grappleCd = p.stats.grapple;
  p.grappleShot = { len: 6, dirX: p.aimX, dirY: p.aimY };
  Sfx.play('whip');
}

const GRAPPLE_SPEED = 620;
function updateGrappleShot(p, dt) {
  const g = p.grappleShot, s = p.stats;
  if (!g) return;
  if (!s.grapple) { p.grappleShot = null; return; }
  for (let n = Math.ceil(GRAPPLE_SPEED * dt / 3); n > 0; n--) {
    g.len += 3;
    const x = p.x + g.dirX * g.len, y = p.y + g.dirY * g.len;
    const enemy = game.enemies.find(e => !e.dead && e.spawnT <= 0 && Math.hypot(e.x - x, e.y - y) < e.r + 2);
    if (enemy) { p.grappleShot = null; resolveGrapple(p, g, [enemy.x, enemy.y], enemy); return; }
    if (pointSolid(game.room, x, y)) { p.grappleShot = null; strikeSeal(x, y, 6); resolveGrapple(p, g, [x - g.dirX * 4, y - g.dirY * 4], null); return; }
    if (g.len >= s.grappleRange) { // nothing to grab: it flops out and back
      p.grappleShot = null;
      game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: x, y2: y, t: 0.12 });
      return;
    }
  }
}

function resolveGrapple(p, g, anchor, enemy) {
  const s = p.stats;
  if (enemy && s.puppeteer) {
    const d = Math.hypot(enemy.x - p.x, enemy.y - p.y) || 1;
    enemy.kx += (p.x - enemy.x) / d * 520; enemy.ky += (p.y - enemy.y) / d * 520;
    enemy.grabOnArrive = !enemy.elite && enemy.r <= 6;
    game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: enemy.x, y2: enemy.y, t: 0.2 });
    return;
  }
  if (s.webLine) { // Silk Tendril: everything the line crosses is stuck fast
    for (const e of game.enemies) {
      if (!e.dead && e.spawnT <= 0 && distToSegment(e.x, e.y, p.x, p.y, anchor[0], anchor[1]) < e.r + 4) { e.stunT = 1.5; floatText(e.x, e.y - 10, 'WEBBED', '#e0d8d0'); }
    }
  }
  if (s.bileLine) { // Bile Line: burning bile along the whole length
    const len = Math.hypot(anchor[0] - p.x, anchor[1] - p.y);
    for (let k = 12; k < len; k += 12) spawnPuddle(p.x + g.dirX * k, p.y + g.dirY * k, 7, 2.5, 'player');
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
    knock(e, dx, dy, 220);
    hitstop(0.05);
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
  strikeSeal(p.x, p.y, 8); // ram the seal
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0 || p.dashHit.has(e)) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r + 3) continue;
    p.dashHit.add(e);
    if (s.bleedBurst && e.bleedT > 0) { // Bloodletter: the bleeding ones burst
      bloodSpray(e.x, e.y, p.dashX, p.dashY, 24, ENEMY_TYPES[e.type].fluid, 160);
      for (const o of game.enemies) if (o !== e && !o.dead && o.spawnT <= 0 && Math.hypot(o.x - e.x, o.y - e.y) < 28 + o.r) damageEnemy(o, s.dashDmg * 0.7, o.x - e.x, o.y - e.y, true);
      floatText(e.x, e.y - 10, 'BURST', PAL.red);
    }
    const ram = s.batteringRam && p.shieldUp; // Battering Ram
    damageEnemy(e, s.dashDmg * (ram ? 3 : 1), p.dashX * 3, p.dashY * 3, true);
    knock(e, p.dashX, p.dashY, ram ? 320 : 200);
    if (ram && !e.dead) { e.stunT = Math.max(e.stunT || 0, ENEMY_TYPES[e.type].boss ? 0.3 : 1.2); burst(e.x, e.y, '#8a7a5a', 8, 90); }
    if (ram) burst(e.x, e.y, '#ffd070', 6, 120, 0.2); // sparks off the shell
    hitstop(0.045);
    if (s.bleed > 0) { e.bleedT = 3; e.bleedDps = s.bleed; }
    bloodSpray(e.x, e.y, p.dashX, p.dashY, 10, ENEMY_TYPES[e.type].fluid, 140);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('ram');
    if (s.juggernaut && !e.dead && !ENEMY_TYPES[e.type].boss) e.thrown = { vx: p.dashX * 260, vy: p.dashY * 260, t: 0.5, dmg: s.dashDmg * 0.6, hit: new Set([e]) };
    if (e.dead && s.dashReset) { p.dashCd = 0; floatText(p.x, p.y - 14, 'RAMPAGE', '#e8a020'); }
  }
  for (const c of corpsesNear(p.x, p.y, p.r + 2)) if (!p.dashHit.has(c)) { p.dashHit.add(c); damageCorpse(c, s.dashDmg, p.dashX, p.dashY); }
}

function slam(p) {
  const s = p.stats;
  landing(p, 1);
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: s.slamR, t: 0.25 });
  strikeSeal(p.x, p.y, s.slamR);
  for (const e of game.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < s.slamR + e.r) {
      damageEnemy(e, s.slamDmg, (e.x - p.x) || 1, e.y - p.y, true, 260); // shockwave flings them outward
      if (s.slamStun && !e.dead) e.stunT = s.slamStun;
      if (s.slamBleed && !e.dead) { e.bleedT = 3; e.bleedDps = Math.max(e.bleedDps || 0, s.slamBleed); } // Impaler
    }
  }
  for (const c of corpsesNear(p.x, p.y, s.slamR)) damageCorpse(c, s.slamDmg, c.x - p.x, c.y - p.y);
  burst(p.x, p.y, '#5e5450', 14, 120, 0.4);
  game.shake = Math.max(game.shake, 5);
  hitstop(0.06);
  Sfx.play('slam');
}

// --- Getting hurt -------------------------------------------------------------

// Returns true if the hit landed (or was blocked by the shell).
function hurtPlayer(dmg) {
  const p = game.player, s = p.stats;
  if (p.inv > 0 || p.dashT > 0 || p.burrowT > 0 || game.state !== 'play') return false;
  if (s.parasiteInv && p.controlT > 0) return false; // Rider: nothing touches you while it drives

  // Withdrawn into your snail shell: nothing gets through.
  if (p.withdrawn) {
    burst(p.x, p.y - 3, '#9a7444', 4, 50);
    Sfx.play('clank');
    return true;
  }
  // Exoskeleton Molt: once per room, slip out of your skin and leave a decoy.
  if (s.molt && !game.room.moltUsed && !(p.moltT > 0)) {
    if (s.moltCd) p.moltT = s.moltCd; else game.room.moltUsed = true;
    game.decoy = { x: p.x, y: p.y, t: 3, stage: p.stage, body: bodyFrames(p).body };
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
    if (s.shieldBlast) { // Reactive Plate
      game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 44, t: 0.25 });
      for (const e of game.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        if (!e.dead && e.spawnT <= 0 && d < 44 + e.r) { e.kx += (e.x - p.x) / d * 320; e.ky += (e.y - p.y) / d * 320; e.stunT = Math.max(e.stunT || 0, 0.5); }
      }
    }
    floatText(p.x, p.y - 14, 'BLOCKED', '#8a7a5a');
    Sfx.play('shield');
    return true;
  }

  // Amber: once a room, a near-fatal blow seals you in amber instead.
  if (s.amber && !game.room.amberUsed && p.hp - dmg * s.hitCost <= 1) {
    game.room.amberUsed = true;
    p.inv = 2; p.hp = Math.min(p.maxHp, p.hp + 1);
    burst(p.x, p.y, '#e8a020', 20, 80, 0.7);
    floatText(p.x, p.y - 14, 'AMBER', '#e8a020');
    Sfx.play('shield');
    return true;
  }
  // Ironwood: rooted, every other hit glances off.
  if (s.rootGuard && p.rooted && ++p.guardHits % 2 === 0) {
    p.inv = 0.6; burst(p.x, p.y, '#5a4024', 10, 70); floatText(p.x, p.y - 14, 'GLANCED', '#a8844a'); Sfx.play('clank');
    return true;
  }
  // Bone Cage: every third hit glances off.
  if (s.hitIgnore && ++p.hitsTaken % s.hitIgnore === 0) {
    p.inv = 0.6;
    burst(p.x, p.y, '#d9cfa0', 10, 70);
    floatText(p.x, p.y - 14, 'GLANCED', '#d9cfa0');
    Sfx.play('clank');
    return true;
  }
  if (p.evolveT > 0) { p.evolveT = 0; floatText(p.x, p.y - 18, 'COCOON TORN', COST_COLOR); }
  p.cocoonWait = -1.2; // a hit: don't wrap back up right away
  p.hp -= dmg * s.hitCost; // Hollow Body: every hit costs double
  if (s.bulletTime) game.slowT = s.bulletTime; // Fight or Flight: the world slows around you
  p.inv = s.invuln;
  if (s.eggsac) { for (let i = 0; i < s.eggsac; i++) spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3)); Sfx.play('hatch'); }
  // Limb wear: the hit tears your limbs; for a moment you're a slug again.
  if (partAt(p, 'LIMBS') && p.hp > 0) { p.limbWear = 2.5; p.held && throwHeld(p); floatText(p.x, p.y - 22, 'LIMBS TORN', COST_COLOR); }
  if (s.adrenal) p.adrenalT = s.adrenal;
  if (s.setHurtLash) { // Grafted / Abomination: tendrils burst out
    for (const e of game.enemies) {
      if (e.dead || e.spawnT > 0 || Math.hypot(e.x - p.x, e.y - p.y) > 44 + e.r) continue;
      game.fx.push({ kind: 'whip', x1: p.x, y1: p.y, x2: e.x, y2: e.y, t: 0.16 });
      damageEnemy(e, s.setHurtLash * s.damage, e.x - p.x, e.y - p.y, true);
    }
    Sfx.play('whip');
  }
  game.shake = 5;
  Sfx.play('hurt');
  bodyHurtFx(p);
  bloodSpray(p.x, p.y, 0, 0, 16, FLUID.blood, 100);
  stain(p.x, p.y + 3, 2.5, FLUID.blood);
  if (s.ring > 0) fireRing(p, s.ring);
  if (s.hurtRing) fireRing(p, s.hurtRing); // Bramble Burst
  if (s.hurtFrags) for (const a of [0, Math.PI]) spawnFragments(p.x, p.y, a, s.hurtFrags / 2, 1.2 * s.damage, 4, 6, null); // Septic Blood
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
      p.parts = p.parts.filter(m => m.loc !== 'LIMBS');
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
  updateWhips(dt);
  for (const f of game.fx) {
    f.t -= dt;
    if (f.kind === 'ring' || f.kind === 'howl') f.r += (f.max - f.r) * Math.min(1, dt * 18);
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
  drawWhips(ctx);
  drawActShots(ctx);
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
    } else if (f.kind === 'tongue') {
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#3a0a14', 3, 0);
      pxLine(ctx, f.x1, f.y1, f.x2, f.y2, '#d86a7a', 1, 0);
      pxCircle(ctx, f.x2, f.y2, 2, '#e88a9a');
    } else if (f.kind === 'howl') {
      // Sound waves rippling out across the cone.
      const span = f.cone <= -1 ? Math.PI : Math.acos(Math.max(-1, Math.min(1, f.cone)));
      for (const rr of [f.r, f.r * 0.7]) {
        ctx.fillStyle = rr === f.r ? '#e8dcc8' : '#8a8070';
        for (let k = -14; k <= 14; k++) { const a = f.a + span * k / 14; ctx.fillRect(Math.round(f.x + Math.cos(a) * rr), Math.round(f.y + Math.sin(a) * rr), 1, 1); }
      }
    } else if (f.kind === 'act') {
      drawActFx(ctx, f);
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
  for (const m of p.parts) for (const id of m.path) for (const ov of mutOverlays(id)) set.add(ov);
  return set;
}

// Animation frame for limbs: legs skitter and wings flap.
function limbFrame(p, ov) {
  if (ov === 'spiderlegs' && p.moving && Math.floor(p.t * 14) % 2) return 'spiderlegs2';
  if (ov === 'wings') { // beating hard when you push, spread wide when you glide
    if (!p.moving && Math.hypot(p.mvx || 0, p.mvy || 0) > 25) return 'wings';
    return Math.floor(p.t * (p.moving ? 22 : 9)) % 2 ? 'wings2' : 'wings';
  }
  return ov;
}

function drawPlayer(ctx) {
  const p = game.player, s = p.stats;
  // Burrowed: just a moving mound of dirt.
  if (p.burrowT > 0) {
    pxCircle(ctx, p.x, p.y + 3, 5, '#1e1a18');
    pxCircle(ctx, p.x, p.y + 2, 3.5, '#3a3230');
    ctx.fillStyle = '#e8e0c8'; // claw tips poking out, digging
    ctx.fillRect(Math.round(p.x - 3), Math.round(p.y - 1 + Math.floor(p.t * 10) % 2), 1, 2);
    ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - 1 + Math.floor(p.t * 10 + 1) % 2), 1, 2);
    return;
  }
  drawCentipede(ctx, p);
  if (p.inv > 0 && p.dashT <= 0 && !p.withdrawn && Math.floor(p.inv * 16) % 2) return;

  // Altitude, squash & stretch, tilt (see bodyfx.js).
  const mvNow = movement(p), pose = p.pose = bodyPose(p);
  // Soft shadow on the floor: smaller and fainter the higher you are.
  const hk = clamp(1 - pose.alt * 0.05, 0.55, 1);
  const sw = Math.round(7 * STAGE_SCALE[p.stage] * hk);
  ctx.fillStyle = `rgba(0,0,0,${(0.35 * hk).toFixed(2)})`;
  ctx.fillRect(Math.round(p.x - sw), Math.round(p.y + 4), sw * 2, 3);
  ctx.fillRect(Math.round(p.x - sw + 2), Math.round(p.y + 3), sw * 2 - 4, 5);
  const x = p.x, y = p.y - 4 - Math.round(pose.alt);
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
  if (p.venting && s.gasInvis) ctx.globalAlpha = 0.4; // Phantom
  const limbsOk = !(p.limbWear > 0); // torn limbs aren't drawn
  const legs = limbsOk && p.legs; // real, walking spider legs replace the painted ones
  if (legs) drawSpiderLegs(ctx, p, x, y, 'far');
  const tents = limbsOk && !!p.tents; // real, gripping tentacles replace the painted ones
  if (tents) drawTentacles(ctx, p, x, y, 'far');
  if (limbsOk) drawPseudopod(ctx, p, x, y);
  if (limbsOk && partAt(p, 'LIMBS') && partAt(p, 'LIMBS').path[0] === 'rootlegs') drawRootLegs(ctx, p, x, y);
  // Squash, stretch and tilt the body around its feet.
  const ay = y + 8;
  ctx.save(); ctx.translate(x, ay); if (pose.rot) ctx.rotate(pose.rot); ctx.scale(pose.sx, pose.sy); ctx.translate(-x, -ay);
  for (const ov of BEHIND_ORDER) if (overlays.has(ov) && (limbsOk || !LIMB_OVERLAYS.has(ov)) && !(legs && ov === 'spiderlegs') && !(tents && ov === 'tentlimbs')) drawCentered(ctx, ovSet[limbFrame(p, ov)], x, y);
  const fb = bodyFrames(p);
  let body = hurt ? fb.hurt : fb[(squash ? 'body2' : 'body') + (left ? '_L' : '')];
  // Coloration from your parts (half strength over a set's body form, which has its own colors).
  if (p.tint && !hurt) body = tintedFrame(body, p.tint, p.form ? 0.5 : 1);
  if (p.eatT > 0) {
    // Swallowing: the body bulges and settles, and a lump slides down.
    const k = Math.sin((1 - p.eatT / 0.4) * Math.PI);
    const sx = 1 + 0.16 * k, sy = 1 - 0.08 * k;
    ctx.drawImage(body, Math.round(x - body.width * sx / 2), Math.round(y - body.height * sy / 2 + body.height * (1 - sy) / 2), Math.round(body.width * sx), Math.round(body.height * sy));
  } else drawCentered(ctx, body, x, y);
  for (const ov of OVERLAY_ORDER) if (overlays.has(ov) && (limbsOk || !LIMB_OVERLAYS.has(ov))) drawCentered(ctx, ovSet[ov], x, y);
  drawBodyMarks(ctx, p, x, y);
  if (limbsOk) drawLimbDetails(ctx, p, x, y);
  ctx.restore();
  if (legs) drawSpiderLegs(ctx, p, x, y, 'near');
  if (tents) drawTentacles(ctx, p, x, y, 'near');
  drawTongue(ctx, p);
  if (p.evolveT > 0) drawCocoon(ctx, p, x, y);
  if (p.limbWear > 0 && partAt(p, 'LIMBS')) bloodSpray(p.x, p.y + 2, 0, 0, Math.random() < 0.1 ? 1 : 0, FLUID.blood, 30); // stumps bleed

  ctx.globalAlpha = 1;
  // Whatever you're holding in your hands.
  if (p.held) {
    const h = p.held, img = h.kind === 'corpse' ? SPR[h.ref.sprite + '_dead'] : SPR[enemySpriteName(h.ref)];
    if (img) drawCentered(ctx, img, h.ref.x, h.ref.y);
  }

  ctx.fillStyle = PAL.white;
  ctx.fillRect(Math.round(p.x + p.aimX * 11), Math.round(p.y + p.aimY * 11), 1, 1);
}

// --- Spider legs: eight jointed legs that really walk ------------------------------------
// Each foot stays planted on the floor while the body moves. When the body
// gets too far ahead, the foot lifts and steps to a new spot ahead of you.
// Legs move in two alternating groups (like a real spider's gait), and the
// knees solve to arch up between hip and foot. The four far legs are drawn
// behind the body, the four near legs in front of it.
const SPIDER_LEGS = [
  // hip (relative to the body), resting foot (relative to the floor point under you), near/far, gait group
  { hx: -2.5, hy: -1, fx: -18, fy: -3, near: false, g: 0 },
  { hx: -1, hy: -1, fx: -10, fy: -7, near: false, g: 1 },
  { hx: 1, hy: -1, fx: 10, fy: -7, near: false, g: 0 },
  { hx: 2.5, hy: -1, fx: 18, fy: -3, near: false, g: 1 },
  { hx: -2.5, hy: 1, fx: -19, fy: 5, near: true, g: 1 },
  { hx: -1, hy: 1, fx: -10, fy: 8, near: true, g: 0 },
  { hx: 1, hy: 1, fx: 10, fy: 8, near: true, g: 1 },
  { hx: 2.5, hy: 1, fx: 19, fy: 5, near: true, g: 0 },
];
const LEG_STEP_TIME = 0.065; // how long a foot is in the air
const LEG_STRIDE = 12;       // how far the body travels before a foot steps

function spiderLegsActive(p) {
  const m = partAt(p, 'LIMBS');
  return !!(m && m.path[0] === 'spider' && !(p.limbWear > 0) && p.burrowT <= 0 && !p.withdrawn && !p.flying);
}

function updateSpiderLegs(p, dt) {
  if (!spiderLegsActive(p)) { p.legs = null; return; }
  const k = STAGE_SCALE[p.stage] * 1.1;
  const vx = (p.x - (p.lastLegX ?? p.x)) / dt, vy = (p.y - (p.lastLegY ?? p.y)) / dt;
  p.lastLegX = p.x; p.lastLegY = p.y;
  const rest = (L, lead) => ({ x: p.x + L.fx * k + vx * lead, y: p.y + 2 + L.fy * k + vy * lead });
  if (!p.legs) p.legs = SPIDER_LEGS.map(L => { const r = rest(L, 0); return { x: r.x, y: r.y, sx: r.x, sy: r.y, tx: r.x, ty: r.y, t: 0 }; });
  const stepping = g => p.legs.some((f, i) => f.t > 0 && SPIDER_LEGS[i].g === g);
  const fast = Math.hypot(vx, vy) > 160;
  p.legs.forEach((f, i) => {
    const L = SPIDER_LEGS[i];
    if (f.t > 0) { // mid-step: swing toward the target
      f.t = Math.max(0, f.t - dt);
      if (f.t === 0) { if (Math.random() < 0.35) stainPx(f.tx, f.ty, ['#141010'], 1); if (Math.random() < 0.3) Sfx.play('skitter'); } // pinprick footprints
      const u = 1 - f.t / LEG_STEP_TIME;
      f.x = f.sx + (f.tx - f.sx) * u; f.y = f.sy + (f.ty - f.sy) * u;
      return;
    }
    const want = rest(L, 0.12);
    const d = Math.hypot(want.x - f.x, want.y - f.y);
    if (d > 40) { f.x = want.x; f.y = want.y; return; } // teleported (doors, grapples)
    // Step when stretched too far, and only while the other group is planted.
    if ((d > LEG_STRIDE * k && (fast || !stepping(1 - L.g))) || d > LEG_STRIDE * 1.8 * k) { // (a badly stretched leg steps anyway)
      f.sx = f.x; f.sy = f.y; f.tx = want.x; f.ty = want.y; f.t = LEG_STEP_TIME * (fast ? 0.6 : 1);
    } else if (!p.moving && d > 2) { // standing still: feet settle back under you
      f.x += (want.x - f.x) * Math.min(1, dt * 6); f.y += (want.y - f.y) * Math.min(1, dt * 6);
    }
  });
}

// Two-bone leg: hip -> knee -> foot. The knee bends up and outward.
function drawSpiderLegs(ctx, p, bx, by, which) {
  const k = STAGE_SCALE[p.stage] * 1.1;
  const L1 = 11 * k, L2 = 13 * k;
  const dark = '#100808', mid = '#5a4030', hi = '#a08060';
  p.legs.forEach((f, i) => {
    const L = SPIDER_LEGS[i];
    if (L.near !== (which === 'near')) return;
    const hx = bx + L.hx * k, hy = by + 2 + L.hy * k;
    const lift = f.t > 0 ? Math.sin((1 - f.t / LEG_STEP_TIME) * Math.PI) * 3 : 0;
    const fx = f.x, fy = f.y - lift;
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1;
    const reach = Math.min(d, L1 + L2 - 0.5);
    const a = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d, uy = dy / d;
    // Of the two knee solutions, take the one that points up (and outward).
    let nx = -uy, ny = ux;
    if (ny > 0 || (ny === 0 && nx * ux < 0)) { nx = -nx; ny = -ny; }
    const kx = hx + ux * a + nx * h, ky = hy + uy * a + ny * h;
    const ex = hx + ux * reach, ey = hy + uy * reach; // where the foot actually is (clamped)
    // Thin, dark-edged segments: a thicker femur up to the knee, a fine tibia down to the claw.
    pxLine(ctx, hx, hy + 1, kx, ky + 1, dark, 1, 0); pxLine(ctx, kx + 1, ky, ex + 1, ey, dark, 1, 0);
    pxLine(ctx, hx, hy, kx, ky, mid, 1, 0); pxLine(ctx, hx, hy - 1, kx, ky - 1, hi, 1, 0);
    pxLine(ctx, kx, ky, ex, ey, mid, 1, 0);
    ctx.fillStyle = dark; ctx.fillRect(Math.round(kx) - 1, Math.round(ky) - 2, 3, 3);  // knee joint
    ctx.fillStyle = hi; ctx.fillRect(Math.round(kx), Math.round(ky) - 1, 1, 1);
    ctx.fillStyle = dark; ctx.fillRect(Math.round(ex), Math.round(ey), 1, 2);        // claw tip
  });
}

// The cocoon wraps up from the floor as it grows, then pulses before splitting.
function drawCocoon(ctx, p, x, y) {
  const k = Math.min(1, p.evolveT / COCOON_TIME);
  const rx = Math.round(8 * STAGE_SCALE[p.stage]) + 1, ry = Math.round(10 * STAGE_SCALE[p.stage]) + 1;
  const jx = k > 0.6 ? Math.round(rand(-1, 1) * (k - 0.6) * 2.5) : 0; // it trembles near the end
  const cx = Math.round(x + jx), cy = Math.round(y + 1);
  const top = cy + ry - Math.round(2 * ry * k); // wrapped up to here
  for (let yy = -ry; yy <= ry; yy++) {
    const py = cy + yy;
    if (py < top) continue;
    const half = Math.round(rx * Math.sqrt(1 - (yy / ry) ** 2));
    for (let xx = -half; xx <= half; xx++) {
      const edge = Math.abs(xx) >= half || py === top;
      const strand = (((xx * 2 + yy * 3 + Math.floor(p.evolveT * 6)) % 7) + 7) % 7;
      ctx.fillStyle = edge ? '#2a1c18' : strand === 0 ? '#8a6a5a' : strand < 3 ? '#a8907e' : '#c8b4a0';
      ctx.fillRect(cx + xx, py, 1, 1);
    }
  }
  // Veins, and the glow of what's growing inside.
  if (k > 0.5) {
    ctx.fillStyle = '#7a1420';
    for (let i = 0; i < 6; i++) if (cy - 4 + i * 2 >= top) ctx.fillRect(cx - 3 + ((i * 5) % 7), cy - 4 + i * 2, 1, 2);
  }
  if (k > 0.75 && Math.floor(p.evolveT * 8) % 2) {
    ctx.fillStyle = '#c96a8f';
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
  }
}

// Drawn above the darkness: grapple tentacle, shell ring, glowing night eye.
function drawPlayerGlow(ctx) {
  const p = game.player;
  if (game.state !== 'play') return;
  drawBodyGlow(ctx, p);
  if (p.grappleShot) {
    const g = p.grappleShot, tx = p.x + g.dirX * g.len, ty = p.y + g.dirY * g.len;
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#120a0e', 2);
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#a8534f', 1);
  }
  if (p.pullT > 0 && p.pull) {
    const tx = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.x : p.pull.x;
    const ty = p.pull.enemy && !p.pull.enemy.dead ? p.pull.enemy.y : p.pull.y;
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#120a0e', 2);
    pxLine(ctx, p.x, p.y - 2, tx, ty, '#a8534f', 1);
  }
  if (p.shieldUp) pxRing(ctx, p.x, p.y, 9, Math.floor(p.t * 3) % 2 ? '#8a7a5a' : '#5a4a3a');
  for (let i = 0; i < p.gullet; i++) { // Frog Tongue: what's in your gut, ready to spit
    ctx.fillStyle = '#3a0a14'; ctx.fillRect(Math.round(p.x - p.gullet * 2 + i * 4) - 1, Math.round(p.y - 20) - 1, 3, 3);
    ctx.fillStyle = '#d86a7a'; ctx.fillRect(Math.round(p.x - p.gullet * 2 + i * 4), Math.round(p.y - 20), 1, 1);
  }
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
// Bonus damage for your shots: Night Eyes (enemy out in the dark) and
// Evil Eye (the enemy you're staring at).
function nightEyesMul(e) {
  const p = game.player, s = p.stats;
  let m = 1;
  const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
  if (s.nightEyes && (d > 45 || p.blackoutT > 0)) m *= 1 + s.nightEyes; // Blackout: it's all dark
  if (s.gaze && (dx * p.aimX + dy * p.aimY) / d > 0.92) m *= 1 + s.gaze;
  return m;
}

'use strict';
// ---------------------------------------------------------------------------
// MUTATIONS: the heart of the game.
//
// Your body has 5 SLOTS. Every mutation grows in one of them:
//   MOUTH: your attack (fire button). You start with Bone Spike.
//   LIMBS: how you move. You start limbless, as a slow slug.
//   HEAD, BACK, CORE: everything else.
//
// Burst corpses -> collect DNA -> choose 1 of 3 mutations:
//   - empty slot        -> it grows there
//   - same mutation     -> it levels up
//   - different one     -> REPLACE it, or COMBINE the two (if a recipe exists)
//
// Each mutation just tweaks the stat sheet (see baseStats), so slots stack
// into combos on their own: e.g. Mandibles (MOUTH) + Mitosis (CORE) means
// every bite bursts the victim into fragments. The more involved mechanics
// (allies, clouds, burrowing, grabbing...) live in abilities.js.
//
// To add a mutation: add an entry to MUTATIONS under its slot, and paint an
// icon for it in sprites.js (ICON_PAINT). To add a combo: add an entry to
// RECIPES with two `parts` from the SAME slot.
// ---------------------------------------------------------------------------

const SLOTS = ['MOUTH', 'HEAD', 'BACK', 'LIMBS', 'CORE'];

const RARITY = {
  common:    { label: 'COMMON',    color: '#9a9284', weight: 60 },
  uncommon:  { label: 'UNCOMMON',  color: '#8fb04a', weight: 27 },
  rare:      { label: 'RARE',      color: '#5a8ae0', weight: 18 },
  legendary: { label: 'LEGENDARY', color: '#e8a020', weight: 5 },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// MALIGNANT mutations are extra strong but carry a `cost` (shown in red).
// Most can be cured by combining with the right partner.
const MALIGNANT_COLOR = '#a04ad0';
const COST_COLOR = '#d04050';

function baseStats() {
  return {
    // --- Movement (set by whatever is in your LIMBS). Limbless = a slow slug. ---
    speed: 50, slug: true, accel: 0, drag: 0, flyover: false, hop: 0, dashSpeed: 260,
    grapple: 0, grappleRange: 0, pullDmg: 0, pullThrough: false,
    centipede: 0, burrow: 0, burrowDmg: 0, shell: false, fins: 0, stilts: false, hands: false, handDmg: 0,
    pupa: false, moleworm: false, puppeteer: false,
    // --- Attack (set by whatever is in your MOUTH) ---
    damageMul: 1, rateMul: 1, damage: 1, fireDelay: 0,
    spike: false, spikeDmg: 0, spikeCount: 1, shotSpeed: 155, range: 0.7, shotR: 2,
    spit: false, spikeBleed: 0, sporeCloud: 0,
    bite: false, biteDmg: 0, biteReach: 18, biteAcid: 0, biteHeal: 0, doubleBite: false, leech: 0,
    lash: false, lashDmg: 0, lashRange: 52, lashTargets: 1, lashBleed: 0, lashAcid: 0, pull: false,
    lunge: false, lungeDmg: 0,
    beam: 0, beamRange: 70, vomit: 0, vomitDmg: 0,
    // Firing style: what the mouth fires is set above; HOW it fires comes from
    // these (Dense Marrow = charge & blast, Twitch Fibers = rapid stream).
    charge: false, stream: false, chargeBonus: false, nativeStream: false,
    spread: 0, acidChance: 0, lob: false,
    // --- Modifiers that work with any attack ---
    homing: 0, split: 0, acid: 0, pierce: 0, reach: 0,
    // Shard rings (fired when dashing / hurt)
    ring: 0, ringHoming: 0, ringAcid: false, ringSplit: 0,
    trailSpines: false, trailAcid: false,
    // Dash / charge
    dashCd: 0.8, dashTime: 0.14, dashDmg: 0, bleed: 0, slamDmg: 0, slamR: 0, dashReset: false,
    // --- Senses ---
    antennae: false, echo: 0, compound: 0, parasite: false, symbiote: false,
    // --- Defense ---
    maxHp: 0, shieldCd: 0, shieldRing: 0, regen: 0, hemophage: 0, thorns: 0,
    invuln: 1.0, adrenal: 0, adrenalRage: false, toxicBlood: 0, secondHeart: false,
    eggsac: 0, pustules: 0, molt: false, lure: false,
    // --- Organs ---
    brood: 0, bacteria: 0, twin: false,
    // --- Trade-offs ---
    hpMul: 1, dnaMul: 1, lightMul: 1, invulnCap: 99, starve: 0, nightEyes: 0,
    speedMul: 1, hitCost: 1,
  };
}

// Runs after every slot has been applied.
function finalizeStats(s) {
  const m = s.damageMul;
  s.damage = m; // generic damage scale (shard rings etc.)
  for (const k of ['spikeDmg', 'biteDmg', 'lashDmg', 'lungeDmg', 'dashDmg', 'slamDmg', 'thorns', 'toxicBlood', 'pullDmg', 'beam', 'vomitDmg', 'burrowDmg', 'handDmg']) s[k] *= m;
  s.speed *= s.speedMul;
  s.slimeTrail = s.slug || s.fins > 0 || s.shell; // slugs, snails and pseudopods leave slime
  // A limbless slug can only manage a short, weak lurch.
  if (s.slug) { s.dashSpeed = 190; s.dashCd *= 1.25; s.dashTime = Math.min(s.dashTime, 0.12); }
  s.fireDelay = (s.fireDelay || 0.75) * s.rateMul;
  // Firing styles. Charge wins over stream (stream then adds pellets to the blast).
  s.chargeBonus = s.charge && s.stream;
  if (s.charge || s.beam || s.nativeStream) s.stream = false;
  if (s.stream) {
    s.fireDelay *= 0.35;
    s.spikeDmg *= 0.45; s.vomitDmg *= 0.5;
    s.biteDmg *= 0.55; s.lashDmg *= 0.55; s.lungeDmg *= 0.55;
    s.spread += 0.16; s.range *= 0.8; s.sporeCloud *= 0.6;
  }
  s.biteReach += s.reach;
  s.lashRange += s.reach * 2;
  s.invuln = Math.min(s.invuln, s.invulnCap);
}

// Helper: weapons in the same mouth share one fire rate (the slower one).
const delay = (s, d) => { s.fireDelay = Math.max(s.fireDelay, d); };

const MUTATIONS = {
  // ================= MOUTH: your attack =================
  spike: {
    name: 'Bone Spike', slot: 'MOUTH', rarity: 'common', max: 3,
    desc: 'Fire a slow bone spike. Levels: harder, faster, then twin spikes.',
    apply(s, l) { s.spike = true; s.spikeDmg += 1 + 0.4 * (l - 1); delay(s, 0.75 - 0.1 * (l - 1)); if (l >= 3) s.spikeCount = 2; },
  },
  bile: {
    name: 'Bile Spit', slot: 'MOUTH', rarity: 'uncommon', max: 3, overlay: ['acid'],
    desc: 'Flamethrower. Hold fire to spray a fast, short-range stream of burning bile.',
    apply(s, l) {
      s.spike = true; s.spit = true; s.nativeStream = true;
      s.spikeDmg += 0.22 + 0.08 * l; delay(s, 0.09);
      s.acid = Math.max(s.acid, 7 + 2 * l); s.acidChance = 0.25;
      s.shotR = 2; s.shotSpeed = 175; s.range = 0.36 + 0.03 * l; s.spread += 0.22;
    },
  },
  spores: {
    name: 'Spore Cough', slot: 'MOUTH', rarity: 'uncommon', max: 3, overlay: ['sporepods'],
    desc: 'Mortar. Lob spores over cover to where you aim; they burst into blinding clouds.',
    apply(s, l) { s.spike = true; s.lob = true; s.spikeDmg += 0.8; s.sporeCloud = 20 + 4 * l; delay(s, 0.9); s.shotR = 3; },
  },
  vomit: {
    name: 'Vomit Stream', slot: 'MOUTH', rarity: 'common', max: 3, overlay: ['acid'],
    desc: 'A short-range gush of bile that shoves enemies back.',
    apply(s, l) { s.vomit = 6 + 2 * l; s.vomitDmg += 0.5 + 0.2 * l; delay(s, 0.45); },
  },
  mandibles: {
    name: 'Mandibles', slot: 'MOUTH', rarity: 'common', max: 3, overlay: ['mandibles'],
    desc: 'Melee. Fire bites whatever is in front of you, hard and fast.',
    apply(s, l) { s.bite = true; s.biteDmg += 2 + 1.2 * l; delay(s, 0.42 - 0.04 * l); },
  },
  leech: {
    name: 'Leech Mouth', slot: 'MOUTH', rarity: 'common', max: 3, overlay: ['leech'],
    desc: 'Rapid little bites. Every few bites heal you.',
    apply(s, l) { s.bite = true; s.biteDmg += 0.8 + 0.5 * l; delay(s, 0.26); s.leech = 7 - l; },
  },
  tentacles: {
    name: 'Tendrils', slot: 'MOUTH', rarity: 'uncommon', max: 3, overlay: ['tentacles'],
    desc: 'Melee. Fire lashes enemies in front of you at mid range: 1 / 2 / 3 targets.',
    apply(s, l) { s.lash = true; s.lashDmg += 1.5 + 0.8 * l; s.lashTargets = Math.max(s.lashTargets, l); delay(s, 0.6 - 0.05 * l); },
  },
  feral: {
    name: 'Feral Lunge', slot: 'MOUTH', rarity: 'rare', max: 3, overlay: ['fangs'],
    desc: 'Melee. Fire leaps forward and savages everything in front of you.',
    apply(s, l) { s.lunge = true; s.lungeDmg += 5 + 2 * l; delay(s, 0.5); },
  },
  proboscis: {
    name: 'Proboscis', slot: 'MOUTH', rarity: 'rare', max: 3, overlay: ['proboscis'],
    desc: 'Hold fire to latch a draining beam onto prey. Drained blood heals you.',
    apply(s, l) { s.beam += 0.25 + 0.1 * l; delay(s, 0.1); },
  },

  // ================= HEAD =================
  eyes: {
    name: 'Extra Eyes', slot: 'HEAD', rarity: 'uncommon', max: 3, overlay: ['eyes'],
    desc: 'Shots curve toward prey. Melee reaches further.',
    apply(s, l) { s.homing += 2 + 1.5 * l; s.range += 0.1 * l; s.reach += 3 * l; },
  },
  antennae: {
    name: 'Antennae', slot: 'HEAD', rarity: 'common', max: 1, overlay: ['antennae'],
    desc: 'Feel movement in the dark: see enemies as faint outlines.',
    apply(s) { s.antennae = true; },
  },
  compound: {
    name: 'Compound Eyes', slot: 'HEAD', rarity: 'uncommon', max: 2, overlay: ['compound'],
    desc: 'A wider light, and enemy shots slow down near you.',
    apply(s, l) { s.lightMul *= 1.3; s.compound = l === 1 ? 0.55 : 0.4; },
  },
  skull: {
    name: 'Battering Skull', slot: 'HEAD', rarity: 'common', max: 3, overlay: ['horns'],
    desc: 'Your dash becomes a charge that rams enemies for heavy damage.',
    apply(s, l) { s.dashDmg += 2 + 2 * l; },
  },
  horns: {
    name: 'Gore Horns', slot: 'HEAD', rarity: 'uncommon', max: 3, overlay: ['gorehorns'],
    desc: 'Charge further. Enemies you ram bleed out over time.',
    apply(s, l) { s.dashTime += 0.04 * l; s.dashDmg += l; s.bleed += 1.5 * l; },
  },
  echo: {
    name: 'Echo Skull', slot: 'HEAD', rarity: 'uncommon', max: 3, overlay: ['echo'],
    desc: 'You scream when you dash, stunning everything nearby.',
    apply(s, l) { s.echo = 0.9 + 0.3 * l; },
  },
  abyssal: {
    name: 'Abyssal Eye', slot: 'HEAD', rarity: 'legendary', max: 1, overlay: ['thirdeye'],
    desc: 'It sees through flesh. Shots pierce 2 enemies and seek. +30% damage.',
    apply(s) { s.pierce += 2; s.homing += 3; s.damageMul *= 1.3; },
  },
  nighteyes: {
    name: 'Night Eyes', slot: 'HEAD', rarity: 'uncommon', max: 2, malignant: true,
    desc: '+50% damage per level to enemies outside your light.',
    cost: 'Your light shrinks to a small circle.',
    apply(s, l) { s.nightEyes += 0.5 * l; s.lightMul *= 0.6; },
  },
  parasite: {
    name: 'Parasite Brain', slot: 'HEAD', rarity: 'rare', max: 1, malignant: true, overlay: ['parasite'],
    desc: '+60% damage with everything.',
    cost: 'Sometimes it takes control of your body.',
    apply(s) { s.damageMul *= 1.6; s.parasite = true; },
  },

  // ================= BACK =================
  spines: {
    name: 'Bone Spurs', slot: 'BACK', rarity: 'common', max: 3, overlay: ['spines'],
    desc: 'Dashing or getting hurt fires a ring of bone shards.',
    apply(s, l) { s.ring += 4 + 2 * l; },
  },
  barbs: {
    name: 'Barbed Hide', slot: 'BACK', rarity: 'common', max: 3, overlay: ['barbs'],
    desc: 'Enemies that touch you are shredded.',
    apply(s, l) { s.thorns += 1 + l; },
  },
  pustules: {
    name: 'Pustule Field', slot: 'BACK', rarity: 'common', max: 3, overlay: ['pustules'],
    desc: 'Enemies that touch you pop a pustule and burn in bile.',
    apply(s, l) { s.pustules = 1 + 0.5 * l; },
  },
  twitch: {
    name: 'Twitch Fibers', slot: 'BACK', rarity: 'common', max: 3, overlay: ['twitch'],
    desc: 'Raw muscle along the spine. Move faster, dash sooner, and your attack becomes a rapid, wild stream.',
    apply(s, l) { s.speed += 10 * l; s.rateMul *= Math.pow(0.9, l); s.dashCd *= Math.pow(0.9, l); s.stream = true; },
  },
  adrenal: {
    name: 'Adrenal Gland', slot: 'BACK', rarity: 'common', max: 3,
    desc: 'Longer invulnerability after a hit, plus a burst of speed.',
    apply(s, l) { s.invuln += 0.25 * l; s.adrenal = Math.max(s.adrenal, 0.8 + 0.6 * l); },
  },
  chitin: {
    name: 'Chitin Shell', slot: 'BACK', rarity: 'uncommon', max: 3, overlay: ['chitin'],
    desc: 'A shell that blocks one hit, then regrows. Regrows faster each level.',
    apply(s, l) { s.shieldCd = 14 - 3 * l; },
    onGain(p) { p.shieldUp = true; },
  },
  toxic: {
    name: 'Toxic Blood', slot: 'BACK', rarity: 'uncommon', max: 3,
    desc: 'When you bleed, your blood burns everything around you. Your slime burns too.',
    apply(s, l) { s.toxicBlood += 2 + l; },
  },
  eggsac: {
    name: 'Egg Sac', slot: 'BACK', rarity: 'uncommon', max: 3, overlay: ['eggs'],
    desc: 'When you are hurt, spiderlings hatch and fight for you.',
    apply(s, l) { s.eggsac = 1 + l; },
  },
  lure: {
    name: 'Bioluminescent Lure', slot: 'BACK', rarity: 'uncommon', max: 1, overlay: ['lure'],
    desc: 'A glowing lure on your back draws enemies (and their aim) away from you.',
    apply(s) { s.lure = true; },
  },
  molt: {
    name: 'Exoskeleton Molt', slot: 'BACK', rarity: 'rare', max: 1, overlay: ['moltshell'],
    desc: 'Once per room, shed your skin to ignore a hit, leaving a decoy husk.',
    apply(s) { s.molt = true; },
  },
  membrane: {
    name: 'Thin Membrane', slot: 'BACK', rarity: 'rare', max: 1, malignant: true,
    desc: 'Your shots pass through every enemy in their path.',
    cost: 'Almost no invulnerability after being hit.',
    apply(s) { s.pierce += 99; s.invulnCap = 0.25; },
  },

  // ================= LIMBS: how you move =================
  // Empty LIMBS = a slow, inching slug. Each limb is a different way of moving.
  spider: {
    name: 'Spider Legs', slot: 'LIMBS', rarity: 'common', max: 3, overlay: ['spiderlegs'],
    desc: 'Eight skittering legs. Quick, responsive movement.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 76 + 8 * l); },
  },
  fins: {
    name: 'Pseudopods', slot: 'LIMBS', rarity: 'common', max: 3, overlay: ['fins'],
    desc: 'Slide fast through your own slime and bile; sluggish everywhere else.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 52); s.fins = 118 + 12 * l; },
  },
  cilia: {
    name: 'Cilia', slot: 'LIMBS', rarity: 'common', max: 3, overlay: ['cilia'],
    desc: 'Thousands of tiny hairs: a smooth, constant glide, and you attack faster.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 78 + 6 * l); s.accel = s.accel || 640; s.drag = s.drag || 4.2; s.rateMul *= 0.92; },
  },
  wings: {
    name: 'Wings', slot: 'LIMBS', rarity: 'uncommon', max: 3, overlay: ['wings'],
    desc: 'Fast but floaty flight. Drift over crates and tanks.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 112 + 10 * l); s.accel = s.accel || 330 + 30 * l; s.drag = s.drag || 1.5; s.flyover = true; s.dashTime += 0.05; },
  },
  hindlegs: {
    name: 'Hind Legs', slot: 'LIMBS', rarity: 'uncommon', max: 3, overlay: ['hindlegs'],
    desc: 'Move in powerful hops. Your dash is a pounce that lands with a shockwave.',
    apply(s, l) {
      s.slug = false; s.speed = Math.max(s.speed, 150); s.hop = s.hop || 0.5 - 0.05 * l;
      s.dashTime += 0.08; s.slamDmg += 2 + l; s.slamR = Math.max(s.slamR, 24 + 4 * l);
    },
  },
  mantis: {
    name: 'Mantis Scythes', slot: 'LIMBS', rarity: 'uncommon', max: 3, overlay: ['scythes'],
    desc: 'Your dash becomes a slicing leap that cuts everything you pass through.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 70 + 4 * l); s.dashDmg += 3 + 2 * l; s.bleed += 1.5 * l; s.dashTime += 0.04; },
  },
  stilts: {
    name: 'Bone Stilts', slot: 'LIMBS', rarity: 'uncommon', max: 2,
    desc: 'Stride over enemy acid untouched, and shoot over cover.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 66 + 6 * l); s.stilts = true; },
  },
  shell: {
    name: 'Snail Shell', slot: 'LIMBS', rarity: 'uncommon', max: 1, malignant: true, overlay: ['shell'],
    desc: 'Hold still to withdraw into your shell and block everything.',
    cost: 'Painfully slow.',
    apply(s) { s.slug = false; s.speed = Math.max(s.speed, 36); s.shell = true; },
  },
  grapple: {
    name: 'Tentacles', slot: 'LIMBS', rarity: 'rare', max: 3, overlay: ['tentlimbs'],
    desc: 'Right-click (or E) to lash a tentacle at a wall or enemy and yank yourself to it.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 60); s.grapple = 1.0 - 0.15 * (l - 1); s.grappleRange = 110 + 15 * l; s.pullDmg += 2 + l; },
  },
  centipede: {
    name: 'Centipede Body', slot: 'LIMBS', rarity: 'rare', max: 3, overlay: ['centlegs'],
    desc: 'Very fast. Your body trails behind as a segmented chain that blocks enemy shots.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 106 + 6 * l); s.centipede = 3 + l; },
  },
  burrow: {
    name: 'Burrowing Claws', slot: 'LIMBS', rarity: 'rare', max: 3, overlay: ['claws'],
    desc: 'Dash dives underground. Untouchable while buried; erupt with damage.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 64); s.burrow = Math.max(s.burrow, 0.5 + 0.1 * l); s.burrowDmg += 3 + l; },
  },
  hands: {
    name: 'Grasping Hands', slot: 'LIMBS', rarity: 'rare', max: 3, overlay: ['hands'],
    desc: 'Right-click (or E) to grab a corpse or small enemy, and again to throw it.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 62); s.hands = true; s.handDmg += 4 + 2 * l; },
  },

  // ================= CORE =================
  hide: {
    name: 'Thick Hide', slot: 'CORE', rarity: 'common', max: 5,
    desc: '+1 max health per level, and heal 1.',
    apply(s, l) { s.maxHp += l; },
    onGain(p) { p.hp += 1; },
  },
  marrow: {
    name: 'Dense Marrow', slot: 'CORE', rarity: 'common', max: 5,
    desc: 'Heavier bones. +20% damage, and you hold fire to charge a blast.',
    apply(s, l) { s.damageMul *= 1 + 0.2 * l; s.charge = true; },
  },
  calcified: {
    name: 'Calcified Organs', slot: 'CORE', rarity: 'common', max: 3, overlay: ['calcified'],
    desc: '+2 max health (+1 per extra level), but you are slower.',
    apply(s, l) { s.maxHp += 1 + l; s.speedMul *= 0.85; },
    onGain(p) { p.hp += 1; },
  },
  bacteria: {
    name: 'Gut Bacteria', slot: 'CORE', rarity: 'common', max: 3,
    desc: '+1 DNA per corpse per level, but corpses take longer to burst.',
    apply(s, l) { s.bacteria += l; },
  },
  regrow: {
    name: 'Regrowth', slot: 'CORE', rarity: 'uncommon', max: 3,
    desc: 'Slowly regrow lost flesh: heal 1 every 32 / 24 / 16 seconds.',
    apply(s, l) { s.regen = 40 - 8 * l; },
  },
  brood: {
    name: 'Brood Chamber', slot: 'CORE', rarity: 'uncommon', max: 3, overlay: ['brood'],
    desc: 'Burst corpses sometimes birth a friendly maggot instead of DNA.',
    apply(s, l) { s.brood = 0.2 + 0.15 * l; },
  },
  mitosis: {
    name: 'Mitosis', slot: 'CORE', rarity: 'rare', max: 3, overlay: ['mitosis'],
    desc: 'Anything you hit bursts into fragments of you, shot or bite.',
    apply(s, l) { s.split += 1 + l; },
  },
  hemophage: {
    name: 'Hemophage', slot: 'CORE', rarity: 'rare', max: 3, overlay: ['drool'],
    desc: 'Bursting corpses can heal you (15% / 30% / 45%).',
    apply(s, l) { s.hemophage += 0.15 * l; },
  },
  secondheart: {
    name: 'Second Heart', slot: 'CORE', rarity: 'legendary', max: 1, overlay: ['heart2'],
    desc: 'The first time you die, you are reborn: pure, limbless, with 3 HP.',
    apply(s) { s.secondHeart = true; },
  },
  overgrown: {
    name: 'Overgrown Heart', slot: 'CORE', rarity: 'uncommon', max: 1, malignant: true, overlay: ['bigheart'],
    desc: 'Double damage from every source.',
    cost: 'Max health halved.',
    apply(s) { s.damageMul *= 2; s.hpMul *= 0.5; },
  },
  starving: {
    name: 'Starving Cells', slot: 'CORE', rarity: 'uncommon', max: 1, malignant: true, overlay: ['ribs'],
    desc: 'Corpses give double DNA.',
    cost: 'Go 30s without bursting a corpse and you starve, losing health (never fatal).',
    apply(s) { s.dnaMul *= 2; s.starve = 30; },
  },
  hollow: {
    name: 'Hollow Body', slot: 'CORE', rarity: 'uncommon', max: 1, malignant: true, overlay: ['hollow'],
    desc: 'Much faster, and you attack faster.',
    cost: 'Every hit costs 2 health.',
    apply(s) { s.speedMul *= 1.35; s.rateMul *= 0.85; s.hitCost = 2; },
  },
  cancer: {
    name: 'Cancerous Growth', slot: 'CORE', rarity: 'rare', max: 1, malignant: true, overlay: ['tumor'],
    desc: '+10% damage for every room you clear, forever.',
    cost: 'Every 3rd room cleared, it takes 1 max health.',
    apply(s, l, p) {
      const rooms = (p && p.cancerRooms) || 0;
      s.damageMul *= 1 + 0.1 * rooms;
      s.maxHp -= Math.floor(rooms / 3);
    },
  },
  twin: {
    name: 'Twin Embryo', slot: 'CORE', rarity: 'rare', max: 1, malignant: true,
    desc: 'A tiny twin follows you and copies your attacks.',
    cost: 'If it dies, you lose 1 max health.',
    apply(s, l, p) { s.twin = true; s.maxHp -= (p && p.twinLost) || 0; },
  },
};

// COMBINE recipes: two mutations from the same slot fuse into one.
// The result keeps both parts' effects (at their levels) PLUS its `apply` bonus.
// "CURED" recipes remove a malignant mutation's cost.
const RECIPES = {
  // --- MOUTH ---
  bonejaws:     { name: 'Bone Jaws',         parts: ['spike', 'mandibles'],     rarity: 'rare',      desc: 'Every attack bites up close AND fires a spike, a little faster.', apply(s) { s.rateMul *= 0.85; } },
  barbedlash:   { name: 'Barbed Lash',       parts: ['spike', 'tentacles'],     rarity: 'rare',      desc: 'Bone-tipped tendrils: much longer reach, +1 target, and wounds bleed.', apply(s) { s.lashRange += 25; s.lashTargets += 1; s.lashBleed = 2; } },
  venomspike:   { name: 'Venom Spike',       parts: ['spike', 'bile'],          rarity: 'rare',      desc: 'Bile-soaked spikes: burning pools and bleeding wounds, faster.', apply(s) { s.spikeBleed = 1.5; s.rateMul *= 0.8; s.nativeStream = false; s.spread = 0; s.range = 0.8; s.acidChance = 0; } },
  mawtendrils:  { name: 'Maw Tendrils',      parts: ['mandibles', 'tentacles'], rarity: 'rare',      desc: 'Tendrils drag prey into your jaws, then you bite.', apply(s) { s.pull = true; s.biteDmg += 1; s.biteReach += 6; } },
  acidmaw:      { name: 'Acid Maw',          parts: ['mandibles', 'bile'],      rarity: 'rare',      desc: 'Brutal bites that leave burning bile.', apply(s) { s.biteDmg += 2; s.biteAcid = 14; } },
  caustic:      { name: 'Caustic Tendrils',  parts: ['tentacles', 'bile'],      rarity: 'rare',      desc: 'Lashes leave bile pools under every target. +1 target.', apply(s) { s.lashAcid = 10; s.lashTargets += 1; } },
  apexjaws:     { name: 'Apex Jaws',         parts: ['feral', 'mandibles'],     rarity: 'legendary', desc: 'Every lunge bites twice. Bites can heal.', apply(s) { s.doubleBite = true; s.biteHeal = 0.1; } },
  // --- HEAD ---
  juggernaut:   { name: 'Juggernaut',        parts: ['skull', 'horns'],         rarity: 'legendary', desc: 'Massive charges. Killing with a charge instantly refreshes your dash.', apply(s) { s.dashDmg += 6; s.dashCd *= 0.6; s.dashReset = true; } },
  owleyes:      { name: 'Owl Eyes',          parts: ['nighteyes', 'eyes'],      rarity: 'rare',      desc: 'CURED. Keep the darkness bonus, and your light returns to normal.', apply(s) { s.lightMul = 1; } },
  symbiote:     { name: 'Symbiote',          parts: ['parasite', 'antennae'],   rarity: 'legendary', desc: 'CURED. The parasite works with you now: keep the damage, keep control.', apply(s) { s.symbiote = true; } },
  // --- BACK ---
  carapace:     { name: 'Carapace',          parts: ['spines', 'chitin'],       rarity: 'rare',      desc: 'Shell regrows faster and explodes into 16 shards when broken.', apply(s) { s.shieldCd *= 0.6; s.shieldRing = 16; } },
  urchinhide:   { name: 'Urchin Hide',       parts: ['spines', 'barbs'],        rarity: 'rare',      desc: 'Bigger shard rings whose shards split, and nastier barbs.', apply(s) { s.ring += 6; s.ringSplit = 2; s.thorns += 2; } },
  venomquills:  { name: 'Venom Quills',      parts: ['spines', 'toxic'],        rarity: 'rare',      desc: 'Shard rings leave bile wherever they land.', apply(s) { s.ring += 6; s.ringAcid = true; } },
  fightflight:  { name: 'Fight or Flight',   parts: ['twitch', 'adrenal'],      rarity: 'rare',      desc: 'After being hurt you also attack twice as fast for a while.', apply(s) { s.adrenalRage = true; s.adrenal += 1; } },
  hardened:     { name: 'Hardened Membrane', parts: ['membrane', 'chitin'],     rarity: 'legendary', desc: 'CURED. Shots still pierce everything, and you get normal invulnerability back.', apply(s) { s.invulnCap = 99; } },
  // --- LIMBS ---
  carrionfly:   { name: 'Carrion Fly',       parts: ['spider', 'wings'],        rarity: 'rare',      desc: 'Legs to steer with: fast flight without the drift.', apply(s) { s.accel = 1100; s.drag = 5; s.speed += 10; } },
  silktendril:  { name: 'Silk Tendril',      parts: ['spider', 'grapple'],      rarity: 'rare',      desc: 'Grapple twice as often and shred anything you are dragged through.', apply(s) { s.grapple *= 0.5; s.pullThrough = true; } },
  locust:       { name: 'Locust',            parts: ['hindlegs', 'wings'],      rarity: 'rare',      desc: 'Fly freely, and pounce from the air with bigger shockwaves.', apply(s) { s.hop = 0; s.slamDmg += 3; s.slamR += 12; s.dashTime += 0.05; } },
  huntsman:     { name: 'Huntsman',          parts: ['hindlegs', 'spider'],     rarity: 'legendary', desc: 'Skitter smoothly at speed, and pounce with brutal force.', apply(s) { s.hop = 0; s.speed += 14; s.slamDmg += 4; } },
  moleworm:     { name: 'Moleworm',          parts: ['burrow', 'centipede'],    rarity: 'rare',      desc: 'Tunnel longer, shredding everything you pass beneath.', apply(s) { s.moleworm = true; s.burrow += 0.25; } },
  pupa:         { name: 'Pupa',              parts: ['wings', 'shell'],         rarity: 'legendary', desc: 'Withdraw into a cocoon to slowly heal, then burst out flying.', apply(s) { s.pupa = true; } },
  puppeteer:    { name: 'Puppeteer',         parts: ['grapple', 'hands'],       rarity: 'legendary', desc: 'Your tentacle drags enemies to YOU, straight into your hands.', apply(s) { s.puppeteer = true; } },
  // --- CORE ---
  titanheart:   { name: 'Titan Heart',       parts: ['overgrown', 'hide'],      rarity: 'legendary', desc: 'CURED. Keep double damage, and +25% max health instead of half.', apply(s) { s.hpMul *= 2.5; } },
  apexpredator: { name: 'Apex Predator',     parts: ['starving', 'hemophage'],  rarity: 'legendary', desc: 'CURED. Keep double DNA. You never starve, and bursts heal more often.', apply(s) { s.starve = 0; s.hemophage += 0.3; } },
  benignmass:   { name: 'Benign Mass',       parts: ['cancer', 'regrow'],       rarity: 'legendary', desc: 'CURED. The growth keeps making you stronger, but no longer costs health.', apply(s, l, p) { s.maxHp += Math.floor(((p && p.cancerRooms) || 0) / 3); } },
  bonelattice:  { name: 'Bone Lattice',      parts: ['hollow', 'calcified'],    rarity: 'legendary', desc: 'CURED. A hollow frame of bone: fast, sturdy, and hits cost 1 health again.', apply(s) { s.hitCost = 1; s.speedMul /= 0.85; } },
};

// WHISPERS: the cryptic line that appears when something new grows in you.
// Cards never explain mutations; these hint at what just changed.
const HINTS = {
  // MOUTH
  spike: 'Bone grows behind your teeth, waiting to leave.',
  bile: 'Your stomach turns. Hold it open, and it pours out burning.',
  spores: 'Something grows in your lungs. Cough it high, over their heads.',
  vomit: 'Your gut heaves toward whatever stands in front of you.',
  mandibles: 'Pincers twitch at your lips. Get close.',
  leech: 'A ring of tiny teeth. Every small taste comes back to you.',
  tentacles: 'Something long uncoils in your throat, reaching.',
  feral: 'You no longer want to spit. You want to pounce.',
  proboscis: 'A thin, hungry tube. Hold on, and drink.',
  // HEAD
  eyes: 'More eyes. They follow whatever you throw.',
  antennae: 'The dark has a texture now. You can feel them moving.',
  compound: 'A thousand lenses. Everything near you slows to a crawl.',
  skull: 'Your head hardens. Use it.',
  horns: 'Horns, heavy and curved. What they pierce keeps bleeding.',
  echo: 'There is a scream in your skull. Lunge, and let it out.',
  abyssal: 'It sees through flesh. So will everything you throw.',
  nighteyes: 'The light hurts now. You hunt best where it cannot reach.',
  parasite: 'Something else is thinking in there. It is stronger than you.',
  // BACK
  spines: 'Shards rest under your skin. Anything sudden sets them loose.',
  barbs: 'Your skin is no longer safe to touch.',
  pustules: 'Your back is ripe. Let them touch it.',
  twitch: 'Your spine will not stop twitching. Neither will your aim.',
  adrenal: 'Pain is a door. Through it, you run.',
  chitin: 'A plate is forming. It will take one blow, then grow back.',
  toxic: 'Your blood is wrong now. Whoever spills it will regret it.',
  eggsac: 'You are carrying something. Pain will hatch it.',
  lure: 'A little light sways on your back. They will watch it, not you.',
  molt: 'Your skin is loose. Once a room, you could step out of it.',
  membrane: 'So thin. Your shots slip through. So does everything else.',
  // LIMBS
  spider: 'Eight legs. Finally, you can run.',
  fins: 'You glide where you have already been. Follow your own trail.',
  cilia: 'A thousand hairs carry you, smooth as a current.',
  wings: 'Wings, wet and new. They do not stop when you do.',
  hindlegs: 'Coiled legs. Leap, and the ground will feel it.',
  mantis: 'Blades fold against your sides. Lunge through them.',
  stilts: 'Long bones lift you. Their filth cannot reach you up here.',
  shell: 'A shell. Be still, and nothing can reach you.',
  grapple: 'A long arm aches to be thrown. Right-click, and let it pull you.',
  centipede: 'Your body stretches out behind you, armored. Let it take the shots.',
  burrow: 'Claws for digging. Dash, and go under.',
  hands: 'Hands. Human hands. Right-click to take something, and again to throw it.',
  // CORE
  hide: 'Thicker. Harder to tear.',
  marrow: 'Your bones are heavy now. Hold your fire, and let it build.',
  calcified: 'Your organs are turning to stone. Sturdier. Slower.',
  bacteria: 'Something lives in your gut. The dead grow richer, and tougher.',
  regrow: 'What is lost comes back. Slowly.',
  brood: 'Something in you wants to be born. Corpses make good nests.',
  mitosis: 'You split easily now. So does everything you hit.',
  hemophage: 'Breaking them open makes you whole.',
  secondheart: 'A second beat, quiet, waiting for the first to stop.',
  overgrown: 'Your heart swells. Every blow lands twice as hard. Theirs too.',
  starving: 'Hungry. Always hungry. Do not stop feeding.',
  hollow: 'Hollow inside. Light, fast, and easy to break.',
  cancer: 'It grows every time you win. It takes something every third time.',
  twin: 'You are not alone in here anymore. Keep it alive.',
  // COMBINATIONS
  bonejaws: 'Teeth and bone, one mouth.',
  barbedlash: 'Tendrils tipped with bone. They reach far, and wounds stay open.',
  venomspike: 'The spikes come out wet now.',
  mawtendrils: 'What the tendrils catch, the jaws finish.',
  acidmaw: 'Every bite leaves something behind that burns.',
  caustic: 'The tendrils sweat bile.',
  apexjaws: 'Every leap ends twice. Every bite feeds.',
  juggernaut: 'Nothing stops the charge. Every kill feeds the next.',
  owleyes: 'Your eyes have made peace with the light.',
  symbiote: 'It speaks with you now, not over you.',
  carapace: 'When the shell breaks, it breaks outward.',
  urchinhide: 'Every surface of you is a weapon.',
  venomquills: 'The shards come out wet.',
  fightflight: 'Hurt it, and it moves faster than thought.',
  hardened: 'The membrane has hardened. You can take a hit again.',
  carrionfly: 'Wings that finally listen to legs.',
  silktendril: 'Silk on the tentacle. It pulls faster, and cuts what it passes.',
  locust: 'You fall from the sky like a swarm.',
  huntsman: 'Long legs that run, and leap, and land hard.',
  moleworm: 'Burrow deeper. What is above you is only in your way.',
  pupa: 'Close the shell and change. It mends what is inside.',
  puppeteer: 'The tentacle brings them to your hands.',
  titanheart: 'The swollen heart settles. It holds more now.',
  apexpredator: 'The hunger is answered. Every kill feeds you.',
  benignmass: 'The growth calms. It still grows, but takes nothing.',
  bonelattice: 'Hollow and strong at once. Hits cost what they should.',
};

function getMutDef(id) {
  return MUTATIONS[id] || RECIPES[id];
}

function slotOf(id) {
  const d = getMutDef(id);
  return d.slot || MUTATIONS[d.parts[0]].slot;
}

function findRecipe(a, b) {
  for (const id in RECIPES) {
    const p = RECIPES[id].parts;
    if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return id;
  }
  return null;
}

// Which overlay sprites to draw for a mutation (combos show both parts).
function mutOverlays(id) {
  const d = getMutDef(id);
  if (d.parts) return d.parts.flatMap(p => MUTATIONS[p].overlay || []);
  return d.overlay || [];
}

// Add one slot's effects to a stat sheet.
function applyMutation(s, owned, p) {
  const d = getMutDef(owned.id);
  if (d.parts) {
    for (const part of d.parts) MUTATIONS[part].apply(s, owned.parts[part], p);
    d.apply(s, 1, p);
  } else {
    d.apply(s, owned.level, p);
  }
}

// Does the player have this mutation anywhere (alone or inside a combo)?
function hasMutation(p, id) {
  for (const slot of SLOTS) {
    const m = p.slots[slot];
    if (!m) continue;
    if (m.id === id || (m.parts && m.parts[id])) return true;
  }
  return false;
}

// What would happen if you picked mutation `id`?
//   'install' | 'levelup' | 'feed' (level a part inside a combo) | 'occupied' | 'maxed'
function pickOutcome(p, id) {
  const d = MUTATIONS[id];
  const occ = p.slots[d.slot];
  if (!occ) return 'install';
  if (occ.id === id) return occ.level < d.max ? 'levelup' : 'maxed';
  if (occ.parts && occ.parts[id] !== undefined) return occ.parts[id] < d.max ? 'feed' : 'maxed';
  return 'occupied';
}

// Pick `n` cards, weighted by rarity. Deeper floors make rare ones likelier.
// Cards that would combine with what you have show up more often.
function rollChoices(p, n, minRarity) {
  const minIdx = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const luck = r => (r === 'rare' || r === 'legendary') ? 1 + 0.2 * (game.depth - 1) : 1;
  const cands = [];
  for (const id in MUTATIONS) {
    const d = MUTATIONS[id];
    const outcome = pickOutcome(p, id);
    if (outcome === 'maxed') continue;
    if (RARITY_ORDER.indexOf(d.rarity) < minIdx) continue;
    const occ = p.slots[d.slot];
    let w = RARITY[d.rarity].weight * luck(d.rarity);
    if (d.malignant) w *= 0.7;
    if (outcome === 'install') w *= 1.3;
    if (outcome === 'occupied' && findRecipe(id, occ.id)) w *= 2.5;
    cands.push({ id, w });
  }
  const out = [];
  while (out.length < n && cands.length) {
    let total = 0;
    for (const c of cands) total += c.w;
    let r = Math.random() * total;
    let i = 0;
    while (i < cands.length - 1 && (r -= cands[i].w) > 0) i++;
    out.push(cands.splice(i, 1)[0]);
  }
  if (!out.length) out.push({ id: '_gorge' });
  return out;
}

// Everything a card needs to show.
function choiceInfo(p, c) {
  if (c.id === '_gorge') {
    return { name: 'Gorge', rarity: 'common', desc: 'Nothing left to evolve. Heal 2 HP.', status: '', overlays: [], slot: '' };
  }
  const d = MUTATIONS[c.id];
  const occ = p.slots[d.slot];
  const outcome = pickOutcome(p, c.id);
  let status = '', note = null, noteColor = PAL.white;
  if (outcome === 'install') status = d.max > 1 ? 'NEW' : 'UNIQUE';
  else if (outcome === 'levelup') status = `LV ${occ.level} > ${occ.level + 1}`;
  else if (outcome === 'feed') { status = `LV ${occ.parts[c.id]} > ${occ.parts[c.id] + 1}`; note = 'INSIDE ' + getMutDef(occ.id).name; noteColor = PAL.slate; }
  else {
    const r = findRecipe(c.id, occ.id);
    status = 'SLOT TAKEN';
    if (r) { note = 'CAN COMBINE: ' + RECIPES[r].name; noteColor = RARITY[RECIPES[r].rarity].color; }
    else { note = 'WOULD REPLACE ' + getMutDef(occ.id).name; noteColor = COST_COLOR; }
  }
  return {
    id: c.id, name: d.name, rarity: d.rarity, desc: d.desc, cost: d.cost, malignant: !!d.malignant,
    slot: d.slot, status, note, noteColor, outcome, overlays: mutOverlays(c.id),
  };
}

// --- Applying a choice ------------------------------------------------------------
// action: 'install' | 'levelup' | 'feed' | 'replace' | 'combine'
function applyChoice(p, c, action) {
  if (c.id === '_gorge') { p.hp = Math.min(p.maxHp, p.hp + 2); return; }
  p.evolutions++;
  const d = MUTATIONS[c.id];
  const slot = d.slot;
  const occ = p.slots[slot];
  action = action || pickOutcome(p, c.id);

  if (action === 'combine') {
    const rid = findRecipe(c.id, occ.id);
    const r = RECIPES[rid];
    p.slots[slot] = { id: rid, level: 1, parts: { [occ.id]: occ.level, [c.id]: 1 } };
    game.banner = { text: 'COMBINED', sub: r.name, color: RARITY[r.rarity].color, t: 2.5 };
    whisper(HINTS[rid]);
    burst(p.x, p.y, RARITY[r.rarity].color, 30, 120, 0.8);
    bloodSpray(p.x, p.y, 0, 0, 25, FLUID.blood, 120);
    game.shake = 4;
    Sfx.play('splice');
  } else {
    if (action === 'levelup') occ.level++;
    else if (action === 'feed') occ.parts[c.id]++;
    else p.slots[slot] = { id: c.id, level: 1 }; // install / replace
    if (action === 'replace') bloodSpray(p.x, p.y, 0, 0, 14, FLUID.blood, 90); // the old part tears off
    if (action === 'install' || action === 'replace') whisper(HINTS[c.id]); // something new: a hint
    if (d.onGain) d.onGain(p);
    floatText(p.x, p.y - 14, d.name.toUpperCase(), d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color);
    Sfx.play('absorb');
  }
  recomputeStats(p);
}

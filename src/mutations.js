'use strict';
// ---------------------------------------------------------------------------
// MUTATIONS: the heart of the game.
//
// Your body has 5 SLOTS. Every mutation grows in one of them:
//   MOUTH: your attack (fire button). You start spitting little slime blobs.
//   LIMBS: how you move. You start limbless, as a slow slug.
//   HEAD, BACK, CORE: everything else.
//
// Each slot grows ONE path per run:
//   empty slot  -> pick a ROOT. It's planted for the rest of the run.
//   filled slot -> it BRANCHES. Two ways to go; taking one locks out the other.
//   root -> branch -> branch, then it's fully grown (4 end forms per root).
// So every evolution is a choice that closes doors, and no two runs end the same.
//
// Each node tweaks the stat sheet (see baseStats); branches mostly set flags
// that the game code reacts to (Bone Jaws: every bite drives a spike out the
// back of the victim). The more involved mechanics live in abilities.js.
//
// To add a branch: add an entry to MUTATIONS with `from: '<parent id>'`, plus a
// whisper in HINTS. Art: paint an icon in sprites.js (ICON_PAINT), or reuse two
// with `icon: ['a', 'b']`.
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

const SLUG_SPEED = 60; // limbless crawl (before its pulsing)

function baseStats() {
  return {
    // --- Movement (set by whatever is in your LIMBS). Limbless = a slow slug. ---
    speed: SLUG_SPEED, slug: true, accel: 0, drag: 0, flyover: false, hop: 0, dashSpeed: 260,
    grapple: 0, grappleRange: 0, pullDmg: 0, pullThrough: false,
    centipede: 0, burrow: 0, burrowDmg: 0, shell: false, fins: 0, stilts: false, hands: false, handDmg: 0,
    pupa: false, moleworm: false, puppeteer: false,
    limbCount: 0,
    // --- Attacks (MOUTH). Every weapon fires on its own timer, so they stack. ---
    damageMul: 1, rateMul: 1, damage: 1,
    guns: [],     // projectile weapons (see gun() below)
    rangeAdd: 0, speedAdd: 0, // extra shot range / speed (Extra Eyes, Bone Lance)
    bite: false, biteDmg: 0, biteDelay: 9, biteReach: 18, biteAcid: 0, biteHeal: 0, doubleBite: false, leech: 0,
    lash: false, lashDmg: 0, lashDelay: 9, lashRange: 52, lashTargets: 1, lashBleed: 0, lashAcid: 0, pull: false,
    lunge: false, lungeDmg: 0, lungeDelay: 9,
    beam: 0, beamRange: 70, vomit: 0, vomitDmg: 0, vomitDelay: 9,
    // Firing style: WHAT you fire comes from MOUTH; HOW can be changed by a
    // path (charge & blast, or rapid stream).
    charge: false, stream: false, chargeBonus: false,
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
  for (const k of ['biteDmg', 'lashDmg', 'lungeDmg', 'dashDmg', 'slamDmg', 'thorns', 'toxicBlood', 'pullDmg', 'beam', 'vomitDmg', 'burrowDmg', 'handDmg']) s[k] *= m;
  for (const k of ['biteDelay', 'lashDelay', 'lungeDelay', 'vomitDelay']) s[k] *= s.rateMul;
  for (const g of s.guns) {
    g.dmg *= m; g.delay *= s.rateMul; g.range += s.rangeAdd; g.speed += s.speedAdd;
    g.acid = Math.max(g.acid, s.acid);
  }
  s.speed *= s.speedMul;
  // Hind legs only hop if they're your only limbs; with others you walk and still pounce.
  if (s.hop && s.limbCount > 1) s.hop = 0;
  s.slimeTrail = s.slug || s.fins > 0 || s.shell; // slugs, snails and pseudopods leave slime
  // A limbless slug can only manage a short, weak lurch.
  if (s.slug) { s.dashSpeed = 190; s.dashCd *= 1.25; s.dashTime = Math.min(s.dashTime, 0.12); }
  // Firing styles. Charge wins over stream (stream then adds pellets to the blast).
  s.chargeBonus = s.chargeBonus || (s.charge && s.stream);
  if (s.charge) s.stream = false;
  if (s.stream) {
    for (const g of s.guns) if (!g.native) { g.delay *= 0.35; g.dmg *= 0.45; g.spread += 0.16; g.range *= 0.8; g.cloud *= 0.6; }
    s.biteDelay *= 0.35; s.lashDelay *= 0.35; s.lungeDelay *= 0.4; s.vomitDelay *= 0.35;
    s.biteDmg *= 0.55; s.lashDmg *= 0.55; s.lungeDmg *= 0.55; s.vomitDmg *= 0.5;
  }
  s.biteReach += s.reach;
  s.lashRange += s.reach * 2;
  s.invuln = Math.min(s.invuln, s.invulnCap);
}

// Add a projectile weapon. Each one fires on its own timer.
function gun(s, props) {
  s.guns.push(Object.assign({
    id: '', dmg: 1, delay: 0.75, speed: 155, range: 0.7, r: 2, count: 1, spread: 0,
    acid: 0, acidChance: 0, bleed: 0, lob: false, cloud: 0, round: false, fade: false,
    native: false, color: '#cfc4a4', sound: 'shoot',
  }, props));
}
// ===========================================================================
// THE TREE. Every slot has a few ROOTS. Each root splits into 2 branches,
// and each branch into 2 more: root -> tier 1 -> tier 2 (4 end forms).
//   `slot` marks a root, `from` marks a branch (its parent).
//   `part: true` entries are never offered; other nodes borrow their effects.
// Every node in your path is applied with l = how far the path has grown
// (1-3), so roots keep getting stronger as they branch.
// Branches mostly add NEW INTERACTIONS (flags the game code reacts to)
// instead of bigger numbers.
// ===========================================================================
const MUTATIONS = {
  // ================= MOUTH: your attack =================
  // You're born spitting little slime blobs. It never branches: your first
  // MOUTH pick replaces it with a real root.
  slime: {
    name: 'Slime Blob', slot: 'MOUTH', part: true, rarity: 'common',
    desc: 'Spit a slow little glob of slime.',
    apply(s) { gun(s, { id: 'slime', dmg: 0.9, delay: 0.7, speed: 115, range: 0.6, r: 2.5, round: true, color: '#9aae8a', sound: 'splat' }); },
  },
  spike: {
    name: 'Bone Spike', slot: 'MOUTH', rarity: 'common',
    desc: 'Fire a slow bone spike. Harder and faster as it grows; twin spikes at full growth.',
    apply(s, l) { gun(s, { id: 'spike', dmg: 1 + 0.4 * (l - 1), delay: 0.75 - 0.1 * (l - 1), count: l >= 3 ? 2 : 1 }); },
  },
  shotgun: {
    name: 'Bone Shotgun', from: 'spike', rarity: 'uncommon', icon: ['spike', 'marrow'],
    desc: 'Hold fire to charge, release to blast a spray of bone shrapnel.',
    apply(s) { s.charge = true; },
  },
  bonejaws: {
    name: 'Bone Jaws', from: 'shotgun', rarity: 'rare', overlay: ['mandibles'], icon: ['spike', 'mandibles'],
    desc: 'Mandibles too: every bite drives a bone spike out through the back of the victim.',
    apply(s, l) { MUTATIONS.mandibles.apply(s, l); s.boneJaws = true; },
  },
  shrapnel: {
    name: 'Shrapnel Storm', from: 'shotgun', rarity: 'rare', icon: ['spike', 'mitosis'],
    desc: 'Half again as much shrapnel, and every piece shatters into fragments on a hit.',
    apply(s) { s.chargeBonus = true; s.blastSplit = 2; },
  },
  lance: {
    name: 'Bone Lance', from: 'spike', rarity: 'uncommon', icon: ['spike', 'eyes'],
    desc: 'Faster, longer spikes that punch through one enemy.',
    apply(s) { s.speedAdd += 70; s.rangeAdd += 0.25; s.pierce += 1; },
  },
  barbedlash: {
    name: 'Barbed Lash', from: 'lance', rarity: 'rare', overlay: ['tentacles'], icon: ['spike', 'tentacles'],
    desc: 'Tendrils too: every lash flings a bone spike from the victim to the next enemy.',
    apply(s, l) { MUTATIONS.tentacles.apply(s, l); s.barbedLash = true; },
  },
  venomspike: {
    name: 'Venom Lance', from: 'lance', rarity: 'rare', overlay: ['acid'], icon: ['spike', 'bile'],
    desc: 'Spikes drip burning bile along their whole flight.',
    apply(s) { s.venomSpike = true; },
  },

  bile: {
    name: 'Bile Spit', slot: 'MOUTH', rarity: 'uncommon', overlay: ['acid'],
    desc: 'Flamethrower. Hold fire to spray a fast, short-range stream of burning bile.',
    apply(s, l) {
      gun(s, {
        id: 'bile', dmg: 0.22 + 0.08 * l, delay: 0.09, speed: 175, range: 0.36 + 0.03 * l, spread: 0.22,
        acid: 7 + 2 * l, acidChance: 0.25, round: true, fade: true, native: true, color: '#b0c040', sound: 'spray',
      });
    },
  },
  sporefire: {
    name: 'Spore Fire', from: 'bile', rarity: 'rare', overlay: ['sporepods'], icon: ['bile', 'mitosis'],
    desc: 'A spore mortar too, and your bile flame ignites spore clouds into burning blasts.',
    apply(s, l) { MUTATIONS.spores.apply(s, l); s.sporeFire = true; },
  },
  rotbloom: {
    name: 'Rot Bloom', from: 'sporefire', rarity: 'rare', icon: ['mitosis', 'regrow'],
    desc: 'Spore clouds are bigger and slowly eat whatever is lost inside them.',
    apply(s) { s.cloudDps = 1.2; s.cloudMul = 1.4; },
  },
  bilemortar: {
    name: 'Bile Mortar', from: 'sporefire', rarity: 'rare', icon: ['bile', 'spike'],
    desc: 'Mortar shells burst into wide pools of burning bile.',
    apply(s) { s.lobAcid = 16; },
  },
  acidmaw: {
    name: 'Acid Maw', from: 'bile', rarity: 'rare', overlay: ['mandibles'], icon: ['mandibles', 'bile'],
    desc: 'Mandibles too: anything you bite rots inside, and bursts into bile when it dies.',
    apply(s, l) { MUTATIONS.mandibles.apply(s, l); s.acidMaw = true; },
  },
  vomit: {
    name: 'Vomit Stream', from: 'acidmaw', rarity: 'uncommon', icon: ['bile', 'hemophage'],
    desc: 'A short-range gush of bile that shoves enemies back.',
    apply(s, l) { s.vomit = 6 + 2 * l; s.vomitDmg += 0.5 + 0.2 * l; s.vomitDelay = Math.min(s.vomitDelay, 0.45); },
  },
  meltbite: {
    name: 'Melting Bite', from: 'acidmaw', rarity: 'rare', icon: ['mandibles', 'toxic'],
    desc: 'Bites deal triple damage to anything standing in your bile.',
    apply(s) { s.meltBite = true; },
  },

  mandibles: {
    name: 'Mandibles', slot: 'MOUTH', rarity: 'common', overlay: ['mandibles'],
    desc: 'Melee. Fire bites whatever is in front of you, hard and fast.',
    apply(s, l) { s.bite = true; s.biteDmg += 2 + 1.2 * l; s.biteDelay = Math.min(s.biteDelay, 0.42 - 0.04 * l); },
  },
  feral: {
    name: 'Feral Lunge', from: 'mandibles', rarity: 'rare', overlay: ['fangs'],
    desc: 'Fire also leaps forward and savages everything in front of you.',
    apply(s, l) { s.lunge = true; s.lungeDmg += 5 + 2 * l; s.lungeDelay = Math.min(s.lungeDelay, 0.5); },
  },
  apexjaws: {
    name: 'Apex Jaws', from: 'feral', rarity: 'legendary', icon: ['feral', 'mandibles'],
    desc: 'Every lunge bites twice, and a lunge that kills lets you lunge again at once.',
    apply(s) { s.doubleBite = true; s.lungeChain = true; },
  },
  rending: {
    name: 'Rending Leap', from: 'feral', rarity: 'rare', overlay: ['drool'], icon: ['feral', 'horns'],
    desc: 'Lunges leave deep bleeding wounds, and biting a bleeding enemy can heal you.',
    apply(s) { s.lungeBleed = 3; s.bleedFeed = 0.12; },
  },
  mawtendrils: {
    name: 'Maw Tendrils', from: 'mandibles', rarity: 'rare', overlay: ['tentacles'], icon: ['mandibles', 'tentacles'],
    desc: 'Tendrils too, and they drag prey straight into your jaws.',
    apply(s, l) { MUTATIONS.tentacles.apply(s, 1); s.pull = true; s.biteReach += 6; },
  },
  leech: {
    name: 'Leech Mouth', from: 'mawtendrils', rarity: 'uncommon', overlay: ['leech'], icon: ['mandibles', 'hemophage'],
    desc: 'Rapid little bites. Every few bites heal you.',
    apply(s, l) { s.biteDelay = Math.min(s.biteDelay, 0.26); s.leech = 7 - l; },
  },
  devour: {
    name: 'Devour', from: 'mawtendrils', rarity: 'legendary', overlay: ['fangs'], icon: ['mandibles', 'starving'],
    desc: 'Biting a badly wounded enemy swallows it whole.',
    apply(s) { s.devour = 0.35; },
  },

  tentacles: {
    name: 'Tendrils', slot: 'MOUTH', rarity: 'uncommon', overlay: ['tentacles'],
    desc: 'Melee. Fire lashes enemies in front of you at mid range: 1 / 2 / 3 targets.',
    apply(s, l) { s.lash = true; s.lashDmg += 1.5 + 0.8 * l; s.lashTargets = Math.max(s.lashTargets, l); s.lashDelay = Math.min(s.lashDelay, 0.6 - 0.05 * l); },
  },
  caustic: {
    name: 'Caustic Tendrils', from: 'tentacles', rarity: 'rare', overlay: ['acid'], icon: ['tentacles', 'bile'],
    desc: 'Lashed enemies leak burning bile wherever they crawl.',
    apply(s) { s.caustic = true; },
  },
  writhing: {
    name: 'Writhing Mass', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'grapple'],
    desc: 'Many more tendrils: +2 targets and longer reach.',
    apply(s) { s.lashTargets += 2; s.lashRange += 15; },
  },
  strangle: {
    name: 'Strangle', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'echo'],
    desc: 'Lashed enemies are held fast for a moment.',
    apply(s) { s.lashStun = 0.6; },
  },
  hooks: {
    name: 'Bone Hooks', from: 'tentacles', rarity: 'uncommon', icon: ['tentacles', 'spike'],
    desc: 'Hooked tendrils: much longer reach, and wounds bleed.',
    apply(s) { s.lashRange += 25; s.lashBleed = 2; },
  },
  lashdrain: {
    name: 'Sucker Tips', from: 'hooks', rarity: 'rare', icon: ['tentacles', 'hemophage'],
    desc: 'Tendrils drink as they lash. Enough blood heals you.',
    apply(s) { s.lashDrain = true; },
  },
  flay: {
    name: 'Flay', from: 'hooks', rarity: 'rare', icon: ['tentacles', 'barbs'],
    desc: 'Lashing a bleeding enemy tears it open into a spray of shards.',
    apply(s) { s.flay = true; },
  },

  proboscis: {
    name: 'Proboscis', slot: 'MOUTH', rarity: 'rare', overlay: ['proboscis'],
    desc: 'Hold fire to latch a draining beam onto prey. Drained blood heals you.',
    apply(s, l) { s.beam += 0.25 + 0.1 * l; },
  },
  siphon: {
    name: 'Siphon', from: 'proboscis', rarity: 'rare', icon: ['proboscis', 'tentacles'],
    desc: 'The beam forks into a second victim nearby.',
    apply(s) { s.beamChain = true; },
  },
  hemorrhage: {
    name: 'Hemorrhage', from: 'siphon', rarity: 'rare', icon: ['proboscis', 'horns'],
    desc: 'Drained enemies keep bleeding after you let go.',
    apply(s) { s.beamBleed = 2; },
  },
  bloodbattery: {
    name: 'Blood Battery', from: 'siphon', rarity: 'rare', icon: ['proboscis', 'hide'],
    desc: 'You need half as much blood to heal.',
    apply(s) { s.drainHeal = 6; },
  },
  bloat: {
    name: 'Bloat', from: 'proboscis', rarity: 'rare', icon: ['proboscis', 'overgrown'],
    desc: 'Enemies drained to death swell and burst, spraying everything near them.',
    apply(s) { s.drainBurst = true; },
  },
  sporesac: {
    name: 'Spore Sac', from: 'bloat', rarity: 'rare', overlay: ['sporepods'], icon: ['proboscis', 'mitosis'],
    desc: 'Bursting victims release blinding spore clouds.',
    apply(s) { s.burstSpores = true; },
  },
  longtube: {
    name: 'Gorging Tube', from: 'bloat', rarity: 'rare', icon: ['proboscis', 'eyes'],
    desc: 'A longer, hungrier proboscis: much more reach and drain.',
    apply(s) { s.beamRange += 40; s.beam *= 1.5; },
  },
  // Not offered on its own: Spore Fire grows it.
  spores: {
    name: 'Spore Cough', slot: 'MOUTH', part: true, rarity: 'uncommon', overlay: ['sporepods'],
    desc: 'Mortar. Lob spores over cover to where you aim; they burst into blinding clouds.',
    apply(s, l) { gun(s, { id: 'spores', dmg: 0.8, delay: 0.9, lob: true, cloud: 20 + 4 * l, r: 3, color: '#7a8a52', sound: 'splat' }); },
  },

  // ================= HEAD =================
  eyes: {
    name: 'Extra Eyes', slot: 'HEAD', rarity: 'uncommon', overlay: ['eyes'],
    desc: 'Shots curve toward prey. Melee reaches further.',
    apply(s, l) { s.homing += 2 + 1.5 * l; s.rangeAdd += 0.1 * l; s.reach += 3 * l; },
  },
  compound: {
    name: 'Compound Eyes', from: 'eyes', rarity: 'uncommon', overlay: ['compound'], icon: ['eyes', 'chitin'],
    desc: 'A wider light, and enemy shots slow down near you.',
    apply(s, l) { s.lightMul *= 1.3; s.compound = l >= 3 ? 0.4 : 0.55; },
  },
  hivesight: {
    name: 'Hive Sight', from: 'compound', rarity: 'rare', overlay: ['antennae'], icon: ['eyes', 'spider'],
    desc: 'Feel them in the dark, and their shots nearly stop near you.',
    apply(s) { s.antennae = true; s.compound = 0.25; },
  },
  glare: {
    name: 'Glare', from: 'compound', rarity: 'rare', icon: ['eyes', 'abyssal'],
    desc: 'Every few seconds your eyes flash, blinding everything close to you.',
    apply(s) { s.glare = 3; },
  },
  abyssal: {
    name: 'Abyssal Eye', from: 'eyes', rarity: 'legendary', overlay: ['thirdeye'],
    desc: 'It sees through flesh. Shots pierce 2 enemies and seek. +30% damage.',
    apply(s) { s.pierce += 2; s.homing += 3; s.damageMul *= 1.3; },
  },
  evileye: {
    name: 'Evil Eye', from: 'abyssal', rarity: 'rare', icon: ['abyssal', 'nighteyes'],
    desc: 'Whatever you stare at takes 40% more damage from your shots.',
    apply(s) { s.gaze = 0.4; },
  },
  fractured: {
    name: 'Fractured Sight', from: 'abyssal', rarity: 'rare', overlay: ['mitosis'], icon: ['abyssal', 'mitosis'],
    desc: 'Every hit bursts into seeking fragments.',
    apply(s) { s.split += 2; },
  },

  skull: {
    name: 'Battering Skull', slot: 'HEAD', rarity: 'common', overlay: ['horns'],
    desc: 'Your dash becomes a charge that rams enemies for heavy damage.',
    apply(s, l) { s.dashDmg += 2 + 2 * l; },
  },
  horns: {
    name: 'Gore Horns', from: 'skull', rarity: 'uncommon', overlay: ['gorehorns'],
    desc: 'Charge further. Enemies you ram bleed out over time.',
    apply(s, l) { s.dashTime += 0.04 * l; s.dashDmg += l; s.bleed += 1.5 * l; },
  },
  juggernaut: {
    name: 'Juggernaut', from: 'horns', rarity: 'legendary', icon: ['skull', 'horns'],
    desc: 'Rammed enemies are launched into walls and each other. Charge kills refresh your dash.',
    apply(s) { s.juggernaut = true; s.dashReset = true; },
  },
  bloodletter: {
    name: 'Bloodletter', from: 'horns', rarity: 'rare', icon: ['horns', 'hemophage'],
    desc: 'Ramming an enemy that is already bleeding makes it burst, hurting everything near it.',
    apply(s) { s.bleedBurst = true; },
  },
  echo: {
    name: 'Echo Skull', from: 'skull', rarity: 'uncommon', overlay: ['echo'], icon: ['skull', 'antennae'],
    desc: 'You scream when you dash, stunning everything nearby.',
    apply(s, l) { s.echo = 0.9 + 0.3 * l; },
  },
  shatter: {
    name: 'Shatter Scream', from: 'echo', rarity: 'rare', icon: ['skull', 'spike'],
    desc: 'Stunned enemies take double damage.',
    apply(s) { s.stunBreak = true; },
  },
  banshee: {
    name: 'Banshee', from: 'echo', rarity: 'rare', icon: ['skull', 'twitch'],
    desc: 'Your scream hurls enemies away and shreds their shots out of the air.',
    apply(s) { s.banshee = true; },
  },

  nighteyes: {
    name: 'Night Eyes', slot: 'HEAD', rarity: 'uncommon', malignant: true, overlay: ['compound'],
    desc: '+50% damage (more as it grows) to enemies outside your light.',
    cost: 'Your light shrinks to a small circle.',
    apply(s, l) { s.nightEyes += 0.3 + 0.2 * l; s.lightMul *= 0.6; },
  },
  owleyes: {
    name: 'Owl Eyes', from: 'nighteyes', rarity: 'rare', cures: true, icon: ['nighteyes', 'eyes'],
    desc: 'CURED. Keep the darkness bonus, and your light returns to normal.',
    apply(s) { s.lightMul /= 0.6; },
  },
  antennae: {
    name: 'Antennae', from: 'owleyes', rarity: 'uncommon', overlay: ['antennae'],
    desc: 'Feel movement in the dark: see enemies as faint outlines. Hit the dark harder.',
    apply(s) { s.antennae = true; s.nightEyes += 0.3; },
  },
  stalker: {
    name: 'Stalker', from: 'owleyes', rarity: 'rare', icon: ['nighteyes', 'hemophage'],
    desc: 'Kills out in the dark can heal you.',
    apply(s) { s.darkHeal = 0.15; },
  },
  pitchblack: {
    name: 'Pitch Black', from: 'nighteyes', rarity: 'rare', malignant: true, icon: ['nighteyes', 'abyssal'],
    desc: 'Far more damage out in the dark.',
    cost: 'Your light shrinks even further.',
    apply(s) { s.nightEyes += 0.75; s.lightMul *= 0.8; },
  },
  darkstare: {
    name: 'Abyss Stare', from: 'pitchblack', rarity: 'rare', icon: ['nighteyes', 'echo'],
    desc: 'Shots that hit out in the dark stun.',
    apply(s) { s.darkStun = 0.5; },
  },
  lightless: {
    name: 'Lightless', from: 'pitchblack', rarity: 'legendary', malignant: true, overlay: ['antennae'], icon: ['nighteyes', 'starving'],
    desc: 'You feel them instead of seeing them, and the dark doubles everything.',
    cost: 'Almost no light at all.',
    apply(s) { s.antennae = true; s.nightEyes += 1; s.lightMul *= 0.6; },
  },

  parasite: {
    name: 'Parasite Brain', slot: 'HEAD', rarity: 'rare', malignant: true, overlay: ['parasite'],
    desc: '+60% damage with everything.',
    cost: 'Sometimes it takes control of your body.',
    apply(s) { s.damageMul *= 1.6; s.parasite = true; },
  },
  symbiote: {
    name: 'Symbiote', from: 'parasite', rarity: 'legendary', cures: true, icon: ['parasite', 'antennae'],
    desc: 'CURED. The parasite works with you now: keep the damage, keep control.',
    apply(s) { s.symbiote = true; },
  },
  brainworm: {
    name: 'Brain Worm', from: 'symbiote', rarity: 'rare', icon: ['parasite', 'echo'],
    desc: 'Your hits sometimes stun.',
    apply(s) { s.stunChance = 0.12; },
  },
  overmind: {
    name: 'Overmind', from: 'symbiote', rarity: 'rare', overlay: ['echo'], icon: ['parasite', 'skull'],
    desc: 'It screams through you when you dash, stunning everything near. +20% damage.',
    apply(s) { s.echo = Math.max(s.echo, 1.2); s.damageMul *= 1.2; },
  },
  rider: {
    name: 'Rider', from: 'parasite', rarity: 'rare', malignant: true, icon: ['parasite', 'twitch'],
    desc: '+30% more damage. While it drives, nothing can hurt you.',
    cost: 'It takes control far more often.',
    apply(s) { s.damageMul *= 1.3; s.parasiteInv = true; s.parasiteOften = true; },
  },
  berserkhost: {
    name: 'Berserker Host', from: 'rider', rarity: 'rare', icon: ['parasite', 'feral'],
    desc: 'While it drives, it attacks the nearest enemy for you, twice as fast.',
    apply(s) { s.parasiteFrenzy = true; },
  },
  cerebral: {
    name: 'Cerebral Bloat', from: 'rider', rarity: 'rare', malignant: true, icon: ['parasite', 'overgrown'],
    desc: '+40% more damage.',
    cost: '-1 max health.',
    apply(s) { s.damageMul *= 1.4; s.maxHp -= 1; },
  },

  // ================= BACK =================
  spines: {
    name: 'Bone Spurs', slot: 'BACK', rarity: 'common', overlay: ['spines'],
    desc: 'Dashing or getting hurt fires a ring of bone shards.',
    apply(s, l) { s.ring += 4 + 2 * l; },
  },
  urchinhide: {
    name: 'Urchin Hide', from: 'spines', rarity: 'rare', overlay: ['barbs'], icon: ['spines', 'barbs'],
    desc: 'Barbed skin, and anything that touches you sets off your shard ring.',
    apply(s, l) { s.thorns += 1 + l; s.urchinHide = true; },
  },
  venomquills: {
    name: 'Venom Quills', from: 'urchinhide', rarity: 'rare', overlay: ['acid'], icon: ['spines', 'toxic'],
    desc: 'Your shards leave bile wherever they land.',
    apply(s) { s.ringAcid = true; },
  },
  seekquills: {
    name: 'Seeking Quills', from: 'urchinhide', rarity: 'rare', icon: ['spines', 'eyes'],
    desc: 'Your shards hunt for flesh.',
    apply(s) { s.ringHoming = 5; },
  },
  quillpulse: {
    name: 'Quill Pulse', from: 'spines', rarity: 'uncommon', icon: ['spines', 'twitch'],
    desc: 'Your shard ring fires on its own every few seconds.',
    apply(s) { s.autoRing = 3; },
  },
  bonestorm: {
    name: 'Bone Storm', from: 'quillpulse', rarity: 'rare', icon: ['spines', 'marrow'],
    desc: 'Far more shards, and they pulse faster.',
    apply(s) { s.ring += 8; s.autoRing = 2; },
  },
  splitquills: {
    name: 'Splitting Quills', from: 'quillpulse', rarity: 'rare', icon: ['spines', 'mitosis'],
    desc: 'Every shard splits in two when it hits.',
    apply(s) { s.ringSplit = 2; },
  },

  chitin: {
    name: 'Chitin Shell', slot: 'BACK', rarity: 'uncommon', overlay: ['chitin'],
    desc: 'A shell that blocks one hit, then regrows. Regrows faster as it grows.',
    apply(s, l) { s.shieldCd = 14 - 3 * l; },
    onGain(p) { p.shieldUp = true; },
  },
  carapace: {
    name: 'Carapace', from: 'chitin', rarity: 'rare', overlay: ['spines'], icon: ['spines', 'chitin'],
    desc: 'When your shell breaks, it explodes into 16 shards.',
    apply(s) { s.shieldRing = 16; },
  },
  thornplate: {
    name: 'Thorned Plate', from: 'carapace', rarity: 'rare', overlay: ['barbs'], icon: ['chitin', 'barbs'],
    desc: 'While your shell is up, anything that touches you is shredded.',
    apply(s) { s.plateThorns = 4; },
  },
  reactive: {
    name: 'Reactive Plate', from: 'carapace', rarity: 'rare', icon: ['chitin', 'skull'],
    desc: 'When your shell breaks, it throws everything near you back.',
    apply(s) { s.shieldBlast = true; },
  },
  molt: {
    name: 'Exoskeleton Molt', from: 'chitin', rarity: 'rare', overlay: ['moltshell'], icon: ['chitin', 'regrow'],
    desc: 'Once per room, shed your skin to ignore a hit, leaving a decoy husk.',
    apply(s) { s.molt = true; },
  },
  huskbomb: {
    name: 'Husk Bomb', from: 'molt', rarity: 'rare', icon: ['chitin', 'toxic'],
    desc: 'Your shed husk bursts into bile when it falls apart.',
    apply(s) { s.huskBomb = true; },
  },
  endlessmolt: {
    name: 'Endless Molt', from: 'molt', rarity: 'rare', icon: ['chitin', 'secondheart'],
    desc: 'Your skin grows back loose: you can molt again after a while.',
    apply(s) { s.moltCd = 15; },
  },

  eggsac: {
    name: 'Egg Sac', slot: 'BACK', rarity: 'uncommon', overlay: ['eggs'],
    desc: 'When you are hurt, spiderlings hatch and fight for you.',
    apply(s, l) { s.eggsac = 1 + l; },
  },
  eggpods: {
    name: 'Egg Pods', from: 'eggsac', rarity: 'rare', overlay: ['pustules'], icon: ['spider', 'hemophage'],
    desc: 'Pustules cover your back. Anything that pops one burns, and a spiderling hatches.',
    apply(s, l) { s.pustules = 1 + 0.5 * l; s.eggPods = true; },
  },
  broodmother: {
    name: 'Broodmother', from: 'eggpods', rarity: 'rare', icon: ['spider', 'mitosis'],
    desc: 'Spiderlings hatch whenever you enter a room.',
    apply(s) { s.roomBrood = 2; },
  },
  venombrood: {
    name: 'Venom Brood', from: 'eggpods', rarity: 'rare', icon: ['spider', 'bile'],
    desc: 'Your spiderlings leave bile where they bite.',
    apply(s) { s.venomBrood = true; },
  },
  lure: {
    name: 'Bioluminescent Lure', from: 'eggsac', rarity: 'uncommon', overlay: ['lure'], icon: ['antennae', 'eyes'],
    desc: 'A glowing lure on your back draws enemies (and their aim) away from you.',
    apply(s) { s.lure = true; },
  },
  angler: {
    name: 'Anglerfish', from: 'lure', rarity: 'rare', icon: ['mandibles', 'eyes'],
    desc: 'Anything that reaches the lure gets bitten.',
    apply(s) { s.lureBite = 2; },
  },
  toxic: {
    name: 'Toxic Blood', from: 'lure', rarity: 'uncommon',
    desc: 'When you bleed, your blood burns everything around you.',
    apply(s, l) { s.toxicBlood += 2 + l; },
  },

  twitch: {
    name: 'Twitch Fibers', slot: 'BACK', rarity: 'common', overlay: ['twitch'],
    desc: 'Raw muscle along the spine. Move faster, attack faster, dash sooner.',
    apply(s, l) { s.speed += 10 * l; s.rateMul *= Math.pow(0.9, l); s.dashCd *= Math.pow(0.9, l); },
  },
  adrenal: {
    name: 'Adrenal Gland', from: 'twitch', rarity: 'common',
    desc: 'Longer invulnerability after a hit, plus a burst of speed.',
    apply(s, l) { s.invuln += 0.25 * l; s.adrenal = Math.max(s.adrenal, 0.8 + 0.6 * l); },
  },
  fightflight: {
    name: 'Fight or Flight', from: 'adrenal', rarity: 'rare', icon: ['twitch', 'adrenal'],
    desc: 'Getting hurt slows the world around you for a moment.',
    apply(s) { s.bulletTime = 1.6; },
  },
  rage: {
    name: 'Blood Rage', from: 'adrenal', rarity: 'rare', icon: ['adrenal', 'overgrown'],
    desc: 'After being hurt you also attack twice as fast for a while.',
    apply(s) { s.adrenalRage = true; s.adrenal += 1; },
  },
  streamfibers: {
    name: 'Stream Fibers', from: 'twitch', rarity: 'uncommon', icon: ['twitch', 'bile'],
    desc: 'Your attack becomes a rapid, wild stream.',
    apply(s) { s.stream = true; },
  },
  jitter: {
    name: 'Jitter', from: 'streamfibers', rarity: 'rare', icon: ['twitch', 'wings'],
    desc: 'Dash sooner, and every dash reloads every weapon at once.',
    apply(s) { s.dashCd *= 0.7; s.dashReload = true; },
  },
  needles: {
    name: 'Needle Stream', from: 'streamfibers', rarity: 'rare', icon: ['twitch', 'spike'],
    desc: 'The stream punches through an enemy.',
    apply(s) { s.pierce += 1; },
  },

  // ================= LIMBS: how you move =================
  // Empty LIMBS = a slow, inching slug.
  spider: {
    name: 'Spider Legs', slot: 'LIMBS', rarity: 'common', overlay: ['spiderlegs'],
    desc: 'Eight skittering legs. Quick, responsive movement.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 76 + 8 * l); },
  },
  huntsman: {
    name: 'Huntsman', from: 'spider', rarity: 'legendary', overlay: ['hindlegs'], icon: ['spider', 'hindlegs'],
    desc: 'Your dash is a pounce that leaps straight at prey and lands with a shockwave.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.hop = 0; s.homingPounce = true; },
  },
  trapdoor: {
    name: 'Trapdoor', from: 'huntsman', rarity: 'rare', icon: ['hindlegs', 'echo'],
    desc: 'Your pounce stuns everything it lands on.',
    apply(s) { s.slamStun = 1.2; },
  },
  mantis: {
    name: 'Mantis Scythes', from: 'huntsman', rarity: 'uncommon', overlay: ['scythes'], icon: ['spider', 'horns'],
    desc: 'Your pounce slices everything it passes through.',
    apply(s, l) { s.dashDmg += 3 + 2 * l; s.bleed += 1.5 * l; s.dashTime += 0.04; },
  },
  centipede: {
    name: 'Centipede Body', from: 'spider', rarity: 'rare', overlay: ['centlegs'], icon: ['spider', 'chitin'],
    desc: 'Faster. Your body trails behind as a segmented chain that blocks enemy shots.',
    apply(s, l) { s.speed = Math.max(s.speed, 106 + 6 * l); s.centipede = 3 + l; },
  },
  spinedsegs: {
    name: 'Spined Segments', from: 'centipede', rarity: 'rare', icon: ['spider', 'spines'],
    desc: 'Every shot your segments block bursts into a ring of shards.',
    apply(s) { s.spinedSegments = true; },
  },
  biters: {
    name: 'Biting Segments', from: 'centipede', rarity: 'rare', icon: ['spider', 'mandibles'],
    desc: 'More segments, and each one bites whatever touches it.',
    apply(s) { s.centipede += 2; s.segBite = 1.5; },
  },

  wings: {
    name: 'Wings', slot: 'LIMBS', rarity: 'uncommon', overlay: ['wings'],
    desc: 'Fast but floaty flight. Drift over crates and tanks.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 112 + 10 * l); s.accel = s.accel || 330 + 30 * l; s.drag = s.drag || 1.5; s.flyover = true; s.dashTime += 0.05; },
  },
  carrionfly: {
    name: 'Carrion Fly', from: 'wings', rarity: 'rare', icon: ['spider', 'wings'],
    desc: 'Fly with control, trailed by a swarm of flies that bite anything near you.',
    apply(s) { s.accel = 1100; s.drag = 5; s.flySwarm = 1; },
  },
  cropduster: {
    name: 'Crop Duster', from: 'carrionfly', rarity: 'rare', overlay: ['sporepods'], icon: ['wings', 'mitosis'],
    desc: 'While you fly, you drop a trail of blinding spore clouds.',
    apply(s) { s.cropDuster = true; },
  },
  plague: {
    name: 'Plague Swarm', from: 'carrionfly', rarity: 'rare', icon: ['wings', 'hemophage'],
    desc: 'The swarm grows thick, and its bites bleed.',
    apply(s) { s.flySwarm = 2; },
  },
  locust: {
    name: 'Locust', from: 'wings', rarity: 'rare', overlay: ['hindlegs'], icon: ['hindlegs', 'wings'],
    desc: 'Fly freely, and your dash is a pounce from the air that lands with a shockwave.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.hop = 0; },
  },
  meteor: {
    name: 'Meteor', from: 'locust', rarity: 'rare', icon: ['hindlegs', 'skull'],
    desc: 'A far bigger, far harder shockwave.',
    apply(s) { s.slamDmg += 4; s.slamR += 16; },
  },
  pupa: {
    name: 'Pupa', from: 'locust', rarity: 'legendary', overlay: ['shell'], icon: ['wings', 'chitin'],
    desc: 'Hold still to close a cocoon around you: it blocks everything and slowly heals.',
    apply(s) { s.shell = true; s.pupa = true; },
  },

  grapple: {
    name: 'Tentacles', slot: 'LIMBS', rarity: 'rare', overlay: ['tentlimbs'],
    desc: 'Right-click (or E) to lash a tentacle at a wall or enemy and yank yourself to it.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 60); s.grapple = 1.0 - 0.15 * (l - 1); s.grappleRange = 110 + 15 * l; s.pullDmg += 2 + l; },
  },
  silktendril: {
    name: 'Silk Tendril', from: 'grapple', rarity: 'rare', icon: ['spider', 'grapple'],
    desc: 'Your tentacle webs every enemy it crosses, sticking them in place.',
    apply(s) { s.webLine = true; },
  },
  bileline: {
    name: 'Bile Line', from: 'silktendril', rarity: 'rare', icon: ['grapple', 'bile'],
    desc: 'Your tentacle leaves a line of burning bile along its whole length.',
    apply(s) { s.bileLine = true; },
  },
  shredpull: {
    name: 'Shredding Pull', from: 'silktendril', rarity: 'rare', icon: ['grapple', 'barbs'],
    desc: 'Grapple twice as often, and shred anything you are dragged through.',
    apply(s) { s.grapple *= 0.5; s.pullThrough = true; },
  },
  hands: {
    name: 'Grasping Hands', from: 'grapple', rarity: 'rare', overlay: ['hands'], icon: ['grapple', 'mandibles'],
    desc: 'Right-click (or E) to grab a corpse or small enemy, and again to throw it.',
    apply(s, l) { s.hands = true; s.handDmg += 4 + 2 * l; },
  },
  puppeteer: {
    name: 'Puppeteer', from: 'hands', rarity: 'legendary', icon: ['grapple', 'parasite'],
    desc: 'Your tentacle drags enemies to YOU, straight into your hands.',
    apply(s) { s.puppeteer = true; },
  },
  bilebomb: {
    name: 'Bile Bomb', from: 'hands', rarity: 'rare', icon: ['grapple', 'toxic'],
    desc: 'Whatever you throw explodes in burning bile.',
    apply(s) { s.bileBomb = true; },
  },

  burrow: {
    name: 'Burrowing Claws', slot: 'LIMBS', rarity: 'rare', overlay: ['claws'], icon: ['spider', 'skull'],
    desc: 'Dash dives underground. Untouchable while buried; erupt with damage.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 64); s.burrow = Math.max(s.burrow, 0.5 + 0.1 * l); s.burrowDmg += 3 + l; },
  },
  moleworm: {
    name: 'Moleworm', from: 'burrow', rarity: 'rare', overlay: ['centlegs'], icon: ['spider', 'regrow'],
    desc: 'Tunnel longer, shredding everything you pass beneath.',
    apply(s) { s.moleworm = true; s.burrow += 0.25; },
  },
  eruption: {
    name: 'Eruption', from: 'moleworm', rarity: 'rare', icon: ['spines', 'skull'],
    desc: 'You erupt in a ring of bone shards.',
    apply(s) { s.eruptRing = 10; },
  },
  tunnelbrood: {
    name: 'Tunnel Brood', from: 'moleworm', rarity: 'rare', icon: ['spider', 'mitosis'],
    desc: 'Spiderlings crawl out of the ground with you.',
    apply(s) { s.eruptBrood = 2; },
  },
  razorclaws: {
    name: 'Razor Claws', from: 'burrow', rarity: 'uncommon', overlay: ['scythes'], icon: ['horns', 'skull'],
    desc: 'You erupt much harder, and leave everything bleeding.',
    apply(s) { s.burrowDmg *= 1.6; s.burrowBleed = 3; },
  },
  ambush: {
    name: 'Ambush', from: 'razorclaws', rarity: 'rare', icon: ['feral', 'skull'],
    desc: 'Your first attack after erupting deals triple damage.',
    apply(s) { s.ambush = true; },
  },
  quake: {
    name: 'Quake', from: 'razorclaws', rarity: 'rare', icon: ['echo', 'skull'],
    desc: 'Erupting stuns everything nearby.',
    apply(s) { s.eruptStun = 1.2; },
  },

  fins: {
    name: 'Pseudopods', slot: 'LIMBS', rarity: 'common', overlay: ['fins'], icon: ['regrow', 'bile'],
    desc: 'Slide fast through your own slime and bile; sluggish everywhere else.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 52); s.fins = 118 + 12 * l; },
  },
  slimeglands: {
    name: 'Slime Glands', from: 'fins', rarity: 'uncommon', icon: ['bile', 'regrow'],
    desc: 'Enemies that cross your slime get stuck in it.',
    apply(s) { s.slimeSlow = 0.45; },
  },
  acidslime: {
    name: 'Acid Slime', from: 'slimeglands', rarity: 'rare', icon: ['toxic', 'bile'],
    desc: 'Your slime burns whatever crawls through it.',
    apply(s) { s.slimeBurn = 1.5; },
  },
  slipstream: {
    name: 'Slipstream', from: 'slimeglands', rarity: 'rare', icon: ['bile', 'twitch'],
    desc: 'On your own slime, you attack much faster.',
    apply(s) { s.slimeRate = 0.6; },
  },
  cilia: {
    name: 'Cilia', from: 'fins', rarity: 'common', overlay: ['cilia'], icon: ['regrow', 'twitch'],
    desc: 'Thousands of tiny hairs: a smooth, constant glide, and you attack faster.',
    apply(s, l) { s.speed = Math.max(s.speed, 78 + 6 * l); s.accel = s.accel || 640; s.drag = s.drag || 4.2; s.rateMul *= 0.92; },
  },
  stilts: {
    name: 'Bone Stilts', from: 'cilia', rarity: 'uncommon', icon: ['spike', 'spider'],
    desc: 'Stride over enemy acid untouched, and shoot over cover.',
    apply(s, l) { s.speed = Math.max(s.speed, 66 + 6 * l); s.stilts = true; s.accel = 0; },
  },
  shell: {
    name: 'Snail Shell', from: 'cilia', rarity: 'uncommon', malignant: true, overlay: ['shell'], icon: ['chitin', 'regrow'],
    desc: 'Hold still to withdraw into your shell and block everything.',
    cost: 'Painfully slow.',
    apply(s) { s.shell = true; s.speedMul *= 0.6; },
  },
  // Not offered on its own: Huntsman and Locust grow it.
  hindlegs: {
    name: 'Hind Legs', slot: 'LIMBS', part: true, rarity: 'uncommon', overlay: ['hindlegs'],
    desc: 'Move in powerful hops. Your dash is a pounce that lands with a shockwave.',
    apply(s, l) {
      s.slug = false; s.speed = Math.max(s.speed, 150); s.hop = s.hop || 0.5 - 0.05 * l;
      s.dashTime += 0.08; s.slamDmg += 2 + l; s.slamR = Math.max(s.slamR, 24 + 4 * l);
    },
  },

  // ================= CORE =================
  hide: {
    name: 'Thick Hide', slot: 'CORE', rarity: 'common',
    desc: '+1 max health per growth, and heal 1.',
    apply(s, l) { s.maxHp += l; },
    onGain(p) { p.hp += 1; },
  },
  calcified: {
    name: 'Calcified Organs', from: 'hide', rarity: 'common', overlay: ['calcified'], icon: ['hide', 'spike'],
    desc: '+2 max health, but you are slower.',
    apply(s) { s.maxHp += 2; s.speedMul *= 0.88; },
    onGain(p) { p.hp += 1; },
  },
  bonecage: {
    name: 'Bone Cage', from: 'calcified', rarity: 'rare', icon: ['hide', 'chitin'],
    desc: 'Every third hit glances off your bones.',
    apply(s) { s.hitIgnore = 3; },
  },
  secondheart: {
    name: 'Second Heart', from: 'calcified', rarity: 'legendary', overlay: ['heart2'],
    desc: 'The first time you die, you are reborn: pure, limbless, with 3 HP.',
    apply(s) { s.secondHeart = true; },
  },
  regrow: {
    name: 'Regrowth', from: 'hide', rarity: 'uncommon',
    desc: 'Slowly regrow lost flesh.',
    apply(s, l) { s.regen = 40 - 8 * l; },
  },
  hemophage: {
    name: 'Hemophage', from: 'regrow', rarity: 'rare', overlay: ['drool'],
    desc: 'Bursting corpses can heal you.',
    apply(s, l) { s.hemophage += 0.15 * l; },
  },
  mending: {
    name: 'Rapid Mending', from: 'regrow', rarity: 'rare', icon: ['regrow', 'twitch'],
    desc: 'You regrow twice as fast.',
    apply(s) { s.regen *= 0.5; },
  },

  marrow: {
    name: 'Dense Marrow', slot: 'CORE', rarity: 'common',
    desc: 'Heavier bones. More damage with everything.',
    apply(s, l) { s.damageMul *= 1 + 0.2 * l; },
  },
  loaded: {
    name: 'Loaded Marrow', from: 'marrow', rarity: 'uncommon', icon: ['marrow', 'spike'],
    desc: 'Hold fire to charge, release to unleash everything at once as a blast.',
    apply(s) { s.charge = true; },
  },
  overcharge: {
    name: 'Overcharge', from: 'loaded', rarity: 'rare', icon: ['marrow', 'spines'],
    desc: 'A full charge also bursts a ring of bone shards out of you.',
    apply(s) { s.chargeRing = 12; },
  },
  pressure: {
    name: 'Pressure Marrow', from: 'loaded', rarity: 'rare', icon: ['marrow', 'twitch'],
    desc: 'You charge twice as fast.',
    apply(s) { s.chargeSpeed = 2; },
  },
  overgrown: {
    name: 'Overgrown Heart', from: 'marrow', rarity: 'uncommon', malignant: true, overlay: ['bigheart'],
    desc: 'Double damage from every source.',
    cost: 'Max health halved.',
    apply(s) { s.damageMul *= 2; s.hpMul *= 0.5; },
  },
  titanheart: {
    name: 'Titan Heart', from: 'overgrown', rarity: 'legendary', cures: true, icon: ['overgrown', 'hide'],
    desc: 'CURED. Keep double damage, and +25% max health instead of half.',
    apply(s) { s.hpMul *= 2.5; },
  },
  hollow: {
    name: 'Hollow Body', from: 'overgrown', rarity: 'uncommon', malignant: true, overlay: ['hollow'], icon: ['overgrown', 'starving'],
    desc: 'Much faster, and you attack faster.',
    cost: 'Every hit costs 2 health.',
    apply(s) { s.speedMul *= 1.35; s.rateMul *= 0.85; s.hitCost = 2; },
  },

  mitosis: {
    name: 'Mitosis', slot: 'CORE', rarity: 'rare', overlay: ['mitosis'],
    desc: 'Anything you hit bursts into fragments of you, shot or bite.',
    apply(s, l) { s.split += 1 + l; },
  },
  brood: {
    name: 'Brood Chamber', from: 'mitosis', rarity: 'uncommon', overlay: ['brood'], icon: ['mitosis', 'hemophage'],
    desc: 'Burst corpses sometimes birth a friendly maggot instead of DNA.',
    apply(s, l) { s.brood = 0.2 + 0.1 * l; },
  },
  clutch: {
    name: 'Clutch', from: 'brood', rarity: 'rare', icon: ['mitosis', 'spider'],
    desc: 'Anything your fragments kill hatches a maggot.',
    apply(s) { s.clutch = true; },
  },
  maggotburst: {
    name: 'Rupturing Maggots', from: 'brood', rarity: 'rare', icon: ['mitosis', 'bile'],
    desc: 'Your maggots burst into burning bile when they die.',
    apply(s) { s.maggotBurst = true; },
  },
  twin: {
    name: 'Twin Embryo', from: 'mitosis', rarity: 'rare', malignant: true, icon: ['mitosis', 'hide'],
    desc: 'A tiny twin follows you and copies your attacks.',
    cost: 'If it dies, you lose 1 max health.',
    apply(s, l, p) { s.twin = true; s.maxHp -= (p && p.twinLost) || 0; },
  },
  bondedtwin: {
    name: 'Bonded Twin', from: 'twin', rarity: 'rare', cures: true, icon: ['mitosis', 'secondheart'],
    desc: 'CURED. Losing your twin no longer costs you anything.',
    apply(s, l, p) { s.maxHp += (p && p.twinLost) || 0; },
  },
  mirrortwin: {
    name: 'Mirror Twin', from: 'twin', rarity: 'rare', icon: ['mitosis', 'eyes'],
    desc: 'Your twin copies you at full strength.',
    apply(s) { s.twinMul = 1.6; },
  },

  starving: {
    name: 'Starving Cells', slot: 'CORE', rarity: 'uncommon', malignant: true, overlay: ['ribs'],
    desc: 'Corpses give double DNA.',
    cost: 'Go 30s without bursting a corpse and you starve, losing health (never fatal).',
    apply(s) { s.dnaMul *= 2; s.starve = 30; },
  },
  apexpredator: {
    name: 'Apex Predator', from: 'starving', rarity: 'legendary', cures: true, icon: ['starving', 'hemophage'],
    desc: 'CURED. Keep double DNA. You never starve, and bursts can heal you.',
    apply(s) { s.starve = 0; s.hemophage += 0.3; },
  },
  bacteria: {
    name: 'Gut Bacteria', from: 'apexpredator', rarity: 'common', icon: ['starving', 'mitosis'],
    desc: 'Even more DNA per corpse, but corpses take longer to burst.',
    apply(s) { s.bacteria += 2; },
  },
  feedfrenzy: {
    name: 'Feeding Frenzy', from: 'apexpredator', rarity: 'rare', icon: ['starving', 'feral'],
    desc: 'Bursting a corpse sends you into a frenzy: +40% damage for a few seconds.',
    apply(s) { s.feedFrenzy = 0.4; },
  },
  cancer: {
    name: 'Cancerous Growth', from: 'starving', rarity: 'rare', malignant: true, overlay: ['tumor'],
    desc: '+10% damage for every room you clear, forever.',
    cost: 'Every 3rd room cleared, it takes 1 max health.',
    apply(s, l, p) {
      const rooms = (p && p.cancerRooms) || 0;
      s.damageMul *= 1 + (s.cancerRate || 0.1) * rooms;
      s.maxHp -= Math.floor(rooms / 3);
    },
  },
  benignmass: {
    name: 'Benign Mass', from: 'cancer', rarity: 'legendary', cures: true, icon: ['cancer', 'regrow'],
    desc: 'CURED. The growth keeps making you stronger, but no longer costs health.',
    apply(s, l, p) { s.maxHp += Math.floor(((p && p.cancerRooms) || 0) / 3); },
  },
  metastasis: {
    name: 'Metastasis', from: 'cancer', rarity: 'rare', malignant: true, icon: ['cancer', 'mitosis'],
    desc: 'The growth spreads faster: +20% damage per room instead.',
    cost: 'It still takes 1 max health every 3rd room.',
    apply(s, l, p) { const rooms = (p && p.cancerRooms) || 0; s.damageMul *= (1 + 0.2 * rooms) / (1 + 0.1 * rooms); },
  },
};

// WHISPERS: the cryptic line that appears when something new grows in you.
// Cards never explain mutations; these hint at what just changed.
const HINTS = {
  // MOUTH
  slime: 'You spit what you crawl in.',
  spike: 'Bone grows behind your teeth, waiting to leave.',
  shotgun: 'The bone splinters before it leaves you. Hold it in. Let it build.',
  bonejaws: 'Teeth and bone, one mouth. What you bite, the bone goes through.',
  shrapnel: 'The splinters splinter.',
  lance: 'The bone grows long and narrow. It does not stop at the first one.',
  barbedlash: 'Tendrils tipped with bone. What they strike, they pass along.',
  venomspike: 'The spikes come out wet now, and they drip as they fly.',
  bile: 'Your stomach turns. Hold it open, and it pours out burning.',
  sporefire: 'Something grows in your lungs. Your fire wants to meet it.',
  rotbloom: 'The spores are hungry now. Whatever breathes them, rots.',
  bilemortar: 'What you cough up lands burning.',
  acidmaw: 'Pincers, wet with bile. What you bite keeps burning, even after.',
  vomit: 'Your gut heaves toward whatever stands in front of you.',
  meltbite: 'Soften them first. Then bite.',
  mandibles: 'Pincers twitch at your lips. Get close.',
  feral: 'You no longer want to wait for them. You want to pounce.',
  apexjaws: 'Every leap ends twice. Every kill, you leap again.',
  rending: 'What you leap on, you open. What is open feeds you.',
  mawtendrils: 'Something long uncoils in your throat. It brings food to your jaws.',
  leech: 'A ring of tiny teeth. Every small taste comes back to you.',
  devour: 'Your jaw unhinges. The weak ones fit.',
  tentacles: 'Something long uncoils in your throat, reaching.',
  caustic: 'The tendrils sweat bile. It clings to whatever they touch.',
  writhing: 'More of them. Always more of them.',
  strangle: 'The tendrils do not let go so easily now.',
  hooks: 'Hooks grow along the tendrils. Wounds stay open.',
  lashdrain: 'The tendrils have mouths. They drink for you.',
  flay: 'Open wounds tear wider.',
  proboscis: 'A thin, hungry tube. Hold on, and drink.',
  siphon: 'The tube splits. Two can feed you at once.',
  hemorrhage: 'Where you drank, they keep emptying.',
  bloodbattery: 'Every drop goes further now.',
  bloat: 'Fill them too full, and they burst.',
  sporesac: 'You leave something in them while you drink. It blooms when they burst.',
  longtube: 'The tube grows long, and greedy.',
  // HEAD
  eyes: 'More eyes. They follow whatever you throw.',
  compound: 'A thousand lenses. Everything near you slows to a crawl.',
  hivesight: 'You feel them in the dark, and what they throw hangs in the air.',
  glare: 'Your eyes are too bright. Look at them, and they go blind.',
  abyssal: 'It sees through flesh. So will everything you throw.',
  evileye: 'Stare. It weakens them.',
  fractured: 'Your sight cracks into pieces. So does everything it touches.',
  skull: 'Your head hardens. Use it.',
  horns: 'Horns, heavy and curved. What they pierce keeps bleeding.',
  juggernaut: 'Nothing stops the charge. What you hit, you throw.',
  bloodletter: 'Strike the bleeding ones. They are ready to burst.',
  echo: 'There is a scream in your skull. Lunge, and let it out.',
  shatter: 'What the scream freezes, breaks.',
  banshee: 'The scream has weight now. It pushes everything away.',
  nighteyes: 'The light hurts now. You hunt best where it cannot reach.',
  owleyes: 'Your eyes have made peace with the light.',
  antennae: 'The dark has a texture now. You can feel them moving.',
  stalker: 'What you kill in the dark nourishes you.',
  pitchblack: 'Darker. The light is a wound.',
  darkstare: 'In the dark, your shots freeze them where they stand.',
  lightless: 'You do not need light anymore. You need them close, and dark.',
  parasite: 'Something else is thinking in there. It is stronger than you.',
  symbiote: 'It speaks with you now, not over you.',
  brainworm: 'Something small crawls out of you with every blow.',
  overmind: 'It has learned to scream.',
  rider: 'Let it drive. Nothing touches you while it does.',
  berserkhost: 'When it drives, it hunts.',
  cerebral: 'Your skull is too small for the two of you.',
  // BACK
  spines: 'Shards rest under your skin. Anything sudden sets them loose.',
  urchinhide: 'Every surface of you is a weapon. Touch sets it off.',
  venomquills: 'The shards come out wet.',
  seekquills: 'The shards know where the meat is.',
  quillpulse: 'Your back twitches on its own. The shards come out anyway.',
  bonestorm: 'More shards. Faster.',
  splitquills: 'The shards are brittle. They break into more.',
  chitin: 'A plate is forming. It will take one blow, then grow back.',
  carapace: 'When the shell breaks, it breaks outward.',
  thornplate: 'The plate grows thorns.',
  reactive: 'When the plate breaks, it pushes back.',
  molt: 'Your skin is loose. Once a room, you could step out of it.',
  huskbomb: 'The skin you leave behind is full of something.',
  endlessmolt: 'Your skin grows back loose. It always will.',
  eggsac: 'You are carrying something. Pain will hatch it.',
  eggpods: 'Your back is ripe. Let them touch it, and something hatches.',
  broodmother: 'Every new room, a new litter.',
  venombrood: 'Your children are born with bile in their mouths.',
  lure: 'A little light sways on your back. They will watch it, not you.',
  angler: 'The light has teeth now.',
  toxic: 'Your blood is wrong now. Whoever spills it will regret it.',
  twitch: 'Your spine will not stop twitching. Neither will your aim.',
  adrenal: 'Pain is a door. Through it, you run.',
  fightflight: 'Hurt it, and it moves faster than thought.',
  rage: 'Pain makes you hungry. Pain makes you fast.',
  streamfibers: 'Your muscles fire too fast to aim. Hold it down and spray.',
  jitter: 'Every lurch, you are ready again.',
  needles: 'The stream is thin and sharp. It goes through.',
  // LIMBS
  spider: 'Eight legs. Finally, you can run.',
  huntsman: 'Coiled legs among the eight. Lunge, and they find the prey for you.',
  trapdoor: 'What you land on cannot move.',
  mantis: 'Blades fold against your sides. Lunge through them.',
  centipede: 'Your body stretches out behind you, armored. Let it take the shots.',
  spinedsegs: 'Your segments bristle. What strikes them is answered.',
  biters: 'Every segment grows a mouth.',
  wings: 'Wings, wet and new. They do not stop when you do.',
  carrionfly: 'Wings that finally listen to legs. The flies follow.',
  cropduster: 'Something falls from you as you fly.',
  plague: 'The flies are thick now. They bite deep.',
  locust: 'You fall from the sky like a swarm.',
  meteor: 'You fall harder. The ground remembers.',
  pupa: 'Close the shell and change. It mends what is inside.',
  grapple: 'A long arm aches to be thrown. Right-click, and let it pull you.',
  silktendril: 'Silk on the tentacle. What it crosses, it holds.',
  bileline: 'The tentacle bleeds bile wherever it lies.',
  shredpull: 'The silk is sharp. Pull yourself through them.',
  hands: 'Hands. Human hands. Right-click to take something, and again to throw it.',
  puppeteer: 'The tentacle brings them to your hands.',
  bilebomb: 'Whatever you throw, you fill with bile first.',
  burrow: 'Claws for digging. Dash, and go under.',
  moleworm: 'Burrow deeper. What is above you is only in your way.',
  eruption: 'You come up bristling.',
  tunnelbrood: 'You are not alone down there.',
  razorclaws: 'The claws are sharp enough to open them as you rise.',
  ambush: 'Strike the moment you surface.',
  quake: 'When you rise, the ground shakes them still.',
  fins: 'You glide where you have already been. Follow your own trail.',
  slimeglands: 'Your slime is thick. They will not cross it easily.',
  acidslime: 'Your slime burns.',
  slipstream: 'On your trail, you are quick in every way.',
  cilia: 'A thousand hairs carry you, smooth as a current.',
  stilts: 'Long bones lift you. Their filth cannot reach you up here.',
  shell: 'A shell. Be still, and nothing can reach you.',
  // CORE
  hide: 'Thicker. Harder to tear.',
  calcified: 'Your organs are turning to stone. Sturdier. Slower.',
  bonecage: 'Some blows simply do not reach you.',
  secondheart: 'A second beat, quiet, waiting for the first to stop.',
  regrow: 'What is lost comes back. Slowly.',
  hemophage: 'Breaking them open makes you whole.',
  mending: 'What is lost comes back quickly now.',
  marrow: 'Your bones are heavy now.',
  loaded: 'Your bones are heavy now. Hold your fire, and let it build.',
  overcharge: 'Hold it long enough, and it bursts out of you.',
  pressure: 'It builds faster.',
  overgrown: 'Your heart swells. Every blow lands twice as hard. Theirs too.',
  titanheart: 'The swollen heart settles. It holds more now.',
  hollow: 'Hollow inside. Light, fast, and easy to break.',
  mitosis: 'You split easily now. So does everything you hit.',
  brood: 'Something in you wants to be born. Corpses make good nests.',
  clutch: 'Your fragments leave something behind in what they kill.',
  maggotburst: 'Your young are full of bile.',
  twin: 'You are not alone in here anymore. Keep it alive.',
  bondedtwin: 'You are bound now. Losing it costs nothing.',
  mirrortwin: 'It does everything you do, as hard as you do.',
  starving: 'Hungry. Always hungry. Do not stop feeding.',
  apexpredator: 'The hunger is answered. Every kill feeds you.',
  bacteria: 'Something lives in your gut. The dead grow richer, and tougher.',
  feedfrenzy: 'Every meal sends you into a frenzy.',
  cancer: 'It grows every time you win. It takes something every third time.',
  benignmass: 'The growth calms. It still grows, but takes nothing.',
  metastasis: 'It spreads faster now.',
  // Parts other nodes grow
  spores: 'Something grows in your lungs. Cough it high, over their heads.',
  hindlegs: 'Coiled legs. Leap, and the ground will feel it.',
};

// ===========================================================================
// SETS. Every node belongs to a set (it inherits its parent's unless listed
// here). Each slot counts as the set of its CURRENT form, so a branch can
// switch a slot to another set. 3 matching slots wake a bonus; all 5 wake a
// stronger one. Cards show the set, never what the mutation does.
// ===========================================================================
const SETS = {
  BONE: {
    name: 'BONE', color: '#d9cfa0',
    tags: ['spike', 'skull', 'spines', 'marrow', 'hooks', 'flay', 'thornplate', 'needles', 'spinedsegs', 'meteor', 'eruption', 'quake', 'stilts', 'shell', 'calcified', 'hollow'],
    bonus: [
      { name: 'Ossified', desc: 'Everything you kill bursts into bone shards.', apply(s) { s.setKillShards = 5; } },
      { name: 'Bone Colossus', desc: 'Every kill bursts into shards, +2 max health, and a hit fires a huge shard ring.', apply(s) { s.setKillShards = 8; s.maxHp += 2; s.ring += 10; } },
    ],
    whisper: ['Your bones remember each other.', 'You are more bone than flesh now. It suits you.'],
  },
  FUNGAL: {
    name: 'FUNGAL', color: '#9aae50',
    tags: ['bile', 'fins', 'venomspike', 'caustic', 'sporesac', 'brainworm', 'venomquills', 'huskbomb', 'eggpods', 'venombrood', 'toxic', 'carrionfly', 'bileline', 'bilebomb', 'maggotburst', 'bacteria'],
    bonus: [
      { name: 'Sporulate', desc: 'What you kill bursts into a blinding spore cloud.', apply(s) { s.setKillCloud = 18; } },
      { name: 'Fruiting Body', desc: 'Kills burst into clouds, you release spores every few seconds, and your clouds eat flesh.', apply(s) { s.setKillCloud = 22; s.setSporeAura = 4; s.cloudDps = Math.max(s.cloudDps || 0, 1.5); } },
    ],
    whisper: ['Something is fruiting under your skin.', 'You are a garden now. Everything you touch will bloom.'],
  },
  HIVE: {
    name: 'HIVE', color: '#e0a830',
    tags: ['mandibles', 'chitin', 'eggsac', 'spider', 'wings', 'longtube', 'compound', 'antennae', 'silktendril', 'jitter', 'tunnelbrood', 'brood'],
    bonus: [
      { name: 'Swarm', desc: 'Kills sometimes hatch a spiderling.', apply(s) { s.setKillBrood = 0.35; } },
      { name: 'Hive Queen', desc: 'Every kill hatches a spiderling, and your brood lives twice as long.', apply(s) { s.setKillBrood = 1; s.allyLife = 2; } },
    ],
    whisper: ['The others in you begin to hum together.', 'You are the hive. Every death is a birth.'],
  },
  PREDATOR: {
    name: 'PREDATOR', color: '#d04848',
    tags: ['proboscis', 'nighteyes', 'twitch', 'burrow', 'hide', 'starving', 'feral', 'leech', 'lashdrain', 'horns', 'evileye', 'berserkhost', 'huntsman', 'hemophage'],
    bonus: [
      { name: 'Blood Scent', desc: '+35% damage to wounded prey.', apply(s) { s.setWounded = 0.35; } },
      { name: 'Apex', desc: 'Wounded prey takes +50%, every kill sends you into a frenzy, and every 8th kill heals you.', apply(s) { s.setWounded = 0.5; s.setKillFrenzy = true; s.setKillHeal = 8; } },
    ],
    whisper: ['You can smell where they are hurt.', 'Nothing hunts you now. You hunt.'],
  },
  ABOMINATION: {
    name: 'ABOMINATION', color: '#b464c8',
    tags: ['tentacles', 'eyes', 'parasite', 'grapple', 'mitosis', 'barbedlash', 'vomit', 'mawtendrils', 'bloodbattery', 'bloat', 'banshee', 'lightless', 'splitquills', 'lure', 'biters', 'cilia', 'slipstream', 'secondheart', 'regrow', 'overgrown', 'cancer'],
    bonus: [
      { name: 'Grafted', desc: 'When you are hurt, tendrils burst out and lash everything near you.', apply(s) { s.setHurtLash = 3; } },
      { name: 'Abomination', desc: 'Lashing tendrils when hurt, +30% damage, and you regrow a little flesh every room you clear.', apply(s) { s.setHurtLash = 5; s.damageMul *= 1.3; s.setRoomHeal = true; } },
    ],
    whisper: ['The pieces of you are starting to agree.', 'There is no name for what you are.'],
  },
};
const SET_OF_TAG = {};
for (const k in SETS) for (const id of SETS[k].tags) SET_OF_TAG[id] = k;

// The set a node belongs to (null for the starter slime).
function setOf(id) {
  for (let cur = id; cur; cur = MUTATIONS[cur].from) if (SET_OF_TAG[cur]) return SET_OF_TAG[cur];
  return null;
}

// How many slots match each set, by each slot's current form.
function setCounts(p) {
  const n = {};
  for (const slot of SLOTS) {
    const m = p.slots[slot];
    const k = m && !m.starter && setOf(m.id);
    if (k) n[k] = (n[k] || 0) + 1;
  }
  return n;
}

// The set bonus you have right now: { set, tier (0 = 3 matching, 1 = all 5) } or null.
function activeSet(p) {
  const n = setCounts(p);
  for (const k in n) if (n[k] >= 3) return { set: k, tier: n[k] >= 5 ? 1 : 0, count: n[k] };
  return null;
}

// --- Tree helpers -------------------------------------------------------------------
function getMutDef(id) { return MUTATIONS[id]; }

// The slot a node belongs to (branches inherit it from their root).
function slotOf(id) {
  let d = MUTATIONS[id];
  while (d.from) d = MUTATIONS[d.from];
  return d.slot;
}

function rootsOf(slot) {
  return Object.keys(MUTATIONS).filter(id => MUTATIONS[id].slot === slot && !MUTATIONS[id].part);
}

function childrenOf(id) {
  return Object.keys(MUTATIONS).filter(k => MUTATIONS[k].from === id);
}

function siblingOf(id) {
  const from = MUTATIONS[id].from;
  return from ? childrenOf(from).find(k => k !== id) : null;
}

// Which overlay sprites to draw for one node.
function mutOverlays(id) {
  return MUTATIONS[id].overlay || [];
}

// Add one slot's whole path to a stat sheet. Each node uses the slot's growth level.
function applyMutation(s, m, p) {
  const l = m.path.length;
  for (const id of m.path) MUTATIONS[id].apply(s, l, p);
}

// Does the player have this node anywhere?
function hasMutation(p, id) {
  return SLOTS.some(slot => p.slots[slot] && p.slots[slot].path.includes(id));
}

// Is this slot's path still carrying a malignant cost (no cure after it)?
function slotMalignant(m) {
  let mal = false;
  for (const id of m.path) {
    if (MUTATIONS[id].malignant) mal = true;
    if (MUTATIONS[id].cures) mal = false;
  }
  return mal;
}

// What each slot could grow next.
//   empty slot  -> its roots
//   your starter Slime Blob -> any MOUTH root (replacing it)
//   anything else -> the two branches of where you are now (none when complete)
function slotOffers(p, slot) {
  const m = p.slots[slot];
  if (!m || m.starter) return rootsOf(slot);
  return childrenOf(m.id);
}

// Roll `n` cards. Usually one slot shows BOTH of its next branches side by
// side, so you see exactly which path you're giving up.
function rollChoices(p, n, minRarity) {
  const minIdx = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const luck = r => (r === 'rare' || r === 'legendary') ? 1 + 0.2 * (game.depth - 1) : 1;
  const weight = id => {
    const d = MUTATIONS[id];
    let w = RARITY[d.rarity].weight * luck(d.rarity);
    if (d.malignant) w *= 0.7;
    if (RARITY_ORDER.indexOf(d.rarity) < minIdx) w *= 0.02; // a vial strongly prefers rare samples
    return w;
  };
  const pickWeighted = ids => {
    let total = 0;
    for (const id of ids) total += weight(id);
    let r = Math.random() * total;
    for (const id of ids) if ((r -= weight(id)) <= 0) return id;
    return ids[ids.length - 1];
  };

  const offers = {};
  for (const slot of SLOTS) { const o = slotOffers(p, slot); if (o.length) offers[slot] = o; }
  const slots = Object.keys(offers).sort(() => Math.random() - 0.5);
  const out = [];
  // A fork: both branches of one slot.
  const forks = slots.filter(sl => p.slots[sl] && childrenOf(p.slots[sl].id).length === 2);
  if (forks.length && n >= 2 && Math.random() < 0.8) {
    const sl = forks[Math.floor(Math.random() * forks.length)];
    for (const id of childrenOf(p.slots[sl].id)) out.push({ id });
    slots.splice(slots.indexOf(sl), 1);
  }
  // Fill the rest with one card per other slot.
  for (const sl of slots) {
    if (out.length >= n) break;
    out.push({ id: pickWeighted(offers[sl]) });
  }
  // Still short (few slots left)? Take more from what's on offer.
  const left = Object.values(offers).flat().filter(id => !out.some(c => c.id === id));
  while (out.length < n && left.length) out.push({ id: left.splice(Math.floor(Math.random() * left.length), 1)[0] });
  if (!out.length) out.push({ id: '_gorge' });
  return out.sort(() => Math.random() - 0.5);
}

// Everything a card needs to show (never what it does: you learn by growing it).
function choiceInfo(p, c) {
  if (c.id === '_gorge') {
    return { name: 'Gorge', rarity: 'common', desc: 'Nothing left to evolve. Heal 2 HP.', status: '', overlays: [], slot: '' };
  }
  const d = MUTATIONS[c.id], slot = slotOf(c.id), m = p.slots[slot];
  let status, note = null, noteColor = PAL.slate;
  if (!d.from) {
    status = 'TAKES ROOT';
    if (m) { note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = COST_COLOR; }
    else note = 'NO OTHER ' + slot + ' ROOTS';
  } else {
    status = (m ? MUTATIONS[m.id].name : '') + ' >';
    const sib = siblingOf(c.id);
    if (sib) { note = 'LOCKS OUT ' + MUTATIONS[sib].name; noteColor = COST_COLOR; }
  }
  return {
    id: c.id, name: d.name, rarity: d.rarity, desc: d.desc, cost: d.cost, malignant: !!d.malignant, cures: !!d.cures, set: setOf(c.id),
    slot, status, note, noteColor, tier: m && d.from ? m.path.length : 0, overlays: mutOverlays(c.id),
  };
}

// --- Applying a choice ------------------------------------------------------------
function applyChoice(p, c) {
  if (c.id === '_gorge') { p.hp = Math.min(p.maxHp, p.hp + 2); return; }
  p.evolutions++;
  const d = MUTATIONS[c.id], slot = slotOf(c.id), m = p.slots[slot];
  if (!d.from) {
    if (m) bloodSpray(p.x, p.y, 0, 0, 14, FLUID.blood, 90); // the starter tears out
    p.slots[slot] = { id: c.id, path: [c.id] };
  } else {
    m.path.push(c.id);
    m.id = c.id;
    m.starter = false;
  }
  whisper(HINTS[c.id]);
  if (d.onGain) d.onGain(p);
  const col = d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
  floatText(p.x, p.y - 14, d.name.toUpperCase(), col);
  if (d.from && !childrenOf(c.id).length) {
    // A path reaches its end form.
    game.banner = { text: 'FULLY GROWN', sub: d.name, color: col, t: 2.2 };
    burst(p.x, p.y, col, 24, 110, 0.7);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('splice');
  } else {
    Sfx.play('absorb');
  }
  recomputeStats(p);
}

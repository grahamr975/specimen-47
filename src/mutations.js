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
  // Playstyle attacks.
  for (const k of ['ovi', 'howl', 'polyp', 'tongue', 'silk']) if (s[k]) s[k].delay *= s.rateMul;
  if (s.ovi) { s.ovi.dps *= m; s.ovi.burstDmg *= m; }
  if (s.howl) { s.howl.dmg *= m; s.howl.slam *= m; s.howl.range += s.reach; }
  if (s.polyp) s.polyp.dmg *= m;
  if (s.tongue) { s.tongue.dmg *= m; s.tongue.spit *= m; s.tongue.range += s.reach * 2; }
  if (s.silk) s.silk.dmg *= m;
  if (s.miasma) s.miasma.dps *= m;
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
    for (const k of ['ovi', 'howl', 'polyp', 'tongue', 'silk']) if (s[k]) s[k].delay *= 0.5;
  }
  s.biteReach += s.reach;
  s.lashRange += s.reach * 2;
  s.invuln = Math.min(s.invuln, s.invulnCap);
}

// Add a projectile weapon. Each one fires on its own timer.
function gun(s, props) {
  s.guns.push(Object.assign({
    id: '', dmg: 1, delay: 0.75, speed: 155, range: 0.7, r: 2, count: 1, spread: 0,
    acid: 0, acidChance: 0, bleed: 0, slow: 0, lob: false, cloud: 0, round: false, fade: false,
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
    desc: 'Spit little globs of sticky slime. Whatever they hit is slowed for a moment.',
    apply(s) { gun(s, { id: 'slime', dmg: 1, delay: 0.5, speed: 135, range: 0.55, r: 2.5, slow: 1.2, round: true, color: '#9aae8a', sound: 'splat' }); },
  },
  spike: {
    name: 'Bone Spike', slot: 'MOUTH', rarity: 'common',
    desc: 'Fire a fast bone spike. Harder and faster as it grows; twin spikes at full growth.',
    apply(s, l) { gun(s, { id: 'spike', dmg: 1.4 + 0.4 * (l - 1), delay: 0.6 - 0.08 * (l - 1), speed: 170, count: l >= 3 ? 2 : 1 }); },
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
    requires: { set: 'PREDATOR', label: 'A PREDATOR PART' },
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
  // ---- Playstyle roots: they replace shooting with something else entirely ----
  ovipositor: {
    requires: { any: ['eggsac', 'brood'], label: 'EGG SAC OR BROOD' },
    name: 'Ovipositor', slot: 'MOUTH', rarity: 'rare', overlay: ['proboscis'],
    desc: 'Slowly launch a larva. It burrows into a host, eats it from inside, then bursts out to find new hosts.',
    apply(s, l) { s.ovi = { delay: 1.5 - 0.15 * (l - 1), dps: 0.5 + 0.25 * l, brood: l >= 3 ? 3 : 2, burstDmg: 2 + l, time: 4 }; },
  },
  broodhost: {
    name: 'Brood Host', from: 'ovipositor', rarity: 'uncommon', icon: ['ovipositor', 'spider'],
    desc: 'Half of what bursts out of a host hatches as spiderlings that fight for you.',
    apply(s) { s.oviSpider = true; },
  },
  swarmqueen: {
    name: 'Swarm Queen', from: 'broodhost', rarity: 'legendary', icon: ['ovipositor', 'parasite'],
    desc: 'Infested hosts turn on their own kind until they burst.',
    apply(s) { s.oviCharm = true; },
  },
  gestation: {
    name: 'Gestation', from: 'broodhost', rarity: 'rare', icon: ['ovipositor', 'hide'],
    desc: 'Hosts carry the larva longer, and the longer they carry it, the bigger the brood.',
    apply(s) { s.ovi.time = 6; s.oviGrow = true; },
  },
  bloodworm: {
    name: 'Bloodworm', from: 'ovipositor', rarity: 'uncommon', icon: ['ovipositor', 'hemophage'],
    desc: 'The larva feeds far harder, and hosts burst sooner.',
    apply(s) { s.ovi.dps *= 2.5; s.ovi.time = 3; },
  },
  chestburster: {
    name: 'Chestburster', from: 'bloodworm', rarity: 'rare', icon: ['ovipositor', 'overgrown'],
    desc: 'The brood tears its host apart, hurting everything near it.',
    apply(s, l) { s.oviBurst = 4 + l; },
  },
  puppetlarva: {
    name: 'Puppet Larva', from: 'bloodworm', rarity: 'rare', icon: ['ovipositor', 'echo'],
    desc: 'Hosts stagger around blind and slow while it eats them.',
    apply(s) { s.oviConfuse = true; },
  },

  miasma: {
    requires: { any: ['toxic', 'bacteria', 'fins'], label: 'TOXIC BLOOD, BACTERIA OR PSEUDOPODS' },
    name: 'Miasma', slot: 'MOUTH', rarity: 'rare',
    desc: 'No attack. You leak a toxic cloud that eats everything near you. Hold fire to vent it wider, but you slow down.',
    apply(s, l) { s.miasma = { r: 30 + 4 * (l - 1), dps: 1.6 + 0.6 * (l - 1) }; },
  },
  shroud: {
    name: 'Spore Shroud', from: 'miasma', rarity: 'uncommon', icon: ['miasma', 'eyes'],
    desc: 'Enemies inside your gas lose track of you.',
    apply(s) { s.gasHide = true; },
  },
  rothalo: {
    name: 'Rot Halo', from: 'shroud', rarity: 'rare', icon: ['miasma', 'mitosis'],
    desc: 'Anything that dies in your gas leaves a lingering toxic cloud of its own.',
    apply(s) { s.gasDeathCloud = true; },
  },
  phantom: {
    name: 'Phantom', from: 'shroud', rarity: 'rare', icon: ['miasma', 'nighteyes'],
    desc: 'While you vent, you vanish: nothing can find you.',
    apply(s) { s.gasInvis = true; },
  },
  causticlungs: {
    name: 'Caustic Lungs', from: 'miasma', rarity: 'uncommon', icon: ['miasma', 'toxic'],
    desc: 'The longer something stays in your gas, the faster it dissolves.',
    apply(s) { s.gasRamp = true; },
  },
  corrode: {
    name: 'Corrode', from: 'causticlungs', rarity: 'rare', icon: ['miasma', 'bile'],
    desc: 'Anything in your gas takes 50% more damage from everything.',
    apply(s) { s.gasCorrode = true; },
  },
  choke: {
    name: 'Choke', from: 'causticlungs', rarity: 'rare', icon: ['miasma', 'twitch'],
    desc: 'Your gas slows enemies, and their shots crawl through it.',
    apply(s) { s.gasChoke = true; },
  },

  howl: {
    name: 'Howl', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'A sonic cone that barely hurts but hurls enemies into walls and each other.',
    apply(s, l) { s.howl = { delay: 0.8 - 0.05 * (l - 1), dmg: 0.3 * l, force: 300 + 40 * l, range: 62, cone: 0.55, slam: 2 + 1.2 * l }; },
  },
  shockwave: {
    name: 'Shockwave', from: 'howl', rarity: 'uncommon', icon: ['howl', 'slam'],
    desc: 'The howl bursts out all around you instead of ahead.',
    apply(s) { s.howl.cone = -1; s.howl.range *= 0.85; },
  },
  concussion: {
    name: 'Concussion', from: 'shockwave', rarity: 'rare', icon: ['howl', 'echo'],
    desc: 'Whatever the howl hits is stunned.',
    apply(s) { s.howlStun = 0.8; },
  },
  avalanche: {
    name: 'Avalanche', from: 'shockwave', rarity: 'rare', icon: ['howl', 'skull'],
    desc: 'Anything flung into another enemy flings that one too.',
    apply(s) { s.howlChain = true; },
  },
  soniclance: {
    name: 'Sonic Lance', from: 'howl', rarity: 'uncommon', icon: ['howl', 'spike'],
    desc: 'A narrow, long howl that hits far harder.',
    apply(s) { s.howl.cone = 0.9; s.howl.range *= 1.8; s.howl.force += 150; },
  },
  wallbreaker: {
    name: 'Wallbreaker', from: 'soniclance', rarity: 'rare', icon: ['howl', 'marrow'],
    desc: 'Enemies you slam into walls take far more and burst into bone shards.',
    apply(s) { s.wallSlamMul = 2.5; },
  },
  rupture: {
    name: 'Rupture', from: 'soniclance', rarity: 'rare', icon: ['howl', 'horns'],
    desc: 'The howl ruptures them inside: they bleed.',
    apply(s) { s.howlBleed = 2.5; },
  },

  polyp: {
    name: 'Polyp Seeder', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'Fire plants a fleshy polyp that spits at anything nearby. Only a few can grow at once.',
    apply(s, l) { s.polyp = { delay: 1.1, max: 1 + l, dmg: 0.7 + 0.25 * l, rate: 0.9, life: 14 }; },
  },
  sporepolyp: {
    name: 'Spore Polyp', from: 'polyp', rarity: 'uncommon', icon: ['polyp', 'mitosis'],
    desc: 'Polyps spit spores that burst into blinding clouds.',
    apply(s) { s.polypCloud = true; },
  },
  fruiting: {
    name: 'Fruiting Bodies', from: 'sporepolyp', rarity: 'rare', icon: ['polyp', 'overgrown'],
    desc: 'Polyps burst in burning bile when something touches them, or when they wither.',
    apply(s) { s.polypBurst = true; },
  },
  mycelialweb: {
    name: 'Mycelial Web', from: 'sporepolyp', rarity: 'rare', icon: ['polyp', 'silk'],
    desc: 'Your polyps are joined by threads that eat whatever crosses them.',
    apply(s) { s.polypLink = true; },
  },
  tendrilpolyp: {
    name: 'Tendril Polyp', from: 'polyp', rarity: 'uncommon', icon: ['polyp', 'tentacles'],
    desc: 'Polyps lash whatever comes close instead of spitting, much harder.',
    apply(s) { s.polypLash = true; },
  },
  graspingbed: {
    name: 'Grasping Bed', from: 'tendrilpolyp', rarity: 'rare', icon: ['polyp', 'grapple'],
    desc: 'Polyp tendrils drag prey in and hold it.',
    apply(s) { s.polypGrab = true; },
  },
  feedingpolyps: {
    name: 'Feeding Polyps', from: 'tendrilpolyp', rarity: 'rare', icon: ['polyp', 'hemophage'],
    desc: 'More polyps, living longer, and what they kill feeds you.',
    apply(s) { s.polyp.max += 1; s.polyp.life *= 1.5; s.polypFeed = 5; },
  },

  tongue: {
    name: 'Frog Tongue', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'Lash out a long tongue. Small prey is swallowed whole; fire again to spit it back out.',
    apply(s, l) { s.tongue = { delay: 0.55, range: 70 + 10 * l, dmg: 1.5 + 0.8 * l, spit: 3 + 1.5 * l, max: 3, size: 6 }; },
  },
  bottomlessgut: {
    name: 'Bottomless Gut', from: 'tongue', rarity: 'uncommon', icon: ['tongue', 'starving'],
    desc: 'Swallow bigger prey, and hold far more of it.',
    apply(s) { s.tongue.max = 6; s.tongue.size = 7.5; },
  },
  acidgut: {
    name: 'Acid Gut', from: 'bottomlessgut', rarity: 'rare', icon: ['tongue', 'bile'],
    desc: 'What you spit back is half-digested and bursts into burning bile.',
    apply(s) { s.spitAcid = 16; },
  },
  regurgitate: {
    name: 'Regurgitate', from: 'bottomlessgut', rarity: 'rare', icon: ['tongue', 'spike'],
    desc: 'What you spit back shatters into bone shards on impact.',
    apply(s) { s.spitSplit = 5; },
  },
  barbedtongue: {
    name: 'Barbed Tongue', from: 'tongue', rarity: 'uncommon', icon: ['tongue', 'barbs'],
    desc: 'The tongue tears through everything along its length.',
    apply(s) { s.tongue.dmg *= 1.6; s.tonguePierce = true; },
  },
  grappletongue: {
    name: 'Grapple Tongue', from: 'barbedtongue', rarity: 'rare', icon: ['tongue', 'grapple'],
    desc: 'Lash anything too big to swallow, or a wall, and the tongue reels YOU in.',
    apply(s) { s.tongueYank = true; },
  },
  venomtongue: {
    name: 'Venom Tongue', from: 'barbedtongue', rarity: 'rare', icon: ['tongue', 'toxic'],
    desc: 'The tongue leaves venom: what it touches bleeds and slows.',
    apply(s) { s.tongueVenom = true; },
  },

  silk: {
    name: 'Silk Spinner', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'Fire spins a line of sticky web across the floor. Anything caught in it is stuck, and the silk cuts.',
    apply(s, l) { s.silk = { delay: 0.8, len: 50 + 10 * l, max: 3 + l, life: 9, dmg: 1.2 + 0.6 * l }; },
  },
  stickyweb: {
    name: 'Sticky Web', from: 'silk', rarity: 'uncommon', icon: ['silk', 'hide'],
    desc: 'The first time something touches a web, it is held completely.',
    apply(s) { s.webHold = 1.4; },
  },
  webbrood: {
    name: 'Cocoon Wrap', from: 'stickyweb', rarity: 'rare', icon: ['silk', 'spider'],
    desc: 'Anything that dies in your web is wrapped up, and spiderlings hatch from it.',
    apply(s) { s.webBrood = 2; },
  },
  tripwire: {
    name: 'Tripwire', from: 'stickyweb', rarity: 'rare', icon: ['silk', 'spines'],
    desc: 'A web snaps when something hits it, firing bone shards all along its length.',
    apply(s) { s.webSnap = true; },
  },
  razorsilk: {
    name: 'Razor Silk', from: 'silk', rarity: 'uncommon', icon: ['silk', 'horns'],
    desc: 'The silk is sharp: it cuts three times as deep.',
    apply(s) { s.silk.dmg *= 3; },
  },
  acidsilk: {
    name: 'Acid Silk', from: 'razorsilk', rarity: 'rare', icon: ['silk', 'bile'],
    desc: 'Whatever touches your web leaks burning bile as it crawls.',
    apply(s) { s.webAcid = true; },
  },
  lair: {
    name: "Spider's Lair", from: 'razorsilk', rarity: 'rare', icon: ['silk', 'chitin'],
    desc: 'More webs that last far longer, and you run faster along your own silk.',
    apply(s) { s.silk.max += 3; s.silk.life *= 2; s.webLair = true; },
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
    requires: { any: ['mitosis', 'twin'], label: 'MITOSIS OR A TWIN' },
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

  bloom: {
    name: 'Bloom', slot: 'HEAD', rarity: 'uncommon',
    desc: 'A carnivorous flower opens on your head. It puffs pollen; pollinated enemies take more damage.',
    apply(s, l) { s.pollen = { r: 42, every: 3.2 - 0.4 * (l - 1) }; },
  },
  venusmaw: {
    name: 'Venus Maw', from: 'bloom', rarity: 'uncommon', icon: ['bloom', 'mandibles'],
    desc: 'The flower bites anything that touches you.',
    apply(s, l) { s.flowerBite = 2 + l; },
  },
  digest: {
    name: 'Digest', from: 'venusmaw', rarity: 'rare', icon: ['bloom', 'hemophage'],
    desc: 'What the flower kills, it digests: it can heal you.',
    apply(s) { s.flowerHeal = 0.3; },
  },
  snaptrap: {
    name: 'Snap Trap', from: 'venusmaw', rarity: 'rare', icon: ['bloom', 'echo'],
    desc: 'The flower snaps shut on what it bites, holding it fast.',
    apply(s) { s.flowerStun = 1.2; },
  },
  sporebloom: {
    name: 'Spore Bloom', from: 'bloom', rarity: 'uncommon', icon: ['bloom', 'mitosis'],
    desc: 'Pollen blinds whatever breathes it.',
    apply(s) { s.pollenBlind = 1.5; },
  },
  hayfever: {
    name: 'Hay Fever', from: 'sporebloom', rarity: 'rare', icon: ['bloom', 'twitch'],
    desc: 'Pollinated enemies choke and stagger, slowed to a crawl.',
    apply(s) { s.pollenSlow = 2; },
  },
  nightbloom: {
    name: 'Night Bloom', from: 'sporebloom', rarity: 'rare', icon: ['bloom', 'nighteyes'],
    desc: 'Pollen glows. Pollinated enemies take twice the extra damage.',
    apply(s) { s.pollenMul = 0.5; },
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

  thornbark: {
    name: 'Thornbark', slot: 'BACK', rarity: 'common',
    desc: 'Thorny bark covers your back: +1 max health, and anything that touches you is shredded.',
    apply(s, l) { s.thorns += 1 + l; s.maxHp += 1; },
    onGain(p) { p.hp += 1; },
  },
  briar: {
    name: 'Briar', from: 'thornbark', rarity: 'uncommon', icon: ['thornbark', 'horns'],
    desc: 'Your thorns hook in: whatever touches you is flung back, bleeding.',
    apply(s) { s.briar = true; },
  },
  bramble: {
    name: 'Bramble Burst', from: 'briar', rarity: 'rare', icon: ['thornbark', 'spines'],
    desc: 'When you are hurt, your thorns burst out in a ring.',
    apply(s) { s.hurtRing = 12; },
  },
  strangling: {
    name: 'Strangling Briar', from: 'briar', rarity: 'rare', icon: ['thornbark', 'tentacles'],
    desc: 'The thorns wrap whatever touches you and hold it.',
    apply(s) { s.briarHold = 1; },
  },
  sap: {
    name: 'Sap', from: 'thornbark', rarity: 'uncommon', icon: ['thornbark', 'regrow'],
    desc: 'Sticky sap: you slowly mend, and anything that touches you is gummed up.',
    apply(s) { s.regen = Math.min(s.regen || 99, 26); s.sapSlow = 2; },
  },
  amber: {
    name: 'Amber', from: 'sap', rarity: 'rare', icon: ['thornbark', 'chitin'],
    desc: 'Once a room, a blow that would nearly kill you seals you in amber instead.',
    apply(s) { s.amber = true; },
  },
  resin: {
    name: 'Resin Armor', from: 'sap', rarity: 'rare', icon: ['thornbark', 'hide'],
    desc: 'Every fourth hit sticks in the resin and never reaches you.',
    apply(s) { s.hitIgnore = s.hitIgnore ? Math.min(s.hitIgnore, 4) : 4; },
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
    requires: { set: 'ABOMINATION', label: 'AN ABOMINATION PART' },
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
    requires: { any: ['skull'], label: 'BATTERING SKULL' },
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

  rootlegs: {
    name: 'Root Legs', slot: 'LIMBS', rarity: 'uncommon',
    desc: 'Slow, rooty legs. Stand still and you take root: you attack faster and slowly heal.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 56 + 4 * l); s.rootLegs = { delay: 0.6, rate: 0.75 - 0.05 * l, heal: 14 - 2 * l }; },
  },
  taproot: {
    name: 'Taproot', from: 'rootlegs', rarity: 'uncommon', icon: ['rootlegs', 'starving'],
    desc: 'Rooted, you drink from the dead: corpses near you dissolve into you.',
    apply(s) { s.taproot = 50; },
  },
  grove: {
    name: 'Grove', from: 'taproot', rarity: 'rare', icon: ['rootlegs', 'polyp'],
    desc: 'Rooted, polyps sprout around you and fight for you.',
    apply(s) { s.grove = 3.5; s.grovePolyp = s.grovePolyp || { dmg: 0.9, rate: 1, life: 12 }; },
  },
  leechroots: {
    name: 'Leech Roots', from: 'taproot', rarity: 'rare', icon: ['rootlegs', 'proboscis'],
    desc: 'Rooted, your roots drink from everything near you. Enough blood heals you.',
    apply(s) { s.rootDrain = 1.5; },
  },
  tumbleroot: {
    name: 'Tumbleroot', from: 'rootlegs', rarity: 'uncommon', icon: ['rootlegs', 'twitch'],
    desc: 'Faster legs, and you take root the instant you stop.',
    apply(s) { s.rootLegs.delay = 0.15; s.speed += 18; },
  },
  seedfall: {
    name: 'Seedfall', from: 'tumbleroot', rarity: 'rare', icon: ['rootlegs', 'eggsac'],
    desc: 'As you walk you drop seeds, and polyps sprout from them.',
    apply(s) { s.seedfall = 3; s.grovePolyp = s.grovePolyp || { dmg: 0.9, rate: 1, life: 12 }; },
  },
  ironwood: {
    name: 'Ironwood', from: 'tumbleroot', rarity: 'rare', icon: ['rootlegs', 'chitin'],
    desc: 'Rooted, every other hit glances off your wood.',
    apply(s) { s.rootGuard = true; },
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
    requires: { set: 'ABOMINATION', label: 'AN ABOMINATION PART' },
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

  heartwood: {
    name: 'Heartwood', slot: 'CORE', rarity: 'common',
    desc: 'A heart of hard wood: +1 max health per growth, and you slowly regrow.',
    apply(s, l) { s.maxHp += l; s.regen = Math.min(s.regen || 99, 32); },
    onGain(p) { p.hp += 1; },
  },
  agerings: {
    name: 'Rings of Age', from: 'heartwood', rarity: 'uncommon', icon: ['heartwood', 'hide'],
    desc: '+1 max health for every floor you have survived.',
    apply(s) { s.maxHp += Math.max(0, game.depth - 1); },
  },
  ancient: {
    name: 'Ancient', from: 'agerings', rarity: 'rare', icon: ['heartwood', 'marrow'],
    desc: '+2 max health and +20% damage. It has seen everything.',
    apply(s) { s.maxHp += 2; s.damageMul *= 1.2; },
  },
  livingwood: {
    name: 'Living Wood', from: 'agerings', rarity: 'rare', icon: ['heartwood', 'regrow'],
    desc: 'You regrow twice as fast.',
    apply(s) { s.regen *= 0.5; },
  },
  bloodsap: {
    name: 'Bloodsap', from: 'heartwood', rarity: 'uncommon', icon: ['heartwood', 'hemophage'],
    desc: 'Your sap is blood: bursting corpses can heal you.',
    apply(s) { s.hemophage += 0.25; },
  },
  fruit: {
    name: 'Fruiting Heart', from: 'bloodsap', rarity: 'rare', icon: ['heartwood', 'overgrown'],
    desc: 'Every room you clear, you grow a fruit that heals.',
    apply(s) { s.roomFruit = true; },
  },
  stranglerfig: {
    name: 'Strangler Fig', from: 'bloodsap', rarity: 'rare', icon: ['heartwood', 'tentacles'],
    desc: '+40% damage, and everything that fights for you lives half again as long.',
    apply(s) { s.damageMul *= 1.4; s.allyLife = (s.allyLife || 1) * 1.5; },
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
  ovipositor: 'Something in you is ready to lay. Pick a host.',
  broodhost: 'Some of them hatch hungry for you, and some hatch hungry for them.',
  swarmqueen: 'What carries your young belongs to you.',
  gestation: 'Let them carry it longer. It grows.',
  bloodworm: 'Your young are ravenous.',
  chestburster: 'They do not leave quietly.',
  puppetlarva: 'It eats the part that thinks first.',
  miasma: 'You stop spitting. You start leaking.',
  shroud: 'Inside your breath, they cannot see.',
  rothalo: 'What dies in your breath keeps rotting.',
  phantom: 'Breathe out, and you are gone.',
  causticlungs: 'The longer they breathe you, the less of them there is.',
  corrode: 'Your breath softens them for everything else.',
  choke: 'The air around you is thick as tar.',
  howl: 'A sound builds in your chest. It does not hurt them. The walls do.',
  shockwave: 'The howl leaves you from every side at once.',
  concussion: 'They hear it, and stop.',
  avalanche: 'Throw one, and it throws the next.',
  soniclance: 'Narrow the howl to a point.',
  wallbreaker: 'The walls are your teeth.',
  rupture: 'It shakes them apart inside.',
  polyp: 'Something wants to take root. Plant it, and let it hunt for you.',
  sporepolyp: 'Your polyps cough spores.',
  fruiting: 'They are ripe. Anything that brushes them, bursts them.',
  mycelialweb: 'Threads join everything you plant.',
  tendrilpolyp: 'Your polyps grow arms.',
  graspingbed: 'What they catch, they keep.',
  feedingpolyps: 'Your garden feeds you back.',
  tongue: 'Your tongue is long now, and sticky. Whatever is small enough, swallow.',
  bottomlessgut: 'There is always more room.',
  acidgut: 'What comes back up is burning.',
  regurgitate: 'Spit it back in pieces.',
  barbedtongue: 'The tongue is barbed. It tears all the way.',
  grappletongue: 'If it will not come to you, go to it.',
  venomtongue: 'Your tongue is wet with venom.',
  silk: 'Silk in your mouth. Lay it down, and let them walk into it.',
  stickyweb: 'Nothing pulls free of the first touch.',
  webbrood: 'What dies in your web becomes a nest.',
  tripwire: 'Touch it, and it snaps.',
  razorsilk: 'The silk is sharp as glass.',
  acidsilk: 'Your silk is wet with bile.',
  lair: 'This is your nest. You know every thread.',
  bloom: 'Something flowers on your head. It breathes out, and they breathe in.',
  venusmaw: 'The flower has teeth.',
  digest: 'What it eats, you keep.',
  snaptrap: 'It closes, and it does not open again for a while.',
  sporebloom: 'The pollen stings their eyes.',
  hayfever: 'They cannot stop choking on it.',
  nightbloom: 'The pollen glows in the dark. So does everything it touches.',
  thornbark: 'Bark grows over your back, studded with thorns.',
  briar: 'The thorns are hooked. They throw what they catch.',
  bramble: 'Hurt you, and the thorns come out.',
  strangling: 'The briar wraps around whatever touches it.',
  sap: 'Sap seeps from your bark. It mends you, and it sticks to them.',
  amber: 'At the very edge, the sap closes over you.',
  resin: 'Some blows simply stick in the resin.',
  rootlegs: 'Roots for legs. Stop moving, and you take root.',
  taproot: 'Your roots find the dead and drink.',
  grove: 'Stand still long enough, and a garden grows around you.',
  leechroots: 'Your roots find the living too.',
  tumbleroot: 'You put down roots the moment you stop.',
  seedfall: 'Seeds fall from you as you walk.',
  ironwood: 'Rooted, you are hard as iron.',
  heartwood: 'Your heart is wood. It grows back.',
  agerings: 'Every floor adds a ring.',
  ancient: 'Old wood. Hard. Patient.',
  livingwood: 'You grow back faster than they can cut.',
  bloodsap: 'Your sap runs red, and the dead refill it.',
  fruit: 'Every victory, your heart fruits.',
  stranglerfig: 'You strangle what you grow around.',
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
    tags: ['spike', 'skull', 'spines', 'marrow', 'hooks', 'flay', 'thornplate', 'needles', 'spinedsegs', 'meteor', 'eruption', 'quake', 'stilts', 'shell', 'calcified', 'hollow', 'regurgitate', 'wallbreaker', 'razorsilk'],
    bonus: [
      { name: 'Ossified', desc: 'Everything you kill bursts into bone shards.', apply(s) { s.setKillShards = 5; } },
      { name: 'Bone Colossus', desc: 'Every kill bursts into shards, +2 max health, and a hit fires a huge shard ring.', apply(s) { s.setKillShards = 8; s.maxHp += 2; s.ring += 10; } },
    ],
    whisper: ['Your bones remember each other.', 'You are more bone than flesh now. It suits you.'],
  },
  FUNGAL: {
    name: 'FUNGAL', color: '#9aae50',
    tags: ['bile', 'fins', 'venomspike', 'caustic', 'sporesac', 'brainworm', 'venomquills', 'huskbomb', 'eggpods', 'venombrood', 'toxic', 'carrionfly', 'bileline', 'bilebomb', 'maggotburst', 'bacteria', 'miasma', 'sporepolyp', 'acidgut'],
    bonus: [
      { name: 'Sporulate', desc: 'What you kill bursts into a blinding spore cloud.', apply(s) { s.setKillCloud = 18; } },
      { name: 'Fruiting Body', desc: 'Kills burst into clouds, you release spores every few seconds, and your clouds eat flesh.', apply(s) { s.setKillCloud = 22; s.setSporeAura = 4; s.cloudDps = Math.max(s.cloudDps || 0, 1.5); } },
    ],
    whisper: ['Something is fruiting under your skin.', 'You are a garden now. Everything you touch will bloom.'],
  },
  HIVE: {
    name: 'HIVE', color: '#e0a830',
    tags: ['mandibles', 'chitin', 'eggsac', 'spider', 'wings', 'longtube', 'compound', 'antennae', 'silktendril', 'jitter', 'tunnelbrood', 'brood', 'ovipositor', 'silk'],
    bonus: [
      { name: 'Swarm', desc: 'Kills sometimes hatch a spiderling.', apply(s) { s.setKillBrood = 0.35; } },
      { name: 'Hive Queen', desc: 'Every kill hatches a spiderling, and your brood lives twice as long.', apply(s) { s.setKillBrood = 1; s.allyLife = 2; } },
    ],
    whisper: ['The others in you begin to hum together.', 'You are the hive. Every death is a birth.'],
  },
  PREDATOR: {
    name: 'PREDATOR', color: '#d04848',
    tags: ['proboscis', 'nighteyes', 'twitch', 'burrow', 'hide', 'starving', 'feral', 'leech', 'lashdrain', 'horns', 'evileye', 'berserkhost', 'huntsman', 'hemophage', 'howl', 'tongue'],
    bonus: [
      { name: 'Blood Scent', desc: '+35% damage to wounded prey.', apply(s) { s.setWounded = 0.35; } },
      { name: 'Apex', desc: 'Wounded prey takes +50%, every kill sends you into a frenzy, and every 8th kill heals you.', apply(s) { s.setWounded = 0.5; s.setKillFrenzy = true; s.setKillHeal = 8; } },
    ],
    whisper: ['You can smell where they are hurt.', 'Nothing hunts you now. You hunt.'],
  },
  PLANT: {
    name: 'PLANT', color: '#7ab84a',
    tags: ['polyp', 'bloom', 'thornbark', 'rootlegs', 'heartwood', 'mycelialweb', 'feedingpolyps', 'graspingbed', 'grove'],
    bonus: [
      { name: 'Photosynthesis', desc: 'Stand still, and you slowly heal.', apply(s) { s.setStillRegen = 10; } },
      { name: 'Overgrowth', desc: 'Stand still to heal fast and grow polyps around you. +1 max health.', apply(s) { s.setStillRegen = 6; s.grove = Math.min(s.grove || 99, 4); s.grovePolyp = s.grovePolyp || { dmg: 0.9, rate: 1, life: 12 }; s.groveAnywhere = true; s.maxHp += 1; } },
    ],
    whisper: ['You are putting down roots.', 'You are a garden now. Stand still, and everything grows.'],
  },
  ABOMINATION: {
    name: 'ABOMINATION', color: '#b464c8',
    tags: ['tentacles', 'eyes', 'parasite', 'grapple', 'mitosis', 'barbedlash', 'vomit', 'mawtendrils', 'bloodbattery', 'bloat', 'banshee', 'lightless', 'splitquills', 'lure', 'biters', 'cilia', 'slipstream', 'secondheart', 'regrow', 'overgrown', 'cancer', 'bloodworm'],
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

// ===========================================================================
// SPLICES. Hidden pairings between parts in DIFFERENT slots. Grow both halves
// (anywhere along their paths) and they fuse into something new. Each half
// lists the nodes that count. Cards never name a splice; a card that would
// complete one just says SOMETHING STIRS.
// ===========================================================================
const SPLICES = {
  firestorm:      { name: 'Firestorm',       parts: [['sporefire'], ['cropduster']],      apply(s) { s.fireTrail = true; },
    desc: 'The spore trail you drop while flying is burning.', whisper: 'Everything you drop behind you is burning.' },
  hivemind:       { name: 'Hive Mind',       parts: [['brood'], ['eggsac']],              apply(s) { s.allyDmg = 2; s.allyLife = Math.max(s.allyLife || 1, 1.5); },
    desc: 'Your brood bites twice as hard and lives longer.', whisper: 'All your children share one mind now. Yours.' },
  bonesaw:        { name: 'Bone Saw',        parts: [['spines'], ['mantis']],             apply(s) { s.boneSaw = true; },
    desc: 'Dashing sprays bone shards the whole way.', whisper: 'Lunge, and the shards come loose all along the way.' },
  bloodpump:      { name: 'Blood Pump',      parts: [['proboscis'], ['hemophage']],       apply(s) { s.drainDna = 8; },
    desc: 'The blood you drink turns into DNA.', whisper: 'What you drink, you keep.' },
  echochamber:    { name: 'Echo Chamber',    parts: [['echo'], ['spines']],               apply(s) { s.screamRing = 10; },
    desc: 'Your scream shakes a ring of shards loose.', whisper: 'The scream rattles the bones in your back loose.' },
  livingarmor:    { name: 'Living Armor',    parts: [['chitin'], ['hide']],               apply(s) { s.shellOnKills = 5; },
    desc: 'Every 5 kills regrow your shell.', whisper: 'Your hide feeds your shell. Kill, and it grows back.' },
  septicblood:    { name: 'Septic Blood',    parts: [['toxic'], ['mitosis']],             apply(s) { s.hurtFrags = 8; },
    desc: 'When you bleed, your blood splits into seeking acid fragments.', whisper: 'Your blood divides as it leaves you, and it hunts.' },
  parasiticbrood: { name: 'Parasitic Brood', parts: [['parasite'], ['brood']],            apply(s) { s.parasiteBrood = 3; },
    desc: 'When the parasite takes control, maggots burst out of you.', whisper: 'When it drives, it lays.' },
  impaler:        { name: 'Impaler',         parts: [['horns'], ['huntsman', 'locust']],  apply(s) { s.slamBleed = 3; s.slamStun = Math.max(s.slamStun || 0, 0.6); },
    desc: 'Your pounce lands horns first: everything under it bleeds and reels.', whisper: 'Land horns first.' },
  acidskin:       { name: 'Acid Skin',       parts: [['acidmaw'], ['urchinhide']],        apply(s) { s.contactMark = true; },
    desc: 'Anything that touches you bursts into bile when it dies.', whisper: 'Your skin bites too. What it bites, it rots.' },
  nightmarelure:  { name: 'Nightmare Lure',  parts: [['nighteyes'], ['lure']],            apply(s) { s.nightLure = true; },
    desc: 'Your lure is a dark eye that blinds whatever comes close.', whisper: 'The light on your back has learned to look back.' },
  plaguebearer:   { name: 'Plaguebearer',    parts: [['ovipositor'], ['brood']],          apply(s) { s.oviMaggots = true; },
    desc: 'Your hosts burst into maggots too.', whisper: 'Everything you lay in, breeds.' },
  toxicwings:     { name: 'Toxic Wings',     parts: [['miasma'], ['wings']],              apply(s) { s.gasTrail = true; },
    desc: 'Flying, you leave a trail of your toxic gas behind you.', whisper: 'Your wings stir the poison into the air.' },
  resonance:      { name: 'Resonance',       parts: [['howl'], ['echo']],                 apply(s) { s.dashHowl = true; },
    desc: 'Your dash scream howls too, hurling everything near you away.', whisper: 'Your skull and your throat sing together.' },
  greenhouse:     { name: 'Greenhouse',      parts: [['bloom'], ['polyp']],               apply(s) { s.polypPollen = true; if (!s.pollen) s.pollen = { r: 0, every: 99 }; },
    desc: 'Your polyps spit pollen: whatever they hit is pollinated.', whisper: 'Your garden pollinates for you.' },
  strangler:      { name: 'Strangler',       parts: [['thornbark'], ['rootlegs']],        apply(s) { s.rootLash = 0.8; },
    desc: 'While you are rooted, your thorns lash everything around you.', whisper: 'Rooted, the thorns reach out on their own.' },
  wingedbrood:    { name: 'Winged Brood',    parts: [['wings'], ['eggsac']],              apply(s) { s.flyingBrood = true; },
    desc: 'Your spiderlings hatch with wings: faster, and they fly over everything.', whisper: 'Your children are born with wings.' },
};

// Every splice whose two halves you've grown.
function activeSplices(p) {
  const has = ids => ids.some(id => hasMutation(p, id));
  return Object.keys(SPLICES).filter(k => SPLICES[k].parts.every(has));
}

// Would picking `id` complete a splice you don't have yet?
function wouldSplice(p, id) {
  const now = activeSplices(p);
  return Object.keys(SPLICES).some(k => {
    if (now.includes(k)) return false;
    const parts = SPLICES[k].parts;
    const i = parts.findIndex(ids => ids.includes(id));
    return i >= 0 && parts.every((ids, j) => j === i || ids.some(x => hasMutation(p, x)));
  });
}

// ===========================================================================
// COLORATION. Parts recolor your whole body: spider legs make you dark and
// chitinous, a frog tongue turns you frog-green... Every node in a slot's
// path can carry a tint: [color, strength 0-1, darkening 0-1]. The body
// blends all of them (see bodyTint in player.js).
// ===========================================================================
const TINTS = {
  // MOUTH
  spike: ['#d8ccb0', 0.25], bile: ['#a8b840', 0.5], mandibles: ['#6a4020', 0.45, 0.15], tentacles: ['#8a3a6a', 0.5],
  proboscis: ['#a03040', 0.4], ovipositor: ['#d8c890', 0.5], miasma: ['#6a9a3a', 0.55, 0.1], howl: ['#8a6a50', 0.35],
  polyp: ['#c86a8a', 0.4], tongue: ['#4aa040', 0.65], silk: ['#c8c0b8', 0.45],
  // HEAD
  eyes: ['#c8a8a0', 0.2], skull: ['#d8ccb0', 0.35], nighteyes: ['#3a3a6a', 0.45, 0.25], parasite: ['#8a4a9a', 0.45], bloom: ['#d86a8a', 0.35],
  // BACK
  spines: ['#d8ccb0', 0.35], chitin: ['#6a4a24', 0.5, 0.15], eggsac: ['#d8c8a0', 0.3], twitch: ['#b04030', 0.4], thornbark: ['#6a5030', 0.5, 0.1],
  toxic: ['#9ac030', 0.4],
  // LIMBS
  spider: ['#3a2a30', 0.7, 0.4], wings: ['#7a6a8a', 0.4], grapple: ['#8a3a6a', 0.5], burrow: ['#6a5038', 0.5, 0.15],
  fins: ['#5a8aa0', 0.5], rootlegs: ['#6a5030', 0.5, 0.1], centipede: ['#7a3a1a', 0.4, 0.1],
  // CORE
  hide: ['#7a5a48', 0.35], marrow: ['#d8ccb0', 0.3], mitosis: ['#c86a9a', 0.4], starving: ['#8a7a6a', 0.4, 0.15],
  heartwood: ['#6a5030', 0.45], overgrown: ['#9a2030', 0.35],
};

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
//   a FULLY GROWN slot -> METAMORPHOSIS: any root of a higher rarity than yours.
//     Taking it sheds the old path and starts the slot over at level 1.
function slotOffers(p, slot) {
  const m = p.slots[slot];
  if (!m || m.starter) return rootsOf(slot);
  const kids = childrenOf(m.id);
  if (kids.length) return kids;
  const rank = RARITY_ORDER.indexOf(MUTATIONS[m.path[0]].rarity);
  return rootsOf(slot).filter(r => RARITY_ORDER.indexOf(MUTATIONS[r].rarity) > rank && meetsRequirement(p, r));
}

// Some rarer roots only grow as a metamorphosis if the right part grows
// ELSEWHERE on the body (`requires: { any: [ids] }` or `{ set }`).
function meetsRequirement(p, id) {
  const req = MUTATIONS[id].requires;
  if (!req) return true;
  const slot = slotOf(id);
  return SLOTS.some(sl => {
    const m = sl !== slot && p.slots[sl];
    if (!m || m.starter) return false;
    if (req.any && req.any.some(x => m.path.includes(x))) return true;
    return !!(req.set && setOf(m.id) === req.set);
  });
}

// Is this card a metamorphosis (a new root for a slot that's already grown)?
function isMetamorph(p, id) {
  const m = p.slots[slotOf(id)];
  return !MUTATIONS[id].from && !!m && !m.starter;
}

// Roll `n` cards. Usually one slot shows BOTH of its next branches side by
// side, so you see exactly which path you're giving up.
// `onlySlot`: a devoured boss core offers only CORE cards. Normal evolutions
// never offer CORE: you grow it by eating what guards each floor.
function rollChoices(p, n, minRarity, onlySlot) {
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

  if (onlySlot) {
    const ids = slotOffers(p, onlySlot).slice();
    if (!ids.length) return [{ id: '_gorge' }];
    const out = [];
    if (ids.includes('hide')) out.push({ id: ids.splice(ids.indexOf('hide'), 1)[0] }); // health is always on the table
    while (out.length < n && ids.length) out.push({ id: ids.splice(ids.indexOf(pickWeighted(ids)), 1)[0] });
    if (out.every(c => isMetamorph(p, c.id))) out.push({ id: '_gorge' }); // you can always decline
    return out.sort(() => Math.random() - 0.5);
  }
  const offers = {};
  for (const slot of SLOTS) { if (slot === 'CORE') continue; const o = slotOffers(p, slot); if (o.length) offers[slot] = o; }
  const slots = Object.keys(offers).sort(() => Math.random() - 0.5);
  const out = [];
  // Still spitting the starter slime? Always offer a way out of it.
  if (offers.MOUTH && p.slots.MOUTH && p.slots.MOUTH.starter) {
    out.push({ id: pickWeighted(offers.MOUTH) });
    slots.splice(slots.indexOf('MOUTH'), 1);
  }
  // A fork: both branches of one slot.
  const forks = slots.filter(sl => p.slots[sl] && childrenOf(p.slots[sl].id).length === 2);
  if (forks.length && n - out.length >= 2 && Math.random() < 0.8) {
    const sl = forks[Math.floor(Math.random() * forks.length)];
    for (const id of childrenOf(p.slots[sl].id)) out.push({ id });
    slots.splice(slots.indexOf(sl), 1);
  }
  // Fill the rest with one card per other slot. At most one metamorphosis per
  // roll, and only sometimes: it's a tempting option, never the whole offer.
  let metas = 0;
  for (const sl of slots) {
    if (out.length >= n) break;
    const id = pickWeighted(offers[sl]);
    if (isMetamorph(p, id)) { if (metas || Math.random() < 0.5) continue; metas++; }
    out.push({ id });
  }
  // Still short (few slots left)? Take more from what's on offer.
  const left = Object.values(offers).flat().filter(id => !out.some(c => c.id === id) && !isMetamorph(p, id));
  while (out.length < n && left.length) out.push({ id: left.splice(Math.floor(Math.random() * left.length), 1)[0] });
  if (!out.length || out.every(c => isMetamorph(p, c.id))) out.push({ id: '_gorge' }); // you can always decline
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
    status = m && !m.starter ? 'METAMORPHOSIS' : 'TAKES ROOT';
    if (m) { note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = m.starter ? COST_COLOR : PAL.slate; }
    if (m && !m.starter && d.requires) { note = 'FED BY ' + d.requires.label; noteColor = VIAL_COLOR; }
    else note = 'NO OTHER ' + slot + ' ROOTS';
  } else {
    status = (m ? MUTATIONS[m.id].name : '') + ' >';
    const sib = siblingOf(c.id);
    if (sib) { note = 'LOCKS OUT ' + MUTATIONS[sib].name; noteColor = COST_COLOR; }
  }
  return {
    id: c.id, name: d.name, rarity: d.rarity, desc: d.desc, cost: d.cost, malignant: !!d.malignant, cures: !!d.cures, set: setOf(c.id),
    slot, status, note, noteColor, tier: m && d.from ? m.path.length : 0, overlays: mutOverlays(c.id), stirs: wouldSplice(p, c.id),
  };
}

// --- Applying a choice ------------------------------------------------------------
function applyChoice(p, c) {
  if (c.id === '_gorge') { p.hp = Math.min(p.maxHp, p.hp + 2); return; }
  p.evolutions++;
  const d = MUTATIONS[c.id], slot = slotOf(c.id), m = p.slots[slot];
  if (!d.from) {
    if (m) bloodSpray(p.x, p.y, 0, 0, 14, FLUID.blood, 90); // the old part tears out
    if (m && !m.starter) { // Metamorphosis: the grown path sloughs off; something rarer takes root
      game.banner = { text: 'METAMORPHOSIS', sub: MUTATIONS[m.id].name + ' > ' + d.name, color: RARITY[d.rarity].color, t: 2.6 };
      gibs(p.x, p.y, 6, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
      game.shake = Math.max(game.shake, 4);
    }
    p.slots[slot] = { id: c.id, path: [c.id] };
  } else {
    m.path.push(c.id);
    m.id = c.id;
    m.starter = false;
  }
  whisper(HINTS[c.id]);
  p.lastSet = setOf(c.id);
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

'use strict';
// ---------------------------------------------------------------------------
// MUTATIONS: the heart of the game.
//
// Your body has TYPED SLOTS, in two tracks (like weapons and passives):
//   WEAPON (id 'MOUTH'): an attack (fire button). Room for two; both fire.
//   LIMBS: how you move, plus a right-click ability. One set.
//   HEAD:  senses, plus an ability that fires by itself. One head.
//   BACK:  what happens when you dash or get hurt. One back.
//   CORE:  your engine. Only planted from devoured boss cores.
// You start with a WEAPON, LIMBS and HEAD slot open. Each devoured boss core
// opens the next slot in SLOT_ORDER (CORE, then BACK, then a second WEAPON),
// so a finished body is six parts: never zero weapons, never five.
// BOSS PICKS (`boss: true`): the strangest roots (the playstyle mouths,
// Tentacles, Parasite Brain) are rare finds in colored vials, never level-ups.
//
// Each part grows ONE path:
//   plant a ROOT in a free slot (or replace your starter slime);
//   then it BRANCHES. Two ways to go; taking one locks out the other.
//   root -> branch -> branch, then it's fully grown (4 end forms per root).
// Biomass level-ups don't evolve parts: they LEVEL them (a small stat bump).
// At level 3 a part evolves (you choose its branch) and its level resets.
// Vials and boss cores still evolve directly.
//
// Each node tweaks the stat sheet (see baseStats); branches mostly set flags
// that the game code reacts to (Bone Jaws: every bite drives a spike out the
// back of the victim). The more involved mechanics live in abilities.js.
//
// To add a branch: add an entry to MUTATIONS with `from: '<parent id>'`, plus a
// whisper in HINTS. Art: paint an icon in sprites.js (ICON_PAINT), or reuse two
// with `icon: ['a', 'b']`.
// ---------------------------------------------------------------------------

const LOCS = ['MOUTH', 'HEAD', 'BACK', 'LIMBS', 'CORE'];
const LOC_MAX = { MOUTH: 2, HEAD: 1, BACK: 1, LIMBS: 1, CORE: 1 }; // the most of each a body can hold
// The order slots open in: the first START_SLOTS at birth, then one per devoured boss core.
const SLOT_ORDER = ['MOUTH', 'LIMBS', 'HEAD', 'CORE', 'BACK', 'MOUTH'];
const START_SLOTS = 3;                  // you start with all of them empty
const MAX_SLOTS = SLOT_ORDER.length;    // the hard cap: a finished body is 6 parts
const WILD_CHANCE = 0.15;              // the first vials' chance of a rare find
const LOC_NAME = { MOUTH: 'WEAPON', HEAD: 'HEAD', BACK: 'BACK', LIMBS: 'LIMBS', CORE: 'CORE' }; // what the player sees
const LEVEL_MAX = 3;                    // levels before a part evolves
// POWER IS EARNED. A fresh body hits at 70%; every fully grown part and every
// splice adds +6%. A finished body ends up far stronger than it started.
const BASE_POWER = 0.7, POWER_PER_GROWN = 0.06, POWER_PER_SPLICE = 0.06;
function bodyPower(p) {
  const grown = p.parts.filter(m => !m.starter && !childrenOf(m.id).length).length;
  return BASE_POWER + POWER_PER_GROWN * grown + POWER_PER_SPLICE * activeSplices(p).length;
}

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
    limbActive: null, headActive: null, // right-click / automatic head abilities (see ACTIVES in abilities.js)
    limbCdMul: 1, headCdMul: 1,         // their cooldowns (part levels shorten them)
    limbCount: 0,
    // --- Attacks (MOUTH). Every weapon fires on its own timer, so they stack. ---
    damageMul: 1, rateMul: 1, damage: 1,
    onHit: {},    // statuses each attack leaves behind (see onHit())
    guns: [],     // projectile weapons (see gun() below)
    rangeAdd: 0, speedAdd: 0, // extra shot range / speed (Extra Eyes, Bone Lance)
    bite: false, biteDmg: 0, biteDelay: 9, biteReach: 18, biteAcid: 0, biteHeal: 0, doubleBite: false, leech: 0,
    lash: false, lashDmg: 0, lashDelay: 9, lashRange: 52, lashTargets: 1, lashAcid: 0, pull: false,
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
    dashCd: 0.8, dashTime: 0.14, dashDmg: 0, slamDmg: 0, slamR: 0, dashReset: false,
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
  s.slimeTrail = s.slug || s.fins > 0 || s.shell || !!s.alwaysSlime; // slugs, snails, pseudopods (and the Sticky) leave slime
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

// What an attack leaves behind: onHit(s, 'lash', 'bleed', { t: 3, dps: 2 }) makes
// every lash bleed. Sources: melee, any (every shot and melee hit), bite, lash,
// lunge, dash, slam, howl, beam, burrow, barb, tongue, silk, pollen, gas, ovi, contact, jelly.
// Extras: chance (0-1), say ([text, color] floated when it lands). Two parts giving
// the same status to the same source keep the stronger of each value, or with
// mode 'add', add up their magnitudes (Gore Horns' bleed grows with its level).
function onHit(s, source, id, opts, extra = {}, mode) {
  if (!STATUS_IDS.includes(id)) throw new Error('onHit: unknown status ' + id);
  const list = s.onHit[source] ||= [];
  const cur = list.find(h => h.id === id);
  if (!cur) { list.push(Object.assign({ id, opts: Object.assign({}, opts) }, extra)); return; }
  for (const k in opts) cur.opts[k] = mode === 'add' && k !== 't' ? (cur.opts[k] || 0) + opts[k] : Math.max(cur.opts[k] ?? -Infinity, opts[k]);
  Object.assign(cur, extra);
}
const STATUS_IDS = ['bleed', 'stun', 'slow', 'web', 'blind', 'mark', 'corrode', 'pollen', 'leak', 'acidMark', 'chill', 'net']; // (status.js loads later)

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
  bonewall: {
    name: 'Bone Wall', from: 'shotgun', rarity: 'rare', icon: ['spike', 'chitin'],
    desc: 'A full-charge blast leaves a wall of bone spikes for a few seconds. It cuts whatever touches it and stops enemy shots.',
    apply(s) { s.boneWall = true; },
  },
  shrapnel: {
    name: 'Shrapnel Storm', from: 'shotgun', rarity: 'rare', icon: ['spike', 'mitosis'],
    desc: 'Half again as much shrapnel, and every piece shatters into fragments on a hit.',
    apply(s) { s.chargeBonus = true; s.blastSplit = 2; },
  },
  lance: {
    name: 'Bone Lance', from: 'spike', rarity: 'uncommon', icon: ['spike', 'eyes'],
    desc: 'Longer spikes that punch through one enemy and shatter any enemy shot they cross.',
    apply(s) { s.rangeAdd += 0.25; s.pierce += 1; s.spikeEat = true; },
  },
  splinter: {
    name: 'Splinter', from: 'lance', rarity: 'rare', icon: ['spike', 'mitosis'],
    desc: 'A spike that kills bursts into a ring of bone shards.',
    apply(s) { s.spikeKillRing = 6; },
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
    apply(s, l) { MUTATIONS.mandibles.apply(s, l); onHit(s, 'bite', 'acidMark', { t: Infinity }); },
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
    desc: 'Melee. Fire bites whatever is in front of you, hard and fast; you lunge onto prey just out of reach, and what you bite reels.',
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
    apply(s) { onHit(s, 'lunge', 'bleed', { t: 3, dps: 3 }); s.bleedFeed = 0.12; },
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
    apply(s) { onHit(s, 'lash', 'leak', { t: 3 }); },
  },
  writhing: {
    name: 'Writhing Mass', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'grapple'],
    desc: 'Many more tendrils: +2 targets and longer reach.',
    apply(s) { s.lashTargets += 2; s.lashRange += 15; },
  },
  strangle: {
    name: 'Strangle', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'echo'],
    desc: 'Lashed enemies are held fast for a moment.',
    apply(s) { onHit(s, 'lash', 'stun', { t: 0.6 }); },
  },
  hooks: {
    name: 'Bone Hooks', from: 'tentacles', rarity: 'uncommon', icon: ['tentacles', 'spike'],
    desc: 'Hooked tendrils: much longer reach, and wounds bleed.',
    apply(s) { s.lashRange += 25; onHit(s, 'lash', 'bleed', { t: 3, dps: 2 }); },
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
    apply(s) { onHit(s, 'beam', 'bleed', { t: 2, dps: 2 }); },
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
    name: 'Ovipositor', slot: 'MOUTH', boss: true, rarity: 'rare', overlay: ['proboscis'],
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
    apply(s) { onHit(s, 'ovi', 'blind', { t: 0.4 }); onHit(s, 'ovi', 'slow', { t: 0.3 }); },
  },

  miasma: {
    requires: { any: ['toxic', 'bacteria', 'fins'], label: 'TOXIC BLOOD, BACTERIA OR PSEUDOPODS' },
    name: 'Miasma', slot: 'MOUTH', boss: true, rarity: 'rare',
    desc: 'No attack. You leak a toxic cloud that eats everything near you. Hold fire to vent it wider, but you slow down.',
    apply(s, l) { s.miasma = { r: 30 + 4 * (l - 1), dps: 1.6 + 0.6 * (l - 1) }; },
  },
  shroud: {
    name: 'Spore Shroud', from: 'miasma', rarity: 'uncommon', icon: ['miasma', 'eyes'],
    desc: 'Enemies inside your gas lose track of you.',
    apply(s) { onHit(s, 'gas', 'blind', { t: 0.4 }); },
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
    apply(s) { onHit(s, 'gas', 'corrode', { t: 0.3 }); },
  },
  choke: {
    name: 'Choke', from: 'causticlungs', rarity: 'rare', icon: ['miasma', 'twitch'],
    desc: 'Your gas slows enemies, and their shots crawl through it.',
    apply(s) { s.gasChoke = true; onHit(s, 'gas', 'slow', { t: 0.3 }); }, // (gasChoke also slows bullets in your gas)
  },

  howl: {
    name: 'Howl', slot: 'MOUTH', boss: true, rarity: 'uncommon',
    desc: 'A sonic cone that barely hurts but hurls enemies into walls and each other, and shreds their shots out of the air.',
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
    apply(s) { onHit(s, 'howl', 'stun', { t: 0.8 }); },
  },
  avalanche: {
    name: 'Avalanche', from: 'shockwave', rarity: 'rare', icon: ['howl', 'skull'],
    desc: 'Anything flung into another enemy flings that one too.',
    apply(s) { s.howlChain = true; },
  },
  soniclance: {
    name: 'Bone Choir', from: 'howl', rarity: 'uncommon', icon: ['howl', 'spike'],
    desc: 'A narrower, longer howl that carries a spray of bone shards with it.',
    apply(s) { s.howl.cone = 0.85; s.howl.range *= 1.5; s.howlShards = 5; },
  },
  wallbreaker: {
    name: 'Wallbreaker', from: 'soniclance', rarity: 'rare', icon: ['howl', 'marrow'],
    desc: 'Enemies you slam into walls take far more and burst into bone shards.',
    apply(s) { s.wallSlamMul = 2.5; },
  },
  rupture: {
    name: 'Rupture', from: 'soniclance', rarity: 'rare', icon: ['howl', 'horns'],
    desc: 'The howl ruptures them inside: they bleed.',
    apply(s) { onHit(s, 'howl', 'bleed', { t: 3, dps: 2.5 }); },
  },

  polyp: {
    name: 'Polyp Seeder', slot: 'MOUTH', boss: true, rarity: 'uncommon',
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
    name: 'Frog Tongue', slot: 'MOUTH', boss: true, rarity: 'uncommon',
    desc: 'Hold fire to coil a long tongue, release to lash it out (further the longer you hold). Small prey is swallowed whole; tap fire to spit it back out.',
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
    apply(s) { onHit(s, 'tongue', 'bleed', { t: 3, dps: 2 }); onHit(s, 'tongue', 'slow', { t: 1.5 }); },
  },

  silk: {
    name: 'Silk Spinner', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'Fire spins a line of sticky web across the floor. Anything caught in it is stuck, and the silk cuts.',
    apply(s, l) { s.silk = { delay: 0.8, len: 50 + 10 * l, max: 3 + l, life: 9, dmg: 1.2 + 0.6 * l }; },
  },
  stickyweb: {
    name: 'Sticky Web', from: 'silk', rarity: 'uncommon', icon: ['silk', 'hide'],
    desc: 'The first time something touches a web, it is held completely.',
    apply(s) { onHit(s, 'silk', 'stun', { t: 1.4 }, { say: ['STUCK', '#e0d8d0'] }); },
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
    apply(s) { onHit(s, 'silk', 'leak', { t: 3 }); },
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
    desc: 'Shots curve toward prey. Melee reaches further. Every few seconds it marks the toughest prey in sight; it takes more damage from everything.',
    apply(s, l) { s.homing += 2 + 1.5 * l; s.headActive = { kind: 'mark', l }; s.rangeAdd += 0.1 * l; s.reach += 3 * l; },
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
    desc: 'Your dash becomes a charge that rams enemies for heavy damage. Anything that gets in your face takes a brutal, stunning headbutt.',
    apply(s, l) { s.dashDmg += 2 + 2 * l; s.headActive = { kind: 'headbutt', l }; },
  },
  horns: {
    name: 'Gore Horns', from: 'skull', rarity: 'uncommon', overlay: ['gorehorns'],
    desc: 'Charge further. Enemies you ram bleed out over time.',
    apply(s, l) { s.dashTime += 0.04 * l; s.dashDmg += l; onHit(s, 'dash', 'bleed', { t: 3, dps: 1.5 * l }, {}, 'add'); },
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
    name: 'Bone Echo', from: 'skull', rarity: 'uncommon', overlay: ['echo'], icon: ['skull', 'antennae'],
    desc: 'Your skull rings: every headbutt and every dash bursts bone shards out of you.',
    apply(s, l) { s.skullRing = 4 + 2 * l; },
  },
  shatter: {
    name: 'Shatter Scream', from: 'echo', rarity: 'rare', icon: ['skull', 'spike'],
    desc: 'Stunned enemies take double damage.',
    apply(s) { s.stunBreak = true; },
  },
  ossified: {
    name: 'Ossified Skull', from: 'echo', rarity: 'rare', icon: ['skull', 'chitin'],
    desc: 'While your headbutt is ready, your skull takes a hit for you. Then it has to recover.',
    apply(s) { s.skullGuard = true; },
  },

  nighteyes: {
    name: 'Night Eyes', slot: 'HEAD', rarity: 'uncommon', malignant: true, overlay: ['compound'],
    desc: '+50% damage (more as it grows) to enemies outside your light. When something closes in, your light snuffs out and the whole room goes dark.',
    cost: 'Your light shrinks to a small circle.',
    apply(s, l) { s.nightEyes += 0.3 + 0.2 * l; s.headActive = { kind: 'blackout', l }; s.lightMul *= 0.6; },
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
    name: 'Parasite Brain', slot: 'HEAD', boss: true, rarity: 'rare', malignant: true, overlay: ['parasite'],
    desc: '+60% damage with everything. Every few seconds it mind-spikes the nearest enemy, stunning and wounding it.',
    cost: 'Sometimes it takes control of your body.',
    apply(s, l) { s.damageMul *= 1.6; s.parasite = true; s.headActive = { kind: 'mindspike', l }; },
  },
  symbiote: {
    name: 'Symbiote', from: 'parasite', rarity: 'legendary', cures: true, icon: ['parasite', 'antennae'],
    desc: 'CURED. The parasite works with you now: keep the damage, keep control.',
    apply(s) { s.symbiote = true; },
  },
  brainworm: {
    name: 'Brain Worm', from: 'symbiote', rarity: 'rare', icon: ['parasite', 'echo'],
    desc: 'Your hits sometimes stun.',
    apply(s) { onHit(s, 'any', 'stun', { t: 0.8 }, { chance: 0.12 }); },
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
    desc: 'A carnivorous flower opens on your head. It puffs pollen; pollinated enemies take more damage. When something gets close, it bursts, pollinating everything around you.',
    apply(s, l) { s.pollen = { r: 42, every: 3.2 - 0.4 * (l - 1) }; s.headActive = { kind: 'pollenburst', l }; },
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
    apply(s) { onHit(s, 'pollen', 'blind', { t: 1.5 }); },
  },
  hayfever: {
    name: 'Hay Fever', from: 'sporebloom', rarity: 'rare', icon: ['bloom', 'twitch'],
    desc: 'Pollinated enemies choke and stagger, slowed to a crawl.',
    apply(s) { onHit(s, 'pollen', 'slow', { t: 2 }); },
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
    name: 'Quill Guard', from: 'spines', rarity: 'uncommon', icon: ['spines', 'chitin'],
    desc: 'Your bone shards shatter any enemy shot they touch.',
    apply(s) { s.ringEat = true; },
  },
  bonestorm: {
    name: 'Piercing Quills', from: 'quillpulse', rarity: 'rare', icon: ['spines', 'spike'],
    desc: 'More shards, and each one punches through two enemies.',
    apply(s) { s.ring += 4; s.ringPierce = 2; },
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
    desc: 'Eight skittering legs. Quick, responsive movement. Right-click: spit a web that sticks enemies in place.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 76 + 8 * l); s.limbActive = { kind: 'web', l }; },
  },
  huntsman: {
    name: 'Huntsman', from: 'spider', rarity: 'legendary', overlay: ['hindlegs'], icon: ['spider', 'hindlegs'],
    desc: 'Your dash is a pounce that leaps straight at prey and lands with a shockwave.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.hop = 0; s.homingPounce = true; },
  },
  trapdoor: {
    name: 'Trapdoor', from: 'huntsman', rarity: 'rare', icon: ['hindlegs', 'echo'],
    desc: 'Your pounce stuns everything it lands on.',
    apply(s) { onHit(s, 'slam', 'stun', { t: 1.2 }); },
  },
  mantis: {
    name: 'Mantis Scythes', from: 'huntsman', rarity: 'uncommon', overlay: ['scythes'], icon: ['spider', 'horns'],
    desc: 'Your pounce slices everything it passes through.',
    apply(s, l) { s.dashDmg += 3 + 2 * l; onHit(s, 'dash', 'bleed', { t: 3, dps: 1.5 * l }, {}, 'add'); s.dashTime += 0.04; },
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
    desc: 'Fast but floaty flight. Drift over crates and tanks. Right-click: a wing beat that blows enemies and their shots away.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 112 + 10 * l); s.limbActive = { kind: 'gust', l }; s.accel = s.accel || 330 + 30 * l; s.drag = s.drag || 1.5; s.flyover = true; s.dashTime += 0.05; },
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
    name: 'Tentacles', slot: 'LIMBS', boss: true, rarity: 'rare', overlay: ['tentlimbs'],
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
    desc: 'Dash dives underground. Untouchable while buried; erupt with damage. Right-click: a tremor that stuns everything near you.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 64); s.limbActive = { kind: 'tremor', l }; s.burrow = Math.max(s.burrow, 0.5 + 0.1 * l); s.burrowDmg += 3 + l; },
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
    apply(s) { s.burrowDmg *= 1.6; onHit(s, 'burrow', 'bleed', { t: 3, dps: 3 }); },
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
    desc: 'Slide fast through your own slime and bile; sluggish everywhere else. Right-click: roll out a wave of slime to ride.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 52); s.limbActive = { kind: 'slimewave', l }; s.fins = 118 + 12 * l; },
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
    desc: 'Your organs harden: you start every floor with a grey armor heart (up to 2).',
    apply(s) { s.calcified = true; },
    onGain(p) { p.armor = Math.max(p.armor || 0, 1); },
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
    desc: 'Heavier bones. Every hit or shot you block feeds them: more damage with everything for a few seconds (it stacks).',
    apply(s, l) { s.damageMul *= 1 + 0.05 * l; s.marrowFeed = 0.06 + 0.02 * l; },
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
    name: 'Pressure Marrow', from: 'loaded', rarity: 'rare', icon: ['marrow', 'chitin'],
    desc: 'Holding a charge braces you: the first hit while you hold it is blocked, and the charge is spent.',
    apply(s) { s.chargeGuard = true; },
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
    desc: 'Burst corpses sometimes birth a friendly maggot instead of biomass.',
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
    desc: 'Corpses give double biomass.',
    cost: 'Go 30s without bursting a corpse and you starve, losing health (never fatal).',
    apply(s) { s.dnaMul *= 2; s.starve = 30; },
  },
  apexpredator: {
    name: 'Apex Predator', from: 'starving', rarity: 'legendary', cures: true, icon: ['starving', 'hemophage'],
    desc: 'CURED. Keep double biomass. You never starve, and bursts can heal you.',
    apply(s) { s.starve = 0; s.hemophage += 0.3; },
  },
  bacteria: {
    name: 'Gut Bacteria', from: 'apexpredator', rarity: 'common', icon: ['starving', 'mitosis'],
    desc: 'Even more biomass per corpse, but corpses take longer to burst.',
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

  // --- Bone Plates: armor you can see, and it fights back ---
  boneplates: {
    name: 'Bone Plates', slot: 'CORE', rarity: 'uncommon', icon: ['marrow', 'chitin'],
    desc: 'Bone plates orbit you and block enemy shots. A plate that breaks bursts into shrapnel. They all regrow in every new room.',
    apply(s, l) { s.plates = Math.max(s.plates || 0, 2 + l); s.plateShards = Math.max(s.plateShards || 0, 4); },
  },
  razorplates: {
    name: 'Razor Plates', from: 'boneplates', rarity: 'uncommon', icon: ['marrow', 'horns'],
    desc: 'The plates have edges: they cut whatever they pass through.',
    apply(s, l) { s.plateDmg = 1.5 + 0.5 * l; },
  },
  bladestorm: {
    name: 'Bladestorm', from: 'razorplates', rarity: 'rare', icon: ['marrow', 'spines'],
    desc: 'Every few seconds in a fight, a plate flings itself at the nearest enemy and swings back.',
    apply(s) { s.plateFling = 2.2; },
  },
  bonemill: {
    name: 'Bone Mill', from: 'razorplates', rarity: 'rare', icon: ['marrow', 'mitosis'],
    desc: 'Whatever the plates kill bursts into bone shards.',
    apply(s) { s.plateMill = 5; },
  },
  ossuary: {
    name: 'Ossuary', from: 'boneplates', rarity: 'uncommon', icon: ['marrow', 'regrow'],
    desc: 'Broken plates regrow even in the middle of a fight.',
    apply(s, l) { s.plateRegrow = 7 - l; },
  },
  boneward: {
    name: 'Bone Ward', from: 'ossuary', rarity: 'rare', icon: ['chitin', 'skull'],
    desc: 'A plate throws itself in front of any hit meant for you.',
    apply(s) { s.boneWard = true; },
  },
  shrapnelheart: {
    name: 'Shrapnel Heart', from: 'ossuary', rarity: 'rare', icon: ['spines', 'hemophage'],
    desc: 'Plates burst into twice the shrapnel, and every 6th plate that breaks heals you.',
    apply(s) { s.plateShards = 8; s.plateHeal = 6; },
  },

  // --- Mirror Cyst: throw their shots back ---
  mirrorcyst: {
    name: 'Mirror Cyst', slot: 'CORE', rarity: 'rare', icon: ['eyes', 'mitosis'],
    desc: 'A glassy membrane in front of you throws enemy shots back, twice as hard. It needs a moment to recover after each.',
    apply(s, l) { s.mirror = { cd: 1.6 - 0.3 * (l - 1), arc: 0.45, mul: 2 }; },
  },
  lensskin: {
    name: 'Lens Skin', from: 'mirrorcyst', rarity: 'uncommon', icon: ['eyes', 'abyssal'],
    desc: 'Thrown-back shots seek a target and hit twice as hard again.',
    apply(s) { s.mirror.mul *= 2; s.mirror.homing = 3; },
  },
  blindinglens: {
    name: 'Blinding Lens', from: 'lensskin', rarity: 'rare', icon: ['eyes', 'echo'],
    desc: 'Thrown-back shots stun whatever they hit.',
    apply(s) { s.mirror.stun = 1; },
  },
  prism: {
    name: 'Prism', from: 'lensskin', rarity: 'rare', icon: ['abyssal', 'mitosis'],
    desc: 'Every thrown-back shot splits into three.',
    apply(s) { s.mirror.split = true; },
  },
  mirrorshell: {
    name: 'Mirror Shell', from: 'mirrorcyst', rarity: 'uncommon', icon: ['chitin', 'eyes'],
    desc: 'The membrane wraps all the way around you, but recovers slower.',
    apply(s) { s.mirror.arc = -1; s.mirror.cd *= 1.4; },
  },
  echoshell: {
    name: 'Echo Shell', from: 'mirrorshell', rarity: 'rare', icon: ['echo', 'spines'],
    desc: 'Every shot it throws back also sends a ring of shards out from you.',
    apply(s) { s.mirror.ring = 6; },
  },
  feedingglass: {
    name: 'Feeding Glass', from: 'mirrorshell', rarity: 'rare', icon: ['eyes', 'hemophage'],
    desc: 'Every 6th shot it throws back heals you.',
    apply(s) { s.mirror.heal = 6; },
  },

  // ================= NEW STARTING MOUTHS =================
  barbs: {
    name: 'Barb Flinger', slot: 'MOUTH', rarity: 'common', icon: ['spike', 'barbs'],
    desc: 'Fling barbed hooks that stick in what they hit, then rip out a moment later for more damage.',
    apply(s, l) { gun(s, { id: 'barbs', dmg: 0.8 + 0.25 * l, delay: 0.7, speed: 150, r: 2, barb: 1.6 + 0.6 * l, color: '#d8ccb0', sound: 'spine' }); },
  },
  fishhook: {
    name: 'Fishhooks', from: 'barbs', rarity: 'uncommon', icon: ['barbs', 'grapple'],
    desc: 'When the barbs rip out, they drag their victim toward you.',
    apply(s) { s.barbPull = true; },
  },
  chainhook: {
    name: 'Chain Hooks', from: 'fishhook', rarity: 'rare', icon: ['barbs', 'tentacles'],
    desc: 'A barb that rips out flies on into the next enemy.',
    apply(s) { s.barbChain = true; },
  },
  guthook: {
    name: 'Gut Hooks', from: 'fishhook', rarity: 'rare', icon: ['barbs', 'hemophage'],
    desc: 'Ripped-out barbs leave their victims bleeding badly.',
    apply(s) { onHit(s, 'barb', 'bleed', { t: 3, dps: 3 }); },
  },
  barbvolley: {
    name: 'Barb Volley', from: 'barbs', rarity: 'uncommon', icon: ['barbs', 'spines'],
    desc: 'Fling three barbs at once. Barbs stuck in the same enemy rip out together, each one harder.',
    apply(s) { const g = s.guns.find(g => g.id === 'barbs'); if (g) { g.count = 3; g.spread = 0.12; } s.barbBundle = 0.25; },
  },
  thornstorm: {
    name: 'Thorn Burst', from: 'barbvolley', rarity: 'rare', icon: ['barbs', 'spines'],
    desc: 'Barbs that rip out burst into bone shards.',
    apply(s) { s.barbBurst = 3; },
  },
  seekbarbs: {
    name: 'Seeking Barbs', from: 'barbvolley', rarity: 'rare', icon: ['barbs', 'eyes'],
    desc: 'Your barbs curve toward prey.',
    apply(s) { s.homing += 3; },
  },

  sneeze: {
    name: 'Spore Sneeze', slot: 'MOUTH', rarity: 'common', icon: ['membrane', 'toxic'],
    desc: 'A short, wide sneeze of spores. Whatever it hits is blinded for a moment.',
    apply(s, l) { gun(s, { id: 'sneeze', dmg: 0.45 + 0.15 * l, delay: 0.6, speed: 115, range: 0.34, count: 5, spread: 0.32, r: 1.5, blind: 1.1 + 0.2 * l, round: true, fade: true, color: '#c4cca4', sound: 'spray' }); },
  },
  allergen: {
    name: 'Allergen', from: 'sneeze', rarity: 'uncommon', icon: ['toxic', 'eyes'],
    desc: 'Blinded enemies take more damage from everything.',
    apply(s) { s.allergen = 0.4; },
  },
  hives: {
    name: 'Hives', from: 'allergen', rarity: 'rare', icon: ['toxic', 'mitosis'],
    desc: 'Whatever dies blinded bursts into a spore cloud.',
    apply(s) { s.hivesCloud = true; },
  },
  histamine: {
    name: 'Histamine', from: 'allergen', rarity: 'rare', icon: ['toxic', 'slime'],
    desc: 'Your sneezes also slow what they hit to a crawl.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) g.slow = 1.4; },
  },
  sneezefit: {
    name: 'Sneezing Fit', from: 'sneeze', rarity: 'uncommon', icon: ['membrane', 'twitch'],
    desc: 'Sneeze twice as often, wider.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) { g.delay *= 0.55; g.spread += 0.1; } },
  },
  pollenstorm: {
    name: 'Pollen Storm', from: 'sneezefit', rarity: 'rare', icon: ['membrane', 'bloom'],
    desc: 'Your sneezes pollinate what they hit: it takes more damage.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) g.pollen = true; if (!s.pollen) s.pollen = { r: 0, every: 99 }; },
  },
  mucus: {
    name: 'Mucus', from: 'sneezefit', rarity: 'rare', icon: ['membrane', 'bile'],
    desc: 'Your sneezes are thick with burning mucus.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) { g.acid = 6; g.acidChance = 0.3; } },
  },

  leechspit: {
    name: 'Leech Spitter', slot: 'MOUTH', rarity: 'uncommon', icon: ['proboscis', 'hemophage'],
    desc: 'Spit leeches that latch on and bleed their victims. Bled-out kills sometimes heal you.',
    apply(s, l) { gun(s, { id: 'leech', dmg: 0.6 + 0.2 * l, delay: 0.65, speed: 130, r: 2, bleed: 1 + 0.4 * l, round: true, color: '#5e2229', sound: 'splat' }); s.leechFeed = Math.max(s.leechFeed || 0, 0.08); },
  },
  fatleech: {
    name: 'Fat Leeches', from: 'leechspit', rarity: 'uncommon', icon: ['hemophage', 'overgrown'],
    desc: 'Swollen leeches: they bleed their victims much harder.',
    apply(s) { const g = s.guns.find(g => g.id === 'leech'); if (g) g.bleed *= 1.6; },
  },
  leechswarm: {
    name: 'Leech Swarm', from: 'fatleech', rarity: 'rare', icon: ['hemophage', 'eggsac'],
    desc: 'Whatever bleeds to death releases maggots that fight for you.',
    apply(s) { s.leechBrood = 2; },
  },
  bloodpact: {
    name: 'Blood Pact', from: 'fatleech', rarity: 'rare', icon: ['hemophage', 'secondheart'],
    desc: 'Bled-out kills heal you far more often.',
    apply(s) { s.leechFeed = 0.25; },
  },
  leechspray: {
    name: 'Leech Spray', from: 'leechspit', rarity: 'uncommon', icon: ['proboscis', 'spines'],
    desc: 'Spit three smaller leeches at once.',
    apply(s) { const g = s.guns.find(g => g.id === 'leech'); if (g) { g.count = 3; g.spread = 0.2; g.dmg *= 0.7; } },
  },
  anticoag: {
    name: 'Anticoagulant', from: 'leechspray', rarity: 'rare', icon: ['hemophage', 'toxic'],
    desc: 'Bleeding enemies take more damage from everything.',
    apply(s) { s.anticoag = 0.3; },
  },
  hungryleech: {
    name: 'Hungry Leeches', from: 'leechspray', rarity: 'rare', icon: ['hemophage', 'eyes'],
    desc: 'Your leeches seek out prey.',
    apply(s) { s.homing += 3; },
  },

  // ================= NEW STARTING LIMBS =================
  crablegs: {
    name: 'Crab Legs', slot: 'LIMBS', rarity: 'common', icon: ['spider', 'chitin'],
    desc: 'Quick, armored legs. Right-click: snap a pincer shut on whatever is in front of you.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 80 + 6 * l); s.limbActive = { kind: 'pincer', l }; },
  },
  carapacelegs: {
    name: 'Shell Claw', from: 'crablegs', rarity: 'uncommon', icon: ['chitin', 'hide'],
    desc: 'Your pincer is a shield too: snapping it shatters the enemy shots in front of you.',
    apply(s) { s.shellClaw = true; },
  },
  kingcrab: {
    name: 'King Crab', from: 'carapacelegs', rarity: 'rare', icon: ['chitin', 'horns'],
    desc: 'A huge pincer: it crushes everything in front of you, harder.',
    apply(s) { s.pincerWide = true; s.pincerMul = 1.5; },
  },
  boxercrab: {
    name: 'Pistol Shrimp', from: 'carapacelegs', rarity: 'rare', icon: ['chitin', 'slam'],
    desc: 'The pincer snaps so hard it fires a shockwave forward.',
    apply(s) { s.pincerShock = true; },
  },
  scuttle: {
    name: 'Scuttle', from: 'crablegs', rarity: 'uncommon', icon: ['spider', 'spines'],
    desc: 'Every dash leaves a bone spike behind. It cuts what steps on it and stops enemy shots.',
    apply(s) { s.dashSpike = true; },
  },
  sidestep: {
    name: 'Sidestep', from: 'scuttle', rarity: 'rare', icon: ['spider', 'membrane'],
    desc: 'Dashing through enemy shots destroys them.',
    apply(s) { s.dashEat = true; },
  },
  coconutcrab: {
    name: 'Coconut Crab', from: 'scuttle', rarity: 'rare', icon: ['chitin', 'adrenal'],
    desc: 'A pincer kill refreshes the pincer and your dash.',
    apply(s) { s.pincerReset = true; },
  },

  haunches: {
    name: 'Haunches', slot: 'LIMBS', rarity: 'uncommon', icon: ['hindlegs', 'feral'],
    desc: 'Powerful hopping legs; your dash is a pounce. Right-click: leap to where you point and land with a shockwave.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.limbActive = { kind: 'leap', l }; },
  },
  pouncer: {
    name: 'Pouncer', from: 'haunches', rarity: 'uncommon', icon: ['hindlegs', 'slam'],
    desc: 'You land harder, and the shockwave stuns.',
    apply(s) { s.slamDmg += 2; onHit(s, 'slam', 'stun', { t: 0.8 }); },
  },
  gorepounce: {
    name: 'Gore Pounce', from: 'pouncer', rarity: 'rare', icon: ['hindlegs', 'hemophage'],
    desc: 'Everything you land on bleeds.',
    apply(s) { onHit(s, 'slam', 'bleed', { t: 3, dps: 3 }); },
  },
  killerleap: {
    name: 'Killing Leap', from: 'pouncer', rarity: 'rare', icon: ['hindlegs', 'adrenal'],
    desc: 'A landing that kills lets you leap again at once.',
    apply(s) { s.leapReset = true; },
  },
  longstride: {
    name: 'Long Stride', from: 'haunches', rarity: 'uncommon', icon: ['hindlegs', 'wings'],
    desc: 'No more hopping: a fast, smooth run, and your leap reaches much further.',
    apply(s) { s.hop = 0; s.speed = Math.max(s.speed, 118); s.leapRange = 125; },
  },
  sprinter: {
    name: 'Sprinter', from: 'longstride', rarity: 'rare', icon: ['hindlegs', 'twitch'],
    desc: 'Faster still, and your dash recovers quicker.',
    apply(s) { s.speed += 20; s.dashCd *= 0.8; },
  },
  antelope: {
    name: 'Antelope', from: 'longstride', rarity: 'rare', icon: ['hindlegs', 'membrane'],
    desc: 'Nothing can touch you for the whole leap, and a moment after.',
    apply(s) { s.leapInv = true; },
  },

  // ================= TRAITS: you are what you eat =================
  // Torn from elites you devour (see GRAFT_OF). Never offered otherwise.
  // They level like any part, and at full growth each evolves once.
  ratincisors: {
    name: 'Rat Incisors', slot: 'MOUTH', graft: 'rat', rarity: 'uncommon', icon: ['mandibles', 'hemophage'],
    desc: 'Gnawing teeth: quick little bites that leave whatever you bite bleeding.',
    apply(s, l) { s.bite = true; s.biteDmg += 1 + 0.5 * l; s.biteDelay = Math.min(s.biteDelay, 0.24); onHit(s, 'melee', 'bleed', { t: 3, dps: 2 }); },
  },
  urchinquills: {
    name: 'Urchin Quills', slot: 'BACK', graft: 'urchin', rarity: 'uncommon', icon: ['spines', 'barbs'],
    desc: 'In a fight, your quills fire a ring of spines every couple of seconds on their own.',
    apply(s, l) { s.quillPulse = Math.min(s.quillPulse || 99, 2.6 - 0.2 * l); s.quillCount = Math.max(s.quillCount || 0, 6); },
  },
  toadgullet: {
    name: 'Toad Gullet', slot: 'MOUTH', graft: 'spitter', rarity: 'uncommon', icon: ['bile', 'toxic'],
    desc: 'Lob globs of bile that burst into burning puddles.',
    apply(s, l) { gun(s, { id: 'toad', dmg: 1.8 + 0.4 * l, delay: 1.1, lob: true, acid: 12, r: 3, round: true, color: '#8a9a30', sound: 'splat' }); },
  },
  splittercells: {
    name: 'Splitter Cells', slot: 'CORE', graft: 'splitter', rarity: 'uncommon', icon: ['mitosis', 'regrow'],
    desc: 'When you are hurt, pieces of you split off and fight for you.',
    apply(s, l) { s.hurtBrood = 1 + (l >= 2 ? 1 : 0); },
  },
  culturejelly: {
    name: 'Culture Jelly', slot: 'BACK', graft: 'culture', rarity: 'uncommon', icon: ['regrow', 'bile'],
    desc: 'Where your dash ends, a sticky jelly bursts out and holds everything near.',
    apply(s, l) { s.dashJelly = 1.2 + 0.2 * l; },
  },
  // ...and what each becomes, fully grown.
  plagueteeth: {
    name: 'Plague Teeth', from: 'ratincisors', rarity: 'rare', icon: ['hemophage', 'toxic'],
    desc: 'Faster bites, and biting something that bleeds spreads its bleeding to everything near it.',
    apply(s) { s.biteDelay *= 0.8; s.plagueTeeth = true; },
  },
  pincushion: {
    name: 'Pincushion', from: 'urchinquills', rarity: 'rare', icon: ['barbs', 'spines'],
    desc: 'A thicker ring of quills, and they also fire every time you are hurt.',
    apply(s) { s.quillCount = Math.max(s.quillCount || 0, 10); s.quillOnHurt = true; },
  },
  bullfrog: {
    name: 'Bullfrog', from: 'toadgullet', rarity: 'rare', icon: ['toxic', 'overgrown'],
    desc: 'Bigger, heavier globs that bounce once on landing, bursting twice.',
    apply(s) { const g = s.guns.find(x => x.id === 'toad'); if (g) { g.r = 4; g.dmg *= 1.3; g.acid = 16; g.bounce = 1; } },
  },
  mitosis2: {
    name: 'Runaway Mitosis', from: 'splittercells', rarity: 'rare', icon: ['mitosis', 'overgrown'],
    desc: 'More of you splits off when you are hurt, and in a fight a piece splits off on its own every few seconds.',
    apply(s) { s.hurtBrood = (s.hurtBrood || 0) + 1; s.splitPulse = 7; },
  },
  digestjelly: {
    name: 'Digesting Jelly', from: 'culturejelly', rarity: 'rare', icon: ['bile', 'regrow'],
    desc: 'A wider jelly that digests what it holds: they bleed, and stay slowed after it lets go.',
    apply(s) { s.jellyR = 34; onHit(s, 'jelly', 'bleed', { t: 3, dps: 2.5 }); onHit(s, 'jelly', 'slow', { t: 2.5 }); },
  },
};

// Which elite gives which trait.
const GRAFT_OF = { rat: 'ratincisors', urchin: 'urchinquills', spitter: 'toadgullet', splitter: 'splittercells', culture: 'culturejelly' };

// WHISPERS: the cryptic line that appears when something new grows in you.
// Cards never explain mutations; these hint at what just changed.
const HINTS = {
  // MOUTH
  slime: 'You spit what you crawl in.',
  spike: 'Bone grows behind your teeth, waiting to leave.',
  shotgun: 'The bone splinters before it leaves you. Hold it in. Let it build.',
  bonewall: 'Fire it all at once, and the bone stays where it lands.',
  shrapnel: 'The splinters splinter.',
  lance: 'The bone grows long and hard. What it meets in the air, it breaks.',
  splinter: 'What your spikes kill comes apart in splinters.',
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
  echo: 'Your skull rings like a bell. Every blow shakes bone loose.',
  shatter: 'What the scream freezes, breaks.',
  ossified: 'Your skull hardens into a helmet. Let it take the blow.',
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
  quillpulse: 'Your shards are hard enough to break what they fire at you.',
  bonestorm: 'Your shards are needles now. They go through.',
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
  calcified: 'Your organs are turning to stone. Something in you always holds.',
  bonecage: 'Some blows simply do not reach you.',
  secondheart: 'A second beat, quiet, waiting for the first to stop.',
  regrow: 'What is lost comes back. Slowly.',
  hemophage: 'Breaking them open makes you whole.',
  mending: 'What is lost comes back quickly now.',
  marrow: 'Your bones drink every blow you turn aside.',
  loaded: 'Your bones are heavy now. Hold your fire, and let it build.',
  overcharge: 'Hold it long enough, and it bursts out of you.',
  pressure: 'Brace while it builds. Nothing gets through.',
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
  barbs: 'Your spit grows hooks.',
  fishhook: 'The hooks pull them in when they tear free.',
  chainhook: 'A hook never stops at one.',
  guthook: 'They come out with pieces attached.',
  barbvolley: 'More hooks, all at once.',
  thornstorm: 'The hooks come out in pieces.',
  seekbarbs: 'The hooks look for meat.',
  sneeze: 'Something itches deep in your sinuses.',
  allergen: 'They choke on you.',
  hives: 'What chokes, blooms.',
  histamine: 'They swell and slow.',
  sneezefit: 'You cannot stop sneezing.',
  pollenstorm: 'You sneeze pollen now.',
  mucus: 'It burns coming out.',
  leechspit: 'Something wriggles in your throat, hungry.',
  fatleech: 'Your leeches grow fat.',
  leechswarm: 'They breed in what they drain.',
  bloodpact: 'What they drink, you drink.',
  leechspray: 'They come out in clumps now.',
  anticoag: 'Their blood will not stop.',
  hungryleech: 'They can smell blood.',
  crablegs: 'Hard, jointed legs, and something that snaps.',
  carapacelegs: 'The claw is a shield as much as a weapon.',
  kingcrab: 'One claw grows huge.',
  boxercrab: 'Your claw snaps faster than sound.',
  scuttle: 'You shed spikes as you scuttle.',
  sidestep: 'Shots break against your legs.',
  coconutcrab: 'Every crushed thing makes you hungrier.',
  haunches: 'Your hind legs coil, ready to spring.',
  pouncer: 'You land like a hammer.',
  gorepounce: 'You land claws first.',
  killerleap: 'Kill, and leap again.',
  longstride: 'You stop hopping. You run.',
  sprinter: 'Faster.',
  antelope: 'Nothing catches you in the air.',
  ratincisors: 'You took its teeth.',
  urchinquills: 'Its quills grew back in your skin.',
  toadgullet: 'Its gullet is yours now. It still wants to spit.',
  splittercells: 'Its cells did not stop dividing inside you.',
  culturejelly: 'You are a little bit culture now.',
  plagueteeth: 'What you bite rots, and the rot does not stay put.',
  pincushion: 'Touch you, and you bristle.',
  bullfrog: 'Your throat swells. What comes up comes up twice.',
  mitosis2: 'You cannot stop dividing. You do not want to.',
  digestjelly: 'The jelly is hungry too.',
  boneplates: 'Bone grows outside you now, circling, waiting for something to stop.',
  razorplates: 'Their edges are sharp.',
  bladestorm: 'The plates want to fly.',
  bonemill: 'What they grind up, they scatter.',
  ossuary: 'Bone grows back. It always grows back.',
  boneward: 'They throw themselves in front of you.',
  shrapnelheart: 'When they break, you feel it, and it feeds you.',
  mirrorcyst: 'Something glassy forms in front of you. It does not like being hit.',
  lensskin: 'It aims what it throws back.',
  blindinglens: 'It flashes when it throws.',
  prism: 'One shot in, three out.',
  mirrorshell: 'It wraps all the way around you now.',
  echoshell: 'Every throw rings out.',
  feedingglass: 'It drinks a little of what it throws.',
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
  soniclance: 'Your howl carries bone with it.',
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
  // Parts other nodes grow
  spores: 'Something grows in your lungs. Cough it high, over their heads.',
  hindlegs: 'Coiled legs. Leap, and the ground will feel it.',
};

// ===========================================================================
// SETS. Every node belongs to a set (it inherits its parent's unless listed
// here). Each part counts as the set of its CURRENT form, so a branch can
// switch a part to another set. 3 matching parts wake a bonus; 5 wake a
// stronger one. Cards show the set, never what the mutation does.
// ===========================================================================
const SETS = {
  BONE: {
    name: 'BONE', color: '#d9cfa0',
    tags: ['spike', 'hooks', 'howl', 'regurgitate', 'tripwire', 'compound', 'skull', 'spines', 'chitin', 'needles', 'spinedsegs', 'meteor', 'pupa', 'eruption', 'quake', 'stilts', 'shell', 'hide', 'marrow', 'boneplates', 'mirrorcyst', 'barbs', 'crablegs', 'urchinquills'],
    bonus: [
      { name: 'Ossified', desc: 'Everything you kill bursts into bone shards.', apply(s) { s.setKillShards = 5; } },
      { name: 'Bone Colossus', desc: 'Every kill bursts into shards, +2 max health, and a hit fires a huge shard ring.', apply(s) { s.setKillShards = 8; s.maxHp += 2; s.ring += 10; } },
    ],
    whisper: ['Your bones remember each other.', 'You are more bone than flesh now. It suits you.'],
  },
  FUNGAL: {
    name: 'FUNGAL', color: '#9aae50',
    tags: ['culturejelly', 'venomspike', 'bile', 'caustic', 'sporesac', 'miasma', 'sporepolyp', 'acidgut', 'acidsilk', 'glare', 'bloom', 'venomquills', 'huskbomb', 'eggpods', 'toxic', 'cropduster', 'bileline', 'bilebomb', 'fins', 'maggotburst', 'bacteria', 'sneeze', 'toadgullet', 'digestjelly'],
    bonus: [
      { name: 'Sporulate', desc: 'What you kill bursts into a blinding spore cloud.', apply(s) { s.setKillCloud = 18; } },
      { name: 'Fruiting Body', desc: 'Kills burst into clouds, you release spores every few seconds, and your clouds eat flesh.', apply(s) { s.setKillCloud = 22; s.setSporeAura = 4; s.cloudDps = Math.max(s.cloudDps || 0, 1.5); } },
    ],
    whisper: ['Something is fruiting under your skin.', 'You are a garden now. Everything you touch will bloom.'],
  },
  HIVE: {
    name: 'HIVE', color: '#e0a830',
    tags: ['ovipositor', 'puppetlarva', 'polyp', 'graspingbed', 'feedingpolyps', 'silk', 'snaptrap', 'molt', 'eggsac', 'broodmother', 'spider', 'wings', 'silktendril', 'tunnelbrood', 'brood', 'leechswarm'],
    bonus: [
      { name: 'Swarm', desc: 'Kills sometimes hatch a spiderling.', apply(s) { s.setKillBrood = 0.35; } },
      { name: 'Hive Queen', desc: 'Every kill hatches a spiderling, and your brood lives twice as long.', apply(s) { s.setKillBrood = 1; s.allyLife = 2; } },
    ],
    whisper: ['The others in you begin to hum together.', 'You are the hive. Every death is a birth.'],
  },
  PREDATOR: {
    name: 'PREDATOR', color: '#d04848',
    tags: ['mandibles', 'leech', 'devour', 'hemorrhage', 'rupture', 'tongue', 'eyes', 'horns', 'nighteyes', 'twitch', 'huntsman', 'burrow', 'hindlegs', 'hemophage', 'starving', 'guthook', 'leechspit', 'haunches', 'ratincisors'],
    bonus: [
      { name: 'Blood Scent', desc: '+35% damage to wounded prey.', apply(s) { s.setWounded = 0.35; } },
      { name: 'Apex', desc: 'Wounded prey takes +50%, every kill sends you into a frenzy, and every 8th kill heals you.', apply(s) { s.setWounded = 0.5; s.setKillFrenzy = true; s.setKillHeal = 8; } },
    ],
    whisper: ['You can smell where they are hurt.', 'Nothing hunts you now. You hunt.'],
  },
  ABOMINATION: {
    name: 'ABOMINATION', color: '#b464c8',
    tags: ['mawtendrils', 'tentacles', 'writhing', 'strangle', 'lashdrain', 'proboscis', 'bloodworm', 'tendrilpolyp', 'fractured', 'lightless', 'parasite', 'splitquills', 'angler', 'rage', 'biters', 'grapple', 'shredpull', 'secondheart', 'regrow', 'overgrown', 'mitosis', 'cancer', 'splittercells'],
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

// How many parts match each set, by each part's current form.
function setCounts(p) {
  const n = {};
  for (const m of p.parts) {
    const k = !m.starter && setOf(m.id);
    if (k) n[k] = (n[k] || 0) + 1;
  }
  return n;
}

// The set bonus you have right now: { set, tier (0 = 3 matching, 1 = 5 matching) } or null.
function activeSet(p) {
  const n = setCounts(p);
  for (const k in n) if (n[k] >= 3) return { set: k, tier: n[k] >= 5 ? 1 : 0, count: n[k] };
  return null;
}

// ===========================================================================
// SPLICES. Hidden pairings between parts from DIFFERENT places on the body.
// Grow both halves (anywhere along their paths) and they fuse into something
// new, and into ONE part: every splice frees a slot. Each half
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
    desc: 'The blood you drink turns into biomass.', whisper: 'What you drink, you keep.' },
  echochamber:    { name: 'Echo Chamber',    parts: [['echo'], ['spines']],               apply(s) { s.ringStun = 0.5; },
    desc: 'Your shards ring in their skulls: whatever they hit is stunned for a moment.', whisper: 'The ringing in your skull is in your shards now.' },
  livingarmor:    { name: 'Living Armor',    parts: [['chitin'], ['hide']],               apply(s) { s.shellOnKills = 5; },
    desc: 'Every 5 kills regrow your shell.', whisper: 'Your hide feeds your shell. Kill, and it grows back.' },
  septicblood:    { name: 'Septic Blood',    parts: [['toxic'], ['mitosis']],             apply(s) { s.hurtFrags = 8; },
    desc: 'When you bleed, your blood splits into seeking acid fragments.', whisper: 'Your blood divides as it leaves you, and it hunts.' },
  parasiticbrood: { name: 'Parasitic Brood', parts: [['parasite'], ['brood']],            apply(s) { s.parasiteBrood = 3; },
    desc: 'When the parasite takes control, maggots burst out of you.', whisper: 'When it drives, it lays.' },
  impaler:        { name: 'Impaler',         parts: [['horns'], ['huntsman', 'locust']],  apply(s) { onHit(s, 'slam', 'bleed', { t: 3, dps: 3 }); onHit(s, 'slam', 'stun', { t: 0.6 }); },
    desc: 'Your pounce lands horns first: everything under it bleeds and reels.', whisper: 'Land horns first.' },
  acidskin:       { name: 'Acid Skin',       parts: [['acidmaw'], ['urchinhide']],        apply(s) { onHit(s, 'contact', 'acidMark', { t: Infinity }); },
    desc: 'Anything that touches you bursts into bile when it dies.', whisper: 'Your skin bites too. What it bites, it rots.' },
  nightmarelure:  { name: 'Nightmare Lure',  parts: [['nighteyes'], ['lure']],            apply(s) { s.nightLure = true; },
    desc: 'Your lure is a dark eye that blinds whatever comes close.', whisper: 'The light on your back has learned to look back.' },
  plaguebearer:   { name: 'Plaguebearer',    parts: [['ovipositor'], ['brood']],          apply(s) { s.oviMaggots = true; },
    desc: 'Your hosts burst into maggots too.', whisper: 'Everything you lay in, breeds.' },
  toxicwings:     { name: 'Toxic Wings',     parts: [['miasma'], ['wings']],              apply(s) { s.gasTrail = true; },
    desc: 'Flying, you leave a trail of your toxic gas behind you.', whisper: 'Your wings stir the poison into the air.' },
  resonance:      { name: 'Resonance',       parts: [['howl'], ['echo']],                 apply(s) { s.dashHowl = true; },
    desc: 'Your headbutt howls too, hurling everything near you away.', whisper: 'Your skull and your throat sing together.' },
  greenhouse:     { name: 'Greenhouse',      parts: [['bloom'], ['polyp']],               apply(s) { s.polypPollen = true; if (!s.pollen) s.pollen = { r: 0, every: 99 }; },
    desc: 'Your polyps spit pollen: whatever they hit is pollinated.', whisper: 'Your garden pollinates for you.' },
  toadking:       { name: 'Toad King',       parts: [['toadgullet'], ['tongue']],         apply(s) { s.spitAcid = Math.max(s.spitAcid || 0, 14); },
    desc: 'What you swallow and spit back bursts into burning bile.', whisper: 'Two gullets, one hunger.' },
  quillstorm:     { name: 'Quill Storm',     parts: [['urchinquills'], ['boneplates']],   apply(s) { s.quillCount = 12; },
    desc: 'Your quills fire twice as many spines.', whisper: 'Every spine in you wants out.' },
  wingedbrood:    { name: 'Winged Brood',    parts: [['wings'], ['eggsac']],              apply(s) { s.flyingBrood = true; },
    desc: 'Your spiderlings hatch with wings: faster, and they fly over everything.', whisper: 'Your children are born with wings.' },

  // --- BIG SPLICES: new ways to fight. Both halves must be FULLY GROWN. ---
  divebomb:       { name: 'Dive Bomb',       parts: [['mandibles'], ['wings']], grown: 3,      apply(s) { s.diveBomb = true; },
    desc: 'Your dash ends in a swooping bite that savages and stuns everything where you land.', whisper: 'Fall on them, jaws first.' },
    bilegarden:     { name: 'Bile Garden',     parts: [['bile'], ['polyp']], grown: 3,          apply(s) { s.bilePolyps = true; },
    desc: 'Your polyps spray burning bile, twice as fast.', whisper: 'Your garden weeps acid.' },
  broodhowl:      { name: 'Brood Howl',      parts: [['howl'], ['eggsac']], grown: 3,         apply(s) { s.broodHowl = 2; },
    desc: 'Your howl lays eggs in everything it hits. When they die, spiderlings burst out.', whisper: 'Your scream is full of eggs.' },
  bonecannon:     { name: 'Bone Cannon',     parts: [['spike'], ['skull']], grown: 3,         apply(s) { s.boneCannon = true; },
    desc: 'Your headbutt fires a huge bone lance that punches through everything in a line.', whisper: 'Your skull is a barrel now.' },
  bonejaws:       { name: 'Bone Jaws',       parts: [['spike'], ['mandibles']],         apply(s) { s.boneJaws = true; },
    desc: 'Every bite drives a bone spike out through the back of the victim.', whisper: 'Teeth and bone, one mouth. What you bite, the bone goes through.' },
  barbedlash:     { name: 'Barbed Lash',     parts: [['spike'], ['tentacles']],         apply(s) { s.barbedLash = true; },
    desc: 'Every lash flings a bone spike from the victim to the next enemy.', whisper: 'Tendrils tipped with bone. What they strike, they pass along.' },
  silknursery:    { name: 'Silk Nursery',    parts: [['silk'], ['spider']], grown: 3,         apply(s) { s.silkNursery = 1.1; },
    desc: 'Whatever is stuck in your webs is swarmed: spiderlings keep hatching on it.', whisper: 'Your webs are a nursery, and the stuck are food.' },
  toxicbloom:     { name: 'Toxic Bloom',     parts: [['miasma'], ['bloom']], grown: 3,        apply(s) { s.toxicBloom = true; },
    desc: 'Your gas carries pollen, and your pollen burst leaves a poison cloud on everything it touches.', whisper: 'Your flower breathes your poison.' },
  seismichowl:    { name: 'Seismic Howl',    parts: [['howl'], ['burrow']], grown: 3,         apply(s) { s.seismicHowl = true; },
    desc: 'You erupt from the ground howling in every direction, hurling everything away.', whisper: 'The ground screams with you.' },
  bloodgulp:      { name: 'Blood Gulp',      parts: [['tongue'], ['proboscis']], grown: 3,    apply(s) { s.bloodGulp = true; },
    desc: 'Everything you swallow heals you, and what you spit back bursts like a blood bomb.', whisper: 'You drink them whole.' },
  batteringram:   { name: 'Battering Ram',   parts: [['chitin'], ['skull']], grown: 3,        apply(s) { s.batteringRam = true; },
    desc: 'With your shell up, your charge hits three times as hard and stuns everything it hits.', whisper: 'Shell first, skull first, through them.' },
  venombarrage:   { name: 'Venom Barrage',   parts: [['spike'], ['bile']], grown: 3,          apply(s) { s.venomBarrage = true; },
    desc: 'Your bone spikes fly through your flame: every one that hits bursts into burning bile.', whisper: 'Two mouths, one fire.' },
};

// Every splice whose two halves you've grown (big ones: both fully grown),
// each half in its own part.
function splicesOf(parts) {
  return Object.keys(SPLICES).filter(k => {
    const S = SPLICES[k], need = S.grown || 1;
    const a = parts.find(m => m.path.length >= need && S.parts[0].some(id => m.path.includes(id)));
    return a && parts.some(m => m !== a && m.path.length >= need && S.parts[1].some(id => m.path.includes(id)));
  });
}
function activeSplices(p) { return splicesOf(p.parts); }

// The body you'd have after taking a card.
function partsAfter(p, c) {
  c = resolveCard(p, c);
  if (c.id === '_gorge') return p.parts;
  if (c.kind === 'branch') { const m = c.part || partFor(p, c.id); return p.parts.map(x => x === m ? Object.assign({}, x, { id: c.id, path: x.path.concat([c.id]) }) : x); }
  return p.parts.filter(m => m !== c.shed).concat([{ id: c.id, path: [c.id], loc: locOf(c.id) }]);
}

// Would taking this card complete a splice you don't have yet?
function wouldSplice(p, c) {
  if (typeof c === 'string') c = { id: c };
  const now = activeSplices(p);
  return splicesOf(partsAfter(p, c)).some(k => !now.includes(k));
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
  spines: ['#d8ccb0', 0.35], chitin: ['#6a4a24', 0.5, 0.15], eggsac: ['#d8c8a0', 0.3], twitch: ['#b04030', 0.4],
  toxic: ['#9ac030', 0.4],
  // LIMBS
  spider: ['#3a2a30', 0.7, 0.4], wings: ['#7a6a8a', 0.4], grapple: ['#8a3a6a', 0.5], burrow: ['#6a5038', 0.5, 0.15],
  fins: ['#5a8aa0', 0.5], centipede: ['#7a3a1a', 0.4, 0.1],
  // CORE
  hide: ['#7a5a48', 0.35], marrow: ['#d8ccb0', 0.3], mitosis: ['#c86a9a', 0.4], starving: ['#8a7a6a', 0.4, 0.15],
  overgrown: ['#9a2030', 0.35], boneplates: ['#d8ccb0', 0.3], mirrorcyst: ['#a8c8e0', 0.35],
};

// --- Tree helpers -------------------------------------------------------------------
function getMutDef(id) { return MUTATIONS[id]; }

// Where on the body a node grows (branches inherit it from their root).
function locOf(id) {
  let d = MUTATIONS[id];
  while (d.from) d = MUTATIONS[d.from];
  return d.slot;
}

function rootOf(id) {
  while (MUTATIONS[id].from) id = MUTATIONS[id].from;
  return id;
}

function rootsOf(loc) {
  return Object.keys(MUTATIONS).filter(id => MUTATIONS[id].slot === loc && !MUTATIONS[id].part && !MUTATIONS[id].graft);
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

// Add one part's whole path to a stat sheet. Each node uses the part's growth level.
// Each level makes the part itself stronger: whatever it adds to the stat
// sheet is scaled up (damage, counts, ranges), and whatever it times is
// sped up (delays, cooldowns). Per kind: [stronger per level, faster per level].
const LEVEL_GAIN = { MOUTH: [0.10, 0.08], LIMBS: [0.06, 0.08], HEAD: [0.10, 0.10], BACK: [0.12, 0.08], CORE: [0.08, 0.08] };
// What a level-up card says: + for a small bump, ++ / +++ for a big one.
const bumpSign = g => g > 0.2 ? '+++' : g > 0.12 ? '++' : '+';
function levelText(m, L) {
  const [up, fast] = LEVEL_GAIN[m.loc] || [0.1, 0.08];
  if (m.loc === 'MOUTH') return `${bumpSign(up)}DAMAGE ${bumpSign(fast)}FIRE RATE`;
  if (m.loc === 'LIMBS') return `${bumpSign(up)}SPEED ${bumpSign(fast)}DASH ${bumpSign(fast)}ABILITY`;
  if (m.loc === 'HEAD') return `${bumpSign(up)}POWER ${bumpSign(fast)}RECHARGE`;
  if (m.loc === 'BACK') return `${bumpSign(up)}EFFECT`;
  return `${bumpSign(up)}POWER` + (Math.floor(L / 2) > Math.floor((L - 1) / 2) ? ' ++HEALTH' : ''); // CORE: +1 max health every other level
}
const LOWER_IS_BETTER = new Set(['biteDelay', 'lashDelay', 'lungeDelay', 'vomitDelay', 'dashCd', 'grapple', 'shieldCd', 'regen', 'delay', 'every', 'rate', 'glare', 'cd', 'plateRegrow']);
const NO_LEVEL_SCALE = new Set(['maxHp', 'hitCost', 'starve', 'invulnCap', 'invuln', 'hop', 'dashTime', 'accel', 'drag', 'limbCount', 'hpMul', 'lightMul', 'speedMul', 'dnaMul', 'rateMul', 'damageMul', 'speed', 'dashSpeed', 'fins', 'compound', 'power']);
const DAMAGE_FIELDS = new Set(['dmg', 'dps', 'burstDmg', 'slam', 'spit', 'mul']);

// Add one part's whole path to a stat sheet. Each node uses the part's growth level.
function applyMutation(s, m, p) {
  const l = m.path.length, raw = m.lvl || 0, L = raw <= LEVEL_MAX ? raw : LEVEL_MAX + (raw - LEVEL_MAX) * 0.5; // overgrowth: half-size steps
  if (!L) { for (const id of m.path) MUTATIONS[id].apply(s, l, p); return; }
  const before = {}, objs = {}, g0 = s.guns.length;
  for (const k in s) { if (typeof s[k] === 'number') before[k] = s[k]; else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) objs[k] = s[k]; }
  for (const id of m.path) MUTATIONS[id].apply(s, l, p);
  const [up, fast] = LEVEL_GAIN[m.loc] || [0.1, 0.08], better = 1 + up * L, quicker = 1 / (1 + fast * L);
  for (const k in s) {
    const b = s[k];
    if (typeof b === 'number') {
      const a = before[k] === undefined ? 0 : before[k];
      if (b === a || NO_LEVEL_SCALE.has(k)) continue;
      if (LOWER_IS_BETTER.has(k)) s[k] = b * quicker;
      else if (b > a) { const v = a + (b - a) * better; s[k] = Number.isInteger(a) && Number.isInteger(b) ? Math.round(v) : v; }
    } else if (b && typeof b === 'object' && !Array.isArray(b) && objs[k] !== b) { // an attack this part created
      for (const f in b) if (typeof b[f] === 'number') { if (LOWER_IS_BETTER.has(f)) b[f] *= quicker; else if (DAMAGE_FIELDS.has(f)) b[f] *= better; }
    }
  }
  for (let i = g0; i < s.guns.length; i++) { s.guns[i].dmg *= better; s.guns[i].delay *= quicker; }
  if (m.loc === 'LIMBS') { s.speed *= 1 + up * L; s.dashCd *= quicker; s.limbCdMul *= quicker; }
  if (m.loc === 'HEAD') s.headCdMul *= quicker;
  if (m.loc === 'CORE') s.maxHp += Math.floor(L / 2);
}

// --- Your parts -----------------------------------------------------------------------
// p.parts: [{ id, path, loc, starter?, lvl }]
function partsAt(p, loc) { return p.parts.filter(m => m.loc === loc); }
function partAt(p, loc) { return p.parts.find(m => m.loc === loc) || null; }
function newPart(id) { return { id, path: [id], loc: locOf(id), lvl: 0 }; }

// The part that holds a node, or the part a branch would grow from.
function partFor(p, id) {
  const d = MUTATIONS[id];
  return p.parts.find(m => m.path.includes(id)) || (d.from ? p.parts.find(m => m.id === d.from) : null) || null;
}

// Every part fills exactly one slot of its own kind.
function partSize(m) { return 1; }
function rootSize(id) { return 1; }
function slotsUsed(p) { return p.parts.length; }
function slotCapacity(p) { return Math.min(MAX_SLOTS, p.capacity); }
// The slots of each kind that are open right now (p.capacity counts along SLOT_ORDER).
function openSlots(p) { return SLOT_ORDER.slice(0, slotCapacity(p)); }
function slotsAt(p, loc) { return openSlots(p).filter(l => l === loc).length; }
function freeSlotsAt(p, loc) { return slotsAt(p, loc) - partsAt(p, loc).length; }
function freeSlots(p) { return LOCS.reduce((n, loc) => n + Math.max(0, freeSlotsAt(p, loc)), 0); }
// The kind of slot the next devoured core opens (null once the body is complete).
function nextSlot(p) { return slotCapacity(p) < MAX_SLOTS ? SLOT_ORDER[slotCapacity(p)] : null; }


// Does the player have this node anywhere?
function hasMutation(p, id) {
  return p.parts.some(m => m.path.includes(id));
}

// Is this part's path still carrying a malignant cost (no cure after it)?
function slotMalignant(m) {
  let mal = false;
  for (const id of m.path) {
    if (MUTATIONS[id].malignant) mal = true;
    if (MUTATIONS[id].cures) mal = false;
  }
  return mal;
}

// Some rarer roots only grow as a metamorphosis if the right part grows
// ELSEWHERE on the body (`requires: { any: [ids] }` or `{ set }`).
function meetsRequirement(p, id, except) {
  const req = MUTATIONS[id].requires;
  if (!req) return true;
  return p.parts.some(m => {
    if (m === except || m.starter) return false;
    if (req.any && req.any.some(x => m.path.includes(x))) return true;
    return !!(req.set && setOf(m.id) === req.set);
  });
}

// Every card the body could take right now. A card is { id, shed? }:
//   a BRANCH of a part you're growing (no new slot; locks out its sibling),
//   a new ROOT in a free slot (one head and one set of limbs at most),
//   a MOUTH root that replaces your starter Slime Blob,
//   a METAMORPHOSIS: a fully grown part sheds into a rarer root of its kind.
// A CORE root is only PLANTED from a devoured boss core (onlyLoc = 'CORE');
// once planted it branches like any other part.
function bodyOffers(p, onlyLoc, boss = false) {
  const out = [];
  const okLoc = loc => onlyLoc ? loc === onlyLoc : loc !== 'CORE'; // new roots and metamorphoses
  const starter = p.parts.find(m => m.starter);
  for (const m of p.parts) {
    if (m.starter || (onlyLoc && m.loc !== onlyLoc)) continue;
    const kids = childrenOf(m.id);
    if (kids.length) { for (const id of kids) out.push({ id, kind: 'branch', part: m }); continue; }
    if (!okLoc(m.loc)) continue;
    // Fully grown: it can shed into a rarer root.
    const rank = RARITY_ORDER.indexOf(MUTATIONS[m.path[0]].rarity);
    for (const r of rootsOf(m.loc)) {
      if (RARITY_ORDER.indexOf(MUTATIONS[r].rarity) <= rank || hasMutation(p, r) || MUTATIONS[r].boss || !meetsRequirement(p, r, m)) continue;
      out.push({ id: r, kind: 'meta', shed: m });
    }
  }
  for (const loc of LOCS) {
    if (!okLoc(loc)) continue;
    const swapStarter = starter && starter.loc === loc;
    if (!swapStarter && freeSlotsAt(p, loc) < 1) continue; // no open slot of this kind
    for (const r of rootsOf(loc)) {
      if (hasMutation(p, r) || !!MUTATIONS[r].boss !== boss) continue;
      out.push(swapStarter ? { id: r, kind: 'replace', shed: starter } : { id: r, kind: 'root' });
    }
  }
  return out;
}

// Boss picks you could plant right now.
// With no room, a boss pick takes the place of your least-grown part of
// the same kind (the card says which it sheds).
function bossPicks(p) {
  const out = bodyOffers(p, null, true).filter(c => MUTATIONS[c.id].boss && !MUTATIONS[c.id].from);
  for (const r of Object.keys(MUTATIONS)) {
    const d = MUTATIONS[r];
    if (!d.boss || d.from || hasMutation(p, r) || out.some(c => c.id === r)) continue;
    const shed = partsAt(p, d.slot).sort((a, b) => a.path.length - b.path.length)[0];
    if (shed) out.push({ id: r, kind: 'swap', shed });
  }
  return out;
}

// The trait an elite's corpse offers: in a free slot, or in place of your
// least-grown part of the same kind. [] if you have it or there's no way in.
function traitCards(p, type) {
  const id = GRAFT_OF[type];
  if (!id || hasMutation(p, id)) return [];
  if (freeSlotsAt(p, locOf(id)) >= 1) return [{ id, kind: 'root' }];
  const shed = partsAt(p, locOf(id)).sort((a, b) => a.path.length - b.path.length)[0];
  return shed ? [{ id, kind: 'swap', shed }] : [];
}

// Is this card a metamorphosis (a new root shedding a grown part)?
function isMetamorph(p, c) {
  if (typeof c === 'string') c = { id: c };
  if (c.kind) return c.kind === 'meta';
  const m = c.shed || (!MUTATIONS[c.id].from && freeSlotsAt(p, locOf(c.id)) < 1 && partAt(p, locOf(c.id)));
  return !MUTATIONS[c.id].from && !!m && !m.starter;
}

// Roll `n` cards. Usually one part shows BOTH of its next branches side by
// side, so you see exactly which path you're giving up. The rest mix growing
// what you have with planting something new: wide or deep, your call.
// `onlyLoc`: a devoured boss core offers only CORE cards.
function rollChoices(p, n, minRarity, onlyLoc, plain = false) {
  const minIdx = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const luck = r => (r === 'rare' || r === 'legendary') ? (1 + 0.2 * (game.depth - 1)) : 1;
  const weight = c => {
    const d = MUTATIONS[c.id];
    let w = RARITY[d.rarity].weight * luck(d.rarity);
    if (d.malignant) w *= 0.7;
    if (d.boss) w *= 0.03; // boss picks are rare finds (about 1 vial in 4)
    if (RARITY_ORDER.indexOf(d.rarity) < minIdx) w *= 0.02; // a vial strongly prefers rare samples
    return w;
  };
  const pickWeighted = cs => {
    let total = 0;
    for (const c of cs) total += weight(c);
    let r = Math.random() * total;
    for (const c of cs) if ((r -= weight(c)) <= 0) return c;
    return cs[cs.length - 1];
  };
  const card = c => { const o = { id: c.id, kind: c.kind }; if (c.shed) o.shed = c.shed; return o; };
  const gorge = { id: '_gorge' };
  const all = bodyOffers(p, onlyLoc);

  if (onlyLoc && onlyLoc !== 'CORE') {
    // A colored vial: only that kind of part. Usually a fork, never two
    // metamorphoses. If nothing of that kind can grow, it's a mixed roll instead.
    // The strangest roots (BOSS PICKS) turn up here too, rarely (never in the first room's vial).
    const cs = all.concat(plain ? [] : bossPicks(p).filter(c => locOf(c.id) === onlyLoc)), out = [];
    if (!cs.length) return rollChoices(p, n, minRarity);
    const take = c => { if (!out.some(o => o.id === c.id)) out.push(card(c)); };
    const byPart = new Map();
    for (const c of cs) if (c.kind === 'branch') { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
    const forks = [...byPart.values()].filter(g => g.length === 2);
    if (forks.length && Math.random() < 0.7) forks[Math.floor(Math.random() * forks.length)].forEach(take);
    let metas = out.filter(c => c.kind === 'meta').length, finds = 0;
    while (out.length < n) {
      const left = cs.filter(c => !out.some(o => o.id === c.id) && (c.kind !== 'meta' || !metas) && !(MUTATIONS[c.id].boss && finds));
      if (!left.length) break;
      const c = pickWeighted(left); if (c.kind === 'meta') metas++; if (MUTATIONS[c.id].boss) finds++; // at most one rare find per vial
      take(c);
    }
    // The first vials (the first room's mouth, floor 1's limbs) sometimes hold a WILD CARD: a rare find.
    if (plain && out.length && Math.random() < WILD_CHANCE) {
      const wild = bossPicks(p).filter(c => locOf(c.id) === onlyLoc).concat(Object.keys(GRAFT_OF).map(t => GRAFT_OF[t]).filter(id => locOf(id) === onlyLoc && !hasMutation(p, id) && freeSlotsAt(p, onlyLoc) >= 1).map(id => ({ id, kind: 'root' })));
      if (wild.length) { const w = pick(wild); out[Math.floor(Math.random() * out.length)] = card(w); out.wild = true; }
    }
    if (!out.length || out.every(c => c.kind === 'meta')) out.push(gorge);
    return out.sort(() => Math.random() - 0.5);
  }
  if (onlyLoc) {
    // A devoured core: CORE parts only (the core already gave you +1 max health).
    const cs = all.slice(), out = [];
    let metas = 0;
    while (out.length < n && cs.length) {
      const c = cs.splice(cs.indexOf(pickWeighted(cs)), 1)[0];
      if (c.kind === 'meta' && metas++) continue;
      out.push(card(c));
    }
    if (!out.length || out.every(c => c.kind === 'meta')) out.push(gorge); // you can always decline
    return out.sort(() => Math.random() - 0.5);
  }

  const out = [];
  const take = c => { if (!out.some(o => o.id === c.id)) out.push(card(c)); };
  // Still spitting the starter slime? Always offer a way out of it.
  const replace = all.filter(c => c.kind === 'replace');
  if (replace.length) take(pickWeighted(replace));
  // No mouth yet (you skipped the first room's vial)? Always offer one.
  const mouths = !partAt(p, 'MOUTH') && all.filter(c => c.kind === 'root' && locOf(c.id) === 'MOUTH');
  if (mouths && mouths.length) take(pickWeighted(mouths));
  // Still a limbless slug? Always offer a way to move.
  const legs = !partAt(p, 'LIMBS') && all.filter(c => c.kind === 'root' && locOf(c.id) === 'LIMBS');
  if (legs && legs.length) take(pickWeighted(legs));
  // Groups: each part's branches, one per body location for new roots, and metamorphoses.
  const groups = [];
  const byPart = new Map();
  for (const c of all) if (c.kind === 'branch') { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
  const forks = [...byPart.values()].filter(g => g.length === 2);
  if (forks.length && n - out.length >= 2 && Math.random() < 0.7) {
    const f = forks[Math.floor(Math.random() * forks.length)];
    f.forEach(take);
    byPart.delete(f[0].part);
  }
  for (const g of byPart.values()) groups.push({ cards: g });
  for (const loc of LOCS) { const g = all.filter(c => c.kind === 'root' && locOf(c.id) === loc); if (g.length) groups.push({ cards: g }); }
  const metas = all.filter(c => c.kind === 'meta');
  // Tempting, never the whole offer: only sometimes, unless there's nothing else to grow.
  const nothingElse = !out.length && !groups.length;
  if (metas.length && (nothingElse || Math.random() < 0.5)) groups.push({ cards: metas });
  groups.sort(() => Math.random() - 0.5);
  for (const g of groups) { if (out.length >= n) break; take(pickWeighted(g.cards)); }
  // Still short? Take more from what's on offer (never a second metamorphosis).
  const left = all.filter(c => c.kind !== 'meta' && !out.some(o => o.id === c.id));
  while (out.length < n && left.length) take(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  if (!out.length || out.every(c => c.kind === 'meta')) out.push(gorge); // you can always decline
  return out.sort(() => Math.random() - 0.5);
}

// A part that replaces another (metamorphosis, boss pick, devoured trait) keeps
// its growth: it starts one level above the part it sheds, short of evolving.
function inheritedLevel(old) { return Math.min(LEVEL_MAX - 1, (old.lvl || 0) + 1); }

// Fill in what a hand-made card ({ id } only) would do.
function resolveCard(p, c) {
  if (c.kind || c.id === '_gorge') return c;
  const d = MUTATIONS[c.id], loc = locOf(c.id);
  if (d.from) return { id: c.id, kind: 'branch', part: partFor(p, c.id) };
  const starter = p.parts.find(m => m.starter && m.loc === loc);
  if (starter) return { id: c.id, kind: 'replace', shed: starter };
  const held = freeSlotsAt(p, loc) < 1 && partAt(p, loc);
  if (held) return { id: c.id, kind: 'meta', shed: held };
  return { id: c.id, kind: 'root' };
}

// Everything a card needs to show (never what it does: you learn by growing it).
function choiceInfo(p, c) {
  if (c.kind === 'level') {
    const m = c.part, d = MUTATIONS[m.id], L = (m.lvl || 0) + 1, evolves = L >= LEVEL_MAX && childrenOf(m.id).length > 0;
    return { id: m.id, name: d.name, rarity: d.rarity, desc: d.desc, malignant: !!d.malignant && slotMalignant(m), set: null, slot: m.loc, kind: 'level',
      status: evolves ? 'EVOLVES!' : L > LEVEL_MAX ? 'OVERGROWTH ' + (L - LEVEL_MAX) : 'LEVEL ' + L, note: levelText(m, L), noteColor: evolves ? VIAL_COLOR : PAL.slate, overlays: [], stirs: false, tier: 0, level: Math.min(L, LEVEL_MAX), size: 1 };
  }
  if (c.id === '_gorge') {
    const free = freeSlots(p);
    return { name: 'Gorge', rarity: 'common', desc: 'Grow nothing. Heal a heart.', status: 'HEAL 1 HEART', note: free > 0 ? 'KEEPS THE SLOT FREE' : null, noteColor: VIAL_COLOR, overlays: [], slot: '' };
  }
  c = resolveCard(p, c);
  const d = MUTATIONS[c.id], loc = locOf(c.id);
  const m = c.kind === 'branch' ? (c.part || partFor(p, c.id)) : c.shed;
  let status, note = null, noteColor = PAL.slate;
  if (c.kind === 'branch') { // what it is now -> what it becomes (the card art shows both)
    status = null;
    note = (m ? MUTATIONS[m.id].name + ' -> ' : '') + d.name; noteColor = PAL.white;
  } else if (c.kind === 'replace') {
    status = d.boss ? 'BOSS PICK' : 'TAKES ROOT'; note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = COST_COLOR;
  } else if (c.kind === 'swap') {
    status = d.graft ? 'DEVOURED TRAIT' : 'BOSS PICK'; note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = COST_COLOR;
    if (!m.starter) status += ' LV ' + inheritedLevel(m);
  } else if (c.kind === 'meta') {
    status = 'METAMORPHOSIS LV ' + inheritedLevel(m);
    if (d.requires) { note = 'FED BY ' + d.requires.label; noteColor = VIAL_COLOR; }
    else note = 'SHEDS ' + MUTATIONS[m.id].name;
  } else {
    status = d.boss ? 'BOSS PICK' : d.graft ? 'DEVOURED TRAIT' : 'NEW PART';
    note = `TAKES A ${LOC_NAME[loc]} SLOT`;
  }
  // What the set count would be after taking it.
  const counts = setCounts(p), set = setOf(c.id);
  const was = m && !m.starter && setOf(m.id);
  if (was) counts[was]--;
  const after = set ? (counts[set] || 0) + 1 : 0;
  return {
    id: c.id, name: d.name, rarity: d.rarity, desc: d.desc, cost: d.cost, malignant: !!d.malignant, cures: !!d.cures, set,
    slot: loc, kind: c.kind, status, note, noteColor, setAfter: after, size: rootSize(c.id),
    tier: c.kind === 'branch' && m ? m.path.length : 0, overlays: mutOverlays(c.id), stirs: wouldSplice(p, c), from: c.kind === 'branch' && m ? m.id : null,
    noteLines: c.kind === 'branch' && m ? [MUTATIONS[m.id].name + ' ->', d.name] : null,
  };
}

// --- The Ultimate Metamorphosis ------------------------------------------------------
// Five fully grown parts: your next cocoon is the last one. You become your
// final form: +25% damage, +2 max health, a little faster, a passive for every
// set your parts belong to (stronger the more parts share it), and your parts
// can keep leveling past the max (OVERGROWTH) for the rest of the run.
const fullyGrown = m => !m.starter && !childrenOf(m.id).length;
function apexReady(p) {
  return !p.apex && LOCS.every(loc => partsAt(p, loc).length >= LOC_MAX[loc]) && p.parts.every(fullyGrown);
}
function checkApex(p) {
  if (!apexReady(p) || game.pendingEvolutions.some(e => e.apex)) return;
  game.pendingEvolutions.push({ apex: true, title: 'ULTIMATE METAMORPHOSIS' });
  whisper('Every part of you is finished. One last change is coming.');
}
// What each set gives a final form, given how many of your parts belong to it.
const APEX_PASSIVES = {
  HIVE: 'A SWARM HATCHES AROUND YOU', BONE: 'BONE SHARDS BURST FROM YOU', FUNGAL: 'YOU TRAIL TOXIC SPORES',
  PREDATOR: 'KILLS FEED YOU AND SPEED YOU UP', ABOMINATION: 'TENDRILS LASH OUT ON THEIR OWN',
};
function apexPassives(p) { return setCounts(p); }
function becomeApex(p) {
  p.apex = true;
  recomputeStats(p);
  p.hp = p.maxHp;
  const sets = Object.keys(apexPassives(p));
  game.banner = { text: 'ULTIMATE METAMORPHOSIS', sub: sets.map(k => APEX_PASSIVES[k]).slice(0, 2).join(' - ') || 'YOU ARE FINISHED', color: '#ffd070', t: 4 };
  whisper('There is nothing left of the specimen. There is only you.');
  bloodSpray(p.x, p.y, 0, 0, 40, FLUID.blood, 160);
  gibs(p.x, p.y, 12, ['#c8b4a0', '#a8907e', '#5e2229', '#ffd070'], FLUID.blood);
  burst(p.x, p.y, '#ffd070', 40, 150, 1);
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 70, t: 0.6 });
  game.shake = Math.max(game.shake, 8);
  Sfx.play('splice'); Sfx.play('secondHeart');
}

// --- Level-ups --------------------------------------------------------------------
// A biomass level-up: mostly "+1 level" for your parts, plus a new part when
// you have room (always a mouth / limbs while you have none), and a
// metamorphosis now and then for a fully grown part at max level.
function rollLevelUps(p, n) {
  const weight = c => RARITY[MUTATIONS[c.id].rarity].weight * (MUTATIONS[c.id].malignant ? 0.7 : 1);
  const pickW = cs => { let t = 0; for (const c of cs) t += weight(c); let r = Math.random() * t; for (const c of cs) if ((r -= weight(c)) <= 0) return c; return cs[cs.length - 1]; };
  const all = bodyOffers(p), roots = all.filter(c => c.kind === 'root'), out = [];
  const takeRoot = loc => { const rs = roots.filter(c => (!loc || locOf(c.id) === loc) && !out.some(o => o.id === c.id)); if (rs.length) out.push({ id: pickW(rs).id, kind: 'root' }); };
  if (!partAt(p, 'MOUTH')) takeRoot('MOUTH');
  if (!partAt(p, 'LIMBS') && out.length < n) takeRoot('LIMBS');
  const levels = p.parts.filter(m => !m.starter && ((m.lvl || 0) < LEVEL_MAX || (p.apex && fullyGrown(m)))).sort(() => Math.random() - 0.5).map(m => ({ id: m.id, kind: 'level', part: m }));
  if (!out.length && roots.length) takeRoot(); // room for one more part: one card offers it
  for (const c of levels) { if (out.length >= n) break; out.push(c); }
  while (out.length < n && roots.length > out.filter(c => c.kind === 'root').length) { const k = out.length; takeRoot(); if (out.length === k) break; }
  const metas = all.filter(c => c.kind === 'meta');
  if (out.length < n && metas.length) { const c = metas[Math.floor(Math.random() * metas.length)]; out.push({ id: c.id, kind: 'meta', shed: c.shed }); }
  if (!out.length) out.push({ id: '_gorge' });
  return out.sort(() => Math.random() - 0.5);
}

// --- Applying a choice ------------------------------------------------------------
function applyChoice(p, c) {
  if (c.id === '_gorge') { p.hp = Math.min(p.maxHp, p.hp + HP_PER_HEART); return; }
  if (c.kind === 'level') { // a part grows a level; at the max, it evolves
    const m = c.part, d = MUTATIONS[m.id];
    m.lvl = (m.lvl || 0) + 1;
    floatText(p.x, p.y - 14, d.name.toUpperCase() + ' LV ' + m.lvl, VIAL_COLOR);
    if (m.lvl >= LEVEL_MAX && childrenOf(m.id).length) {
      m.lvl = 0;
      game.pendingEvolutions.unshift({ evolve: m, title: 'EVOLUTION', color: d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color });
      floatText(p.x, p.y - 22, 'IT IS READY TO CHANGE', PAL.red);
    }
    burst(p.x, p.y, VIAL_COLOR, 10, 60, 0.4);
    Sfx.play('absorb');
    recomputeStats(p);
    checkApex(p);
    return;
  }
  c = resolveCard(p, c);
  p.evolutions++;
  const d = MUTATIONS[c.id];
  if (c.kind === 'branch') {
    const m = c.part || partFor(p, c.id);
    m.path.push(c.id);
    m.id = c.id;
    m.lvl = 0; // evolving starts its levels over
  } else {
    const old = c.shed, part = newPart(c.id), at = old ? p.parts.indexOf(old) : -1;
    if (old && !old.starter) part.lvl = inheritedLevel(old); // a replacement keeps the old part's growth, +1
    if (old) bloodSpray(p.x, p.y, 0, 0, 14, FLUID.blood, 90); // the old part tears out
    if (old && !old.starter) { // Metamorphosis: the grown path sloughs off; something rarer takes root
      game.banner = { text: c.kind === 'swap' ? 'BOSS PICK' : 'METAMORPHOSIS', sub: MUTATIONS[old.id].name + ' > ' + d.name, color: RARITY[d.rarity].color, t: 2.6 };
      gibs(p.x, p.y, 6, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
      game.shake = Math.max(game.shake, 4);
    }
    if (at >= 0) p.parts.splice(at, 1, part); else p.parts.push(part);
  }
  whisper(HINTS[c.id]);
  p.lastSet = setOf(c.id);
  if (d.onGain) d.onGain(p);
  const col = d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
  floatText(p.x, p.y - 14, d.name.toUpperCase(), col);
  if (d.from && !childrenOf(c.id).length) {
    // A path reaches its end form.
    game.banner = { text: 'FULLY GROWN', sub: d.name + ' - YOU GROW STRONGER', color: col, t: 2.2 };
    burst(p.x, p.y, col, 24, 110, 0.7);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('splice');
  } else {
    Sfx.play('absorb');
  }
  recomputeStats(p);
  checkApex(p);
}

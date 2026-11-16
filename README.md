# Specimen 47

A pixel-art horror twin-stick roguelike. You're an escaped lab specimen: kill what hunts you, devour the corpses for biomass, and evolve into something worse.

## Play

Open `index.html` in a browser. There's no build step and nothing to install.

| Key | Action |
|---|---|
| WASD | Move |
| Mouse or arrow keys | Aim and shoot |
| Space / Shift | Dash (brief invulnerability; becomes a charge with some mutations) |
| Right click / E | Limb ability (every LIMBS root has one; Tentacles grapple, Grasping Hands grab and throw) |
| Q | Head ability (every HEAD root has one) |
| Esc on the cards / hold F | Put an evolution off, then evolve later in any cleared room |
| M / P | Mute / pause |
| J (title screen or paused) | Splice journal: every splice you've found, and hints for the rest (kept between runs) |

## How it works

- **Culture Blobs** divide once; the copy can't divide and carries no biomass.
- **Burst corpses.** Some kills leave a usable corpse (it glints pink). Walk into it to devour it (the biomass goes straight into you), or attack it from range until it bursts and collect the glowing globules of biomass that spill out. Spawnlings and drones never leave one, and rats often don't.
- **Visceral.** Harder hits spurt more blood and tear chunks off enemies that fly, trail blood and splat against the walls; overkill bursts bodies apart; badly wounded enemies drip as they move. The stronger you get, the messier it gets.
- **You're fragile.** You start with 3 HP.
- **Evolve.** Biomass builds up while you fight. Once the room is clear, a full bar wraps you in a cocoon by itself; it splits and you choose 1 of 3 (a level for a part, or a new part). Never mid-fight. (Esc on the cards puts it off; hold F in any cleared room to evolve later.) Cards don't say what a mutation does; you learn by growing it.
- **Open slots.** Your body has a few slots (shown along the bottom of the screen). You start with 3, all empty: you're born with no attack at all. Every devoured boss core adds a slot, and every splice frees one (two parts fuse into one), but never more than 5: a finished body is five parts, each one earned. Fill them however you like: several mouths for a glass cannon, or backs and cores for a tank. Each part still grows somewhere on the body:
  - **MOUTH: an attack.** The first room always holds a red MOUTH vial: your first evolution is choosing your first weapon. Grow more mouths and they all fire.
  - **LIMBS: how you move, plus a right-click ability.** One set at a time. You start limbless, as a slow, inching slug, and until you grow limbs every evolution offers some. Spider Legs skitter and spit webs, Wings fly (over crates and enemy acid) and beat a gust that blows enemies and their shots away, Tentacles grapple, Burrowing Claws dig and send out a stunning tremor, Pseudopods glide on slime and roll out a slime wave, Root Legs take root and burst roots up to hold enemies.
  - **HEAD: senses, plus a Q ability.** One head. Extra Eyes mark prey (it takes more damage from everything), Battering Skull headbutts, Night Eyes black out your light (everything counts as in the dark), Parasite Brain mind-spikes one enemy, Bloom bursts pollen over everything near you.
  - **BACK: what happens when you dash or get hurt.** As many as you have room for.
  - **CORE: your engine.** Only grows from devoured boss cores.
  - **Big parts** (Tentacles, Parasite Brain, Heartwood) take 2 slots; the card says so.
- **Branching paths.** Each part grows one path, so no two runs end the same:
  - A free slot is offered new **roots**, one per kind of part you don't have yet.
  - A planted part **branches**: two ways to go, and taking one locks out the other. Usually both show up side by side, and the card says what you'd give up.
  - **Biomass levels your parts; it doesn't evolve them.** A biomass level-up offers "+1 level" for your parts (a small stat bump, shown on the card as "+DAMAGE +FIRE RATE", "+SPEED +DASH" and so on; ++ or +++ means a bigger jump), plus a new part when you have room. At level 3 a part evolves: you choose its branch, and its level starts over. Vials and boss cores still evolve directly. The pink dots on each panel are its level.
  - Root, then branch, then branch: four end forms per root. Branches mostly add interactions, not bigger numbers (Bone Spike > Bone Shotgun > Bone Jaws: every bite drives a spike out the back of the victim).
- **Sets.** Every mutation belongs to a set: Bone, Fungal, Hive, Predator, Abomination or Plant (shown on the card). Each part counts as the set of its current form, so a branch can switch it. 3 matching parts wake a set bonus; 5 wake a stronger one (Fungal: kills burst into spore clouds; Hive: kills hatch spiderlings...).
- **Body forms.** Once two of your parts share a set, your whole body reshapes into that set's creature: a skeletal Bone crawler, a mushroom-sprouting Fungal mass, a Hive insect, a hunched Predator beast, or a lopsided Abomination. Mutation parts still grow on top.
- **Cores.** CORE parts are only planted from devoured boss cores. Each floor's boss (or, on floors without one yet, the exit room's Warden) drops its still-beating core: eat it and you always gain +1 max health (and a slot, up to 5); then choose a CORE part. Once planted, a CORE part grows from level-ups like any other part. New defensive CORE parts: **Bone Plates** (plates orbit you, block shots and burst into shrapnel when they break; they regrow every room) and **Mirror Cyst** (a membrane in front of you throws enemy shots back, harder).
- **Armor hearts.** Every 30 kills grow a grey armor heart (up to 2). It takes a hit for you and doesn't come back.
- **The Ultimate Metamorphosis.** Fill all five slots with fully grown parts and your next cocoon is the last: a huge chrysalis that splits into your final form. It's bigger and glows, gets +25% damage, +2 max health and a little speed, and a passive for every set among your parts (stronger the more parts share it): HIVE hatches a swarm around you, BONE bursts shards from you, FUNGAL trails toxic spores, PREDATOR kills feed you and speed you up, PLANT sprouts polyps around you, ABOMINATION lashes out with tendrils on its own. From then on your parts keep leveling past the max (OVERGROWTH, smaller bumps), so level-ups never run dry.
- **You are what you eat.** An elite's corpse holds something worth taking: devour it (or burst it) and you're offered that creature's trait, a part you can't get any other way. Lab Rat: Rat Incisors (bleeding bites). Bone Urchin: Urchin Quills (spine rings in fights). Bloat Toad: Toad Gullet (lobbed bile). Failed Specimen: Splitter Cells (pieces of you split off when hurt). Culture Blob: Culture Jelly (your dash ends in a holding jelly). Traits are complete as they are, level like any part, and splice: Toad Gullet + Frog Tongue, Urchin Quills + Bone Spurs.
- **Rare finds.** The strangest roots (the playstyle mouths, Tentacles and Parasite Brain) never come from level-ups: they turn up, rarely, in colored vials of their kind. On a full body, one takes the place of your least-grown part of the same kind (the card says which). Together with big splices, they're where the late-game power fantasy comes from.
- **Mandibles** bite hard and fast up close: a bite lunges you onto prey just out of reach (untouchable for the instant of the snap), and whatever you bite reels for a moment, unable to move, shoot or hurt you.
- **Playstyle mouths** (boss picks). Some MOUTH roots don't shoot at all: Ovipositor (larvae that infest hosts and burst out), Miasma (a toxic aura; hold fire to vent it), Howl (no damage, but it hurls enemies into walls and each other), Polyp Seeder (plant turret polyps), Frog Tongue (hold fire to coil it, release to lash: small prey is swallowed whole; tap to spit it back) and Silk Spinner (lay sticky, cutting webs).
- **The Plant path.** Polyp Seeder (MOUTH), Bloom (HEAD: a pollen-puffing flower), Thornbark (BACK), Root Legs (LIMBS: stand still to take root) and Heartwood (CORE). Its body form is bark, leaves and a flower for a head.
- **Power is earned.** A fresh body hits at 70% strength. Every fully grown part and every splice adds +6%, so a finished body ends up far stronger than it started.
- **Splices.** Certain pairs of parts fuse when you grow both (Spore Fire + Crop Duster = Firestorm: your flying spore trail burns). The two become one part, which frees a slot. **Big splices** need both halves fully grown, and they change how you fight: Dive Bomb (Mandibles + Wings: your dash lands in a swooping bite), Bone Cannon (Bone Spike + Battering Skull: your headbutt fires a bone lance), Venom Barrage (two mouths: Bone Spike + Bile Spit), Brood Howl, Silk Nursery, Seismic Howl, Toxic Bloom, Blood Gulp, Bile Garden, Battering Ram. They're never named in advance; a card that would complete one just says SOMETHING STIRS.
- **Rarity.** Mutations are Common, Uncommon, Rare or Legendary. Rare ones get likelier on deeper floors.
- **Malignant mutations** (purple cards) are extra strong with a hidden cost. Most have a branch that cures them, and a sibling branch that doubles down.
- **Colored vials** (dropped by elites and found in vaults) give a free evolution of one kind of part: red MOUTH, blue LIMBS, yellow HEAD, bone-white BACK (Uncommon or better). A vault's color shows on the minimap and glints through its seal; floor 1's vault holds LIMBS. If nothing of that kind can grow, you get a mixed roll instead.
- **Parasite Brain** sometimes takes control of your body, but it needs you alive: it steers clear of enemies, bosses and enemy acid, and at 1 health it won't take over.
- **Bodies look and feel different.** Wings fly higher the faster you go and glide with wings spread; hops squash and stretch and land with a thump; tentacles grip the floor and step like the spider legs; pseudopods reach ahead and flow after; every limb has its own footprints and sounds. Body forms have their own ambience (a predator's eye-shine in the dark, glowing fungal spots, hive flies, bone dust, falling leaves, blinking extra eyes), a full set glows, and splices leave a stitched seam.
- Clear the farthest room on each floor to open the hatch down. Its door is a toothed, red-glowing maw marked BOSS (or WARDEN); the first time, walking into it stops you at the threshold, and you keep walking to go in.

## Where to tweak things

| File | What's in it |
|---|---|
| `src/mutations.js` | The mutation tree (roots and branches per body location), open slots, whispers, rarities and card rolling. Start here. |
| `src/abilities.js` | Mechanics behind the fancier mutations: allies, spore clouds, decoys, slime, burrowing, grabbing, and the right-click / Q abilities (ACTIVES) |
| `src/dna.js` | Corpses, bursting, biomass amounts and the level curve (biomass is called `dna` in the code) |
| `src/floors.js` | Each floor's name, enemy mix, hazard and boss |
| `src/bosses.js` | Bosses, telegraphed attacks, floor-specific enemy behaviors, elite affixes |
| `src/enemies.js` | Enemy stats, behaviors and biomass value |
| `src/player.js` | Movement, shooting, dash/charge, bite, tentacles, shield |
| `src/music.js` | Procedural music: chords, tempo, combat layer |
| `src/sprites.js` | All sprites, painted from shaded shapes (blobs, tubes, eyes). Tweak the numbers to reshape a creature. |
| `src/paint.js` | The pixel painter: shading, outlines, and the color ramps (`RAMPS`) |
| `src/world.js` | Room obstacle layouts, floor generation, old bloodstains |
| `src/gore.js` | Blood spray, gibs, floor stains, corpses |
| `src/lighting.js` | Darkness, dithered lights, flickering, low-HP pulse |
| `src/ui.js` | HUD, evolution cards, title and game-over screens |

## Testing

`tests/test.html` loads the real game and forces through scenarios (the tree, every end form, boss phase and affix, plus full bot runs to floor 5), printing `OK` / `FAIL` lines. Run it after changes:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

It uses headless Microsoft Edge, takes a minute or two, and exits with code 1 if anything fails. You can also just open `tests/test.html` in a browser and read the page.

## Version control

The project is a git repository. Commit after each working change (`git add -A`, then `git commit -m "what changed"`), so any mistake can be undone with `git restore <file>` or by checking out an earlier commit.

## Sharing

- **itch.io**: zip the folder, create a new project with kind "HTML", upload the zip, and tick "This file will be played in the browser".
- **GitHub Pages**: push the folder to a repo and enable Pages.

# License
MIT License

# AI Notice
Developed with the assistance of Claude
# Specimen 47

A pixel-art horror twin-stick roguelike. You're an escaped lab specimen: kill what hunts you, devour the corpses for DNA, and evolve into something worse.

## Play

Open `index.html` in a browser. There's no build step and nothing to install.

| Key | Action |
|---|---|
| WASD | Move |
| Mouse or arrow keys | Aim and shoot |
| Space / Shift | Dash (brief invulnerability; becomes a charge with some mutations) |
| Right click / E | Limb ability (Tentacles: grapple; Grasping Hands: grab, then throw) |
| Hold F | Cocoon and evolve (when the DNA bar is full, or you've picked up a mutagen vial) |
| M / P | Mute / pause |

## How it works

- **Burst corpses.** Some kills leave a usable corpse (it glints pink). Attack it until it bursts, then collect the DNA globules that spill out. Spawnlings and drones never leave one, and rats often don't.
- **You're fragile.** You start with 3 HP.
- **Evolve.** When the DNA bar is full, hold F to wrap yourself in a cocoon. It takes 2 seconds and you can't move or attack inside it; letting go or getting hit tears it. When it splits you choose 1 of 3 mutations. Cards don't say what a mutation does; you learn by growing it.
- **Body slots.** Every mutation grows in one of five slots: MOUTH, HEAD, BACK, LIMBS or CORE.
  - **LIMBS is how you move.** You start limbless, as a slow, inching slug. Spider Legs skitter, Wings fly (floaty, and over obstacles), Tentacles grapple, Burrowing Claws dig and Pseudopods glide on slime.
  - **MOUTH is your attack.** You start spitting weak little slime blobs; your first MOUTH pick (Bone Spike, Bile Spit, Mandibles, Tendrils, Proboscis) replaces it.
- **Branching paths.** Each slot grows one path per run, so no two runs end the same:
  - An empty slot is offered **roots**. Planting one locks that slot's other roots for the rest of the run.
  - A planted slot **branches**: two ways to go, and taking one locks out the other. Usually both show up side by side, and the card says what you'd give up.
  - Root, then branch, then branch: four end forms per root. Branches mostly add interactions, not bigger numbers (Bone Spike > Bone Shotgun > Bone Jaws: every bite drives a spike out the back of the victim).
- **Sets.** Every mutation belongs to a set: Bone, Fungal, Hive, Predator or Abomination (shown on the card). Each slot counts as the set of its current form, so a branch can switch it. 3 matching slots wake a set bonus; all 5 wake a stronger one (Fungal: kills burst into spore clouds; Hive: kills hatch spiderlings...).
- **Body forms.** Once two of your slots share a set, your whole body reshapes into that set's creature: a skeletal Bone crawler, a mushroom-sprouting Fungal mass, a Hive insect, a hunched Predator beast, or a lopsided Abomination. Mutation parts still grow on top.
- **Cores.** Your CORE slot never shows up in normal evolutions. Each floor's boss (or, on floors without one yet, the exit room's Warden) drops its still-beating core: eat it to evolve your CORE. The first one always offers Thick Hide.
- **Splices.** Certain parts in different slots fuse when you grow both (Spore Fire + Crop Duster = Firestorm: your flying spore trail burns). They're never named in advance; a card that would complete one just says SOMETHING STIRS.
- **Rarity.** Mutations are Common, Uncommon, Rare or Legendary. Rare ones get likelier on deeper floors.
- **Malignant mutations** (purple cards) are extra strong with a hidden cost. Most have a branch that cures them, and a sibling branch that doubles down.
- **Mutagen vials** (dropped by elites and found in vaults) give a free evolution with Uncommon-or-better cards.
- Clear the farthest room on each floor to open the hatch down.

## Where to tweak things

| File | What's in it |
|---|---|
| `src/mutations.js` | The mutation tree (roots and branches per slot), whispers, rarities and card rolling. Start here. |
| `src/abilities.js` | Mechanics behind the fancier mutations: allies, spore clouds, decoys, slime, burrowing, grabbing |
| `src/dna.js` | Corpses, bursting, DNA amounts and the level curve |
| `src/floors.js` | Each floor's name, enemy mix, hazard and boss |
| `src/bosses.js` | Bosses, telegraphed attacks, floor-specific enemy behaviors, elite affixes |
| `src/enemies.js` | Enemy stats, behaviors and DNA value |
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

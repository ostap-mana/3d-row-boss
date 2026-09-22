# KOLTMOS, beat by beat

Every effect the boss owns is light thrown on black, packed as a square additive
flipbook and drawn by `vfx.bossSwing`. That was not always true: the claw used to
be ink on a white page with its own matte, and the rest came from a video model.
Both doors are shut now — the beats are painted off the build's own FX masks, and
the section below says how. The prompt sheets further down are kept for the two
things they still explain: what each beat has to read as, and what a generated
take has to look like to be usable at all.

## Three attacks, September 22 — up, across, out of the floor

The set was cut to three, and every one of them now has a different vector on
screen. CLAW RAKE, LAVA BREATH and ERUPTION are gone: their plates were flat
violet silhouettes off the build's masks, and over twenty-five saturated gem
circles a flat silhouette on the add blend is a colour wash, not a hit.

| beat | what the player sees | how it is drawn |
| --- | --- | --- |
| MAGMA SLAM | one bright column up through the board, single target | `magma-sheet.webp`, the painted fist page, `bossPlate("smash")` |
| OBSIDIAN VOLLEY | hard dark rock crossing the screen into the card row, all targets | `shard-sheet.webp` through `vfx.shardVolley`, **not a plate** |
| HE TEARS THE HILL LOOSE | one burning boulder thrown into the board, all targets, turn 3 on | `boulder-sheet.webp` through `vfx.boulder`, **not a plate**; it lands on `fissure-sheet.webp` |
| KOLTMOS CALLS A RIDER | a beast out of the game's own art lunges onto the board and strikes, focused, turn 4 on | `rider-slash.mp4`, an alpha clip through `src/art/rider.js` |
| CATACLYSM | `T_FX_Glow_Flash_11_2_4x4` | `doom-sheet.webp` |
| ENRAGE ROAR | `T_FX_Smoke_11_1_4x4` | `roar-sheet.webp` |
| MAGMA SLAM, fallback | `T_FX_Fire_9_1_2x6`, by `pack-slam.mjs` | `slam-sheet.webp` |

Three things about this set are load-bearing and were all measured, not assumed.

**`vfx` draws ABOVE the gems.** `world.addChild(bg, lavaMask, bossLayer, board,
heroRow, vfx, hud, ...)` in `src/main.js` — the vfx field is index 5, the board
is 3 and the card row is 4. Everything earlier in this file that says the plate
sits under the gems is false. It matters because it inverts the whole recipe: on
the add blend black is nothing, so a silhouette can only ever brighten the grid,
which is the wash. On the **normal** blend with a real alpha cut, a dark body
*occludes* the gems, and the eye finds a hole in a bright grid faster than it
finds a glow. Both new beats are `blend: "normal"`, and so is the slam.

**Two of the three are not plates at all.** A square flipbook cannot start at the
boss and end somewhere else, so both thrown beats fly real sprites off
`src/art/shards.js`.

`vfx.shardVolley(from, targets, opts)` sends one shard per target. `VOLLEY.fan`
launches each from a point already pushed toward its own target and `VOLLEY.bow`
bends its path, so no two share a lane — without those two the eight of them go
down the screen centre in one stripe and read as a single grey smear.

`vfx.boulder(from, to, opts)` is the heavy one: wind-up, throw, impact. It is
built on one idea, which is **depth**. The rock leaves the boss at `BOULDER.from`
= 0.15 of its final size and arrives at 1.0, so a near sevenfold scale change
over 0.42 s is what sells a thing coming at the camera; the first version started
at 0.3 and travelled 360 px, which is barely more than its own width, and it read
as a rock sliding down the screen rather than being thrown. `BOULDER.launch`
bends the position curve — a full `quadIn` parks it at the boss for half the
flight. It flies wrapped in the `flame` sheet (`BOULDER.shroud`) because a dark
body against a bright sky with no fire on it is a hole, not a projectile. It
lands on a white flash, a flat shock ring, chips, seven tumbling debris shards,
`shake(26, 0.6)` and the fissure plate at the impact point — so the ground does
split, but as the *consequence* of the throw rather than as its own attack.

**Board-relative, still.** Every size is a fraction of `board.size`, never the
stage, for the reason the old note gives.

### The sheets these attacks ship as

```
node tools/pack-shards.mjs --cell 192 --count 8 --seams 0.7 --seam-scale 4   --out src/assets/boss/shard-sheet.webp

node tools/pack-shards.mjs --cell 320 --count 4 --seams 0.9 --seam-scale 5   --out src/assets/boss/boulder-sheet.webp

node tools/paint-beat.mjs --crack 10 --out masters/fx/painted/fissure-page.png   --cols 5 --cell 320 --gutter 44 --ramp magma --rim 7 --crust 0.09 --seam 0.5   --seam-scale 5 --flow 1.2 --embers 26 --shards 7 --shard-size 7 --smoke 0.4   --ground 0.5 --cool 1,0.55 --gain 1,0.85 --seed 11

node tools/pack-painted-beat.mjs --src masters/fx/painted/fissure-page.png   --out src/assets/fx/fissure-sheet.webp --frames 10 --take 1,2,3,4,5,6,7,8,9,10   --cell 320 --align cell --gain 1.1 --alpha 70 --contact
```

Both rock sheets stay under `src/assets/boss/`. Move either into
`src/assets/fx/` and `src/art/spells.js` globs `*-sheet.webp` and slices a
4-column sheet as a 5-column flipbook into garbage.

`--seams` is what makes the rock Koltmos's. `masters/boss/shards/` is painted
obsidian with white chipped edges — over a dark board that reads as ice, not
glass. `pack-shards` regrades luminance into the exact `OBSIDIAN` palette from
`src/config.js` and then drives a ridge-noise field through the body, bedded by
the inside-distance so the cracks stay off the rim. At `--seams 0.9
--seam-scale 5` they are cracks; the first pass, thresholded at 0.62, gave lava
rivers that ate the rock. The boulder carries them at 320 px and the volley
shards at 192.

**The slam was playing a third too fast.** `magma-sheet.webp` is 820x1312, pitch
164, eight rows — **forty frames**. `BOSS_FX.smash.seconds` was still the 0.8 the
thirty-frame page was tuned to, which is 50 fps against a beat authored at 37.5.
It is 1.07 now. Every judgement made against the fist before this was made
against a beat playing at 4/3 speed.

## The rider, and what a green-screen clip will and will not give you

`video/skill_65901201_clip_000.webm` is an Invokers unit on green — a rider on a
crimson beast, 2560x1440, 151 frames, and the subject is only about 800 px of
that. It is a **character**, not an effect, which is why it became a summon
rather than a plate.

What the clip gives up cheaply: the creature. `pack-green-clip.mjs` keys it out
clean at 448 px, 54 frames, **154 kB** with its matte stacked under the picture,
and `src/art/alphavideo.js` already folds that back in a mesh shader — the
outcome cards have shipped on it for weeks. The quad is anchored bottom-centre,
so `fit(h)` stands the beast on its own feet wherever you put it.

What it does not give up at any price: **its VFX.** The swipe is a big
translucent disc you can see the beast through, so by construction most of its
colour *is* backdrop, and it keys olive. Nothing in the tool fixes that —
`--tint`, `--band`, `--glow`, `--gold` and `--lift` were all tried, and so was a
new `--sheer`, which unmixes a subject pixel against the backdrop using its
green excess. `--sheer` is honest arithmetic and still not enough: green excess
badly underestimates the backdrop fraction once the effect is bright, because a
white-hot swipe at half coverage over green reads as only slightly green.

So the beat keeps the creature and throws the disc away — `--band 0.5:2.8` lets
the flood fill reach it as backdrop, and the crop is tight enough that the disc
falls out of frame. The hit then lands in the fight's own vocabulary: `vfx.impact`
on each card, `shake(18, 0.4)` and `sfx.bossSmash`. That is the general lesson
for any clip like this — **take the figure, leave the effect.**

One trap worth naming: the rider is mounted into `vfx.field` once at load and
lives there hidden. It is not created per beat, because a `VideoSource` takes a
real load and a real first frame, and building one inside a boss turn would cost
the turn its budget.

## tools/paint-beat.mjs — five layers, not one ramp

`pack-boss-beat.mjs` paints a mask by inside-distance alone: a hot rim and a
hollow belly, which is the neon outline the board reads as UI. `paint-beat.mjs`
gives a beat a body instead — near-black crust mottled with noise, molten seams
from a domain-warped ridge field that scrolls frame to frame, a torn rim whose
depth is itself noise so the edge tears instead of tracing the silhouette,
ember streaks with their own lives across the beat, and smoke built from the
frames behind this one. It writes a painted **page** on black with real gutters,
which is exactly what `pack-painted-beat.mjs` already knows how to cut.

`--crack <n>` skips the flipbook entirely and draws a splitting crack: a jagged
centreline whose gap opens along its length, rock lips on both sides, flame
licks climbing out of the widest part. That is where the fissure comes from —
the build's own fire masks all read as *fire*, and what the beat had to say was
*the floor tore*.

Two things it cannot do, learned by doing them: the procedural obsidian chips
(`--shards`) are convincing at 320 px and read as pebbles below about 120, and
`T_FX_Obj_Rocks_1_1_3x3_A` is unusable as a plate — 128x128 for nine frames is a
42 px cell.

```
node tools/pack-boss-beat.mjs --src masters/fx/invokers/T_FX_Smoke_4_1_4x4_A.png \
  --out src/assets/fx/erupt-sheet.webp --ramp violet --take 1:14 \
  --rim 44 --glow 0.8 --cool 1,0.62,1.9,0.7,1.15 --strip

node tools/pack-boss-beat.mjs --src masters/fx/slash/T_FX_Mask_25_1_Slash.png \
  --wipe masters/fx/slash/T_FX_Mask_26_1_Slash_Erosion.png \
  --out src/assets/fx/rake-sheet.webp --cell 384 --rim 30 --margin 40 \
  --glow 0.9 --cool 1,0.62,2,0.7,1.15 --claw --ramp violet --strip

node tools/shoot-boss-fx.mjs --plates --rate 0.12 --gap 500
```

The second command is how the rake was made until the painted page replaced it,
and it is kept because it is the only mask-painted beat with no flipbook behind
it at all: the build ships one slash shape and an erosion gradient beside it,
and `--wipe` tears the gash open along that gradient and burns it back down,
which is how the build animates its own slashes. `--claw` stamps three of them,
the middle the longest. Run it and `rake-sheet.webp` goes back to three gashes.

The masks come out of git history — the library sat in `src/source/fx/invokers`
before that folder was emptied, and the sheets in use now live in
`masters/fx/invokers`.

Two things decide whether a plate works on a phone:

- **The rim has to be thick.** `--rim` is measured in source pixels, and the first
  pass at 15 read as a lilac wisp behind the gems. At 40-44, with `--glow` at 0.8,
  the same plate reads as fire. Only the edges burn and the belly stays a hole the
  match-3 shows through, which is what keeps the board playable under the hit.
- **Size is board-relative.** `stage.w * 1.9` looked like a magenta outline drawn
  around the whole screen. `board.size * 1.3` looks like an impact.

`tools/shoot-boss-fx.mjs` is how each one was judged: it drives the built creative
in a 430x932 phone viewport and photographs every beat on the board. Two traps in
it are worth knowing — `states.halt()` puts the world rate back to 1, so the rate
has to be set again after every halt or the plate is gone before the first frame
lands, and a screenshot costs a few hundred milliseconds, so `--plates` fires the
plate on its own rather than waiting out the rig animation that leads the beat.

## A painted page is a beat already drawn

`masters/fx/painted/claw-page.png` is the claw rake as sixteen hand-painted
cells on one page, and it is what the beat ships as now. `pack-painted-beat.mjs`
turns a page like that into the frames the fight wants, and three things about
a painted page make it not a sprite sheet:

- **The grid is drawn, not machined.** The page is 943x1024, which is not four
  equal cells of anything, and the outer margins are uneven. So the cuts are
  measured: project the ink onto each axis, and the empty bands between the runs
  are the gutters. Nothing outside a cell's own box is ever sampled into it,
  which is what stops a frame carrying a piece of its neighbour.
- **The page is grey, 42,42,42.** Nobody paints fire on black and can see what
  they are doing. It is subtracted rather than keyed, which is the arithmetic
  the add blend does anyway and leaves the outer glow a key would chew.
- **The ink is not centred in its cell.** `--align ink` puts every frame on its
  own brightness-weighted centre, so the beat keeps its growth and loses the
  slop. `--align cell` is right only for a page drawn on a real grid.

```
node tools/pack-painted-beat.mjs --src masters/fx/painted/claw-page.png \
  --out src/assets/fx/rake-sheet.webp --frames 15 \
  --take 2,3,4,5,6,7,8,9,10,11,12,13,14,15,16 --gain 1.4 --contact
```

`--gain` is the first knob. At 1 the plate is honest to the painting and reads
as a brown smear behind the gems, because the vfx field is under them and only
the gaps between the gem circles are ever seen. At 1.4 it reads like the mask
plate it replaced, and the corners are still black.

`--frames` and `--take` are the other one, and between them they are what
smoothness is. Ten frames across 0.46 s is 22 fps, and a `--take` that spreads
ten cells over sixteen skips five of them, so the eye gets a jump at every skip
on top of the low rate. Fifteen consecutive cells is 33 fps with no skips at
all, and the sheet is only a row taller: `src/art/spells.js` counts the rows off
the file rather than assuming two, so more frames is a taller sheet and no code.
66.7 kB against 42.1.

The last of it is not in the sheet at all. `vfx.bossSwing` draws **two** sprites
and cross-fades them, so between one painted cell and the next the plate is a
blend rather than a switch — at 60 Hz each cell lands on about two refreshes,
and without the blend that is exactly what a flipbook looks like. On the
additive blend the two alphas are complementary, so the light is conserved; on
the normal blend the near frame stays at full and the far one rises over it.

The palette is the one thing this page does not share with the rest of the boss:
it is gold and orange fire over violet cores, where every other beat is violet
and magenta. That is the art as it was handed over, not a packing artefact.

## A painted still is a beat waiting to happen

`masters/hint/fire-attack.png` is one hand-painted magma burst on black, and it is
the look the slam was always after. `tools/pack-still-beat.mjs` turns that one
frame into the ten the fight needs: every cell is the same art pushed wider, its
gain falling away, its colour cooling from white through gold to deep red, and the
late cells eaten from the middle outward so the fire tears into islands instead of
shrinking as one lump. The centre stays open the whole way, which is what lets the
board read through the hit.

```
node tools/pack-still-beat.mjs --src masters/hint/fire-attack.png \
  --out src/assets/fx/magma-sheet.webp --strip
```

`BOSS_SPELLS.smash` is `["magma", "slam"]`, so the painted plate wins and the
mask-painted slam stays behind it as the fallback.

That sheet is gone. A painted page of sixteen real frames took the slot, and the
section below is how. The command above still writes `magma-sheet.webp`, so point
its `--out` somewhere else before running it: what it makes is a synthesised
beat, and the slot now holds a drawn one.

Image-to-video was tried on the same still first — `gen-boss-fx.mjs --from
<image>` feeds it to Wan as the first frame. It holds the art for two frames and
then throws it away: by frame three the burst is a flat magenta flower with the
painting gone. A still with a synthesised beat keeps the artist's frame exactly;
the model cannot.

## The other half of the arc: climbing out of the ground

`pack-still-beat` starts on the artist's frame and burns it down, which is the
whole beat for a hit that lands. An eruption is the mirror of it — nothing, a
crack of light on the ground, then the column stretching up until the last cell
is the still. `tools/pack-rise-beat.mjs` writes that: every cell samples the same
art about one impact point with two scales, a vertical one that extends the
column and a horizontal one that opens the burst, so the shape is never invented
and the last cell is the source pixel for pixel. The early cells run over-bright
and pushed toward white, which is the break-out flash.

```
node tools/pack-rise-beat.mjs --src masters/hint/lava-fist-onblack.png \
  --ground 0.9 --hold 0.08 --out masters/hint/lava-fist-rise.webp \
  --preview masters/hint/lava-fist-rise.mp4
```

The impact point is measured from the brightest mass by default, which lands in
the middle of the burst and lets the plate grow downward as well as up.
`--ground 0.9` puts it on the rock line instead, and that is the difference
between a burst that inflates and one that erupts. `--frames 24 --cols 6` is for
looking at; the fight reads 12.

The lava fist came in as a screenshot of a transparent PNG, not the PNG, so the
source had a checkerboard baked into it. `tools/unchecker.py` fits the pitch,
origin and parity off the border strips and solves alpha from the difference
between the two phases, then suppresses what is left by colour — the checker is
neutral and dim, the art is saturated or bright. It recovers the fire cleanly
and it cannot recover the smoke, which was semi-transparent over the board: that
haze is why the mid cells still carry grey blocks. Ask for the file, not the
screenshot.

## THE LAVA FIST, sixteen painted stills

`pack-rise-beat.mjs` grows the column by resampling one still, so every cell is
the same paint at another scale — the shape is honest, the fire inside it never
moves. These sixteen prompts are the other way round: each cell is its own
painting, and the sixteenth is `masters/hint/lava-fist.png` itself, so the
animation ends exactly on the art that was approved. Generate 1–15, keep 16 as
the source file, pack 4×4.

Every prompt below is the STILL block, then the ANCHOR block, then the one
sentence that is the frame. The impact point sits on the same ground line in all
sixteen and the burst grows upward out of it — that, and a fixed seed, is what
keeps the sheet from flickering.

### STILL

```
One still frame out of a sprite sheet. The effect is isolated on a pure black
background, nothing else in frame, no floor line, no room, no landscape, no
character, no hands. One fixed camera, the same framing and the same scale in
every frame, the crater stays on the same ground line low in a tall vertical
frame. Painted 3D mobile-RPG game VFX, semi-realistic, high contrast, a white-hot
core bleeding out through gold and orange into deep crimson, charred obsidian
crust cracked with molten seams, torn ragged edges, no flat cartoon shading. No
text, no letters, no numbers, no watermark, no logo, no UI.
```

### ANCHOR

```
The finished shape this is growing into: a clenched fist of molten rock punching
straight up out of a shattered crater, the forearm one thick column of glowing
magma, the knuckles black obsidian split by white-hot seams, a crown of fire and
flying rock shards thrown out low around the base, charcoal smoke climbing behind
the burst.
```

### The sixteen

```
1/16  Black rock, unbroken. One hairline seam of dull ember light runs across the
ground where the fist will come through, nothing above it, no flame yet.

2/16  The seam forks into a short web of cracks, dim orange light seeping up
through them, the first two or three embers lifting off the ground.

3/16  The cracks spread into a ring and brighten to yellow, a pool of light
burning underneath the rock, the nearest plates of stone tilting up off the
ground, no column yet.

4/16  Break-out: a white blowout of light bursts up out of the crater, the whole
ground ring over-bright and washed toward white, slabs of black rock thrown up
and outward, the column still only a low swell of fire one fifth of the frame
high.

5/16  A blunt bulb of molten rock shoves up through the flash to a third of the
frame, still over-bright and pushed toward white, a ring of debris and fire
flying outward low around the base.

6/16  The swell has stretched into a column reaching just under half the frame,
reading as a thick wrist of magma, sheets of molten rock peeling off its sides,
the crown of fire at the base opening to its widest.

7/16  The column reaches three fifths of the frame and the top gathers into a
knuckle mass, the first fingers folding out of it, the first dark crust closing
over the hottest parts.

8/16  A clenched fist is clearly formed at the top of a forearm that now fills
about three quarters of the frame height, obsidian crust cracked with white-hot
seams, the first charcoal smoke lifting behind it.

9/16  The fist climbs to five sixths of the frame, the splash of fire around the
base at its tallest, rock shards at their furthest out, long fire trails still
connecting them back to the crater.

10/16  Full height and the overshoot: the arm is punched out a touch taller and
thinner than it will settle, and the whole effect is at its brightest and most
white-cored of the entire sheet.

11/16  The arm settles back a fraction, crust closes over the knuckles, the
white-hot seams narrow to gold, the base fire pulls in from its widest.

12/16  The shape now matches the anchor exactly, and the fire around the base is
at its fullest bloom, gold and crimson packed into the crater under the fist.

13/16  The thrown material starts coming back down: arcs of molten spatter
falling around the fist, the smoke plumes risen high behind it, the fist itself
unchanged.

14/16  The embers settle into their places along the falling arcs, the outer rock
shards slow at the edge of the burst, the crust on the fist darkened to its final
black.

15/16  One step short of the final art: the same fist, the same crater, the same
smoke, the core a touch hotter and a few more sparks still in the air than the
sheet will end on.

16/16  The final art, unchanged: masters/hint/lava-fist.png itself, dropped into
the last cell.
```

### All sixteen in one prompt

Sixteen calls is sixteen chances for the crater to move. One page generated in a
single pass cannot drift, because the model paints the whole progression against
itself — so this is the first thing to try, and the sixteen above are the fallback
for whichever cells come back wrong.

```
A 4x4 sprite sheet, sixteen equal cells on one page, read left to right and top to
bottom, one single eruption animation: a clenched fist of molten rock punching
straight up out of the ground. Every cell is the same fixed camera at the same
scale, the crater on the same ground line low in the cell, the burst growing
upward out of it. Cell 1: black rock, unbroken, one hairline seam of dull ember
light. 2: the seam forks into a web of cracks, orange light seeping up, the first
embers lifting. 3: the cracks spread into a ring and brighten to yellow, a pool of
light burning under the rock, stone plates tilting up. 4: break-out, a white
blowout of light bursts up out of the crater, slabs of black rock thrown up and
outward, the fire still only a low swell a fifth of the cell high. 5: a blunt bulb
of molten rock shoves up through the flash to a third of the cell, over-bright, a
ring of debris flying outward. 6: the swell stretches into a column just under
half the cell, a thick wrist of magma, molten sheets peeling off its sides, the
crown of fire at the base at its widest. 7: the column reaches three fifths and
the top gathers into a knuckle mass, the first fingers folding out of it. 8: a
clenched fist clearly formed on a forearm three quarters of the cell high,
obsidian crust cracked with white-hot seams, the first smoke behind it. 9: the
fist climbs to five sixths, the splash of fire at its tallest, rock shards at
their furthest out. 10: full height and the overshoot, taller and thinner than it
will settle, the brightest and most white-cored cell of the sheet. 11: the arm
settles back a fraction, crust closes over the knuckles, the seams narrow from
white to gold. 12: the fire around the base at its fullest bloom, gold and crimson
packed into the crater under the fist. 13: the thrown material falls back, arcs of
molten spatter around the fist, smoke plumes risen high behind it. 14: the embers
settle along the falling arcs, the outer shards slow, the crust darkened to its
final black. 15: the core a touch hotter and a few more sparks in the air than the
last cell. 16: the finished effect, a clenched fist of molten rock punching up out
of a shattered crater, the forearm one thick column of glowing magma, knuckles of
black obsidian split by white-hot seams, a crown of fire and flying rock shards
low around the base, charcoal smoke climbing behind it. Painted 3D mobile-RPG game
VFX, semi-realistic, high contrast, a white-hot core bleeding out through gold and
orange into deep crimson, charred obsidian crust cracked with molten seams, torn
ragged edges, no flat cartoon shading. Pure black background in every cell,
nothing else in frame, no floor line, no room, no landscape, no character, no
hands, no grid lines drawn between the cells, no cell borders, no numbers, no
text, no watermark, no logo, no UI.
```

If the model drops the tail of that, four sentences keep the arc and lose the
per-cell detail. Nothing shorter survives: the first sentence is the sheet, the
second is the whole animation, the third is what must not move between cells, and
the fourth is the palette and everything that must not be in frame.

```
A 4x4 sprite sheet, sixteen cells read left to right and top to bottom, of one
eruption: a clenched fist of molten rock punching straight up out of the ground.
It starts as a hairline crack of ember light in black rock, breaks out in a white
flash of light and flying stone by cell 4, climbs as a column of magma that
gathers into a fist, hits full height and peak brightness at cell 10, then
settles, crusts over into black obsidian split by white-hot seams, and ends on the
finished fist over a shattered crater with a crown of fire, flying rock shards and
charcoal smoke behind it. Same fixed camera and scale in every cell, the crater on
the same ground line low in the cell, the burst growing upward out of it. Painted
3D mobile-RPG game VFX, semi-realistic, high contrast, a white-hot core bleeding
through gold and orange into deep crimson, pure black background, no floor, no
character, no grid lines or cell borders, no text, no watermark, no UI.
```

Same NEGATIVE as below, plus `grid lines, cell borders, panel borders, frame
numbers, contact sheet labels`.

### NEGATIVE

```
second explosion, aftershock, pulsing, looping, ground, floor, horizon, wall,
room, landscape, sky, person, face, character, creature, body, hands holding,
weapon, prop, camera movement, zoom, orbit, shake, text, letters, numbers,
watermark, logo, signature, ui, hud, grey background, white background, gradient
background, vignette, checkerboard, transparency checker, photorealistic,
photographic, filmed footage, blurry, low contrast, washed out, dim, lens flare,
depth of field, violet fire, magenta fire
```

`violet fire` is in there for the same reason `orange fire` is in the boss list,
with the sign turned over: this one is the heroes' fire and must not drift into
Koltmos's colours.

### Running it

Fix the seed across all fifteen and feed frame 16 in as an image reference at low
strength for 12–15, higher strength as the number drops, so the late cells land
on the approved art and the early ones are free to be a crack in the ground. A
frame that comes back with the crater in a different place is thrown out, not
nudged — a moving impact point is the one flaw the packer cannot fix afterwards.

### What came back, and what it shipped as

One page, sixteen cells, in reading order and already an arc: the ink climbs from
the first cell to the ninth and falls away to the sixteenth, and the arm is out at
full height by the third. All sixteen shipped as `magma-sheet.webp`, the MAGMA
SLAM plate `boss.smash` draws, played as thirty frames over 0.8 s — until the
forty-cell page below replaced it.

```
node tools/pack-painted-beat.mjs --src masters/fx/painted/fist-page.png \
  --out src/assets/fx/magma-sheet.webp --frames 16 --cell 256 --smooth 30 \
  --take 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16 --align ground --alpha 70 --contact
```

Three of those flags are new, and each is something this beat needs that a burst
does not.

- `--align ground` anchors every cell on the point it stands on rather than on
  its own centre of light. On an eruption that centre climbs with the column, so
  centring on it drags the crater down the frame as the fist goes up; anchored on
  the ground, the measured bottom of all fifteen frames lands within a pixel of
  the same line and the impact point does not move at all. `--ground 0.92` then
  puts that line near the bottom of the output cell, because everything the beat
  does happens above it.
- `--smooth 30` is the difference between a beat and a flip-through. Sixteen
  paintings across the half second the slam had puts the whole rise in four
  frames, and it read as the animation at double speed rather than as a punch.
  The plate cross-fades between cells already, so slowing it down alone buys a
  dissolve and nothing else: the frames in between have to be real ones.
  `minterpolate` at `mi_mode=mci` builds them by motion compensation, and on
  this page it works — the cell where the arm is half out of the ground was
  never painted. Thirty of them at `seconds: 0.8` is 37 fps, and the sheet is
  six rows instead of three; it costs about 105 kB, which is what an effect this
  size is worth. The length is the other half of it and the two are not the same
  knob: a second reads as the right pace and leaves each frame on screen long
  enough to be seen as a frame, 0.8 s is the same thirty paintings going by too
  fast for that, and half a second is where the beat starts to look sped up
  again.

  ffmpeg will not synthesise past the last input frame and drops about two
  frame-intervals off the tail, so the tool feeds it three copies of the last
  cell and asks for `want - 1` fps against `cells - 1` fps in, which lands
  output frame 29 exactly on painted cell 16. Without that padding the last
  three cells of the sheet come back as one held frame, and the beat ends on a
  freeze.
- `--alpha 70` cuts an alpha channel out of the ink. The slam is the one boss
  plate the game draws normally rather than adding, and this art is why that
  matters: the fist is mostly dark obsidian, and dark is nothing on an add blend,
  so the arm would come out as a few lava veins floating over the board. Solid at
  70 above the floor is the ramp the painted still shipped with, and it keeps the
  rock rock while the soft outer smoke still fades.

`BOSS_FX.smash` had to give up its `grow`. The plate used to swell 26% over the
beat, which is free growth for a burst drawn about its own middle and a disaster
for a plate anchored at the bottom: scaling about the sprite's centre walks the
crater down the board by some 45 px while the fist is climbing out of it. The art
carries every bit of growth this beat has. `wide` went to 1.18 and `depth` to
0.58, which lands the crater on the bottom row of the board and stands the fist
as tall as the grid.

Thirty and not thirty-two because `src/art/spells.js` cuts every sheet five to a
row and counts the rows off the file: a frame count off that grid leaves empty
cells at the end, and `bossSwing` spends the tail of the beat on nothing. Any
multiple of five is free. The cell went to 256 because that is where the packer's
scale lands at 1.0 — the page's own resolution, with nothing spent upsampling it,
and 63 kB cheaper than the 288 it started at.

## Forty cells, and no interpolation at all

`masters/fx/painted/fist-page-40.png` is the same eruption drawn out to a 8x5
page, forty cells in reading order, already on black. It replaces the sixteen.
The `--smooth 30` the old page needed is gone with it: thirty of those frames
were built by motion compensation because the painter had drawn sixteen, and
forty painted ones are forty painted ones. That is the whole of what this page
buys, and it is the only thing that was ever wrong with the beat.

```
node tools/pack-painted-beat.mjs --src masters/fx/painted/fist-page-40.png \
  --out src/assets/fx/magma-sheet.webp --frames 40 --cell 160 \
  --take 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40 \
  --align ground --alpha 70
```

The gutters give 8x5 on their own, so `--cols`/`--rows` stay out of it. Forty is
a multiple of five, so the sheet cuts eight clean rows and `bossSwing` spends
none of the beat on an empty cell.

`--cell 160` is where this page's scale lands at 1.0, the same argument the old
`--cell 256` was making about a page with four columns instead of eight: the
widest frame reaches 134 px, and 160 less the 4% margin is 147, which is a
scale of 1.055 — near enough native that nothing is spent upsampling detail the
page does not have. Asking for 256 would have cost about 230 kB of file for a
2x blur. The sheet lands at 820x1312 and **193 kB, down from 335** — forty real
frames for 142 kB less than thirty interpolated ones, which after the 1.33x
base64 markup is about 190 kB off the bundle.

Everything else is unchanged and for the same reasons: `--align ground` because
the impact point is what must not move on an eruption, `--alpha 70` because
`smash` is the one boss plate drawn normally rather than added and the fist is
mostly dark obsidian, and no `--grow` on the plate because the art carries the
growth.

Shot on the board with `tools/shoot-boss-fx.mjs --beats smash`: the crater sits
on the bottom row, the fist stands as tall as the grid, and the tail frames go
to nothing before the sprite is destroyed.

## Midjourney, and where the quality ceiling actually is

The forty-cell page is 1024x765, so a cell is 128x153 and the ink inside it
reaches 134 px. `bossPlate` draws that plate at `board.size × 1.18`, which on a
430-wide phone is about 500 px. **The art is upscaled 3.7x at draw time**, and
that, not the model, is what soft looks like. A better prompt into the same
1024-wide page changes nothing: forty cells across 1024 px is 128 px a cell
whatever painted them.

So the only prompt worth writing is one that ends in more pixels per cell, and
there are two ways to get there.

### Upscale the page, do not redraw it

The lowest-risk win and the one to try first. Generate the page, then
**Upscale (Subtle)** — 2x to 2048x1530, 256 px a cell, which is exactly where
the old sixteen-cell page sat and where `--cell 256` was worth paying for.

Subtle and never Creative. Creative reinvents detail cell by cell, and forty
cells of independently reinvented detail is forty different fists: the crust
moves, the knuckles change count, and the beat flickers. `--align ground` can
hold the impact point still and can do nothing at all about the shape above it.

### The page itself

Upload the current page to Midjourney first and paste its URL into `--oref`, so
the run is a redraw of this eruption rather than a new one.

```
sprite sheet of one lava fist eruption, 8 columns by 5 rows of separate small frames on pure black, read left to right and top to bottom: cracked glowing ground, a burst of molten rock and flying debris, a clenched fist of magma punching straight up on a thick forearm, the crust closing into black obsidian split by white hot seams, then smoke and embers settling back down to nothing. every frame standing on the same ground line, wide black gaps between the frames. painted mobile game VFX, semi realistic, white hot core bleeding through gold and orange into deep crimson, charred obsidian crust split by molten seams, torn ragged edges, fine ember sparks and grey smoke, crisp high contrast rendering, sharp detail --ar 4:3 --style raw --s 200 --q 2 --chaos 0 --oref <url> --ow 200 --no text, letters, numbers, watermark, logo, ui, grid lines, cell borders, panel frames, white background, grey background, character, hands, horizon, ground plane, blur, soft focus, depth of field
```

`--style raw` because the default aesthetic pass is what turns a VFX asset into
an illustration, `--chaos 0` because variety between the four results is the
opposite of what a sheet wants, and every "no" in `--no` rather than in words:
Midjourney does not take instructions about what to leave out, it takes a
`--no` list. `--ow 200` holds the shape; drop to `--sref <url> --sw 200` instead
if the ask is the look and not this exact fist.

Midjourney will not honour "8 columns by 5 rows". It never does. That is
survivable here and nowhere else in this repo, because `pack-painted-beat.mjs`
**measures** the grid off the gutters rather than dividing the width by a
column count — a page that comes back 7x6 packs as well as one that comes back
8x5, as long as the gaps between the cells are real and the background is
black. What is not survivable is cells that touch: the packer never samples
outside a cell's own box, so two drawings that overlap their gutter hand each
other a bite. Count the cells on what comes back, feed the real number to
`--frames`, and take a run of consecutive ones.

### What a run has to come back with

Pure black, not near-black — the packer subtracts the page colour, and a grey
page subtracted off leaves a grey film. One shared ground line, because
`--align ground` measures the lowest ink per cell and a frame drawn floating
lands its crater on the floor of the output cell. And an arc in reading order
that ends at nothing: the last cell is what the board is left holding.

## The same fist as a Seedance clip

The sheet is sixteen paintings interpolated to thirty. A clip is 120 real frames
for the same second and a half, so the rise stops being interpolation and starts
being motion — which is the only thing a video model buys here. Everything the
painted page had to be told still holds: square, crater nailed to one spot, ends
on black.

Seedance has no negative field and drops geometry past about a hundred words, so
the "no" terms live inside the prompt and the shape lives in the images. Three
ways in, strongest first.

### First frame and last frame

Cell 1 of `masters/fx/painted/fist-page.png` as the first frame, the finished art
`masters/hint/lava-fist.png` as the last. The two stills carry the shape, so the
prompt only has to carry the rise, and the clip cannot land anywhere but on the
approved art.

```
The eruption between these two frames, as one continuous rise. The cracked rock blows open in a white flash of light and flying stone, a thick column of molten magma climbs straight up out of the crater, and its top gathers into the clenched fist of the last frame, which it reaches by 1.5 seconds and holds while the thrown rock falls back, the embers die and the frame burns down to pure black. One rise, no cuts, no second explosion, no pulsing. The crater stays on the same spot low in frame and never moves. Painted mobile game spell VFX on a pure black background, white-hot core through gold and orange into deep crimson, no ground, no floor, no character, no text, no interface. Fixed camera, static shot. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### First frame only

Cell 1 alone, when the last-frame slot is not available. The arc has to be spelled
out, and the timing is what keeps the beat inside the window `pack-spells.mjs`
samples for `slam`.

```
Animate this frame as one single eruption. Black rock cracks wide open, a white flash of light and flying stone bursts out of the crater, and a thick column of molten magma climbs straight up and gathers into a clenched fist of glowing rock, knuckles of black obsidian split by white-hot seams, a crown of fire and flying shards low around the base. It breaks out in the first half second, hits full height and peak brightness by 1.5 seconds, then the crust closes over the knuckles, the thrown rock falls back, the embers die and the frame burns down to pure black. One continuous rise, no cuts, no second explosion. The crater never moves, low in frame. Painted mobile game spell VFX, white-hot core through gold and orange into deep crimson, pure black background, no ground, no character, no text, no interface. Fixed camera, static shot. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### Reference only

A Reference node treats the picture as style, so the finished art has to be named
as the target or the model paints something else in its colours. This is the
weakest of the three and the only one that needs no cell cut off the page.

```
The attached art is the finished shape of this effect: match it, and copy nothing else from the picture. One single eruption on a pure black screen. Black rock cracks open with a seam of ember light, a white flash and flying stone bursts out, a thick column of molten magma climbs straight up and gathers into that clenched fist by 1.5 seconds, then it crusts over into black obsidian split by white-hot seams, the thrown rock falls back and the frame burns down to pure black. One continuous rise, no cuts, no second explosion. The crater never moves, low in frame. Painted mobile game spell VFX, white-hot core through gold and orange into deep crimson, pure black background, no ground, no character, no text, no interface. Fixed camera, static shot. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### The sheet itself as the input

Handing the model the whole 4x4 page is the one route that needs nothing cut off
it, and it carries every frame of the beat at once — but a contact sheet is the
easiest picture in the world to animate wrongly. A model given a grid animates
the grid: sixteen little fists jittering in their cells, or the page itself
drifting. So the first two sentences are not about the effect at all, they are
about what the picture is and what must not survive from it. This one is written
to paste anywhere — Seedance, Veo through Gemini, Sora, Kling — with only the
tail changing per model.

```
The attached image is a 16-frame sprite sheet of one single VFX animation, read left to right and top to bottom. Play those sixteen frames back as one continuous video effect. Do not show the sheet, the grid, the cells or any borders, no copies, no split screen — one single effect alone, filling the frame. A clenched fist of molten rock erupts straight up out of the ground: black rock cracks open with a seam of ember light, a white flash of light and flying stone bursts out of the crater, a thick column of magma climbs and its top gathers into the fist at full height and peak brightness by 1.5 seconds, the crust closes over the knuckles into black obsidian split by white-hot seams, then the thrown rock falls back, the embers die and the frame burns down to pure black. One continuous rise, no cuts, no second explosion, no looping. The crater stays on one spot low in frame and never moves. Painted mobile game spell VFX, white-hot core through gold and orange into deep crimson, pure black background, nothing else in frame: no ground, no floor, no room, no character, no hands, no text, no interface. Fixed camera, static shot.
```

On Seedance, append the flags: `--rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true
--wm false`. It runs long for Seedance's hundred-word ceiling, so if the geometry
comes back soft, drop the palette sentence first and the timing second — the two
sentences about the sheet and the "never moves" clause are the ones that cannot
go.

### Veo, Sora and anything without flags

They have a negative field, which is where the "no" terms belong instead, and
they have no `--rt 1:1`: Veo renders 16:9 or 9:16 and neither is what
`bossPlate` draws. So the framing has to be asked for in words and taken in the
crop afterwards — `the effect dead centre of frame with wide empty black margins
on both sides, the whole burst inside the middle square` — and the file cropped
to square before `pack-spells.mjs` ever sees it. A take that fills a 16:9 frame
edge to edge has no square to cut out of it and is thrown away.

Duration, camera and frame rate go in the request rather than the prompt: 5 s,
static camera, 24 fps. The NEGATIVE block at the bottom of this file is the one
to paste, plus `sprite sheet, grid, contact sheet, cells, panel borders, split
screen, multiple copies, thumbnails` — every term that describes the input
picture, because that is the failure this route has and the others do not.

### What has to come back

The five ways the September 22 claw take was unusable are the same five here, and
four of them are set before the render: `--rt 1:1` because `bossPlate` draws the
sprite square, `--cf true` because a moving camera moves the crater, the break-out
inside the first half second because `pack-spells.mjs` cuts `slam` out of
0.5–2.0 s, and the burn-down because a plate still lit when the sprite dies pops
off the board. The fifth is the one only the file can answer: no frame may go
fully white, which on the add blend is the board disappearing.

Then `tools/retime-clip.mjs` before anything else. The rise is where a generated
clip's four-frame ripple shows worst — the column travels furthest per frame
exactly where every fourth one jumps — and that ripple is what a jerky take
actually is. Smoothness here is not frame count; the painted sheet already runs
thirty. It is even spacing.

## What the local ComfyUI gave, and why none of it shipped

Fourteen takes on the local Wan 2.2 TI2V-5B, in two prompt styles, at 384 and at
512 with 41 frames: `tools/gen-boss-fx.mjs` holds every prompt, and
`tools/pack-boss-fx.mjs` cuts its frames into a spell sheet, raising the black
point and burning the tail down to black because the model never dies away on its
own. All of it was rejected:

- the beat comes back backwards — the clip ends at its brightest, however hard the
  prompt asks for a burn-down;
- the colour collapses to flat neon magenta with green and cyan fringing;
- the shapes are organic, not VFX: the eruption came back as glowing seaweed, the
  cataclysm as a pom-pom, and one take drew a literal candle.

Keep the tool for flame and light where a soft body is the point. For a boss hit
with a torn edge, the build's own masks and the distance-ramp painter win, and they
cost seconds instead of minutes.

## What the fight draws

| beat | fired by | the call | sheet on disk | dev state |
| --- | --- | --- | --- | --- |
| CLAW RAKE | `bossRake` | `bossPlate("rake")` | `rake-sheet.webp` | `boss.rake` |
| LAVA BREATH | `bossBreath` | `bossPlate("breath")` | `breath-sheet.webp` | `boss.breath` |
| MAGMA SLAM | `bossSmash` | `bossPlate("smash")` | `slam-sheet.webp` | `boss.smash` |
| ERUPTION | `bossSmash`, turn 3 on | `bossPlate("erupt")` | `erupt-sheet.webp` | `boss.smash` |
| ENRAGE ROAR | `castDoom`, under the roar | `bossPlate("roar")` | `roar-sheet.webp` | `boss.doom` |
| CATACLYSM | `castDoom` | `bossPlate("doom")` | `doom-sheet.webp` | `boss.doom` |
| KOLTMOS MENDS | `bossMend` | `vfx.mend()` → `bossSwing("mend")` | — falls back to `nature` | `boss.mend` |
| the thrown stone | `dropObsidian`, `bossSnap` | nothing | — | `boss.obsidian` |

What is left: the mend still borrows Quinnto's nature ultimate, which is a burst
and exactly the wrong read for a heal, and the stone the boss spits onto the board
arrives with no effect on it at all — `vfx.lob` went with the rest of the old
vector work, and `tools/pack-shards.mjs` is still waiting on painted chunks.

## His colours

`#a855f7` violet, `#ff3a5a` crimson, `#ffd35a` gold, `#ff6a10` magma, `#fff2d0` core

Every boss take is violet and magenta with gold-bright torn edges and crimson
embers, not the orange the heroes' fire uses. The claw is the strictest of them:
its clip is violet and gold with cyan washing through the middle of the beat, and
`pack-claw.mjs --crimson` exists to fold that band onto `0xff3a5a` but is not what
ships. Leave the claw violet.

## The two pipelines

### Light on black — breath, slam, erupt, doom, mend, roar

Seedance, square 1:1, 5 s, 24 fps, 480p, fixed camera, seed 7. `pack-spells.mjs`
samples ten frames out of a window of the clip, subtracts a black point of 16 and
lays them into a 5-wide grid of 224px cells. `SPELL_ASPECT` is 1 and `bossSwing`
sets the sprite `w × w`, so the plate is **drawn square on the phone**. A 16:9 take
squeezes and reads as a different effect.

Because `blendMode` is `"add"`, black is invisible and grey is a grey film laid
over the boss. The frame has to be genuinely black, and the burst has to be
finished inside the ten frames the sheet holds — a take that spends two seconds
gathering packs as ten frames of nothing.

### Paint on a white page — the claw

`src/art/rake.js` cuts `claw-rake.webp` on a 4-wide grid of 704×415 cells, twelve
frames, aspect 1.696, and `FRAME_HOLD` sits on the last frames two and a half to
four times as long as the first six — the tear is sampled at full rate, the burn
down is not. `vfx.claw` draws the frame on the normal blend with its matte, lays a
second copy on add over the top to find the gold and the cyan, and puts a
multiply bed of `0x4a2a55` under all of it.

So this take is **ink on white paper**, not light on black. The gashes are
near-black violet bodies with hot gold rims; a matte cannot be lifted off a black
ground for a drawing whose darkest part is the drawing.

## STYLE

```
painted 3D mobile-RPG game VFX in the boss KOLTMOS's own colours, semi-realistic,
high contrast, a white-hot core with violet and magenta light thrown off it, torn
gold-bright edges and crimson embers, no flat cartoon shading
```

## TECHNICAL

```
The effect is isolated on a pure black background, nothing else in frame, no
floor, no room, no landscape, no character, no hands. The effect stays centred in
frame the whole time. Single continuous shot, one fixed camera, no cuts, no shot
changes, no camera movement, no zoom, no push in, no orbit, no parallax, no smoke,
no dust, no haze, no text, no letters, no numbers, no watermark, no logo, no UI.
```

## BEAT

Ten frames across half a second. Everything the effect is has to happen on the
first beat of the clip.

```
Exactly one hit in the whole clip, on one beat: it reaches its widest and
brightest early, holds for a moment, then burns down and dies away until the frame
is completely black again. No second blast, no aftershock, no pulsing, no repeat,
no looping, and it is finished well before the clip ends.
```

Mend is the exception — it rises and settles rather than detonating — and the
cataclysm is the only one allowed to fill the frame.

---

## LAVA BREATH — `breath`

Drawn at the midpoint between the boss's mouth and the card row, `row.w × 1.15`
wide, 0.62 s, growing 30%, at 0.9 alpha. `vfx.jet` throws the actual jet over it;
this plate is the wash of light the jet sits in, so it must read as a cone coming
**toward the camera**, not across the frame.

```
A jet of violet fire with a white-hot throat pours straight toward the camera from
the far side of frame and opens out into one wide roaring cone that fills the
frame, magenta embers and gold flecks streaming forward through it, the flame torn
and ragged along its edges. It reaches its widest and brightest early, holds for a
moment, then guts out from the throat forward, the last embers riding away from the
camera until the frame is completely black again. One single breath on one beat: no
second jet, no pulsing, no repeat, and it is finished well before the clip ends.
```

## MAGMA SLAM — `slam`

This one does not come from a model at all. It is the only beat cut from the
build's own library, by `tools/pack-slam.mjs`, and the reason is worth keeping.

A generated take of this beat never survived: the model hears "ring" and "shards"
and returns a billow, and the billow packed flat. Every earlier slam plate —
Seedance's, and `pack-invokers-fx.mjs` tinting `T_FX_Smoke_4_1_4x4_A` — was a
silhouette filled with one colour, and a silhouette at `stage.w × 1.15` on the
additive blend is a pale cream blob three rows deep over the grid. The gems went
under it and the blow read as a fart of steam.

`masters/fx/fire/T_FX_Fire_9_1_2x6.png` is the shape the beat wanted all along: a
2×6 flipbook out of the Unity build, cells 512×170, of a low wide burst that opens
from a streak at the centre, runs out past both edges, tears into islands and
burns out. It is a hard black-and-white mask with no gradient in it, so the colour
has to be invented, and where it is put is the whole effect:

- a chamfer distance transform measures how deep inside the shape each pixel sits;
- the ramp is driven by that depth, not by the mask — `#fff2d0` core on the torn
  rim, `#ffd35a`, `#ff6a10`, `#ff3a5a` behind it, `#a855f7` in the belly at 22%,
  which on the additive blend is all but gone. **That is what stops it being a
  blob**: only the edges burn, and the middle is a hole you can see the board
  through;
- later frames cool — their ramp tops out at magma and their gain falls to 0.4, so
  the wave burns down instead of holding white;
- the painted cell is padded before the transform, or the violet bloom is cut off
  square at the cell edge and the plate shows its own letterbox;
- `CELL` is 320, not the 224 the other spell sheets use. At 224 the torn rim is
  four pixels wide, upscales to a smooth smear at draw size, and the plate reads
  as a lens flare.

The fight draws it at `stage.w × 1.42`, growing 50%, over 0.52 s, and **not at the
fist point**. The boss's feet sit above the board against a bright sky, and a plate
drawn there disappears into him. It goes on the board — `board.y + size × 0.2` —
with the painted hoop at the same ground line at `stage.w × 2.05`, alpha 0.72, so
the ring and the wave share one floor. The small vector ring that used to sit on
top is gone: a `Graphics` circle reads as UI against painted art.

## ERUPTION — `erupt`

The turn-3 attack that hits all six heroes at once and drops three extra stones.
Today it plays the slam plate, which is a fist landing — wrong shape for something
that comes up out of the ground across the whole row. This take is a ridge, wide
and low, rising on one beat.

```
The ground across the full width of frame splits open along one jagged crack and
columns of violet fire erupt straight upward through it, all of them rising
together on one beat, the middle column the tallest and the ones to either side
shorter, so the row reads as one ridge of fire and not as separate flames taking
turns. Slabs of black obsidian and white-hot sparks are thrown up with the columns,
magenta light burning in the crack underneath them. The eruption reaches its full
height and its brightest early, holds for a moment, then falls back and burns out
from the top down until the frame is completely black again. Exactly one eruption:
no second wave, no rolling line of further bursts, and it is finished well before
the clip ends.
```

## CATACLYSM — `doom`

The fuse effect, 0.32 of every hero's bar and 30 seconds of dread behind it. It is
the only plate allowed to flood the frame: `vfx.flash` already takes the screen to
`0xff2a06` at 0.85 for 0.7 s, and the plate has to be at least as loud as that or
the flash reads as the whole effect.

```
A single point of white light in the centre of frame swells for an instant and
detonates into one enormous nova of violet and magenta fire that floods the entire
frame, a hard thin ring of white-hot light racing outward ahead of it, torn crimson
flame and gold cinders dragging behind, the centre burning out to near white at the
peak. Then the whole thing collapses inward and burns down, the ring thinning away
past the edges, the last cinders going dark, until the frame is completely black
again. Exactly one detonation on one beat: no second blast, no aftershock, no
repeat, and it is finished well before the clip ends.
```

## ENRAGE ROAR — `roar`

The beat before the cataclysm, while `boss.roar()` plays on the rig. Rings only —
anything that detonates at the centre steps on the nova that follows it.

```
Two or three rings of violet shockwave light blow outward from the centre of frame
one after another, each one a thin torn hoop of white-hot light with magenta fire
smeared behind it, growing fast and thinning as it goes, dust of gold cinders
shaken loose and blown outward with them. The rings are brightest as they leave and
are gone past the edges of frame, and the light at the centre sinks away to
nothing until the frame is completely black again. No fireball, no explosion at the
centre, no debris left behind, and it is finished well before the clip ends.
```

## KOLTMOS MENDS — `mend`

The heal, twice a fight, `stage.w × 0.66` over 1.15 s. `MEND_FX.grow` is **−0.28**:
the sprite shrinks as it plays, so the take has to gather and rise rather than blow
outward, or the plate fights its own scale. It is also the only green thing the
boss does, and until `mend-sheet.webp` exists it borrows Quinnto's nature
ultimate, which is a burst — exactly the wrong read for a heal.

`#3fd16a` emerald, `#b6f5c9` pale leaf, `#fff2d0` core

```
A ring of emerald green light draws itself low in the centre of frame and rises as
one slow column of green and pale gold motes, thin ribbons of light winding upward
around it, its core brightening to white as it goes. The column reaches its
brightest, holds, then thins and drifts apart, the motes going out one by one as
they rise, until the frame is completely black again. It is a calm rising mend and
not an attack: no burst, no explosion, no shockwave, no debris, one single rise,
and it is finished well before the clip ends.
```

## CLAW RAKE — `claw`

Paint on white, not light on black. In portrait the swipe is drawn across the
middle of the board at `board.size × 0.78` wide and 1.696 times as wide as it is
tall, over 1.15 s. The one thing that ruins a take here is the three gashes opening
one after another: at twelve frames a stagger reads as three separate attacks, and
the prompt spends its first third saying so.

```
Three parallel claw slashes tear diagonally across the frame from the upper right
down to the lower left, and all three open at the very same instant, together, in
one single beat: one strike, not three. They arrive on the same frame, none of them
lagging behind another, never one after another, never three separate attacks. It
reads as one hand going through because of how each gash tears, not because of any
delay between them. Each slash opens from nothing and rips along its own length: a
tapered gash, widest about a third of the way along and coming to a fine point at
both ends, its edges ragged and torn with small hooks and splinters coming off
them, never a smooth stripe, never a rounded bar, never a straight line. The middle
slash is the longest and cuts the deepest, the two outside it are shorter and sit
parallel to it and evenly spaced. Each gash is a hot crimson red wound with a thin
white-hot core burning down the middle of its length, throwing small sparks and
flecks of molten light off its torn edges, and a faint red heat glow sits behind
all three as if the air itself had been opened. They flare to their brightest the
instant they finish opening, hold for a moment, then burn down and fade from the
tips inward until the frame is completely black again. There is exactly one swipe
in the whole clip, landing on one beat: no second strike, no repeat, no further set
of slashes after it, and it is finished well before the clip ends.
```

What shipped is not that take. `masters/fx/clips/claw.mp4` is violet and gold ink
on a white page with cyan through the middle, and `pack-claw.mjs` lifts its matte
as the distance from the page. For a replacement, ask for the drawing, not the
light:

```
Hand-painted 2D animation on a plain white paper background, ink and gouache, no
computer glow. Three parallel claw slashes tear diagonally across the page from the
upper right down to the lower left, and all three open on the very same frame,
together, as one strike. Each gash is a deep near-black violet wound with a hot
gold rim burning along its torn edges, tapered to a fine point at both ends, its
edges ragged with small hooks and splinters, never a smooth stripe. The middle
slash is the longest, the two beside it shorter and parallel. A wash of cyan light
passes through the middle of the beat and leaves. The paper stays plain white
everywhere else: no background, no scenery, no character, no hands, no shading of
the page, no drop shadow, no texture, no text. One swipe in the whole clip, then it
burns down and the page is plain white again. Fixed camera, static shot.
```

### The take that came back sideways, September 22

`video/boss-animaaion-attack_Seedance 2.5 Reference_2026-09-22_11-46-04.mp4` is
the reason this section exists. The colour is right — violet and gold with fire
in it, which is the hard half — and everything else about it is unusable, in
five ways that are all the same mistake: it was directed as a **shot**, and the
plate is not a shot. Measured off the file:

- **It is 720×1280.** The plate is drawn square: `bossPlate` takes one number,
  `board.size × 1.06`, and sets the sprite `w × w`. A 9:16 take squeezes into
  that and reads as a different effect.
- **Nothing ever comes down.** The centre of light sits at `y` 0.44–0.50 of the
  frame from the first frame to the last; the claw flies **left to right across
  the middle**. The boss is above the board and the hit lands on it, so a strike
  travels top-right to bottom-left or it is not a strike, it is something
  passing by.
- **The beat is at 4.33 s.** `pack-spells.mjs` samples ten frames out of
  0.6–2.2 s for this id. The first 2.5 s of this clip is the claw assembling
  itself in place — its lit area climbs from 11.8% to 27.5% without anything
  happening — so the sheet would be ten frames of a prop standing still.
- **One frame is 100% lit.** At 4.33 s the whole frame goes white. On the
  additive blend that is not an impact, that is the board disappearing.
- **It ends lit.** At 6.00 s, 12.9% of the frame is still burning at peak 249.
  A plate that has not reached black pops off when the sprite is destroyed.

The reference image is the likely author of the first two: hand a model a
picture of a flying claw comet and it will fly the comet, whatever the prompt
says. Reference a still of three torn diagonal gashes, or none at all.

```
Three parallel claw slashes tear diagonally across the centre of frame from the
upper right down to the lower left, and all three open at the very same instant,
together, in one single beat: one strike, not three. They arrive on the same
frame, none of them lagging behind another, never one after another, never three
separate attacks. Each slash opens from nothing where it already lies and rips
along its own length: a tapered gash, widest about a third of the way along and
coming to a fine point at both ends, its edges ragged and torn with small hooks
and splinters coming off them, never a smooth stripe, never a rounded bar, never
a straight line. The middle slash is the longest and cuts the deepest, the two
outside it are shorter and sit parallel to it and evenly spaced. Each gash is a
violet wound with a thin white-hot core burning down the middle of its length
and a torn gold-bright rim along its edges, throwing small sparks and flecks of
molten light off it, a wash of cyan light passing through the middle of the
beat. Nothing flies: there is no claw, no hand, no creature, no blade and no
projectile crossing the frame, only the three gashes opening where they already
are. The slashes do not travel, do not enter from one side, do not leave on the
other and do not drift; they stay centred and hold the same place in frame from
the moment they open. They reach their brightest the instant they finish
opening, hold for a moment, then burn down and fade from the tips inward until
the frame is completely black again. The middle of each gash stays open and dark
so the background reads through it, and the corners of the frame stay black —
the light never floods the whole frame and there is no white flash. Exactly one
swipe in the whole clip, landing on one beat inside the first second: no second
strike, no repeat, no further set of slashes, no aftershock, and it is finished
well before the clip ends.
```

Square 1:1, 5 s, 24 fps, 480p, fixed camera, with the STYLE and TECHNICAL blocks
above. Then `masters/fx/clips/rake.mp4` — the id is `rake`, not `claw`, because
`BOSS_SPELLS.rake` reads `rake-sheet.webp` — and:

```
node tools/pack-spells.mjs --contact rake
node tools/shoot-boss-fx.mjs --plates --rate 0.12 --gap 500
```

`rake` has no row in `WINDOWS`, so it packs on the default 0.6–2.2 s. If the
beat lands late anyway, `--start` and `--span` will move the window, but a take
that gathers first has already lost the frames the sheet needed — regenerate
rather than chase it.

## The stone he spits

Not a clip. `vfx.lob` flies a tinted glow with a spinning `paintGlob` inside it,
and `tools/pack-shards.mjs` is waiting on painted chunks: it reads every PNG under
`masters/boss/shards`, keys each lit blob to its own silhouette and packs the
eight biggest into a 4-wide grid of 128px cells. Generate stills, not video —
locally, where a still costs nothing.

```
Eight separate chunks of obsidian rock laid out on a pure black background with
clear black space between them, none of them touching or overlapping. Each chunk is
a different shape and a different size: sharp angular volcanic glass, near-black
with hard flat facets, cracked through with seams of molten orange-magenta light
glowing from inside the stone, a few white-hot edges where the rock has split. Lit
from above so the facets read. Game asset sheet, painted 3D semi-realistic, high
contrast, crisp edges. No ground, no shadow cast on the background, no character,
no hands, no scenery, no text, no watermark, no interface.
```

Raise the black point on the result before packing. The keying floor in
`pack-shards.mjs` is 9 and the minimum blob is 2400px — a chunk sitting in a soft
grey haze is either dropped or arrives wearing the haze.

## NEGATIVE

For Veo and Sora. Seedance has no negative field, so the "no" terms that matter
are already inside each prompt above.

```
gathering first, charging up, winding up, second explosion, aftershock, pulsing,
looping, slow motion, smoke, dust, haze, fog, mist, sparks filling the whole frame,
bright corners, glow at the edge of frame, ground, floor, horizon, wall, room,
landscape, sky, person, face, character, creature, body, hands, weapon, prop,
camera movement, zoom, push in, orbit, shake, cut, text, letters, numbers,
watermark, logo, signature, ui, hud, grey background, white background, gradient
background, vignette, photorealistic, photographic, filmed footage, stock footage,
cinematic, blurry, low contrast, washed out, dim, soft bloom, lens flare, depth of
field, orange fire, red fire, campfire, bonfire
```

`orange fire` is in there on purpose. Left out, the model paints the heroes' fire
and the boss stops being violet.

## Generating and packing

```
node tools/gen-spells.mjs --list
node tools/gen-spells.mjs --print doom
node tools/gen-spells.mjs breath slam erupt doom mend roar
node tools/pack-spells.mjs --contact breath slam erupt doom mend roar
```

`--force` overwrites a clip already on disk. The sampling window per id lives in
`WINDOWS` in `pack-spells.mjs`; every boss id already has one, and `--start`,
`--span` and `--gain` override it for a run.

The claw has its own packer, and it prints the grid it used so it can be pasted
back into `SHEET` in `src/art/rake.js`:

```
node tools/pack-claw.mjs --contact
node tools/pack-shards.mjs
```

## Judging a take

On the contact sheet the packer writes next to the webp:

- Cell 1 is already lit. Black first cells mean the model gathered before it blew,
  and chasing that with `--start` never recovers the beat — regenerate.
- The last cell is nearly black. If it still burns, the plate pops off when the
  sprite is destroyed.
- Every cell's corners are black. On add blend a lit corner is a grey square
  hanging over the boss.
- The colour is violet and magenta. A take that came back orange is the heroes'
  fire and is unusable whatever else it does.

Then in the game, because a plate that survives the contact sheet can still
disappear on the board: the vfx field sits under the boss and under the gems, so
the half of a plate drawn behind him is not seen at all. Judge every boss effect
where it actually lands — the breath and the eruption over the card row, the slam
and the cataclysm across the whole stage.

## Wiring a new plate in

`src/art/spells.js` globs `../assets/fx/*-sheet.webp`, so the file name is the id.

- `mend-sheet.webp` needs no code at all: `BOSS_SPELLS.mend` is already
  `["mend", "nature"]` and prefers the first that loads.
- `erupt-sheet.webp`, `doom-sheet.webp` and `roar-sheet.webp` load into
  `spellFrames()` but nothing asks for them. Each needs a row in `BOSS_SPELLS` and
  a call site: `bossSwing("erupt", …)` in `bossSmash` when the attack is the
  all-target one, and `bossSwing("doom", impact, …)` in `castDoom` beside the two
  shock hoops.
- `shard-sheet.webp` has no reader yet. `vfx.lob` would take a frame in place of
  the glow sprite and keep the arc it already flies.

## In the game

Three taps in the top-left corner, `M`, or `?panel`, then the `BOSS` group:
`boss.rake`, `boss.breath`, `boss.smash`, `boss.mend`, `boss.doom`,
`boss.doom.lethal`, `boss.obsidian`, `boss.erupt`, `boss.snap`. Over CDP it is
`__SIEGE__.states.run("boss.doom")`.

`boss.erupt` is the obsidian erupting out of the board, not the ERUPTION attack —
that one is `boss.smash` once the turn counter has reached 3.

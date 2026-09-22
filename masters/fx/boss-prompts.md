# KOLTMOS, beat by beat

Every effect the boss owns is light thrown on black, packed as a square additive
flipbook and drawn by `vfx.bossSwing`. That was not always true: the claw used to
be ink on a white page with its own matte, and the rest came from a video model.
Both doors are shut now — the beats are painted off the build's own FX masks, and
the section below says how. The prompt sheets further down are kept for the two
things they still explain: what each beat has to read as, and what a generated
take has to look like to be usable at all.

## How the beats are made now, September 22

Every boss attack draws one painted plate through `vfx.bossSwing`, and all of them
but the slam are painted by `tools/pack-boss-beat.mjs` off the Invokers build's own
FX masks. The geometry lives in one place, `BOSS_FX` in `src/config.js`, and
`Director.bossPlate` reads it: every size is a fraction of the **board**, not of the
stage, because a stage-wide plate on a phone stops being a shape and becomes a
contour drawn around the whole grid.

| beat | source mask | sheet |
| --- | --- | --- |
| CLAW RAKE | `T_FX_Mask_25_1_Slash` + `_26_1_Slash_Erosion` | `rake-sheet.webp` |
| LAVA BREATH | `T_FX_Fire_3_1_4x3` | `breath-sheet.webp` |
| MAGMA SLAM | `T_FX_Fire_9_1_2x6`, by `pack-slam.mjs` | `slam-sheet.webp` |
| ERUPTION | `T_FX_Smoke_4_1_4x4_A` | `erupt-sheet.webp` |
| CATACLYSM | `T_FX_Glow_Flash_11_2_4x4` | `doom-sheet.webp` |
| ENRAGE ROAR | `T_FX_Smoke_11_1_4x4` | `roar-sheet.webp` |

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

The rake has no flipbook behind it at all: the build ships one slash shape and an
erosion gradient beside it, and `--wipe` tears the gash open along that gradient
and burns it back down, which is how the build animates its own slashes. `--claw`
stamps three of them, the middle the longest.

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

Image-to-video was tried on the same still first — `gen-boss-fx.mjs --from
<image>` feeds it to Wan as the first frame. It holds the art for two frames and
then throws it away: by frame three the burst is a flat magenta flower with the
painting gone. A still with a synthesised beat keeps the artist's frame exactly;
the model cannot.

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

# Asset prompts

What generated the art in `src/source/`, and what to paste next time. Every
prompt here has been through the packers in `tools/` — the wording is shaped by
what those tools need, not just by what looks good in a preview.

## Model and settings

`black-forest-labs/flux-1.1-pro` on Replicate, one image per call:

```json
{
  "prompt": "<style block> + <asset block> + <technical block>",
  "aspect_ratio": "1:1",
  "output_format": "png",
  "output_quality": 100,
  "safety_tolerance": 2
}
```

Call them **one at a time** — firing three in parallel gets throttled and two of
the three come back as `Request was throttled`.

## The style block

Paste this into every prompt. It is the creative's own art direction, read off
the assets already in the build rather than invented: the arena is a gold-lit
sky castle, the boss is magma and black rock, the hero cards wear neon element
rims, and the board is obsidian and gold.

> painted 3D mobile-RPG game art, semi-realistic, rich and ornate, deep obsidian
> and midnight-navy surfaces with antique gold inlay, teal and violet gem
> accents, warm rim lighting, high contrast against a dark ground, no flat
> cartoon shading

## The technical block

Also paste every time, and change it only if you know which tool will eat the
result:

> centred, symmetrical, isolated on a plain flat white background, no text, no
> letters, no numbers, no watermark, no logo, no drop shadow

Each clause is load-bearing:

- **plain flat white background** — `tools/cut-bg.mjs` floods in from the border
  to cut the backdrop away. A gradient or a scene behind the subject survives
  that flood in patches and lands in the game as grey fog around the prop.
- **no drop shadow** — a shadow is opaque paint, not backdrop, so the flood
  keeps it. The board frame arrived with one and `pack-board.mjs` had to grow a
  pass that clears neutral grey to get rid of the band down two sides.
- **no text** — every label in this creative is live text in `config.js`, in the
  game's own fonts, at whatever size the layout works out. Baked-in lettering
  cannot be translated, resized, or read at 11 points.
- **centred, symmetrical** — the packers measure props by walking out from the
  centre. An off-centre subject measures as an off-centre opening.

## Per asset

### Board frame

The one in the build. Square, because the board is.

> **[style]** ornate fantasy game UI board frame, perfect square, border of
> carved dark obsidian stone with glowing cyan arcane runes and thin gold inlay
> along the edge, a cut teal gem set at each corner and at the middle of each
> side, rounded corners, the entire interior is flat empty near-black polished
> stone, absolutely nothing inside the frame **[technical]**

"absolutely nothing inside the frame" earns its place: the interior is where 25
gems get laid out, and anything painted in there fights them for attention and
gets partly covered anyway.

Then: `node tools/cut-bg.mjs src/source/board/frame.png --trim` →
`node tools/pack-board.mjs` (prints `FRAME_ART` and `FRAME_OPENING` for
`art/boardframe.js`).

### Hero bust

Six of these, one per element. Keep the framing identical across all six or the
row reads as six different games.

> **[style]** stylized fantasy mobile-RPG hero portrait, head and shoulders,
> centred square composition, a <male/female> <element> <class> with a clearly
> visible face, <hair>, glowing <colour> eyes, ornate <colour> and gold armour
> with <motif> etching, small floating <embers/frost motes/leaves>, deep
> <colour> background glow **[technical]**

The one thing to insist on is the face: the roster's fire hero arrived masked
and hooded, and next to five faces he read as the hero nobody had drawn.

Then: resize to 256x256 into `src/assets/heroes/<element>.png`. No packer — the
card cover-fits and clips it.

### Card rim

Six neon rims on one sheet, which is how the current set arrived.

> **[style]** six fantasy game UI card frames in a row on one sheet, each a
> perfect square with a thin luminous border and rounded corners, one per
> colour: grey, green, cyan, violet, orange, red, each with a soft outer glow in
> its own colour, the interior of every frame completely empty and transparent
> **[technical]**

Then: `node tools/slice-frames.mjs` (cuts the sheet on the solid border, keeps
each glow with its own frame) → `node tools/pack-frames.mjs` (rebuilds all six
on one grid so the card can ask by element and not care which it gets).

### Gem

One per element, and the colour matters more than the drawing: the element
colours drive the beams, the pop sparks and the hero cards, so a gem whose art
disagrees with its slot makes the whole board fire the wrong hue.

> **[style]** single fantasy match-3 game gem, flat round token, a <motif>
> symbol carved into a polished <colour> disc, thick soft outline, clean silhouette,
> read at thumbnail size **[technical]**

### CTA plate

> **[style]** fantasy game UI button plate, wide horizontal panel, gold bevelled
> rim over a deep red gem field, ornate corner filigree, the middle of the panel
> completely flat and empty for a label **[technical]**

The middle has to be flat because the plate is nine-sliced: whatever is painted
in the centre gets stretched from 4:1 to 9:1 between a phone held upright and
one held sideways.

### Arena

The one asset that is _not_ square: it is cover-fitted over the whole screen.

> **[style]** wide fantasy arena backdrop, distant gold-lit sky castle above a
> sea of cloud, warm sunset light, empty foreground floor for a boss to stand
> on, no characters, no text, painted concept art, 2:1 aspect

Then: `node tools/pack-arena.mjs` — read its header first, the crop is tuned so
the cloud line lands on the boss's floor.

## Animation

Nothing in the build is frame-animated. The boss is one still,
`src/assets/boss/magmaroth.webp`, and the six heroes are one each. Everything the
boss appears to do — rearing, slamming, opening its jaw, lighting up as the doom
clock fills — is a tween on the whole silhouette plus three additive glows pinned
to the places the render already burns. Everything a card appears to do —
lighting its rim on READY, lunging on `strike`, flinching on `hurt`, greying out
on `down` — is the same trick on a bust that never moves a muscle.

So "animate the characters" means one thing here: give each card a sheet, and let
`art/heroes.js` swap frames under the sprite it
already has. Everything below is written to that, because a clip that cannot be
cut into a registered grid is not an asset, it is a preview.

### The animation technical block

This one replaces the still block. Paste it into every animation prompt:

> locked-off static camera, no camera movement, no zoom, no pan, no dolly, no
> parallax, no rack focus; the character stays exactly centred at exactly the
> same scale for the whole clip and never leaves frame; the first and last frame
> are framed identically; nothing new enters the shot; plain flat white
> background, no background motion, no drop shadow, no text, no letters, no
> numbers, no watermark

Every clause is paying for something a packer would otherwise have to fix, and
`tools/pack-boss.mjs` is the receipt — read its header. The source it eats drifts
twenty pixels down the frame between neighbouring cells and changes size by five
percent, so the tool grew a registration pass that finds the golem's feet in
every frame and packs around them. That pass exists because nobody told the
generator to hold the camera still.

- **no camera movement / no zoom** — a sheet has one cell size. A frame the
  camera crept into is a frame at a different scale, and the whole sheet gets
  sized to the largest one, which makes every other frame small.
- **first and last framed identically** — idle is ping-ponged, so the sequence
  plays 0,1,2,3,4,3,2,1 forever. The two ends meet on every loop, and a seam
  there is a twitch once a second.
- **nothing new enters the shot** — the cell is a character, not a scene. A
  spark that flies in from the left is packed as part of the figure and widens
  every cell in the sheet.
- **plain flat white background** — `tools/cut-bg.mjs` still runs. A moving
  background is worse than a still one: the flood cuts it away unevenly frame to
  frame, and the sheet plays as a figure standing in flickering grey fog.

### Hero idle and cast

Six of these, and they start from the portrait that is already in the build
rather than from nothing: image-to-video on Replicate, seeded with
`src/assets/heroes/portrait-<element>.webp`.

That is the whole trick, and it is not a shortcut. Flux drew these six faces
once. Asked to draw the same face five more times it draws five more people —
and six cards in a row, each flickering into a stranger every idle loop, reads
worse than six stills do. Seeding from the existing portrait is the only route
that keeps a hero the same hero. It also keeps the six consistent with each
other for free, since they already are.

Model: Seedance, and the call, the inputs and the reason are their own section
below. Kling, Wan and Hailuo take the same shape if you would rather; Seedance
is the pick because it has a camera lock as an input rather than as a wish.
Whichever it is, ask for the shortest duration on offer: this needs about a
second of motion, and every frame past that is thrown away.

> **[style]** a fantasy RPG hero standing at attention in a card portrait,
> breathing slowly, <motion>, subtle idle animation, the pose barely changes,
> the face calm and still and always fully visible **[animation technical]**

`<motion>` per hero, and it is the element that moves, not the person — a bust
that shifts its weight is a bust whose head leaves the crop:

- **RICKLOW** (fire) — embers drifting up past the shoulders, the lava seams in
  the armour pulsing slowly brighter and dimmer
- **ARISSA** (water) — hair floating as if underwater, a slow ripple of light
  crossing the armour, frost motes drifting down
- **QUINNTO** (nature) — leaves turning past the shoulders, the green gem in the
  crown breathing light
- **SELISA** (lightning) — small arcs crawling over the armour, the hair lifting
  in a static charge, a flicker of light in the eyes
- **SILANTH** (arcane) — violet runes fading in and out around the head, hair
  moving in a slow current, the eyes glowing brighter and dimmer
- **TARANIS** (wind) — the white hair blown by a steady wind from one side, thin
  streaks of air passing behind the shoulders

For the cast pose, the same seed and the same technical block, and one line of
motion instead:

> **[style]** the hero raises one hand and casts <skill> — a burst of <colour>
> <element> energy gathering in the palm and flaring outward, the body turning
> no more than a few degrees, the head staying centred and the face staying
> visible **[animation technical]**

`<skill>` is the card's own: MAGMA LANCE, ABYSSAL TIDE, VERDANT WRATH, STORM
VERDICT, VOID ECLIPSE, CYCLONE EDGE — see `HEROES` in `config.js`.

"turning no more than a few degrees" is the load-bearing half of that. Every
image-to-video model will happily swing a character into a full attack stance,
and a card 56 points wide is cropped to head and shoulders: a hero who steps
into a lunge steps out of the frame, and the card plays half a shoulder.

Then: pull the frames — `ffmpeg -i clip.mp4 -vf fps=7 frame-%02d.png` — keep the
run where nothing drifts, lay them out one row per state with a clear gutter
between cells, and cut. `tools/pack-hero-portraits.mjs` is the reference for the
hero side and `tools/pack-boss.mjs` for the sheet side: the first knows the
card's framing, the second knows how to register a row of frames on one anchor.

### Boss

Not written down when it was made, so here it is. The one in the build came out
of a single still: twenty renders of the same golem laid out four rows by five
in one image, generated in one call rather than one per frame — which is what
holds the character together, the same way seeding does for the heroes.

> **[style]** a sprite sheet of one massive fantasy lava golem, black volcanic
> rock body with molten orange seams and a burning core in its chest, twenty
> poses of the same creature laid out in a strict grid of four rows by five
> columns, one pose per cell, a wide empty gutter between every row and every
> column, every figure the same size standing on the same baseline: row one an
> idle breathing cycle, row two the same idle continuing back to the start, row
> three gathering fire in both hands, row four the fire held overhead
> **[animation technical]**

Three clauses do the work here, and the sheet in the build is missing all three:

- **a wide empty gutter between every row and every column** — the packer finds
  frames by splitting on fully transparent rows and columns. The last row of the
  source has no gutter in it: the fire jet runs through three cells, they come
  back as one run instead of five, and those frames are the ones the tool skips.
  Eleven usable frames out of twenty is what that clause costs when it is
  missing.
- **every figure the same size on the same baseline** — see the registration
  pass above.
- **one pose per cell** — a cell with two figures in it packs as one wide frame.

Then: `node tools/cut-bg.mjs src/source/boss/animation.png` →
`node tools/pack-boss.mjs --contact`. The contact sheet is a flicker test: play
it and watch for the frame that jumps. Read that tool's header before changing
anything about the layout.

### Seedance

The model to run all of this on, and the reason is one input.

```json
{
  "prompt": "<style> + <motion> + <seedance technical>",
  "image": "<the frame it starts from>",
  "duration": 5,
  "resolution": "480p",
  "camera_fixed": true,
  "seed": 1
}
```

`bytedance/seedance-1-pro` on Replicate, image to video. `seedance-1-lite` takes
the same shape for less; iterate the wording on the lite one and spend the pro
call on the take you keep. Check the slug before pasting — video endpoints move.

Four of those inputs are the whole difference between a clip and an asset:

- **`camera_fixed: true`** — Seedance's own camera lock, and why it is the right
  model for a sprite sheet. Everything the block below has to beg for in words,
  this does in the API. Keep saying it in words as well: the flag holds the
  camera still, the words stop the model from _composing_ for a camera that
  would have moved. (Called natively it is a `--camerafixed true` suffix on the
  prompt text instead of an input.)
- **`image`** — the frame the clip starts on, and the reason a hero stays that
  hero. `src/assets/heroes/portrait-<element>.webp` for a card, one cut cell of
  `src/assets/boss/magmaroth-sheet.webp` for the golem.
- **`duration: 5`** — the shortest it offers, and about four seconds more than
  the game can use. See the extraction at the end.
- **`resolution: "480p"`** — a packed portrait is 160x328 and a boss cell is
  254x204. 1080p is four times the money for pixels the packer throws away.

**The Seedance technical block.** Paste into every prompt in this section:

> single continuous shot, one fixed camera, no cuts, no shot changes, no camera
> movement, no zoom, no push in, no orbit, no parallax; the subject stays
> centred at the same scale for the whole clip and never leaves frame; nothing
> new enters the shot; plain flat white background, the background never moves;
> no text, no numbers, no watermark

`no cuts, no shot changes` is the clause that is here and not in the general
block above, and it is the one Seedance specifically needs. It is a multi-shot
model: hand it a verb like "attacks" and it will cut to a reverse angle halfway
through, which to a packer is a second character in the same sheet.

**Do not ask for a loop.** The game ping-pongs — `art/boss.js` plays 0,1,2,3,4,
3,2,1 and back round — so what it needs is a run whose ends are _different_ and
which reads the same played backwards. Asking a video model for a seamless loop
gets you a clip that eases to a stop in the middle, which ping-ponged is a
character freezing twice a second.

### The six attacks

One per hero, seeded off that hero's own portrait, and the skill is the card's
own — see `HEROES` in `config.js`. Every one of these ends with the same two
clauses, because the card is cropped to head and shoulders and a hero who steps
into a lunge steps out of the frame:

> …, the head stays centred and the face stays fully visible, the body turning
> no more than a few degrees **[seedance technical]**

- **RICKLOW · fire · MAGMA LANCE** — **[style]** he raises one hand and a spear
  of molten rock forms in his grip, orange light running up the shaft, embers
  thrown off it, the lava seams in his armour flaring brighter
- **ARISSA · water · ABYSSAL TIDE** — **[style]** she lifts both hands and a
  curl of deep blue water rises past her shoulders, light rippling across her
  face and armour, frost motes drifting through it
- **QUINNTO · nature · VERDANT WRATH** — **[style]** thorned vines coil up
  around his shoulders and green light gathers in the gem of his crown, leaves
  torn loose and turning in the air
- **SELISA · lightning · STORM VERDICT** — **[style]** lightning gathers over
  her open palm and forks across her armour, her hair lifting in the charge, the
  light flickering in her eyes
- **SILANTH · arcane · VOID ECLIPSE** — **[style]** a ring of violet runes opens
  behind her head and dark light collapses inward through it, her hair moving in
  the pull
- **TARANIS · wind · CYCLONE EDGE** — **[style]** wind spirals up around him,
  his white hair and collar snapping to one side, pale streaks of air cutting
  past his shoulders

The healer is the one to watch in review. Arissa's tide is the only ultimate in
the game that is not damage — see `HEALER` — and every model reads "tide" as a
wave breaking _at_ the viewer, which is a wall of water over the face the card
is supposed to be showing.

### The boss's three swings

Seeded off a cut cell of the sheet, and every one of them carries one extra
clause that the heroes do not need:

> …, the golem's feet stay planted in the same spot and he never steps or
> leans out of frame **[seedance technical]**

`tools/pack-boss.mjs` registers every frame on the stance — the middle of the
dark rock at the sole — because feet are the one part of a standing golem that
means the same thing in every frame. A golem that takes a step is a golem the
packer will re-centre, and the swing will look like the camera moved.

- **Idle** — **[style]** the lava golem stands still and breathes, its chest
  core pulsing slowly brighter and dimmer, the molten seams across its rock
  plates rising and falling with it, small embers lifting off its shoulders
- **Charge** — **[style]** the golem raises both fists overhead and fire gathers
  between them, the chest core burning brighter as it draws in, the seams across
  its body running white hot
- **LAVA BREATH** — **[style]** the golem's jaw opens wide and a jet of fire
  pours straight forward out of its maw, the light of it throwing up across its
  own chest and arms
- **MAGMA SLAM** — **[style]** the golem lifts both fists high and drives them
  down in one heavy overhead slam, the impact throwing sparks and dust out to
  both sides
- **ERUPTION** — **[style]** the golem throws both arms wide and its chest core
  flares to white, fire bursting outward from every seam in its body at once

`ERUPTION` is the third swing and it does not exist until the boss's third turn
— see `BOSS_ATTACKS` — so it is the one to cut first if the budget is tight.

### From clip to sheet

```
ffmpeg -i clip.mp4 -ss 0 -t 1.2 -vf fps=7 frame-%02d.png
```

7 fps because that is `IDLE_FPS` in `art/boss.js`, and 1.2 seconds because that
is eight frames — more than either range in the sheet uses. Take them from the
front: identity and framing are at their best in the first second and drift from
there, which is the same reason the duration is set to the shortest on offer.

Then throw away every frame where anything moved that should not have, lay what
is left out as one row per state with a clear gutter between every cell, and run
`node tools/cut-bg.mjs <sheet>.png` → `node tools/pack-boss.mjs --contact`. The
contact sheet is the flicker test.

### What the game does not have yet

Worth knowing before spending on six heroes: nothing in the build can play a
hero animation. `HeroCard` holds one `Sprite` with one texture and never changes
it — the ready pulse, the strike lunge, the hurt flinch and the down tint are
all transforms and tints over a still. The boss can play frames, but its sheet
has exactly two ranges in it, `IDLE_LAST` and `CHARGE_FIRST`..`CHARGE_LAST`, and
its three swings are `swing` and `lunge` offsets rather than drawn frames.

So each of these lands as art plus code: a range table and a `play(state)` on
the boss, and on the hero side the frame machinery that card has never had.

### What a sheet costs

Worth knowing before generating six of them. The six stills are 8–12 kB each,
61 kB the lot, and the bundle is currently 1.75 MB inlined in one file. Five
frames a hero is roughly 300 kB on top — which clears Google's and Unity's 5 MB
but puts the creative over Meta's 2 MB. Two idle frames and one cast frame per
hero is about 110 kB and still reads as animation at 7 fps; the boss is proof
that a short ping-ponged loop is enough.

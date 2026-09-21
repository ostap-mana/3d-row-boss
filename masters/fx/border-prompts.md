# The ult frame, painted on black

The frame is not art on a card, it is light added on top of the game. Both sheets
are drawn with `blendMode: "add"`, around the hero card in `src/art/heroes.js` and
around the whole screen in `src/fx/ultrim.js`. Under that blend every black pixel
is invisible and every grey pixel is a grey film laid over the hero. So the take
has to be genuinely black where the hero stands and lit only along the four edges.

The shape is set by what already ships: `tools/gen-ult-vfx.mjs` draws a cell 216
wide by 344 tall with the card at 128x256 in the middle of it. That is a **thin**
rail — the line is 7px of 216, a thirtieth of the frame width — hugging a hole
that is 59% of the frame wide and 74% of it tall, with the colour dying out about
a fifth of the frame width outside the rail. Anything fatter than that stops being
this game's frame and becomes a bonfire with a hole in it.

Prompt = STYLE + FRAME LOCK + MOTION + the element's own paragraph, and SLAM in
place of MOTION for the burst take. Negative prompt below.

## Reference image

Seedance, Veo and Sora all take a reference still. Feed
`masters/fx/border-ref/fire-target.png` (or `arcane-target.png`) — those are single
cells lifted straight out of the shipped sheets, so they are the target exactly:
thin rail, tight falloff, big black hole.

Do not hand the model a screenshot of the running game as the style reference. It
reads the gem board and the hero cards as things to draw and starts painting
interface into the frame. The screenshot is for judging the result, not for
conditioning it.

## FRAME LOCK

```
Portrait 9:16, locked-off static camera, no camera move, no zoom, no pan, no
parallax. Pure black everywhere except one thin rectangular rail of light standing
upright in the middle of the frame, corners rounded on a small radius. The rail is
thin: about a thirtieth of the frame width, a hairline against the whole picture,
the same thickness the whole way round. It encloses a large empty hole of pure
black, about 68% of the frame width and 76% of the frame height, twice as tall as
it is wide, and nothing crosses that hole: no light, no spark, no haze, no smoke,
no glow, nothing. Outside the rail the colour falls off fast and is fully black
within about a tenth of the frame width, so the outer edge of the picture is pure
black on all four sides. The four sides are equally bright, they read as one
continuous closed rectangle, the corners join and never break, no side goes dark.
```

## STYLE

```
stylized mobile-RPG game VFX, an additive particle spell effect rendered over a
black screen, not photographic and not filmed: a blinding near-white core running
down the middle of the rail with saturated colour blooming only a short distance
off it, small sharp licks and sparks of element matter breaking off the rail in a
few places rather than evenly along all of it, deep black between them, crisp hard
edges, high contrast, no soft cinematic haze, no thick wall of flame, no smoke, no
depth of field
```

## MOTION

The take is resampled to twelve frames and played forward and then backwards, so a
one-way march around the rectangle reverses on screen and reads as a mistake.

```
The light churns and breathes in place along the rail: it flickers fast, the core
brightens and dims, the licks swell and die where they stand. The rail itself never
moves, never grows thicker, never drifts. Nothing travels one way around the
rectangle, nothing crosses the frame, nothing enters or leaves the shot. Fast crisp
flicker that looks the same played backwards.
```

## RICKLOW — FIRE

`#ff5a1f` orange, `#a81200` deep ember, `#ffc08a` pale heat

```
The rail is a thin line of white-hot fire: a near-white core with orange flame
clinging tight to it, a few short tongues of flame licking outward into the black
and dying within a finger's width of the rail, small embers breaking off at the
corners. A narrow deep ember-red falloff just outside the line and black beyond it.
Every flame leans outward; nothing burns inward across the hole.
```

## ARISSA — WATER

`#2fa8ff` azure, `#0b4d85` deep blue, `#b6e4ff` pale ice

```
The rail is a thin line of running azure water: a core lit white from inside with
ribbons of water twisting tight along it, a few short bursts of pale ice-blue foam
tearing outward into the black, small droplets flicking off at the corners. A
narrow deep blue falloff just outside the line and black beyond it. Everything is
thrown outward; nothing splashes inward across the hole.
```

## QUINNTO — NATURE

`#3fd16a` emerald, `#14663a` deep green, `#b6f5c9` pale leaf

```
The rail is a thin line of living emerald growth: a white-hot core with fine vines
and tendrils coiling tight along it, a few short shoots and leaves reaching outward
into the black, small glowing spores breaking off at the corners. A narrow deep
green falloff just outside the line and black beyond it. The growth runs along the
rail; nothing grows inward across the hole.
```

## SELISA — LIGHTNING

`#ffd22e` gold, `#8a6a00` deep amber, `#fff2a8` pale gold

```
The rail is a thin live wire of gold-white current: a white-hot channel with fine
forked arcs snapping off it outward into the black and gone in an instant, sparks
scattering at the corners, the whole line stuttering brighter and darker. A narrow
deep amber falloff just outside the line and black beyond it. No arc ever jumps
across the hole.
```

## SILANTH — ARCANE

`#a855f7` violet, `#4c1d95` deep indigo, `#e6c9ff` pale lilac

```
The rail is a thin line of violet arcane power: a blinding white core wound about
with fine magenta filaments that tighten and flare where they cross, pale lilac
motes drifting off it a short way into the black. A narrow deep indigo falloff just
outside the line and black beyond it. The power winds along the rail; nothing
collapses inward through the hole.
```

## TARANIS — WIND

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
The rail is a thin line of cutting air: hard bright edges of wind racing along it
and crossing each other, near-white where they cross, fine pale teal motes and
vapour streaming off a short way outward into the black. A narrow deep teal falloff
just outside the line and black beyond it. Every blade sweeps outward; nothing cuts
inward across the hole.
```

## SLAM

The burst take. Use it in place of MOTION, with the element's own matter in place
of `<matter>`: embers for fire, spray for water, leaves and spores for nature,
sparks for lightning, motes for arcane, torn air for wind.

```
One hit on one beat. The frame starts completely black and empty; the rail
detonates into existence along its whole length at once, every side lighting in the
same instant, the core flaring white and the line swelling to two or three times
its thickness, <matter> thrown outward off it into the black and a hard short bloom
of colour thrown out with it. It keeps building to the end: the clip ends at its
very brightest, do not fade it out and do not let it fall back. The rail stays a
rail even at the peak — it never becomes a wall — nothing is thrown inward, and the
hole stays pure black throughout.
```

## NEGATIVE

```
thick wall of fire, wide band, fat frame, huge glow, soft bloom filling the frame,
orange haze, photorealistic, photographic, filmed footage, stock footage,
cinematic, slow motion, bonfire, campfire, torch, burning building, smoke, fog,
mist, haze, embers filling the whole frame, light in the middle, glow across the
centre, anything inside the rectangle, text, letters, numbers, runes, symbols,
watermark, logo, signature, ui, hud, button, panel, card, gem, icon, picture frame,
photo frame, ornate carved frame, gold moulding, metal, jewellery, gemstone,
engraving, glass, mirror, neon sign, person, face, character, creature, hands,
animal, scenery, landscape, horizon, room, floor, sky, vignette, dark side, one
bright corner, gradient background, white background, grey background, camera
movement, zoom, pan, dolly, shake, blurry, low contrast, washed out, dim, static,
frozen, second rectangle, double frame, frame inside a frame, broken corner
```

## One block, ready to paste — FIRE loop

```
Stylized mobile-RPG game VFX, an additive particle spell effect rendered over a black screen, not photographic and not filmed footage. Portrait 9:16, locked-off static camera, no camera move, no zoom, no pan. Pure black everywhere except one thin rectangular rail of white-hot fire standing upright in the middle of the frame, corners rounded on a small radius. The rail is thin: about a thirtieth of the frame width, a hairline against the whole picture, the same thickness the whole way round. It encloses a large empty hole of pure black, about 68% of the frame width and 76% of the frame height, twice as tall as it is wide, and nothing crosses that hole: no light, no spark, no haze, no smoke, no glow, nothing. Outside the rail the colour falls off fast and is fully black within about a tenth of the frame width, so the outer edge of the picture is pure black on all four sides. The line itself is a near-white core with orange flame clinging tight to it, a few short tongues of flame licking outward into the black and dying within a finger's width of the line, small embers breaking off at the corners, a narrow deep ember-red falloff just outside it and black beyond. The four sides are equally bright, they read as one continuous closed rectangle, the corners join and never break, no side goes dark. The fire churns and breathes in place: it flickers fast, the core brightens and dims, the licks swell and die where they stand. The rail never moves, never grows thicker, never drifts; nothing travels one way around the rectangle, nothing crosses the frame, nothing enters or leaves. Fast crisp flicker that looks the same played backwards. No thick wall of fire, no wide band, no huge glow, no soft bloom, no orange haze, no smoke, no photorealism, no cinematic slow motion, no text, no letters, no numbers, no watermark, no logo, no interface, no picture frame, no metal, no glass, no person, no creature, no scenery, no vignette, no glow in the middle.
```

## One block, ready to paste — FIRE slam

```
Stylized mobile-RPG game VFX, an additive particle spell effect rendered over a black screen, not photographic and not filmed footage. Portrait 9:16, locked-off static camera, no camera move, no zoom, no pan. The frame starts completely black and empty. A thin rectangular rail of white-hot fire detonates into existence in the middle of the frame, every side lighting in the same instant, corners rounded on a small radius. It encloses a large empty hole of pure black, about 68% of the frame width and 76% of the frame height, twice as tall as it is wide, and nothing ever crosses that hole. The core flares white and the line swells to two or three times its thickness, embers and short tongues of flame thrown outward off it into the black with a hard bloom of orange, deep ember-red falloff just outside the line and pure black at the outer edge of the picture on all four sides. It keeps building to the end: the clip ends at its very brightest, no fade out, no falling back. The rail stays a thin rail even at the peak, it never becomes a wall of fire, nothing is thrown inward, the hole stays pure black throughout. No thick wall of fire, no wide band, no huge glow, no soft bloom, no orange haze, no smoke, no photorealism, no cinematic slow motion, no text, no letters, no numbers, no watermark, no logo, no interface, no picture frame, no metal, no glass, no person, no creature, no scenery, no vignette, no glow in the middle.
```

## Settings

- Seedance, Veo through Gemini, Sora through GPT: portrait 9:16, 5 s, 24 fps,
  fixed camera, no audio, one take per element per style. These models follow
  object nouns, so embers, droplets, leaves, sparks and motes are safe here. Wan
  is not: on the local rig ask only for streaks, ribbons, arcs and edges of light.
- Judge a take by covering its middle 70% with a black card. If anything shows
  there, the take is unusable however good the rail looks. Then check the outer
  tenth of the frame is black — on add blend a soft bloom out there becomes a grey
  box over the arena.
- Onto the shelf and into the sheet:

```
mkdir -p src/animation/style-border/fire/fire-v1
ffmpeg -y -i take.mp4 -vf "fps=12,scale=384:-2" src/animation/style-border/fire/fire-v1/f%02d.png
node tools/pack-ult-borders.mjs --proof fire=1
```

- The packer prints the cell size and the measured padX/padY it wants. Paste both
  into the `border` row of `SHAPES` in `src/art/ultborder.js`. `shapeOf` matches on
  exact pixels: get the cell wrong and the sheet loads as nothing, with no error in
  the console.
- What ships today is not from this route. `tools/gen-ult-vfx.mjs` draws the rail
  procedurally, 18 cells of 216x344 cut down to 134x214 by `tools/slim-assets.mjs`,
  cycling at 10 fps. A generated take goes through `pack-ult-borders.mjs` instead:
  12 cells, played forward and back at 7 fps under `ULT_RIM` in `src/config.js`.
- The slam is packed off the flare shelf:
  `src/animation/style-flare/<element>/<element>-v12`, then
  `node tools/pack-ult-borders.mjs --flare --burst fire=12`. The packer builds the
  fall by rewinding the take, which is why the take has to end on its peak.

## On the game frame

Nano Banana Pro holds this game's look best when it paints onto a screenshot
instead of into empty black, the same way `attack-prompts.md` works. Feed the
screenshot as image 1 and ask for the rail added to it, nothing else touched.

```
This is a screenshot of the running game. Everything already in it stays exactly as it is: the same boss, the same six hero cards, the same gem board, the same health bar, the same numbers and words, the same camera and framing. Do not redraw, move, resize, recolour, restyle or replace anything, do not add a character, a creature, a prop or any writing, and do not change a single number or letter.

Add one thing only: a thin glowing rectangular rail of white-hot fire running around the inside edge of the screen, following the screen's own rectangle, inset a little from the edges, corners rounded on a small radius. The line is thin — about a thirtieth of the screen width, a hairline against the whole picture — and the same thickness the whole way round, a near-white core with orange flame clinging tight to it, a few short tongues licking off it and small embers at the corners. Its glow spills a short way inward and throws warm orange light across the boss, the hero cards and the top of the gem board, then dies well before the middle of the picture. The centre of the screen stays exactly as bright and as clear as it already is, the four sides of the rail are equally bright, the corners join and never break.

Stylized game spell VFX, additive light laid over the picture, high contrast, not photographic, no thick wall of flame, no wide band, no smoke, no haze, no fog over the screen, no vignette, no added text, no added interface.
```

For the card version, swap the second paragraph's first sentence for: `a thin
glowing rectangular rail of white-hot fire hugging the border of the leftmost hero
card at the bottom, sized to that card and following its rounded corners`.

A painted-over screenshot is for judging the look, not for shipping — the sheet
needs the light alone on black. Since the effect is added light, subtracting the
original screenshot gives exactly that plate:

```
ffmpeg -y -i painted.png -i screenshot.png -filter_complex "[0][1]blend=all_mode=subtract" plate.png
```

That subtraction is exact and it registers pixel for pixel. Asking the model to
lift the rail off the screenshot instead is quicker but it repaints rather than
isolates, so the brightness and the line weight drift a little:

```
Keep the burning rectangular frame in this image exactly as it is: the same rectangle in the same place at the same size, the same line thickness, the same rounded corners, the same flames and embers, the same colours and the same brightness. Delete everything else in the picture — the boss, the sky, the arena, the gem board, the hero cards, the portraits, the health bar, every number and every word — and put pure black in its place.

The result is the burning frame alone on a pure black background, in exactly the same position and scale as it is here so the two pictures line up. Inside the frame is a large empty hole of pure black with absolutely nothing in it. Outside the frame is pure black too, out to all four edges of the picture; keep only the frame's own narrow falloff on the black immediately around the line, and none of the light it was throwing onto the scene. No background, no scenery, no interface, no text, no numbers, no character, no transparency checkerboard, nothing but the burning rectangle and its own glow on black.
```

## Seedance

Seedance takes a short prompt and its own flags, and it has no negative field, so
the long NEGATIVE block above is for Veo and Sora. Here only a handful of "no"
terms survive; past a hundred words or so Seedance starts dropping the geometry.

In a Reference node the attached picture is style only. Say so in the prompt, or
it copies the gem board and the hero cards into the shot.

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of white-hot fire in the centre of a pure black screen, tall rectangle with slightly rounded corners, the line as thin as a neon filament, a wide empty black hole inside it, orange flame clinging tight to the line, tiny embers flicking off the corners, a narrow ember-red falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, hot spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no smoke, no haze, no text, no interface. Fixed camera, static shot. --rt 9:16 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

Swap the two material clauses for the element, keep everything else:

- water: `running azure water twisting tight along the line, pale ice-blue foam
  bursting off it, droplets flicking off the corners, a narrow deep blue falloff`
- nature: `fine emerald vines coiling tight along the line, short shoots and small
  leaves reaching off it, glowing spores at the corners, a narrow deep green
  falloff`
- lightning: `gold-white current running the line, fine forked arcs snapping off
  it and gone in an instant, sparks scattering at the corners, a narrow deep amber
  falloff`
- arcane: `fine magenta filaments winding tight along the line and flaring where
  they cross, pale lilac motes drifting off it, a narrow deep indigo falloff`
- wind: `hard bright edges of pale teal air racing along the line and crossing
  each other, fine motes and vapour streaming off it, a narrow deep teal falloff`

### The five that are left

`masters/fx/fire-border.mp4` is the take that shipped: 1280x720, the rectangle
near-square in the middle of the frame, black inside and out. Ask for the other
five in the same framing and `tools/pack-ult-borders.mjs` takes them through the
same crop (`crop=770:700:256:10`). The black around the line matters more than
anything else in the shot — a soft wide glow there turns into an orange fog over
the card and has to be crushed afterwards.

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of azure water in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, ribbons of water twisting tight along the line, pale ice-blue foam and droplets flicking off the corners, a narrow deep blue falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no mist, no text, no interface. Fixed camera, static shot. --rt 16:9 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of living emerald growth in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, fine vines and tendrils coiling tight along the line, short shoots and small leaves reaching off it, glowing spores at the corners, a narrow deep green falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no smoke, no text, no interface. Fixed camera, static shot. --rt 16:9 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of gold-white electric current in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, fine forked arcs snapping off the line and gone in an instant, sparks scattering at the corners, the whole line stuttering brighter and darker, a narrow deep amber falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and crackles in place, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no smoke, no text, no interface. Fixed camera, static shot. --rt 16:9 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of violet arcane power in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, fine magenta filaments winding tight along the line and flaring where they cross, pale lilac motes drifting off it, a narrow deep indigo falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no runes, no symbols, no text, no interface. Fixed camera, static shot. --rt 16:9 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of cutting pale teal air in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, hard bright edges of wind racing along the line and crossing each other, near-white where they cross, fine motes and vapour streaming off it, a narrow deep teal falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no fog, no text, no interface. Fixed camera, static shot. --rt 16:9 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

For the slam, replace the motion sentence with: `The frame starts black and empty,
then detonates into existence all at once, the line flaring white and swelling,
embers thrown outward, and the clip ends at its brightest with no fade out.`


### Four that are not in the game

Light, dark, earth and air are not elements the fight knows — there is no hero, no
palette and no gem behind them. The prompts are here in the same framing as the
five above so a take drops into `pack-ult-borders.mjs` unchanged. No flags on
these: set 16:9, 5 s, 24 fps, fixed camera and no audio in the interface instead.

Air is Taranis's wind take, kept here under the name that was asked for.

Dark and earth are the two that fight the add blend. Black smoke and dark rock are
invisible under it, so the only thing that survives is the lit edge and the lit
seam — ask for the shadow to eat the line, not to sit beside it, and expect to
raise the black point on both plates.

`#fff4cf` near-white, `#ffcf5a` warm gold, `#7a5a12` deep amber

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of white-gold holy light in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, a blinding white core running down the line with fine straight needles of golden radiance standing off it a short way, small bright motes lifting off the corners, a narrow deep amber falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and breathes in place, the core swelling and settling, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no god rays, no lens flare, no halo, no haze, no text, no interface. Fixed camera, static shot.
```

`#d8c2ff` pale rim, `#4c0f6b` void purple, `#1a0424` blackened violet

```
Reference image is style only, copy nothing from it. A thin rectangular frame of black fire in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, the line lit only along its edge with a cold pale-violet rim, ragged black tongues tearing off it outward and swallowing the light where they cross it, small violet motes flicking off the corners, a narrow deep indigo falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and seethes in place, the rim guttering brighter and darker as the black eats it, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no smoke, no fog, no mist, no skulls, no runes, no text, no interface. Fixed camera, static shot.
```

`#ffb454` molten amber, `#5a3312` deep brown, `#ffd9a0` pale dust

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of cracked stone in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, the line a seam of molten amber light splitting dark rock, small sharp chips and shards of stone breaking off it outward, fine dust and grit flicking off the corners, a narrow deep brown falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and grinds in place, the cracks widening and closing, bright spots pulsing along the seam, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no dust cloud, no haze, no smoke, no text, no interface. Fixed camera, static shot.
```

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
Reference image is style only, copy nothing from it. A thin glowing rectangular frame of cutting pale teal air in the centre of a pure black screen, the line as thin as a neon filament, a wide empty black hole inside it, hard bright edges of wind racing along the line and crossing each other, near-white where they cross, fine motes and vapour streaming off it, a narrow deep teal falloff fading to pure black well before the edges of the screen. The frame stays perfectly still and flickers in place, fast shimmering light, bright spots pulsing along the line, nothing at all inside the black hole. Stylized mobile game spell VFX, additive glow on black, high contrast, no wide soft glow, no haze, no fog, no text, no interface. Fixed camera, static shot.
```

The slam swap for these four, in place of the motion sentence, with `<matter>` as
motes for light, shadow for dark, shards and dust for earth, torn air for air:
`The frame starts black and empty, then detonates into existence all at once, the
line flaring white and swelling, <matter> thrown outward, and the clip ends at its
brightest with no fade out.`

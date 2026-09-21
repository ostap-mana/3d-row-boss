# The ult frame, painted on black

The frame is not art on a card, it is light added on top of the game. Both sheets
are drawn with `blendMode: "add"`, around the hero card in `src/art/heroes.js` and
around the whole screen in `src/fx/ultrim.js`. Under that blend every black pixel
is invisible and every grey pixel is a grey film laid over the hero. So the take
has to be genuinely black where the hero stands and lit only along the four edges:
the hole in the middle is the character, and anything drawn in it ends up on his
face.

Two takes per element: the loop, shipped as `src/assets/cards/ult-<element>.webp`,
and the slam, shipped as `ult-burst-<element>.webp`. Both are 6x2 sheets of 12
cells cut by `tools/pack-ult-borders.mjs`.

Prompt = STYLE + FRAME LOCK + MOTION + the element's own paragraph, and SLAM in
place of MOTION for the burst take. Negative prompt below.

## FRAME LOCK

```
Portrait 9:16, locked-off static camera, no camera move, no zoom, no pan, no
parallax. Pure black everywhere except one hollow upright rectangle of light
standing in the middle of the frame, corners slightly rounded. Its outer edge
reaches about 80% of the frame width and 88% of the frame height, so a black
margin about a tenth of the width wide runs down both sides and across the top and
bottom, and nothing ever touches the outer edge of the frame. The inside of the
rectangle is a large empty hole of pure black, about 70% of the frame width and
82% of its height, and nothing crosses it: no light, no spark, no haze, no smoke,
no glow, no reflection, nothing. All of the light lives on the band itself and in
the black just outside it. The four sides are equally bright, the two long sides
and the two short sides read as one continuous closed rectangle, the corners join
and never break, and no side and no corner goes dark.
```

## STYLE

```
painted 3D mobile-RPG game VFX, semi-realistic, high contrast, a blinding
white-hot core running the length of the band with saturated colour blooming off
it into the black, the band is painted moving matter with visible texture and torn
edges, not a smooth even neon tube and not a drawn interface line, deep black
between every strand, no flat cartoon shading, no outlines, no metal, no glass, no
carved moulding
```

## MOTION

The sheet is twelve frames played forward and then backwards at 7 fps, so a
one-way march around the rectangle reverses on screen and reads as a mistake.

```
The light churns and breathes in place along the band: it flickers, thickens and
thins, hot spots swell and die where they stand, the outer edge tears and reforms.
Nothing travels one way around the rectangle, nothing drifts across the frame,
nothing enters or leaves the shot. Fast, violent, restless motion that looks the
same played backwards.
```

## RICKLOW — FIRE

`#ff5a1f` orange, `#a81200` deep ember, `#ffc08a` pale heat

```
The band is a rail of burning fire: a white-hot core running the whole rectangle
with orange flame peeling off it outward into the black, tongues of flame licking
away from the hole, embers and cinders breaking off the corners and dying in the
margin. Deep ember-red light pools in the black just outside the band. Every
flame leans outward; nothing burns inward across the hole.
```

## ARISSA — WATER

`#2fa8ff` azure, `#0b4d85` deep blue, `#b6e4ff` pale ice

```
The band is a rail of fast azure water: a core lit white from inside with ribbons
of water twisting along it, pale ice-blue foam tearing off outward into the black,
droplets and spray flicking away from the hole and vanishing in the margin. Deep
blue light glows in the black just outside the band. Everything is thrown outward;
nothing splashes inward across the hole.
```

## QUINNTO — NATURE

`#3fd16a` emerald, `#14663a` deep green, `#b6f5c9` pale leaf

```
The band is a braid of living emerald growth: vines and tendrils coiling along the
rectangle, white-hot along their spines, torn leaves and glowing spores breaking
off outward into the black. Deep green light pools in the black just outside the
band. The growth crawls along the band and reaches outward; nothing grows inward
across the hole.
```

## SELISA — LIGHTNING

`#ffd22e` gold, `#8a6a00` deep amber, `#fff2a8` pale gold

```
The band is a live rail of gold-white current: a white-hot channel running the
whole rectangle with hard forked arcs snapping off it outward into the black,
sparks scattering away from the hole, the whole band stuttering brighter and
darker. Pale gold afterimages burn for an instant where an arc just was. No arc
ever jumps across the hole.
```

## SILANTH — ARCANE

`#a855f7` violet, `#4c1d95` deep indigo, `#e6c9ff` pale lilac

```
The band is a rail of violet arcane power: a blinding white core wound about with
coiling magenta filaments that tighten and flare where they cross, pale lilac
motes and sparks drifting off it outward into the black. Deep indigo light pools
in the black just outside the band. The power winds along the band; nothing
collapses inward through the hole.
```

## TARANIS — WIND

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
The band is a rail of cutting air: thin hard bright edges of wind racing along the
rectangle and crossing each other, near-white where they cross, pale teal vapour
and fine motes streaming off outward into the black. Deep teal light glows in the
black just outside the band. Every blade of air sweeps outward; nothing cuts
inward across the hole.
```

## SLAM

The burst take. Use it in place of MOTION, with the element's own matter in place
of `<matter>`: embers for fire, spray for water, leaves and spores for nature,
sparks for lightning, motes for arcane, torn air for wind.

```
One hit on one beat. The frame starts completely black and empty; the rectangle
detonates into existence along its whole length at once, every side lighting in
the same instant, the band flaring white-hot and swelling to several times its
thickness, <matter> thrown outward off it into the black margin and a hard bloom
of colour thrown out with it. It keeps building to the end: the clip ends at its
very brightest, do not fade it out and do not let it fall back. Nothing is thrown
inward across the black hole, and even at the peak the hole stays pure black.
```

## NEGATIVE

```
text, letters, numbers, runes, symbols, watermark, logo, signature, ui, hud,
button, panel, card, picture frame, photo frame, ornate carved frame, gold
moulding, metal, jewellery, gemstone, engraving, glass, mirror, neon sign, neon
tube, person, face, character, creature, hands, animal, scenery, landscape,
horizon, room, floor, sky, light in the middle, glow across the centre, anything
inside the rectangle, haze, fog, smoke, mist, bloom over the whole frame, grey
wash, vignette, dark side, one bright corner, gradient background, white
background, grey background, camera movement, zoom, pan, dolly, shake, blurry, low
contrast, washed out, dim, static, still, frozen, cut, crop, second rectangle,
double frame, frame inside a frame, broken corner, open corner
```

## One block, ready to paste — FIRE loop

```
Painted 3D mobile-RPG game VFX, semi-realistic, high contrast. Portrait 9:16,
locked-off static camera, no camera move, no zoom, no pan. Pure black everywhere
except one hollow upright rectangle of burning fire standing in the middle of the
frame, corners slightly rounded, its outer edge about 80% of the frame width and
88% of the frame height, a black margin about a tenth of the width down both sides
and across the top and bottom, nothing touching the outer edge of the frame. The
inside of the rectangle is a large empty hole of pure black, about 70% of the
frame width and 82% of its height, and nothing crosses it: no light, no spark, no
haze, no smoke, no glow, nothing. The band itself is a rail of fire: a blinding
white-hot core running the whole rectangle with orange flame peeling off it
outward into the black, tongues of flame licking away from the hole, embers and
cinders breaking off the corners and dying in the margin, deep ember-red light
pooling in the black just outside the band. Painted moving matter with visible
texture and torn edges, not a smooth neon tube and not a drawn interface line,
deep black between every strand. The four sides are equally bright, the corners
join and never break, no side goes dark. The fire churns and breathes in place:
it flickers, thickens and thins, hot spots swell and die where they stand, the
outer edge tears and reforms. Nothing travels one way around the rectangle,
nothing drifts across the frame, nothing enters or leaves the shot. Fast, violent,
restless motion that looks the same played backwards. No text, no letters, no
numbers, no watermark, no logo, no interface, no picture frame, no metal, no
glass, no person, no creature, no scenery, no haze, no fog, no smoke, no vignette,
no glow in the middle.
```

## Settings

- Seedance, Veo through Gemini, Sora through GPT: portrait 9:16, 5 s, 24 fps,
  fixed camera, no audio, one take per element per style. These models follow
  object nouns, so embers, droplets, leaves, sparks and motes are safe here. Wan
  is not: on the local rig ask only for streaks, ribbons, arcs and edges of light.
- Judge a take with its middle 70% covered by a black card. If anything shows
  there, the take is unusable however good the band looks.
- Grey is the other failure. On add blend a soft bloom filling the margin becomes
  a grey box over the arena. The black around the band has to stay black.
- Onto the shelf and into the sheet:

```
mkdir -p src/animation/style-border/fire/fire-v1
ffmpeg -y -i take.mp4 -vf "fps=12,scale=384:-2" src/animation/style-border/fire/fire-v1/f%02d.png
node tools/pack-ult-borders.mjs --proof fire=1
```

- The packer prints the cell size and the measured padX/padY it wants. Paste both
  into the `border` row of `SHAPES` in `src/art/ultborder.js`. A 9:16 take gives
  cell 176x313, not the 176x315 that ships now, and `shapeOf` matches on exact
  pixels: get it wrong and the sheet loads as nothing, with no error in the
  console.
- The slam is packed off the flare shelf:
  `src/animation/style-flare/<element>/<element>-v12`, then
  `node tools/pack-ult-borders.mjs --flare --burst fire=12`. The packer builds the
  fall by rewinding the take, which is why the take has to end on its peak.
- The loop plays 12 frames forward and back at 7 fps, a 3.1 s round trip, under
  `ULT_RIM` in `src/config.js`. The slam runs over `ULT_RIM.burstDur`, 0.9 s.
- The old takes were deleted in `5b2b0c2`. To compare a new one against them:
  `git checkout 5b2b0c2^ -- src/animation/style-border`.

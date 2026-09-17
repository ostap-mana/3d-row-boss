# Element bolt prompts — one lance, six elements

The reference is the frame that came off `src/source/fx/clips/water-bolt.mp4`:
one cyan lance flying flat across a chroma-green frame, white-hot head at the
left, tail streaming off the right edge. Everything below is that same shot,
said six times with nothing changed but the material and the three hexes.

The hexes are not invented. They are `GEM_COLORS`, `GEM_LIGHT` and `GEM_DARK`
from `src/config.js`, in that order — the same numbers the board gems, the pop
sparks, the hint glow and the hero card rims already run on. A bolt painted any
other blue arrives on screen as a seventh element.

## Model and settings

Same as `tools/gen-spells.mjs`, and the same square frame the packers expect:

```
aspect_ratio  1:1
duration      5s
fps           24
camera_fixed  true
resolution    480p or better
```

One prompt is always **STYLE + SHAPE + ELEMENT + BACKDROP + TECHNICAL**, pasted
in that order as one paragraph.

## STYLE — paste every time

> painted 3D mobile-RPG game VFX, semi-realistic, high contrast, a bright
> white-hot core with saturated colour thrown off it, no flat cartoon shading,
> no anime line art, no pixel art

## SHAPE A — the lance in flight (cells 0..4)

> A single lance of energy flies flat across the frame, its pointed head leading
> at the left and a long tapered tail streaming off the right edge, about four
> times longer than it is tall. The head is a white-hot teardrop with a fan of
> sharp shards breaking off its point. The body behind it is layered along its
> whole length: a pale glowing core stripe down the middle, a saturated sheath
> around that, and a darker outer sheath whose edges are torn into thin licking
> tongues rather than drawn as a smooth stripe. Small chips and flecks of the
> same material break off the outline and fall away behind it. The lance holds
> its shape and its place in the frame for the whole clip, brightening and
> rippling along its length as it flies. It never bends, never curves, never
> splits in two, never leaves the frame, never hits anything and never explodes.

## SHAPE B — the same bolt landing (cells 5..9)

Needed as a second clip, because `tools/pack-water-ult.mjs` cuts the two halves
of a sheet from two different clips — a flight loop has no impact in it.

> The same lance arrives at the centre of the frame and bursts open there into a
> wide symmetrical crown thrown outward in every direction, a white-hot flash at
> its middle, torn petals and shards of the same material flung out from it and
> slowing as they go, the light draining out of them from the tips inward until
> the frame is empty again. One burst only, on one beat, centred, finished well
> before the clip ends: no second detonation, no repeat, no shockwave ring
> travelling off afterwards.

## BACKDROP — pick one, and read the warning

**Black (default).** The sheets play on the `add` blend, where black already is
transparency, so nothing has to be keyed:

> The effect is alone on a pure black background, nothing else in frame, and the
> black stays black everywhere the effect does not touch.

**Chroma green** (what the water clips used — only if you want the painterly
soft edges a key preserves):

> The effect is alone on a flat, evenly lit chroma-key green backdrop, the same
> solid green edge to edge, nothing else in frame. The green is never lit by the
> effect, it does not brighten, flicker or shift colour anywhere, and no green
> spills onto the effect.

**Never put NATURE on green.** The key in `src/fx/chromakey.js` and in
`pack-water-ult.mjs` measures a pixel's green over its own red and blue.
`#3FD16A` measures 103 levels of that — five times past the `--ramp`, so the
whole bolt is cut away as backdrop. WIND `#8CEEE2` measures 12, which lands
inside the ramp and comes back half eaten. Both go on black.

## TECHNICAL — paste every time

> The effect stays centred in frame the whole time. Single continuous shot, one
> fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push
> in, no orbit, no parallax. No floor, no room, no landscape, no character, no
> hands, no weapon. No smoke, no dust, no haze, no vignette, no lens flare, no
> depth of field, no motion blur smear. No text, no letters, no numbers, no
> watermark, no logo, no UI.

## The six ELEMENT blocks

Drop one of these in between SHAPE and BACKDROP. Nothing else changes.

### FIRE — RICKLOW, MAGMA LANCE

> The lance is fire. Its core stripe is white fading to pale amber `#FFC08A`,
> its sheath is molten orange `#FF5A1F`, its outer edge is deep ember red
> `#8C2405`. Torn tongues of flame lick backward off the whole length and
> embers break off the outline and burn out behind it.

### WATER — ARISSA, ABYSSAL TIDE

> The lance is water and ice. Its core stripe is white fading to pale ice blue
> `#B6E4FF`, its sheath is bright azure `#2FA8FF`, its outer edge is deep ocean
> blue `#0B4D85`. Ribbons of water wind around the body and flecks of foam and
> splinters of clear ice break off the outline and fall away behind it.

### NATURE — QUINNTO, VERDANT WRATH

> The lance is living growth. Its core stripe is white fading to pale leaf green
> `#B6F5C9`, its sheath is bright emerald `#3FD16A`, its outer edge is deep
> forest green `#14663A`. Thorned vines wind around the body and torn leaves and
> splintered thorns break off the outline and fall away behind it.

### LIGHTNING — SELISA, STORM VERDICT

> The lance is lightning. Its core stripe is white fading to pale gold `#FFF2A8`,
> its sheath is bright saturated gold `#FFD22E`, its outer edge is dark amber
> `#8A6A00`. Forked arcs whip off the body and snap back into it, and sparks
> break off the outline and die behind it.

### ARCANE — SILANTH, VOID ECLIPSE

> The lance is arcane energy. Its core stripe is white fading to pale lilac
> `#E6C9FF`, its sheath is saturated violet `#A855F7`, its outer edge is deep
> indigo `#4C1D95`. Broken glowing runes turn slowly along the body and shards
> of violet glass break off the outline and fall away behind it.

### WIND — TARANIS, CYCLONE EDGE

> The lance is cutting air. Its core stripe is white fading to pale mint
> `#DAFFF8`, its sheath is pale aqua `#8CEEE2`, its outer edge is deep teal
> `#11594F`. Thin blades of air spiral around the body and fine streaks peel off
> the outline and thin away behind it.

## What eats the result

Green-screen pair, the route the water sheet took:

```
node tools/pack-water-ult.mjs \
  --flight src/source/fx/clips/<id>-bolt.mp4 \
  --blast  src/source/fx/clips/<id>-blast.mp4 \
  --out    src/assets/fx/<id>-sheet.webp --contact
```

Black-ground single clip, the route the other eight sheets took:

```
node tools/pack-spells.mjs <id> --contact
```

Either way the contract is the same and `src/art/spells.js` enforces it: ten
frames, five columns, square cells, 0..4 in flight and 5..9 landing.

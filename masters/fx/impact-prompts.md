# The hit, painted on black

What ships today is one plate for all six elements. `vfx.impact()` loads
`hitburst-sheet.webp`, tints it to the element's colour and throws two vector
shock rings and seven beam streaks around it, so fire, water and shadow all land
as the same grey burst under six different tints. These prompts replace that with
six real detonations, one per element, each carrying its own colour and its own
matter.

The plate is drawn with `blendMode: "add"` at the boss's impact point, so black
is invisible and grey is a grey film laid over the boss. The take has to be
genuinely black everywhere except the burst, and the burst has to be finished
inside the ten frames the sheet holds.

Prompt = STYLE + FRAME LOCK + BEAT + the element's own paragraph. Negative block
below for Veo and Sora; Seedance has no negative field, so use the one-block
prompts at the bottom.

## The six

The game's element names are not the plain six. `земля` is the green leaf gem,
`повітря` is the pale teal gem, `світло` is the gold sun gem and `темрява` is the
violet moon gem.

| prompt | element in code | clip id | core | deep | pale |
| --- | --- | --- | --- | --- | --- |
| fire | `FIRE` | `hit-fire` | `#ff5a1f` | `#8c2405` | `#ffc08a` |
| water | `WATER` | `hit-water` | `#2fa8ff` | `#0b4d85` | `#b6e4ff` |
| earth | `NATURE` | `hit-nature` | `#3fd16a` | `#14663a` | `#b6f5c9` |
| air | `WIND` | `hit-wind` | `#8ceee2` | `#11594f` | `#dafff8` |
| light | `LIGHTNING` | `hit-light` | `#ffd22e` | `#8a6a00` | `#fff2a8` |
| dark | `ARCANE` | `hit-dark` | `#a855f7` | `#4c1d95` | `#e6c9ff` |

## FRAME LOCK

```
Square 1:1, locked-off static camera, no camera move, no zoom, no push in, no
parallax. Pure black everywhere except one burst in the exact centre of the
frame, seen head-on. The burst grows to about two thirds of the frame width at
its widest and never reaches the edges: the outer fifth of the picture and all
four corners stay pure black the whole time. Nothing else is in frame — no
ground, no floor, no horizon, no wall, no room, no landscape, no character, no
body, no hands, no weapon. The hit happens in mid-air on something unseen, not on
the ground.
```

## STYLE

```
painted 3D mobile-RPG game VFX, an additive impact effect rendered over a black
screen, semi-realistic, not photographic and not filmed footage: a blinding
white-hot core with saturated colour thrown off it in torn ragged sheets, crisp
hard edges, deep black between them, high contrast, the matter of the element
thrown outward radially in a few strong directions rather than evenly in a neat
star, no flat cartoon shading, no outlines, no soft cinematic bloom filling the
frame, no smoke, no dust, no haze, no depth of field
```

## BEAT

The sheet holds ten frames and plays them in 0.36 s, so the whole detonation has
to live inside one beat of the clip. A take that spends two seconds gathering
before it blows packs as ten frames of nothing.

```
One hit on one beat. The frame starts black; the burst is born from a single
point of white light and is already at its widest and brightest within the first
quarter of the clip — it explodes on the first instant, it does not gather, wind
up, charge, spin up or pull inward first. Then it burns down, thins and dies away
from the centre outward until the frame is completely black again. Exactly one
detonation in the whole clip: no second blast, no aftershock, no pulsing, no
repeat, no looping, and it is finished well before the clip ends.
```

## FIRE

`#ff5a1f` orange, `#8c2405` deep ember, `#ffc08a` pale heat

```
A hit of white-hot fire bursts open: a blinding near-white core with torn orange
flame peeling outward off it in thick ragged tongues, deep ember-red light
dragging behind them, bright embers and flecks of molten light thrown out
radially and burning out as they fly. The flame is torn and ragged along every
edge, never a smooth ball, never a round puff.
```

## WATER

`#2fa8ff` azure, `#0b4d85` deep blue, `#b6e4ff` pale ice

```
A hit of glowing azure water bursts open into a wide crown: sheets of water
thrown outward lit white from inside, pale ice-blue foam and spray tearing off
their edges, deep blue light glowing through the body of the water, droplets and
thin splinters of ice thrown out radially and going dark as they fall. Hard wet
edges, never a soft mist, never a cloud.
```

## EARTH

`#3fd16a` emerald, `#14663a` deep green, `#b6f5c9` pale leaf

```
A hit of emerald light bursts open and the ground's own matter goes with it:
splintered slabs of dark stone and torn bark thrown outward off a white-hot core,
whipping vines snapping open behind them, deep green light burning in the cracks
between the slabs, small glowing spores and torn leaves thrown out radially and
dimming as they fall. Heavy and hard-edged, never a soft green glow.
```

## AIR

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
A hit of cutting air bursts open: hard bright edges of pale teal wind thrown
outward in crossing blades, near-white where they cross, one thin sharp ring of
compressed air racing out ahead of them, deep teal light behind, fine near-white
motes flicked out radially and gone in an instant. Every edge is a hard bright
line, never a soft gust, never a cloud, never fog.
```

## LIGHT

`#ffd22e` gold, `#8a6a00` deep amber, `#fff2a8` pale gold

```
A hit of gold-white holy light detonates: the core flashes to pure white and
straight hard blades of gold light stab outward from it like rays, fine forked
gold-white arcs snapping off the core and gone in an instant, deep amber light
behind them, pale gold sparks thrown out radially. The rays are sharp and
straight-edged with dark black between them, never a soft halo, never a lens
flare.
```

## DARK

`#a855f7` violet, `#4c1d95` deep indigo, `#e6c9ff` pale lilac

```
A hit of violet void power detonates: a blinding white core opening into a wide
flat ring of violet light racing outward, torn black tendrils of shadow whipping
off the core and lashing outward with it, deep indigo light smeared behind, pale
lilac motes and shards of magenta light thrown out radially and winking out. The
shadow eats into the light at its edges, never a soft purple cloud.
```

## NEGATIVE

```
gathering first, charging up, winding up, second explosion, aftershock, pulsing,
looping, slow motion, smoke, dust, haze, fog, mist, sparks filling the whole
frame, burst touching the edges of frame, bright corners, glow at the edge of
frame, ground, floor, horizon, wall, room, landscape, sky, person, face,
character, creature, body, hands, weapon, prop, camera movement, zoom, push in,
orbit, shake, cut, text, letters, numbers, watermark, logo, signature, ui, hud,
grey background, white background, gradient background, vignette, photorealistic,
photographic, filmed footage, stock footage, cinematic, blurry, low contrast,
washed out, dim, soft bloom, lens flare, depth of field
```

## Ready to paste — Seedance

Seedance takes a short prompt and its own flags and has no negative field. Past
about a hundred words it starts dropping the geometry, so each block below is cut
to what matters: the black frame, the centre, one beat, the element's matter.
Everything after `--` is flags, not prose.

### fire

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One explosion of white-hot fire detonates dead centre of the black frame on the very first instant: a blinding near-white core with torn orange flame peeling outward in thick ragged tongues, deep ember-red light dragging behind, bright embers and molten flecks thrown out radially. It is widest and brightest at once, then burns down and thins away until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no gathering, no smoke, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### water

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One burst of glowing azure water detonates dead centre of the black frame on the very first instant: sheets of water thrown outward lit white from inside, pale ice-blue foam and spray torn off their edges, deep blue light through the body of the water, droplets and splinters of ice thrown out radially. It is widest and brightest at once, then drains away until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no gathering, no mist, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### earth

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One burst of emerald light detonates dead centre of the black frame on the very first instant: splintered slabs of dark stone and torn bark thrown outward off a white-hot core, whipping vines snapping open behind them, deep green light burning in the cracks, glowing spores and torn leaves thrown out radially. It is widest and brightest at once, then falls and dims until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no gathering, no dust, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### air

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One burst of cutting air detonates dead centre of the black frame on the very first instant: hard bright edges of pale teal wind thrown outward in crossing blades, near-white where they cross, one thin sharp ring of compressed air racing out ahead of them, deep teal light behind, fine near-white motes flicked out radially. It is widest and brightest at once, then thins away until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no gathering, no fog, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### light

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One detonation of gold-white holy light dead centre of the black frame on the very first instant: the core flashes pure white and straight hard blades of gold light stab outward from it like rays, fine forked gold arcs snapping off it, deep amber light behind, pale gold sparks thrown out radially, deep black between the rays. It is brightest at once, then the rays snap away until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no lens flare, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

### dark

```
Stylized mobile-RPG game VFX, additive glow on a pure black screen, not photographic, not filmed. Square frame, locked-off static camera, seen head-on. One detonation of violet void power dead centre of the black frame on the very first instant: a blinding white core opening into a wide flat ring of violet light racing outward, torn black tendrils of shadow whipping off the core with it, deep indigo light smeared behind, pale lilac motes and shards of magenta light thrown out radially. It is widest and brightest at once, then the ring thins and winks out until the frame is completely black again. The burst stays in the middle and never reaches the edges, corners stay pure black. One hit on one beat, no second blast, no gathering, no smoke, no haze, no ground, no character, no text. --rt 1:1 --dur 5 --rs 1080p --fps 24 --cf true --wm false
```

## Settings

- `tools/gen-spells.mjs` holds these six as `hit-fire` … `hit-dark` and sends
  them to `bytedance/seedance-1-lite` on Replicate: 1:1, 5 s, 24 fps, fixed
  camera, 480p. 480p is already more than twice the 224px cell, so the extra cost
  of 720p buys nothing here.
- `node tools/gen-spells.mjs --print hit-fire` shows the exact string that goes
  out, `--force` overwrites a clip that is already on disk.
- Seedance follows object nouns, so embers, droplets, slabs, leaves, sparks,
  motes and shards are all safe. The local Wan rig is not: there ask only for
  flame, light, streaks and edges.

## Onto the sheet

```
node tools/gen-spells.mjs hit-fire hit-water hit-nature hit-wind hit-light hit-dark
node tools/pack-spells.mjs --contact hit-fire hit-water hit-nature hit-wind hit-light hit-dark
```

The packer samples ten frames out of a window of the clip and subtracts a black
point of 16. The windows for these six sit in `WINDOWS` in `pack-spells.mjs` and
start at 0 s, because the burst is meant to land on the first frame — the default
0.6 s start would open the window after the hit is over. `--start` and `--span`
override it per run, `--gain` lifts a dim take.

Judge a take on the contact sheet the packer writes next to the webp:

- The first cell is already lit. If cells 1 and 2 are black, the model gathered
  first — regenerate rather than chase it with `--start`.
- The last cell is nearly black. If it still burns, the plate will pop off when
  the sprite is destroyed.
- The corners of every cell are black. On add blend a lit corner becomes a grey
  square hanging over the boss.
- The colour is the element's own. These plates ship untinted, so a take that
  came back orange for `hit-water` is unusable.

## Judging it in the game

The dev menu carries the six as their own row: three taps in the top-left
corner, or `?panel`, then the `HIT` group — `ВОГОНЬ`, `ВОДА`, `ЗЕМЛЯ`,
`ПОВІТРЯ`, `СВІТЛО`, `ТЕМРЯВА`. Each one fires `vfx.impact()` at the boss's
impact point with that element, so a dropped-in sheet is one tap from the screen
it has to hold up on. Over CDP it is
`__SIEGE__.states.run("hit.fire")`.

`vfx.impact()` picks the element's own sheet through `HIT_BY_ELEMENT` in
`src/art/spells.js` and draws it untinted. With no such sheet on disk it falls
back to the shared `hitburst` plate tinted to the element's colour, which is what
ships today, so the six can land one at a time. When a painted plate is found the
two vector shock rings and the streak fan are skipped — the plate is the hit —
and only the spark burst still fires over it. The plate's size and life are
`HITP` in `src/config.js`.

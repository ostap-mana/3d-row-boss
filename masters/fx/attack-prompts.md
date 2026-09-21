# Hero attack FX prompts

Target: one 5 s, 1:1, 24 fps clip per hero attack, fixed camera, pure black background.
`tools/pack-spells.mjs` cuts 10 frames out of the window 0.6 s → 2.3 s, so the whole
strike must be born, peak and die inside those two seconds. Anything that happens
after 2.4 s is never seen.

## STYLE (prepend to every prompt)

```
painted 3D mobile-RPG game VFX, semi-realistic, high contrast, a bright white-hot
core with saturated colour thrown off it, light and motion only, no flat cartoon
shading, no outlines
```

## TECHNICAL (append to every prompt)

```
The effect is isolated on a pure black background, nothing else in frame, no floor,
no room, no landscape, no character, no hands, no weapon. The effect stays centred
in frame the whole time. One single continuous shot, one fixed camera, no cuts, no
camera movement, no zoom, no push in, no orbit, no parallax. One strike on one beat:
it starts small, reaches its brightest and widest early, then dies away to complete
black — no second strike, no pulsing, no repeat, and it is finished well before the
clip ends.
```

## NEGATIVE

```
character, creature, hands, weapon, sword, staff, floor, ground, room, landscape,
sky, smoke, dust, haze, fog, text, letters, numbers, watermark, logo, UI, HUD,
camera shake, zoom, cut, second explosion, looping, grey background, washed out
```

## RICKLOW — FIRE — MAGMA LANCE

`#ff5a1f` orange, `#a81200` deep ember, `#ffc08a` pale heat

```
A spear of white-hot fire drives forward through frame, a thin blinding core with
orange flame peeling back off it in long torn ribbons and deep ember-red light
trailing behind. As the head of the spear reaches centre it blooms open into a
short hard burst of white and orange light, then the fire tears apart into thinning
streaks and gutters out to black.
```

## ARISSA — WATER — ABYSSAL TIDE

`#2fa8ff` azure, `#0b4d85` deep blue, `#b6e4ff` pale ice

```
A wall of glowing azure water rears up and crashes forward through frame, its crest
lit white from inside, pale ice-blue foam streaming off the top of it and deep blue
light glowing under the body of the wave. It breaks at the centre of frame into a
wide crown of white foam and spray, then the water falls away, the light going out
as it drains to black.
```

## QUINNTO — NATURE — VERDANT WRATH

`#3fd16a` emerald, `#14663a` deep green, `#b6f5c9` pale leaf

```
Emerald light lashes out from centre frame in whipping vine-like arcs, each arc
white-hot along its spine, pale green glow blooming where they cross. The arcs
snap taut all at once into a wide spray of green light thrown outward, deep green
afterglow hanging for a moment, then thinning away to black.
```

## SELISA — LIGHTNING — STORM VERDICT

`#ffd22e` gold, `#8a6a00` deep amber, `#fff2a8` pale gold

```
A single forked bolt of gold-white lightning strikes straight down into centre
frame and lands hard, the whole frame flashing white for one instant. From the
point it lands, gold arcs whip outward and crawl away in branching forks, pale
gold afterimage burning where the bolt was, then every arc snaps away and the
frame goes black.
```

## SILANTH — ARCANE — VOID ECLIPSE

`#a855f7` violet, `#4c1d95` deep indigo, `#e6c9ff` pale lilac

```
Violet light is sucked inward to a single point at centre frame, winding round
itself tighter and tighter until the core is blinding white, deep indigo dark
pressing in around it. The point detonates into a wide flat ring of violet light
racing outward with lilac streaks dragging behind it, and the ring thins, dims and
is gone to black.
```

## TARANIS — WIND — CYCLONE EDGE

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
Pale cyan-white air spins into a tight vortex at centre frame, thin bright edges
of cutting wind circling it faster and faster, the throat of it glowing white.
It bursts open into a wide ring of slicing wind streaks thrown outward, each
streak a hard bright line with a teal glow behind it, and they thin out and
vanish to black.
```

## Notes

- Wan renders flame and light well and objects badly. Never ask it for shards,
  splinters, leaves, stones or rune fragments — ask for streaks, ribbons, arcs
  and edges of light. On seedance those nouns are safe and can go back in.
- Every generated plate comes back with a lifted black point. Raise it in the
  packer before slicing or the sheet ships a grey box.
- Lightning is gold in this game, not blue-violet. `tools/gen-spells.mjs` still
  says "violet blue" for SELISA and it fights the hero's own colour.

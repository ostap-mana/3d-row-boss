# Ultimate painted over the game frame

The input is a real screenshot of the running game, not a blank canvas: portrait
phone frame, KOLTMOS filling the upper half, the row of six hero cards across the
middle, the gem board below them, HUD along the top. The model paints the hero's
ultimate into that frame and changes nothing else.

Prompt = STYLE + the hero's own paragraph + SCENE LOCK. Negative prompt below.

## STYLE

```
painted 3D mobile-RPG game VFX added over an existing game screenshot,
semi-realistic, high contrast, a blinding white-hot core with saturated colour
thrown off it, light and motion only, the effect glows and casts its own light onto
what is already in the picture, no flat cartoon shading, no outlines
```

## SCENE LOCK

```
Keep the picture underneath exactly as it is: the same camera, the same framing,
the same boss, the same hero cards, the same gem board, the same interface. Do not
redraw, move, resize, replace or restyle anything that is already in the frame, and
do not add any new character, creature, weapon, prop or writing. The only thing that
changes is the added light of the spell and the glow it throws onto the boss, the
cards and the board. The effect is born at the hero card in the middle of the frame,
travels up into the boss in the upper half, and breaks there. One strike on one
beat: it reaches its brightest early, then dies away and leaves the frame exactly as
it started.
```

## RICKLOW — FIRE — MAGMA LANCE

`#ff5a1f` orange, `#a81200` deep ember, `#ffc08a` pale heat

```
A spear of white-hot fire rips up out of the hero card and drives into the boss: a
thin blinding core with orange flame peeling back off it in long torn ribbons, deep
ember-red light trailing behind. It bursts against the boss's chest into a short
hard bloom of white and orange, orange firelight washing across his body, the cards
and the top of the board, then tearing apart into thinning streaks.
```

## ARISSA — WATER — ABYSSAL TIDE

`#2fa8ff` azure, `#0b4d85` deep blue, `#b6e4ff` pale ice

```
A wall of glowing azure water rears up off the hero card and crashes forward into
the boss, its crest lit white from inside, pale ice-blue foam streaming off the top,
deep blue light glowing under the body of the wave. It breaks against him into a
wide crown of white spray, cold blue light washing across his body, the cards and
the top of the board, then drains away.
```

## QUINNTO — NATURE — VERDANT WRATH

`#3fd16a` emerald, `#14663a` deep green, `#b6f5c9` pale leaf

```
Emerald light lashes up from the hero card in whipping vine-like arcs, each arc
white-hot along its spine, and coils around the boss, pale green glow blooming where
they cross. The arcs snap taut all at once into a wide spray of green light thrown
off him, green light washing across his body, the cards and the top of the board,
then thinning away.
```

## SELISA — LIGHTNING — STORM VERDICT

`#ffd22e` gold, `#8a6a00` deep amber, `#fff2a8` pale gold

```
A single forked bolt of gold-white lightning strikes straight down from the top of
the frame into the boss and lands hard, the whole picture flashing white-gold for
one instant. Gold arcs whip off him and crawl away in branching forks, a pale gold
afterimage burning where the bolt was, gold light washing across his body, the cards
and the top of the board, then every arc snaps away.
```

## SILANTH — ARCANE — VOID ECLIPSE

`#a855f7` violet, `#4c1d95` deep indigo, `#e6c9ff` pale lilac

```
Violet light is sucked inward to a single point in front of the boss, winding round
itself tighter and tighter until the core is blinding white and the frame darkens
around it. The point detonates into a wide flat ring of violet light racing outward
through him with lilac streaks dragging behind, violet light washing across his
body, the cards and the top of the board, then the ring thins and dims away.
```

## TARANIS — WIND — CYCLONE EDGE

`#8ceee2` pale teal, `#11594f` deep teal, `#dafff8` near-white

```
Pale cyan-white air spins into a tight vortex in front of the boss, thin bright
edges of cutting wind circling him faster and faster, the throat of it glowing
white. It bursts open into a wide ring of slicing wind streaks thrown outward, each
streak a hard bright line with a teal glow behind it, cold cyan light washing across
his body, the cards and the top of the board, then they thin out and vanish.
```

## NEGATIVE

```
redrawing the scene, different character, new creature, changed boss, changed hero
cards, changed gem board, rearranged layout, new interface, extra text, extra
letters, numbers, watermark, logo, hands, weapon, camera move, zoom, pan, cut,
crop, second explosion, looping, smoke, dust, haze, fog, blurry, washed out,
desaturated, cartoon outline
```

## Settings

- img2img: denoise 0.35–0.50. Above that the model starts repainting the boss and
  the board. If it still drifts, mask everything but the strike path and the boss.
- Wan i2v: feed the screenshot as the first frame, 24 fps, 3–5 s, fixed camera. The
  spell must peak around 1 s and be gone by 2 s.
- Wan renders flame and light well and objects badly. Never ask it for shards,
  splinters, leaves or rune fragments — ask for streaks, ribbons, arcs and edges of
  light. On seedance those nouns are safe.
- Lightning is gold in this game, not blue-violet. `tools/gen-spells.mjs` still says
  "violet blue" for SELISA and it fights the hero's own colour.

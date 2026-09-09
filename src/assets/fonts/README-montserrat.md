# Montserrat Bold Italic — the damage numbers and the READY call

`montserrat-700i.woff2` draws the figures that fly off a hit and the banner that
announces an ultimate, and nothing else in the creative. It is 3.5 kB, it holds
forty-six glyphs, and unlike the Hitzone cuts next to it, it can ship:
Montserrat is SIL Open Font License, and the licence is in this folder as
`OFL-Montserrat.txt`.

## Why a second face for numbers

Every other text in the game is a label — a hero's name, MATCH TO ATTACK, an HP
readout — held level and read at leisure. A damage number is the one piece of
type that is a *consequence* of something. It already lands squashed, springs
into shape and scatters a few degrees off upright; a face that leans 11.3° by
design is the same idea drawn into the letterforms instead of tweened onto them.

Which cut, then, is settled by the set this creative draws from: Montserrat Bold
Italic is one of the nineteen faces in the Invokers Titan Legacy build, and the
only one of them that leans. So the face is the game's own even though this
particular job is not — see below.

## Where it came from

The same build as Hitzone, by a different route. Hitzone sits in
`resources.assets` and `sharedassets0.assets` as the source font of two
TextMeshPro assets; Montserrat is not in those files at all. It is in an
Addressables bundle,

    Invokers_Data/StreamingAssets/aa/StandaloneWindows64/
      ebb5e34e400de056ec6c70922a79e430.bundle

embedded as plain TrueType — `Montserrat-BoldItalic`, with its `glyf`, `GPOS`,
`GSUB`, `OS/2`, `STAT` and `cmap` tables, and the OFL and the 2011 Montserrat
Project Authors copyright a little further along in the same file.

**What the build draws with it is not known.** That bundle is encrypted, so the
TextMeshPro asset names and the prefabs that reference them cannot be read out
of it the way Hitzone's could, and no attempt was made to break it. Anything
about the game using this face for *its* damage numbers would be a guess; the
reason it draws ours is the design one above, which stands on its own.

See [`README-hitzone.md`](README-hitzone.md) for the build layout. The untouched
TrueType is kept outside this repo with the rest of that set:

    Desktop/WORK/invokers-fonts-raw/Montserrat-Bold-Italic.ttf

202 kB, version 8.000, Julieta Ulanovsky. That file is what to re-cut from.

## How it is wired

| file                    | family          | used by                     |
| ----------------------- | --------------- | --------------------------- |
| `montserrat-700i.woff2` | `Montserrat It` | `FONT_DAMAGE`, `FONT_READY` |

A third family rather than a weight or a style of an existing one, for the same
reason Hitzone and Hitzone Med are two families: `FONT_DAMAGE` names this one, so
the UI's own requests at 700, 800 and 900 cannot land on it and its own request
cannot land on them. Registered across `100 900`, so every weight asked for is
drawn from the file rather than synthesised.

**Registered `normal`, not `italic`.** The slant is in the outlines; declaring it
italic would oblige callers to ask for `fontStyle: "italic"`, and on a device
that failed to decode this file that request would land on Hitzone and be
*synthesised* — the fallback would arrive sheared when the real face is not.
Left at `normal`, a device that cannot load this file prints upright Hitzone at
900, which is exactly the design that shipped before this face existed.

## What was cut

Forty-six glyphs: `A-Z`, `0-9`, and `space ! % ' + , - . : ×`. That is every
character `comma()` and the `sign` option in [`ui/hud.js`](../../ui/hud.js) can
produce, plus the word READY and every hero name the banner can print under it —
the roster is upper case and so is `COPY.ultReady`. 202 kB of TrueType comes out
at 3,576 bytes, against about 20 kB for the Latin-1 cut the Hitzone faces get.

**There is no lower case in this file.** A word set in either of the two lists
that name this family draws its capitals and digits from Montserrat and falls
through to Hitzone glyph by glyph for anything else — survivable, and not a
thing to do on purpose. Widen the `--unicodes` below before setting a mixed-case
string in either constant.

Re-cut with — and keep this line in step with what ships, because a narrower cut
would silently take the letters back out of the READY banner:

    pyftsubset Montserrat-Bold-Italic.ttf \
      --output-file=montserrat-700i.woff2 --flavor=woff2 \
      --unicodes="U+0020-0021,U+0025,U+0027,U+002B-002E,U+0030-003A,U+0041-005A,U+00D7" \
      --layout-features=kern --no-hinting --drop-tables+=DSIG

## The READY call

The banner in [`fx/readycall.js`](../../fx/readycall.js) asks for this face
through `FONT_READY`, which is the same file behind a second name — see that
constant in [`config.js`](../../config.js) for why the announcement leans where
every label in the creative stays upright. Both of its lines are sized and
tracked from the safe box at runtime, so nothing there is authored against these
metrics either.

## If the face changes again

Nothing needs re-measuring. Unlike the HP readouts on the hero cards — whose
size is solved from Hitzone's cap height, see `HITZONE` in
[`art/heroes.js`](../../art/heroes.js) — a damage number is sized from its tier
and centred on what it flew off, so its metrics are never assumed. Montserrat
happens to match Hitzone almost exactly here in any case: cap height 0.700 em in
both, and the top of a zero at 0.712 against 0.708, so the swap changed the
weight and the slant of the digits without changing how tall they read. Its
digits are about a tenth wider per advance, which the safe-box clamp in
`Hud.damage` absorbs because that clamp measures the drawn text.

The one thing that face carries with it is the `padding` in that method's text
style. Pixi's `_getFinalPadding` knows nothing about `dropShadow`, so at the
default of zero the text canvas is exactly the measured box — and a slanted face
puts the bottom left of a 2, a 3 or a 5 up to 0.034 em before the pen. Keep it.

## Licence

SIL Open Font License 1.1 — `OFL-Montserrat.txt`, copied from the Montserrat
project. Copyright 2011 The Montserrat Project Authors,
https://github.com/JulietaUla/Montserrat.

This is the one face in this folder with no licensing question hanging over it.
It arrived here out of a commercial build, but Montserrat is not that build's to
license: it is a public OFL font that Invokers is itself using under the same
terms. Redistribution in a creative is permitted, and the OFL requires the
licence to travel with the font, which is what `OFL-Montserrat.txt` is for. The
Hitzone cuts are the ones still to clear — see `README-hitzone.md`.

# Hitzone — the type from the Invokers Titan Legacy build

`hitzone-400.woff2` and `hitzone-500.woff2` are the two cuts every character in
this creative is now set in. They are the game's own interface face, taken out
of the shipped Invokers Titan Legacy client rather than licensed from a foundry,
which is the one thing to know about them before this creative goes anywhere.

## Where they came from

The launcher on the desktop is an Electron shell and carries nothing but Inter.
The game it downloads is Unity/IL2CPP and lives at

    %APPDATA%/zone.hitzone.invokers.launcher/game/Invokers_Data

Hitzone is embedded as TrueType inside two serialized asset files there,
`resources.assets` and `sharedassets0.assets`, as the source font of the
`Hitzone-Regular SDF` and `Hitzone-Medium SDF GoldGradient` TextMeshPro assets —
which is also where the split below comes from: the build sets its body copy in
Regular and reserves Medium for the titles it draws on gold.

The complete set of nineteen faces found in that build — Hitzone's two cuts,
Montserrat Bold Italic, Roboto Bold, Oswald Bold, Anton, Bangers, Sui Generis,
Perfect DOS VGA 437, Droid Sans Mono, Liberation Sans and eight Noto CJK cuts —
is kept as untouched TTF/OTF outside this repo, in

    Desktop/WORK/invokers-fonts-raw/

Nine of the Latin ones are also cut to WOFF2 in [`invokers-build/`](invokers-build/),
ready to point an import at. Nothing in that folder is imported, so nothing in it
reaches `dist/index.html`.

## How they are wired

Two families, not two weights of one — see [`src/ui/fonts.js`](../../ui/fonts.js):

| file                | family        | used by      |
| ------------------- | ------------- | ------------ |
| `hitzone-400.woff2` | `Hitzone`     | `FONT`       |
| `hitzone-500.woff2` | `Hitzone Med` | `FONT_TITLE` |

Each is registered across `100 900`, so the 700, 800 and 900 the UI asks for all
land on a real file and none of them is synthesised. A weight split would not
work here: the UI and the headlines both ask for 900, and every one of those
requests would go to Med.

## What was cut

Latin-1 plus a handful of punctuation — `U+0020–007E`, `U+00A0–00FF`, the dashes,
the curly quotes, the ellipsis, the bullet and the multiplication sign. 218 kB of
TrueType comes out at a little under 20 kB a cut.

The full faces carry Cyrillic too, Ukrainian included (`ЄІЇҐ` and their lower
case). Nothing in this creative draws it, so it is not in these files; the raw
TTFs above are what to re-cut from if a localisation ever needs it.

## If the face changes again

Re-measure the `HITZONE` constant in [`src/art/heroes.js`](../../art/heroes.js).
The hero cards' HP readouts are the one place in the game whose type size is not
fitted at runtime but solved from a cap height, a descender and a digit advance,
and a face with its own cap height draws at the last face's size until those
three numbers are taken again. The current values — `0.713 / 0.008 / 0.617` —
were measured off `hitzone-400.woff2` itself.

## Licence

Unknown, and that is the point. Oswald and Cinzel, which these replaced, are SIL
Open Font License and their licences are still in this folder. Hitzone is not a
face with a public licence: it is the type from a shipped commercial game, and
extracting it from that build grants no right to ship it in another creative.
Clear it with whoever owns Invokers Titan Legacy before this goes to an ad
network. Everything is wired so that swapping the two `hitzone-*.woff2` files
for a licensed face — or re-ordering the family lists in
[`src/config.js`](../../config.js) — is the only change needed.

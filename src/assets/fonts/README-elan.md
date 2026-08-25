# Elan ITC Pro — drop the licensed file here

`Elan ITC Pro` is the head of both family lists in [`src/config.js`](../../config.js)
(`FONT` and `FONT_TITLE`), so every label, name and headline in the game is set
in it as soon as a file for it exists. Nothing else needs editing.

It is **not** in this repo and cannot be: ITC Elan is Monotype's, sold per
licence, and unlike Oswald and Cinzel — both SIL OFL, licences beside them —
there is no free or redistributable cut. Buy it from
<https://www.myfonts.com/collections/elan-font-itc> (individual styles from
about $30, the eight-font Pro family pack about $318) and take the **Webfont**
licence, not desktop alone: a playable ad is a web embed.

## Naming

The weight is read off the filename by [`src/ui/fonts.js`](../../ui/fonts.js) —
a WOFF2 will not hand its own weight back through `FontFace`, so the name is the
contract:

| file                             | registers as |
| -------------------------------- | ------------ |
| `elan-book.woff2`                | 400          |
| `elan-medium.woff2`              | 500          |
| `elan-bold.woff2`                | 700          |
| `elan-black.woff2`               | 900          |
| `elan-bold-italic.woff2`         | 700 italic   |
| `elan-700.woff2`                 | 700          |

Any subset works. If only one upright file is dropped in, it is registered
across `100 900` so the UI's requests for 800 and 900 land on it exactly instead
of being synthesised bolder.

## Format

WOFF2. `.woff`, `.otf` and `.ttf` are picked up too, but this build inlines every
asset as base64 into one `dist/index.html` — an OTF is two to three times the
bytes of the same face as WOFF2, straight onto the creative's weight budget.
Convert a desktop OTF with `woff2_compress`, `fonttools`
(`fonttools ttLib.woff2 compress elan-bold.otf`) or any web font converter, and
subset to Latin-1 while you are there: nothing in this creative uses another
range, and that is why the two fonts already here are 13 kB each.

## After the file lands

Re-measure the digit metrics in [`src/art/heroes.js`](../../art/heroes.js) — the
`OSWALD` constant. The hero cards' HP readouts size themselves off a cap height
and a digit advance measured from Oswald 700; Elan is a serif with its own, so
the numbers will draw in the new face at the old face's size until those three
numbers are taken again.

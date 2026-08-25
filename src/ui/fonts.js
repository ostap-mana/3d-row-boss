/**
 * The web fonts, decoded before a single line of text is measured.
 *
 * This creative ran on the system stack until now — whatever Segoe UI, Roboto
 * or SF Pro happened to be on the device — which is three different creatives
 * wearing one layout, and none of them a game. Two faces fix that for under
 * thirty kilobytes:
 *
 *   Oswald 700   the UI. A condensed grotesque, which is the one thing this
 *                layout needs most: every label in it is upper case and half of
 *                them are long — CATACLYSM, MATCH TO ATTACK, six hero names in
 *                a row of cards 56 points wide — and condensed is what fits
 *                them without dropping to a size nobody reads.
 *   Cinzel 900   the three places the fight is announced rather than labelled:
 *                the boss's name, the hero's name on an ultimate, the end
 *                card's headline. A roman inscription face, and the reason the
 *                UI one can stay plain.
 *
 * Both are SIL Open Font License; the licences sit next to the files. They are
 * the `latin` cut Google serves, so they carry the Latin-1 range and nothing
 * else — this creative has no other characters in it.
 *
 * Elan ITC Pro sits in front of both of them — see ELAN below and the two
 * family lists in config.js — and is the one face whose bytes are not here.
 *
 * Never rejects. A device that cannot decode a WOFF2 keeps the system stack
 * that is still the tail of every family list in config.js, and the layout is
 * unchanged: every text in the game is fitted to a box at runtime rather than
 * authored against one font's metrics.
 */

import oswaldUrl from "../assets/fonts/oswald-700.woff2";
import cinzelUrl from "../assets/fonts/cinzel-900.woff2";

/**
 * Elan ITC Pro — asked for by name, and the only face here that cannot ship.
 *
 * ITC Elan is Monotype's and is sold per licence. There is no free cut of it and
 * no legal download, so the file cannot sit in this folder beside two OFL fonts
 * the way the other two do. Everything around it is wired regardless: drop the
 * licensed webfont in as
 *
 *     src/assets/fonts/elan-book.woff2          ->  400
 *     src/assets/fonts/elan-medium.woff2        ->  500
 *     src/assets/fonts/elan-bold.woff2          ->  700
 *     src/assets/fonts/elan-black.woff2         ->  900
 *     src/assets/fonts/elan-bold-italic.woff2   ->  700 italic
 *
 * — any subset of those, and numeric names like `elan-700.woff2` are read the
 * same way — and every label and every headline in the game comes up set in it
 * on the next build, because "Elan ITC Pro" is already the head of both family
 * lists in config.js. Until a file lands, those lists fall straight through to
 * Oswald and Cinzel and the build is exactly what it is today.
 *
 * A glob rather than an `import`: an import of a file that is not on disk fails
 * the build, and this build has to keep working with no Elan in it. `.otf` and
 * `.ttf` are matched too, because that is what a desktop licence hands you —
 * they are two to three times the bytes of a WOFF2 in a single-file creative,
 * so convert before shipping one.
 */
const ELAN_URLS = import.meta.glob(
  "../assets/fonts/elan-*.{woff2,woff,otf,ttf}",
  { eager: true, query: "?url", import: "default" },
);

/** What the family ships its weights as, mapped onto the numbers CSS wants. */
const ELAN_WEIGHTS = {
  light: 300,
  book: 400,
  regular: 400,
  roman: 400,
  medium: 500,
  demi: 600,
  semibold: 600,
  bold: 700,
  heavy: 800,
  black: 900,
};

/**
 * The Elan files that are actually on disk, read into face descriptors.
 *
 * The weight comes off the filename because nothing else can tell us: a WOFF2
 * carries its weight in its OS/2 table and `FontFace` will not read it back, so
 * a file registered under the wrong number is a file the browser smears bolder
 * itself. Naming it is the cheapest contract that holds.
 *
 * The range trick is the same one Oswald gets below, applied per style: a style
 * that arrived as a single file answers for the whole 100–900 scale, because the
 * UI asks for 800 and 900 in a dozen places and those numbers were picked when
 * the only faces available were whatever the device had. One file matched
 * exactly is drawn as drawn; one file left at its own weight is one the browser
 * synthesises a heavier version of, which on a text face closes the counters up.
 */
function elanFaces() {
  const files = Object.entries(ELAN_URLS);
  if (!files.length) return [];

  const faces = files.map(([path, url]) => {
    const stem = path
      .split("/")
      .pop()
      .replace(/\.\w+$/, "");
    const token = stem.replace(/^elan-/i, "").toLowerCase();
    const italic = /italic|oblique|(^|-)it$/.test(token);
    const cut = token.replace(/[-_]?(italic|oblique|it)$/, "");
    return {
      family: "Elan ITC Pro",
      url,
      weight: String(Number(cut) || ELAN_WEIGHTS[cut] || 400),
      style: italic ? "italic" : "normal",
    };
  });

  for (const style of ["normal", "italic"]) {
    const cuts = faces.filter((f) => f.style === style);
    if (cuts.length === 1) cuts[0].weight = "100 900";
  }
  return faces;
}

/**
 * `weight` is a range, not a number, and both ranges are wider than the file.
 *
 * The UI asks for 800 and 900 all over — those numbers were picked when the
 * only faces available were whatever the device had, where 900 means "as heavy
 * as you have". Registering the real 700 as `500 900` is what makes those
 * requests land on it: matched exactly, drawn as drawn. Without the range the
 * browser takes the nearest face and smears it bolder itself, which on a
 * condensed face closes up the counters and reads as a blur at 11 points.
 */
const FACES = [
  { family: "Oswald", url: oswaldUrl, weight: "500 900" },
  { family: "Cinzel", url: cinzelUrl, weight: "700 900" },
  ...elanFaces(),
];

let loaded = null;

export function loadFonts() {
  if (loaded) return loaded;
  loaded = Promise.all(
    FACES.map(async (face) => {
      try {
        if (typeof FontFace !== "function" || !document.fonts) return;
        const font = new FontFace(face.family, `url("${face.url}")`, {
          weight: face.weight,
          style: face.style || "normal",
          // `block` rather than `swap`: nothing is drawn until this resolves,
          // so there is no flash to swap out of — and a fallback frame baked
          // into a Pixi text texture would stay wrong until that text changed.
          display: "block",
        });
        await font.load();
        document.fonts.add(font);
      } catch {
        /* the system stack stands in */
      }
    }),
  );
  return loaded;
}

/**
 * The web fonts, decoded before a single line of text is measured.
 *
 * This creative ran on the system stack, then on two faces borrowed from
 * Google, and now on the type the game it is advertising is actually set in.
 * Both faces here are Hitzone, taken out of the Invokers Titan Legacy build —
 * two cuts, because the game ships two and gives them two different jobs:
 *
 *   Hitzone      the UI. Everything the game labels rather than announces: the
 *                hero names, MATCH TO ATTACK, the readouts in the HP bars. This
 *                is the cut the build sets its own interface in.
 *   Hitzone Med  the three places the fight is announced rather than labelled:
 *                the boss's name, the hero's name on an ultimate, the end
 *                card's headline. The build reserves this cut for the titles it
 *                draws on gold, and so does this.
 *
 * They are registered as two families rather than as two weights of one, and
 * that is what makes the split hold: `FONT` names the first and `FONT_TITLE`
 * the second, so a request at any weight lands on a real file instead of on the
 * browser's guess at a heavier version of the other one. See config.js.
 *
 * Subset to Latin-1 — the range this creative draws, and nothing past it — at a
 * little under twenty kilobytes a cut, down from around 218 kB of TrueType. The
 * full faces carry Cyrillic as well; where they came from and how they were cut
 * is in README-hitzone.md, next to the files.
 *
 * Elan ITC Pro is still wired below and still has no bytes here. It now sits
 * behind Hitzone in both family lists rather than in front of them, so dropping
 * a licensed cut in changes nothing until those lists are re-ordered.
 *
 * Never rejects. A device that cannot decode a WOFF2 keeps the system stack
 * that is still the tail of every family list in config.js, and the layout is
 * unchanged: every text in the game is fitted to a box at runtime rather than
 * authored against one font's metrics.
 */

import hitzoneUrl from "../assets/fonts/hitzone-400.woff2";
import hitzoneMedUrl from "../assets/fonts/hitzone-500.woff2";

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
 * same way. It will not draw anything on its own any more: Hitzone heads both
 * family lists in config.js now, so a licensed cut dropped in here is loaded and
 * then never asked for until those lists are re-ordered to put Elan first. The
 * loading half of the contract is kept so that re-ordering is the only step.
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
 * The range trick is the same one Hitzone gets below, applied per style: a style
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
 * The UI asks for 700, 800 and 900 all over — those numbers were picked when
 * the only faces available were whatever the device had, where 900 means "as
 * heavy as you have". Registering each cut across the whole scale is what makes
 * those requests land on it: matched exactly, drawn as drawn. Without the range
 * the browser takes the nearest face and smears it bolder itself, which closes
 * up the counters and reads as a blur at 11 points.
 *
 * The two cuts are told apart by family name rather than by weight, which is
 * the only way to keep the UI on one and the headlines on the other when both
 * are asked for at 900: a weight split would hand every heavy request to Med
 * and leave the lighter cut drawing nothing at all.
 */
const FACES = [
  { family: "Hitzone", url: hitzoneUrl, weight: "100 900" },
  { family: "Hitzone Med", url: hitzoneMedUrl, weight: "100 900" },
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

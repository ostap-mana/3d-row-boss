/**
 * The two web fonts, decoded before a single line of text is measured.
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
 * Never rejects. A device that cannot decode a WOFF2 keeps the system stack
 * that is still the tail of every family list in config.js, and the layout is
 * unchanged: every text in the game is fitted to a box at runtime rather than
 * authored against one font's metrics.
 */

import oswaldUrl from "../assets/fonts/oswald-700.woff2";
import cinzelUrl from "../assets/fonts/cinzel-900.woff2";

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
          style: "normal",
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

import hitzoneUrl from "../assets/fonts/hitzone-400.woff2";
import hitzoneMedUrl from "../assets/fonts/hitzone-500.woff2";
import montserratItUrl from "../assets/fonts/montserrat-700i.woff2";

const ELAN_URLS = import.meta.glob(
  "../assets/fonts/elan-*.{woff2,woff,otf,ttf}",
  { eager: true, query: "?url", import: "default" },
);

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

const FACES = [
  { family: "Hitzone", url: hitzoneUrl, weight: "100 900" },
  { family: "Hitzone Med", url: hitzoneMedUrl, weight: "100 900" },
  { family: "Montserrat It", url: montserratItUrl, weight: "100 900" },
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
          display: "block",
        });
        await font.load();
        document.fonts.add(font);
      } catch {}
    }),
  );
  return loaded;
}

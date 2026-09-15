# SILANTH — DEFEAT

Тільки поразка. Два ефекти: сама Сіланф і кільце над словом DEFEAT.

Персонаж: SILANTH, арканна карта, VOID ECLIPSE (`config.js`). Та сама, що на
`src/assets/heroes/portrait-arcane.webp` і на `src/seedence/ref-pose.png`.

---

## 1. ФІГУРА — «лузер, давай ще раз»

Вона нахиляється до гравця, дивиться зверху вниз із насмішкою і тицяє пальцем
вниз, на плашку RETRY. Два рухи: нахил (це «ти програв») і тицяння (це «тисни»).

**Wan 2.2.** Воркфлоу `src/source/outcome-workflows/defeat-v1.json`, старт-кадр
`src/seedence/ref-pose.png`, 704x400, 33 кадри, 30 steps, uni_pc/simple,
cfg 6.5, shift 8, seed 20260916. ComfyUI запускати з `--disable-smart-memory`.

POSITIVE:

```
A gothic demon sorceress with blue-black twin buns and red roses, in a red and
black dress with dark wings and spiked shoulders, holds an empty coupe glass
lazily in her lowered hand. She leans in toward the viewer from the waist, head
tilted to one side, looking down at them with a slow mocking pitying smirk, one
eyebrow raised, enjoying that they lost. Then she raises her other hand and
points down toward the bottom of the frame just below her, index finger
extended, and taps the air twice, telling them to go again. She holds the lean
and the pointing hand at the end and keeps watching the viewer. The lean is
small: her head stays inside the same part of the frame and she barely changes
size. Her face, makeup, hair buns, roses, choker, dress, shoulder spikes, wings
and gloves stay identical in every frame. Locked static camera, no camera
movement. Flat solid green screen background, completely empty and perfectly
still. painted 3D mobile-RPG game art, semi-realistic, high contrast, warm rim
lighting.
```

NEGATIVE:

```
text, letters, numbers, watermark, logo, signature, second person, extra hands,
extra fingers, deformed hands, pointing with the whole hand, thumbs up, waving,
camera movement, zoom, pan, tilt, dolly, orbit, shake, cut, scene change,
leaning out of frame, head leaving frame, standing up, walking, stepping,
turning away, drinking, glass to lips, laughing, open mouth, bared teeth,
scenery, room, floor, horizon, props, particles, sparks, smoke, blur, low
quality, distorted face
```

ПАКУВАННЯ — кліпом, не шитом:

```
node tools/pack-clip.mjs src/source/outcome/retry-raw.mp4 \
  --crop 736:720:248:0 --out src/assets/outcome/spurn.mp4
```

Шит викидав усе між кадрами, а разом із ними й тицяння, тому фігура лишається
відео, а ключ іде на GPU — `fx/chromakey.js`, той самий, що й на перемозі.
`--crop` рахований по силуету через увесь кліп: контент живе в x 268..965,
решта кадру — порожній фон, за який немає сенсу платити.

Що робить `--grow`: h264 везе колірну різницю у вдвічі меншій роздільності, тому
два-три пікселі по обидва боки силуету — це суміш неї і фону. Червона сукня,
змішана із зеленим, не читається ключем ні як фон, ні як вона: чиста олива на
повній альфі, тобто жовто-зелений обідок навколо всієї фігури. Пакер з'їдає цю
смугу і перефарбовує фон у темно-зелений `0,110,0`, щоб те, що кодек розмиє
назад через новий край, було темним. Chroma-cut шейдера — 60, а в цього кольору
110, тож сам фон гасне повністю.

**Seedance 2.5 — без вхідних даних.** Жодних референсів: `ratio adaptive`,
duration 10, 24 fps, 720p, `camera_fixed true`. Ні .mp4, ні .png на вході —
референс-відео перекидає джобу в edit і параметри стають нелегальні, а стіли
тягнуть за собою стару позу з піднятим келихом.

```
A gothic demon sorceress stands against a flat chroma green background, framed
from the waist up, slightly right of centre. She has porcelain pale skin, red
eyes, heavy dark eye makeup and dark red lips, blue-black hair pulled up into
two round buns with small red roses and dark spikes in them, a black studded
choker, a red and black sleeveless dress with a bare midriff, black spiked
shoulder plates, black fingerless gloves with long dark red nails, and small
dark membranous wings behind her shoulders. She holds an empty coupe glass
lazily in her lowered left hand, tipped over and forgotten.

She leans in toward the viewer from the waist, head tilted to one side, looking
down at them with a slow mocking pitying smirk, one eyebrow raised, enjoying
that they lost. Then she raises her right hand and points down toward the
bottom of the frame just below her, index finger extended, and taps the air
twice, telling them to go again. She holds the lean and the pointing hand at
the end and keeps watching the viewer. She never laughs out loud, never drinks,
never turns away.

Locked-off static camera, no zoom, no pan, no push-in, no shake. The lean is
small: her head stays inside the same part of the frame and she barely changes
size. Her face, hair, dress, wings and gloves stay identical in every frame.
The background is flat even chroma green, perfectly still and completely empty,
with no floor, no room and no props. No green spills onto her; her outline
stays crisp with no haze and no motion blur. painted 3D mobile-RPG game art,
semi-realistic, high contrast, warm rim lighting.
```

Куди вона показує: плашка RETRY стоїть під банером, тобто нижче за неї, тому
палець іде вниз за нижній край кадру. У промпті немає слова «кнопка» навмисно —
модель намалює свою, а нам треба тільки жест.

Межа нахилу тримає весь ефект. Нахил до камери в зафіксованому кадрі — це вона
збільшується, а кадр лишається той самий, тобто палець іде вниз, а голова вгору.
Карта розмірена по крайньому кадру: якщо прибрати «the lean is small», палець
заповзе під банер, а роги і троянди зріже верхній край екрана.

### Запасний варіант — напій гасне

Тихіший біт, без насмішки: світло в келиху згасає у фіолет, напій темніє і
зникає всередині скла, вона повністю перевертає келих, а друга долоня
розкривається до гравця. Рідина не перетинає край матової маски, тому кеїнг тут
безпечніший, ніж у будь-якому варіанті з виливанням.

```
A gothic demon sorceress with blue-black twin buns and red roses, in a red and
black dress with dark wings and spiked shoulders, holds a wide coupe glass of
pale gold liquid raised beside her head. The light inside the drink collapses
to violet and the liquid darkens and sinks away until the glass is empty, and
she slowly turns her wrist over until the coupe hangs fully upside down and
holds it there. Nothing falls out of it and nothing spills. Her other hand,
resting on her chest, opens and turns palm up toward the viewer in one small
unhurried offer and stays in front of her chest. She watches the viewer the
whole time with a small closed amused smile, one eyebrow slightly raised, eyes
calm and half-lidded, and blinks twice. Her face, makeup, hair buns, roses,
choker, dress, shoulder spikes, wings and gloves stay identical in every frame,
and her head and shoulders stay in the same place at the same scale. Locked
static camera, no camera movement. Flat solid green screen background,
completely empty and perfectly still. painted 3D mobile-RPG game art,
semi-realistic, high contrast, warm rim lighting.
```

---

## 2. КІЛЬЦЕ НАД СЛОВОМ — VOID ECLIPSE

Ульта Сіланф, кастана на вердикт. Фейєрверк, вивернутий навиворіт: не назовні, а
всередину; не золото, а фіолет у чорне; не безкінечно, а один раз.

Три біти, ~1.7 с: кільце рун проявляється за банером → стискається до центру і
гасне, руни вимикаються по черзі → рештки падають кількома іскрами і зникають.

ПЕРШИЙ КАДР (flux, 704x400, чорний фон):

```
A thin ring of glowing violet arcane runes on a pure black background, drawn as
a flat wide ellipse seen almost edge on, the ring made of small angular rune
glyphs and a fine bright rim. The centre of the ring is completely empty black.
No fog, no haze, no smoke, no glow inside the ring, no background, no texture,
no floor, nothing but the ring and black. Bright violet on black, high
contrast, clean edges, game VFX sheet, no text, no watermark.
```

РУХ (Wan 2.2, 704x400, 33 кадри, ті самі семплер і shift, старт — кадр вище):

```
A thin ring of glowing violet arcane runes on pure black. The ring fades in
brighter, then contracts slowly inward toward its own centre and dims as it
goes, the rune glyphs going out one after another rather than all at once, thin
wisps of violet light dragged inward behind them. The centre of the ring stays
completely empty black the whole time. At the end a few small violet motes
drift down past the bottom edge and fade out. Locked static camera, no camera
movement. The background is pure flat black, completely empty, and nothing is
ever lit except the ring itself. Bright violet on black, high contrast, clean
edges, game VFX sheet.
```

NEGATIVE:

```
text, letters, numbers, watermark, logo, signature, character, person, hands,
face, camera movement, zoom, pan, tilt, orbit, shake, cut, scene change, fog,
haze, smoke, mist, volumetric light, glow filling the centre, lens flare,
bloom over the whole frame, grey background, dark grey, navy, coloured
background, floor, horizon, scenery, props, blur, low quality
```

ПАКУВАННЯ:

```
ffmpeg -framerate 24 -i output/eclipse/v1/f_%05d_.png -c:v libx264 -crf 12 \
  -pix_fmt yuv420p eclipse-v1.mp4

node tools/pack-video-sheet.mjs eclipse-v1.mp4 \
  --crop 704:352:0:24 --frames 20 --cols 4 --cell 384 \
  --key 000000 --similarity 0.02 --blend 0 \
  --out src/assets/outcome/eclipse.webp
```

Без `--flood` і з жорстким чорним ключем: тут немає фігури, яку треба вирізати,
і немає замкнених кишень. `--similarity 0.02` замість дефолтних 0.14, бо на 0.14
тьмяний фіолет у кінці колапсу достатньо близький до чорного, щоб його зрізало —
а це якраз хвіст ефекту.

Правила, які не обговорюються:

- Сіре по чорному, бленд `add`, тінт у рантаймі — як усі шити в
  `src/assets/fx`, див. шапку `art/readyfx.js`. Колір `0xdcb0ff`, арканний тінт
  із `art/plates.js`, не новий.
- **Центр кільця лишається чорним.** На `add` чорне — це прозорість, тому слово
  світить крізь кільце без вуалі й ореолу. Кадр із туманом у центрі — це кадр,
  який засірює DEFEAT.
- Тільки коробка банера, розширена вбік. Нічого над ним, нічого там, де плашка
  RETRY.
- Один прогон, без лупа.

---

## Що дописати в код

Фігура — зроблено. `src/art/toast.js` став `src/art/figures.js` і тримає обидва
кліпи; в `OutcomeScreen` `this.toast` став `this.figure` і бере текстуру за
результатом, а `FIGURE_H`, `FIGURE_W` і `FIGURE_SINK` розведені на перемогу й
поразку. Поразці потрібен свій `SINK`, бо палець у неї біля нижнього краю кадру:
низ спрайта підтикається під банер лише на 4% його висоти, інакше банер з'їдає
саме тицяння. Ноги, обрізані нижнім краєм кадру, ховаються рівно за цим
підтиканням — тому підтикання не можна ні прибрати, ні поглибити.

Кільце: клас `Eclipse` у `src/fx/` — як `fx/fireworks.js`, але без пулу й черги,
один спрайт, один прохід по шиту. Додати в `OutcomeScreen` туди, де фейєрверки,
тобто під банер і над затемненою кімнатою; розмір і позиція — з тієї самої
коробки, на якій висить bloom. Старт там само, де виграшний:
`src/ui/outcome.js:1295`, рядок `if (!this.defeat) this.fireworks.start();`
стає розвилкою. `clear()` на виході, інакше друга поразка програє два кільця
одне поверх одного.

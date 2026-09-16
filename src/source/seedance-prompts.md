# Seedance prompts — паста для феєрверків

Персонажів тут немає: блоки героїв і боса винесені з цього файлу, він тепер
тільки про VFX. Їх можна дістати з історії — `git log -p src/source/seedance-prompts.md`.

Виклик — text to video, без вхідного кадру:

```json
{
  "prompt": "<один блок нижче>",
  "duration": 10,
  "fps": 24,
  "resolution": "720p",
  "camera_fixed": true
}
```

Кадри назовні: `ffmpeg -i clip.mp4 -ss 0 -t 1.2 -vf fps=7 frame-%02d.png`

---

## VFX на чорному — феєрверки

Чорний, а не зелений. Іскра — це тонка напівпрозора смуга світла, і хромакей з неї
з'їдає рівно те, заради чого її генерували: хвіст, мерехтіння і згасання. Тому
феєрверки йдуть тим самим шляхом, що й усі шити в `src/assets/fx` — **світле по
чистому чорному, бленд `add`, альфи немає взагалі.** На `add` чорне і є
прозорість, тож ключ не потрібен: фон гасне сам, а хвіст зберігає кожен
напівтон. Див. шапку `art/readyfx.js`.

Звідси все, що в промті написано двічі: **ніякого диму, серпанку, туману,
атмосферного світіння, bloom на весь кадр, вінєтки і grain.** Будь-що з цього
підіймає чорний над нулем — і на `add` замість феєрверка виходить світлий
прямокутник по всьому спрайту. Так само немає землі, горизонту, міста, дерев,
води, натовпу і зірок: усе це видно в кадрі як сміття, бо чорного, яке б їх
сховало, тут не існує.

Виклик — text to video, без вхідного кадру. Референс тут нічого не тримає, а
стартовий кадр тягне за собою свій же фон:

```json
{
  "prompt": "<один блок нижче>",
  "ratio": "adaptive",
  "duration": 10,
  "fps": 24,
  "resolution": "720p",
  "camera_fixed": true
}
```

### Хвіст

Однаковий для всіх чотирьох, клеїться в кінець кожного блоку. Він і робить
кадр чорним:

```
The background is pure flat black, completely empty and perfectly still: no smoke, no haze, no mist, no fog, no atmospheric glow, no ground, no horizon, no city, no buildings, no trees, no water, no reflections, no crowd, no silhouettes, no stars, no clouds, no moon. Nothing in the frame is lit except the firework itself. Locked-off static camera, no camera movement, no zoom, no push in, no pan, no tilt, no orbit, no shake, no parallax, no cuts, no scene change. No lens flare, no bloom washing over the whole frame, no vignette, no depth of field, no film grain, no motion blur smear. Every burst stays fully inside the frame and never touches the edges. Clean high-contrast game VFX plate, bright light on black, no text, no numbers, no watermark, no logo, no letterboxing.
```

### 1. Півонія — основний

Робоча форма: підйом, круглий розліт, падіння, згасання в нуль. Три залпи за
кліп, кожен цілий, — щоб було з чого вибирати `--range`, а не один вибух на
десять секунд.

```
A fireworks display against pure black. A single thin ember streaks up from the bottom of the frame, slows at the top of its arc and bursts into a wide, perfectly round sphere of hundreds of separate sparks flying outward, each spark a small sharp point of white-hot light dragging one thin bright trail behind it. The sphere expands fast, the sparks slow and arc over, their trails thin out and break into flickering fragments that twinkle and go out one by one until the frame is completely black again. Then a second burst does the same slightly left and higher, and a third slightly right and lower — each one complete and separate: rise, burst, fall, die out to black before the next ember goes up. The sparks are white-hot at the core and fall through warm gold, and the whole burst is a sphere of distinct points and trails rather than a soft glowing cloud.
```

### 2. Верба — для довгої паузи на перемозі

Повільна, важка, золота: те, що добре тримається під банером, поки гравець читає
слово. Хвости майже дістають низу кадру.

```
A single large firework against pure black. An ember rises slowly, hangs, and opens into a tall dome of thick golden trails that arc over the top and droop down like a weeping willow, each trail a long slow streak of burning gold that sags almost to the bottom of the frame, shedding small crackling flakes as it falls, and fades out from the tip back towards its own centre. The trails hang in the air far longer than they take to form, so the shape stands as a drooping dome for most of the clip, then dims trail by trail until the frame is completely black again. One burst only, centred, unhurried, molten gold through amber with white only at the very heart of it.
```

### 3. Тріскітливий залп — для пулу

Дрібні, швидкі, різні. Це те, що `Fireworks.volley` сипле по краях екрана
пачками по дві-три.

```
Small fireworks against pure black. A quick succession of six small bursts, one after another at different places in the frame and at different sizes, each one a tight ball of sharp white sparks that snaps open, crackles for a moment into a scatter of twinkling points and dies out fast, the trails short and stiff rather than long and drooping. The bursts overlap only at their tails, so the frame is nearly black between them and completely black at the end. Sharp, fast, glittering, white going to pale gold.
```

### 4. Кільце з серцевиною — акцент

Один на кліп, для першого кадру перемоги: широке кільце, всередині — друга
дрібна квітка.

```
A single firework against pure black. An ember rises and bursts into a clean flat ring of white sparks expanding outward in a perfect circle, and a fraction of a second later a second, smaller burst of dense gold sparks opens inside the ring at its exact centre. The ring keeps widening and thinning until its sparks flicker out, while the inner flower falls and fades more slowly, and the frame ends completely black. Two shapes, one inside the other, both centred, both of separate crisp sparks with thin trails.
```

### Що з цим робити далі

Кадр чорний, тому пакується не `pack-clip`, а шитом з жорстким чорним ключем,
як і всі інші шити в `src/assets/fx`:

```
node tools/pack-video-sheet.mjs fireworks-v1.mp4 \
  --range 0:72 --frames 24 --cols 6 --cell 256 \
  --key 000000 --similarity 0.02 --blend 0 \
  --out src/assets/fx/firework-peony.webp
```

`--range` вирізає один залп із трьох, `--similarity 0.02` замість дефолтних 0.14
— бо на 0.14 згасаючий хвіст уже достатньо близький до чорного, щоб його
зрізало, а це і є кінець ефекту.

`fx/fireworks.js` зараз крутить `LottieClip(burstClip)` — пул на вісім, кожен
кліп це один постріл у випадковій точці, дзеркалений по x і повернутий на ±0.42.
Щоб замінити його на шит, міняється тільки `free()`: замість `LottieClip` —
флипбук по цьому webp, `blendMode = "add"` лишається як є. Звідси й вимоги до
кадру: **один цілий вибух по центру, кадр починається чорним і закінчується
чорним** — інакше пул почне показувати обрізані хвости чужих залпів.

### Зелений екран, якщо він таки потрібен

У тому ж JSON лежать `prompt_en_green` / `prompt_zh_green` і їхні короткі версії:
ті самі чотири залпи, тільки фон — рівно освітлений хромакейний зелений, і в
промті окремо сказано, що зелене не підсвічується вибухом і не заливає іскри.
Пакується тоді `tools/pack-clip.mjs` (він для цього й написаний), а не шитом з
чорним ключем. Усе, що написано вище, від цього не перестає бути правдою:
хвіст і згасання зріже сам ключ, а напівпрозорі пікселі на межі повернуться
оливковою облямівкою. Чорний варіант лишається основним.

## Удар боса — CLAW RAKE

Окремий файл: `src/source/seedance-boss-rake.json`, англійською і китайською,
повний і короткий.

Це не вільний ефект, а конкретна комірка: `src/assets/fx/claw-sheet.webp`, сітка
5 колонок по 228 px, 10 кадрів — `SHEET` в `art/spells.js`, і пакує її
`node tools/pack-spells.mjs claw --contact`. Той самий чорний фон і той самий
`add`, що й у феєрверків, бо шити спелів грають так само.

Що в промті прибито цвяхами, бо гра вже це малює під ним:

- **колір** — малиновий `0xff3a5a` з ядром `0xffd9e2`. Старий промт просив
  «white hot molten fire», тобто помаранчеве, і painted-шит лягав поверх
  мальованих малинових подряпин, вигуку `0xff5a6e` і хвилі `0xff3a5a` — чотири
  речі одного удару різного кольору;
- **форма** — звужена рана, найширша на третині довжини, з вістрями на обох
  кінцях і рваними краями. Не смуга, не заокруглений брусок, не пряма лінія:
  див. коментар до `Vfx.claw` у `fx/vfx.js`, там та сама геометрія намальована
  вручну;
- **порядок** — три подряпини розкриваються одна за одною через ~40 мс, як у
  `Vfx.claw`. Три, що приходять одним кадром, читаються як графіка поверх
  екрана, а не як рука, що пройшла наскрізь;
- **середня довша і глибша** — рука, а не гребінець.

Той самий текст лежить у `tools/gen-spells.mjs` як `claw`, щоб генератор і
паста не розходились.

**Зелений варіант** — `prompt_*_green` у тому ж файлі, під ноду з референсами.
Там додано те, чого чорна версія не потребує: зелене ніколи не підсвічується
ударом, не дає тіні на себе і не заливає подряпини, а самі подряпини лишаються
малиновими. Пакується тоді не `pack-spells`, а `pack_green` з файлу —
`pack-video-sheet.mjs` з тією самою геометрією 5x228x10, `--flood` проти
оливкової облямівки на рваному краї. На `add` прозоре нічого не додає, тож
кейнутий шит з альфою грається так само, як чорний.

І `references_en` / `references_zh` — що куди вішати в ноді: скрін гри дає
**тільки стиль рендера**, чорні кігті на білому — **тільки силует**, кольорові
рендери — вигляд розжареної рани. Фони жодного з них брати не можна, інакше
модель принесе або білий папір, або саму дошку з гемами.

### Один JSON-масив на всі чотири

`src/source/seedance-victory-fireworks.json` — ті самі чотири блоки, кожен уже
з хвостом усередині, англійською і китайською, плюс `call`, негативи і команда
пакування. Копіюється цілим масивом у будь-який рантер.

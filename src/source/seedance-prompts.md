# Seedance prompts — paste-ready

`bytedance/seedance-1-pro` on Replicate, image to video. Same call every time,
only `prompt` and `image` change:

```json
{
  "prompt": "<one block from below>",
  "image": "<the seed image named with that block>",
  "duration": 5,
  "resolution": "480p",
  "camera_fixed": true,
  "seed": 1
}
```

Frames out: `ffmpeg -i clip.mp4 -ss 0 -t 1.2 -vf fps=7 frame-%02d.png`

---

## Hero idle — 6

### RICKLOW · fire · seed `src/assets/heroes/portrait-fire.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A fire hero stands at attention in a card portrait and breathes slowly, embers drifting up past his shoulders, the lava seams in his armour pulsing slowly brighter and dimmer, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### ARISSA · water · seed `src/assets/heroes/portrait-water.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A water heroine stands at attention in a card portrait and breathes slowly, her hair floating as if underwater, a slow ripple of light crossing her armour, frost motes drifting down, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### QUINNTO · nature · seed `src/assets/heroes/portrait-nature.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A nature king stands at attention in a card portrait and breathes slowly, leaves turning in the air past his shoulders, the green gem in his crown breathing light, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### SELISA · lightning · seed `src/assets/heroes/portrait-lightning.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A lightning heroine stands at attention in a card portrait and breathes slowly, small electric arcs crawling over her armour, her hair lifting in the static charge, a flicker of light in her eyes, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### SILANTH · arcane · seed `src/assets/heroes/portrait-arcane.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. An arcane sorceress stands at attention in a card portrait and breathes slowly, violet runes fading in and out around her head, her hair moving in a slow current, her eyes glowing brighter and dimmer, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### TARANIS · wind · seed `src/assets/heroes/portrait-wind.webp`

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A wind warrior stands at attention in a card portrait and breathes slowly, his white hair blown by a steady wind from one side, thin streaks of air passing behind his shoulders, subtle idle animation, the pose barely changes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

---

## Hero attack — 6

Same six seed images.

### RICKLOW · MAGMA LANCE

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A fire hero casts MAGMA LANCE: he raises one hand and a spear of molten rock forms in his grip, orange light running up the shaft, embers thrown off it, the lava seams in his armour flaring brighter, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### ARISSA · ABYSSAL TIDE

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A water heroine casts ABYSSAL TIDE: she lifts both hands and a curl of deep blue water rises past her shoulders behind her, light rippling across her face and armour, frost motes drifting through it, the water never crosses in front of her face, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### QUINNTO · VERDANT WRATH

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A nature king casts VERDANT WRATH: thorned vines coil up around his shoulders and green light gathers in the gem of his crown, leaves torn loose and turning in the air, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### SELISA · STORM VERDICT

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A lightning heroine casts STORM VERDICT: lightning gathers over her open palm and forks across her armour, her hair lifting in the charge, the light flickering in her eyes, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### SILANTH · VOID ECLIPSE

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. An arcane sorceress casts VOID ECLIPSE: a ring of violet runes opens behind her head and dark light collapses inward through it, her hair moving in the pull, the ring stays behind her and never covers her face, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### TARANIS · CYCLONE EDGE

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A wind warrior casts CYCLONE EDGE: wind spirals up around him, his white hair and collar snapping to one side, pale streaks of air cutting past his shoulders, the head stays centred and the face stays fully visible, the body turns no more than a few degrees. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

---

## Boss — 5

Seed all five with one cut cell of `src/assets/boss/magmaroth-sheet.webp`
(top-left cell, 254x204).

### Idle

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A massive lava golem of black volcanic rock with molten orange seams stands still and breathes, its chest core pulsing slowly brighter and dimmer, the seams across its rock plates rising and falling with it, small embers lifting off its shoulders, the golem's feet stay planted in the same spot and it never steps or leans out of frame. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### Charge

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A massive lava golem of black volcanic rock with molten orange seams raises both fists overhead and fire gathers between them, its chest core burning brighter as it draws in, the seams across its body running white hot, the golem's feet stay planted in the same spot and it never steps or leans out of frame. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### LAVA BREATH

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A massive lava golem of black volcanic rock with molten orange seams opens its jaw wide and a jet of fire pours straight forward out of its maw, the light of it throwing up across its own chest and arms, the golem's feet stay planted in the same spot and it never steps or leans out of frame. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### MAGMA SLAM

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A massive lava golem of black volcanic rock with molten orange seams lifts both fists high and drives them down in one heavy overhead slam, the impact throwing sparks and dust out to both sides, the golem's feet stay planted in the same spot and it never steps or leans out of frame. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

### ERUPTION

```
painted 3D mobile-RPG game art, semi-realistic, warm rim lighting, high contrast, no flat cartoon shading. A massive lava golem of black volcanic rock with molten orange seams throws both arms wide and its chest core flares to white, fire bursting outward from every seam in its body at once, the golem's feet stay planted in the same spot and it never steps or leans out of frame. Single continuous shot, one fixed camera, no cuts, no shot changes, no camera movement, no zoom, no push in, no orbit, no parallax, the subject stays centred at the same scale for the whole clip and never leaves frame, nothing new enters the shot, plain flat white background, the background never moves, no text, no numbers, no watermark.
```

---

## VFX на чорному — феєрверки

Не зелений екран. Іскра — це тонка напівпрозора смуга світла, і хромакей з неї
з'їдає рівно те, заради чого її генерували: хвіст, мерехтіння і згасання. Тому
феєрверки йдуть тим самим шляхом, що й усі шити в `src/assets/fx` — **світле по
чистому чорному, бленд `add`, альфи немає взагалі.** На `add` чорне і є
прозорість, тож ключ не потрібен: фон гасне сам, а хвіст зберігає кожен
напівтон. Див. шапку `art/readyfx.js` і кільце в `silanth-defeat.md`.

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

Кадр чорний, тому пакується не `pack-clip`, а шитом з жорстким чорним ключем —
як кільце Сіланф:

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

### Один JSON-масив на всі чотири

`src/source/seedance-victory-fireworks.json` — ті самі чотири блоки, кожен уже
з хвостом усередині, англійською і китайською, плюс `call`, негативи і команда
пакування. Копіюється цілим масивом у будь-який рантер.

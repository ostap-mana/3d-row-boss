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

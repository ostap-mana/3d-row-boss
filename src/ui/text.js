export function fitFont(text, maxWidth, idealSize, minSize) {
  const floor = minSize === undefined ? 8 : minSize;
  const wasScaleX = text.scale.x;
  const wasScaleY = text.scale.y;
  text.scale.set(1);

  text.style.fontSize = idealSize;
  if (text.width > maxWidth && text.width > 0) {
    const fitted = Math.max(floor, (idealSize * maxWidth) / text.width);
    text.style.fontSize = fitted;
  }

  text.scale.set(wasScaleX, wasScaleY);
  return text.style.fontSize;
}

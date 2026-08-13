/**
 * Text fitting.
 *
 * The creative ships one layout for every phone from a 375pt SE to a foldable,
 * so any headline long enough to overflow gets its point size pulled down
 * rather than being clipped at the screen edge.
 */

/**
 * Shrink a Text until it fits, starting from the ideal size.
 * Adjusts the font size (crisp) instead of the scale (blurry, and reserved
 * for animation).
 */
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

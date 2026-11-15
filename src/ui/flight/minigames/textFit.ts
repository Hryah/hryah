export interface FittedTextOptions {
  fontFamily?: string;
  fontWeight?: string | number;
  fontSize: number;
  minFontSize?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  color?: string;
}

/**
 * Рендерить рядок тексту суворо в межах maxWidth:
 * спочатку зменшує розмір шрифту до minFontSize, а за потреби обрізає з "…".
 */
export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: FittedTextOptions,
): void {
  const {
    fontFamily = "monospace",
    fontWeight = 700,
    fontSize,
    minFontSize = 9,
    align = "left",
    baseline = "alphabetic",
    color,
  } = options;

  const safeMaxWidth = Math.max(8, maxWidth);
  let currentSize = fontSize;
  let fitted = text;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (color) {
    ctx.fillStyle = color;
  }

  while (currentSize > minFontSize) {
    ctx.font = `${fontWeight} ${currentSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= safeMaxWidth) {
      break;
    }
    currentSize = Math.max(minFontSize, currentSize - 0.5);
  }

  ctx.font = `${fontWeight} ${currentSize}px ${fontFamily}`;
  if (ctx.measureText(fitted).width > safeMaxWidth) {
    const ellipsis = "…";
    let lo = 0;
    let hi = fitted.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = fitted.slice(0, mid).trimEnd() + ellipsis;
      if (ctx.measureText(candidate).width <= safeMaxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    fitted = lo > 0 ? fitted.slice(0, lo).trimEnd() + ellipsis : ellipsis;
  }

  ctx.fillText(fitted, x, y, safeMaxWidth);
  ctx.restore();
}

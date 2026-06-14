/** Extract bit width from a type name like U8, I32, F64 => 8, 32, 64. */
export function getTypeBitWidth(typeName: string): number {
  const match = typeName.match(/(\d+)/);
  return match && match[1] ? parseInt(match[1], 10) : 0;
}

const BIT_WIDTHS = [8, 16, 32, 64];

function nextWiderBitWidth(width: number): number {
  const idx = BIT_WIDTHS.indexOf(width);
  if (idx >= 0 && idx < BIT_WIDTHS.length - 1) return BIT_WIDTHS[idx + 1]!;
  return width * 2;
}

const DEFAULT_TYPE = "I32";

/** Given two type names, return the promoted type. */
export function promoteTypes(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a || !b) return undefined;
  const aWidth = getTypeBitWidth(a);
  const bWidth = getTypeBitWidth(b);

  if (aWidth === 0 && bWidth === 0) return a === b ? a : undefined;
  if (a === DEFAULT_TYPE && b !== DEFAULT_TYPE) return b;
  if (b === DEFAULT_TYPE && a !== DEFAULT_TYPE) return a;

  if (aWidth === bWidth && a !== b) {
    const wider = nextWiderBitWidth(aWidth);
    return `I${wider}`;
  }

  if (bWidth <= aWidth) return a;
  return b;
}

/** Check if inferred type can safely widen to the annotated type. */
export function isSafeWiden(inferred: string, annotated: string): boolean {
  const iWidth = getTypeBitWidth(inferred);
  const aWidth = getTypeBitWidth(annotated);
  if (iWidth === 0 || aWidth === 0) return inferred === annotated;
  const sameSign = inferred[0]!.toLowerCase() === annotated[0]!.toLowerCase();
  return sameSign && iWidth <= aWidth;
}

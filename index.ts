function parseExpression(src: string): string {
  return parseAddition(src.trim());
}

function parseAddition(src: string): string {
  const parts = src.split(/ \+ /);
  if (parts.length === 1) {
    return parseNumber(parts[0]!.trim());
  }
  const left = parseAddition(parts.slice(0, -1).join(" + "));
  const right = parseNumber(parts[parts.length - 1]!.trim());
  return `(${left} + ${right})`;
}

function parseNumber(src: string): string {
  const trimmed = src.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return trimmed;
  }
  return "0";
}

export function compileTuffToJS(tuffSource: string): string {
  const lastSemi = tuffSource.lastIndexOf(";");
  const tail = lastSemi >= 0 ? tuffSource.slice(lastSemi + 1) : tuffSource;
  const expr = parseExpression(tail);
  return `return ${expr};`;
}

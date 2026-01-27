import {
  isIdentifierChar,
  isIdentifierStartChar,
  isWhitespace,
} from "../../parsing/string-helpers";
import { findMatchingCloseBrace } from "../../../utils/helpers/brace-utils";

function escapeJsStringLiteral(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else out += ch;
  }
  return out;
}

function readIdentifier(
  source: string,
  startIdx: number,
): { name: string; endIdx: number } | undefined {
  if (startIdx >= source.length) return undefined;
  const first = source[startIdx];
  if (!isIdentifierStartChar(first)) return undefined;

  let i = startIdx + 1;
  while (i < source.length && isIdentifierChar(source[i]!)) i++;
  return { name: source.slice(startIdx, i), endIdx: i };
}

function tryTransformObjectInstantiationAt(p: {
  source: string;
  i: number;
  objectNames: Set<string>;
}): { replacement: string; nextIdx: number } | undefined {
  const { source, objectNames } = p;
  const i = p.i;

  if (source[i] !== "&") return undefined;

  // Skip logical AND (&&)
  if (i > 0 && source[i - 1] === "&") return undefined;

  let j = i + 1;
  while (j < source.length && isWhitespace(source[j]!)) j++;

  // Optional `mut`
  if (
    source.slice(j, j + 3) === "mut" &&
    j + 3 < source.length &&
    isWhitespace(source[j + 3]!)
  ) {
    j += 3;
    while (j < source.length && isWhitespace(source[j]!)) j++;
  }

  const parsedId = readIdentifier(source, j);
  if (!parsedId) return undefined;

  const objectName = parsedId.name;
  let k = parsedId.endIdx;
  while (k < source.length && isWhitespace(source[k]!)) k++;

  if (k >= source.length || source[k] !== "{") return undefined;
  if (!objectNames.has(objectName)) return undefined;

  const closeIdx = findMatchingCloseBrace(source, k);
  if (closeIdx === -1) return undefined;

  const fields = source.slice(k + 1, closeIdx).trim();
  // Avoid `::` in the key because later compiler passes also scan inside strings.
  const key = `${objectName}@@${fields}`;
  const escapedKey = escapeJsStringLiteral(key);
  return {
    replacement: `__tuffObjectInstance("${escapedKey}")`,
    nextIdx: closeIdx + 1,
  };
}

export function transformObjectInstantiations(
  source: string,
  objectNames: Set<string>,
): { source: string; needsRuntime: boolean } {
  let result = "";
  let i = 0;
  let needsRuntime = false;

  while (i < source.length) {
    const transformed = tryTransformObjectInstantiationAt({
      source,
      i,
      objectNames,
    });
    if (transformed) {
      result += transformed.replacement;
      needsRuntime = true;
      i = transformed.nextIdx;
      continue;
    }

    result += source[i]!;
    i++;
  }

  return { source: result, needsRuntime };
}

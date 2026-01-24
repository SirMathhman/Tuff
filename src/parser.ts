import {
  extractUnsignedSize,
  validateUnsignedValue,
  type TypedInfo,
} from "./type-utils";
import { createString } from "./utils/array";

export type { TypedInfo };

function parseCharLiteral(s: string): number | undefined {
  if (s.length < 2 || s[0] !== "'" || s[s.length - 1] !== "'") {
    return undefined;
  }
  const content = s.slice(1, -1);
  if (content.length === 0) {
    throw new Error("empty char literal");
  }
  if (content.length === 1) {
    return content.charCodeAt(0);
  }
  // Handle escape sequences
  if (content[0] === "\\" && content.length >= 2) {
    const escape = content[1];
    if (content.length === 2) {
      switch (escape) {
        case "n":
          return 10; // newline
        case "t":
          return 9; // tab
        case "r":
          return 13; // carriage return
        case "\\":
          return 92; // backslash
        case "'":
          return 39; // single quote
        case '"':
          return 34; // double quote
        default:
          throw new Error(`unknown escape sequence: \\${escape}`);
      }
    }
  }
  throw new Error(`multi-character literal: ${s}`);
}

function parseStringLiteral(s: string): number | undefined {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') {
    return undefined;
  }
  const content = s.slice(1, -1);
  let result = "";
  let i = 0;
  while (i < content.length) {
    if (content[i] === "\\") {
      if (i + 1 < content.length) {
        const escape = content[i + 1];
        switch (escape) {
          case "n":
            result += "\n";
            i += 2;
            break;
          case "t":
            result += "\t";
            i += 2;
            break;
          case "r":
            result += "\r";
            i += 2;
            break;
          case "\\":
            result += "\\";
            i += 2;
            break;
          case '"':
            result += '"';
            i += 2;
            break;
          case "'":
            result += "'";
            i += 2;
            break;
          default:
            throw new Error(`unknown escape sequence: \\${escape}`);
        }
      } else {
        result += content[i];
        i++;
      }
    } else {
      result += content[i];
      i++;
    }
  }
  return createString(result);
}

export function scanNumericPrefix(s: string): number {
  const len = s.length;
  let i = 0;
  if (s[i] === "+" || s[i] === "-") i++;
  let hasDigits = false;
  while (i < len) {
    const ch = s[i];
    if (ch && ch >= "0" && ch <= "9") {
      hasDigits = true;
      i++;
    } else break;
  }
  if (i < len && s[i] === ".") {
    i++;
    while (i < len) {
      const ch = s[i];
      if (ch && ch >= "0" && ch <= "9") {
        hasDigits = true;
        i++;
      } else break;
    }
  }
  return hasDigits ? i : 0;
}

export function extractTypedInfo(s: string): TypedInfo {
  const stringId = parseStringLiteral(s);
  if (stringId !== undefined) return { value: stringId, typeSize: -1 };
  const charCode = parseCharLiteral(s);
  if (charCode !== undefined) return { value: charCode, typeSize: 8 };
  const b = s === "true" ? 1 : s === "false" ? 0 : NaN;
  if (Number.isFinite(b)) return { value: b, typeSize: 1 };
  const prefixEnd = scanNumericPrefix(s);
  if (prefixEnd === 0) {
    return {
      value: Number.isFinite(Number(s)) ? Number(s) : 0,
      typeSize: 0,
    };
  }
  const numStr = s.slice(0, prefixEnd);
  const n = Number(numStr);
  const typeSize = extractUnsignedSize(s.slice(prefixEnd));
  return { value: n, typeSize };
}

export function parseTypedNumber(s: string): number {
  const stringId = parseStringLiteral(s);
  if (stringId !== undefined) return stringId;
  const charCode = parseCharLiteral(s);
  if (charCode !== undefined) return charCode;
  const b = s === "true" ? 1 : s === "false" ? 0 : NaN;
  if (Number.isFinite(b)) return b;
  const prefixEnd = scanNumericPrefix(s);
  if (prefixEnd === 0) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`invalid expression: ${s}`);
    return n;
  }
  const n = Number(s.slice(0, prefixEnd)),
    suffix = s.slice(prefixEnd).trim(),
    typeSize = extractUnsignedSize(suffix);
  if (typeSize > 0 && n < 0) throw new Error("bad value");
  if (typeSize > 0) validateUnsignedValue(n, typeSize);
  if (!Number.isFinite(n)) throw new Error(`invalid expression: ${s}`);
  return n;
}

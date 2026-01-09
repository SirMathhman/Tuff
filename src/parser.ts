export function splitTopLevelStatements(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]")
      depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/**
 * Find matching closing parenthesis starting from an opening paren position
 * Returns the index of the closing paren, or -1 if unbalanced
 */
export function findMatchingClosingParen(
  src: string,
  startPos: number
): number {
  let depth = 0;
  for (let k = startPos; k < src.length; k++) {
    const ch = src[k];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return k;
      }
    }
  }
  return -1;
}

/**
 * Find matching closing delimiter (supports parens, braces, brackets)
 * Returns the index of the closing delimiter, or -1 if unbalanced
 */
export function findMatchingDelimiter(
  src: string,
  startPos: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 0;
  for (let k = startPos; k < src.length; k++) {
    const ch = src[k];
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return k;
      }
    }
  }
  return -1;
}

/**
 * Parse comma-separated arguments from a string, respecting nested parens and braces
 * Returns array of trimmed argument strings
 */
export function parseCommaSeparatedArgs(inner: string): string[] {
  const args: string[] = [];
  if (inner.trim() === "") return args;

  let cur = "";
  let d = 0;
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k];
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d = Math.max(0, d - 1);
    if (ch === "," && d === 0) {
      args.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return args;
}

function unescapeString(inner: string) {
  return inner.replace(/\\([\\"'nrtb])/g, (m, ch) => {
    if (ch === "n") return "\n";
    if (ch === "r") return "\r";
    if (ch === "t") return "\t";
    if (ch === "b") return "\b";
    return ch;
  });
}

export function parseOperand(token: string) {
  const s = token.trim();
  // string literal (single or double quoted) - simple unescape for common escapes
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    const inner = s.slice(1, -1);
    const unescaped = unescapeString(inner);
    return unescaped;
  }

  // boolean literals
  if (/^true$/i.test(s)) return { boolValue: true };
  if (/^false$/i.test(s)) return { boolValue: false };

  // Match integer or float with optional suffix attached (e.g., 123, 1.23, 100U8)
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)([uUiI]\d+)?$/);
  if (!m) return undefined;
  const numStr = m[1];
  const suffix = m[2];

  if (suffix) {
    const sufMatch = suffix.match(/^([uUiI])(\d+)$/)!;
    const kind = sufMatch[1];
    const bits = Number(sufMatch[2]);
    // Suffix requires integer (no decimal part)
    if (!/^[-+]?\d+$/.test(numStr))
      throw new Error("suffix requires integer value");
    const valueBig = BigInt(numStr);
    if (kind === "u" || kind === "U") {
      if (valueBig < 0n)
        throw new Error("negative numbers with suffixes are not allowed");
      const max = (1n << BigInt(bits)) - 1n;
      if (valueBig > max) throw new Error(`value out of range for U${bits}`);
      return { valueBig, kind: "u", bits };
    }
    // signed
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (valueBig < min || valueBig > max)
      throw new Error(`value out of range for I${bits}`);
    return { valueBig, kind: "i", bits };
  }

  // no suffix: accept float or integer
  if (numStr.includes(".")) {
    return { floatValue: Number(numStr), isFloat: true };
  }
  return { valueBig: BigInt(numStr), isFloat: false };
}

export function stripAndValidateComments(input: string) {
  let out = "";
  let i = 0;
  const L = input.length;
  let state: "normal" | "line" | "block" | "string" = "normal";
  let quote: string | undefined = undefined;
  while (i < L) {
    if (state === "normal") {
      if (input.startsWith("//", i)) {
        state = "line";
        i += 2;
        continue;
      }
      if (input.startsWith("/*", i)) {
        state = "block";
        i += 2;
        continue;
      }
      const ch = input[i];
      if (ch === '"' || ch === "'") {
        quote = ch;
        state = "string";
        out += ch;
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (state === "line") {
      // consume until newline or EOF
      const ch = input[i];
      if (ch === "\n") {
        out += ch;
        state = "normal";
      }
      i++;
      continue;
    }
    if (state === "block") {
      if (input.startsWith("/*", i)) {
        throw new Error("nested block comment");
      }
      if (input.startsWith("*/", i)) {
        i += 2;
        state = "normal";
        continue;
      }
      i++;
      continue;
    }
    if (state === "string") {
      const ch = input[i];
      if (ch === "\\") {
        // escape, copy next char as well if present
        out += input.substr(i, 2);
        i += 2;
        continue;
      }
      out += ch;
      if (ch === quote) {
        state = "normal";
        quote = undefined;
      }
      i++;
      continue;
    }
  }
  if (state === "block") throw new Error("unterminated block comment");
  return out;
}

export function parseOperandAt(src: string, pos: number) {
  // Support unary address-of '&' and dereference '*' prefixes (allow multiple)
  let i = pos;
  let prefixes: string[] = [];
  while (i < src.length && /[\s]/.test(src[i])) i++;
  while (i < src.length && (src[i] === "&" || src[i] === "*")) {
    prefixes.push(src[i]);
    i++;
    while (i < src.length && /[\s]/.test(src[i])) i++;
  }

  // parenthesized grouped expression: treat as an operand so callers may access fields like `(*p).length`
  if (src[i] === "(") {
    const endIdx = findMatchingDelimiter(src, i, "(", ")");
    if (endIdx === -1) throw new Error("unbalanced parentheses");
    const inner = src.slice(i + 1, endIdx);
    const operand = applyPrefixes({ groupedExpr: inner }, prefixes);
    return { operand, len: i - pos + (endIdx - i + 1) };
  }

  // string literal starting with quote
  if (src[i] === '"' || src[i] === "'") {
    const quote = src[i];
    let j = i + 1;
    let closed = false;
    while (j < src.length) {
      if (src[j] === "\\") {
        j += 2; // skip escaped char
        continue;
      }
      if (src[j] === quote) {
        closed = true;
        break;
      }
      j++;
    }
    if (!closed) throw new Error("unclosed string literal");
    const inner = src.slice(i + 1, j);
    const unescaped = unescapeString(inner);
    const operand = applyPrefixes(unescaped, prefixes);
    return { operand, len: i - pos + (j - i + 1) };
  }

  // array literal starting with '['
  if (src[i] === "[") {
    const endIdx = findMatchingDelimiter(src, i, "[", "]");
    if (endIdx === -1) throw new Error("unbalanced brackets in array literal");
    const inner = src.slice(i + 1, endIdx).trim();
    const parts = parseCommaSeparatedArgs(inner);
    const operand = applyPrefixes({ arrayLiteral: parts }, prefixes);
    return { operand, len: i - pos + (endIdx - i + 1) };
  }

  // Try numeric/suffixed literal or boolean literal first
  const m = src
    .slice(i)
    .match(/^([+-]?\d+(?:\.\d+)?(?:[uUiI]\d+)?|true|false)/i);
  function applyPrefixes(operand: unknown, prefixes: string[]) {
    let op = operand;
    for (let p = prefixes.length - 1; p >= 0; p--) {
      const pr = prefixes[p];
      if (pr === "&") op = { addrOf: op };
      else op = { deref: op };
    }
    return op;
  }

  if (m) {
    const innerOperand = parseOperand(m[1]);
    if (!innerOperand) throw new Error("invalid operand");
    const operand = applyPrefixes(innerOperand, prefixes);
    return { operand, len: i - pos + m[1].length };
  }
  // fallback: identifier
  const id = src.slice(i).match(/^([a-zA-Z_]\w*)/);
  if (id) {
    // detect function call syntax `name(...)` or struct instantiation `name { ... }`
    let operand: { [k: string]: unknown } = { ident: id[1] };

    // look ahead for parentheses or braces (allow whitespace)
    let j = i + id[1].length;
    while (j < src.length && /[\s]/.test(src[j])) j++;
    if (src[j] === "(") {
      const endIdx = findMatchingClosingParen(src, j);
      if (endIdx === -1) throw new Error("unbalanced parentheses in call");
      const inner = src.slice(j + 1, endIdx);
      const args = parseCommaSeparatedArgs(inner);
      operand.callArgs = args;
      operand = applyPrefixes(operand, prefixes);
      return { operand, len: i - pos + id[1].length + (endIdx - j + 1) };
    } else if (src[j] === "{") {
      // struct instantiation: Name { field1: value1, field2: value2, ... }
      const endIdx = findMatchingDelimiter(src, j, "{", "}");
      if (endIdx === -1)
        throw new Error("unbalanced braces in struct instantiation");
      const inner = src.slice(j + 1, endIdx).trim();
      // Parse field assignments (comma-separated, but values can have operators)
      const fieldParts = parseCommaSeparatedArgs(inner);
      const fields: Array<{ name: string; value: string }> = [];
      for (const fieldPart of fieldParts) {
        const fm = fieldPart.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
        if (!fm) {
          // Allow positional fields if they're just values
          fields.push({ name: `_${fields.length}`, value: fieldPart });
        } else {
          fields.push({ name: fm[1], value: fm[2].trim() });
        }
      }
      operand.structInstantiation = { name: id[1], fields };
      operand = applyPrefixes(operand, prefixes);
      // len should be from start position i to endIdx (inclusive of closing brace)
      return { operand, len: i - pos + (endIdx - i + 1) };
    }

    operand = applyPrefixes(operand, prefixes);
    return { operand, len: i - pos + id[1].length };
  }
  return undefined;
}

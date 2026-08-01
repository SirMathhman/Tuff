import type { Token } from "./ast";
import { OPERATORS } from "./ast";
import type { Result } from "./result";
import { ok, err } from "./result";
import type { CompileError } from "./compileError";
import { compileError } from "./compileError";

// Lookup from operator symbol -> token type, longest symbols first so that
// multi-character operators (e.g. "||") are matched before single-character ones.
const SYMBOL_TO_TYPE = [...OPERATORS.entries()]
  .sort((a, b) => b[1].symbol.length - a[1].symbol.length)
  .map(([type, info]) => [info.symbol, type] as const);

export function tokenize(source: string): Result<Token[], CompileError> {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (
      source[i] === " " ||
      source[i] === "\t" ||
      source[i] === "\n" ||
      source[i] === "\r"
    ) {
      i++;
      continue;
    }

    // Number literal
    const charCode = source.charCodeAt(i);
    if (charCode !== undefined && charCode >= 48 && charCode <= 57) {
      let num = "";
      while (i < source.length) {
        const c = source.charCodeAt(i);
        if (c === undefined) break;
        if ((c >= 48 && c <= 57) || c === 46) {
          num += source[i];
          i++;
        } else {
          break;
        }
      }
      // Optional type suffix (e.g. "U8" in "100U8")
      let suffix: string | undefined;
      if (source.startsWith("U8", i)) {
        suffix = "U8";
        i += 2;
      }
      tokens.push({ type: "number", value: Number(num), suffix });
      continue;
    }

    // Identifier or keyword
    const ch = source[i]!;
    if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_" ||
      ch === "$"
    ) {
      let name = "";
      while (i < source.length) {
        const c = source[i]!;
        if (
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "_" ||
          c === "$"
        ) {
          name += c;
          i++;
        } else {
          break;
        }
      }
      if (name === "let") {
        tokens.push({ type: "let" });
      } else if (name === "mut") {
        tokens.push({ type: "mut" });
      } else if (name === "if") {
        tokens.push({ type: "if" });
      } else if (name === "else") {
        tokens.push({ type: "else" });
      } else if (name === "while") {
        tokens.push({ type: "while" });
      } else if (name === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (name === "false") {
        tokens.push({ type: "boolean", value: false });
      } else {
        tokens.push({ type: "identifier", name });
      }
      continue;
    }

    // Compound assignment operators (not binary operators, so not in OPERATORS)
    if (source.startsWith("+=", i)) {
      tokens.push({ type: "plus_equals" });
      i += 2;
      continue;
    }

    // Operator tokens (from the centralized OPERATORS table)
    let matched = false;
    for (const [symbol, type] of SYMBOL_TO_TYPE) {
      if (source.startsWith(symbol, i)) {
        tokens.push({ type } as Token);
        i += symbol.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-character tokens
    const char = source[i]!;
    if (char === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "lbrace" });
      i++;
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "rbrace" });
      i++;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "dot" });
      i++;
      continue;
    }
    if (char === "=") {
      tokens.push({ type: "equals" });
      i++;
      continue;
    }
    if (char === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }

    // Unknown character: fail loudly instead of silently skipping
    return err(
      compileError("syntax", "Unexpected character: '" + char + "'"),
    );
  }

  tokens.push({ type: "eof" });
  return ok(tokens);
}

import { makeDuplicateError } from "./errors";
import type { ParseDeclarationsResult, VarDeclaration } from "./types";

function skipWhitespace(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) i++;
  return i;
}

function parseBracketedType(input: string, start: number): string | undefined {
  const close = input.indexOf("]", start + 1);
  if (close === -1) return undefined;
  return input.slice(start, close + 1).trim();
}

function parseSimpleType(input: string, start: number): string | undefined {
  let i = start;
  while (
    i < input.length &&
    input[i] !== "=" &&
    input[i] !== ";" &&
    input[i] !== "\n" &&
    input[i] !== "\r"
  ) {
    i++;
  }
  const raw = input.slice(start, i).trim();
  return raw || undefined;
}

function parseTypeAnnotationAfterName(
  input: string,
  start: number
): string | undefined {
  let i = skipWhitespace(input, start);
  if (input[i] !== ":") return undefined;
  i++;
  i = skipWhitespace(input, i);
  if (input[i] === "[") return parseBracketedType(input, i);
  return parseSimpleType(input, i);
}

export function parseDeclarations(input: string): ParseDeclarationsResult {
  // Capture optional type annotations like `: I32`, `: &Str`, `: *mut I32`, or `: [I32; 0; 2]`.
  // We avoid a single "capture everything" regex because array types contain semicolons.
  const decls = new Map<string, VarDeclaration>();
  const declStartRe = /\blet\s+(mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m: RegExpExecArray | undefined;
  while (
    (m = declStartRe.exec(input) as unknown as RegExpExecArray | undefined)
  ) {
    const mut = !!m[1];
    const varName = m[2];
    if (decls.has(varName)) {
      return {
        decls,
        error: makeDuplicateError("variable declaration", varName),
      };
    }

    const afterNameIdx = (m.index ?? 0) + m[0].length;
    const type = parseTypeAnnotationAfterName(input, afterNameIdx);

    // Determine whether this declaration has an initializer by looking ahead
    // to the next semicolon/newline and checking for an '=' before that.
    let stmtEnd = input.indexOf(";", afterNameIdx);
    const nl = input.indexOf("\n", afterNameIdx);
    if (stmtEnd === -1 || (nl !== -1 && nl < stmtEnd)) stmtEnd = nl;
    if (stmtEnd === -1) stmtEnd = input.length;
    const between = input.slice(afterNameIdx, stmtEnd);
    const initialized = between.indexOf("=") !== -1;

    decls.set(varName, { mut, type, initialized });
  }
  return { decls };
}

export function stripAnnotationsAndMut(replaced: string): string {
  // support Char, &Str and pointer annotations like *I32 or *mut I32
  replaced = replaced.replace(
    /:\s*(?:I32|ISize|USize|Bool|Char|&Str|[*](?:I32|ISize|USize)|\*\s*mut\s*[A-Za-z_$][A-Za-z0-9_$]*)\b/g,
    ""
  );
  // strip bracketed array annotations like `[I32; 3; 3]`
  replaced = replaced.replace(/:\s*\[[^\]]*\]/g, "");
  replaced = replaced.replace(/\b(let|var|const)\s+mut\b/g, "$1");
  return replaced;
}

export function checkImmutableAssignments(
  replaced: string,
  decls: Map<string, VarDeclaration>
): string | undefined {
  if (decls.size === 0) return undefined;
  const withoutDecls = replaced.replace(/\blet\b[^;]*;/g, "");
  for (const [name, info] of decls.entries()) {
    // Allow a single later assignment to a variable that was declared without an
    // initializer (e.g., `let x : I32; x = read<I32>();`) even if not marked
    // `mut`. But if the variable had an initializer in the declaration, it's
    // immutable unless `mut` is specified.
    if (!info.mut && info.initialized) {
      // Match plain assignment `=` (excluding `==`) or compound assignment operators like `+=`.
      const assignRegex = new RegExp(
        "\\b" + name + "\\s*(?:\\+=|-=|\\*=|/=|%=|<<=|>>=|&=|\\|=|\\^=|=(?!=))"
      );
      if (assignRegex.test(withoutDecls)) {
        return `(function(){ throw new Error("assignment to immutable variable '${name}'"); })()`;
      }
    }
  }
  return undefined;
}

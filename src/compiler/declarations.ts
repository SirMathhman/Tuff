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
    decls.set(varName, { mut, type });
  }
  return { decls };
}

export function stripAnnotationsAndMut(replaced: string): string {
  // support Char, &Str and pointer annotations like *I32 or *mut I32
  replaced = replaced.replace(
    /:\s*(?:I32|Bool|Char|&Str|[*]I32|\*\s*mut\s*[A-Za-z_$][A-Za-z0-9_$]*)\b/g,
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
    if (!info.mut) {
      const assignRegex = new RegExp("\\b" + name + "\\s*=");
      if (assignRegex.test(withoutDecls)) {
        return `(function(){ throw new Error("assignment to immutable variable '${name}'"); })()`;
      }
    }
  }
  return undefined;
}

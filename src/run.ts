/**
 * Compile a string into JavaScript source that evaluates to a number
 */

interface VarDeclaration {
  mut: boolean;
}

export function compile(input: string): string {
  // Normalize input
  const trimmed = input.trim();

  // Replace all occurrences of `read<I32>()` with calls to a runtime helper
  // function `readI32()` which `run` will provide when evaluating.
  const readI32Regex = /read<\s*I32\s*>\s*\(\s*\)/g;
  let replaced = trimmed.replace(readI32Regex, "readI32()");

  // Replace all occurrences of `read<Bool>()` with calls to a runtime helper
  // function `readBool()` which `run` will provide when evaluating.
  const readBoolRegex = /read<\s*Bool\s*>\s*\(\s*\)/g;
  replaced = replaced.replace(readBoolRegex, "readBool()");

  // Track declarations and whether they are mutable so we can detect
  // illegal assignments to immutable variables.
  const declRegex = /\blet\s+(mut\s+)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  const decls = new Map<string, VarDeclaration>();
  let m: RegExpExecArray | undefined;
  // exec returns null but we're treating it as falsy, so cast to unknown
  while (
    (m = declRegex.exec(trimmed) as unknown as RegExpExecArray | undefined)
  ) {
    const varName = m[2];
    if (decls.has(varName)) {
      return `(function(){ throw new Error("duplicate variable declaration '${varName}'"); })()`;
    }
    decls.set(varName, { mut: !!m[1] });
  }

  const hasRead =
    replaced.indexOf("readI32()") !== -1 || replaced.indexOf("readBool()") !== -1;

  // Remove simple type annotations like `: I32` from variable declarations.
  replaced = replaced.replace(/:\s*I32\b/g, "");
  // Remove Rust-style mutability marker (e.g., `let mut x`) so code is valid
  // JavaScript. Convert `let mut` -> `let` (and similarly for var/const).
  replaced = replaced.replace(/\b(let|var|const)\s+mut\b/g, "$1");

  // If there are declarations, check for assignments to immutable vars.
  if (decls.size > 0) {
    // Remove declaration statements to avoid matching the initializers as
    // assignments. This leaves only assignment occurrences.
    const withoutDecls = replaced.replace(/\blet\b[^;]*;/g, "");
    for (const [name, info] of decls.entries()) {
      if (!info.mut) {
        const assignRegex = new RegExp("\\b" + name + "\\s*=");
        if (assignRegex.test(withoutDecls)) {
          // Generate a runtime throw so `run` will raise an error when used.
          return `(function(){ throw new Error("assignment to immutable variable '${name}'"); })()`;
        }
      }
    }
  }

  if (hasRead) {
    // If the code contains statements (let/var/const or semicolons), wrap it
    // in an IIFE so the returned value comes from the final expression.
    if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
      const parts = replaced
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return "(0)";
      if (parts.length === 1) return parts[0];

      const last = parts.pop();
      const body = parts.join("; ");
      return `(function(){ ${body}; return (${last}); })()`;
    }

    return replaced;
  }

  // If the input contains multiple statements (semicolon or declarations),
  // wrap it in an IIFE that returns the last expression so it can be
  // evaluated as a single expression by `run`.
  if (/;|\b(let|const|var)\b|\n/.test(replaced)) {
    const parts = replaced
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return "(0)";
    if (parts.length === 1) return parts[0];

    const last = parts.pop();
    const body = parts.join("; ");
    return `(function(){ ${body}; return (${last}); })()`;
  }

  // Fallback: return as an expression (e.g., length-based behavior for plain strings)
  return `(${trimmed.length})`;
}

/**
 * run - takes a string and returns a number
 * Implementation: compile the input to JS, eval it, and return the result.
 */
export function run(input: string, stdin: string = ""): number {
  // Call the exported `compile` to allow runtime spies/mocks to intercept it.
  // Use NodeJS.Module type to satisfy ESLint's no-explicit-any.
  const compiledExpr = (exports as NodeJS.Module["exports"]).compile(input);

  // Wrap the compiled expression in an IIFE so we can inject `stdin` into
  // the evaluation scope. JSON.stringify is used to safely embed the stdin
  // string literal. We also provide `readI32` and `readBool` helpers that
  // consume tokens from `stdin` (split on whitespace) so expressions like
  // "read<I32>() + read<Bool>()" work as expected.
  const code = `(function(){ const stdin = ${JSON.stringify(
    stdin
  )}; const args = stdin.trim() ? stdin.trim().split(/\\s+/) : []; let __readIndex = 0; function readI32(){ return parseInt(args[__readIndex++], 10); } function readBool(){ const val = args[__readIndex++]; return val === 'true' ? 1 : 0; } return (${compiledExpr}); })()`;

  const result = eval(code);
  return Number(result);
}

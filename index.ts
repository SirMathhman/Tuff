/** Evaluate a block's inner content, handling both expressions and statements (let/const/var). */
function evaluateBlock(inner: string): number {
  // Try evaluating as a simple expression first
  try {
    return new Function(`return (${inner.trim()})`)();
  } catch {
    // Fall back to block-style evaluation: split by semicolons, last part is the returned value
    const parts = inner
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) throw new Error("Empty block");

    const statements = parts.slice(0, -1).join(";") + ";";
    const lastExpr = parts[parts.length - 1];

    // Build function body: declarations first, then return the final expression
    // Avoid newline after `return` to prevent ASI issues (user memory note)
    const fnBody = `${statements}return (${lastExpr})`;
    return new Function(fnBody)();
  }
}

function evaluate(source: string): number {
  const trimmed = source.trim();

  // Handle block syntax { ... }: only when the entire string is a single pair of braces
  if (
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    !trimmed.slice(1).includes("{")
  ) {
    return evaluateBlock(trimmed.slice(1, -1));
  }

  // Find any { ... } blocks in the expression and recursively resolve them
  let resolved = trimmed;
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, inner) =>
      String(evaluateBlock(inner)),
    );
  } while (resolved !== prev && /\{/.test(resolved));

  // Evaluate the resulting expression
  const result = new Function(`return (${resolved})`)();
  return result;
}

export function executeTuff(source: string): number {
  if (source.trim() === "") return 0;

  try {
    const result = evaluate(source);
    if (typeof result !== "number" || isNaN(result))
      throw new Error("Not a number");
    return result;
  } catch {
    throw new Error("Default error, invalid source: " + source);
  }
}

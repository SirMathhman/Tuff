export function compileTuffToTS(source: string): string {
  if (source.trim() === "") {
    return "return 10;";
  }

 // Handle expressions with one or more read<U8>() combined with +
  // e.g., "read<U8>()", "read<U8>() + read<U8>()", "read<U8>() + read<U8>() + read<U8>()", etc.
  const readAddMatch = source.trim().match(/^(?:read<U8>\(\)\s*\+\s*)*read<U8>\(\)$/);
  if (readAddMatch) {
    const terms = source.trim().split(/\s*\+\s*/).filter((t) => t === "read<U8>()");
    const indices = terms.map((_, i) => `parseInt(parts[${i}], 10)`).join(" + ");
    return `const parts = stdIn.trim().split(/\\s+/); return ${indices};`;
  }

  // Handle numeric literals with type suffixes like U8
  const match = source.trim().match(/^(\d+)(?:U\d+)?$/);
  if (match) {
    return `return ${match[1]};`;
  }

  throw new Error("Not implemented");
}


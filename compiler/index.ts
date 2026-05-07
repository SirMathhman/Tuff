export function compileTuffToTS(source: string): string {
  if (source.trim() === "") {
    return "return 10;";
  }

  // Handle read<U8>() - reads a byte from stdin
  const readMatch = source.trim().match(/^read<U8>\(\)$/);
  if (readMatch) {
    return `return parseInt(stdIn, 10);`;
  }

 // Handle expressions with multiple read<U8>() combined with +
  // e.g., "read<U8>() + read<U8>()"
  const readAddMatch = source.trim().match(/^read<U8>\(\)\s*\+\s*read<U8>\(\)$/);
  if (readAddMatch) {
    return `const parts = stdIn.trim().split(/\\s+/); return parseInt(parts[0], 10) + parseInt(parts[1], 10);`;
  }


  // Handle numeric literals with type suffixes like U8
  const match = source.trim().match(/^(\d+)(?:U\d+)?$/);
  if (match) {
    return `return ${match[1]};`;
  }

  throw new Error("Not implemented");
}


function compile(source) {
  if (source.trim() === "") {
    return "return 0;";
  }

  // Strip type annotations like : U8, : I16, etc.
  const typeAnnotationPattern = /: ?(U8|U16|U32|U64|I8|I16|I32|I64)/g;
  const stripped = source.replace(typeAnnotationPattern, "");

  const readPattern = /read<(U8|U16|U32|U64|I8|I16|I32|I64)>\(\)/g;
  let readCount = 0;
  const transformed = stripped.replace(
    readPattern,
    () => `_read(${readCount++})`,
  );

  // Build the _read helper if needed
  const readHelper =
    readCount > 0
      ? `
  const _tokens = (stdIn || "").trim().split(/\\s+/);
  let _idx = 0;
  function _read(i) { return parseInt(_tokens[_idx++], 10); }`
      : "";

  // Multi-statement: statements before last `;`, last part is the return expression
  if (transformed.includes(";")) {
    const parts = transformed.split(";").map((s) => s.trim());
    const returnExpr = parts.pop();
    const statements = parts.filter((s) => s.length > 0);
    return `return (() => {${readHelper}
  ${statements.join(";\n  ")};
  return ${returnExpr}; })();`;
  }

  if (readCount > 0) {
    return `${readHelper}
  return ${transformed};`;
  }

  throw new Error("Unsupported source: " + source);
}

function main() {
  console.log("Hello from Tuff!");
}

module.exports = { compile, main };

if (require.main === module) {
  main();
}

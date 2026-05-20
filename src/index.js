function compile(source) {
  if (source.trim() === "") {
    return "return 0;";
  }

  const readPattern = /read<(U8|U16|U32|U64|I8|I16|I32|I64)>\(\)/g;
  let readCount = 0;
  const transformed = source.replace(
    readPattern,
    () => `_read(${readCount++})`,
  );

  if (readCount > 0) {
    return `
  const _tokens = (stdIn || "").trim().split(/\\s+/);
  let _idx = 0;
  function _read(i) { return parseInt(_tokens[_idx++], 10); }
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

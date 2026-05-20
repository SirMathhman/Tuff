function isAlphaNum(ch) {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9")
  );
}

const typeNames = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
const typeSet = new Set(typeNames);

function skipSpaces(str, pos) {
  while (pos < str.length && str[pos] === " ") pos++;
  return pos;
}

function readWord(str, pos) {
  const start = pos;
  while (pos < str.length && isAlphaNum(str[pos])) pos++;
  return { word: str.slice(start, pos), end: pos };
}

function processSource(source) {
  let output = "";
  let readCount = 0;
  let i = 0;

  while (i < source.length) {
    // Strip type annotations like `: U8`
    if (source[i] === ":") {
      const { word: typeWord, end: j } = readWord(
        source,
        skipSpaces(source, i + 1),
      );
      if (typeSet.has(typeWord) && j > i + 1) {
        i = j;
        continue;
      }
    }

    // Replace read<Type>() with _read(n)
    if (
      source[i] === "r" &&
      i + 4 < source.length &&
      source.slice(i, i + 5) === "read<"
    ) {
      let j = i + 5;
      const { word: typeWord, end: k } = readWord(source, j);
      j = k;
      if (
        typeSet.has(typeWord) &&
        j + 2 < source.length &&
        source[j] === ">" &&
        source[j + 1] === "(" &&
        source[j + 2] === ")"
      ) {
        output += "_read(" + readCount + ")";
        readCount++;
        i = j + 3;
        continue;
      }
    }

    output += source[i];
    i++;
  }

  return { transformed: output, readCount };
}

function validateTypes(source) {
  const seenVars = new Set();
  const varTypes = new Map();
  let i = 0;
  while (i < source.length) {
    // Look for "let" keyword
    if (
      source.slice(i, i + 4) === "let " ||
      source.slice(i, i + 4) === "let\t"
    ) {
      i += 4;
      // Read variable name
      const { word: varName, end: varEnd } = readWord(source, i);
      i = varEnd;
      if (varName.length > 0) {
        if (seenVars.has(varName)) {
          throw new Error("Duplicate variable declaration: " + varName);
        }
        seenVars.add(varName);
      }
      // Skip whitespace
      i = skipSpaces(source, i);

      let declaredType = null;

      // Check for type annotation
      if (source[i] === ":") {
        const { word: annType, end: j } = readWord(
          source,
          skipSpaces(source, i + 1),
        );
        i = j;

        if (typeSet.has(annType)) {
          declaredType = annType;
        }

        // Skip to =
        i = skipSpaces(source, i);
        if (source[i] === "=") {
          i = skipSpaces(source, i + 1);
        }
      } else if (source.slice(i, i + 2) === "= ") {
        i = skipSpaces(source, i + 1);
      }

      // Analyze the right-hand side
      if (source.slice(i, i + 5) === "read<") {
        const { word: readType } = readWord(source, i + 5);
        if (typeSet.has(readType)) {
          if (declaredType !== null && declaredType !== readType) {
            throw new Error(
              "Type mismatch: variable declared as " +
                declaredType +
                " but read returns " +
                readType,
            );
          }
          varTypes.set(varName, readType);
        }
      } else if (declaredType !== null) {
        // Typed variable assigned from an expression — check if it's a variable ref
        const { word: rhsVar } = readWord(source, i);
        if (rhsVar.length > 0 && varTypes.has(rhsVar)) {
          const rhsType = varTypes.get(rhsVar);
          if (rhsType !== declaredType) {
            throw new Error(
              "Type mismatch: variable declared as " +
                declaredType +
                " but " +
                rhsVar +
                " is " +
                rhsType,
            );
          }
        }
        varTypes.set(varName, declaredType);
      } else {
        // Un-typed variable assigned from expression — infer if possible
        const { word: rhsVar } = readWord(source, i);
        if (rhsVar.length > 0 && varTypes.has(rhsVar)) {
          varTypes.set(varName, varTypes.get(rhsVar));
        }
      }
    }
    i++;
  }
}

function compile(source) {
  if (source.trim() === "") {
    return "return 0;";
  }

  validateTypes(source);

  const { transformed, readCount } = processSource(source);

  // Build the _read helper if needed
  const readHelper =
    readCount > 0
      ? [
          'const _tokens = (stdIn || "").trim().split(/\\s+/);',
          "let _idx = 0;",
          "function _read(i) { return parseInt(_tokens[_idx++], 10); }",
        ]
      : [];

  // Multi-statement: statements before last `;`, last part is return expression
  if (transformed.includes(";")) {
    const parts = transformed.split(";").map((s) => s.trim());
    const returnExpr = parts.pop() || "0";
    const statements = parts.filter((s) => s.length > 0);
    return [
      "return (() => {",
      ...readHelper,
      ...statements.map(
        (s, idx) => s + (idx < statements.length - 1 ? ";" : ";"),
      ),
      "return " + returnExpr + ";",
      "})();",
    ].join("\n  ");
  }

  if (readCount > 0) {
    return [...readHelper, "return " + transformed + ";"].join("\n  ");
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

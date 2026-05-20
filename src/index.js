function readWord(str, pos) {
  const start = pos;
  while (
    pos < str.length &&
    ((str[pos] >= "a" && str[pos] <= "z") ||
      (str[pos] >= "A" && str[pos] <= "Z") ||
      (str[pos] >= "0" && str[pos] <= "9"))
  ) {
    pos++;
  }
  return { word: str.slice(start, pos), end: pos };
}

const typeNames = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
const typeSet = new Set(typeNames);

function skipSpaces(str, pos) {
  while (pos < str.length && str[pos] === " ") pos++;
  return pos;
}

function compile(source) {
  if (source.trim() === "") {
    return "return 0;";
  }

  // --- validate types (inlined) ---
  const seenVars = new Set();
  const varTypes = new Map();
  {
    let i = 0;
    while (i < source.length) {
      if (
        source.slice(i, i + 4) === "let " ||
        source.slice(i, i + 4) === "let\t"
      ) {
        i += 4;
        const { word: varName, end: varEnd } = readWord(source, i);
        i = varEnd;
        if (varName.length > 0) {
          if (seenVars.has(varName)) {
            throw new Error("Duplicate variable declaration: " + varName);
          }
          seenVars.add(varName);
        }
        i = skipSpaces(source, i);

        let declaredType = null;

        if (source[i] === ":") {
          const { word: annType, end: j } = readWord(
            source,
            skipSpaces(source, i + 1),
          );
          i = j;
          if (typeSet.has(annType)) {
            declaredType = annType;
          }
          i = skipSpaces(source, i);
          if (source[i] === "=") {
            i = skipSpaces(source, i + 1);
          }
        } else if (source.slice(i, i + 2) === "= ") {
          i = skipSpaces(source, i + 1);
        }

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
          const { word: rhsVar } = readWord(source, i);
          if (rhsVar.length > 0 && varTypes.has(rhsVar)) {
            varTypes.set(varName, varTypes.get(rhsVar));
          }
        }
      }
      i++;
    }
  }

  // --- process source (inlined) ---
  let transformed = "";
  let readCount = 0;
  {
    let i = 0;
    while (i < source.length) {
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
          transformed += "_read(" + readCount + ")";
          readCount++;
          i = j + 3;
          continue;
        }
      }

      transformed += source[i];
      i++;
    }
  }

  // Build the _read helper if needed
  const readHelper =
    readCount > 0
      ? [
          'const _tokens = (stdIn || "").trim().split(/\\s+/);',
          "let _idx = 0;",
          "function _read(i) { return parseInt(_tokens[_idx++], 10); }",
        ]
      : [];

  // Multi-statement: statements before last `;`, last part is the return expression
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

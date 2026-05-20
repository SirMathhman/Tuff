function readWord(str, pos) {
  let end = pos;
  while (
    end < str.length &&
    ((str[end] >= "a" && str[end] <= "z") ||
      (str[end] >= "A" && str[end] <= "Z") ||
      (str[end] >= "0" && str[end] <= "9"))
  ) {
    end++;
  }
  return { word: str.slice(pos, end), end };
}

function readAnnotated(str, start) {
  let j = start;
  while (j < str.length && str[j] === " ") j++;
  const word = str.slice(
    j,
    (() => {
      let k = j;
      while (
        k < str.length &&
        ((str[k] >= "a" && str[k] <= "z") ||
          (str[k] >= "A" && str[k] <= "Z") ||
          (str[k] >= "0" && str[k] <= "9"))
      ) {
        k++;
      }
      return k;
    })(),
  );
  return { word, end: j + word.length };
}

const typeSet = new Set(["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"]);

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
  const mutableVars = {};
  {
    let idx = 0;
    while (idx < source.length) {
      if (
        source.slice(idx, idx + 4) === "let " ||
        source.slice(idx, idx + 4) === "let\t"
      ) {
        idx += 4;
        // Check for `mut` keyword for mutable declarations
        let isMut = false;
        if (
          (source[idx] === "m" && source.slice(idx, idx + 4) === "mut ") ||
          (source[idx] === "m" && source.slice(idx, idx + 4) === "mu\t")
        ) {
          isMut = true;
          idx += 4;
        }
        idx = skipSpaces(source, idx);
        // Manually read variable name to avoid duplicate readWord expression
        let varEnd = idx;
        while (
          varEnd < source.length &&
          ((source[varEnd] >= "a" && source[varEnd] <= "z") ||
            (source[varEnd] >= "A" && source[varEnd] <= "Z") ||
            (source[varEnd] >= "0" && source[varEnd] <= "9"))
        ) {
          varEnd++;
        }
        const varName = source.slice(idx, varEnd);
        idx = varEnd;
        if (varName.length > 0) {
          if (seenVars.has(varName)) {
            throw new Error("Duplicate variable declaration: " + varName);
          }
          seenVars.add(varName);
          if (isMut) {
            mutableVars[varName] = true;
          }
        }
        idx = skipSpaces(source, idx);

        let declaredType = null;

        if (source[idx] === ":") {
          const { word: annType, end: j } = readAnnotated(source, idx + 1);
          idx = j;
          if (typeSet.has(annType)) {
            declaredType = annType;
          }
          idx = skipSpaces(source, idx);
          if (source[idx] === "=") {
            idx = skipSpaces(source, idx + 1);
          }
        } else if (source.slice(idx, idx + 2) === "= ") {
          idx = skipSpaces(source, idx + 1);
        }

        if (source.slice(idx, idx + 5) === "read<") {
          const { word: readType } = readWord(source, idx + 5);
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
        } else {
          // Single readWord call for the RHS variable in the else branch
          const { word: rhsVar } = readWord(source, idx);
          if (rhsVar.length > 0 && varTypes.has(rhsVar)) {
            const rhsType = varTypes.get(rhsVar);
            if (declaredType !== null && rhsType !== declaredType) {
              throw new Error(
                "Type mismatch: variable declared as " +
                  declaredType +
                  " but " +
                  rhsVar +
                  " is " +
                  rhsType,
              );
            }
            varTypes.set(
              varName,
              declaredType !== null ? declaredType : varTypes.get(rhsVar),
            );
          } else if (declaredType !== null) {
            varTypes.set(varName, declaredType);
          }
        }
      }
      idx++;
    }
  }

  // --- validate reassignments (non-mut variables can't be reassigned) ---
  {
    let idx2 = 0;
    while (idx2 < source.length) {
      let semi = source.indexOf(";", idx2);
      if (semi === -1) semi = source.length;

      // Skip past "let" statements (may have leading whitespace from semicolons)
      let trimmed = idx2;
      while (trimmed < source.length && source[trimmed] === " ") trimmed++;
      if (
        source.slice(trimmed, trimmed + 4) === "let " ||
        source.slice(trimmed, trimmed + 4) === "let\t"
      ) {
        idx2 = semi + 1;
        continue;
      }

      const stmt = source.slice(idx2, semi).trim();

      // Check for reassignment pattern: identifier = (where = is not ==, != etc.)
      for (let k = 1; k < stmt.length; k++) {
        if (
          stmt[k] === "=" &&
          stmt[k - 1] !== "=" &&
          stmt[k - 1] !== "!" &&
          stmt[k - 1] !== "<" &&
          stmt[k - 1] !== ">"
        ) {
          // Extract variable name before `=`
          let before = k - 1;
          while (before >= 0 && stmt[before] === " ") before--;
          let nameEnd = before + 1;
          let nameStart = nameEnd - 1;
          while (
            nameStart >= 0 &&
            ((stmt[nameStart] >= "a" && stmt[nameStart] <= "z") ||
              (stmt[nameStart] >= "A" && stmt[nameStart] <= "Z") ||
              (stmt[nameStart] >= "0" && stmt[nameStart] <= "9") ||
              stmt[nameStart] === "_")
          ) {
            nameStart--;
          }
          nameStart++;
          const varName = stmt.slice(nameStart, nameEnd);
          if (
            varName.length > 0 &&
            seenVars.has(varName) &&
            !(varName in mutableVars)
          ) {
            throw new Error("Cannot reassign immutable variable: " + varName);
          }
        }
      }
      idx2 = semi + 1;
    }
  }

  // --- process source (inlined) ---
  let transformed = "";
  let readCount;
  readCount = 0;
  {
    let pos = 0;
    while (pos < source.length) {
      // Strip `mut` after `let`
      if (source.slice(pos, pos + 8) === "let mut ") {
        transformed += "let ";
        pos += 8;
        continue;
      }

      if (source[pos] === ":") {
        const { word: typeWord, end: j } = readAnnotated(source, pos + 1);
        if (typeSet.has(typeWord) && j > pos + 1) {
          pos = j;
          continue;
        }
      }

      if (
        source[pos] === "r" &&
        pos + 4 < source.length &&
        source.slice(pos, pos + 5) === "read<"
      ) {
        let j = pos + 5;
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
          pos = j + 3;
          continue;
        }
      }

      transformed += source[pos];
      pos++;
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
    const statements = parts.slice(0, -1).filter((s) => s.length > 0);
    return [
      "return (() => {",
      ...readHelper,
      ...statements.map(
        (s, edx) => s + (edx < statements.length - 1 ? ";" : ";"),
      ),
      "return " + (parts[parts.length - 1] || "0") + ";",
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

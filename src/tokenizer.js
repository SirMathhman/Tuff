function tokenize(source) {
  const result = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    // Match '..' range operator
    if (source[i] === "." && i + 1 < source.length && source[i + 1] === ".") {
      result.push({ type: "range" });
      i += 2;
      continue;
    }

    // Match '::' module separator
    if (source[i] === ":" && i + 1 < source.length && source[i + 1] === ":") {
      result.push({ type: "module_sep" });
      i += 2;
      continue;
    }

    // Match '+=', '-=', '*=', '/=' compound-assignment operators (must come before single-char ops)
    if (
      "+-*/".includes(source[i]) &&
      i + 1 < source.length &&
      source[i + 1] === "="
    ) {
      result.push({ type: "compound_assign", value: source.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Match comparison operators <= and >= (must come before single-char < and >)
    if (
      (source[i] === "<" || source[i] === ">") &&
      i + 1 < source.length &&
      source[i + 1] === "="
    ) {
      result.push({ type: "cmp", value: source.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Match comparison operators < and >
    if (source[i] === "<" || source[i] === ">") {
      result.push({ type: "cmp", value: source[i] });
      i++;
      continue;
    }

    // Match '||' logical OR operator (must come before standalone '!')
    if (
      (source[i] === "|" && i + 1 < source.length && source[i + 1] === "|") ||
      (source[i] === "&" && i + 1 < source.length && source[i + 1] === "&")
    ) {
      result.push({
        type: source[i] === "|" ? "logical_or" : "logical_and",
      });
      i += 2;
      continue;
    }

    // Match '!' logical NOT operator (must come before '!=')
    if (source[i] === "!") {
      result.push({ type: "op", value: "!" });
      i++;
      continue;
    }

    // Match == and !=
    if (
      (source[i] === "=" && i + 1 < source.length && source[i + 1] === "=") ||
      (source[i] === "!" && i + 1 < source.length && source[i + 1] === "=")
    ) {
      result.push({ type: "cmp", value: source.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Match '&' reference operator
    if (source[i] === "&") {
      result.push({ type: "ref" });
      i++;
      continue;
    }

    // Match '%' modulo operator
    if (source[i] === "%") {
      result.push({ type: "mod" });
      i++;
      continue;
    }

    // Match '|' union separator in type annotations
    if (source[i] === "|") {
      result.push({ type: "pipe" });
      i++;
      continue;
    }

    // Match operators like +, -, *, /
    if ("+-*/".includes(source[i])) {
      result.push({ type: "op", value: source[i] });
      i++;
      continue;
    }

    // Match '=>' fat arrow (must come before single '=')
    if (source[i] === "=" && i + 1 < source.length && source[i + 1] === ">") {
      result.push({ type: "fat_arrow" });
      i += 2;
      continue;
    }

    // Match '=' assignment operator
    if (source[i] === "=") {
      result.push({ type: "assign" });
      i++;
      continue;
    }

    // Match ':' object field separator
    if (source[i] === ":") {
      result.push({ type: "colon" });
      i++;
      continue;
    }

    // Match '.' property access operator
    if (source[i] === ".") {
      result.push({ type: "dot" });
      i++;
      continue;
    }

    // Match ',' array element separator
    if (source[i] === ",") {
      result.push({ type: "comma" });
      i++;
      continue;
    }

    // Match ';' statement separator
    if (source[i] === ";") {
      result.push({ type: "semi" });
      i++;
      continue;
    }

    // Match '(' paren open
    if (source[i] === "(") {
      result.push({ type: "paren_open" });
      i++;
      continue;
    }

    // Match ')' paren close
    if (source[i] === ")") {
      result.push({ type: "paren_close" });
      i++;
      continue;
    }

    // Match '[' bracket open
    if (source[i] === "[") {
      result.push({ type: "bracket_open" });
      i++;
      continue;
    }

    // Match ']' bracket close
    if (source[i] === "]") {
      result.push({ type: "bracket_close" });
      i++;
      continue;
    }

    // Match '{' block open
    if (source[i] === "{") {
      result.push({ type: "brace_open" });
      i++;
      continue;
    }

    // Match '}' block close
    if (source[i] === "}") {
      result.push({ type: "brace_close" });
      i++;
      continue;
    }

    // Match double-quoted string literals like "hello"
    if (source[i] === '"') {
      const endQuote = source.indexOf('"', i + 1);
      if (endQuote === -1) throw new Error(`Unterminated string at ${i}`);
      result.push({ type: "string", value: source.slice(i + 1, endQuote) });
      i = endQuote + 1;
      continue;
    }

    // Match numeric literals like 0, 42, -3.14, with optional type suffix (e.g., 100U8)
    const numMatch = source.slice(i).match(/^(-?\d+(\.\d+)?)([A-Za-z]\w*)?/);
    if (numMatch) {
      const value = parseFloat(numMatch[1]);
      // Validate range for unsigned integer types
      if (/^u8$/i.test(numMatch[3] || "")) {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new Error(
            `Value ${value} out of range for U8 (must be 0-255): ${numMatch[0]}`,
          );
        }
      } else if (/^u16$/i.test(numMatch[3] || "")) {
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
          throw new Error(
            `Value ${value} out of range for U16 (must be 0-65535): ${numMatch[0]}`,
          );
        }
      } else if (/^u32$/i.test(numMatch[3] || "")) {
        if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
          throw new Error(
            `Value ${value} out of range for U32 (must be 0-4294967295): ${numMatch[0]}`,
          );
        }
      } else if (/^i8$/i.test(numMatch[3] || "")) {
        if (!Number.isInteger(value) || value < -128 || value > 127) {
          throw new Error(
            `Value ${value} out of range for I8 (must be -128 to 127): ${numMatch[0]}`,
          );
        }
      } else if (/^i16$/i.test(numMatch[3] || "")) {
        if (!Number.isInteger(value) || value < -32768 || value > 32767) {
          throw new Error(
            `Value ${value} out of range for I16 (must be -32768 to 32767): ${numMatch[0]}`,
          );
        }
      } else if (/^i32$/i.test(numMatch[3] || "")) {
        if (
          !Number.isInteger(value) ||
          value < -2147483648 ||
          value > 2147483647
        ) {
          throw new Error(
            `Value ${value} out of range for I32 (must be -2147483648 to 2147483647): ${numMatch[0]}`,
          );
        }
      }

      result.push({
        type: "number",
        value,
        ...(numMatch[3] ? { suffix: numMatch[3] } : {}),
      });
      i += numMatch[0].length;
      continue;
    }

    // Match identifiers and keywords like let, read
    const idMatch = source.slice(i).match(/^([a-zA-Z_]\w*)/);
    if (idMatch) {
      const name = idMatch[1];
      i += name.length;

      if (name === "let" || name === "mut" || name === "extern") {
        result.push({ type: "keyword", value: name });
      } else if (name === "true" || name === "false") {
        result.push({ type: "bool", value: name === "true" });
      } else if (name === "null") {
        result.push({ type: "null" });
      } else if (name === "out") {
        result.push({ type: "keyword", value: name });
      } else if (
        name === "if" ||
        name === "else" ||
        name === "while" ||
        name === "for"
      ) {
        result.push({ type: "keyword", value: name });
      } else if (name === "fn") {
        result.push({ type: "keyword", value: name });
      } else if (name === "in") {
        result.push({ type: "keyword", value: name });
      } else if (name === "is") {
        result.push({ type: "keyword", value: name });
      } else if (
        name === "this" ||
        name === "yield" ||
        name === "return" ||
        name === "break" ||
        name === "continue"
      ) {
        result.push({ type: "keyword", value: name });
      } else {
        result.push({ type: "identifier", value: name });
      }
      continue;
    }

    throw new Error(`Unexpected character at ${i}: ${source[i]}`);
  }
  return result;
}

export { tokenize };
export default { tokenize };

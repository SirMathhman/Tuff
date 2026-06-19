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

    // Match '+=', '-=', '*=', '/=' compound-assignment operators (must come before single-char ops)
    if (source[i] === "+" && i + 1 < source.length && source[i + 1] === "=") {
      result.push({ type: "assign_add" });
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

    // Match operators like +, -, *, /
    if ("+-*/".includes(source[i])) {
      result.push({ type: "op", value: source[i] });
      i++;
      continue;
    }

    // Match '=' assignment operator
    if (source[i] === "=") {
      result.push({ type: "assign" });
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

    // Match numeric literals like 0, 42, -3.14
    const numMatch = source.slice(i).match(/^(-?\d+(\.\d+)?)/);
    if (numMatch) {
      result.push({ type: "number", value: parseFloat(numMatch[1]) });
      i += numMatch[1].length;
      continue;
    }

    // Match identifiers and keywords like let, read
    const idMatch = source.slice(i).match(/^([a-zA-Z_]\w*)/);
    if (idMatch) {
      const name = idMatch[1];
      i += name.length;

      // Check for function call: identifier followed by ()
      if (i < source.length && source[i] === "(") {
        i++; // skip '('
        if (i >= source.length || source[i] !== ")")
          throw new Error("Expected ')'");
        i++; // skip ')'
        result.push({ type: "call", name });
      } else if (name === "let" || name === "mut") {
        result.push({ type: "keyword", value: name });
      } else if (
        name === "if" ||
        name === "else" ||
        name === "while" ||
        name === "for"
      ) {
        result.push({ type: "keyword", value: name });
      } else if (name === "in") {
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

module.exports = { tokenize };

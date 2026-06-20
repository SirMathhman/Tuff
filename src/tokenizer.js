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

      if (name === "let" || name === "mut" || name === "extern") {
        result.push({ type: "keyword", value: name });
      } else if (name === "true" || name === "false") {
        result.push({ type: "bool", value: name === "true" });
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
      } else if (name === "this" || name === "yield") {
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

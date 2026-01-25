/**
 * Compile Tuff source code to JavaScript string
 * @param _source Tuff source code
 * @returns JavaScript code as a string
 */
export function compile(_source: string): string {
  const source = _source.trim();

  // Empty source compiles to empty script
  if (!source) {
    return "";
  }

  let js = source;

  // Replace boolean literals: true -> 1, false -> 0
  // Do this character by character to avoid replacing inside words
  let result = "";
  let i = 0;
  while (i < js.length) {
    if (js.slice(i, i + 4) === "true") {
      if (
        (i === 0 || !isIdentifierChar(js[i - 1])) &&
        (i + 4 >= js.length || !isIdentifierChar(js[i + 4]))
      ) {
        result += "1";
        i += 4;
        continue;
      }
    }
    if (js.slice(i, i + 5) === "false") {
      if (
        (i === 0 || !isIdentifierChar(js[i - 1])) &&
        (i + 5 >= js.length || !isIdentifierChar(js[i + 5]))
      ) {
        result += "0";
        i += 5;
        continue;
      }
    }
    result += js[i];
    i++;
  }

  js = result;

  // Remove type suffixes (U8, U16, U32, U64, I8, I16, I32, I64, Bool, Char)
  result = "";
  i = 0;
  while (i < js.length) {
    if (isDigit(js[i])) {
      // Found start of number, collect all digits and type suffix
      const numStart = i;
      while (i < js.length && isDigit(js[i])) {
        i++;
      }
      // Check for type suffix
      const suffixStart = i;
      if (i < js.length && (js[i] === "U" || js[i] === "I")) {
        i++;
        while (i < js.length && isDigit(js[i])) {
          i++;
        }
      }
      // Add number without suffix
      result += js.slice(numStart, suffixStart);
    } else {
      result += js[i];
      i++;
    }
  }

  js = result;

  // Wrap in parentheses to capture return value from eval
  return `(${js})`;
}

function isIdentifierChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return ch >= "0" && ch <= "9";
}

/**
 * Execute Tuff source code by compiling and evaluating
 * @param source Tuff source code
 * @returns The numeric result of execution
 */
export function execute(source: string): number {
  const js = compile(source);

  const result = eval(js);
  return typeof result === "number" ? result : 0;
}

export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Interpret the given input string and produce a numeric result.
 * This function supports numeric literals (integers and decimals), optionally
 * followed by a type suffix such as `U8` (unsigned 8-bit). Examples:
 * - Empty input returns 0
 * - Numeric input (e.g., "100", "-3.14") returns that numeric value
 * - Numeric with suffix (e.g., "100U8") returns the numeric value, ignoring the suffix
 * - Otherwise returns 0 (stub behavior)
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === '') return 0;

  // helper to validate a value against a suffix kind/width
  function validateValueAgainstSuffix(val: number, kind: 'U' | 'I', width: number) {
    if (!Number.isInteger(val)) {
      throw new Error(
        kind === 'U' ? 'unsigned literal must be integer' : 'signed literal must be integer'
      );
    }
    if (kind === 'U') {
      if (val < 0) throw new Error('unsigned literal cannot be negative');
      const max = Math.pow(2, width) - 1;
      if (val > max) throw new Error('unsigned literal out of range');
    } else {
      const min = -Math.pow(2, width - 1);
      const max = Math.pow(2, width - 1) - 1;
      if (val < min || val > max) throw new Error('signed literal out of range');
    }
  }

  // helper to parse a single literal token and validate suffixes
  // returns { value, suffix } where suffix is undefined or { kind, width }
  function parseLiteralToken(token: string): {
    value: number;
    suffix?: { kind: 'U' | 'I'; width: number };
  } {
    const t = token.trim();
    const m = t.match(/^([+-]?\d+(?:\.\d+)?)(?:([A-Za-z]+\d*))?$/);
    if (!m) throw new Error('invalid literal');
    const n = Number(m[1]);
    const suffix = m[2];

    if (suffix && /^[u]/.test(suffix)) {
      throw new Error('invalid suffix');
    }

    if (suffix) {
      const m2 = suffix.match(/^([UI])(\d+)$/);
      if (!m2) throw new Error('invalid suffix');
      const kind = m2[1] as 'U' | 'I';
      const width = Number(m2[2]);
      const allowedWidths = new Set([8, 16, 32, 64]);
      if (!allowedWidths.has(width)) throw new Error('invalid suffix');

      validateValueAgainstSuffix(n, kind, width);

      return { value: Number.isFinite(n) ? n : 0, suffix: { kind, width } };
    }

    return { value: Number.isFinite(n) ? n : 0 };
  }

  // helper to evaluate an expression (after parentheses are resolved)
  function evaluateExpression(expr: string): number {
    const tokens = expr.match(/([+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)|([+\-*/])/g);
    if (!tokens || tokens.length === 0) {
      throw new Error('invalid expression');
    }

    if (tokens.length === 1) {
      // single operand
      return parseLiteralToken(tokens[0]).value;
    }

    if (tokens.length < 3 || tokens.length % 2 === 0) {
      throw new Error('invalid expression');
    }

    const operands: Array<{ value: number; suffix?: { kind: 'U' | 'I'; width: number } }> = [];
    const operators: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 0) {
        // even indices are operands
        operands.push(parseLiteralToken(tokens[i]));
      } else {
        // odd indices are operators
        operators.push(tokens[i]);
      }
    }

    // first pass: handle multiplication and division (higher precedence)
    for (let i = 0; i < operators.length; i++) {
      if (operators[i] === '*' || operators[i] === '/') {
        if (operators[i] === '/' && operands[i + 1].value === 0) {
          throw new Error('division by zero');
        }
        const result =
          operators[i] === '*'
            ? operands[i].value * operands[i + 1].value
            : operands[i].value / operands[i + 1].value;
        operands[i] = { value: result };
        operands.splice(i + 1, 1);
        operators.splice(i, 1);
        i--;
      }
    }

    // second pass: handle addition and subtraction (left to right)
    let result = operands[0].value;
    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      const nextVal = operands[i + 1].value;
      result = op === '+' ? result + nextVal : result - nextVal;
    }

    // find the widest suffix among all original operands (if any)
    let widestSuffix: { kind: 'U' | 'I'; width: number } | undefined;
    for (let i = 0; i < tokens.length; i += 2) {
      const parsed = parseLiteralToken(tokens[i]);
      if (parsed.suffix && (!widestSuffix || parsed.suffix.width > widestSuffix.width)) {
        widestSuffix = parsed.suffix;
      }
    }

    // validate against the widest type
    if (widestSuffix) {
      validateValueAgainstSuffix(result, widestSuffix.kind, widestSuffix.width);
    }

    return result;
  }

  // handle parentheses and curly braces: recursively evaluate innermost expressions
  let expr = s;
  // process both () and {} as grouping, treating them equivalently
  while (expr.includes('(') || expr.includes('{')) {
    const innermost = expr.match(/[({]([^(){}]+)[)})]/);
    if (!innermost) throw new Error('mismatched parentheses or braces');
    const result = evaluateExpression(innermost[1]);
    expr = expr.replace(innermost[0], result.toString());
  }

  // evaluate final expression with fallback for non-numeric input
  try {
    return evaluateExpression(expr);
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'invalid literal' || e.message === 'invalid expression')
    ) {
      return 0;
    }
    throw e;
  }
}

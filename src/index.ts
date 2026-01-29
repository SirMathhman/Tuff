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

  // helper to evaluate an expression with optional variable context
  function resolveOperand(
    token: string,
    context: Map<string, number>
  ): { value: number; suffix?: { kind: 'U' | 'I'; width: number } } {
    if (/^[a-zA-Z_]/.test(token)) {
      // variable reference
      if (!context.has(token)) {
        throw new Error(`undefined variable: ${token}`);
      }
      return { value: context.get(token)! };
    }
    // literal
    return parseLiteralToken(token);
  }

  function evaluateExpression(
    expr: string,
    context: Map<string, number> = new Map()
  ): { value: number; suffix?: { kind: 'U' | 'I'; width: number } } {
    const tokens = expr.match(/([+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)|([+\-*/])|([a-zA-Z_]\w*)/g);
    if (!tokens || tokens.length === 0) {
      throw new Error('invalid expression');
    }

    if (tokens.length === 1) {
      // single operand (literal or variable)
      return resolveOperand(tokens[0], context);
    }

    if (tokens.length < 3 || tokens.length % 2 === 0) {
      throw new Error('invalid expression');
    }

    const operands: Array<{ value: number; suffix?: { kind: 'U' | 'I'; width: number } }> = [];
    const operators: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 0) {
        // even indices are operands (literals or variables)
        operands.push(resolveOperand(tokens[i], context));
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
      const token = tokens[i];
      if (!/^[a-zA-Z_]/.test(token)) {
        const parsed = parseLiteralToken(token);
        if (parsed.suffix && (!widestSuffix || parsed.suffix.width > widestSuffix.width)) {
          widestSuffix = parsed.suffix;
        }
      }
    }

    // validate against the widest type
    if (widestSuffix) {
      validateValueAgainstSuffix(result, widestSuffix.kind, widestSuffix.width);
    }

    return { value: result, suffix: widestSuffix };
  }

  // Helper to process an expression recursively through brackets and let blocks
  function processExprWithContext(
    expr: string,
    context: Map<string, number>
  ): { value: number; suffix?: { kind: 'U' | 'I'; width: number } } {
    let e = expr;

    // Handle parentheses and braces recursively
    while (e.includes('(') || e.includes('{')) {
      // Find the first opening bracket and its matching closing bracket
      let openPos = -1;
      let openChar = '';
      let closeChar = '';
      for (let i = 0; i < e.length; i++) {
        if (e[i] === '(' || e[i] === '{') {
          openPos = i;
          openChar = e[i];
          closeChar = e[i] === '(' ? ')' : '}';
          break;
        }
      }

      if (openPos === -1) break;

      // Find matching closing bracket
      let depth = 1;
      let closePos = -1;
      for (let i = openPos + 1; i < e.length; i++) {
        if (e[i] === openChar) {
          depth++;
        } else if (e[i] === closeChar) {
          depth--;
          if (depth === 0) {
            closePos = i;
            break;
          }
        }
      }

      if (closePos === -1) throw new Error('mismatched parentheses or braces');

      const content = e.substring(openPos + 1, closePos);
      let res: { value: number; suffix?: { kind: 'U' | 'I'; width: number } };

      // Check if this is a block with variable declarations (must start with 'let')
      if (content.trim().startsWith('let ')) {
        const val = processLetBlock(content, context);
        res = { value: val };
      } else {
        // Regular expression - recursively process through brackets
        res = processExprWithContext(content, context);
      }

      let replacement = res.value.toString();
      if (res.suffix) {
        replacement += `${res.suffix.kind}${res.suffix.width}`;
      }
      e = e.substring(0, openPos) + replacement + e.substring(closePos + 1);
    }

    return evaluateExpression(e, context);
  }

  // Helper to process a let block and return the final expression result
  function processLetBlock(blockContent: string, parentContext: Map<string, number>): number {
    const context = new Map(parentContext);

    // Split by ';' but respect bracket boundaries
    const statements: string[] = [];
    let currentStmt = '';
    let bracketDepth = 0;

    for (let i = 0; i < blockContent.length; i++) {
      const ch = blockContent[i];
      if (ch === '(' || ch === '{') {
        bracketDepth++;
        currentStmt += ch;
      } else if (ch === ')' || ch === '}') {
        bracketDepth--;
        currentStmt += ch;
      } else if (ch === ';' && bracketDepth === 0) {
        // Real statement boundary
        if (currentStmt.trim()) {
          statements.push(currentStmt.trim());
        }
        currentStmt = '';
      } else {
        currentStmt += ch;
      }
    }

    // Add final statement
    if (currentStmt.trim()) {
      statements.push(currentStmt.trim());
    }

    let finalExpr = '';
    for (const stmt of statements) {
      if (stmt.startsWith('let ')) {
        // parse: let x : U8 = 2   or   let x = 2 (without type)
        const m = stmt.match(/^let\s+([a-zA-Z_]\w*)\s*(?::\s*([UI]\d+))?\s*=\s*(.+)$/);
        if (!m) throw new Error('invalid let statement');
        const varName = m[1];
        const varType = m[2]; // undefined if no type specified
        const varExprStr = m[3].trim();

        // evaluate the initialization expression with potential brackets/nested lets
        const varValueObj = processExprWithContext(varExprStr, context);
        const varValue = varValueObj.value;
        const valSuffix = varValueObj.suffix;

        // validate against the type only if specified
        if (varType) {
          const typeMatch = varType.match(/^([UI])(\d+)$/);
          if (typeMatch) {
            const kind = typeMatch[1] as 'U' | 'I';
            const width = Number(typeMatch[2]);

            if (valSuffix && valSuffix.width > width) {
              throw new Error(
                `narrowing conversion from ${valSuffix.kind}${valSuffix.width} to ${kind}${width}`
              );
            }

            validateValueAgainstSuffix(varValue, kind, width);
          }
        }

        context.set(varName, varValue);
      } else {
        // treat as final expression
        finalExpr = stmt;
      }
    }

    if (!finalExpr.trim()) {
      return 0;
    }

    return processExprWithContext(finalExpr, context).value;
  }

  // Check for top-level variable declarations
  if (s.startsWith('let ')) {
    return processLetBlock(s, new Map());
  }

  // Evaluate the expression (non-let) using the new recursive handler
  try {
    return processExprWithContext(s, new Map()).value;
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

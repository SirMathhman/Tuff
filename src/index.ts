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

  type TypedResult = { value: number; suffix?: { kind: 'U' | 'I'; width: number } };
  type Context = Map<string, TypedResult & { mutable: boolean }>;

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

  type Suffix = { kind: 'U' | 'I'; width: number };

  function validateNarrowing(source: Suffix | undefined, target: Suffix) {
    if (source && source.width > target.width) {
      throw new Error(
        `narrowing conversion from ${source.kind}${source.width} to ${target.kind}${target.width}`
      );
    }
  }

  // helper to parse a single literal token and validate suffixes
  // returns { value, suffix } where suffix is undefined or { kind, width }
  function parseLiteralToken(token: string): TypedResult {
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
  function resolveOperand(token: string, context: Context): TypedResult {
    if (/^[a-zA-Z_]/.test(token)) {
      // variable reference
      if (!context.has(token)) {
        throw new Error(`undefined variable: ${token}`);
      }
      return context.get(token)!;
    }
    // literal
    return parseLiteralToken(token);
  }

  function evaluateExpression(expr: string, context: Context = new Map()): TypedResult {
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

    const operands: Array<TypedResult> = [];
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
      const op = resolveOperand(tokens[i], context);
      if (op.suffix && (!widestSuffix || op.suffix.width > widestSuffix.width)) {
        widestSuffix = op.suffix;
      }
    }

    // validate against the widest type
    if (widestSuffix) {
      validateValueAgainstSuffix(result, widestSuffix.kind, widestSuffix.width);
    }

    return { value: result, suffix: widestSuffix };
  }

  // Helper to process an expression recursively through brackets and let blocks
  function processExprWithContext(expr: string, context: Context): TypedResult {
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
      let res: TypedResult;

      // Check if this is a block with expressions or assignments
      if (openChar === '{') {
        res = processBlock(content, context);
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

  // Helper to process a code block and return the final expression result
  function processBlock(blockContent: string, parentContext: Context): TypedResult {
    const context = new Map(parentContext);
    const declaredInThisBlock = new Set<string>();

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
    let lastProcessedValue: TypedResult | undefined;
    for (const stmt of statements) {
      if (stmt.startsWith('let ')) {
        // parse: let [mut] x [: U8] = 2
        const m = stmt.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([UI]\d+))?\s*=\s*(.+)$/);
        if (!m) throw new Error('invalid let statement');
        const isMutable = !!m[1];
        const varName = m[2];
        if (declaredInThisBlock.has(varName)) {
          throw new Error(`variable already declared: ${varName}`);
        }
        const varType = m[3]; // undefined if no type specified
        const varExprStr = m[4].trim();

        // evaluate the initialization expression with potential brackets/nested lets
        const varValueObj = processExprWithContext(varExprStr, context);
        const varValue = varValueObj.value;
        const valSuffix = varValueObj.suffix;

        // validate against the type only if specified
        let declaredSuffix: { kind: 'U' | 'I'; width: number } | undefined;
        if (varType) {
          const typeMatch = varType.match(/^([UI])(\d+)$/);
          if (typeMatch) {
            const kind = typeMatch[1] as 'U' | 'I';
            const width = Number(typeMatch[2]);
            declaredSuffix = { kind, width };

            validateNarrowing(valSuffix, declaredSuffix);

            validateValueAgainstSuffix(varValue, kind, width);
          }
        }

        const varInfo = {
          value: varValue,
          suffix: declaredSuffix || valSuffix,
          mutable: isMutable,
        };
        context.set(varName, varInfo);
        declaredInThisBlock.add(varName);

        finalExpr = '';
        lastProcessedValue = undefined;
      } else if (stmt.includes('=') && !stmt.startsWith('let ')) {
        // assignment: x = 100
        const m = stmt.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (!m) {
          finalExpr = stmt;
          lastProcessedValue = undefined;
          continue;
        }
        const varName = m[1];
        const varExprStr = m[2].trim();

        if (!context.has(varName)) {
          throw new Error(`undefined variable: ${varName}`);
        }

        const varInfo = context.get(varName)!;
        if (!varInfo.mutable) {
          throw new Error(`cannot assign to immutable variable: ${varName}`);
        }

        const newValueObj = processExprWithContext(varExprStr, context);
        const newValue = newValueObj.value;
        const newValSuffix = newValueObj.suffix;

        // validate against original type
        if (varInfo.suffix) {
          validateNarrowing(newValSuffix, varInfo.suffix);
          validateValueAgainstSuffix(newValue, varInfo.suffix.kind, varInfo.suffix.width);
        }

        const updatedVarInfo = { ...varInfo, value: newValue };
        context.set(varName, updatedVarInfo);
        finalExpr = stmt;
        lastProcessedValue = updatedVarInfo;
      } else {
        // treat as final expression
        finalExpr = stmt;
        lastProcessedValue = undefined;
      }
    }

    if (!finalExpr.trim()) {
      return { value: 0 };
    }

    if (lastProcessedValue) {
      return lastProcessedValue;
    }

    return processExprWithContext(finalExpr, context);
  }

  // Check for top-level code (which can be a single expression or multiple statements)
  try {
    return processBlock(s, new Map()).value;
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

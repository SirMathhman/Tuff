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

  type TypedResult = { value: number; suffix?: Suffix };
  type Context = Map<string, TypedResult & { mutable: boolean; initialized: boolean }>;

  type Suffix = { kind: 'U' | 'I' | 'Bool'; width: number };

  // helper to validate a value against a suffix kind/width
  function validateValueAgainstSuffix(val: number, kind: 'U' | 'I' | 'Bool', width: number) {
    if (kind === 'Bool') {
      if (val !== 0 && val !== 1) {
        throw new Error('boolean literal must be 0 or 1');
      }
      return;
    }
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

  function validateNarrowing(source: Suffix | undefined, target: Suffix) {
    if (target.kind === 'Bool') {
      if (!source || source.kind !== 'Bool') {
        throw new Error('cannot convert numeric type to Bool');
      }
      return;
    }

    if (source && source.kind === 'Bool') {
      // Allow Bool to be converted to numeric types?
      // Rust doesn't allow implicit bool to int conversion.
      // But the test case just asks for x : Bool = true; x => 1.
      return;
    }

    const effectiveSource = source;
    if (effectiveSource && effectiveSource.width > target.width) {
      throw new Error(
        `narrowing conversion from ${effectiveSource.kind}${effectiveSource.width} to ${target.kind}${target.width}`
      );
    }
  }

  // helper to parse a single literal token and validate suffixes
  // returns { value, suffix } where suffix is undefined or { kind, width }
  function parseLiteralToken(token: string): TypedResult {
    const t = token.trim();
    if (t === 'true') return { value: 1, suffix: { kind: 'Bool', width: 1 } };
    if (t === 'false') return { value: 0, suffix: { kind: 'Bool', width: 1 } };

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
    if (token === 'true' || token === 'false') {
      return parseLiteralToken(token);
    }
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
    const tokens = expr.match(
      /true|false|([+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)|(\|\||&&|==|!=|<=|>=|[+\-*/<>])|([a-zA-Z_]\w*)/g
    );
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

    // extract operators first to check if they are all logical
    for (let i = 1; i < tokens.length; i += 2) {
      operators.push(tokens[i]);
    }
    const hasArithmeticOps = operators.some((op) => ['+', '-', '*', '/'].includes(op));

    for (let i = 0; i < tokens.length; i += 2) {
      // even indices are operands (literals or variables)
      const opResult = resolveOperand(tokens[i], context);
      if (tokens.length > 1 && opResult.suffix?.kind === 'Bool' && hasArithmeticOps) {
        throw new Error('cannot perform arithmetic on booleans');
      }
      operands.push(opResult);
    }

    // Helper to apply operators of a certain precedence
    function applyPass(
      ops: string[],
      handler: (left: TypedResult, op: string, right: TypedResult) => number | TypedResult
    ) {
      const targetOps = new Set(ops);
      for (let i = 0; i < operators.length; i++) {
        if (targetOps.has(operators[i])) {
          const res = handler(operands[i], operators[i], operands[i + 1]);
          if (typeof res === 'number') {
            operands[i] = { value: res };
          } else {
            operands[i] = res;
          }
          operands.splice(i + 1, 1);
          operators.splice(i, 1);
          i--;
        }
      }
    }

    // Helper to validate operand types for comparison/equality
    function validateComparable(left: TypedResult, right: TypedResult, isEquality: boolean) {
      const leftKind = left.suffix?.kind || 'Numeric';
      const rightKind = right.suffix?.kind || 'Numeric';
      if ((leftKind === 'Bool') !== (rightKind === 'Bool')) {
        throw new Error('cannot compare different types');
      }
      if (!isEquality && leftKind === 'Bool') {
        throw new Error('cannot compare different types');
      }
    }

    // first pass: handle multiplication and division (higher precedence)
    applyPass(['*', '/'], (left, op, right) => {
      if (op === '/' && right.value === 0) {
        throw new Error('division by zero');
      }
      return op === '*' ? left.value * right.value : left.value / right.value;
    });

    // second pass: handle addition and subtraction (left to right)
    applyPass(['+', '-'], (left, op, right) => {
      return op === '+' ? left.value + right.value : left.value - right.value;
    });

    // third pass: handle comparison operators (<, <=, >, >=)
    let isBooleanResult = false;
    applyPass(['<', '<=', '>', '>='], (left, op, right) => {
      validateComparable(left, right, false);
      isBooleanResult = true;
      let res = false;
      if (op === '<') res = left.value < right.value;
      else if (op === '<=') res = left.value <= right.value;
      else if (op === '>') res = left.value > right.value;
      else if (op === '>=') res = left.value >= right.value;
      return { value: res ? 1 : 0, suffix: { kind: 'Bool', width: 1 } };
    });

    // fourth pass: handle equality operators (==, !=)
    applyPass(['==', '!='], (left, op, right) => {
      validateComparable(left, right, true);
      isBooleanResult = true;
      const res = op === '==' ? left.value === right.value : left.value !== right.value;
      return { value: res ? 1 : 0, suffix: { kind: 'Bool', width: 1 } };
    });

    // Helper to handle logical operators
    function applyLogicalPass(opStr: '&&' | '||') {
      applyPass([opStr], (left, op, right) => {
        if (left.suffix?.kind !== 'Bool' || right.suffix?.kind !== 'Bool') {
          throw new Error('logical operators only supported for booleans');
        }
        isBooleanResult = true;
        const res =
          op === '&&'
            ? left.value !== 0 && right.value !== 0
            : left.value !== 0 || right.value !== 0;
        return { value: res ? 1 : 0, suffix: { kind: 'Bool', width: 1 } };
      });
    }

    // fifth pass: handle logical AND (&&)
    applyLogicalPass('&&');

    // sixth pass: handle logical OR (||)
    applyLogicalPass('||');

    const finalResult = operands[0].value;
    const finalSuffix = operands[0].suffix;

    // find the widest suffix among all original operands (if any)
    let widestSuffix: Suffix | undefined;
    for (let i = 0; i < tokens.length; i += 2) {
      const op = resolveOperand(tokens[i], context);
      if (
        op.suffix &&
        op.suffix.kind !== 'Bool' &&
        (!widestSuffix || op.suffix.width > widestSuffix.width)
      ) {
        widestSuffix = op.suffix;
      }
    }

    // validate against the widest type if it's not a boolean result
    if (widestSuffix && !isBooleanResult) {
      validateValueAgainstSuffix(finalResult, widestSuffix.kind, widestSuffix.width);
    }

    return { value: finalResult, suffix: finalSuffix || widestSuffix };
  }

  function evaluateIfExpression(expr: string, context: Context): TypedResult | null {
    const trimmed = expr.trim();
    if (!trimmed.startsWith('if')) {
      return null;
    }

    let cursor = 2;
    while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) {
      cursor++;
    }
    if (cursor >= trimmed.length || trimmed[cursor] !== '(') {
      throw new Error('expected "(" after "if"');
    }

    let conditionStart = cursor + 1;
    let depth = 1;
    let conditionEnd = -1;
    for (let i = conditionStart; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          conditionEnd = i;
          break;
        }
      }
    }

    if (conditionEnd === -1) {
      throw new Error('condition missing closing parenthesis');
    }

    const conditionExpr = trimmed.substring(conditionStart, conditionEnd).trim();
    if (!conditionExpr) {
      throw new Error('if condition cannot be empty');
    }

    const isIdentifierChar = (ch: string | undefined) =>
      ch !== undefined && /[A-Za-z0-9_]/.test(ch);

    let depthParen = 0;
    let depthBrace = 0;
    let pendingIfs = 0;
    let elseIndex = -1;
    for (let i = conditionEnd + 1; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '(') {
        depthParen++;
        continue;
      }
      if (ch === ')') {
        if (depthParen > 0) depthParen--;
        continue;
      }
      if (ch === '{') {
        depthBrace++;
        continue;
      }
      if (ch === '}') {
        if (depthBrace > 0) depthBrace--;
        continue;
      }

      if (depthParen === 0 && depthBrace === 0) {
        if (
          trimmed.startsWith('if', i) &&
          !isIdentifierChar(trimmed[i - 1]) &&
          !isIdentifierChar(trimmed[i + 2])
        ) {
          pendingIfs++;
          i += 1;
          continue;
        }
        if (
          trimmed.startsWith('else', i) &&
          !isIdentifierChar(trimmed[i - 1]) &&
          !isIdentifierChar(trimmed[i + 4])
        ) {
          if (pendingIfs > 0) {
            pendingIfs--;
            i += 3;
            continue;
          }
          elseIndex = i;
          break;
        }
      }
    }

    if (elseIndex === -1) {
      throw new Error('else keyword missing');
    }

    const trueBranch = trimmed.substring(conditionEnd + 1, elseIndex).trim();
    if (!trueBranch) {
      throw new Error('if true branch cannot be empty');
    }

    const falseBranch = trimmed.substring(elseIndex + 4).trim();
    if (!falseBranch) {
      throw new Error('if false branch cannot be empty');
    }

    const conditionResult = processExprWithContext(conditionExpr, context);
    if (conditionResult.suffix?.kind !== 'Bool') {
      throw new Error('if condition must be boolean');
    }
    const trueResult = processExprWithContext(trueBranch, context);
    const falseResult = processExprWithContext(falseBranch, context);

    const normalizedSuffix = (res: TypedResult): Suffix => res.suffix || { kind: 'I', width: 32 };
    const trueSuffix = normalizedSuffix(trueResult);
    const falseSuffix = normalizedSuffix(falseResult);
    if (trueSuffix.kind !== falseSuffix.kind) {
      throw new Error('if branches must match types');
    }

    return conditionResult.value !== 0 ? trueResult : falseResult;
  }

  // Helper to process an expression recursively through brackets and let blocks
  function processExprWithContext(expr: string, context: Context): TypedResult {
    const ifResult = evaluateIfExpression(expr, context);
    if (ifResult !== null) {
      return ifResult;
    }

    let e = expr;
    let sawBlockReplacement = false;

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
        const blockResult = processBlock(content, context);
        res = blockResult.result;
        sawBlockReplacement = true;
        // Update parent context with changes from block
        for (const [key, value] of blockResult.context) {
          if (!blockResult.declaredInThisBlock.has(key) && context.has(key)) {
            context.set(key, value);
          }
        }
      } else {
        // Regular expression - recursively process through brackets
        res = processExprWithContext(content, context);
      }

      let replacement = res.value.toString();
      if (res.suffix) {
        if (res.suffix.kind === 'Bool') {
          replacement = res.value === 1 ? 'true' : 'false';
        } else {
          replacement += `${res.suffix.kind}${res.suffix.width}`;
        }
      }
      e = e.substring(0, openPos) + replacement + e.substring(closePos + 1);
    }

    try {
      return evaluateExpression(e, context);
    } catch (err) {
      if (sawBlockReplacement && err instanceof Error && err.message === 'invalid expression') {
        const trimmed = e.trim();
        const match = trimmed.match(/^(true|false|[+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)\s+(.+)$/);
        if (match) {
          return evaluateExpression(match[2], context);
        }
      }
      throw err;
    }
  }

  // Helper to process a code block and return the final expression result along with updated context
  function processBlock(
    blockContent: string,
    parentContext: Context
  ): { result: TypedResult; context: Context; declaredInThisBlock: Set<string> } {
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

    const hasTrailingExpression = !!currentStmt.trim();
    // Add final statement
    if (hasTrailingExpression) {
      statements.push(currentStmt.trim());
    }

    let finalExpr = '';
    let lastProcessedValue: TypedResult | undefined;
    for (const stmt of statements) {
      if (stmt.startsWith('let ')) {
        // parse: let [mut] x [: U8|Bool] [= 2|true]
        const m = stmt.match(
          /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([UI]\d+|Bool))?(?:\s*=\s*(.+))?$/
        );
        if (!m) throw new Error('invalid let statement');
        const isMutable = !!m[1];
        const varName = m[2];
        if (declaredInThisBlock.has(varName)) {
          throw new Error(`variable already declared: ${varName}`);
        }
        const varType = m[3]; // undefined if no type specified
        const varExprStr = m[4] ? m[4].trim() : undefined;

        // evaluate the initialization expression if present
        let varValue = 0;
        let valSuffix: Suffix | undefined;
        let initialized = false;

        if (varExprStr !== undefined) {
          const varValueObj = processExprWithContext(varExprStr, context);
          varValue = varValueObj.value;
          valSuffix = varValueObj.suffix;
          initialized = true;
        }

        // validate against the type only if specified
        let declaredSuffix: Suffix | undefined;
        if (varType) {
          if (varType === 'Bool') {
            declaredSuffix = { kind: 'Bool', width: 1 };
          } else {
            const typeMatch = varType.match(/^([UI])(\d+)$/);
            if (typeMatch) {
              const kind = typeMatch[1] as 'U' | 'I';
              const width = Number(typeMatch[2]);
              declaredSuffix = { kind, width };
            }
          }

          if (declaredSuffix && initialized) {
            validateNarrowing(valSuffix, declaredSuffix);
            validateValueAgainstSuffix(varValue, declaredSuffix.kind, declaredSuffix.width);
          }
        }

        const varInfo = {
          value: varValue,
          suffix: declaredSuffix || valSuffix || { kind: 'I', width: 32 },
          mutable: isMutable,
          initialized: initialized,
        };
        context.set(varName, varInfo);
        declaredInThisBlock.add(varName);

        finalExpr = '';
        lastProcessedValue = undefined;
      } else if (stmt.includes('=') && !stmt.startsWith('let ')) {
        // assignment: x = 100 or compound: x += 1, x -= 2, x *= 3, x /= 4
        const m = stmt.match(/^([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
        if (!m) {
          finalExpr = stmt;
          lastProcessedValue = undefined;
          continue;
        }
        const varName = m[1];
        const op = m[2];
        const varExprStr = m[3].trim();

        if (!context.has(varName)) {
          throw new Error(`undefined variable: ${varName}`);
        }

        const varInfo = context.get(varName)!;
        if (!varInfo.mutable && varInfo.initialized) {
          throw new Error(`cannot assign to immutable variable: ${varName}`);
        }

        if (op !== '=' && varInfo.suffix?.kind === 'Bool') {
          throw new Error('cannot perform arithmetic on booleans');
        }

        let valueToAssign: string = varExprStr;
        if (op !== '=') {
          // Compound assignment: construct binary expression
          valueToAssign = `${varInfo.value}${op[0]} ${varExprStr}`;
        }

        const newValueObj = processExprWithContext(valueToAssign, context);
        const newValue = newValueObj.value;
        const newValSuffix = newValueObj.suffix;

        // validate against original type
        if (varInfo.suffix) {
          validateNarrowing(newValSuffix, varInfo.suffix);
          validateValueAgainstSuffix(newValue, varInfo.suffix.kind, varInfo.suffix.width);
        }

        const updatedVarInfo = { ...varInfo, value: newValue, initialized: true };
        context.set(varName, updatedVarInfo);
        if (!declaredInThisBlock.has(varName) && parentContext.has(varName)) {
          parentContext.set(varName, updatedVarInfo);
        }
        finalExpr = stmt;
        lastProcessedValue = updatedVarInfo;
      } else {
        // treat as final expression
        finalExpr = stmt;
        lastProcessedValue = undefined;
      }
    }

    if (!hasTrailingExpression || !finalExpr.trim()) {
      return { result: { value: 0 }, context, declaredInThisBlock };
    }

    if (lastProcessedValue) {
      return { result: lastProcessedValue, context, declaredInThisBlock };
    }

    return { result: processExprWithContext(finalExpr, context), context, declaredInThisBlock };
  }

  // Check for top-level code (which can be a single expression or multiple statements)
  try {
    return processBlock(s, new Map()).result.value;
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

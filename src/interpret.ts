export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric string
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return n;
  }

  // Allow simple arithmetic expressions consisting of digits, operators, dots, parentheses and whitespace
  if (/^[0-9+\-*/().\s]+$/.test(trimmed)) {
    try {
      const result = evaluateExpression(trimmed);
      if (Number.isFinite(result)) {
        return result;
      }
    } catch (e) {
      // fall through to throw below
    }
  }

  throw new Error('interpret: input is not a number or valid expression');
}

// --- Expression evaluator (supports +, -, *, /, parentheses, decimals, unary minus)

type Token = { type: 'num'; value: number } | { type: 'op'; value: string } | { type: 'paren'; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    // number (integer or decimal)
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i + 1;
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
      const slice = expr.slice(i, j);
      const num = Number(slice);
      if (!Number.isFinite(num)) throw new Error('Invalid number in expression');
      tokens.push({ type: 'num', value: num });
      i = j;
      continue;
    }
    throw new Error('Invalid character in expression');
  }
  return tokens;
}

function toRPN(tokens: Token[]): (Token | { type: 'op'; value: 'u-' })[] {
  const output: (Token | { type: 'op'; value: 'u-' })[] = [];
  const ops: ({ type: 'op'; value: string } | { type: 'paren'; value: string })[] = [];

  const precedence = (op: string) => (op === '+' || op === '-') ? 1 : 2;
  const isLeftAssoc = (op: string) => op !== 'u-';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'num') {
      output.push(t);
      continue;
    }
    if (t.type === 'op') {
      // Determine if this is unary minus: if '-' and (at start or after '(' or after another operator)
      if (t.value === '-') {
        const prev = tokens[i - 1];
        const isUnary = !prev || (prev.type === 'op' || (prev.type === 'paren' && prev.value === '('));
        if (isUnary) {
          // treat as unary minus with higher precedence
          const opToken = { type: 'op', value: 'u-' } as { type: 'op'; value: 'u-' };
          // handle precedence/stack
          while (ops.length > 0 && ops[ops.length - 1].type === 'op') {
            const top = ops[ops.length - 1] as { type: 'op'; value: string };
            const p1 = 3; // unary precedence
            const p2 = (top.value === 'u-') ? 3 : precedence(top.value);
            if (isLeftAssoc('u-') && p1 <= p2) {
              output.push(ops.pop() as { type: 'op'; value: any });
            } else if (!isLeftAssoc('u-') && p1 < p2) {
              output.push(ops.pop() as { type: 'op'; value: any });
            } else break;
          }
          ops.push(opToken as any);
          continue;
        }
      }
      // binary operator
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type !== 'op') break;
        const topOp = (top as { type: 'op'; value: string }).value;
        const p1 = precedence(t.value);
        const p2 = (topOp === 'u-') ? 3 : precedence(topOp);
        if ((isLeftAssoc(t.value) && p1 <= p2) || (!isLeftAssoc(t.value) && p1 < p2)) {
          output.push(ops.pop() as { type: 'op'; value: any });
        } else break;
      }
      ops.push(t);
      continue;
    }
    if (t.type === 'paren') {
      if (t.value === '(') {
        ops.push(t);
      } else {
        // t.value === ')'
        let found = false;
        while (ops.length > 0) {
          const top = ops.pop()!;
          if (top.type === 'paren' && top.value === '(') {
            found = true;
            break;
          }
          output.push(top as { type: 'op'; value: string });
        }
        if (!found) throw new Error('Mismatched parentheses in expression');
      }
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === 'paren') throw new Error('Mismatched parentheses in expression');
    output.push(top as { type: 'op'; value: string });
  }

  return output;
}

function evalRPN(rpn: (Token | { type: 'op'; value: 'u-' })[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === 'num') {
      stack.push(t.value as number);
      continue;
    }
    const op = (t.value as string);
    if (op === 'u-') {
      const a = stack.pop();
      if (a === undefined) throw new Error('Invalid expression');
      stack.push(-a);
      continue;
    }
    // binary
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error('Invalid expression');
    switch (op) {
      case '+': stack.push(a + b); break;
      case '-': stack.push(a - b); break;
      case '*': stack.push(a * b); break;
      case '/': stack.push(a / b); break;
      default: throw new Error('Unknown operator');
    }
  }
  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}

function evaluateExpression(expr: string): number {
  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

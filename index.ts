export function interpret(source: string): number {
  const tokens = tokenize(source);
  return parseExpression(tokens, { pos: 0 });
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let num = '';
      while (i < source.length && /\d/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      tokens.push(num);
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function parseExpression(tokens: string[], ctx: { pos: number }): number {
  let left = parseTerm(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '+' || tokens[ctx.pos] === '-')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseTerm(tokens, ctx);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: string[], ctx: { pos: number }): number {
  let left = parseFactor(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '*' || tokens[ctx.pos] === '/')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseFactor(tokens, ctx);
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: string[], ctx: { pos: number }): number {
  if (ctx.pos >= tokens.length) return 0;
  const token = tokens[ctx.pos]!;
  if (token === '(') {
    ctx.pos++;
    const result = parseExpression(tokens, ctx);
    if (ctx.pos < tokens.length && tokens[ctx.pos] === ')') {
      ctx.pos++;
    }
    return result;
  }
  ctx.pos++;
  return parseInt(token, 10);
}

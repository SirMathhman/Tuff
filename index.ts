export function interpret(source: string): number {
  const tokens = tokenize(source);
  const env: Record<string, number> = {};
  let result = 0;
  const ctx = { pos: 0, env };

  while (ctx.pos < tokens.length) {
    if (tokens[ctx.pos] === 'let') {
      ctx.pos++; // skip 'let'
      const name = tokens[ctx.pos]!;
      ctx.pos++; // skip identifier
      ctx.pos++; // skip '='
      const value = parseExpression(tokens, ctx);
      env[name] = value;
      if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') {
        ctx.pos++;
      }
    } else {
      result = parseExpression(tokens, ctx);
      if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') {
        ctx.pos++;
      }
    }
  }
  return result;
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
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      tokens.push(ident);
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')' || ch === '=' || ch === ';') {
      tokens.push(ch);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function parseExpression(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
  let left = parseTerm(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '+' || tokens[ctx.pos] === '-')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseTerm(tokens, ctx);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
  let left = parseFactor(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '*' || tokens[ctx.pos] === '/')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseFactor(tokens, ctx);
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
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
  if (/[a-zA-Z_]/.test(token)) {
    ctx.pos++;
    if (ctx.env[token] !== undefined) {
      return ctx.env[token];
    }
    throw new Error(`undefined identifier: ${token}`);
  }
  ctx.pos++;
  return parseInt(token, 10);
}

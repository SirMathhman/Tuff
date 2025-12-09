function parseSuffix(suffix: string): { kind: "u" | "i"; bits: number } | null {
  const t = suffix.toLowerCase();
  if (!/^[ui](8|16|32|64)$/.test(t)) return null;
  const kind = t[0] as "u" | "i";
  const bits = Number(t.slice(1));
  return { kind, bits };
}

function checkRange(
  kind: "u" | "i",
  bits: number,
  value: bigint,
  suffix: string
) {
  if (isNaN(bits) || bits <= 0) return;
  if (kind === "u") {
    const max = (1n << BigInt(bits)) - 1n;
    if (value > max)
      throw new Error(`interpret: unsigned overflow for ${suffix}`);
  } else {
    const max = (1n << BigInt(bits - 1)) - 1n;
    const min = -(1n << BigInt(bits - 1));
    if (value > max || value < min)
      throw new Error(`interpret: signed overflow for ${suffix}`);
  }
}

// addSuffixed removed — multi-term addition handled inline

function parseParenthesizedValue(
  str: string,
  env?: Map<string, { value: bigint; suffix: string }>
): { value: string; suffix: string; length: number } | null {
  if (!(str.startsWith("(") || str.startsWith("{"))) return null;
  const open = str[0];
  const close = open === "{" ? "}" : ")";
  let depth = 0;
  let i = 0;
  for (; i < str.length; i++) {
    const ch = str[i];
    if (ch === open) depth++;
    else if (ch === close) depth--;
    if (depth === 0) break;
  }
  if (i >= str.length) return null;
  const inner = str.slice(1, i);
  const sufMatches = Array.from(inner.matchAll(/[uUiI](?:8|16|32|64)/g)).map(
    (m) => m[0]
  );
  // Also consider suffixes from variables referenced inside the inner expression
  const idMatches = Array.from(
    inner.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)
  ).map((m) => m[1]);
  const varSufMatches: string[] = [];
  if (env) {
    for (const id of idMatches) {
      const v = env.get(id);
      if (v) varSufMatches.push(v.suffix);
    }
  }
  const allSufs = [...sufMatches, ...varSufMatches];
  if (allSufs.length === 0) return null;
  const sfx = allSufs[0];
  if (!allSufs.every((x) => x.toLowerCase() === sfx.toLowerCase())) return null;
  // Evaluate the inner block in a child scope cloned from env so inner `let`
  // declarations don't leak into the outer environment.
  const childEnv = env
    ? new Map(env)
    : new Map<string, { value: bigint; suffix: string }>();
  const val = interpret(inner, childEnv);
  return { value: val, suffix: sfx, length: i + 1 };
}

function parseOperandToken(
  str: string,
  env?: Map<string, { value: bigint; suffix: string }>
): { value: string; suffix: string; consumed: number } | null {
  // parenthesized value first
  const p = parseParenthesizedValue(str, env);
  if (p) return { value: p.value, suffix: p.suffix, consumed: p.length };

  // identifier / variable lookup
  const idm = str.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*/);
  if (idm) {
    const name = idm[1];
    if (env && env.has(name)) {
      const v = env.get(name)!;
      return {
        value: v.value.toString(),
        suffix: v.suffix,
        consumed: idm[0].length,
      };
    }
  }
  const mm = str.match(/^\s*([+-]?\d+)\s*([a-zA-Z0-9]+)\s*/);
  if (!mm) return null;
  return { value: mm[1], suffix: mm[2], consumed: mm[0].length };
}

function tryParseExpr(
  inputStr: string,
  env?: Map<string, { value: bigint; suffix: string }>
) {
  const nums: string[] = [];
  const ops: string[] = [];
  let rest = inputStr;
  const firstTok = parseOperandToken(rest, env);
  if (!firstTok) return null;
  nums.push(firstTok.value);
  const firstSuffix = firstTok.suffix;
  rest = rest.slice(firstTok.consumed).trimStart();
  const opRe = /^([+\-*])\s*/;
  while (rest.length > 0) {
    const mo = rest.match(opRe);
    if (!mo) return null;
    ops.push(mo[1]);
    rest = rest.slice(mo[0].length);
    const tok = parseOperandToken(rest, env);
    if (!tok) return null;
    if (tok.suffix.toLowerCase() !== firstSuffix.toLowerCase()) return null;
    nums.push(tok.value);
    rest = rest.slice(tok.consumed).trimStart();
  }
  if (nums.length < 2) return null;
  return { nums, ops, suffix: firstSuffix } as {
    nums: string[];
    ops: string[];
    suffix: string;
  };
}

function evaluateValueAndSuffix(
  inputStr: string,
  env?: Map<string, { value: bigint; suffix: string }>
): { value: bigint; suffix: string } {
  const ep = tryParseExpr(inputStr, env);
  if (ep) {
    const { nums, ops, suffix } = ep;
    const parsed = parseSuffix(suffix);
    if (!parsed)
      throw new Error(
        "interpret: mismatched or unsupported suffixes in expression"
      );
    const { kind, bits } = parsed;
    let nnums: bigint[] = nums.map((x) => BigInt(x));
    let nops: string[] = [...ops];
    for (let i = 0; i < nops.length; ) {
      if (nops[i] === "*") {
        const prod = nnums[i] * nnums[i + 1];
        nnums.splice(i, 2, prod);
        nops.splice(i, 1);
      } else {
        i++;
      }
    }
    let acc = nnums[0];
    for (let i = 0; i < nops.length; i++) {
      const op = nops[i];
      const n = nnums[i + 1];
      if (op === "+") acc = acc + n;
      else if (op === "-") acc = acc - n;
      else throw new Error("interpret: unsupported operator");
    }
    checkRange(kind, bits, acc, suffix);
    return { value: acc, suffix };
  }

  // single number with suffix
  const m2 = inputStr.trim().match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*$/);
  if (m2) {
    const [, num, suffix] = m2;
    const suffixRe = /^[uUiI](?:8|16|32|64)$/;
    if (!suffixRe.test(suffix))
      throw new Error("interpret: unsupported or invalid suffix");
    const parsed = parseSuffix(suffix);
    if (!parsed) throw new Error("interpret: unsupported or invalid suffix");
    const { kind, bits } = parsed;
    const val = BigInt(num);
    checkRange(kind, bits, val, suffix);
    return { value: val, suffix };
  }

  // identifier lookup
  const idOnly = inputStr.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (idOnly) {
    const name = idOnly[1];
    if (!env || !env.has(name))
      throw new Error(`interpret: unknown identifier ${name}`);
    const v = env.get(name)!;
    return { value: v.value, suffix: v.suffix };
  }

  throw new Error("interpret: only integer strings are supported");
}

function executeStatements(
  parts: string[],
  env: Map<string, { value: bigint; suffix: string }>,
  suffixRe: RegExp
): string | null {
  let lastVal: string | null = null;

  let lastWasLet = false;
  for (const stmt of parts) {
    // let <ident> : <Type> = <expr>
    const letMatch = stmt.match(
      /^let\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([uUiI](?:8|16|32|64))\s*=\s*(.*)$/
    );
    if (letMatch) {
      const name = letMatch[1];
      const declared = letMatch[2];
      const rhs = letMatch[3];
      let r;
      // allow a bare integer literal on the RHS when assigning to a declared type
      const bare = rhs.trim().match(/^([+-]?\d+)$/);
      if (bare) {
        const v = BigInt(bare[1]);
        const pd = parseSuffix(declared);
        if (!pd) throw new Error("interpret: invalid declared suffix");
        checkRange(pd.kind, pd.bits, v, declared);
        r = { value: v, suffix: declared };
      } else {
        r = evaluateValueAndSuffix(rhs, env);
      }
      // ensure value fits declared type
      const pd = parseSuffix(declared);
      if (!pd) throw new Error("interpret: invalid declared suffix");
      checkRange(pd.kind, pd.bits, r.value, declared);
      env.set(name, { value: r.value, suffix: declared });
      lastVal = r.value.toString();
      lastWasLet = true;
      continue;
    }

    // otherwise evaluate expression or identifier
    const simpleNum = stmt.trim().match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*$/);
    if (simpleNum && parts.length === 1) {
      const num = simpleNum[1];
      const suffix = simpleNum[2];
      if (!suffixRe.test(suffix)) {
        throw new Error("interpret: unsupported or invalid suffix");
      }
      const parsed = parseSuffix(suffix);
      if (!parsed) throw new Error("interpret: unsupported or invalid suffix");
      checkRange(parsed.kind, parsed.bits, BigInt(num), suffix);
      lastVal = num;
      continue;
    }
    const r2 = evaluateValueAndSuffix(stmt, env);
    lastVal = r2.value.toString();
    lastWasLet = false;
  }

  if (lastWasLet) return "";
  return lastVal;
}

export function interpret(
  input: string,
  envIn?: Map<string, { value: bigint; suffix: string }>
): string {
  // Simple interpreter: accept integer strings and return them unchanged (trimmed).
  // Examples: "100" => "100"
  const s = input.trim();
  // Support numeric type suffixes like `100U8`, `-42u16`.
  // Capture the leading integer and ignore a trailing alphabetic/numeric suffix.
  // Require a suffix — bare integers (e.g. "100") are no longer supported.
  // Supported suffixes: U8, U16, U32, U64, I8, I16, I32, I64 (case-insensitive)
  const suffixRe = /^[uUiI](?:8|16|32|64)$/;

  // Try parse an n-ary expression of operands separated by + or -
  // environment of variables for this interpret invocation (may be shared by callers)
  const env = envIn ?? new Map<string, { value: bigint; suffix: string }>();

  // Top-level statement handling: support semicolon-separated statements and let declarations
  const parts = splitTopLevelStatements(s);

  // Special-case single-statement inputs that are not `let` declarations:
  if (parts.length === 1 && !parts[0].trim().startsWith("let ")) {
    const stmt = parts[0];
    const simpleNum = stmt.trim().match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)\s*$/);
    if (simpleNum) {
      const num = simpleNum[1];
      const suffix = simpleNum[2];
      if (!suffixRe.test(suffix)) {
        throw new Error("interpret: unsupported or invalid suffix");
      }
      const parsed = parseSuffix(suffix);
      if (!parsed) throw new Error("interpret: unsupported or invalid suffix");
      checkRange(parsed.kind, parsed.bits, BigInt(num), suffix);
      return num;
    }

    const r = evaluateValueAndSuffix(stmt, env);
    return r.value.toString();
  }
  const maybe = executeStatements(parts, env, suffixRe);
  if (maybe !== null) return maybe;

  const m = s.match(/^([+-]?\d+)\s*([a-zA-Z0-9]+)$/);
  if (m) {
    const [, num, suffix] = m;
    // Ensure suffix is one of supported types
    if (!suffixRe.test(suffix)) {
      throw new Error("interpret: unsupported or invalid suffix");
    }

    const parsed = parseSuffix(suffix);
    if (!parsed) throw new Error("interpret: unsupported or invalid suffix");
    const { kind, bits } = parsed;
    checkRange(kind, bits, BigInt(num), suffix);

    return num;
  }
  // Split top-level statements by semicolons, but ignore semicolons inside
  // parentheses or braces so nested blocks keep their internal statements.
  function splitTopLevelStatements(src: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let buf = "";
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if ((ch === "(" || ch === "{") && !(i > 0 && src[i - 1] === "\\")) {
        depth++;
      } else if (
        (ch === ")" || ch === "}") &&
        !(i > 0 && src[i - 1] === "\\")
      ) {
        if (depth > 0) depth--;
      }
      if (ch === ";" && depth === 0) {
        out.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (buf.trim().length > 0) out.push(buf.trim());
    return out.filter(Boolean);
  }

  throw new Error("interpret: only integer strings are supported");
}

export default interpret;

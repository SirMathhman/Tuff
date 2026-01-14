const RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: 0n, max: 255n },
  U16: { min: 0n, max: 65535n },
  U32: { min: 0n, max: 4294967295n },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128n, max: 127n },
  I16: { min: -32768n, max: 32767n },
  I32: { min: -2147483648n, max: 2147483647n },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedVal = { value: any; type?: string; mutable?: boolean };
type Scope = Record<string, TypedVal>;
type StructDef = { fields: Record<string, string> };
type FunctionDef = {
  params: Array<{ name: string; type: string }>;
  returnType: string;
  body: string;
};
type InternalScope = {
  values: Scope;
  parent?: InternalScope;
  structs?: Record<string, StructDef>;
  typeAliases?: Record<string, string>;
  functions?: Record<string, FunctionDef>;
};

class YieldSignal {
  constructor(public value: TypedVal) {}
}


function getFromScope(
  scope: InternalScope,
  name: string
): TypedVal | undefined {
  if (name in scope.values) return scope.values[name];
  if (scope.parent) return getFromScope(scope.parent, name);
  return undefined;
}

function updateInScope(
  scope: InternalScope,
  name: string,
  val: TypedVal
): void {
  if (name in scope.values || !scope.parent) {
    scope.values[name] = val;
  } else {
    updateInScope(scope.parent, name, val);
  }
}

function getStructFromScope(
  scope: InternalScope,
  name: string
): StructDef | undefined {
  if (scope.structs && name in scope.structs) return scope.structs[name];
  if (scope.parent) return getStructFromScope(scope.parent, name);
  return undefined;
}

function getTypeAliasFromScope(
  scope: InternalScope,
  name: string
): string | undefined {
  if (scope.typeAliases && name in scope.typeAliases)
    return scope.typeAliases[name];
  if (scope.parent) return getTypeAliasFromScope(scope.parent, name);
  return undefined;
}

function getFunctionFromScope(
  scope: InternalScope,
  name: string
): FunctionDef | undefined {
  if (scope.functions && name in scope.functions) return scope.functions[name];
  if (scope.parent) return getFunctionFromScope(scope.parent, name);
  return undefined;
}

function resolveTypeAlias(type: string, scope: InternalScope): string {
  const resolved = getTypeAliasFromScope(scope, type);
  if (resolved) {
    // For union types, recursively resolve each component
    if (resolved.includes("|")) {
      const components = resolved.split("|").map((t) => {
        const trimmed = t.trim();
        return resolveTypeAlias(trimmed, scope);
      });
      return components.join("|");
    }
    return resolveTypeAlias(resolved, scope);
  }
  return type;
}

function checkValueAgainstUnion(
  value: number,
  valueType: string | undefined,
  components: string[]
): boolean {
  for (const component of components) {
    if (valueType && valueType === component) return true;
    // For untyped values, check if it fits in component's range
    if (!valueType) {
      const range = RANGES[component];
      if (range) {
        const bigVal = BigInt(Math.floor(value));
        if (bigVal >= range.min && bigVal <= range.max) return true;
      }
    }
  }
  return false;
}

function valueMatchesType(
  value: number,
  valueType: string | undefined,
  targetType: string,
  scope: InternalScope
): boolean {
  // Resolve the valueType if it's an alias
  const resolvedValueType = valueType
    ? resolveTypeAlias(valueType, scope)
    : undefined;
  const resolvedTargetType = resolveTypeAlias(targetType, scope);

  // If valueType is a union and targetType is not, check if targetType is one of the union members
  if (
    resolvedValueType &&
    resolvedValueType.includes("|") &&
    !resolvedTargetType.includes("|")
  ) {
    const components = resolvedValueType.split("|").map((t) => t.trim());
    return components.includes(resolvedTargetType);
  }

  // If targetType is a union, check against all components
  if (resolvedTargetType.includes("|")) {
    const components = resolvedTargetType.split("|").map((t) => t.trim());

    // If valueType is also a union, check if they're equivalent
    if (resolvedValueType && resolvedValueType.includes("|")) {
      const valueComponents = resolvedValueType.split("|").map((t) => t.trim());
      // Check if all components match
      if (valueComponents.length === components.length) {
        let allMatch = true;
        for (const vc of valueComponents) {
          if (!components.includes(vc)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return true;
      }
    }

    return checkValueAgainstUnion(value, resolvedValueType, components);
  }

  // Single type check
  if (resolvedValueType === resolvedTargetType) return true;
  // For untyped values, check range
  if (!resolvedValueType) {
    const range = RANGES[resolvedTargetType];
    if (range) {
      const bigVal = BigInt(Math.floor(value));
      return bigVal >= range.min && bigVal <= range.max;
    }
  }
  return false;
}

function parseTypeSuffix(numStr: string, rest: string, n: number): TypedVal {
  if (rest.length === 0) return { value: n };
  if (rest === "bool") return { value: n, type: "Bool" };

  const sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
  if (!sufMatch) return { value: n };

  const sign = sufMatch[1].toUpperCase();
  const bits = parseInt(sufMatch[2], 10);

  if (!/^[-+]?\d+$/.test(numStr)) {
    throw new Error("Integer required for integer type suffix");
  }

  const intVal = Number(numStr);
  const key = `${sign}${bits}`;
  const range = RANGES[key];
  if (!range) return { value: n };

  const big = BigInt(intVal);
  if (big < range.min || big > range.max)
    throw new Error(`${key} out of range`);

  if (
    bits === 64 &&
    (big > BigInt(Number.MAX_SAFE_INTEGER) ||
      big < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(`${key} value not representable as a JavaScript number`);
  }

  return { value: Number(intVal), type: key };
}

function parseToken(token: string, scope: InternalScope): TypedVal {
  if (token.startsWith("!")) {
    const res = parseToken(token.slice(1), scope);
    return { value: res.value ? 0 : 1, type: "Bool" };
  }
  if (token === "true") return { value: 1, type: "Bool" };
  if (token === "false") return { value: 0, type: "Bool" };

  if (token.includes(".") && !/^[+-]?\d+\.\d+/.test(token)) {
    const parts = token.split(".");
    const obj = getFromScope(scope, parts[0]);
    if (!obj) throw new Error(`Variable ${parts[0]} not found`);
    if (typeof obj.value === "object" && obj.value !== null) {
      let current = obj.value;
      for (let i = 1; i < parts.length; i++) {
        if (typeof current !== "object" || current === null) {
          throw new Error(`Cannot access property ${parts[i]} of non-object`);
        }
        current = current[parts[i]];
      }
      return { value: current };
    }
  }

  const inScope = getFromScope(scope, token);
  if (inScope) return inScope;
  const m = token.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!m) throw new Error(`Invalid token: ${token}`);
  const numStr = m[0];
  const n = parseFloat(numStr);
  if (Number.isNaN(n)) throw new Error("Invalid number");

  const rest = token.slice(numStr.length);
  return parseTypeSuffix(numStr, rest, n);
}

function promoteTypes(type1?: string, type2?: string): string | undefined {
  if (!type1 || type1 === "Bool") return type2;
  if (!type2 || type2 === "Bool") return type1;
  const r1 = RANGES[type1];
  const r2 = RANGES[type2];
  if (!r1) return type2;
  if (!r2) return type1;
  return r1.max >= r2.max ? type1 : type2;
}

function checkOverflow(value: number, type?: string): void {
  if (type && type !== "Bool") {
    const r = RANGES[type];
    if (!r) return;
    const big = BigInt(Math.floor(value));
    if (big < r.min || big > r.max) throw new Error(`${type} overflow`);
  }
}

function applyOp(left: TypedVal, right: TypedVal, op: string): TypedVal {
  let res: number;
  let type = promoteTypes(left.type, right.type);
  if (op === "*") res = left.value * right.value;
  else if (op === "/") res = left.value / right.value;
  else if (op === "%") res = left.value % right.value;
  else if (op === "+") res = left.value + right.value;
  else if (op === "-") res = left.value - right.value;
  else if (op === "<") {
    res = left.value < right.value ? 1 : 0;
    type = "Bool";
  } else if (op === ">") {
    res = left.value > right.value ? 1 : 0;
    type = "Bool";
  } else if (op === "<=") {
    res = left.value <= right.value ? 1 : 0;
    type = "Bool";
  } else if (op === ">=") {
    res = left.value >= right.value ? 1 : 0;
    type = "Bool";
  } else if (op === "==") {
    res = left.value === right.value ? 1 : 0;
    type = "Bool";
  } else if (op === "!=") {
    res = left.value !== right.value ? 1 : 0;
    type = "Bool";
  } else if (op === "&&") {
    res = left.value && right.value ? 1 : 0;
    type = "Bool";
  } else if (op === "||") {
    res = left.value || right.value ? 1 : 0;
    type = "Bool";
  } else throw new Error(`Unknown operator: ${op}`);
  if (type !== "Bool") checkOverflow(res, type);
  return { value: res, type };
}

function evaluateExpression(
  s: string,
  tokens: Array<{ text: string; index: number }>,
  scope: InternalScope
): TypedVal {
  const parsed = tokens.map((t) => ({
    ...parseToken(t.text, scope),
    text: t.text,
    index: t.index,
  }));

  const ops: string[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const between = s.slice(
      parsed[i - 1].index + parsed[i - 1].text.length,
      parsed[i].index
    );
    const opMatch = between.match(/==|!=|<=|>=|&&|\|\||[+\-*/%<>]/);
    if (!opMatch) throw new Error("Invalid operator between operands");
    ops.push(opMatch[0]);
  }

  const values: TypedVal[] = parsed.map((p) => ({
    value: p.value,
    type: p.type,
  }));
  const currentOps = [...ops];

  const processPass = (targetOps: string[]) => {
    for (let i = 0; i < currentOps.length; i++) {
      if (targetOps.includes(currentOps[i])) {
        const res = applyOp(values[i], values[i + 1], currentOps[i]);
        values.splice(i, 2, res);
        currentOps.splice(i, 1);
        i--;
      }
    }
  };

  processPass(["*", "/", "%"]);
  processPass(["+", "-"]);
  processPass(["<", ">", "<=", ">="]);
  processPass(["==", "!="]);
  processPass(["&&"]);
  processPass(["||"]);

  return { value: values[0].value, type: values[0].type };
}

function validateTypeRange(
  targetRange: { min: bigint; max: bigint } | undefined,
  sourceRange: { min: bigint; max: bigint } | undefined,
  target: string,
  source: string,
  sourceType: string
): void {
  const noRanges = !targetRange || !sourceRange;
  const typeMismatch = noRanges ? target !== source : false;
  const outOfRange =
    targetRange && sourceRange
      ? targetRange.max < sourceRange.max || targetRange.min > sourceRange.min
      : false;

  if (typeMismatch || outOfRange) {
    throw new Error(
      `Incompatible types: cannot implicitly convert ${sourceType} to ${target}`
    );
  }
}

function checkTypeCompatibility(
  target: string,
  source: string,
  sourceType: string
): void {
  const targetRange = RANGES[target];
  const sourceRange = RANGES[source];
  validateTypeRange(targetRange, sourceRange, target, source, sourceType);
}

function checkNarrowing(targetType: string, sourceType: string): void {
  // If target is a union type, check if source type is one of the union members
  if (targetType.includes("|")) {
    const components = targetType.split("|").map((t) => t.trim());
    // For union types, require exact type match (no implicit conversion)
    for (const component of components) {
      if (component === sourceType) {
        return; // Found an exact match
      }
    }
    throw new Error(
      `Incompatible types: ${sourceType} is not compatible with union ${targetType}`
    );
  }

  // If source is a union type (but target is not), check if all union members are compatible
  if (sourceType.includes("|")) {
    const components = sourceType.split("|").map((t) => t.trim());
    // All union members must be compatible with the target type
    for (const component of components) {
      checkTypeCompatibility(targetType, component, sourceType);
    }
    return; // All union members are compatible
  }

  // Single type narrowing check
  const target = RANGES[targetType];
  const source = RANGES[sourceType];
  validateTypeRange(target, source, targetType, sourceType, sourceType);
  // Check for narrowing specifically
  if (
    target &&
    source &&
    (target.max < source.max || target.min > source.min)
  ) {
    throw new Error(
      `Incompatible types: cannot implicitly narrow ${sourceType} to ${targetType}`
    );
  }
}

function parseStructFields(
  fieldStr: string,
  scope: InternalScope
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Record<string, any> = {};
  const fieldDecls = fieldStr.split(",").map((s) => s.trim());
  for (const decl of fieldDecls) {
    const parts = decl.split(":").map((s) => s.trim());
    if (parts.length !== 2)
      throw new Error(`Invalid field declaration: ${decl}`);
    const [fname, fvalStr] = parts;
    const fval = interpretRaw(fvalStr, scope);
    fields[fname] = fval.value;
  }
  return fields;
}

function initializeStruct(
  name: string,
  structName: string,
  fieldStr: string,
  scope: InternalScope,
  mutable: boolean,
  localDecls: Set<string>
): TypedVal {
  const struct = getStructFromScope(scope, structName);
  if (!struct) throw new Error(`Struct ${structName} not defined`);
  const fields = parseStructFields(fieldStr, scope);
  scope.values[name] = {
    value: fields,
    type: structName,
    mutable,
  };
  localDecls.add(name);
  return { value: fields };
}

function handleFunctionCall(
  funcName: string,
  func: FunctionDef,
  argsStr: string,
  scope: InternalScope
): TypedVal {
  // Parse arguments
  const args: TypedVal[] = [];
  if (argsStr.trim()) {
    const argExprs = argsStr.split(",").map((a) => a.trim());
    for (const argExpr of argExprs) {
      args.push(interpretRaw(argExpr, scope));
    }
  }

  // Validate argument count
  if (args.length !== func.params.length) {
    throw new Error(
      `Function ${funcName} expects ${func.params.length} arguments, got ${args.length}`
    );
  }

  // Create function scope with parameters
  const funcScope: InternalScope = {
    values: {},
    parent: scope,
  };

  // Bind parameters to arguments
  for (let i = 0; i < func.params.length; i++) {
    const param = func.params[i];
    const arg = args[i];
    // Type check the argument against the parameter type
    // Allow untyped numeric values to be coerced to the parameter type
    if (arg.type) {
      checkNarrowing(param.type, arg.type);
    } else {
      // For untyped values, check if they fit in the target type's range
      checkOverflow(arg.value as number, param.type);
    }
    funcScope.values[param.name] = {
      value: arg.value,
      type: param.type,
      mutable: false,
    };
  }

  // Execute function body
  const result = interpretRaw(func.body, funcScope);

  // Type check the return value
  // Allow untyped numeric values to be coerced to the return type
  if (result.type) {
    checkNarrowing(func.returnType, result.type);
  } else {
    // For untyped values, check if they fit in the return type's range
    checkOverflow(result.value as number, func.returnType);
  }

  return { value: result.value, type: func.returnType };
}

function handleLet(
  st: string,
  scope: InternalScope,
  localDecls: Set<string>
): TypedVal {
  // Check for struct initialization first
  const structInit = st.match(
    /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w+)\s*\{(.+)\}$/
  );
  if (structInit) {
    const [, mutS, name, structName, fieldStr] = structInit;
    return initializeStruct(
      name,
      structName,
      fieldStr,
      scope,
      !!mutS,
      localDecls
    );
  }

  // Regular let statement
  const m = st.match(
    /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*([a-zA-Z_]\w*))?(?:\s*=\s*(.+))?$/
  );

  if (!m) {
    throw new Error("Invalid let declaration");
  }

  const [, mutS, name, type, expr] = m;
  if (localDecls.has(name)) {
    throw new Error(`Variable already declared in this scope: ${name}`);
  }
  let res: TypedVal = { value: 0, type };
  if (expr) {
    res = interpretRaw(expr, scope);
    const resolvedType = type ? resolveTypeAlias(type, scope) : type;
    if (resolvedType && res.type) checkNarrowing(resolvedType, res.type);
  }
  const resolvedType = type ? resolveTypeAlias(type, scope) : type;
  const finalType = resolvedType || res.type;
  if (finalType) checkOverflow(res.value as number, finalType);
  scope.values[name] = { value: res.value, type: finalType, mutable: !!mutS };
  localDecls.add(name);
  return res;
}

function handleAssign(st: string, scope: InternalScope): TypedVal {
  const m = st.match(/^([a-zA-Z_]\w*)\s*([+\-*/%]?=)(?!=)\s*(.+)$/);
  if (!m) throw new Error("Invalid assignment");
  const [, name, op, expr] = m;
  const existing = getFromScope(scope, name);
  if (!existing) throw new Error(`Variable not declared: ${name}`);
  if (!existing.mutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  const rhs = interpretRaw(expr, scope);
  let res: TypedVal;
  if (op === "=") {
    res = rhs;
    const targetType = existing.type
      ? resolveTypeAlias(existing.type, scope)
      : existing.type;
    if (targetType && res.type) checkNarrowing(targetType, res.type);
    if (targetType) checkOverflow(res.value, targetType);
  } else {
    res = applyOp(existing, rhs, op[0]);
    if (existing.type) checkOverflow(res.value, existing.type);
  }
  updateInScope(scope, name, {
    value: res.value,
    type: existing.type || res.type,
    mutable: existing.mutable,
  });
  return res;
}

function findClosingBrace(s: string, startPos: number): number {
  let d = 0;
  for (let i = startPos; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}") {
      if (--d === 0) return i;
    }
  }
  return -1;
}

function parseBranch(s: string, pos: number): { content: string; end: number } {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  if (s[pos] === "{") {
    const end = findClosingBrace(s, pos);
    if (end === -1) throw new Error("Missing closing brace for branch");
    return { content: s.slice(pos + 1, end), end: end + 1 };
  }
  // No braces - look for end of statement
  let depth = 0;
  let stmtEnd = pos;
  for (let i = pos; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "(") depth++;
    else if (s[i] === "}" || s[i] === ")") depth--;
    else if (s[i] === ";" && depth === 0) {
      stmtEnd = i;
      break;
    }
  }
  // Check for else/while after the statement
  let checkPos = stmtEnd;
  while (checkPos < s.length && /[\s;]/.test(s[checkPos])) checkPos++;
  if (checkPos < s.length) {
    const nextPart = s.slice(checkPos);
    if (nextPart.startsWith("else") || nextPart.startsWith("while")) {
      return { content: s.slice(pos, stmtEnd).trim(), end: stmtEnd };
    }
  }
  const elseMatch = s.slice(pos).match(/\belse\b/);
  if (elseMatch) {
    const content = s.slice(pos, pos + elseMatch.index!).trim();
    return { content, end: pos + elseMatch.index! };
  }
  return { content: s.slice(pos).trim(), end: s.length };
}

function extractCondition(
  s: string,
  keyword: string
): { condStr: string; condEnd: number } {
  const condStart = s.indexOf("(");
  if (condStart === -1) throw new Error(`Missing condition in ${keyword}`);
  let d = 0,
    condEnd = -1;
  for (let i = condStart; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") {
      if (--d === 0) {
        condEnd = i;
        break;
      }
    }
  }
  if (condEnd === -1)
    throw new Error(`Missing closing paren for ${keyword} condition`);
  return { condStr: s.slice(condStart + 1, condEnd), condEnd };
}

function handleIf(
  s: string,
  scope: InternalScope
): { val: TypedVal; end: number } {
  const { condStr, condEnd } = extractCondition(s, "if");
  const condition = interpretRaw(condStr, scope);
  const thenRes = parseBranch(s, condEnd + 1);
  let finalPos = thenRes.end;
  let elsePart: string | undefined;

  let checkElse = finalPos;
  while (checkElse < s.length && /\s/.test(s[checkElse])) checkElse++;
  if (s.slice(checkElse).startsWith("else")) {
    const elseRes = parseBranch(s, checkElse + 4);
    elsePart = elseRes.content;
    finalPos = elseRes.end;
  }

  try {
    const res = condition.value
      ? interpretRaw(thenRes.content, { values: {}, parent: scope, structs: {} })
      : elsePart !== undefined
      ? interpretRaw(elsePart, { values: {}, parent: scope, structs: {} })
      : { value: 0 };
    return { val: res, end: finalPos };
  } catch (e) {
    if (e instanceof YieldSignal) {
      throw e;
    }
    throw e;
  }
}

function handleWhile(
  s: string,
  scope: InternalScope
): { val: TypedVal; end: number } {
  const { condStr, condEnd } = extractCondition(s, "while");
  const bodyRes = parseBranch(s, condEnd + 1);
  const bodyStr = bodyRes.content;
  const finalPos = bodyRes.end;

  let lastVal: TypedVal = { value: 0 };
  try {
    while (interpretRaw(condStr, scope).value) {
      lastVal = interpretRaw(bodyStr, { values: {}, parent: scope, structs: {} });
    }
  } catch (e) {
    if (e instanceof YieldSignal) {
      throw e;
    }
    throw e;
  }
  return { val: lastVal, end: finalPos };
}

function handleDoWhile(
  s: string,
  scope: InternalScope
): { val: TypedVal; end: number } {
  const bodyRes = parseBranch(s, 2);
  const bodyStr = bodyRes.content;
  let pos = bodyRes.end;
  while (pos < s.length && (/\s/.test(s[pos]) || s[pos] === ";")) pos++;
  if (!s.slice(pos).startsWith("while")) {
    throw new Error(
      `Missing while keyword for do-while loop at pos ${pos}. s: "${s.slice(
        0,
        50
      )}..."`
    );
  }
  const { condStr, condEnd } = extractCondition(s.slice(pos), "while");
  const finalPos = pos + condEnd + 1;

  let lastVal: TypedVal = { value: 0 };
  try {
    do {
      lastVal = interpretRaw(bodyStr, { values: {}, parent: scope, structs: {} });
    } while (interpretRaw(condStr, scope).value);
  } catch (e) {
    if (e instanceof YieldSignal) {
      throw e;
    }
    throw e;
  }

  return { val: lastVal, end: finalPos };
}

function handleMatch(
  s: string,
  scope: InternalScope
): { val: TypedVal; end: number } {
  const { condStr, condEnd } = extractCondition(s, "match");
  const target = interpretRaw(condStr, scope);
  const bodyRes = parseBranch(s, condEnd + 1);
  const bodyStr = bodyRes.content;
  const finalPos = bodyRes.end;

  const cases = splitStatements(bodyStr);
  try {
    for (const c of cases) {
      const m = c.match(/^case\s+(.+)\s*=>\s*(.+)$/);
      if (!m) continue;
      const [, patternStr, consequenceStr] = m;
      const pattern = patternStr.trim();
      let isMatch = false;
      if (pattern === "_") {
        isMatch = true;
      } else {
        const pVal = interpretRaw(pattern, scope);
        if (pVal.value === target.value) isMatch = true;
      }

      if (isMatch) {
        const res = interpretRaw(consequenceStr, scope);
        return { val: res, end: finalPos };
      }
    }
  } catch (e) {
    if (e instanceof YieldSignal) {
      throw e;
    }
    throw e;
  }
  return { val: { value: 0 }, end: finalPos };
}

function resolveExpressions(
  s: string,
  keyword: string,
  handler: (s: string, scope: InternalScope) => { val: TypedVal; end: number },
  scope: InternalScope
): string {
  let res = s;
  while (true) {
    let kwIdx = -1;
    let searchPos = res.length;
    while (searchPos >= 0) {
      const found = res.lastIndexOf(keyword, searchPos);
      if (found === -1) break;
      if (
        (found === 0 || !/[a-zA-Z0-9_]/.test(res[found - 1])) &&
        (found + keyword.length === res.length ||
          !/[a-zA-Z0-9_]/.test(res[found + keyword.length]))
      ) {
        kwIdx = found;
        break;
      }
      searchPos = found - 1;
    }
    if (kwIdx === -1) break;
    let val: TypedVal;
    let end: number;
    try {
      const result = handler(res.slice(kwIdx), scope);
      val = result.val;
      end = result.end;
    } catch (e) {
      if (e instanceof YieldSignal) {
        throw e;
      }
      throw e;
    }
    // Don't append type suffix for Bool (boolean values are just 0 or 1)
    const typeSuffix = val.type && val.type !== "Bool" ? val.type : "";
    res = res.slice(0, kwIdx) + val.value + typeSuffix + res.slice(kwIdx + end);
  }
  return res;
}

function splitStatements(s: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === "{" || char === "(") depth++;
    if (char === "}" || char === ")") depth--;
    if (char === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
    if (char === "}" && depth === 0) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j < s.length) {
        const nextPart = s.slice(j);
        if (
          !nextPart.startsWith("else") &&
          !nextPart.startsWith("while") &&
          !nextPart.startsWith(";") &&
          !/^[+\-*/%|&^=<>.!]/.test(nextPart)
        ) {
          result.push(current.trim());
          current = "";
          i = j - 1;
        }
      }
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function resolveBrackets(s: string, scope: InternalScope): string {
  // Skip bracket resolution for struct definitions, struct initialization, struct literals, and function declarations
  // Check for struct literals with member access (e.g., Point { x : 3 }.x)
  const isStructLiteral = /[a-zA-Z_]\w*\s*\{[^}]+\}\s*\./.test(s);
  if (
    s.match(/^struct\s+[a-zA-Z_]\w*\s*\{[^}]+\}/) ||
    s.match(/^let\s+(mut\s+)?[a-zA-Z_]\w*\s*=\s*[a-zA-Z_]\w+\s*\{[^}]+\}/) ||
    s.match(/^fn\s+[a-zA-Z_]\w+\s*\([^)]*\)\s*:\s*[a-zA-Z_]\w+\s*=>/) ||
    isStructLiteral
  ) {
    return s.trim();
  }

  let res = s.trim();
  while (res.includes("(") || res.includes("{")) {
    const lastOpenParen = res.lastIndexOf("(");
    const lastOpenCurly = res.lastIndexOf("{");
    const isCurly = lastOpenCurly > lastOpenParen;
    const lastOpen = isCurly ? lastOpenCurly : lastOpenParen;

    // Don't resolve if this is a function call (identifier immediately before the paren)
    if (!isCurly && lastOpen > 0) {
      const beforeParen = res[lastOpen - 1];
      if (/[a-zA-Z_0-9)]/.test(beforeParen)) {
        // This looks like a function call or index, don't resolve it
        break;
      }
    }

    const closeChar = isCurly ? "}" : ")";
    const nextClose = res.indexOf(closeChar, lastOpen);
    if (nextClose === -1) {
      throw new Error(
        `Missing closing ${isCurly ? "curly brace" : "parenthesis"}`
      );
    }
    const internal = res.slice(lastOpen + 1, nextClose);
    const result = interpretRaw(
      internal,
      isCurly ? { values: {}, parent: scope, structs: {} } : scope
    );
    const following = res.slice(nextClose + 1).trim();
    const needsSemicolon =
      isCurly && following.length > 0 && !/^[+\-*/%|&^=]/.test(following);
    // Don't append type suffix for Bool (boolean values are just 0 or 1)
    const typeSuffix = result.type && result.type !== "Bool" ? result.type : "";
    res =
      res.slice(0, lastOpen) +
      result.value +
      typeSuffix +
      (needsSemicolon ? ";" : "") +
      res.slice(nextClose + 1);
  }
  return res;
}

function parseTypeAlias(st: string, scope: InternalScope): void {
  const cleaned = st.trim().replace(/;+$/, ""); // Remove trailing semicolons
  const m = cleaned.match(/^type\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (!m) throw new Error(`Invalid type alias declaration: ${st.trim()}`);
  const [, aliasName, typeDefStr] = m;
  // Parse union types: Type1 | Type2 | Type3
  const componentTypes = typeDefStr
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (componentTypes.length === 0) {
    throw new Error(`Invalid type alias declaration: ${st.trim()}`);
  }
  // Validate that all components are valid type names (identifiers)
  for (const type of componentTypes) {
    if (!/^[a-zA-Z_]\w*$/.test(type)) {
      throw new Error(`Invalid type name in union: ${type}`);
    }
  }
  if (!scope.typeAliases) scope.typeAliases = {};
  // Store union as pipe-separated string
  scope.typeAliases[aliasName] = componentTypes.join("|");
}

function parseStructDef(st: string, scope: InternalScope): void {
  const m = st.match(/^struct\s+([a-zA-Z_]\w+)\s*\{([^}]+)\}$/);
  if (!m) throw new Error(`Invalid struct declaration: ${st}`);
  const [, structName, fieldStr] = m;
  const fields: Record<string, string> = {};
  const fieldDecls = fieldStr.split(",").map((s) => s.trim());
  for (const decl of fieldDecls) {
    const [fname, ftype] = decl.split(":").map((s) => s.trim());
    if (fname && ftype) fields[fname] = ftype;
  }
  if (!scope.structs) scope.structs = {};
  scope.structs[structName] = { fields };
}

function parseFunctionDef(st: string, scope: InternalScope): void {
  // Match: fn name(param1 : type1, param2 : type2) : returnType => body
  const m = st.match(
    /^fn\s+([a-zA-Z_]\w+)\s*\(([^)]*)\)\s*:\s*([a-zA-Z_]\w+)\s*=>\s*(.+)$/
  );
  if (!m) throw new Error(`Invalid function declaration: ${st}`);
  const [, funcName, paramStr, returnType, body] = m;

  const params: Array<{ name: string; type: string }> = [];
  if (paramStr.trim()) {
    const paramDecls = paramStr.split(",").map((s) => s.trim());
    for (const decl of paramDecls) {
      const parts = decl.split(":").map((s) => s.trim());
      if (parts.length !== 2) throw new Error(`Invalid parameter: ${decl}`);
      const [pname, ptype] = parts;
      params.push({ name: pname, type: ptype });
    }
  }

  if (!scope.functions) scope.functions = {};
  scope.functions[funcName] = { params, returnType, body };
}

function resolveStructLiterals(st: string, scope: InternalScope): string {
  // Match struct literal patterns: StructName { field : value, ... }
  let result = st;
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    iterations++;
    changed = false;
    const structLiteralRegex = /([a-zA-Z_]\w+)\s*\{([^}]+)\}/;
    const m = structLiteralRegex.exec(result);
    if (!m) break;

    const [fullMatch, structName, fieldStr] = m;
    const struct = getStructFromScope(scope, structName);

    // Only process if it's a known struct
    if (struct) {
      const fields = parseStructFields(fieldStr, scope);

      // Replace struct literal with a temporary variable reference
      const tempName = `__struct_lit_${Math.random().toString(36).slice(2)}`;
      scope.values[tempName] = {
        value: fields,
        type: structName,
        mutable: false,
      };
      result =
        result.slice(0, m.index) +
        tempName +
        result.slice(m.index + fullMatch.length);
      changed = true;
    } else {
      break;
    }
  }
  return result;
}

function evaluateStructLiteralExpression(
  st: string,
  scope: InternalScope
): TypedVal | null {
  // Check if this is a struct literal with member access like: Point { x : 3 }.x
  const m = st.match(/^([a-zA-Z_]\w+)\s*\{([^}]+)\}(.*)$/);
  if (!m) return null;

  const [, structName, fieldStr, rest] = m;
  const struct = getStructFromScope(scope, structName);
  if (!struct) return null; // Not a struct literal, continue with normal parsing

  // Parse the struct literal
  const fields = parseStructFields(fieldStr, scope);

  if (!rest || rest.trim().length === 0) {
    // Just a struct literal, no member access
    return { value: fields, type: structName };
  }

  // Handle member access (.x, .y, etc.)
  const accessMatch = rest.trim().match(/^\.([a-zA-Z_]\w*)(.*)/);
  if (accessMatch) {
    const [, member, remaining] = accessMatch;
    const memberValue = fields[member];
    if (memberValue === undefined) {
      throw new Error(`Field ${member} not found in struct ${structName}`);
    }

    if (!remaining || remaining.trim().length === 0) {
      return { value: memberValue };
    }

    // Handle chained access or operations on the member
    // For now, treat the member value as a new expression to evaluate
    return interpretRaw(`${memberValue}${remaining}`, scope);
  }

  return { value: fields, type: structName };
}

function evaluateExpressionStatement(
  st: string,
  scope: InternalScope
): TypedVal {
  // First, try to handle function calls (name(...))
  const funcCallMatch = st.match(/^([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*$/);
  if (funcCallMatch) {
    const [, funcName, argsStr] = funcCallMatch;
    const func = getFunctionFromScope(scope, funcName);
    if (func) {
      return handleFunctionCall(funcName, func, argsStr, scope);
    }
  }

  // First, try to handle struct literal expressions directly
  const structLiteralResult = evaluateStructLiteralExpression(st, scope);
  if (structLiteralResult !== null) {
    return structLiteralResult;
  }

  // Handle 'is' type checking operator (e.g., value is Type)
  const isOpMatch = st.match(/^(.+?)\s+is\s+([a-zA-Z_]\w+)\s*$/);
  if (isOpMatch) {
    const [, exprPart, typePart] = isOpMatch;
    const exprResult = interpretRaw(exprPart, scope);
    const resolvedType = resolveTypeAlias(typePart, scope);
    const matches = valueMatchesType(
      exprResult.value,
      exprResult.type,
      resolvedType,
      scope
    );
    return { value: matches ? 1 : 0, type: "Bool" };
  }

  const resolvedSt = resolveStructLiterals(st, scope);

  const tokenRegex =
    /!*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[uUiI](?:8|16|32|64)|bool)?|!*[a-zA-Z_]\w*(?:\.\w+)*/g;
  const tokens: Array<{ text: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(resolvedSt))) {
    tokens.push({ text: m[0], index: m.index });
  }
  if (tokens.length === 0) throw new Error("Invalid statement");
  return tokens.length === 1
    ? parseToken(tokens[0].text, scope)
    : evaluateExpression(resolvedSt, tokens, scope);
}

function processSingleStatement(
  rawSt: string,
  scope: InternalScope,
  localDecls: Set<string>
): TypedVal {
  if (rawSt.startsWith("yield ")) {
    let expr = rawSt.slice(6).trim();
    if (expr.endsWith(";")) {
      expr = expr.slice(0, -1).trim();
    }
    const yieldValue = interpretRaw(expr, scope);
    throw new YieldSignal(yieldValue);
  }

  let st = resolveExpressions(rawSt, "do", handleDoWhile, scope);
  st = resolveExpressions(st, "while", handleWhile, scope);
  st = resolveExpressions(st, "if", handleIf, scope);
  st = resolveExpressions(st, "match", handleMatch, scope);
  st = resolveBrackets(st, scope);

  if (st.startsWith("type ")) {
    parseTypeAlias(st, scope);
    return { value: 0 };
  }

  if (st.startsWith("struct ")) {
    parseStructDef(st, scope);
    return { value: 0 };
  }

  if (st.startsWith("fn ")) {
    parseFunctionDef(st, scope);
    return { value: 0 };
  }

  if (!st) return { value: 0 };

  if (st.includes(";") && splitStatements(st).length > 1) {
    return evaluateStatements(st, scope);
  }

  let lastVal: TypedVal = { value: 0 };
  if (st.startsWith("let ")) {
    lastVal = handleLet(st, scope, localDecls);
  } else if (
    st.includes("=") &&
    st.match(/^[a-zA-Z_]\w*\s*([+\-*/%]?=)(?!=)/)
  ) {
    lastVal = handleAssign(st, scope);
  } else {
    lastVal = evaluateExpressionStatement(st, scope);
  }

  return lastVal;
}

function evaluateStatements(s: string, scope: InternalScope): TypedVal {
  const statements = splitStatements(s);
  let lastVal: TypedVal = { value: 0 };
  const localDecls = new Set<string>();

  try {
    for (const rawSt of statements) {
      lastVal = processSingleStatement(rawSt, scope, localDecls);
    }
  } catch (e) {
    if (e instanceof YieldSignal) {
      return e.value;
    }
    throw e;
  }

  return lastVal;
}

function interpretRaw(input: string, scope: InternalScope): TypedVal {
  return evaluateStatements(input, scope);
}

export function interpret(input: string, scope: Scope = {}): number {
  return interpretRaw(input, {
    values: scope,
    structs: {},
    typeAliases: {},
    functions: {},
  }).value;
}

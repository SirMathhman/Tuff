interface TypeConstraint {
  minValue?: number;
  maxValue?: number;
  typeStr: string;
  bitWidth?: number;
  tupleTypes?: TypeConstraint[];
}

interface ScopeEntry {
  value: number | (number | number[])[];
  constraint: TypeConstraint | null;
  isMutable?: boolean;
  isInitialized?: boolean;
  functionBody?: string;
  functionParams?: string[];
  functionParamTypes?: (string | undefined)[];
  referenceTarget?: string;
  referenceMutable?: boolean;
  isGenerator?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  generatorPosition?: number;
  originalType?: string; // Stores the alias name if a type alias was used
}

type Scope = Record<string, ScopeEntry>;

interface ParsedFunction {
  fnName: string;
  params: string[];
  paramTypes: (string | undefined)[];
  returnConstraint: TypeConstraint | null;
  body: string;
}

function getTypeConstraint(source: string): TypeConstraint | null {
  // Handle tuple types (I32, Bool)
  if (source.startsWith("(") && source.endsWith(")")) {
    const inner = source.substring(1, source.length - 1).trim();
    const parts = inner.split(",").map((p) => p.trim());
    const tupleTypes: TypeConstraint[] = [];
    for (const part of parts) {
      const typeConstraint = getTypeConstraint(part);
      if (!typeConstraint) return null;
      tupleTypes.push(typeConstraint);
    }
    return {
      minValue: 0,
      maxValue: Number.MAX_SAFE_INTEGER,
      typeStr: `(${parts.join(", ")})`,
      tupleTypes,
    };
  }
  if (source.startsWith("*")) {
    let isMutablePointer = false;
    let innerType = source.substring(1).trim();
    if (innerType.startsWith("mut ")) {
      isMutablePointer = true;
      innerType = innerType.substring(4).trim();
    }
    const innerConstraint = getTypeConstraint(innerType);
    if (innerConstraint) {
      return {
        minValue: 0,
        maxValue: Number.MAX_SAFE_INTEGER,
        typeStr:
          "*" + (isMutablePointer ? "mut " : "") + innerConstraint.typeStr,
        bitWidth: innerConstraint.bitWidth,
      };
    }
    return null; // Ensure we return null if inner type is invalid
  }
  if (source.endsWith("Bool")) {
    return { minValue: 0, maxValue: 1, typeStr: "Bool", bitWidth: 1 };
  }
  const typeMatch = source.match(/([UIF])(\d+)$/);
  if (!typeMatch || !typeMatch[1] || !typeMatch[2]) {
    return null;
  }

  const typePrefix = typeMatch[1];
  const bitWidth = parseInt(typeMatch[2], 10);

  let minValue: number, maxValue: number;

  if (typePrefix === "U") {
    minValue = 0;
    maxValue = Math.pow(2, bitWidth) - 1;
  } else if (typePrefix === "I") {
    maxValue = Math.pow(2, bitWidth - 1) - 1;
    minValue = -Math.pow(2, bitWidth - 1);
  } else {
    return null;
  }

  return {
    minValue,
    maxValue,
    typeStr: typePrefix + bitWidth.toString(),
    bitWidth,
  };
}

function validateValueInConstraint(
  value: number,
  constraint: TypeConstraint,
  source: string,
): void {
  if (constraint.minValue !== undefined && constraint.maxValue !== undefined) {
    if (value < constraint.minValue || value > constraint.maxValue) {
      throw new Error(
        `Value ${value} out of range for ${source}. Expected ${constraint.minValue}-${constraint.maxValue}.`,
      );
    }
  }
}

function validateTypeMatch(
  exprConstraint: TypeConstraint | null,
  targetConstraint: TypeConstraint | null,
): void {
  if (
    exprConstraint &&
    targetConstraint &&
    exprConstraint.typeStr !== targetConstraint.typeStr
  ) {
    throw new Error(
      `Type mismatch: cannot assign ${exprConstraint.typeStr} to ${targetConstraint.typeStr}`,
    );
  }
}

function ensureVariableNotDefined(
  scope: Record<string, unknown>,
  varName: string,
): void {
  if (scope[varName] !== undefined) {
    throw new Error(`Variable ${varName} is already defined.`);
  }
}

function ensureBoolOperand(
  result: EvaluationResult,
  operator: string | undefined,
  side: string,
): void {
  if (result.constraint?.typeStr !== "Bool") {
    throw new Error(
      `Logical operator ${operator || "unknown"} requires boolean operands, but ${side} side is ${result.constraint?.typeStr || "numeric"}`,
    );
  }
}

function ensureNumericOperand(
  result: EvaluationResult,
  operator: string | undefined,
  side: string,
): void {
  if (result.constraint?.typeStr === "Bool") {
    throw new Error(
      `Arithmetic operator ${operator || "unknown"} requires numeric operands, but ${side} side is Bool`,
    );
  }
}

function updateDepth(char: string, depth: number): number {
  if (char === "(" || char === "{") return depth + 1;
  if (char === ")" || char === "}") return depth - 1;
  return depth;
}

function hasTopLevelOperator(source: string): boolean {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    depth = updateDepth(char, depth);
    if (depth !== 0) continue;
    const rest = source.substring(i);
    if (i > 0 && "+-*/".includes(char)) return true;
    if (rest.startsWith("&&") || rest.startsWith("||")) return true;
    if (rest.startsWith("<=") || rest.startsWith(">=")) return true;
    if (rest.startsWith("==") || rest.startsWith("!=")) return true;
    if (i > 0 && (char === "<" || char === ">")) return true;
    if (rest.startsWith("is ") || rest.startsWith("is\t")) return true;
  }
  return false;
}

// Helper function to find the matched closing paren/brace starting from an opening position
function findMatchedClosing(source: string, fromIndex: number): number {
  let depth = 0;
  for (let i = fromIndex; i < source.length; i++) {
    depth = updateDepth(source[i] as string, depth);
    if (depth === 0) {
      return i;
    }
  }
  return -1;
}

function splitCommaSeparated(source: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
    depth = updateDepth(char, depth);
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseParamList(paramsRaw: string): {
  names: string[];
  types: (string | undefined)[];
} {
  const trimmed = paramsRaw.trim();
  if (!trimmed) return { names: [], types: [] };
  const parts = splitCommaSeparated(trimmed);
  const names: string[] = [];
  const types: (string | undefined)[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    const name = (colonIndex >= 0 ? part.slice(0, colonIndex) : part).trim();
    const type =
      colonIndex >= 0 ? part.slice(colonIndex + 1).trim() : undefined;

    if (!name) {
      throw new Error("Invalid parameter name in function definition");
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate parameter name ${name}`);
    }
    seen.add(name);
    names.push(name);
    types.push(type && type.length > 0 ? type : undefined);
  }

  return { names, types };
}

function parseArguments(argsRaw: string): string[] {
  const trimmed = argsRaw.trim();
  if (!trimmed) return [];
  return splitCommaSeparated(trimmed);
}

function buildParsedFunction(
  fnName: string,
  paramsRaw: string | undefined,
  returnTypeRaw: string | undefined,
  bodyRaw: string | undefined,
): ParsedFunction {
  const paramsRawSafe = paramsRaw || "";
  const parsedParams = parseParamList(paramsRawSafe);
  const returnConstraint = returnTypeRaw
    ? getTypeConstraint(returnTypeRaw.trim())
    : null;
  return {
    fnName,
    params: parsedParams.names,
    paramTypes: parsedParams.types,
    returnConstraint,
    body: (bodyRaw || "").trim(),
  };
}

function parseFunctionDefinition(source: string): ParsedFunction | null {
  // Try matching named function: fn name() : Type => body
  const fnMatch = source.match(
    /^fn\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([\w\*\s\(\),]+))?\s*=>\s*(.*)$/,
  );
  if (fnMatch) {
    const [, fnNameRaw, paramsRaw, returnTypeRaw, bodyRaw] = fnMatch;
    if (!fnNameRaw) return null;
    return buildParsedFunction(fnNameRaw, paramsRaw, returnTypeRaw, bodyRaw);
  }

  // Try matching anonymous function: () : Type => body
  const anonMatch = source.match(
    /^\(([^)]*)\)\s*(?::\s*([\w\*\s\(\),]+))?\s*=>\s*(.*)$/,
  );
  if (anonMatch) {
    const [, paramsRaw, returnTypeRaw, bodyRaw] = anonMatch;
    return buildParsedFunction(
      "__anonymous__",
      paramsRaw,
      returnTypeRaw,
      bodyRaw,
    );
  }

  return null;
}

function parseKeywordParen(
  source: string,
  keyword: string,
): { inner: string; after: string } | null {
  const keywordMatch = source.match(new RegExp(`^${keyword}\\s*\\(`));
  if (!keywordMatch) return null;
  const openParenIndex = source.indexOf("(", keyword.length);
  if (openParenIndex < 0) return null;
  const closeParenIndex = findMatchedClosing(source, openParenIndex);
  if (closeParenIndex < 0) return null;
  return {
    inner: source.substring(openParenIndex + 1, closeParenIndex).trim(),
    after: source.substring(closeParenIndex + 1).trim(),
  };
}

function parseStructDeclaration(source: string): { name: string } | null {
  const structMatch = source.match(/^struct\s+([a-zA-Z_]\w*)\s*\{\s*\}\s*;?$/);
  if (!structMatch || !structMatch[1]) return null;
  return { name: structMatch[1] };
}

function ensureValidStructDeclaration(source: string): void {
  if (!parseStructDeclaration(source)) {
    throw new Error(`Invalid struct declaration: ${source}`);
  }
}

function tryCreateGeneratorEntry(source: string): ScopeEntry | null {
  const rangeMatch = source.match(/^(\d+)\.\.(\d+)$/);
  if (!rangeMatch || !rangeMatch[1] || !rangeMatch[2]) return null;
  const start = parseInt(rangeMatch[1], 10);
  const end = parseInt(rangeMatch[2], 10);
  return {
    value: 0,
    constraint: getTypeConstraint("() => (Bool, I32)"),
    isMutable: true,
    isInitialized: true,
    isGenerator: true,
    rangeStart: start,
    rangeEnd: end,
    generatorPosition: start,
  };
}

function evaluateUnaryOperand(
  source: string,
  operator: string,
  scope: Scope,
): EvaluationResult {
  const expr = source.substring(operator.length).trim();
  return evaluate(expr, scope);
}

function getTupleElement(
  tupleValue: number | (number | number[])[],
  index: number,
  constraint: TypeConstraint | null,
  varName: string,
): {
  value: number | (number | number[])[];
  elementType: TypeConstraint | null;
} {
  if (!Array.isArray(tupleValue)) {
    throw new Error(
      `${varName} is not a tuple (type: ${constraint?.typeStr || "unknown"}, value: ${JSON.stringify(tupleValue)})`,
    );
  }
  if (index < 0 || index >= tupleValue.length) {
    throw new Error(`Tuple index ${index} out of bounds for ${varName}`);
  }
  const elementType = constraint?.tupleTypes?.[index];
  const elementValue = tupleValue[index];
  if (elementValue === undefined) {
    throw new Error(`Tuple element ${index} is undefined for ${varName}`);
  }
  return { value: elementValue, elementType: elementType || null };
}

function getTupleVarOrThrow(scope: Scope, varName: string): ScopeEntry {
  const tupleVar = scope[varName];
  if (!tupleVar) {
    throw new Error(`Variable ${varName} is not defined`);
  }
  return tupleVar;
}

function executeGeneratorLoop(
  scope: Scope,
  loopVar: string,
  bodyStr: string,
  element: number | (number | number[])[],
  convertTo0Indexed: boolean,
): EvaluationResult {
  let loopValue: number;
  if (typeof element === "number") {
    loopValue = convertTo0Indexed ? element - 1 : element;
  } else {
    loopValue = 0;
  }
  scope[loopVar] = {
    value: loopValue,
    constraint: getTypeConstraint("I32"),
    isMutable: true,
    isInitialized: true,
  };
  return evaluate(bodyStr, scope);
}

function executeGeneratorCallLoop(
  scope: Scope,
  loopVar: string,
  bodyStr: string,
  rangeStr: string,
  convertTo0Indexed: boolean,
): EvaluationResult {
  let lastResult: EvaluationResult = { value: 0, constraint: null };
  while (true) {
    try {
      const genResult = evaluate(rangeStr + "()", scope);
      if (Array.isArray(genResult.value) && genResult.value.length >= 2) {
        const hasNext = genResult.value[0];
        const element = genResult.value[1];

        if (element !== undefined) {
          lastResult = executeGeneratorLoop(
            scope,
            loopVar,
            bodyStr,
            element,
            convertTo0Indexed,
          );
        }

        if (hasNext === 0) {
          break;
        }
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }
  return lastResult;
}

function hasCommaAtDepth0(inner: string): boolean {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i] as string;
    depth = updateDepth(char, depth);
    if (depth === 0 && char === ",") {
      return true;
    }
  }
  return false;
}

const addresses: Map<number, string> = new Map();
let nextAddress = 0x1000;
const borrowState: Map<
  string,
  { immutableCount: number; mutableCount: number }
> = new Map();

function getBorrowInfo(varName: string): {
  immutableCount: number;
  mutableCount: number;
} {
  return borrowState.get(varName) || { immutableCount: 0, mutableCount: 0 };
}

function addBorrow(varName: string, isMutable: boolean): void {
  const info = getBorrowInfo(varName);
  const hasConflict = isMutable
    ? info.mutableCount > 0 || info.immutableCount > 0
    : info.mutableCount > 0;
  if (hasConflict) {
    const message = `Cannot take ${isMutable ? "mutable" : "immutable"} reference to ${varName} while it is ${isMutable ? "already borrowed" : "mutably borrowed"}`;
    throw new Error(message);
  }
  if (isMutable) {
    info.mutableCount = 1;
  } else {
    info.immutableCount += 1;
  }
  borrowState.set(varName, info);
}

function releaseBorrow(entry: ScopeEntry | undefined): void {
  if (!entry?.referenceTarget) return;
  const info = getBorrowInfo(entry.referenceTarget);
  if (entry.referenceMutable) {
    info.mutableCount = Math.max(0, info.mutableCount - 1);
  } else {
    info.immutableCount = Math.max(0, info.immutableCount - 1);
  }
  if (info.mutableCount === 0 && info.immutableCount === 0) {
    borrowState.delete(entry.referenceTarget);
  } else {
    borrowState.set(entry.referenceTarget, info);
  }
}

function getAddressOf(varName: string): number {
  for (const [addr, name] of addresses.entries()) {
    if (name === varName) return addr;
  }
  const addr = nextAddress++;
  addresses.set(addr, varName);
  return addr;
}

export function interpret(source: string, scope: Scope = {}): number {
  addresses.clear();
  borrowState.clear();
  nextAddress = 0x1000;
  const result = evaluate(source, scope);
  if (Array.isArray(result.value)) {
    throw new Error("Cannot return tuple value from top-level");
  }
  return result.value;
}

interface EvaluationResult {
  value: number | (number | number[])[];
  constraint: TypeConstraint | null;
  functionBody?: string;
  functionParams?: string[];
  functionParamTypes?: (string | undefined)[];
  referenceTarget?: string;
  referenceMutable?: boolean;
}

function evaluate(source: string, scope: Scope): EvaluationResult {
  source = source.trim();
  if (source.startsWith("struct ")) {
    ensureValidStructDeclaration(source);
    return { value: 0, constraint: null };
  }
  if (source === "true") {
    return {
      value: 1,
      constraint: { minValue: 0, maxValue: 1, typeStr: "Bool", bitWidth: 1 },
    };
  }
  if (source === "false") {
    return {
      value: 0,
      constraint: { minValue: 0, maxValue: 1, typeStr: "Bool", bitWidth: 1 },
    };
  }

  // Check for pointer reference: &x or &mut x
  if (source.startsWith("&")) {
    let isMutableRequest = false;
    let varName = source.substring(1).trim();
    if (varName.startsWith("mut ")) {
      isMutableRequest = true;
      varName = varName.substring(4).trim();
    }

    const existingVar = scope[varName];
    if (existingVar) {
      if (isMutableRequest && !existingVar.isMutable) {
        throw new Error(
          `Cannot take mutable reference to immutable variable ${varName}`,
        );
      }
      const addr = getAddressOf(varName);
      const innerConstraint =
        existingVar.constraint || getTypeConstraint("I32");
      return {
        value: addr,
        constraint: {
          minValue: 0,
          maxValue: Number.MAX_SAFE_INTEGER,
          typeStr:
            "*" +
            (isMutableRequest ? "mut " : "") +
            (innerConstraint?.typeStr || "numeric"),
        },
        referenceTarget: varName,
        referenceMutable: isMutableRequest,
      };
    }
    throw new Error(`Cannot take address of undefined variable ${varName}`);
  }

  // Check for pointer dereference: *y
  if (source.startsWith("*") && !getTypeConstraint(source)) {
    const rest = source.substring(1).trim();
    if (hasTopLevelOperator(rest)) {
      // Let binary operator parsing handle expressions like "*y + *z"
    } else {
      const exprResult = evaluateUnaryOperand(source, "*", scope);
      if (exprResult.constraint?.typeStr.startsWith("*")) {
        if (typeof exprResult.value !== "number") {
          throw new Error("Cannot dereference tuple");
        }
        const addr = exprResult.value;
        const varName = addresses.get(addr);
        if (varName && scope[varName]) {
          const targetVar = scope[varName];
          if (!targetVar.isInitialized) {
            throw new Error(
              `Dereferenced pointer points to uninitialized variable ${varName}`,
            );
          }
          const isMut = exprResult.constraint.typeStr.startsWith("*mut ");
          const innerTypeStr = exprResult.constraint.typeStr.substring(
            isMut ? 5 : 1,
          );
          const targetConstraint = getTypeConstraint(innerTypeStr);
          return { value: targetVar.value, constraint: targetConstraint };
        }
        throw new Error(
          `Invalid pointer address ${addr} for ${varName || "unknown"}`,
        );
      }
      throw new Error(
        `Cannot dereference non-pointer type ${exprResult.constraint?.typeStr || "numeric"} for expr: ${source.substring(1).trim()}`,
      );
    }
  }

  // Check for logical NOT: !x
  if (source.startsWith("!")) {
    const exprResult = evaluateUnaryOperand(source, "!", scope);
    if (exprResult.constraint?.typeStr !== "Bool") {
      throw new Error(
        `Logical NOT operator requires boolean operand, but got ${exprResult.constraint?.typeStr || "numeric"}`,
      );
    }
    const resultValue =
      typeof exprResult.value === "number" ? exprResult.value : 0;
    return {
      value: resultValue === 0 ? 1 : 0,
      constraint: { minValue: 0, maxValue: 1, typeStr: "Bool", bitWidth: 1 },
    };
  }

  // Check for unary minus (non-literal) like `-x`
  if (source.trim().startsWith("-")) {
    const rest = source.trim().substring(1).trim();
    if (rest && !/^\d/.test(rest)) {
      const operandResult = evaluate(rest, scope);
      if (typeof operandResult.value !== "number") {
        throw new Error(
          "Unary minus can only be applied to numeric expressions",
        );
      }
      const negated = -operandResult.value;
      if (operandResult.constraint) {
        validateValueInConstraint(negated, operandResult.constraint, source);
      }
      return { value: negated, constraint: operandResult.constraint };
    }
  }

  if (!source.includes(";")) {
    const fnExpr = parseFunctionDefinition(source);
    if (fnExpr) {
      return {
        value: 0,
        constraint: fnExpr.returnConstraint,
        functionBody: fnExpr.body,
        functionParams: fnExpr.params,
        functionParamTypes: fnExpr.paramTypes,
      };
    }
  }

  // Check for if (cond) expr1 else expr2
  if (source.startsWith("if")) {
    const parsed = parseKeywordParen(source, "if");
    if (parsed) {
      const conditionStr = parsed.inner;
      const remainder = parsed.after;

      // Now interpret remainder to find 'else'
      // Remainder should be: THEN_BLOCK else ELSE_BLOCK

      let thenStr = "";
      let elseStr = "";
      let elseIndex = -1;

      // Scan remainder for optional braces or single statement, identifying where 'else' keyword appears AT DEPTH 0
      let depth = 0;
      for (let i = 0; i < remainder.length; i++) {
        const char = remainder[i] as string;

        // If we hit 'else' at depth 0, we found the split
        if (depth === 0 && remainder.substring(i).startsWith("else")) {
          // Verify it's a whole word 'else' (followed by space or { or nothing?)
          // Usually followed by space or if or {
          const nextChar = remainder[i + 4];
          if (!nextChar || /\s|{/.test(nextChar)) {
            elseIndex = i;
            break;
          }
        }

        depth = updateDepth(char, depth);
      }

      if (elseIndex > -1) {
        thenStr = remainder.substring(0, elseIndex).trim();
        elseStr = remainder.substring(elseIndex + 4).trim();

        // In `if (...) stmt; else ...`, the semicolon before `else` is a delimiter,
        // not part of the then-branch expression.
        if (thenStr.endsWith(";")) {
          thenStr = thenStr.slice(0, -1).trim();
        }

        const conditionResult = evaluate(conditionStr, scope);
        ensureBoolOperand(conditionResult, "if", "condition");

        // Re-evaluate both branches but discard result to check types
        // This is a naive type-checker; real implementation would be better.
        const thenResult = evaluate(thenStr, { ...scope });
        const elseResult = evaluate(elseStr, { ...scope });

        // Ensure branch types are compatible
        const thenType = thenResult.constraint?.typeStr || "numeric";
        const elseType = elseResult.constraint?.typeStr || "numeric";

        if (thenType !== elseType) {
          throw new Error(
            `Type mismatch in if branches: then branch is ${thenType}, else branch is ${elseType}`,
          );
        }

        if (conditionResult.value !== 0) {
          // Now evaluate the branch that actually runs with the REAL scope
          return evaluate(thenStr, scope);
        } else {
          return evaluate(elseStr, scope);
        }
      } else {
        // No else clause - just if (cond) then
        thenStr = remainder.trim();

        const conditionResult = evaluate(conditionStr, scope);
        ensureBoolOperand(conditionResult, "if", "condition");

        if (conditionResult.value !== 0) {
          return evaluate(thenStr, scope);
        } else {
          // If condition is false and there's no else, return 0
          return { value: 0, constraint: null };
        }
      }
    }
  }

  // Check for match (expr) { case pattern => value; ... }
  if (source.startsWith("match")) {
    const parsed = parseKeywordParen(source, "match");
    if (parsed) {
      const discriminantStr = parsed.inner;
      let remainder = parsed.after;

      // Expect { ... }
      if (remainder.startsWith("{") && remainder.endsWith("}")) {
        const bodyContent = remainder.substring(1, remainder.length - 1).trim();

        // Parse case patterns and values
        const discriminantResult = evaluate(discriminantStr, scope);
        const discriminantValue = discriminantResult.value;

        // Split by 'case' keyword and parse all cases
        const caseLines = bodyContent.split(/\bcase\b/).slice(1); // Skip the empty first element

        // Parse case patterns
        interface CasePattern {
          pattern: string;
          value: string;
          isWildcard: boolean;
        }

        const cases: CasePattern[] = [];
        for (const caseLine of caseLines) {
          const trimmedCase = caseLine.trim();
          const arrowIndex = trimmedCase.indexOf("=>");
          if (arrowIndex > -1) {
            const patternStr = trimmedCase.substring(0, arrowIndex).trim();
            const valueStr = trimmedCase.substring(arrowIndex + 2).trim();
            const valueStrClean = valueStr.endsWith(";")
              ? valueStr.slice(0, -1).trim()
              : valueStr;
            cases.push({
              pattern: patternStr,
              value: valueStrClean,
              isWildcard: patternStr === "_",
            });
          }
        }

        // Check exhaustiveness
        const hasWildcard = cases.some((c) => c.isWildcard);
        const isBoolean = discriminantResult.constraint?.typeStr === "Bool";

        let isExhaustive = hasWildcard;
        if (!isExhaustive && isBoolean) {
          // For booleans, if we have both true and false cases, it's exhaustive
          const patterns = cases.map((c) => c.pattern);
          const hasTrue = patterns.includes("true");
          const hasFalse = patterns.includes("false");
          isExhaustive = hasTrue && hasFalse;
        }

        if (!isExhaustive) {
          throw new Error(
            "Non-exhaustive match: missing wildcard pattern `case _ => ...`",
          );
        }

        // Find and execute the matching case
        for (const casePattern of cases) {
          let matches = false;
          if (casePattern.isWildcard) {
            matches = true;
          } else {
            const patternResult = evaluate(casePattern.pattern, scope);
            matches = patternResult.value === discriminantValue;
          }

          if (matches) {
            return evaluate(casePattern.value, scope);
          }
        }

        // No case matched (shouldn't happen if wildcard is present)
        throw new Error("No matching case in match expression");
      }
    }
  }

  // Check for while (cond) body
  if (source.startsWith("while")) {
    const parsed = parseKeywordParen(source, "while");
    if (parsed) {
      const conditionStr = parsed.inner;
      const bodyStr = parsed.after;

      let lastResult: EvaluationResult = { value: 0, constraint: null };
      let iterations = 0;
      const maxIterations = 100000;

      while (iterations < maxIterations) {
        iterations++;
        const conditionResult = evaluate(conditionStr, scope);
        ensureBoolOperand(conditionResult, "while", "condition");

        if (conditionResult.value === 0) {
          break;
        }

        lastResult = evaluate(bodyStr, scope);
      }

      if (iterations >= maxIterations) {
        throw new Error(
          "While loop exceeded maximum iterations (infinite loop detected)",
        );
      }

      return lastResult;
    }
  }

  // Check for for (let mut i in RANGE) body
  if (source.startsWith("for")) {
    const parsed = parseKeywordParen(source, "for");
    if (parsed) {
      const headerStr = parsed.inner;
      const bodyStr = parsed.after;

      // Parse "let mut i in 0..10" or "let mut i in generator"
      const headerMatch = headerStr.match(/^let\s+(mut\s+)?(\w+)\s+in\s+(.+)$/);
      if (headerMatch && headerMatch[2] && headerMatch[3]) {
        const isMutable = !!headerMatch[1];
        const loopVar = headerMatch[2];
        const rangeStr = headerMatch[3].trim();

        let lastResult: EvaluationResult = { value: 0, constraint: null };

        // Try as range literal first: "0..10"
        const rangeMatch = rangeStr.match(/^(\d+)\.\.(\d+)$/);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          const start = parseInt(rangeMatch[1], 10);
          const end = parseInt(rangeMatch[2], 10);

          for (let i = start; i < end; i++) {
            scope[loopVar] = {
              value: i,
              constraint: getTypeConstraint("I32"),
              isMutable: true,
              isInitialized: true,
            };
            lastResult = evaluate(bodyStr, scope);
          }

          delete scope[loopVar];
          return lastResult;
        }

        // Try as generator function variable or callable identifier
        const generatorVar = scope[rangeStr];

        if (generatorVar?.isGenerator) {
          lastResult = executeGeneratorCallLoop(
            scope,
            loopVar,
            bodyStr,
            rangeStr,
            false,
          );
          delete scope[loopVar];
          return lastResult;
        }

        // Try as user-defined generator function (any callable that returns (Bool, I32))
        if (
          generatorVar?.functionBody !== undefined ||
          /^[a-zA-Z_]\w*$/.test(rangeStr)
        ) {
          lastResult = executeGeneratorCallLoop(
            scope,
            loopVar,
            bodyStr,
            rangeStr,
            false,
          );
          delete scope[loopVar];
          return lastResult;
        }
      }
    }
  }

  // Check for chained tuple indexing first: tuple[0][1]
  const chainedIndexMatch = source.match(/^([a-zA-Z_]\w*)\[(\d+)\]\[(\d+)\]$/);
  if (
    chainedIndexMatch &&
    chainedIndexMatch[1] &&
    chainedIndexMatch[2] &&
    chainedIndexMatch[3]
  ) {
    const varName = chainedIndexMatch[1];
    const tupleVar = getTupleVarOrThrow(scope, varName);
    const index1 = parseInt(chainedIndexMatch[2], 10);
    const index2 = parseInt(chainedIndexMatch[3], 10);
    const { value: innerValue, elementType: outerType } = getTupleElement(
      tupleVar.value,
      index1,
      tupleVar.constraint,
      varName,
    );
    if (!Array.isArray(innerValue)) {
      throw new Error(`${varName}[${index1}] is not a tuple`);
    }
    const { value: finalValue, elementType: innerElementType } =
      getTupleElement(innerValue, index2, outerType, `${varName}[${index1}]`);
    return { value: finalValue, constraint: innerElementType };
  }

  // Check for tuple indexing: myTuple[0]
  const indexMatch = source.match(/^([a-zA-Z_]\w*)\[(\d+)\]$/);
  if (indexMatch && indexMatch[1] && indexMatch[2]) {
    const varName = indexMatch[1];
    const tupleVar = getTupleVarOrThrow(scope, varName);
    const index = parseInt(indexMatch[2], 10);
    const { value: elementValue, elementType } = getTupleElement(
      tupleVar.value,
      index,
      tupleVar.constraint,
      varName,
    );
    return { value: elementValue, constraint: elementType };
  }

  // Check for tuple literals: (100, true)
  if (
    source.startsWith("(") &&
    source.endsWith(")") &&
    !getTypeConstraint(source)
  ) {
    const inner = source.substring(1, source.length - 1).trim();
    // Check if this is a tuple literal (has comma at depth 0) vs wrapped expr (no comma at depth 0)
    if (hasCommaAtDepth0(inner)) {
      // Parse as tuple literal
      const parts: string[] = [];
      let currentPart = "";
      let depth2 = 0;
      for (let i = 0; i < inner.length; i++) {
        const char = inner[i] as string;
        if (char === "," && depth2 === 0) {
          parts.push(currentPart.trim());
          currentPart = "";
        } else {
          currentPart += char;
          depth2 = updateDepth(char, depth2);
        }
      }
      if (currentPart.trim()) parts.push(currentPart.trim());

      const values: (number | number[])[] = [];
      const constraints: TypeConstraint[] = [];
      for (const part of parts) {
        const result = evaluate(part, scope);
        values.push(result.value as number | number[]);
        const elementConstraint = result.constraint || getTypeConstraint("I32");
        if (elementConstraint) {
          constraints.push(elementConstraint);
        }
      }

      const tupleType = `(${constraints.map((c) => c.typeStr).join(", ")})`;
      return {
        value: values,
        constraint: {
          minValue: 0,
          maxValue: Number.MAX_SAFE_INTEGER,
          typeStr: tupleType,
          tupleTypes: constraints,
        },
      };
    }
  }

  const tryEvaluateAssignment = (params: {
    text: string;
    targetScope: Scope;
    outerScopeToSync?: Scope;
    allowPlainAssignment: boolean;
    updateConstraint: boolean;
    statementForErrors: string;
    undefinedVarError: (varName: string) => string;
  }): {
    result: EvaluationResult;
    varName: string;
    newValue: number;
  } | null => {
    const assignmentRegex = params.allowPlainAssignment
      ? /^([a-zA-Z_]\w*)\s*(\+|-|\*|\/)?=\s*(.*)$/
      : /^([a-zA-Z_]\w*)\s*(\+|-|\*|\/)=\s*(.*)$/;

    const match = params.text.match(assignmentRegex);
    if (!match || !match[1] || !match[3]) return null;

    const varName = match[1];
    const op = match[2];
    const expr = match[3];
    const existingVar = params.targetScope[varName];

    if (!existingVar) {
      throw new Error(params.undefinedVarError(varName));
    }

    if (!existingVar.isMutable && (existingVar.isInitialized || op)) {
      throw new Error(`Cannot reassign immutable variable ${varName}.`);
    }

    if (op && !existingVar.isInitialized) {
      throw new Error(
        `Cannot use compound assignment on uninitialized variable ${varName}.`,
      );
    }

    const exprResult = evaluate(expr, params.targetScope);
    let newValue = exprResult.value;

    if (op) {
      ensureNumericOperand(
        { value: existingVar.value, constraint: existingVar.constraint },
        op,
        "left",
      );
      ensureNumericOperand(exprResult, op, "right");

      switch (op) {
        case "+":
          if (
            typeof existingVar.value !== "number" ||
            typeof exprResult.value !== "number"
          ) {
            throw new Error("Cannot perform arithmetic on tuple");
          }
          newValue = existingVar.value + exprResult.value;
          break;
        case "-":
          if (
            typeof existingVar.value !== "number" ||
            typeof exprResult.value !== "number"
          ) {
            throw new Error("Cannot perform arithmetic on tuple");
          }
          newValue = existingVar.value - exprResult.value;
          break;
        case "*":
          if (
            typeof existingVar.value !== "number" ||
            typeof exprResult.value !== "number"
          ) {
            throw new Error("Cannot perform arithmetic on tuple");
          }
          newValue = existingVar.value * exprResult.value;
          break;
        case "/":
          if (
            typeof existingVar.value !== "number" ||
            typeof exprResult.value !== "number"
          ) {
            throw new Error("Cannot perform arithmetic on tuple");
          }
          if (exprResult.value === 0) throw new Error("Division by zero");
          newValue = Math.floor(existingVar.value / exprResult.value);
          break;
      }
    }

    if (existingVar.constraint) {
      if (typeof newValue === "number") {
        validateValueInConstraint(
          newValue,
          existingVar.constraint,
          params.statementForErrors,
        );
      }
      if (exprResult.constraint && !op) {
        validateTypeMatch(exprResult.constraint, existingVar.constraint);
      }
    }

    const finalConstraint = params.updateConstraint
      ? existingVar.constraint ||
        exprResult.constraint ||
        getTypeConstraint("I32")
      : existingVar.constraint;

    const updatedEntry = {
      ...existingVar,
      value: newValue,
      isInitialized: true,
      constraint: finalConstraint,
      functionBody: exprResult.functionBody ?? existingVar.functionBody,
      functionParams: exprResult.functionParams ?? existingVar.functionParams,
      functionParamTypes:
        exprResult.functionParamTypes ?? existingVar.functionParamTypes,
      referenceTarget: exprResult.referenceTarget ?? undefined,
      referenceMutable: exprResult.referenceMutable ?? undefined,
    };
    if (existingVar.referenceTarget) {
      releaseBorrow(existingVar);
    }
    if (updatedEntry.referenceTarget) {
      addBorrow(updatedEntry.referenceTarget, !!updatedEntry.referenceMutable);
    }
    params.targetScope[varName] = updatedEntry;

    if (params.outerScopeToSync && params.outerScopeToSync[varName]) {
      params.outerScopeToSync[varName].value = newValue;
      params.outerScopeToSync[varName].isInitialized = true;
      params.outerScopeToSync[varName].functionBody = updatedEntry.functionBody;
      params.outerScopeToSync[varName].functionParams =
        updatedEntry.functionParams;
      params.outerScopeToSync[varName].functionParamTypes =
        updatedEntry.functionParamTypes;
    }

    return {
      result: { value: newValue, constraint: finalConstraint },
      varName,
      newValue: typeof newValue === "number" ? newValue : 0,
    };
  };

  // Check for fully wrapped expression (parens or braces) logic has been moved to be handled last if nothing else matches?
  // Actually, handling it here is correct for nesting.
  // The previous implementation had it here AND at the end.
  // The previous implementation was:
  // 1. Check constants/pointers/if
  // 2. Check blocks (braces specifically)
  // 3. Check splits (semicolons)
  // 4. (Recursively called on parts)

  // BUT there was ALSO a check at the end "Remove outermost ... if isFullyWrapped".
  // This seems redundant if we check it here?
  // Actually, we should check it BEFORE checking for splits if it wraps the WHOLE string and wasn't picked up by "if" or "let".

  // Let's remove the second copy at the end of the file (lines 428ish in original)
  // and rely on one robust check.

  // Consolidated wrap check  - but skip for tuple literals
  if (
    (source.startsWith("(") && source.endsWith(")")) ||
    (source.startsWith("{") && source.endsWith("}"))
  ) {
    const startChar = source[0];

    // Special handling: if this looks like a tuple literal (has comma at depth 0 in parens),
    // skip the wrap check and let tuple literal handler process it
    let isTupleLiteral = false;
    if (startChar === "(") {
      const inner = source.substring(1, source.length - 1);
      isTupleLiteral = hasCommaAtDepth0(inner);
    }

    if (!isTupleLiteral) {
      let depth = 0;
      let isFullyWrapped = true;
      for (let i = 0; i < source.length - 1; i++) {
        const char = source[i] as string;
        if (char === undefined) break;
        depth = updateDepth(char, depth);
        if (depth === 0) {
          isFullyWrapped = false;
          break;
        }
      }
      // Only unwrap if it's NOT a complex statement block that we just handled with splitPoints?
      // Wait, splitPoints logic COMES AFTER this in current flow.

      if (isFullyWrapped) {
        const inner = source.substring(1, source.length - 1).trim();
        if (startChar === "{" && inner.length === 0)
          return { value: 0, constraint: null };
        return evaluate(inner, scope);
      }
    }
  }

  // Check if this is a block with statements (semicolons or self-terminating blocks) NOT inside parentheses/braces at depth 0
  let splitDepth = 0;
  const splitPoints: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    const prevDepth = splitDepth;
    splitDepth = updateDepth(char, splitDepth);
    if (char === ";" && splitDepth === 0) {
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next] as string)) next++;
      const rest = source.substring(next);
      if (!rest.startsWith("else")) {
        splitPoints.push(i);
      }
    } else if (
      char === "}" &&
      splitDepth === 0 &&
      prevDepth === 1 &&
      i < source.length - 1
    ) {
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next] as string)) next++;
      if (next < source.length) {
        const nextChar = source[next];
        const rest = source.substring(next);
        if (
          nextChar !== ";" &&
          !/[+\-*/&|<>=!]/.test(nextChar as string) &&
          !rest.startsWith("else")
        ) {
          splitPoints.push(i);
        }
      }
    }
  }

  if (splitPoints.length > 0) {
    const statements: string[] = [];
    let start = 0;
    for (const point of splitPoints) {
      const isSemicolon = source[point] === ";";
      statements.push(
        source.substring(start, isSemicolon ? point : point + 1).trim(),
      );
      start = point + 1;
    }
    statements.push(source.substring(start).trim());

    let lastResult: EvaluationResult = { value: 0, constraint: null };
    const localScope = { ...scope };
    const typeAliases: { [key: string]: string } = {};
    const dropHooks: { [typeName: string]: string } = {};
    const declaredVars: string[] = [];
    const droppedVars = new Set<string>();

    const runDropHookFor = (varName: string) => {
      if (!varName) return;
      if (droppedVars.has(varName)) return;
      const entry = localScope[varName];
      if (!entry || !entry.isInitialized) return;

      const typeName = entry.originalType;
      if (!typeName) return;
      const dropFnName = dropHooks[typeName];
      if (!dropFnName) return;

      const dropFnEntry = localScope[dropFnName];
      if (!dropFnEntry?.functionBody) {
        throw new Error(
          `Drop hook ${dropFnName} is not defined for type ${typeName}`,
        );
      }

      const paramName = dropFnEntry.functionParams?.[0];
      const paramType = dropFnEntry.functionParamTypes?.[0];
      if (paramName !== "this" || paramType !== typeName) {
        throw new Error(
          `Drop hook ${dropFnName} must take parameter this : ${typeName}`,
        );
      }

      const invocationScope = { ...localScope };
      invocationScope[paramName] = {
        value: entry.value,
        constraint: entry.constraint,
        isMutable: false,
        isInitialized: true,
        originalType: entry.originalType,
      };

      evaluate(dropFnEntry.functionBody, invocationScope);

      // Sync back mutable captured variables to localScope
      for (const key in localScope) {
        const originalVar = localScope[key];
        const modifiedVar = invocationScope[key];
        if (
          originalVar &&
          modifiedVar &&
          originalVar.isMutable &&
          key !== dropFnName
        ) {
          originalVar.value = modifiedVar.value;
          originalVar.isInitialized = modifiedVar.isInitialized;
        }
      }

      droppedVars.add(varName);
      delete localScope[varName];
    };

    for (
      let statementIndex = 0;
      statementIndex < statements.length;
      statementIndex++
    ) {
      const statement = statements[statementIndex] || "";
      if (statement.length === 0) {
        lastResult = { value: 0, constraint: null };
        continue;
      }
      if (statement.startsWith("type ")) {
        // Parse type alias declaration: type NAME = TYPE;
        // Supports: `type Name = I32` and `type Name = I32 then dropFn`
        const typeMatch = statement.match(
          /^type\s+([a-zA-Z_]\w*)\s*=\s*(.+?)(?:\s+then\s+([a-zA-Z_]\w*))?(?:;*)$/,
        );
        if (typeMatch && typeMatch[1] && typeMatch[2]) {
          const aliasName = typeMatch[1];
          const aliasTarget = typeMatch[2].trim();
          const dropFnName = typeMatch[3]?.trim();
          typeAliases[aliasName] = aliasTarget;
          if (dropFnName) {
            dropHooks[aliasName] = dropFnName;
          }
          lastResult = { value: 0, constraint: null };
          continue;
        } else {
          throw new Error(`Invalid type alias declaration: ${statement}`);
        }
      }
      if (statement.startsWith("struct ")) {
        ensureValidStructDeclaration(statement);
        lastResult = { value: 0, constraint: null };
        continue;
      }
      if (statement.startsWith("let ")) {
        // Parse variable declaration: let [mut] x [: TYPE] [= EXPR]
        // Note: the type annotation may contain `=>` (e.g. `() => I32`), so avoid treating the `=` in `=>` as an initializer.
        const declMatch = statement.match(
          /^let\s+(mut\s+)?([a-zA-Z_]\w*)\s*(?::\s*(.+?))?(?:\s*=\s*(?!>)(.*))?$/,
        );
        if (declMatch && declMatch[2]) {
          const isMutable = !!declMatch[1];
          const varName = declMatch[2];
          const typeStr = declMatch[3]?.trim();
          const hasInitializer = declMatch[4] !== undefined;
          const expr = declMatch[4];
          // Resolve type aliases
          const resolvedTypeStr =
            typeStr && typeAliases[typeStr] ? typeAliases[typeStr] : typeStr;
          const explicitConstraint = resolvedTypeStr
            ? getTypeConstraint(resolvedTypeStr)
            : null;
          // Store the original/alias name for type checking
          const originalTypeStr = typeStr;

          if (hasInitializer && expr !== undefined) {
            // Create a "pending" scope for evaluating the initializer
            const initializerScope = { ...localScope };
            initializerScope[varName] = {
              value: NaN,
              constraint: null,
              isMutable,
              isInitialized: false,
            }; // Placeholder

            const exprResult = evaluate(expr, initializerScope);

            if (explicitConstraint) {
              // Skip numeric validation for tuple types
              if (
                !explicitConstraint.tupleTypes &&
                typeof exprResult.value === "number"
              ) {
                validateValueInConstraint(
                  exprResult.value,
                  explicitConstraint,
                  statement,
                );
              }
              // Strict type matching for anything that has a constraint (literals or variables)
              if (exprResult.constraint) {
                validateTypeMatch(exprResult.constraint, explicitConstraint);
              }
            }

            // Re-check if it was already in localScope (to prevent multiple lets of same name in same block)
            ensureVariableNotDefined(localScope, varName);
            declaredVars.push(varName);

            let scopeEntry: ScopeEntry;

            // Check if this is a range generator assignment
            const isRangeGenerator =
              explicitConstraint?.typeStr === "() => (Bool, I32)" &&
              expr.match(/^\d+\.\.\d+$/) &&
              tryCreateGeneratorEntry(expr) !== null;

            if (isRangeGenerator) {
              const generatorEntry = tryCreateGeneratorEntry(expr);
              scopeEntry = {
                ...generatorEntry!,
                isMutable,
                constraint: explicitConstraint,
              };
              lastResult = { value: 0, constraint: null };
            } else {
              const finalConstraint =
                explicitConstraint ||
                exprResult.constraint ||
                getTypeConstraint("I32");
              scopeEntry = {
                value: exprResult.value,
                constraint: finalConstraint,
                isMutable,
                isInitialized: true,
                functionBody: exprResult.functionBody,
                functionParams: exprResult.functionParams,
                functionParamTypes: exprResult.functionParamTypes,
                originalType: originalTypeStr, // Store the alias name
              };
              lastResult = exprResult;
            }

            localScope[varName] = scopeEntry;

            if (scopeEntry.referenceTarget) {
              addBorrow(
                scopeEntry.referenceTarget,
                !!scopeEntry.referenceMutable,
              );
            }

            // IF this variable was in the original outer scope, update it there too
            if (scope[varName]) {
              scope[varName].value = exprResult.value;
              scope[varName].isInitialized = true;
            }

            // Simple last-use drop: if this var is never referenced again, drop now.
            const remainder = statements.slice(statementIndex + 1).join("; ");
            if (!new RegExp(`\\b${varName}\\b`).test(remainder)) {
              runDropHookFor(varName);
            }
          } else {
            // Declaration without initializer
            ensureVariableNotDefined(localScope, varName);
            declaredVars.push(varName);
            localScope[varName] = {
              value: NaN,
              constraint: explicitConstraint,
              isMutable,
              isInitialized: false,
              originalType: originalTypeStr,
            };
            lastResult = { value: 0, constraint: null };
          }
        }
      } else if (statement.startsWith("fn ")) {
        const fnMatch = statement.match(
          /^fn\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([\w\*\s\(\),]+))?\s*=>\s*([\s\S]*)$/,
        );
        if (!fnMatch) {
          throw new Error(`Invalid function declaration: ${statement}`);
        }
        const [, fnNameRaw, paramsRaw, returnTypeRaw, bodyRaw] = fnMatch;
        if (!fnNameRaw) {
          throw new Error(`Invalid function name in declaration: ${statement}`);
        }
        const fnName = fnNameRaw;
        const paramsStr = paramsRaw || "";
        const parsedParams = parseParamList(paramsStr);
        const functionParamNames = parsedParams.names;
        const functionParamTypes = parsedParams.types;
        const returnTypeStr = returnTypeRaw?.trim();
        const body = (bodyRaw || "").trim();
        const returnConstraint = returnTypeStr
          ? getTypeConstraint(returnTypeStr)
          : null;
        ensureVariableNotDefined(localScope, fnName);

        // Quick type check for return type: if body is a bare number and return type is Bool, error
        if (returnConstraint && returnConstraint.typeStr === "Bool") {
          const isNumericLiteral = /^-?\d+$/.test(body);
          if (isNumericLiteral) {
            throw new Error(
              `Function ${fnName} declared return type Bool but body returns numeric`,
            );
          }
        }

        localScope[fnName] = {
          value: 0,
          constraint: returnConstraint,
          isMutable: false,
          isInitialized: true,
          functionBody: body,
          functionParams: functionParamNames,
          functionParamTypes: functionParamTypes,
        };
        lastResult = { value: 0, constraint: null };
      } else {
        const fnDecl = parseFunctionDefinition(statement);
        if (fnDecl) {
          ensureVariableNotDefined(localScope, fnDecl.fnName);
          localScope[fnDecl.fnName] = {
            value: 0,
            constraint: fnDecl.returnConstraint,
            isMutable: false,
            isInitialized: true,
            functionBody: fnDecl.body,
            functionParams: fnDecl.params,
            functionParamTypes: fnDecl.paramTypes,
          };
          lastResult = { value: 0, constraint: null };
          continue;
        }
        // Check for pointer assignment: *p = EXPR
        const ptrAssignMatch = statement.match(/^\*(.*)\s*=\s*(.*)$/);
        if (ptrAssignMatch && ptrAssignMatch[1] && ptrAssignMatch[2]) {
          const ptrExpr = ptrAssignMatch[1].trim();
          const valExpr = ptrAssignMatch[2].trim();
          const ptrResult = evaluate(ptrExpr, localScope);

          if (ptrResult.constraint?.typeStr.startsWith("*mut ")) {
            if (typeof ptrResult.value !== "number") {
              throw new Error("Cannot dereference non-numeric pointer");
            }
            const addr = ptrResult.value;
            const varName = addresses.get(addr);
            if (varName && localScope[varName]) {
              const valResult = evaluate(valExpr, localScope);
              if (typeof valResult.value !== "number") {
                throw new Error("Cannot assign tuple through pointer");
              }
              const innerTypeStr = ptrResult.constraint.typeStr.substring(5); // skip '*mut '
              const targetConstraint = getTypeConstraint(innerTypeStr);

              if (targetConstraint) {
                validateValueInConstraint(
                  valResult.value as number,
                  targetConstraint,
                  statement,
                );
                if (valResult.constraint) {
                  validateTypeMatch(valResult.constraint, targetConstraint);
                }
              }

              localScope[varName].value = valResult.value;
              localScope[varName].isInitialized = true;
              lastResult = valResult;
              continue;
            }
          } else if (ptrResult.constraint?.typeStr.startsWith("*")) {
            throw new Error(
              `Cannot assign through non-mutable pointer type ${ptrResult.constraint.typeStr}`,
            );
          }
        }

        const assignment = tryEvaluateAssignment({
          text: statement,
          targetScope: localScope,
          outerScopeToSync: scope,
          allowPlainAssignment: true,
          updateConstraint: true,
          statementForErrors: statement,
          undefinedVarError: (varName) =>
            `Cannot assign to undefined variable ${varName}`,
        });
        if (assignment) {
          lastResult = assignment.result;
          continue;
        }
        lastResult = evaluate(statement, localScope);
      }
    }

    // Run drop hooks for variables declared in this statement block that are going out of scope.
    for (let i = declaredVars.length - 1; i >= 0; i--) {
      const varName = declaredVars[i];
      if (!varName) continue;
      runDropHookFor(varName);
      if (localScope[varName]) {
        releaseBorrow(localScope[varName]);
        delete localScope[varName];
      }
    }

    // Propagate any changes from localScope back to scope for ALL variables that exist in both
    for (const key in scope) {
      const scopeVar = scope[key];
      const localScopeVar = localScope[key];
      if (scopeVar && localScopeVar) {
        scopeVar.value = localScopeVar.value;
        scopeVar.isInitialized = localScopeVar.isInitialized;
        scopeVar.functionBody = localScopeVar.functionBody;
        scopeVar.functionParams = localScopeVar.functionParams;
        scopeVar.functionParamTypes = localScopeVar.functionParamTypes;
      }
    }

    return lastResult;
  }

  const tryAssignmentOnSource = (
    allowPlainAssignment: boolean,
  ): EvaluationResult | null => {
    const res = tryEvaluateAssignment({
      text: source,
      targetScope: scope,
      allowPlainAssignment,
      updateConstraint: false,
      statementForErrors: source,
      undefinedVarError: (varName) =>
        `Cannot reassign undefined variable ${varName}`,
    });
    return res ? res.result : null;
  };

  // Quick check for COMPOUND reassignment: x [OP]= EXPR where OP is +, -, *, /
  // This is needed for while loops and other constructs that call evaluate() directly
  const compoundAssignmentResult = tryAssignmentOnSource(false);
  if (compoundAssignmentResult) return compoundAssignmentResult;

  // Check if this is a binary operation
  // Find lowest precedence operator (+ or -) last to ensure left-to-right evaluation
  const findOperator = (regex: RegExp) => {
    const matches = Array.from(source.matchAll(regex));
    // Only return matches that are at depth 0
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (!match || match.index === undefined) continue;
      const index = match.index;
      let depth = 0;
      for (let j = 0; j < index; j++) {
        const char = source[j];
        if (char === undefined) break;
        depth = updateDepth(char, depth);
      }
      if (depth === 0) return match;
    }
    return null;
  };

  let operatorMatch = findOperator(/\s*(<|<=|>|>=|==|!=)\s*/g);

  if (!operatorMatch) {
    operatorMatch = findOperator(/(?:^|\s)(is)\s+/g);
  }

  if (!operatorMatch) {
    operatorMatch = findOperator(/\s*(&&|\|\|)\s*/g);
  }

  if (!operatorMatch) {
    operatorMatch = findOperator(/\s*([+\-])\s*/g);
  }

  // If no + or -, look for * or /
  if (!operatorMatch) {
    operatorMatch = findOperator(/\s*([*/])\s*/g);
  }

  if (operatorMatch && operatorMatch.index !== undefined) {
    const operator = operatorMatch[1];
    const operatorStart = operatorMatch.index;
    const operatorEnd = operatorStart + operatorMatch[0].length;

    const leftStr = source.substring(0, operatorStart).trim();
    const rightStr = source.substring(operatorEnd).trim();

    if (leftStr && rightStr) {
      const leftResult = evaluate(leftStr, scope);

      if (operator === "&&" || operator === "||") {
        ensureBoolOperand(leftResult, operator, "left");
      } else {
        ensureNumericOperand(leftResult, operator, "left");
      }

      // Short-circuiting for logical operators
      if (operator === "&&" && leftResult.value === 0) {
        return {
          value: 0,
          constraint: {
            minValue: 0,
            maxValue: 1,
            typeStr: "Bool",
            bitWidth: 1,
          },
        };
      }
      if (operator === "||" && leftResult.value === 1) {
        return {
          value: 1,
          constraint: {
            minValue: 0,
            maxValue: 1,
            typeStr: "Bool",
            bitWidth: 1,
          },
        };
      }

      // For `is` operator, don't evaluate rightStr as an expression - it's a type name
      const rightResult =
        operator === "is"
          ? { value: 0, constraint: null }
          : evaluate(rightStr, scope);

      if (operator === "&&" || operator === "||") {
        ensureBoolOperand(rightResult, operator, "right");
      } else if (
        operator === "+" ||
        operator === "-" ||
        operator === "*" ||
        operator === "/"
      ) {
        ensureNumericOperand(rightResult, operator, "right");
      } else if (operator !== "is") {
        // For `is` operator, rightStr is a type name, not an expression to evaluate
        // so we skip the operand check
      }

      let result: number;
      let resultConstraint: TypeConstraint | null = null;

      // For `is` operator, we don't need rightResult so handle it specially
      if (operator === "is") {
        const expectedType = rightStr.trim();
        const actualType = leftResult.constraint?.typeStr;
        // Check against the constraint's typeStr, or the originalType if it was set
        const leftEntry = scope[leftStr];
        const leftOriginalType = leftEntry?.originalType;

        // Match if: expectedType matches actualType directly, OR expectedType matches the originalType (alias)
        result =
          actualType === expectedType || leftOriginalType === expectedType
            ? 1
            : 0;
        resultConstraint = {
          minValue: 0,
          maxValue: 1,
          typeStr: "Bool",
          bitWidth: 1,
        };
      } else {
        const rightResult = evaluate(rightStr, scope);

        switch (operator) {
          case "&&":
            result = leftResult.value !== 0 && rightResult.value !== 0 ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "||":
            result = leftResult.value !== 0 || rightResult.value !== 0 ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "<":
            result = leftResult.value < rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "<=":
            result = leftResult.value <= rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case ">":
            result = leftResult.value > rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case ">=":
            result = leftResult.value >= rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "==":
            result = leftResult.value === rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "!=":
            result = leftResult.value !== rightResult.value ? 1 : 0;
            resultConstraint = {
              minValue: 0,
              maxValue: 1,
              typeStr: "Bool",
              bitWidth: 1,
            };
            break;
          case "+":
            if (
              typeof leftResult.value !== "number" ||
              typeof rightResult.value !== "number"
            ) {
              throw new Error("Cannot perform arithmetic on tuple");
            }
            result = leftResult.value + rightResult.value;
            break;
          case "-":
            if (
              typeof leftResult.value !== "number" ||
              typeof rightResult.value !== "number"
            ) {
              throw new Error("Cannot perform arithmetic on tuple");
            }
            result = leftResult.value - rightResult.value;
            break;
          case "*":
            if (
              typeof leftResult.value !== "number" ||
              typeof rightResult.value !== "number"
            ) {
              throw new Error("Cannot perform arithmetic on tuple");
            }
            result = leftResult.value * rightResult.value;
            break;
          case "/":
            if (
              typeof leftResult.value !== "number" ||
              typeof rightResult.value !== "number"
            ) {
              throw new Error("Cannot perform arithmetic on tuple");
            }
            if (rightResult.value === 0) {
              throw new Error("Division by zero");
            }
            result = Math.floor(leftResult.value / rightResult.value);
            break;
          default:
            return { value: NaN, constraint: null };
        }
      }

      if (operator === "&&" || operator === "||") {
        return { value: result, constraint: resultConstraint };
      }
      if (
        operator === "<" ||
        operator === "<=" ||
        operator === ">" ||
        operator === ">=" ||
        operator === "==" ||
        operator === "!=" ||
        operator === "is"
      ) {
        return { value: result, constraint: resultConstraint };
      }

      // Infer type constraint from operands
      const leftConstraint = leftResult.constraint;
      const rightConstraint = rightResult.constraint;

      // If any operand has a type constraint, validate result
      let constraintToUse: TypeConstraint | null = null;

      if (leftConstraint && rightConstraint) {
        // Both have constraints: use the wider one (larger bitwidth)
        constraintToUse =
          (leftConstraint.bitWidth || 0) >= (rightConstraint.bitWidth || 0)
            ? leftConstraint
            : rightConstraint;
      } else {
        // One or none has constraint
        constraintToUse = leftConstraint || rightConstraint;
      }

      if (constraintToUse) {
        validateValueInConstraint(result, constraintToUse, source);
      }

      return { value: result, constraint: constraintToUse };
    }
  }

  const assignmentResult = tryAssignmentOnSource(true);
  if (assignmentResult) return assignmentResult;

  // Variable access in non-binary expression
  const invokeFunction = (
    fnName: string,
    fnEntry: ScopeEntry | undefined,
    argResults: EvaluationResult[],
    callSource: string,
  ): EvaluationResult => {
    if (!fnEntry?.functionBody) {
      throw new Error(`Function ${fnName} is not defined`);
    }

    const paramNames = fnEntry.functionParams || [];
    const paramTypes = fnEntry.functionParamTypes || [];
    if (argResults.length !== paramNames.length) {
      throw new Error(
        `Function ${fnName} expects ${paramNames.length} arguments but got ${argResults.length}`,
      );
    }

    const invocationScope = { ...scope };
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      if (!paramName) {
        throw new Error(`Missing parameter name for function ${fnName}`);
      }
      const paramTypeStr = paramTypes[i];
      const argResult = argResults[i];
      if (!argResult) {
        throw new Error(`Missing argument for parameter ${paramName}`);
      }
      const paramConstraint = paramTypeStr
        ? getTypeConstraint(paramTypeStr)
        : null;

      if (paramConstraint) {
        if (typeof argResult.value === "number") {
          validateValueInConstraint(
            argResult.value,
            paramConstraint,
            callSource,
          );
        }
        if (argResult.constraint) {
          validateTypeMatch(argResult.constraint, paramConstraint);
        }
      }

      invocationScope[paramName] = {
        value: argResult.value,
        constraint: paramConstraint || argResult.constraint,
        isMutable: false,
        isInitialized: true,
        originalType: paramTypeStr,
      };
    }

    const fnResult = evaluate(fnEntry.functionBody, invocationScope);
    // Sync back mutable captured variables to the original scope
    for (const varName in scope) {
      const originalVar = scope[varName];
      const modifiedVar = invocationScope[varName];
      if (
        originalVar &&
        modifiedVar &&
        originalVar.isMutable &&
        varName !== fnName
      ) {
        originalVar.value = modifiedVar.value;
        originalVar.isInitialized = modifiedVar.isInitialized;
      }
    }
    if (fnEntry.constraint && typeof fnResult.value === "number") {
      validateValueInConstraint(fnResult.value, fnEntry.constraint, callSource);
    }
    return fnResult;
  };

  const methodCallMatch = source.match(/^(.+)\.([a-zA-Z_]\w*)\s*\((.*)\)$/);
  if (methodCallMatch) {
    const receiverStr = methodCallMatch[1]?.trim();
    const methodName = methodCallMatch[2];
    const argsRaw = methodCallMatch[3] || "";
    if (!receiverStr || !methodName) {
      throw new Error(`Invalid method call syntax: ${source}`);
    }

    const receiverResult = evaluate(receiverStr, scope);
    const fnEntry = scope[methodName];

    if (
      fnEntry?.isGenerator &&
      fnEntry.rangeStart !== undefined &&
      fnEntry.rangeEnd !== undefined &&
      fnEntry.generatorPosition !== undefined
    ) {
      throw new Error(`Generator ${methodName} cannot be called as a method`);
    }

    const paramNames = fnEntry?.functionParams || [];
    if (paramNames[0] !== "this") {
      throw new Error(
        `Method call requires first parameter this for function ${methodName}`,
      );
    }

    const argExprs = parseArguments(argsRaw);
    const argResults = [
      receiverResult,
      ...argExprs.map((arg) => evaluate(arg, scope)),
    ];
    return invokeFunction(methodName, fnEntry, argResults, source);
  }

  const functionCallMatch = source.match(/^([a-zA-Z_]\w*)\s*\((.*)\)$/);
  if (functionCallMatch) {
    const fnNameRaw = functionCallMatch[1];
    if (!fnNameRaw) {
      throw new Error(`Invalid function call syntax: ${source}`);
    }
    const fnName = fnNameRaw;
    const fnEntry = scope[fnName];
    const argsRaw = functionCallMatch[2] || "";
    const argExprs = parseArguments(argsRaw);

    // Check if this is a range generator
    if (
      fnEntry?.isGenerator &&
      fnEntry.rangeStart !== undefined &&
      fnEntry.rangeEnd !== undefined &&
      fnEntry.generatorPosition !== undefined
    ) {
      if (argExprs.length > 0) {
        throw new Error(`Generator ${fnName} does not take arguments`);
      }
      const pos = fnEntry.generatorPosition;
      const end = fnEntry.rangeEnd;
      const element = pos;
      const hasNextAfterThis = pos + 1 < end;

      // Return (hasNextAfterThis, element) - 0-indexed
      const returnValue = [hasNextAfterThis ? 1 : 0, element];
      fnEntry.generatorPosition = pos + 1;

      return {
        value: returnValue,
        constraint: getTypeConstraint("(Bool, I32)"),
      };
    }

    const argResults = argExprs.map((arg) => evaluate(arg, scope));
    return invokeFunction(fnName, fnEntry, argResults, source);
  }
  const scopeVar = scope[source];
  if (scopeVar) {
    return {
      value: scopeVar.value,
      constraint: scopeVar.constraint,
      referenceTarget: scopeVar.referenceTarget,
      referenceMutable: scopeVar.referenceMutable,
    };
  }

  // If it looks like an identifier but isn't in scope, throw error
  if (/^[a-zA-Z_]\w*$/.test(source)) {
    throw new Error(`Variable ${source} is not defined in the current scope.`);
  }

  // Single value parsing
  // Check if there's a type suffix (letters and/or digits after the number)
  const hasSuffix = /[A-Za-z]+\d*$/.test(source.replace(/^-?\d+/, ""));
  const isNegative = source.startsWith("-");

  // Check if the type suffix is unsigned (U prefix)
  const isUnsignedSuffix = /^-?\d+U\d*/.test(source);

  // Throw error if negative number has an unsigned type suffix
  if (isNegative && isUnsignedSuffix) {
    throw new Error(
      `Negative number not allowed with unsigned type suffix: ${source}`,
    );
  }

  // Extract numeric part at the start
  const match = source.match(/^-?\d+/);
  if (!match) return { value: NaN, constraint: null };

  const value = parseInt(match[0], 10);
  const constraint = getTypeConstraint(source);

  // Validate range based on type suffix
  if (hasSuffix) {
    if (constraint) {
      validateValueInConstraint(value, constraint, source);
    }
  }

  return { value, constraint };
}

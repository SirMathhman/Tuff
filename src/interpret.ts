/**
 * Interpret the given input string and return a numeric result.
 *
 * Supports numeric literals with optional type suffixes (e.g., "100U8", "42I32").
 * Also supports simple arithmetic expressions (e.g., "1U8 + 2U8").
 * Negative numbers cannot have unsigned type suffixes (U8, U16, etc.).
 * Values must be within the valid range for their type suffix.
 */

const typeRanges: Record<string, [number, number]> = {
  U8: [0, 255],
  U16: [0, 65535],
  U32: [0, 4294967295],
  I8: [-128, 127],
  I16: [-32768, 32767],
  I32: [-2147483648, 2147483647],
  Bool: [0, 1],
};

const typeOrdering: Record<string, number> = {
  U8: 0,
  U16: 1,
  U32: 2,
  I8: 10,
  I16: 11,
  I32: 12,
  Bool: 100,
};

type Result = {
  value: number | Result | Result[];
  type?: string;
  isMutable?: boolean;
  isInitialized?: boolean;
};
type Variables = Map<string, Result>;

function getWidestType(types: (string | undefined)[]): string | undefined {
  let maxOrder = -1;
  let maxType: string | undefined;

  for (const type of types) {
    if (!type) continue;

    const order = typeOrdering[type];
    if (order === undefined) continue;

    if (order > maxOrder) {
      maxOrder = order;
      maxType = type;
    }
  }

  return maxType;
}

function parseTypedNumber(input: string): Result {
  if (input === 'true') {
    return { value: 1, type: 'Bool', isInitialized: true };
  }
  if (input === 'false') {
    return { value: 0, type: 'Bool', isInitialized: true };
  }

  // Match numeric part followed by optional type suffix
  const match = input.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z]\w*)?$/);

  if (!match) {
    throw new Error('Invalid number: ' + input);
  }

  const number = match[1];
  const typeSuffix = match[2];

  // Negative numbers cannot have unsigned type suffixes
  if (number.startsWith('-') && typeSuffix && typeSuffix.startsWith('U')) {
    throw new Error('Invalid number: ' + input);
  }

  const value = Number(number);
  if (Number.isNaN(value)) {
    throw new Error('Invalid number: ' + input);
  }

  // Check if value is within valid range for the type suffix
  if (typeSuffix && typeSuffix in typeRanges) {
    const [min, max] = typeRanges[typeSuffix];
    if (value < min || value > max) {
      throw new Error('Invalid number: ' + input);
    }
  }

  return { value, type: typeSuffix };
}

function asNumber(value: number | Result | Result[]): number {
  if (typeof value === 'object') {
    throw new Error('Expected numeric value, found non-numeric type');
  }
  return value;
}

export function interpret(input: string): number {
  return asNumber(interpretInternal(input).value);
}

type ArrayTypeInfo = {
  baseType: string;
  initialized: number;
  length: number;
};

function parseArrayType(type: string): ArrayTypeInfo | null {
  const match = type.match(/^\[\s*([A-Za-z]\w*)\s*;\s*(\d+)\s*;\s*(\d+)\s*\]$/);
  if (!match) return null;
  return {
    baseType: match[1],
    initialized: Number(match[2]),
    length: Number(match[3]),
  };
}

function isArrayType(type: string | undefined): type is string {
  return !!type && type.trim().startsWith('[');
}

function buildArrayLiteral(
  expr: string,
  arrayType: ArrayTypeInfo,
  variables: Variables,
  statement: string
): Result {
  const trimmed = expr.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error('Invalid array literal: ' + statement);
  }
  const inner = trimmed.substring(1, trimmed.length - 1).trim();
  const parts = inner
    ? inner.split(',').map((part) => part.trim()).filter((part) => part.length)
    : [];

  if (parts.length !== arrayType.initialized) {
    throw new Error('Invalid array literal: ' + statement);
  }
  if (arrayType.initialized > arrayType.length) {
    throw new Error('Invalid array type: ' + statement);
  }

  const elements: Result[] = [];
  for (const part of parts) {
    const res = interpretInternal(part, variables);
    validateTypeCompatibility(arrayType.baseType, res, statement);
    elements.push(res);
  }

  while (elements.length < arrayType.length) {
    elements.push({ value: 0, type: arrayType.baseType, isInitialized: false });
  }

  return {
    value: elements,
    type:
      '[' +
      arrayType.baseType +
      '; ' +
      arrayType.initialized +
      '; ' +
      arrayType.length +
      ']',
    isInitialized: true,
  };
}

function splitStatements(input: string): string[] {
  const statements: string[] = [];
  let currentArray = '';
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const oldDepth = depth;
    if (char === '{' || char === '(' || char === '[') depth++;
    else if (char === '}' || char === ')' || char === ']') depth--;

    const isSemicolonSplit = char === ';' && depth === 0;
    const isBraceSplit = char === '}' && depth === 0 && oldDepth === 1;

    const isSplit = isSemicolonSplit || isBraceSplit;
    if (!isSplit) {
      currentArray += char;
      continue;
    }

    const rest = input.substring(i + 1);
    const isFollowedByElse = /^\s*else\b/.test(rest);
    const isFollowedByOp = isBraceSplit && /^\s*([+\-*/]|\|\||&&)/.test(rest);

    if (isFollowedByElse || isFollowedByOp) {
      currentArray += char;
      continue;
    }

    if (isBraceSplit) currentArray += char;
    if (currentArray.trim()) {
      statements.push(currentArray.trim());
    }
    currentArray = '';
    continue;
  }

  if (currentArray.trim()) {
    statements.push(currentArray.trim());
  }

  return statements;
}

function findBalanced(
  input: string,
  start: number,
  open: string,
  close: string
): number {
  return findNextBoundary(input, start + 1, (c, d) => d === 0 && c === close);
}

function skipWhitespace(input: string, index: number): number {
  let i = index;
  while (i < input.length && /\s/.test(input[i])) i++;
  return i;
}

function cloneVariables(variables: Variables): Variables {
  const clone = new Map<string, Result>();
  for (const [key, val] of variables) {
    clone.set(key, { ...val });
  }
  return clone;
}

function findNextBoundary(
  input: string,
  start: number,
  condition: (
    char: string,
    depth: number,
    input: string,
    index: number
  ) => boolean
): number {
  let depth = 0;
  for (let j = start; j < input.length; j++) {
    const char = input[j];
    if (condition(char, depth, input, j)) return j;
    if (char === '{' || char === '(') depth++;
    else if (char === '}' || char === ')') depth--;
  }
  return -1;
}

function findElseIndex(input: string, start: number): number {
  return findNextBoundary(
    input,
    start,
    (c, d, i, idx) => d === 0 && i.substring(idx).startsWith('else')
  );
}

function findIfEndIndex(input: string, start: number): number {
  const idx = skipWhitespace(input, start);
  const char = input[idx];
  if (idx >= input.length || (char !== '{' && char !== '(')) {
    return input.length;
  }

  const end = findBalanced(input, idx, char, char === '{' ? '}' : ')');
  return end === -1 ? input.length : end + 1;
}

function checkBranchCompatibility(
  t1: string | undefined,
  t2: string | undefined,
  errorMessage: string
): void {
  if (t1?.startsWith('*') || t2?.startsWith('*')) {
    if (!t1?.startsWith('*') || !t2?.startsWith('*')) {
      throw new Error(errorMessage);
    }
    const b1 = t1.substring(1).replace('mut ', '');
    const b2 = t2.substring(1).replace('mut ', '');
    if (b1 !== 'Untyped' && b2 !== 'Untyped' && b1 !== b2) {
      throw new Error(errorMessage);
    }
    if (t1.includes('mut') !== t2.includes('mut')) {
      throw new Error(errorMessage);
    }
    return;
  }

  if ((t1 === 'Bool') !== (t2 === 'Bool')) {
    throw new Error(errorMessage);
  }

  if (t1 !== 'Bool' && t1 !== 'Empty' && t2 !== 'Empty') {
    const isU1 = t1 && t1.startsWith('U');
    const isU2 = t2 && t2.startsWith('U');
    const isI1 = t1 && t1.startsWith('I');
    const isI2 = t2 && t2.startsWith('I');
    if ((isU1 && isI2) || (isI1 && isU2)) {
      throw new Error(errorMessage);
    }
  }
}

function resolveIfAt(
  resolved: string,
  start: number,
  variables: Variables
): { next: string; end: number } {
  let i = skipWhitespace(resolved, start + 2);
  if (resolved[i] !== '(') throw new Error('Expected ( after if');
  const condEnd = findBalanced(resolved, i, '(', ')');
  if (condEnd === -1) throw new Error('Unbalanced ( in if condition');

  const cond = interpretInternal(resolved.substring(i + 1, condEnd), variables);
  if (cond.type !== 'Bool') throw new Error('If condition must be Bool');

  i = skipWhitespace(resolved, condEnd + 1);
  const thenStart = i;
  const thenEnd = findElseIndex(resolved, thenStart);
  if (thenEnd === -1) throw new Error('Expected else after if branch');

  const elseStart = skipWhitespace(resolved, thenEnd + 4);
  const elseEnd = findIfEndIndex(resolved, elseStart);

  const thenBranch = resolved.substring(thenStart, thenEnd).trim();
  const elseBranch = resolved.substring(elseStart, elseEnd).trim();

  let res1: Result;
  let res2: Result;
  const dryRunVarsBefore = cloneVariables(variables);
  if (cond.value !== 0) {
    res1 = interpretInternal(thenBranch, new Map(variables));
    res2 = interpretInternal(elseBranch, new Map(dryRunVarsBefore));
  } else {
    res1 = interpretInternal(thenBranch, new Map(dryRunVarsBefore));
    res2 = interpretInternal(elseBranch, new Map(variables));
  }

  const t1 = res1.type;
  const t2 = res2.type;
  checkBranchCompatibility(t1, t2, 'Mismatched branch types in if-else');

  const res = cond.value !== 0 ? res1 : res2;
  const resultType = getWidestType([t1, t2]);
  const valueStr =
    res.type === 'Empty' ? '' : res.value.toString() + (resultType || '');

  return {
    next: resolved.substring(0, start) + valueStr + resolved.substring(elseEnd),
    end: elseEnd,
  };
}

function resolveMatchAt(
  resolved: string,
  start: number,
  variables: Variables
): { next: string; end: number } {
  let i = skipWhitespace(resolved, start + 5);
  if (resolved[i] !== '(') throw new Error('Expected ( after match');
  const condEnd = findBalanced(resolved, i, '(', ')');
  if (condEnd === -1) throw new Error('Unbalanced ( in match condition');

  const matchVal = interpretInternal(
    resolved.substring(i + 1, condEnd),
    variables
  );

  i = skipWhitespace(resolved, condEnd + 1);
  if (resolved[i] !== '{') throw new Error('Expected { after match expression');
  const bodyStart = i;
  const bodyEnd = findBalanced(resolved, i, '{', '}');
  if (bodyEnd === -1) throw new Error('Unbalanced { in match body');

  const body = resolved.substring(bodyStart + 1, bodyEnd);

  let bodyIdx = 0;
  let finalResult: Result | undefined;
  let matched = false;
  const branchResults: Result[] = [];
  const dryRunVarsBefore = cloneVariables(variables);

  while (bodyIdx < body.length) {
    bodyIdx = skipWhitespace(body, bodyIdx);
    if (bodyIdx >= body.length) break;

    const remaining = body.substring(bodyIdx);
    if (!remaining.startsWith('case') && remaining.trim() === '') break;
    if (!remaining.startsWith('case'))
      throw new Error('Expected case in match body');

    bodyIdx += 4;
    bodyIdx = skipWhitespace(body, bodyIdx);

    const arrowIdx = body.indexOf('=>', bodyIdx);
    if (arrowIdx === -1) throw new Error('Expected => after case pattern');

    const patternStr = body.substring(bodyIdx, arrowIdx).trim();
    bodyIdx = arrowIdx + 2;

    let resultEnd = findNextBoundary(body, bodyIdx, (c, d, txt, idx) => {
      if (d === 0) {
        if (c === ';') return true;
        if (txt.substring(idx).startsWith('case')) return true;
      }
      return false;
    });

    if (resultEnd === -1) {
      resultEnd = body.length;
    }

    const resultExpr = body.substring(bodyIdx, resultEnd).trim();
    bodyIdx = resultEnd;
    if (body[bodyIdx] === ';') bodyIdx++;

    let patternMatch = patternStr === '_';
    if (
      !patternMatch &&
      parseTypedNumber(patternStr).value === matchVal.value
    ) {
      patternMatch = true;
    }

    if (!matched && patternMatch) {
      matched = true;
      finalResult = interpretInternal(resultExpr, variables);
      branchResults.push(finalResult);
    } else {
      const dryRes = interpretInternal(resultExpr, new Map(dryRunVarsBefore));
      branchResults.push(dryRes);
    }
  }

  if (!matched) {
    throw new Error('No match found and no wildcard provided');
  }

  const t1 = branchResults[0].type;
  for (const res of branchResults) {
    checkBranchCompatibility(t1, res.type, 'Mismatched branch types in match');
  }

  const resultType = getWidestType(branchResults.map((r) => r.type));
  const valueStr =
    finalResult!.type === 'Empty'
      ? ''
      : finalResult!.value.toString() + (resultType || '');

  return {
    next:
      resolved.substring(0, start) + valueStr + resolved.substring(bodyEnd + 1),
    end: bodyEnd + 1,
  };
}

function resolveGroupAt(
  resolved: string,
  start: number,
  variables: Variables
): { next: string; end: number } {
  const open = resolved[start];
  const close = open === '(' ? ')' : '}';
  const end = findBalanced(resolved, start, open, close);
  if (end === -1) throw new Error('Unbalanced ' + open);

  const res = interpretInternal(
    resolved.substring(start + 1, end),
    open === '{' ? new Map(variables) : variables
  );
  const valueStr =
    res.type === 'Empty' ? '' : res.value.toString() + (res.type || '');

  return {
    next: resolved.substring(0, start) + valueStr + resolved.substring(end + 1),
    end: end + 1,
  };
}

function resolveStatement(statement: string, variables: Variables): string {
  let resolved = statement.trim();

  while (true) {
    const ifMatch = resolved.match(/\bif\b/);
    const matchMatch = resolved.match(/\bmatch\b/);
    const parenIndex = resolved.indexOf('(');
    const braceIndex = resolved.indexOf('{');

    const ifIndex = ifMatch ? ifMatch.index! : -1;
    const matchIndex = matchMatch ? matchMatch.index! : -1;
    const items = [
      { type: 'if', index: ifIndex },
      { type: 'match', index: matchIndex },
      { type: 'paren', index: parenIndex },
      { type: 'brace', index: braceIndex },
    ].filter((item) => item.index !== -1);

    if (items.length === 0) break;

    items.sort((a, b) => a.index - b.index);
    const first = items[0];

    if (first.type === 'if') {
      resolved = resolveIfAt(resolved, first.index, variables).next;
      continue;
    }
    if (first.type === 'match') {
      resolved = resolveMatchAt(resolved, first.index, variables).next;
      continue;
    }
    resolved = resolveGroupAt(resolved, first.index, variables).next;
  }

  return resolved;
}

function interpretInternal(
  input: string,
  variables: Variables = new Map()
): Result {
  const statements = splitStatements(input);

  if (statements.length === 0) {
    return { value: 0, type: 'Empty', isInitialized: false };
  }

  let result: Result | undefined;

  for (const statement of statements) {
    const resolved = resolveStatement(statement, variables);

    const letAnnotatedMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*:\s*((?:\[[^\]]+\]|[*]*(?:mut\s+)?[A-Za-z]\w*))\s*=\s*(.+)$/
    );
    const letNoInitMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*:\s*((?:\[[^\]]+\]|[*]*(?:mut\s+)?[A-Za-z]\w*))$/
    );
    const letInferredMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*=\s*(.+)$/
    );
    const assignmentMatch = resolved.match(
      /^(\*+[A-Za-z]\w*|[A-Za-z]\w*)\s*(\+|-|\*|\/)?=\s*(.+)$/
    );

    if (letAnnotatedMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letAnnotatedMatch[2],
        letAnnotatedMatch[4],
        letAnnotatedMatch[3],
        !!letAnnotatedMatch[1]
      );
    } else if (letNoInitMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letNoInitMatch[2],
        undefined,
        letNoInitMatch[3],
        !!letNoInitMatch[1]
      );
    } else if (letInferredMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letInferredMatch[2],
        letInferredMatch[3],
        undefined,
        !!letInferredMatch[1]
      );
    } else if (assignmentMatch) {
      result = handleAssignmentStatement(
        resolved,
        variables,
        assignmentMatch[1],
        assignmentMatch[3],
        assignmentMatch[2]
      );
    } else {
      result = evaluateStatement(resolved, variables);
    }
  }

  if (!result) {
    throw new Error('Empty expression');
  }

  return result;
}

function validateTypeCompatibility(
  targetType: string | undefined,
  sourceResult: Result,
  statement: string
): void {
  if (isArrayType(targetType) && isArrayType(sourceResult.type)) {
    if (targetType !== sourceResult.type) {
      throw new Error('Invalid type: ' + statement);
    }
    return;
  }

  if (targetType?.startsWith('*') && sourceResult.type?.startsWith('*')) {
    const tBase = targetType.substring(1).replace('mut ', '');
    const sBase = sourceResult.type.substring(1).replace('mut ', '');
    const tIsMut = targetType.includes('mut');
    const sIsMut = sourceResult.type.includes('mut');
    const isBaseCompatible =
      tBase === 'Untyped' || sBase === 'Untyped' || tBase === sBase;

    if (!isBaseCompatible) {
      throw new Error('Invalid type: ' + statement);
    }
    if (tIsMut && !sIsMut) {
      throw new Error(
        'Cannot assign immutable pointer to mutable pointer type'
      );
    }
    return;
  }

  if (
    targetType &&
    sourceResult.type &&
    targetType in typeOrdering &&
    sourceResult.type in typeOrdering
  ) {
    const targetIsUnsigned = targetType.startsWith('U');
    const sourceIsSigned = sourceResult.type.startsWith('I');
    const targetIsSigned = targetType.startsWith('I');
    const sourceIsUnsigned = sourceResult.type.startsWith('U');

    if (
      typeOrdering[sourceResult.type] > typeOrdering[targetType] ||
      (targetIsUnsigned && sourceIsSigned) ||
      (targetIsSigned && sourceIsUnsigned)
    ) {
      throw new Error('Invalid type: ' + statement);
    }
  }

  if (targetType && targetType in typeRanges) {
    const [min, max] = typeRanges[targetType];
    const val = asNumber(sourceResult.value);
    if (val < min || val > max) {
      throw new Error('Invalid number: ' + statement);
    }
  }
}

function handleLetStatement(
  statement: string,
  variables: Variables,
  name: string,
  expr?: string,
  type?: string,
  isMutable?: boolean
): Result {
  if (variables.has(name)) {
    throw new Error('Variable already declared: ' + name);
  }

  if (expr && isArrayType(type)) {
    const info = parseArrayType(type);
    if (!info) {
      throw new Error('Invalid array type: ' + statement);
    }
    const arrResult = buildArrayLiteral(expr, info, variables, statement);
    const variable = {
      value: arrResult.value,
      type: arrResult.type,
      isMutable,
      isInitialized: true,
    };
    variables.set(name, variable);
    return variable;
  }

  if (!expr && isArrayType(type)) {
    const info = parseArrayType(type);
    if (!info) {
      throw new Error('Invalid array type: ' + statement);
    }
    const elements: Result[] = [];
    while (elements.length < info.length) {
      elements.push({ value: 0, type: info.baseType, isInitialized: false });
    }
    const variable = {
      value: elements,
      type,
      isMutable,
      isInitialized: false,
    };
    variables.set(name, variable);
    return variable;
  }

  let value: number | Result | Result[] = 0;
  let finalType = type;
  let isInitialized = false;

  if (expr) {
    const res = interpretInternal(expr, variables);
    finalType = type || res.type;
    validateTypeCompatibility(type, res, statement);
    value = res.value;
    isInitialized = true;
  }

  const variable = { value, type: finalType, isMutable, isInitialized };
  variables.set(name, variable);
  return variable;
}

function handleAssignmentStatement(
  statement: string,
  variables: Variables,
  name: string,
  expr: string,
  operator?: string
): Result {
  let variable: Result;
  if (name.startsWith('*')) {
    const ptrStr = name.substring(1).trim();
    const ptr = resolveOperand(ptrStr, variables, true);
    if (!ptr.type?.startsWith('*')) {
      throw new Error('Cannot dereference non-pointer type');
    }
    if (!ptr.type.includes('mut')) {
      throw new Error('Cannot assign through immutable pointer');
    }
    variable = ptr.value as Result;
  } else {
    if (!variables.has(name)) {
      throw new Error('Cannot assign to undeclared variable: ' + name);
    }
    variable = variables.get(name)!;
    if (!variable.isMutable && variable.isInitialized) {
      throw new Error('Cannot assign to immutable variable: ' + name);
    }
  }

  let res = interpretInternal(expr, variables);

  if (operator) {
    if (!variable.isInitialized) {
      throw new Error(
        'Use of uninitialized variable in compound assignment: ' + name
      );
    }
    res = {
      value: applyOperator(
        asNumber(variable.value),
        operator,
        asNumber(res.value)
      ),
      type: getWidestType([variable.type, res.type]),
    };
  }

  validateTypeCompatibility(variable.type, res, statement);

  variable.value = res.value;
  variable.isInitialized = true;
  return variable;
}

function evaluateStatement(statement: string, variables: Variables): Result {
  const trimmed = statement.trim();
  if (!trimmed) {
    return { value: 0, type: 'Empty', isInitialized: false };
  }
  if (/[+\-*/]|\|\||&&|<|>|==|!=/.test(trimmed)) {
    return evaluateExpression(trimmed, variables);
  }
  return resolveOperand(trimmed, variables);
}

function applyOperator(
  resultValue: number,
  op: string,
  nextOperand: number
): number {
  switch (op) {
    case '+':
      return resultValue + nextOperand;
    case '-':
      return resultValue - nextOperand;
    case '*':
      return resultValue * nextOperand;
    case '/':
      if (nextOperand === 0) {
        throw new Error('Division by zero');
      }
      return Math.floor(resultValue / nextOperand);
    case '||':
      return resultValue || nextOperand ? 1 : 0;
    case '&&':
      return resultValue && nextOperand ? 1 : 0;
    case '<':
      return resultValue < nextOperand ? 1 : 0;
    case '<=':
      return resultValue <= nextOperand ? 1 : 0;
    case '>':
      return resultValue > nextOperand ? 1 : 0;
    case '>=':
      return resultValue >= nextOperand ? 1 : 0;
    case '==':
      return resultValue === nextOperand ? 1 : 0;
    case '!=':
      return resultValue !== nextOperand ? 1 : 0;
    default:
      throw new Error('Unknown operator: ' + op);
  }
}

function resolveOperand(
  token: string,
  variables: Variables,
  failIfUninitialized = true
): Result {
  const trimmed = token.trim();
  const arrayMatch = trimmed.match(/^([A-Za-z]\w*)\[(\d+)\]$/);
  if (arrayMatch) {
    const name = arrayMatch[1];
    const index = Number(arrayMatch[2]);
    if (!variables.has(name)) {
      throw new Error('Use of uninitialized variable: ' + name);
    }
    const variable = variables.get(name)!;
    if (!isArrayType(variable.type)) {
      throw new Error('Cannot index non-array type');
    }
    const info = parseArrayType(variable.type);
    if (!info || index < 0 || index >= info.length) {
      throw new Error('Array index out of bounds: ' + trimmed);
    }
    const elements = variable.value as Result[];
    const element = elements[index];
    if (failIfUninitialized && element.isInitialized === false) {
      throw new Error('Use of uninitialized array element: ' + trimmed);
    }
    return element;
  }
  if (trimmed.startsWith('&')) {
    const name = trimmed.substring(1).trim();
    if (!variables.has(name)) {
      throw new Error('Cannot take address of undeclared variable: ' + name);
    }
    const variable = variables.get(name)!;
    return {
      value: variable,
      type:
        '*' + (variable.isMutable ? 'mut ' : '') + (variable.type || 'Untyped'),
      isInitialized: true,
    };
  }
  if (trimmed.startsWith('*')) {
    const name = trimmed.substring(1).trim();
    const variable = resolveOperand(name, variables, failIfUninitialized);
    if (!variable.type?.startsWith('*')) {
      throw new Error('Cannot dereference non-pointer type');
    }
    const pointedTo = variable.value as Result;
    if (failIfUninitialized && pointedTo.isInitialized === false) {
      throw new Error('Use of uninitialized memory at: ' + trimmed);
    }
    return pointedTo;
  }
  if (variables.has(trimmed)) {
    const variable = variables.get(trimmed)!;
    if (failIfUninitialized && variable.isInitialized === false) {
      throw new Error('Use of uninitialized variable: ' + trimmed);
    }
    return variable;
  }
  return parseTypedNumber(trimmed);
}

function tokenizeExpression(
  expr: string,
  variables: Variables
): {
  operands: Result[];
  operators: string[];
} {
  const tokens = expr.match(
    /([&*]*[A-Za-z]\w*(?:\[\d+\])?|-?\d+(?:\.\d+)?(?:[A-Za-z]\w*)?|\|\||&&|<=|>=|==|!=|[+\-*/<>])/g
  );

  if (!tokens || tokens.length === 0) {
    throw new Error('Invalid expression: ' + expr);
  }

  const operands: Result[] = [];
  const operators: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (i % 2 === 0) {
      operands.push(resolveOperand(token, variables));
    } else {
      operators.push(token);
    }
  }

  if (operands.length !== operators.length + 1) {
    throw new Error('Invalid expression: ' + expr);
  }

  return { operands, operators };
}

function applyPrecedenceLevel(
  level: string[],
  values: (number | Result | Result[])[],
  currentOperators: string[]
): void {
  for (let i = 0; i < currentOperators.length; ) {
    const op = currentOperators[i];
    if (level.includes(op)) {
      values[i] = applyOperator(
        asNumber(values[i]),
        op,
        asNumber(values[i + 1])
      );
      values.splice(i + 1, 1);
      currentOperators.splice(i, 1);
    } else {
      i++;
    }
  }
}

function evaluateExpression(expr: string, variables: Variables): Result {
  const { operands, operators } = tokenizeExpression(expr, variables);

  // Collect all types from operands
  const types = operands.map((op) => op.type);

  // Arithmetic operators (+) are not supported for Bool type,
  // but logical operators (||, &&) are.
  const logicalOps = ['||', '&&'];
  const comparisonOps = ['<', '<=', '>', '>=', '==', '!='];
  const arithmeticOps = ['+', '-', '*', '/'];

  const hasLogical = operators.some((op) => logicalOps.includes(op));
  const hasComparison = operators.some((op) => comparisonOps.includes(op));
  const hasArithmetic = operators.some((op) => arithmeticOps.includes(op));
  const hasBool = types.some((t) => t === 'Bool');

  if (hasBool && hasArithmetic) {
    throw new Error('Arithmetic operators not supported for Bool: ' + expr);
  }
  if (hasLogical && types.some((t) => t !== 'Bool')) {
    throw new Error('Logical operators only supported for Bool: ' + expr);
  }
  if (hasComparison && hasBool) {
    // Only == and != are allowed for Bool
    const onlyRefEquality = operators.every((op) => op === '==' || op === '!=');
    if (!onlyRefEquality) {
      throw new Error('Comparison operators not supported for Bool: ' + expr);
    }
  }

  // Determine the widest type
  const resultType =
    hasLogical || hasComparison ? 'Bool' : getWidestType(types);

  // Evaluate with operator precedence (* and / before + and -, etc)
  const values: (number | Result | Result[])[] = operands.map((op) => op.value);
  const currentOperators = [...operators];

  // Operator precedence passes
  const precedenceLevels = [
    ['*', '/'],
    ['+', '-'],
    ['<', '<=', '>', '>=', '==', '!='],
    ['&&'],
    ['||'],
  ];

  for (const level of precedenceLevels) {
    applyPrecedenceLevel(level, values, currentOperators);
  }

  const resultValue = values[0];

  // Validate result is within valid range for the result type
  if (resultType && resultType in typeRanges) {
    const [min, max] = typeRanges[resultType];
    const val = asNumber(resultValue);
    if (val < min || val > max) {
      throw new Error('Invalid expression: ' + expr);
    }
  }

  return { value: resultValue, type: resultType };
}

export function evaluate(source, scope) {
  if (source.trim() === "") return 0;

  let tokens = source.trim().replace(new RegExp("(&&|\\|\\||\\+=|=>|[<>=]|[()+*/{};=|&:,.-]|[\\[\\]])", "g"), " $1 ").trim().split(/\s+/);
  const keywords = new Set(["let", "mut", "if", "else", "while", "fn", "struct", "is", "true", "false", "type"]);
  const typeRanges = {
    U8: [0, 255], U16: [0, 65535], U32: [0, 4294967295],
    I8: [-128, 127], I16: [-32768, 32767], I32: [-2147483648, 2147483647],
  };

  class TypedValue {
    constructor(value, type) {
      this.value = value;
      this.type = type;
    }
  }

  function validateTypeRange(value, type) {
    const range = typeRanges[type];
    if (range && (value < range[0] || value > range[1])) throw new Error(`Value ${value} out of range for ${type}`);
  }

  function checkArrayType(expectedType, actual) {
    const match = expectedType.match(/^\[(.+); (\d+)\]$/);
    if (!match) return false;
    const elemType = match[1];
    const expectedLen = Number(match[2]);
    const elements = actual.value;
    if (elements.length !== expectedLen) {
      throw new Error(`Array length mismatch: expected ${expectedLen} but got ${elements.length}`);
    }
    for (const elem of elements) {
      checkType(elemType, elem);
    }
    return true;
  }

  function checkType(expectedType, actual) {
    if (actual instanceof TypedValue && actual.type && actual.type !== expectedType) {
      if (actual.type === "array" && expectedType.startsWith("[")) {
        if (checkArrayType(expectedType, actual)) return;
      }
      throw new Error(`Type mismatch: expected ${expectedType} but got ${actual.type}`);
    }
    if (expectedType === "Bool" && !(actual instanceof TypedValue)) {
      throw new Error(`Type mismatch: expected ${expectedType} but got number`);
    }
  }

  function checkBool(val) {
    checkType("Bool", val);
  }

  function unwrap(val) {
    return val instanceof TypedValue ? val.value : val;
  }
  let i = 0;
  let scopeStack = [{ vars: scope || {}, mutVars: new Set(), typeAliases: {} }];

  function enterScope() {
    scopeStack.push({ vars: {}, mutVars: new Set(), typeAliases: {} });
  }

  function exitScope() {
    scopeStack.pop();
  }

  function lookup(name) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) return scopeStack[s].vars[name];
    }
    return undefined;
  }

  function isMutable(name) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) return scopeStack[s].mutVars.has(name);
    }
    return false;
  }

  function findAndSet(name, value) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) {
        scopeStack[s].vars[name] = value;
        return;
      }
    }
  }

  function parseOrExpr() {
    let left = parseAndExpr();
    while (i < tokens.length && tokens[i] === "||") {
      i++;
      checkBool(left);
      const right = parseAndExpr();
      checkBool(right);
      left = unwrap(left) ? left : right;
    }
    return left;
  }

  function isComparisonOp(op) {
    return ["<", ">", "<=", ">=", "==", "!="].includes(op);
  }

  const comparators = {
    "<": (a, b) => a < b,
    ">": (a, b) => a > b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b,
    "==": (a, b) => a === b,
    "!=": (a, b) => a !== b,
  };

  function compare(left, op, right) {
    return comparators[op](unwrap(left), unwrap(right)) ? 1 : 0;
  }

  function parseIsExpr() {
    const left = parseComparison();
    if (tokens[i] === "is") {
      i++; // skip "is"
      const type = tokens[i++];
      const result = checkIsType(left, type);
      return new TypedValue(result ? 1 : 0, "Bool");
    }
    return left;
  }

  function checkIsType(value, type) {
    if (value instanceof TypedValue && value.type) {
      return value.type === type;
    }
    // Untyped numbers match numeric types
    return ["U8", "U16", "U32", "I8", "I16", "I32"].includes(type);
  }

  function parseComparison() {
    let left = parseExpr();
    while (i < tokens.length && isComparisonOp(tokens[i])) {
      const op = tokens[i++];
      const right = parseExpr();
      left = compare(unwrap(left), op, unwrap(right));
    }
    return left;
  }

  function parseAndExpr() {
    let left = parseIsExpr();
    while (i < tokens.length && tokens[i] === "&&") {
      i++;
      left = unwrap(left) ? parseIsExpr() : left;
    }
    return left;
  }

  function parseExpr() {
    let left = parseTerm();
    while (i < tokens.length && (tokens[i] === "+" || tokens[i] === "-")) {
      const op = tokens[i++];
      left = op === "+" ? unwrap(left) + unwrap(parseTerm()) : unwrap(left) - unwrap(parseTerm());
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (i < tokens.length && (tokens[i] === "*" || tokens[i] === "/")) {
      const op = tokens[i++];
      left = op === "*" ? unwrap(left) * unwrap(parseFactor()) : unwrap(left) / unwrap(parseFactor());
    }
    return left;
  }

  function parseParenExpr() {
    i++; // skip "("
    const value = parseOrExpr();
    if (tokens[i] !== ")") {
      throw new Error("Missing closing parenthesis");
    }
    i++;
    return value;
  }

  function parseBlock() {
    i++; // skip "{"
    enterScope();
    let lastValue = 0;
    while (i < tokens.length && tokens[i] !== "}") {
      lastValue = parseStatement();
    }
    if (tokens[i] !== "}") {
      throw new Error("Missing closing brace");
    }
    i++;
    exitScope();
    return lastValue;
  }

  function parseIfCondition() {
    if (tokens[i] !== "(") throw new Error("Expected '(' after 'if'");
    i++; // skip "("
    const condition = parseOrExpr();
    if (tokens[i] !== ")") throw new Error("Expected ')' after condition");
    i++; // skip ")"
    return condition;
  }

  function parseIfExpr() {
    i++; // skip "if"
    const condition = unwrap(parseIfCondition());
    const thenValue = unwrap(parseOrExpr());
    if (tokens[i] !== "else") throw new Error("Expected 'else'");
    i++; // skip "else"
    const elseValue = unwrap(parseOrExpr());
    return condition ? thenValue : elseValue;
  }

  function parseIdentifier() {
    const token = tokens[i];
    const val = lookup(token);
    if (val !== undefined) {
      i++;
      return val;
    }
    throw new Error(`Undefined identifier: ${token}`);
  }

  function parseNumber() {
    i++;
    const raw = tokens[i - 1];
    const match = raw.match(/^(\d+)(U8|U16|U32|I8|I16|I32)?$/);
    if (!match) throw new Error(`Unexpected token: ${raw}`);
    const value = Number(match[1]);
    if (isNaN(value)) throw new Error(`Unexpected token: ${raw}`);
    const type = match[2];
    if (type) validateTypeRange(value, type);
    return type ? new TypedValue(value, type) : value;
  }

  function parseArrayLiteral() {
    i++; // skip "["
    const elements = [];
    while (tokens[i] !== "]") {
      elements.push(parseOrExpr());
      if (tokens[i] === ",") i++; // skip ","
    }
    i++; // skip "]"
    return new TypedValue(elements, "array");
  }

  function parseArrayIndex(base) {
    i++; // skip "["
    const index = parseOrExpr();
    if (tokens[i] !== "]") throw new Error("Expected ']' after array index");
    i++; // skip "]"
    const arr = base instanceof TypedValue ? base.value : base;
    const idx = unwrap(index);
    return arr[idx];
  }

  function parseFactor() {
    const token = tokens[i];
    if (token === "(") return parseParenExpr();
    if (token === "{") return parseBlock();
    if (token === "[") return parseArrayLiteral();
    if (token === "if") return parseIfExpr();
    if (token === "true") { i++; return new TypedValue(1, "Bool"); }
    if (token === "false") { i++; return new TypedValue(0, "Bool"); }
    if (token && /^[a-zA-Z_]\w*$/.test(token) && !keywords.has(token)) return parseIdentifierOrCall();
    return parseNumber();
  }

  function parseIdentifierOrCall() {
    const token = tokens[i];
    const val = lookup(token);
    if (val !== undefined && tokens[i + 1] === "(") return callFunction(token);
    if (val !== undefined && val.isStruct && tokens[i + 1] === "<") return parseStructLiteral(token, true);
    if (val !== undefined && val.isStruct && tokens[i + 1] === "{") return parseStructLiteral(token, false);
    const result = parseIdentifier();
    if (tokens[i] === "[") return parseArrayIndex(result);
    return result;
  }

  function parseStructFields(structDef, typeMap) {
    const fields = {};
    if (tokens[i] !== "}") {
      while (tokens[i]) {
        const fieldName = tokens[i++];
        if (tokens[i] === ":") i++; // skip ":"
        const fieldValue = parseOrExpr();
        const fieldDef = structDef.fields.find(f => f.name === fieldName);
        if (!fieldDef) throw new Error(`Unknown field: ${fieldName}`);
        const resolvedType = resolveStructFieldType(fieldDef.type, typeMap);
        if (resolvedType) checkType(resolvedType, fieldValue);
        fields[fieldName] = fieldValue;
        if (tokens[i] === ",") {
          i++;
        } else {
          break;
        }
      }
    }
    return fields;
  }

  function validateStructFields(structDef, fields) {
    for (const fieldDef of structDef.fields) {
      if (!(fieldDef.name in fields)) throw new Error(`Missing field: ${fieldDef.name}`);
    }
  }

  function parseStructLiteral(name, hasTypeArgs) {
    i++; // skip identifier
    let typeArgs = [];
    if (hasTypeArgs) {
      typeArgs = parseStructTypeArgs();
    }
    if (tokens[i] !== "{") throw new Error("Expected '{' after struct name");
    i++; // skip "{"
    const structDef = lookup(name);
    if (structDef.typeParams && structDef.typeParams.length > 0 && typeArgs.length === 0) {
      throw new Error(`Missing type arguments for generic struct: ${name}`);
    }
    const typeMap = resolveStructTypes(structDef, typeArgs);
    const fields = parseStructFields(structDef, typeMap);
    if (tokens[i] === "}") i++; // skip "}"
    validateStructFields(structDef, fields);
    const resolvedTypeName = typeArgs.length > 0 ? `${name}<${typeArgs.join(", ")}>` : name;
    return new TypedValue(fields, resolvedTypeName);
  }

  function resolveGenericTypes(fn, args) {
    const typeMap = {};
    if (!fn.typeParams) return typeMap;
    for (let p = 0; p < fn.params.length; p++) {
      const param = fn.params[p];
      const arg = args[p];
      if (param.type && fn.typeParams.includes(param.type)) {
        const argType = arg instanceof TypedValue ? arg.type : "number";
        typeMap[param.type] = argType;
      }
    }
    return typeMap;
  }

  function bindFunctionArgs(fn, args, typeMap) {
    const fnScope = { ...fn.scope };
    for (let p = 0; p < fn.params.length; p++) {
      const param = fn.params[p];
      const arg = args[p];
      let resolvedType = param.type;
      if (resolvedType && typeMap[resolvedType]) resolvedType = typeMap[resolvedType];
      if (resolvedType) checkType(resolvedType, arg);
      fnScope[param.name] = arg;
    }
    return fnScope;
  }

  function callFunction(name) {
    i++; // skip identifier
    i++; // skip "("
    const args = [];
    while (tokens[i] !== ")") {
      args.push(parseOrExpr());
      if (tokens[i] === ",") i++; // skip ","
    }
    i++; // skip ")"
    const fn = lookup(name);
    if (!fn || !fn.isFn) throw new Error(`Not a function: ${name}`);
    const typeMap = resolveGenericTypes(fn, args);
    const fnScope = bindFunctionArgs(fn, args, typeMap);
    const result = evaluate(fn.body, fnScope);
    if (fn.returnType) {
      let resolvedRetType = fn.returnType;
      if (typeMap[resolvedRetType]) resolvedRetType = typeMap[resolvedRetType];
      checkType(resolvedRetType, result);
    }
    return result;
  }

  function parseArrayType() {
    i++; // skip "["
    const elemType = tokens[i++];
    if (tokens[i] !== ";") throw new Error("Expected ';' in array type");
    i++; // skip ";"
    const len = Number(tokens[i++]);
    if (tokens[i] !== "]") throw new Error("Expected ']' in array type");
    i++; // skip "]"
    return `[${elemType}; ${len}]`;
  }

  function parseLetType() {
    let type = undefined;
    let typeArgs = [];
    if (tokens[i] === ":") {
      i++; // skip ":"
      if (tokens[i] === "[") {
        type = parseArrayType();
      } else {
        type = tokens[i++];
        if (tokens[i] === "<") {
          typeArgs = parseStructTypeArgs();
          type = `${type}<${typeArgs.join(", ")}>`;
        }
      }
    }
    return { type, typeArgs };
  }

  function resolveLetType(type, typeArgs) {
    if (!type || type.startsWith("[")) return type;
    const baseTypeName = type.includes("<") ? type.split("<")[0] : type;
    const alias = lookupTypeAlias(baseTypeName);
    if (alias) {
      return resolveTypeAlias(baseTypeName, typeArgs);
    }
    if (!typeRanges[baseTypeName] && baseTypeName !== "Bool" && !lookup(baseTypeName)) {
      throw new Error(`Unknown type: ${baseTypeName}`);
    }
    return type;
  }

  function parseLetDeclaration() {
    i++; // skip "let"
    const isMut = tokens[i] === "mut";
    if (isMut) i++; // skip "mut"
    const name = tokens[i++];
    const { type: rawType, typeArgs } = parseLetType();
    const type = resolveLetType(rawType, typeArgs);
    if (tokens[i] !== "=") {
      throw new Error("Expected '=' after variable name");
    }
    i++; // skip "="
    const value = parseOrExpr();
    if (type) {
      checkType(type, value);
      const numValue = value instanceof TypedValue ? value.value : value;
      validateTypeRange(numValue, type);
    }
    scopeStack[scopeStack.length - 1].vars[name] = value;
    if (isMut) scopeStack[scopeStack.length - 1].mutVars.add(name);
    if (tokens[i] === ";") i++; // skip ";"
    return 0;
  }

  function parseStructFieldAssignment() {
    const structName = tokens[i++];
    i++; // skip "."
    const fieldName = tokens[i++];
    i++; // skip "="
    const value = parseOrExpr();
    const structVal = lookup(structName);
    if (!structVal || !(structVal instanceof TypedValue)) throw new Error(`Not a struct: ${structName}`);
    if (!isMutable(structName)) throw new Error(`Cannot assign to field of immutable struct: ${structName}`);
    const structDef = lookup(structVal.type);
    const fieldDef = structDef.fields.find(f => f.name === fieldName);
    if (!fieldDef) throw new Error(`Unknown field: ${fieldName}`);
    if (!fieldDef.mut) throw new Error(`Cannot assign to immutable field: ${fieldName}`);
    checkType(fieldDef.type, value);
    structVal.value[fieldName] = unwrap(value);
    if (tokens[i] === ";") i++;
    return 0;
  }

  function parseAssignment() {
    const token = tokens[i];
    if (/^[a-zA-Z_]\w*$/.test(token) && tokens[i + 1] === ".") return parseStructFieldAssignment();
    const name = tokens[i++];
    if (!isMutable(name)) throw new Error(`Cannot assign to immutable variable: ${name}`);
    const op = tokens[i];
    i++; // skip operator
    const value = parseOrExpr();
    if (op === "+=") {
      const current = unwrap(lookup(name));
      findAndSet(name, current + unwrap(value));
      if (tokens[i] === ";") i++;
      return 0;
    }
    findAndSet(name, value);
    if (tokens[i] === ";") i++;
    return 0;
  }

  function skipStatement() {
    let depth = 0;
    while (i < tokens.length) {
      if (tokens[i] === "{") { depth++; i++; }
      else if (tokens[i] === "}") {
        if (depth === 0) { i++; return; }
        depth--;
        i++;
        if (depth === 0) return;
      } else if (tokens[i] === ";" && depth === 0) {
        i++;
        return;
      } else {
        i++;
      }
    }
  }

  function isStructFieldAssignment() {
    return /^[a-zA-Z_]\w*$/.test(tokens[i]) && tokens[i + 1] === "." && tokens[i + 2] && /^[a-zA-Z_]\w*$/.test(tokens[i + 2]) && tokens[i + 3] === "=";
  }

  function isAssignment() {
    if (!tokens[i] || keywords.has(tokens[i])) return false;
    const token = tokens[i];
    if (/^[a-zA-Z_]\w*$/.test(token) && lookup(token) !== undefined && (tokens[i + 1] === "=" || tokens[i + 1] === "+=")) return true;
    return isStructFieldAssignment();
  }

  function parseStructTypeArgs() {
    const typeArgs = [];
    if (tokens[i] === "<") {
      i++; // skip "<"
      while (tokens[i] !== ">") {
        typeArgs.push(tokens[i++]);
        if (tokens[i] === ",") i++; // skip ","
      }
      i++; // skip ">"
    }
    return typeArgs;
  }

  function resolveStructTypes(structDef, typeArgs) {
    const typeMap = {};
    if (structDef.typeParams && typeArgs.length === structDef.typeParams.length) {
      for (let t = 0; t < structDef.typeParams.length; t++) {
        typeMap[structDef.typeParams[t]] = typeArgs[t];
      }
    }
    return typeMap;
  }

  function resolveStructFieldType(fieldType, typeMap) {
    if (typeMap[fieldType]) return typeMap[fieldType];
    return fieldType;
  }

  function parseStructDeclaration() {
    i++; // skip "struct"
    const name = tokens[i++];
    const typeParams = parseTypeParams();
    if (tokens[i] !== "{") throw new Error("Expected '{' after struct name");
    i++; // skip "{"
    const fields = [];
    const fieldNames = new Set();
    if (tokens[i] !== "}") {
      while (tokens[i]) {
        let fieldMut = false;
        if (tokens[i] === "mut") {
          fieldMut = true;
          i++;
        }
        const fieldName = tokens[i++];
        if (fieldNames.has(fieldName)) throw new Error(`Duplicate field: ${fieldName}`);
        fieldNames.add(fieldName);
        if (tokens[i] === ":") i++;
        const fieldType = tokens[i++];
        fields.push({ name: fieldName, type: fieldType, mut: fieldMut });
        if (tokens[i] === ",") {
          i++;
        } else {
          break;
        }
      }
    }
    if (tokens[i] === "}") i++; // skip "}"
    scopeStack[scopeStack.length - 1].vars[name] = { isStruct: true, fields, typeParams };
    if (tokens[i] === ";") i++;
    return 0;
  }

  function parseStatement() {
    if (tokens[i] === "let") return parseLetDeclaration();
    if (tokens[i] === "if") return parseIfStatement();
    if (tokens[i] === "while") return parseWhileStatement();
    if (tokens[i] === "fn") return parseFnDeclaration();
    if (tokens[i] === "struct") return parseStructDeclaration();
    if (tokens[i] === "type") return parseTypeAliasDeclaration();
    if (isAssignment()) return parseAssignment();
    const value = parseOrExpr();
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  function lookupTypeAlias(name) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].typeAliases) return scopeStack[s].typeAliases[name];
    }
    return undefined;
  }

  function parseTypeAliasDeclaration() {
    i++; // skip "type"
    const name = tokens[i++];
    const typeParams = parseTypeParams();
    if (tokens[i] !== "=") throw new Error("Expected '=' after type alias name");
    i++; // skip "="
    let aliasType = tokens[i++];
    // Handle generic type args in alias: Point<T, U8>
    if (tokens[i] === "<") {
      const typeArgs = parseStructTypeArgs();
      aliasType = `${aliasType}<${typeArgs.join(", ")}>`;
    }
    scopeStack[scopeStack.length - 1].typeAliases[name] = { aliasType, typeParams };
    if (tokens[i] === ";") i++;
    return 0;
  }

  function resolveTypeAlias(typeName, typeArgs) {
    const alias = lookupTypeAlias(typeName);
    if (!alias) return typeName;
    // Resolve type params from type args
    const typeMap = {};
    if (alias.typeParams && typeArgs.length === alias.typeParams.length) {
      for (let t = 0; t < alias.typeParams.length; t++) {
        typeMap[alias.typeParams[t]] = typeArgs[t];
      }
    }
    let resolved = alias.aliasType;
    // Apply type map to resolve generic params in alias type
    for (const [param, concrete] of Object.entries(typeMap)) {
      resolved = resolved.replace(new RegExp(`\\b${param}\\b`, 'g'), concrete);
    }
    return resolved;
  }

  function parseTypeParams() {
    const typeParams = [];
    if (tokens[i] === "<") {
      i++; // skip "<"
      while (tokens[i] !== ">") {
        typeParams.push(tokens[i++]);
        if (tokens[i] === ",") i++; // skip ","
      }
      i++; // skip ">"
    }
    return typeParams;
  }

  function parseFnParams() {
    if (tokens[i] !== "(") throw new Error("Expected '(' after function name");
    i++; // skip "("
    const params = [];
    while (tokens[i] !== ")") {
      const paramName = tokens[i++];
      let paramType = undefined;
      if (tokens[i] === ":") {
        i++; // skip ":"
        paramType = tokens[i++];
      }
      params.push({ name: paramName, type: paramType });
      if (tokens[i] === ",") i++; // skip ","
    }
    i++; // skip ")"
    return params;
  }

  function parseFnDeclaration() {
    i++; // skip "fn"
    const name = tokens[i++];
    const typeParams = parseTypeParams();
    const params = parseFnParams();
    let returnType = undefined;
    if (tokens[i] === ":") {
      i++; // skip ":"
      returnType = tokens[i++];
    }
    if (tokens[i] !== "=>") throw new Error("Expected '=>' after parameters");
    i++; // skip "=>"
    // Temporarily add params to scope so body can be parsed
    const currentScope = scopeStack[scopeStack.length - 1];
    for (const param of params) {
      currentScope.vars[param.name] = 0;
    }
    const bodyStart = i;
    parseOrExpr();
    const bodyEnd = i;
    const bodySource = tokens.slice(bodyStart, bodyEnd).join(" ");
    scopeStack[scopeStack.length - 1].vars[name] = { isFn: true, body: bodySource, scope: { ...scopeStack[scopeStack.length - 1].vars }, params, returnType, typeParams };
    if (tokens[i] === ";") i++;
    return 0;
  }

  function parseIfStatement() {
    i++; // skip "if"
    const condition = unwrap(parseIfCondition());
    if (condition) {
      const thenValue = parseStatement();
      if (tokens[i] === "else") {
        i++; // skip "else"
        skipStatement();
        return thenValue;
      }
      return thenValue;
    }
    skipStatement();
    if (tokens[i] === "else") {
      i++; // skip "else"
      return parseStatement();
    }
    return 0;
  }

  function parseWhileStatement() {
    i++; // skip "while"
    if (tokens[i] !== "(") throw new Error("Expected '(' after 'while'");
    i++; // skip "("
    const condStart = i;
    let condition = unwrap(parseOrExpr());
    if (tokens[i] !== ")") throw new Error("Expected ')' after condition");
    i++; // skip ")"
    const bodyStart = i;
    let bodyEnd = bodyStart;
    while (condition) {
      i = bodyStart;
      parseStatement();
      bodyEnd = i;
      i = condStart;
      condition = unwrap(parseOrExpr());
    }
    i = bodyEnd;
    return 0;
  }

  let result = 0;
  while (i < tokens.length) {
    result = parseStatement();
  }
  return unwrap(result);
}

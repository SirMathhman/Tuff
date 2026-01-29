type NativeFunctionDef = {
  kind: 'return-expr' | 'new-array' | 'void';
  expr: string;
  paramNames: string[];
};

let currentNativeFunctions: Map<string, NativeFunctionDef> | null = null;
let nativeArrayCounter = 0;

export function add(a: number, b: number): number {
  return a + b;
}

export function interpretAll(
  inputs: string[],
  config: Map<string[], string>,
  nativeConfig: Map<string[], string>
): number {
  function extractUseStatements(source: string): {
    code: string;
    deps: string[];
    externDeps: Array<{ module: string; names: string[] }>;
    externLets: Array<{ name: string; type: string }>;
    externFns: Array<{
      name: string;
      generics: string;
      returnType: string;
      params: string;
    }>;
  } {
    const deps: string[] = [];
    const externDeps: Array<{ module: string; names: string[] }> = [];
    const externLetsList: Array<{ name: string; type: string }> = [];
    const externFnsList: Array<{
      name: string;
      generics: string;
      returnType: string;
      params: string;
    }> = [];

    const useRegex = /use\s*\{\s*[^}]*\s*\}\s*from\s+([a-zA-Z_]\w*)\s*;?/g;

    const externUseRegex = /extern\s+use\s*\{\s*([^}]+)\s*\}\s*from\s+([a-zA-Z_]\w*)\s*;?/g;
    let externMatch = externUseRegex.exec(source);
    while (externMatch) {
      const rawNames = externMatch[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      externDeps.push({ module: externMatch[2], names: rawNames });
      externMatch = externUseRegex.exec(source);
    }

    const sourceWithoutExtern = source.replace(externUseRegex, '');
    let match = useRegex.exec(sourceWithoutExtern);
    while (match) {
      deps.push(match[1]);
      match = useRegex.exec(sourceWithoutExtern);
    }

    const externLetRegex = /extern\s+let\s+([a-zA-Z_]\w*)\s*:\s*([^;]+);?/g;
    let externLetMatch = externLetRegex.exec(source);
    while (externLetMatch) {
      externLetsList.push({ name: externLetMatch[1], type: externLetMatch[2].trim() });
      externLetMatch = externLetRegex.exec(source);
    }

    const externFnRegex =
      /extern\s+fn\s+([a-zA-Z_]\w*)\s*(<\s*[^>]+\s*>)?\s*\(([^)]*)\)\s*(?::\s*([^;]+))?;?/g;
    let externFnMatch = externFnRegex.exec(source);
    while (externFnMatch) {
      externFnsList.push({
        name: externFnMatch[1],
        generics: externFnMatch[2] ? externFnMatch[2].trim() : '',
        params: externFnMatch[3].trim(),
        returnType: externFnMatch[4] ? externFnMatch[4].trim() : 'I32',
      });
      externFnMatch = externFnRegex.exec(source);
    }

    const code = sourceWithoutExtern
      .replace(externUseRegex, '')
      .replace(externLetRegex, '')
      .replace(externFnRegex, '')
      .replace(useRegex, '')
      .trim();
    return { code, deps, externDeps, externLets: externLetsList, externFns: externFnsList };
  }

  function parseNativeExports(source: string): {
    constExports: Map<string, string>;
    fnExports: Map<string, NativeFunctionDef>;
  } {
    const constExports = new Map<string, string>();
    const fnExports = new Map<string, NativeFunctionDef>();
    const tsMorph = require('ts-morph');
    const project = new tsMorph.Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('native.ts', source, { overwrite: true });
    const statements = sourceFile.getVariableStatements();
    for (const statement of statements) {
      if (!statement.isExported()) continue;
      const declarations = statement.getDeclarations();
      for (const declaration of declarations) {
        const name = declaration.getName();
        const initializer = declaration.getInitializer();
        if (!initializer) {
          throw new Error('native export missing initializer: ' + name);
        }
        constExports.set(name, initializer.getText().trim());
      }
    }
    const fnDeclarations = sourceFile.getFunctions();
    for (const fnDecl of fnDeclarations) {
      if (!fnDecl.isExported()) continue;
      const name = fnDecl.getName();
      if (!name) continue;
      const body = fnDecl.getBody();
      if (!body) {
        throw new Error('native function missing body: ' + name);
      }
      const returnStatements = body
        .getStatements()
        .filter((stmt: any) => stmt.getKindName() === 'ReturnStatement');
      const paramNames = fnDecl.getParameters().map((param: any) => param.getName());
      if (returnStatements.length === 0) {
        fnExports.set(name, { kind: 'void', expr: '', paramNames });
        continue;
      }
      if (returnStatements.length !== 1) {
        throw new Error('native function must have single return: ' + name);
      }
      const returnStmt = returnStatements[0];
      const expr = returnStmt.getExpression();
      if (!expr) {
        fnExports.set(name, { kind: 'void', expr: '', paramNames });
        continue;
      }
      const kind = expr.getKindName() === 'NewExpression' ? 'new-array' : 'return-expr';
      fnExports.set(name, { kind, expr: expr.getText().trim(), paramNames });
    }
    return { constExports, fnExports };
  }

  const moduleMap = new Map<string, string>();
  for (const [key, value] of config) {
    if (key.length > 0) {
      moduleMap.set(key[0], value);
    }
  }

  const nativeModuleMap = new Map<string, string>();
  for (const [key, value] of nativeConfig) {
    if (key.length > 0) {
      nativeModuleMap.set(key[0], value);
    }
  }

  const visited = new Set<string>();
  const parts: string[] = [];
  const externUses: Array<{ module: string; names: string[] }> = [];
  const externLets: Array<{ name: string; type: string }> = [];
  const externFns: Array<{
    name: string;
    generics: string;
    returnType: string;
    params: string;
  }> = [];

  function appendCode(code: string): void {
    if (!code) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    parts.push(trimmed);
  }

  function includeModule(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const raw = moduleMap.get(name);
    if (raw === undefined) {
      throw new Error('module not found: ' + name);
    }
    const extracted = extractUseStatements(raw);
    for (const dep of extracted.deps) {
      includeModule(dep);
    }
    externUses.push(...extracted.externDeps);
    externLets.push(...extracted.externLets);
    externFns.push(...extracted.externFns);
    appendCode(extracted.code);
  }

  for (const input of inputs) {
    includeModule(input);
  }

  if (!parts.length && externLets.length === 0 && externFns.length === 0) return 0;

  const externValueByName = new Map<string, string>();
  const externFnByName = new Map<string, NativeFunctionDef>();
  const buildMissingNativeExportMessage = (exportName: string, moduleName: string): string => {
    return (
      'native export not found: ' +
      exportName +
      '. Cause: extern use references a native export that does not exist. Fix: export ' +
      exportName +
      ' from ' +
      moduleName +
      '.ts or remove it. Context: module ' +
      moduleName +
      '.'
    );
  };
  const nativeExportsByModule = new Map<
    string,
    { constExports: Map<string, string>; fnExports: Map<string, NativeFunctionDef> }
  >();
  for (const [moduleName, source] of nativeModuleMap) {
    nativeExportsByModule.set(moduleName, parseNativeExports(source));
  }
  for (const externUse of externUses) {
    const nativeSource = nativeModuleMap.get(externUse.module);
    if (!nativeSource) {
      throw new Error('native module not found: ' + externUse.module);
    }
    const nativeExports = nativeExportsByModule.get(externUse.module);
    if (!nativeExports) {
      throw new Error('native module not found: ' + externUse.module);
    }
    for (const name of externUse.names) {
      const constValue = nativeExports.constExports.get(name);
      const fnValue = nativeExports.fnExports.get(name);
      if (constValue) {
        externValueByName.set(name, constValue);
        continue;
      }
      if (fnValue) {
        externFnByName.set(name, fnValue);
        continue;
      }
      throw new Error(buildMissingNativeExportMessage(name, externUse.module));
    }
  }

  const externPreludeParts: string[] = [];
  for (const externLet of externLets) {
    const value = externValueByName.get(externLet.name);
    if (!value) {
      throw new Error('native export not found: ' + externLet.name);
    }
    externPreludeParts.push(
      ['let ', externLet.name, ' : ', externLet.type, ' = ', value, ';'].join('')
    );
  }
  const nativeFunctionTable = new Map<string, NativeFunctionDef>();
  for (const externFn of externFns) {
    const fnBody = externFnByName.get(externFn.name);
    if (!fnBody) {
      const matches: Array<{ module: string; fn: NativeFunctionDef }> = [];
      for (const [moduleName, nativeExports] of nativeExportsByModule) {
        const found = nativeExports.fnExports.get(externFn.name);
        if (found) {
          matches.push({ module: moduleName, fn: found });
        }
      }
      if (matches.length === 1) {
        nativeFunctionTable.set(externFn.name, matches[0].fn);
        continue;
      }
      const moduleName = externUses.length === 1 ? externUses[0].module : 'unknown';
      if (matches.length > 1) {
        const message =
          'native export not found: ' +
          externFn.name +
          '. Cause: extern fn matches multiple native modules. Reason: extern functions must resolve to a single native module. Fix: add extern use { ' +
          externFn.name +
          ' } from <module> to disambiguate. Context: module ' +
          moduleName +
          '.';
        throw new Error(message);
      }
      const message =
        'native export not found: ' +
        externFn.name +
        '. Cause: extern fn declares a native symbol without a matching export. Reason: extern functions must be provided by a native module. Fix: add extern use { ' +
        externFn.name +
        ' } from ' +
        moduleName +
        ' and export it from ' +
        moduleName +
        '.ts. Context: module ' +
        moduleName +
        '.';
      throw new Error(message);
    }
    nativeFunctionTable.set(externFn.name, fnBody);
  }

  let combined = '';
  for (const part of externPreludeParts.concat(parts)) {
    if (!combined) {
      combined = part;
      continue;
    }
    const needsSeparator = !combined.trim().endsWith(';') && !part.trim().startsWith(';');
    combined += needsSeparator ? ';' : '';
    combined += part;
  }
  if (!combined.trim()) return 0;
  const previousNative = currentNativeFunctions;
  currentNativeFunctions = nativeFunctionTable;
  try {
    return interpret(combined);
  } finally {
    currentNativeFunctions = previousNative;
  }
}

export function buildReplInputs(rootDir: string): {
  inputs: string[];
  config: Map<string[], string>;
  nativeConfig: Map<string[], string>;
} {
  const fs = require('fs');
  const path = require('path');
  const srcDir = path.join(rootDir, 'src');

  if (!fs.existsSync(srcDir)) {
    throw new Error('src directory not found');
  }

  const config = new Map<string[], string>();
  const nativeConfig = new Map<string[], string>();

  const collectFiles = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.tuff') && !entry.name.endsWith('.ts')) continue;
      const relPath = path.relative(srcDir, fullPath);
      const segments = relPath.split(path.sep);
      const fileName = segments[segments.length - 1];
      const baseName = fileName.replace(/\.(tuff|ts)$/, '');
      const key = segments.slice(0, -1).concat(baseName);
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (entry.name.endsWith('.tuff')) {
        config.set(key, content);
      } else if (entry.name !== 'index.ts') {
        // Skip index.ts to avoid loading the interpreter source as a native module
        nativeConfig.set(key, content);
      }
    }
  };

  collectFiles(srcDir);

  if (!config.has(['index'])) {
    const hasIndex = Array.from(config.keys()).some(
      (key) => key.length === 1 && key[0] === 'index'
    );
    if (!hasIndex) {
      throw new Error('index.tuff not found');
    }
  }

  return { inputs: ['index'], config, nativeConfig };
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
  function stripComments(source: string): string {
    let out = '';
    let i = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let inChar = false;
    while (i < source.length) {
      const ch = source[i];
      const next = i + 1 < source.length ? source[i + 1] : '';

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          out += ch;
        }
        i++;
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }

      if (!inString && !inChar && ch === '/' && next === '/') {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (!inString && !inChar && ch === '/' && next === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }

      if (!inChar && ch === '"') {
        inString = !inString;
        out += ch;
        i++;
        continue;
      }
      if (!inString && ch === "'") {
        inChar = !inChar;
        out += ch;
        i++;
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  const s = stripComments(input).trim();
  if (s === '') return 0;

  type Type =
    | { kind: 'U' | 'I' | 'Bool'; width: number }
    | { kind: 'Ptr'; pointsTo: Type; mutable: boolean }
    | { kind: 'Void' }
    | { kind: 'Array'; elementType: Type; length: number; initializedCount: number }
    | { kind: 'Generic'; name: string }
    | { kind: 'Tuple'; elements: Type[] }
    | { kind: 'This' }
    | { kind: 'Char' }
    | { kind: 'Str' }
    | { kind: 'FnPtr'; paramTypes: Type[]; returnType: Type };

  type RuntimeValue = {
    value: number;
    type?: Type;
    refersTo?: string;
    refersToFn?: string;
    boundThis?: RuntimeValue;
    boundThisRef?: string;
    boundThisFieldKeys?: string[];
    structName?: string;
    structFields?: Map<string, RuntimeValue>;
    arrayElements?: Array<RuntimeValue | undefined>;
    arrayInitializedCount?: number;
    tupleElements?: RuntimeValue[];
    stringValue?: string;
    maxValue?: number;
    mutable?: boolean;
    initialized?: boolean;
  };

  type Context = Map<
    string,
    RuntimeValue & { mutable: boolean; initialized: boolean; dropFn?: string }
  >;

  type FunctionDef = {
    params: Array<{ name: string; type: Type }>;
    returnType?: Type;
    generics?: string[];
    body: string;
  };

  type FunctionTable = Map<string, FunctionDef>;
  type StructInfo = { fields: Array<{ name: string; type: Type }>; typeParams?: string[] };
  type StructTable = Map<string, StructInfo>;
  type TypeAliasInfo = { type: Type; dropFn?: string };
  type TypeAliasTable = Map<string, TypeAliasInfo>;

  const typeAliases: TypeAliasTable = new Map();

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

  function suffixKind(suffix: Type): string {
    if (suffix.kind === 'Ptr') return 'Ptr<' + suffixKind(suffix.pointsTo) + '>';
    if (suffix.kind === 'Void') return 'Void';
    if (suffix.kind === 'Generic') return suffix.name;
    if (suffix.kind === 'Tuple') {
      return '(' + suffix.elements.map(suffixKind).join(', ') + ')';
    }
    if (suffix.kind === 'Array') {
      if (suffix.length < 0 || suffix.initializedCount < 0) {
        return '[' + suffixKind(suffix.elementType) + ']';
      }
      return (
        '[' +
        suffixKind(suffix.elementType) +
        '; ' +
        suffix.initializedCount +
        '; ' +
        suffix.length +
        ']'
      );
    }
    if (suffix.kind === 'This') {
      return 'This';
    }
    if (suffix.kind === 'Char') {
      return 'Char';
    }
    if (suffix.kind === 'Str') {
      return 'Str';
    }
    if (suffix.kind === 'FnPtr') {
      const paramStrs = suffix.paramTypes.map((p) => suffixKind(p));
      const returnStr = suffixKind(suffix.returnType);
      return '(' + paramStrs.join(', ') + ') => ' + returnStr;
    }
    return suffix.kind + suffix.width;
  }

  function buildFunctionPointerValue(fnName: string, functions: FunctionTable): RuntimeValue {
    const fnDef = functions.get(fnName);
    if (!fnDef) {
      throw new Error('function not found: ' + fnName);
    }
    const returnType = fnDef.returnType || { kind: 'I', width: 32 };
    const paramTypes = fnDef.params.map((param) => param.type);
    return { value: 0, type: { kind: 'FnPtr', paramTypes, returnType }, refersToFn: fnName };
  }

  function typeEqualsForValidation(leftType: Type, rightType: Type): boolean {
    if (leftType.kind === 'Generic') {
      const leftAlias = resolveTypeAlias(leftType.name);
      if (leftAlias) {
        return typeEqualsForValidation(leftAlias, rightType);
      }
    }
    if (rightType.kind === 'Generic') {
      const rightAlias = resolveTypeAlias(rightType.name);
      if (rightAlias) {
        return typeEqualsForValidation(leftType, rightAlias);
      }
    }
    if (leftType.kind !== rightType.kind) return false;
    if (leftType.kind === 'Ptr' && rightType.kind === 'Ptr') {
      return (
        leftType.mutable === rightType.mutable &&
        typeEqualsForValidation(leftType.pointsTo, rightType.pointsTo)
      );
    }
    if (leftType.kind === 'Array' && rightType.kind === 'Array') {
      return (
        leftType.length === rightType.length &&
        leftType.initializedCount === rightType.initializedCount &&
        typeEqualsForValidation(leftType.elementType, rightType.elementType)
      );
    }
    if (leftType.kind === 'Tuple' && rightType.kind === 'Tuple') {
      if (leftType.elements.length !== rightType.elements.length) return false;
      for (let i = 0; i < leftType.elements.length; i++) {
        if (!typeEqualsForValidation(leftType.elements[i], rightType.elements[i])) return false;
      }
      return true;
    }
    if (leftType.kind === 'FnPtr' && rightType.kind === 'FnPtr') {
      if (leftType.paramTypes.length !== rightType.paramTypes.length) return false;
      for (let i = 0; i < leftType.paramTypes.length; i++) {
        if (!typeEqualsForValidation(leftType.paramTypes[i], rightType.paramTypes[i])) {
          return false;
        }
      }
      return typeEqualsForValidation(leftType.returnType, rightType.returnType);
    }
    if ('width' in leftType && 'width' in rightType) {
      return leftType.kind === rightType.kind && leftType.width === rightType.width;
    }
    return true;
  }

  function validateNarrowing(source: Type | undefined, target: Type) {
    if (target.kind === 'Void') {
      if (source && source.kind !== 'Void') {
        throw new Error('void function cannot return a value');
      }
      return;
    }

    if (target.kind === 'This') {
      if (source && source.kind !== 'This') {
        throw new Error('cannot convert non-This type to This');
      }
      return;
    }

    if (source && source.kind === 'This') {
      throw new Error('cannot convert This to non-This type');
    }

    if (target.kind === 'FnPtr') {
      if (!source || source.kind !== 'FnPtr') {
        throw new Error('cannot convert non-function to function pointer type');
      }
      // Allow conversion from closure (N params) to function pointer with explicit context (N+1 params)
      // where the extra first param is *This
      let sourceOffset = 0;
      let targetOffset = 0;
      if (
        target.paramTypes.length === source.paramTypes.length + 1 &&
        target.paramTypes[0].kind === 'Ptr' &&
        target.paramTypes[0].pointsTo.kind === 'This'
      ) {
        // Skip the first *This param in target when comparing
        targetOffset = 1;
      } else if (source.paramTypes.length !== target.paramTypes.length) {
        throw new Error('function pointer parameter length mismatch');
      }
      const effectiveTargetParams = target.paramTypes.length - targetOffset;
      const effectiveSourceParams = source.paramTypes.length - sourceOffset;
      if (effectiveSourceParams !== effectiveTargetParams) {
        throw new Error('function pointer parameter length mismatch');
      }
      for (let i = 0; i < effectiveSourceParams; i++) {
        if (
          !typeEqualsForValidation(
            source.paramTypes[i + sourceOffset],
            target.paramTypes[i + targetOffset]
          )
        ) {
          throw new Error('function pointer parameter type mismatch');
        }
      }
      if (!typeEqualsForValidation(source.returnType, target.returnType)) {
        throw new Error('function pointer return type mismatch');
      }
      return;
    }

    if (target.kind === 'Generic') {
      return;
    }

    if (target.kind === 'Tuple') {
      if (!source || source.kind !== 'Tuple') {
        throw new Error('cannot convert non-tuple to tuple type');
      }
      if (source.elements.length !== target.elements.length) {
        throw new Error('tuple length mismatch');
      }
      for (let i = 0; i < target.elements.length; i++) {
        validateNarrowing(source.elements[i], target.elements[i]);
      }
      return;
    }

    if (target.kind === 'Array') {
      if (!source || source.kind !== 'Array') {
        throw new Error('cannot convert non-array to array type');
      }
      if (target.length >= 0 && source.length !== target.length) {
        throw new Error('array length mismatch');
      }
      if (target.initializedCount >= 0 && source.initializedCount < target.initializedCount) {
        throw new Error('array initialized count mismatch');
      }
      validateNarrowing(source.elementType, target.elementType);
      return;
    }

    if (source && source.kind === 'Generic') {
      return;
    }

    if (source && source.kind === 'Tuple') {
      throw new Error('cannot convert tuple to non-tuple type');
    }

    if (source && source.kind === 'Array') {
      throw new Error('cannot convert array to non-array type');
    }

    if (target.kind === 'Ptr') {
      // Special case: allow assigning Str to *Str
      if (source && source.kind === 'Str' && target.pointsTo.kind === 'Str') {
        return;
      }
      if (!source || source.kind !== 'Ptr') {
        throw new Error('cannot convert non-pointer to pointer type');
      }
      // Validate pointee types match
      validateNarrowing(source.pointsTo, target.pointsTo);
      return;
    }

    if (source && source.kind === 'Ptr') {
      throw new Error('cannot convert pointer to non-pointer type');
    }

    if (target.kind === 'Bool') {
      if (!source || source.kind !== 'Bool') {
        throw new Error('cannot convert numeric type to Bool');
      }
      return;
    }

    if (source && source.kind === 'Bool') {
      throw new Error('cannot convert Bool to numeric type');
    }

    const effectiveSource = source;
    const sourceIsNumeric = effectiveSource && 'width' in effectiveSource;
    const targetIsNumeric = 'width' in target;
    if (sourceIsNumeric && targetIsNumeric && (effectiveSource as any).width > target.width) {
      const message = [
        'narrowing conversion from ',
        suffixKind(effectiveSource),
        ' to ',
        suffixKind(target),
      ].join('');
      throw new Error(message);
    }
  }

  // helper to parse a single literal token and validate suffixes
  // returns { value, suffix } where suffix is undefined or { kind, width }
  function parseLiteralToken(token: string): RuntimeValue {
    const t = token.trim();
    if (t === 'true') return { value: 1, type: { kind: 'Bool', width: 1 } };
    if (t === 'false') return { value: 0, type: { kind: 'Bool', width: 1 } };

    // Check for string literals: "test", "hello", etc.
    const stringMatch = t.match(/^"(.*?)"\s*$/);
    if (stringMatch) {
      const str = stringMatch[1];
      return { value: 0, type: { kind: 'Str' }, stringValue: str };
    }

    // Check for char literals: 'a', 'A', etc.
    const charMatch = t.match(/^'(.)'\s*$/);
    if (charMatch) {
      const char = charMatch[1];
      const charCode = char.charCodeAt(0);
      return { value: charCode, type: { kind: 'Char' } };
    }

    const m = t.match(/^([+-]?\d+(?:\.\d+)?)(?:([A-Za-z]+\d*))?$/);
    if (!m) throw new Error('invalid literal');
    const n = Number(m[1]);
    const suffix = m[2];

    if (suffix && /^[u]/.test(suffix)) {
      throw new Error('invalid suffix');
    }

    if (suffix) {
      if (suffix === 'USize') {
        const width = 64;
        validateValueAgainstSuffix(n, 'U', width);
        return { value: Number.isFinite(n) ? n : 0, type: { kind: 'U', width } };
      }
      const m2 = suffix.match(/^([UI])(\d+)$/);
      if (!m2) throw new Error('invalid suffix');
      const kind = m2[1] as 'U' | 'I';
      const width = Number(m2[2]);
      const allowedWidths = new Set([8, 16, 32, 64]);
      if (!allowedWidths.has(width)) throw new Error('invalid suffix');

      validateValueAgainstSuffix(n, kind, width);

      return { value: Number.isFinite(n) ? n : 0, type: { kind, width } };
    }

    return { value: Number.isFinite(n) ? n : 0 };
  }

  function ensureVariable(
    name: string,
    context: Context
  ): RuntimeValue & { mutable: boolean; initialized: boolean; refersTo?: string } {
    if (!context.has(name)) {
      throw new Error('undefined variable: ' + name);
    }
    return context.get(name)!;
  }

  function ensurePointer(
    name: string,
    context: Context
  ): RuntimeValue & {
    type: { kind: 'Ptr'; pointsTo: Type; mutable: boolean };
    refersTo: string;
  } {
    const ptrVar = ensureVariable(name, context);
    if (ptrVar.type?.kind !== 'Ptr') {
      throw new Error('cannot dereference non-pointer type');
    }
    if (!ptrVar.refersTo) {
      throw new Error('pointer does not refer to a variable');
    }
    return ptrVar as RuntimeValue & {
      type: { kind: 'Ptr'; pointsTo: Type; mutable: boolean };
      refersTo: string;
    };
  }

  function resolveStringIndex(str: string, index: number): RuntimeValue {
    if (index < 0 || index >= str.length) {
      throw new Error('string index out of bounds');
    }
    const char = str[index];
    return { value: char.charCodeAt(0), type: { kind: 'Char' } };
  }

  function resolveArrayElementFromList(
    elements: Array<RuntimeValue | undefined>,
    index: number
  ): RuntimeValue {
    if (index < 0 || index >= elements.length) {
      throw new Error('array index out of bounds');
    }
    const element = elements[index];
    if (!element) {
      throw new Error('array element not initialized');
    }
    return element;
  }

  function resolveArrayElement(varName: string, index: number, context: Context): RuntimeValue {
    const varInfo = ensureVariable(varName, context);
    if (varInfo.tupleElements) {
      if (index < 0 || index >= varInfo.tupleElements.length) {
        throw new Error('tuple index out of bounds');
      }
      return varInfo.tupleElements[index];
    }

    // Handle string indexing through pointer
    if (varInfo.type?.kind === 'Ptr' && varInfo.type.pointsTo.kind === 'Str') {
      // First try to get stringValue from the variable itself (inline strings)
      if (varInfo.stringValue) {
        return resolveStringIndex(varInfo.stringValue, index);
      }
      // Otherwise try to get it from the variable it refers to
      if (varInfo.refersTo) {
        const targetVar = ensureVariable(varInfo.refersTo, context);
        if (targetVar.stringValue) {
          return resolveStringIndex(targetVar.stringValue, index);
        }
      }
    }

    let elements = varInfo.arrayElements;
    if (!elements && varInfo.type?.kind === 'Ptr' && varInfo.type.pointsTo.kind === 'Array') {
      const targetVar = ensureVariable(varInfo.refersTo || '', context);
      elements = targetVar.arrayElements;
    }
    if (!elements) {
      throw new Error('variable ' + varName + ' is not an array');
    }
    return resolveArrayElementFromList(elements, index);
  }

  function resolveIndexedValue(
    baseValue: RuntimeValue,
    index: number,
    context: Context
  ): RuntimeValue {
    if (baseValue.tupleElements) {
      if (index < 0 || index >= baseValue.tupleElements.length) {
        throw new Error('tuple index out of bounds');
      }
      return baseValue.tupleElements[index];
    }

    if (baseValue.type?.kind === 'Str' && baseValue.stringValue !== undefined) {
      return resolveStringIndex(baseValue.stringValue, index);
    }

    if (baseValue.type?.kind === 'Ptr' && baseValue.type.pointsTo.kind === 'Str') {
      if (baseValue.stringValue !== undefined) {
        return resolveStringIndex(baseValue.stringValue, index);
      }
      if (baseValue.refersTo) {
        const targetVar = ensureVariable(baseValue.refersTo, context);
        if (targetVar.stringValue !== undefined) {
          return resolveStringIndex(targetVar.stringValue, index);
        }
      }
    }

    let elements = baseValue.arrayElements;
    if (!elements && baseValue.type?.kind === 'Ptr' && baseValue.type.pointsTo.kind === 'Array') {
      const targetVar = ensureVariable(baseValue.refersTo || '', context);
      elements = targetVar.arrayElements;
    }
    if (!elements) {
      throw new Error('expression is not an array');
    }
    return resolveArrayElementFromList(elements, index);
  }

  type BracketDepths = { paren: number; bracket: number; brace: number };

  function updateBracketDepths(ch: string, depths: BracketDepths): void {
    if (ch === '(') depths.paren++;
    if (ch === ')') depths.paren--;
    if (ch === '[') depths.bracket++;
    if (ch === ']') depths.bracket--;
    if (ch === '{') depths.brace++;
    if (ch === '}') depths.brace--;
  }

  function forEachCharWithDepths(
    input: string,
    handler: (ch: string, index: number, depths: BracketDepths) => boolean | void
  ): void {
    const depths: BracketDepths = { paren: 0, bracket: 0, brace: 0 };
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      updateBracketDepths(ch, depths);
      const shouldStop = handler(ch, i, depths);
      if (shouldStop) {
        break;
      }
    }
  }

  function splitTopLevelComma(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    forEachCharWithDepths(input, (ch, _index, depths) => {
      if (ch === ',' && depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        return;
      }
      current += ch;
    });
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function resolveTypeAlias(name: string, seen: Set<string> = new Set()): Type | undefined {
    if (!typeAliases.has(name)) return undefined;
    if (seen.has(name)) {
      throw new Error('cyclic type alias: ' + name);
    }
    seen.add(name);
    const aliasInfo = typeAliases.get(name);
    if (!aliasInfo) return undefined;
    return aliasInfo.type;
  }

  function getAliasDropFn(name: string): string | undefined {
    const aliasInfo = typeAliases.get(name);
    return aliasInfo?.dropFn;
  }

  function tryParseSuffix(typeStr: string): Type | undefined {
    const trimmed = typeStr.trim();
    const alias = resolveTypeAlias(trimmed);
    if (alias) return alias;
    if (trimmed === 'Bool') return { kind: 'Bool', width: 1 };
    if (trimmed === 'Void') return { kind: 'Void' };
    if (trimmed === 'Char') return { kind: 'Char' };
    if (trimmed === 'Str') return { kind: 'Str' };
    if (trimmed === 'This') return { kind: 'This' };
    if (trimmed === 'USize') return { kind: 'U', width: 64 };

    // Parse function pointer type with optional leading *: *?(param1, param2, ...) => returnType
    // The leading * is optional and just indicates "function pointer" explicitly
    const fnPtrMatch = trimmed.match(/^\s*\*?\s*\((.*?)\)\s*=>\s*(.+)$/);
    if (fnPtrMatch) {
      const paramsStr = fnPtrMatch[1].trim();
      const returnTypeStr = fnPtrMatch[2].trim();

      const paramTypes: Type[] = [];
      if (paramsStr) {
        const paramParts = splitTopLevelComma(paramsStr);
        for (const paramPart of paramParts) {
          let paramType: Type | undefined;
          const paramTrimmed = paramPart.trim();
          // Handle pointer params like *outer where outer is assumed to be This
          if (paramTrimmed.startsWith('*')) {
            const pointeeStr = paramTrimmed.substring(1).trim();
            const pointeeType = tryParseSuffix(pointeeStr);
            if (pointeeType) {
              paramType = { kind: 'Ptr', pointsTo: pointeeType, mutable: false };
            }
          } else {
            paramType = tryParseSuffix(paramTrimmed);
          }
          if (!paramType) return undefined;
          paramTypes.push(paramType);
        }
      }

      const returnType = tryParseSuffix(returnTypeStr);
      if (!returnType) return undefined;

      return { kind: 'FnPtr', paramTypes, returnType };
    }

    // Parse array type: [I32; init; length]
    const arrayMatch = typeStr.match(/^\[(.+?);\s*(\d+);\s*(\d+)\]$/);
    if (arrayMatch) {
      const elementTypeStr = arrayMatch[1].trim();
      const initializedCount = Number(arrayMatch[2]);
      const length = Number(arrayMatch[3]);
      const elementType = tryParseSuffix(elementTypeStr);
      if (!elementType) return undefined;
      return { kind: 'Array', elementType, length, initializedCount };
    }

    // Parse array slice type: [I32]
    const sliceMatch = typeStr.match(/^\[([^;]+)\]$/);
    if (sliceMatch) {
      const elementTypeStr = sliceMatch[1].trim();
      const elementType = tryParseSuffix(elementTypeStr);
      if (!elementType) return undefined;
      return { kind: 'Array', elementType, length: -1, initializedCount: -1 };
    }

    // Parse tuple type: (I32, Bool)
    const tupleMatch = typeStr.match(/^\((.*)\)$/);
    if (tupleMatch) {
      const inner = tupleMatch[1].trim();
      if (!inner) return undefined;
      const parts = splitTopLevelComma(inner);
      if (parts.length < 2) return undefined;
      const elements: Type[] = [];
      for (const part of parts) {
        const elementType = tryParseSuffix(part);
        if (!elementType) return undefined;
        elements.push(elementType);
      }
      return { kind: 'Tuple', elements };
    }

    const typeMatch = typeStr.match(/^([UI])(\d+)$/);
    if (typeMatch) {
      const kind = typeMatch[1] as 'U' | 'I';
      const width = Number(typeMatch[2]);
      return { kind, width };
    }

    // Parse generic type parameter (e.g., T, U, V)
    const genericMatch = trimmed.match(/^([A-Z][a-zA-Z0-9_]*)$/);
    if (genericMatch) {
      return { kind: 'Generic', name: genericMatch[1] };
    }

    // Lowercase identifiers (like function names) are treated as This
    // This allows `let x : outer = outer(...)` where outer returns this
    const lowercaseIdentMatch = trimmed.match(/^([a-z][a-zA-Z0-9_]*)$/);
    if (lowercaseIdentMatch) {
      return { kind: 'This' };
    }

    return undefined;
  }

  function parsePointerSuffix(typeStr: string, mutable: boolean): Type | undefined {
    const pointeeSuffix = tryParseSuffix(typeStr);
    if (!pointeeSuffix || pointeeSuffix.kind === 'Void') {
      return undefined;
    }
    return { kind: 'Ptr', pointsTo: pointeeSuffix, mutable };
  }

  function parseStructFieldType(typeExpression: string): Type | undefined {
    const trimmed = typeExpression.trim();
    if (trimmed === 'Bool') return { kind: 'Bool', width: 1 };
    if (trimmed === 'Void') return { kind: 'Void' };
    if (trimmed.startsWith('*mut ')) {
      return parsePointerSuffix(trimmed.substring(5).trim(), true);
    }
    if (trimmed.startsWith('*')) {
      return parsePointerSuffix(trimmed.substring(1).trim(), false);
    }
    return tryParseSuffix(trimmed);
  }

  function buildThisValue(context: Context): RuntimeValue {
    const fields = new Map<string, RuntimeValue>();
    for (const [key, value] of context) {
      if (!value.initialized) {
        continue;
      }
      fields.set(key, snapshotRuntimeValue(value));
    }
    return { value: 0, type: { kind: 'This' }, structName: 'This', structFields: fields };
  }

  function snapshotRuntimeValue(value: RuntimeValue): RuntimeValue {
    return {
      value: value.value,
      type: value.type,
      refersTo: value.refersTo,
      refersToFn: value.refersToFn,
      boundThis: value.boundThis,
      boundThisRef: value.boundThisRef,
      boundThisFieldKeys: value.boundThisFieldKeys,
      structName: value.structName,
      structFields: value.structFields,
      arrayElements: value.arrayElements,
      arrayInitializedCount: value.arrayInitializedCount,
      tupleElements: value.tupleElements,
      maxValue: value.maxValue,
      mutable: value.mutable,
      initialized: value.initialized,
    };
  }

  function snapshotContextValue(
    value: RuntimeValue
  ): RuntimeValue & { mutable: boolean; initialized: boolean } {
    return {
      ...snapshotRuntimeValue(value),
      mutable: value.mutable ?? false,
      initialized: value.initialized ?? true,
    };
  }

  function buildContextFromThisValue(baseValue: RuntimeValue, context: Context): Context {
    const derived = new Map(context);
    if (!baseValue.structFields) {
      return derived;
    }
    for (const [key, value] of baseValue.structFields) {
      derived.set(key, snapshotContextValue(value));
    }
    // Store a marker so we know this context came from a boundThis
    derived.set('$boundThis', snapshotContextValue(baseValue));
    return derived;
  }

  function updateThisFieldsInContext(
    targetName: string,
    fieldKeys: string[],
    sourceContext: Context,
    targetContext: Context
  ): void {
    const targetVar = targetContext.get(targetName);
    if (targetVar?.type?.kind === 'This' && targetVar.structFields) {
      const updatedFields = new Map(targetVar.structFields);
      for (const key of fieldKeys) {
        const updatedValue = sourceContext.get(key);
        if (updatedValue) {
          updatedFields.set(key, snapshotRuntimeValue(updatedValue));
        }
      }
      targetContext.set(targetName, { ...targetVar, structFields: updatedFields });
    }
  }

  function buildThisFunctionValue(
    baseValue: RuntimeValue,
    fieldName: string,
    functions: FunctionTable,
    bound: boolean = false
  ): RuntimeValue | null {
    if (baseValue.type?.kind !== 'This') {
      return null;
    }
    if (!functions.has(fieldName)) {
      return null;
    }
    const fnValue = buildFunctionPointerValue(fieldName, functions);
    if (bound) {
      const keys = baseValue.structFields ? Array.from(baseValue.structFields.keys()) : [];
      return {
        ...fnValue,
        boundThis: snapshotRuntimeValue(baseValue),
        boundThisFieldKeys: keys,
      };
    }
    return fnValue;
  }

  function buildBoundThisFunctionValue(
    baseValue: RuntimeValue,
    fieldName: string,
    functions: FunctionTable,
    boundThisRef?: string
  ): RuntimeValue | null {
    const fnValue = buildThisFunctionValue(baseValue, fieldName, functions, true);
    if (!fnValue) return null;
    if (boundThisRef) {
      return { ...fnValue, boundThisRef };
    }
    return fnValue;
  }

  function buildUnboundFunctionPointerValue(
    baseValue: RuntimeValue,
    fieldName: string,
    functions: FunctionTable
  ): RuntimeValue | null {
    return buildThisFunctionValue(baseValue, fieldName, functions, false);
  }

  function evaluateAssignmentValue(
    currentValue: number,
    op: string,
    rhs: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue {
    let valueToAssign = rhs;
    if (op !== '=') {
      valueToAssign = currentValue + op[0] + ' ' + rhs;
    }
    const newValueObj = processExprWithContext(valueToAssign, context, functions, structs);
    if (newValueObj.type?.kind === 'Bool') {
      throw new Error('cannot perform arithmetic on booleans');
    }
    return newValueObj;
  }

  function splitStructArgs(argStr: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (let i = 0; i < argStr.length; i++) {
      const ch = argStr[i];
      if ((ch === '(' || ch === '{' || ch === '[') && depth >= 0) {
        depth++;
        current += ch;
        continue;
      }
      if ((ch === ')' || ch === '}' || ch === ']') && depth > 0) {
        depth--;
        current += ch;
        continue;
      }
      if ((ch === ';' || ch === ',') && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    if (!parts.length && argStr.trim()) {
      parts.push(argStr.trim());
    }
    return parts;
  }

  // helper to evaluate an expression with optional variable context
  function resolveOperand(
    token: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue {
    if (token === 'true' || token === 'false') {
      return parseLiteralToken(token);
    }
    if (token === 'this' && !context.has('this')) {
      return buildThisValue(context);
    }
    const fieldAccessMatch = token.match(/^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)$/);
    if (fieldAccessMatch) {
      return processExprWithContext(token, context, functions, structs);
    }
    const arrayIndexTokenMatch = token.match(/^([a-zA-Z_]\w*)\s*\[\s*([+-]?\d+)\s*\]$/);
    if (arrayIndexTokenMatch) {
      const varName = arrayIndexTokenMatch[1];
      const index = Number(arrayIndexTokenMatch[2]);
      return resolveArrayElement(varName, index, context);
    }
    // Handle dereference operator
    if (token.startsWith('*')) {
      const ptrVar = ensurePointer(token.substring(1), context);
      const pointedVar = ensureVariable(ptrVar.refersTo, context);
      return {
        value: pointedVar.value,
        type: (ptrVar.type as { kind: 'Ptr'; pointsTo: Type; mutable: boolean }).pointsTo,
      };
    }
    // Handle mutable reference operator
    if (token.startsWith('&mut ')) {
      const varName = token.substring(5).trim();
      if (varName === 'this') {
        // Special case: &mut this creates a mutable reference to the current scope
        return {
          value: 0, // value is not used for pointers
          type: { kind: 'Ptr', pointsTo: { kind: 'This' }, mutable: true },
          refersTo: '$thisScope',
        };
      }
      const var_ = ensureVariable(varName, context);
      if (!var_.mutable) {
        throw new Error('cannot take mutable reference to immutable variable');
      }

      // Check for existing mutable borrow to the same variable
      for (const [, ptrVar] of context) {
        if (
          ptrVar.type?.kind === 'Ptr' &&
          ptrVar.refersTo === varName &&
          (ptrVar.type as any).mutable
        ) {
          throw new Error('cannot have multiple mutable references to the same variable');
        }
      }

      return {
        value: 0, // value is not used for pointers
        type: { kind: 'Ptr', pointsTo: var_.type || { kind: 'I', width: 32 }, mutable: true },
        refersTo: varName,
      };
    }
    // Handle immutable reference operator
    if (token.startsWith('&')) {
      const refTarget = token.substring(1);
      if (refTarget === 'this') {
        // Special case: &this creates a reference to the current scope
        return {
          value: 0, // value is not used for pointers
          type: { kind: 'Ptr', pointsTo: { kind: 'This' }, mutable: false },
          refersTo: '$thisScope',
        };
      }
      const var_ = ensureVariable(refTarget, context);
      return {
        value: 0, // value is not used for pointers
        type: { kind: 'Ptr', pointsTo: var_.type || { kind: 'I', width: 32 }, mutable: false },
        refersTo: refTarget,
      };
    }
    if (/^[a-zA-Z_]/.test(token)) {
      // variable reference
      if (!context.has(token)) {
        if (functions.has(token)) {
          return buildFunctionPointerValue(token, functions);
        }
        throw new Error('undefined variable: ' + token);
      }
      return context.get(token)!;
    }
    // literal
    return parseLiteralToken(token);
  }

  function evaluateExpression(
    expr: string,
    context: Context = new Map(),
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue {
    const tokens = expr.match(
      /true|false|"[^"]*"|'.'|(&mut\s+[a-zA-Z_]\w*)|([&*][a-zA-Z_]\w*)|([a-zA-Z_]\w*\s*\[\s*[+-]?\d+\s*\])|([+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)|(\bis\b|\|\||&&|==|!=|<=|>=|[+\-*/<>])|([a-zA-Z_]\w*(?:\s*\.\s*[a-zA-Z_]\w*)*)/g
    );
    if (!tokens || tokens.length === 0) {
      throw new Error('invalid expression');
    }

    if (tokens.length === 1) {
      // single operand (literal or variable)
      return resolveOperand(tokens[0], context, functions, structs);
    }

    if (tokens.length < 3 || tokens.length % 2 === 0) {
      throw new Error('invalid expression');
    }

    const operands: Array<RuntimeValue> = [];
    const operators: string[] = [];

    // extract operators first to check if they are all logical
    for (let i = 1; i < tokens.length; i += 2) {
      operators.push(tokens[i]);
    }
    const originalOperators = [...operators];
    const hasArithmeticOps = operators.some((op) => ['+', '-', '*', '/'].includes(op));
    const getPrevOperator = (tokenIndex: number, ops: string[]) => {
      const operatorIndex = tokenIndex / 2 - 1;
      return operatorIndex >= 0 ? ops[operatorIndex] : undefined;
    };

    for (let i = 0; i < tokens.length; i += 2) {
      // even indices are operands (literals or variables)
      const prevOp = getPrevOperator(i, operators);
      if (prevOp === 'is') {
        const typeToken = tokens[i].trim();
        const typeSuffix = tryParseSuffix(typeToken);
        if (!typeSuffix) {
          throw new Error('invalid type in is expression');
        }
        operands.push({ value: 0, type: typeSuffix });
        continue;
      }
      const opResult = resolveOperand(tokens[i], context, functions, structs);
      if (opResult.structFields) {
        throw new Error('cannot use struct value in expression');
      }
      if (tokens.length > 1 && opResult.type?.kind === 'Bool' && hasArithmeticOps) {
        throw new Error('cannot perform arithmetic on booleans');
      }
      operands.push(opResult);
    }

    // Helper to apply operators of a certain precedence
    function applyPass(
      ops: string[],
      handler: (left: RuntimeValue, op: string, right: RuntimeValue) => number | RuntimeValue
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
    function validateComparable(left: RuntimeValue, right: RuntimeValue, isEquality: boolean) {
      const leftKind = left.type?.kind || 'Numeric';
      const rightKind = right.type?.kind || 'Numeric';
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
      return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
    });

    // fourth pass: handle type checks (is)
    applyPass(['is'], (left, _op, right) => {
      const leftType = left.type || { kind: 'I', width: 32 };
      const rightType = right.type;
      if (!rightType) {
        throw new Error('invalid type in is expression');
      }
      isBooleanResult = true;
      const res = typeEqualsForValidation(leftType, rightType);
      return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
    });

    // fifth pass: handle equality operators (==, !=)
    applyPass(['==', '!='], (left, op, right) => {
      validateComparable(left, right, true);
      isBooleanResult = true;
      let res: boolean;
      // For pointer comparisons, check refersTo for identity
      if (left.type?.kind === 'Ptr' && right.type?.kind === 'Ptr') {
        res = left.refersTo === right.refersTo;
      } else {
        res = left.value === right.value;
      }
      if (op === '!=') res = !res;
      return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
    });

    // Helper to handle logical operators
    function applyLogicalPass(opStr: '&&' | '||') {
      applyPass([opStr], (left, op, right) => {
        if (left.type?.kind !== 'Bool' || right.type?.kind !== 'Bool') {
          throw new Error('logical operators only supported for booleans');
        }
        isBooleanResult = true;
        const res =
          op === '&&'
            ? left.value !== 0 && right.value !== 0
            : left.value !== 0 || right.value !== 0;
        return { value: res ? 1 : 0, type: { kind: 'Bool', width: 1 } };
      });
    }

    // fifth pass: handle logical AND (&&)
    applyLogicalPass('&&');

    // sixth pass: handle logical OR (||)
    applyLogicalPass('||');

    const finalResult = operands[0].value;
    const finalSuffix = operands[0].type;

    // find the widest suffix among all original operands (if any)
    let widestSuffix: Type | undefined;
    for (let i = 0; i < tokens.length; i += 2) {
      const prevOp = getPrevOperator(i, originalOperators);
      if (prevOp === 'is') {
        continue;
      }
      const op = resolveOperand(tokens[i], context, functions, structs);
      if (
        op.type &&
        op.type.kind !== 'Bool' &&
        op.type.kind !== 'Ptr' &&
        (!widestSuffix ||
          ('width' in op.type &&
            'width' in widestSuffix &&
            (op.type as any).width > (widestSuffix as any).width))
      ) {
        widestSuffix = op.type;
      }
    }

    // validate against the widest type if it's not a boolean result and it's numeric
    if (widestSuffix && !isBooleanResult && 'width' in widestSuffix) {
      validateValueAgainstSuffix(
        finalResult,
        widestSuffix.kind as 'U' | 'I' | 'Bool',
        (widestSuffix as any).width
      );
    }

    return { value: finalResult, type: finalSuffix || widestSuffix };
  }

  function evaluateStructLiteralAccess(
    expr: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue | null {
    const trimmed = expr.trim();
    const structRegex =
      /^([a-zA-Z_]\w*)(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*([\s\S]*?)\s*\}\s*(?:\.\s*([a-zA-Z_]\w*))?$/;
    const match = trimmed.match(structRegex);
    if (!match) return null;
    const structName = match[1];
    const typeArgsStr = match[2];
    const argsBody = match[3];
    const memberName = match[4];

    const structDef = structs.get(structName);
    if (!structDef) throw new Error('struct not defined: ' + structName);

    // Parse type arguments and create a type parameter substitution map
    const typeSubstitution = new Map<string, Type>();
    if (typeArgsStr) {
      const typeArgs = typeArgsStr.split(',').map((s) => s.trim());
      if (!structDef.typeParams || typeArgs.length !== structDef.typeParams.length) {
        throw new Error(
          'struct ' +
            structName +
            ' expects ' +
            (structDef.typeParams?.length || 0) +
            ' type arguments'
        );
      }
      for (let i = 0; i < typeArgs.length; i++) {
        const typeArg = parseStructFieldType(typeArgs[i]);
        if (!typeArg) throw new Error('invalid type argument: ' + typeArgs[i]);
        typeSubstitution.set(structDef.typeParams[i], typeArg);
      }
    } else if (structDef.typeParams && structDef.typeParams.length > 0) {
      throw new Error('struct ' + structName + ' requires type arguments');
    }

    const argParts = splitStructArgs(argsBody);
    if (argParts.length !== structDef.fields.length) {
      throw new Error(
        'struct ' +
          structName +
          ' expects ' +
          structDef.fields.length +
          ' values, got ' +
          argParts.length
      );
    }
    const fieldValues = new Map<string, RuntimeValue>();
    for (let i = 0; i < structDef.fields.length; i++) {
      const fieldDef = structDef.fields[i];
      const exprPart = argParts[i];
      const fieldValue = processExprWithContext(exprPart, context, functions, structs);

      // Resolve field type with generic substitution
      let resolvedFieldType = fieldDef.type;
      if (fieldDef.type.kind === 'Generic' && typeSubstitution.has(fieldDef.type.name)) {
        resolvedFieldType = typeSubstitution.get(fieldDef.type.name)!;
      }

      validateNarrowing(fieldValue.type, resolvedFieldType);
      if (
        resolvedFieldType.kind !== 'Ptr' &&
        resolvedFieldType.kind !== 'Void' &&
        'width' in resolvedFieldType
      ) {
        validateValueAgainstSuffix(
          fieldValue.value,
          resolvedFieldType.kind,
          resolvedFieldType.width
        );
      }
      fieldValues.set(fieldDef.name, fieldValue);
    }
    if (memberName) {
      const memberValue = fieldValues.get(memberName);
      if (!memberValue) {
        throw new Error('struct ' + structName + ' has no field: ' + memberName);
      }
      return memberValue;
    }
    return {
      value: 0,
      structName,
      structFields: fieldValues,
    };
  }

  function evaluateIfExpression(
    expr: string,
    context: Context,
    _functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue | null {
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

    const conditionResult = processExprWithContext(conditionExpr, context, _functions, structs);
    if (conditionResult.type?.kind !== 'Bool') {
      throw new Error('if condition must be boolean');
    }
    const trueResult = processExprWithContext(trueBranch, context, _functions, structs);
    const falseResult = processExprWithContext(falseBranch, context, _functions, structs);

    const normalizedSuffix = (res: RuntimeValue): Type => res.type || { kind: 'I', width: 32 };
    const trueSuffix = normalizedSuffix(trueResult);
    const falseSuffix = normalizedSuffix(falseResult);
    if (trueSuffix.kind !== falseSuffix.kind) {
      throw new Error('if branches must match types');
    }

    return conditionResult.value !== 0 ? trueResult : falseResult;
  }

  // Helper to merge block context changes back to parent context
  function mergeBlockContext(
    blockResult: { context: Context; declaredInThisBlock: Set<string> },
    parentContext: Context
  ): void {
    for (const [key, value] of blockResult.context) {
      if (!blockResult.declaredInThisBlock.has(key) && parentContext.has(key)) {
        parentContext.set(key, value);
      }
    }
  }

  function splitTypeAndInitializer(input: string): { typePart: string; exprPart?: string } {
    let result: { typePart: string; exprPart?: string } | undefined;
    forEachCharWithDepths(input, (ch, index, depths) => {
      if (ch === '=' && depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
        if (index + 1 < input.length && input[index + 1] === '>') {
          return;
        }
        result = {
          typePart: input.substring(0, index).trim(),
          exprPart: input.substring(index + 1).trim(),
        };
        return true;
      }
    });
    if (result) {
      return result;
    }
    return { typePart: input.trim() };
  }

  function parseLetStatement(stmt: string): {
    isMutable: boolean;
    varName: string;
    varType?: string;
    varExprStr?: string;
  } {
    const trimmed = stmt.trim();
    if (!trimmed.startsWith('let ')) {
      throw new Error('invalid let statement');
    }
    let rest = trimmed.substring(4).trim();
    let isMutable = false;
    if (rest.startsWith('mut ')) {
      isMutable = true;
      rest = rest.substring(4).trim();
    }

    const nameMatch = rest.match(/^([a-zA-Z_]\w*)/);
    if (!nameMatch) {
      throw new Error('invalid let statement');
    }
    const varName = nameMatch[1];
    rest = rest.substring(nameMatch[0].length).trim();

    let varType: string | undefined;
    let varExprStr: string | undefined;

    if (rest.startsWith(':')) {
      rest = rest.substring(1).trim();
      const split = splitTypeAndInitializer(rest);
      varType = split.typePart || undefined;
      if (split.exprPart !== undefined) {
        varExprStr = split.exprPart.trim();
      }
    } else if (rest.startsWith('=')) {
      varExprStr = rest.substring(1).trim();
    } else if (rest.length > 0) {
      throw new Error('invalid let statement');
    }

    return { isMutable, varName, varType, varExprStr };
  }

  function splitFunctionHeaderAndBody(input: string): { header: string; body: string } {
    let result: { header: string; body: string } | undefined;
    forEachCharWithDepths(input, (ch, index, depths) => {
      if (ch === '=' && index + 1 < input.length && input[index + 1] === '>') {
        if (depths.paren === 0 && depths.bracket === 0 && depths.brace === 0) {
          result = {
            header: input.substring(0, index).trim(),
            body: input.substring(index + 2).trim(),
          };
        }
      }
    });
    if (!result) {
      throw new Error('invalid function definition');
    }
    return result;
  }

  function parseFunctionDefinition(stmt: string): {
    name: string;
    genericsRaw?: string;
    paramsStr: string;
    returnTypeRaw?: string;
    body: string;
  } {
    const { header, body } = splitFunctionHeaderAndBody(stmt);
    const headerMatch = header.match(
      /^fn\s+([a-zA-Z_]\w*)\s*(?:<\s*([^>]+)\s*>)?\s*\(\s*(.*?)\s*\)\s*(?::\s*(.+))?$/
    );
    if (!headerMatch) {
      throw new Error('invalid function definition');
    }
    return {
      name: headerMatch[1],
      genericsRaw: headerMatch[2],
      paramsStr: headerMatch[3],
      returnTypeRaw: headerMatch[4]?.trim(),
      body,
    };
  }

  function parseTrailingCall(expr: string): { calleeExpr: string; argsStr: string } | null {
    const trimmed = expr.trim();
    if (!trimmed.endsWith(')')) return null;
    let depth = 0;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === ')') {
        depth++;
        continue;
      }
      if (ch === '(') {
        depth--;
        if (depth === 0) {
          const calleeExpr = trimmed.substring(0, i).trim();
          const argsStr = trimmed.substring(i + 1, trimmed.length - 1).trim();
          if (!calleeExpr) return null;
          return { calleeExpr, argsStr };
        }
      }
    }
    return null;
  }

  function evaluateNonVoidExpression(
    expr: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue {
    const valueObj = processExprWithContext(expr, context, functions, structs);
    if (valueObj.type?.kind === 'Void') {
      throw new Error('void function cannot return a value');
    }
    return valueObj;
  }

  // Helper to execute a function call with given arguments
  function executeFunctionCall(
    fnName: string,
    argsStr: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable,
    explicitTypeArgs?: Type[]
  ): RuntimeValue {
    const args = parseCallArguments(argsStr, context, functions, structs);
    return executeFunctionCallWithArgs(fnName, args, context, functions, structs, explicitTypeArgs);
  }

  function parseCallArguments(
    argsStr: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue[] {
    const args: RuntimeValue[] = [];
    if (!argsStr.trim()) {
      return args;
    }
    const argParts = splitTopLevelComma(argsStr);
    for (const argPart of argParts) {
      const argValue = processExprWithContext(argPart, context, functions, structs);
      args.push(argValue);
    }
    return args;
  }

  function parseExplicitTypeArgs(typeArgsStr?: string): Type[] | undefined {
    if (!typeArgsStr) return undefined;
    const parts = splitTopLevelComma(typeArgsStr);
    const types: Type[] = [];
    for (const part of parts) {
      const parsed = tryParseSuffix(part.trim());
      if (!parsed) {
        throw new Error('invalid type argument: ' + part.trim());
      }
      types.push(parsed);
    }
    return types.length ? types : undefined;
  }

  function executeFunctionCallWithArgs(
    fnName: string,
    args: RuntimeValue[],
    context: Context,
    functions: FunctionTable,
    structs: StructTable,
    explicitTypeArgs?: Type[]
  ): RuntimeValue {
    const fnDef = functions.get(fnName);
    if (!fnDef) {
      const nativeFn = currentNativeFunctions?.get(fnName);
      if (nativeFn) {
        return executeNativeFunction(nativeFn, args, context, explicitTypeArgs);
      }
      throw new Error('function not found: ' + fnName);
    }

    // Handle closure-style calls: if we have one extra argument that's a *This pointer,
    // use it to derive the context for the call
    let effectiveArgs = args;
    let derivedContext = context;
    let thisBindingName: string | undefined;
    let thisBindingFieldKeys: string[] | undefined;
    if (
      args.length === fnDef.params.length + 1 &&
      args[0].type?.kind === 'Ptr' &&
      args[0].type.pointsTo.kind === 'This'
    ) {
      // The first arg is a pointer to This - use its target as context
      const ptrArg = args[0];
      if (ptrArg.refersTo) {
        const targetVar = context.get(ptrArg.refersTo);
        if (targetVar?.type?.kind === 'This' && targetVar.structFields) {
          derivedContext = buildContextFromThisValue(targetVar, context);
          thisBindingName = ptrArg.refersTo;
          thisBindingFieldKeys = Array.from(targetVar.structFields.keys());
        }
      }
      effectiveArgs = args.slice(1);
    }

    if (effectiveArgs.length !== fnDef.params.length) {
      throw new Error(
        'function ' +
          fnName +
          ' expects ' +
          fnDef.params.length +
          ' arguments, got ' +
          effectiveArgs.length
      );
    }

    const genericMap = new Map<string, Type>();
    const resolveGenericType = (type: Type, argValue?: RuntimeValue): Type => {
      if (type.kind === 'Generic') {
        const existing = genericMap.get(type.name);
        if (existing) return existing;
        const inferred = argValue?.type || { kind: 'I', width: 32 };
        genericMap.set(type.name, inferred);
        return inferred;
      }
      return type;
    };

    const fnContext = new Map<string, RuntimeValue & { mutable: boolean; initialized: boolean }>(
      derivedContext
    );
    for (let i = 0; i < fnDef.params.length; i++) {
      const param = fnDef.params[i];
      const arg = effectiveArgs[i];

      const resolvedParamType = resolveGenericType(param.type, arg);
      validateNarrowing(arg.type, resolvedParamType);
      if (resolvedParamType.kind !== 'Ptr' && 'width' in resolvedParamType) {
        validateValueAgainstSuffix(arg.value, resolvedParamType.kind, resolvedParamType.width);
      }

      fnContext.set(param.name, {
        value: arg.value,
        type: resolvedParamType,
        mutable: false,
        initialized: true,
        refersTo: arg.refersTo,
        structName: arg.structName,
        structFields: arg.structFields,
        arrayElements: arg.arrayElements,
        arrayInitializedCount: arg.arrayInitializedCount,
      });
    }

    let bodyContent = fnDef.body;
    if (bodyContent.startsWith('{') && bodyContent.endsWith('}')) {
      bodyContent = bodyContent.substring(1, bodyContent.length - 1);
    }
    const bodyResult = processBlock(bodyContent, fnContext, functions, structs);
    const returnValue = bodyResult.result;

    mergeBlockContext(bodyResult, context);

    if (thisBindingName && thisBindingFieldKeys) {
      updateThisFieldsInContext(thisBindingName, thisBindingFieldKeys, derivedContext, context);
    }

    let resolvedReturnType = fnDef.returnType;
    if (resolvedReturnType && resolvedReturnType.kind === 'Generic') {
      resolvedReturnType = genericMap.get(resolvedReturnType.name);
    }

    if (!resolvedReturnType && !bodyResult.hasTrailingExpression) {
      resolvedReturnType = { kind: 'Void' };
    }

    if (resolvedReturnType) {
      if (returnValue.type?.kind === 'Bool' && resolvedReturnType.kind !== 'Bool') {
        throw new Error('cannot return boolean value from non-bool function');
      }
      validateNarrowing(returnValue.type, resolvedReturnType);
      if (
        resolvedReturnType.kind !== 'Ptr' &&
        resolvedReturnType.kind !== 'Void' &&
        'width' in resolvedReturnType
      ) {
        validateValueAgainstSuffix(
          returnValue.value,
          resolvedReturnType.kind,
          resolvedReturnType.width
        );
      }
    }

    return {
      value: returnValue.value,
      type: resolvedReturnType || returnValue.type,
      refersTo: returnValue.refersTo,
      refersToFn: returnValue.refersToFn,
      structName: returnValue.structName,
      structFields: returnValue.structFields,
      arrayElements: returnValue.arrayElements,
      arrayInitializedCount: returnValue.arrayInitializedCount,
      tupleElements: returnValue.tupleElements,
      maxValue: returnValue.maxValue,
    };
  }

  function executeNativeFunction(
    nativeFn: NativeFunctionDef,
    args: RuntimeValue[],
    context: Context,
    explicitTypeArgs?: Type[]
  ): RuntimeValue {
    const resolveParamValue = (name: string): number => {
      const index = nativeFn.paramNames.indexOf(name);
      if (index < 0) {
        throw new Error('native function missing parameter: ' + name);
      }
      return args[index]?.value ?? 0;
    };

    if (nativeFn.kind === 'new-array') {
      const expr = nativeFn.expr;
      const lengthMatch = expr.match(/^new\s+Array(?:<[^>]+>)?\s*\((.+)\)$/);
      if (!lengthMatch) {
        throw new Error('native function unsupported: ' + expr);
      }
      const lengthExpr = lengthMatch[1].trim();
      const lengthValue = /^[0-9]+$/.test(lengthExpr)
        ? Number(lengthExpr)
        : resolveParamValue(lengthExpr);
      const elementType =
        explicitTypeArgs && explicitTypeArgs.length > 0
          ? explicitTypeArgs[0]
          : ({ kind: 'I', width: 32 } as Type);
      const elements = new Array<RuntimeValue | undefined>(lengthValue).fill(undefined);
      const arrayType: Type = {
        kind: 'Array',
        elementType,
        length: lengthValue,
        initializedCount: 0,
      };
      const arrayName = ['$native_array_', nativeArrayCounter++].join('');
      context.set(arrayName, {
        value: 0,
        type: arrayType,
        mutable: false,
        initialized: true,
        arrayElements: elements,
        arrayInitializedCount: 0,
      });
      return {
        value: 0,
        type: { kind: 'Ptr', pointsTo: arrayType, mutable: false },
        refersTo: arrayName,
      };
    }

    if (nativeFn.kind === 'void') {
      return { value: 0, type: { kind: 'Void' } };
    }

    const literalResult = parseLiteralToken(nativeFn.expr);
    return {
      value: literalResult.value,
      type: literalResult.type,
      stringValue: literalResult.stringValue,
    };
  }

  // Helper to process an expression recursively through brackets and let blocks
  function processExprWithContext(
    expr: string,
    context: Context,
    functions: FunctionTable,
    structs: StructTable
  ): RuntimeValue {
    const structResult = evaluateStructLiteralAccess(expr, context, functions, structs);
    if (structResult) {
      return structResult;
    }
    const ifResult = evaluateIfExpression(expr, context, functions, structs);
    if (ifResult !== null) {
      return ifResult;
    }

    // Check for tuple literal: (expr1, expr2, ...)
    const trimmedExpr = expr.trim();
    if (trimmedExpr.startsWith('(') && trimmedExpr.endsWith(')')) {
      const inner = trimmedExpr.substring(1, trimmedExpr.length - 1);
      const parts = splitTopLevelComma(inner);
      if (parts.length > 1) {
        const tupleElements: RuntimeValue[] = [];
        const elementTypes: Type[] = [];
        for (const part of parts) {
          const elementValue = processExprWithContext(part, context, functions, structs);
          tupleElements.push(elementValue);
          elementTypes.push(elementValue.type || { kind: 'I', width: 32 });
        }
        return {
          value: 0,
          tupleElements,
          type: { kind: 'Tuple', elements: elementTypes },
        };
      }
    }

    if (trimmedExpr.startsWith('{')) {
      let depth = 0;
      let closePos = -1;
      for (let i = 0; i < trimmedExpr.length; i++) {
        if (trimmedExpr[i] === '{') {
          depth++;
        } else if (trimmedExpr[i] === '}') {
          depth--;
          if (depth === 0) {
            closePos = i;
            break;
          }
        }
      }
      if (closePos === trimmedExpr.length - 1 && depth === 0) {
        const blockContent = trimmedExpr.substring(1, closePos);
        const blockResult = processBlock(blockContent, context, functions, structs);
        mergeBlockContext(blockResult, context);
        return blockResult.result;
      }
    }

    // Check for array indexing on array literals: [..][index]
    const arrayIndexRegex = /^(.+)\s*\[\s*([+-]?\d+)\s*\]$/;
    const arrayIndexMatch = expr.trim().match(arrayIndexRegex);
    if (arrayIndexMatch) {
      const baseExpr = arrayIndexMatch[1].trim();
      const index = Number(arrayIndexMatch[2]);
      if (!baseExpr) {
        throw new Error('invalid array access');
      }
      if (baseExpr.startsWith('[') || baseExpr.startsWith('(') || baseExpr.endsWith(')')) {
        const baseValue = processExprWithContext(baseExpr, context, functions, structs);
        return resolveIndexedValue(baseValue, index, context);
      }
    }

    // Check for array literal: [elem1, elem2, ...]
    const arrayLiteralRegex = /^\[\s*(.*?)\s*\]$/;
    const arrayLitMatch = expr.trim().match(arrayLiteralRegex);
    if (arrayLitMatch) {
      const elementsStr = arrayLitMatch[1];
      if (!elementsStr) {
        throw new Error('empty array literal');
      }
      const elements: RuntimeValue[] = [];
      const elemParts = elementsStr.split(',').map((e) => e.trim());
      for (const elemPart of elemParts) {
        const elemVal = processExprWithContext(elemPart, context, functions, structs);
        elements.push(elemVal);
      }
      // Infer element type from first element
      let elementType = elements[0]?.type || { kind: 'I', width: 32 };
      // Return array as object with arrayElements and array suffix
      return {
        value: 0,
        arrayElements: elements,
        arrayInitializedCount: elements.length,
        type: {
          kind: 'Array',
          elementType,
          length: elements.length,
          initializedCount: elements.length,
        },
      };
    }

    // Helper to evaluate .length property on values
    function evaluateLengthProperty(
      value: RuntimeValue,
      valueContext?: Context
    ): RuntimeValue | null {
      const buildLengthResult = (len: number): RuntimeValue => {
        return { value: len, type: { kind: 'U', width: 64 } };
      };

      if (value.type?.kind === 'Str' && value.stringValue !== undefined) {
        return buildLengthResult(value.stringValue.length);
      }
      if (value.type?.kind === 'Ptr' && value.type.pointsTo.kind === 'Str') {
        if (value.stringValue !== undefined) {
          return buildLengthResult(value.stringValue.length);
        }
        if (value.refersTo && valueContext) {
          const targetVar = valueContext.get(value.refersTo);
          if (targetVar && targetVar.stringValue !== undefined) {
            return buildLengthResult(targetVar.stringValue.length);
          }
        }
      }
      if (value.type?.kind === 'Array') {
        return buildLengthResult(value.type.length);
      }
      return null;
    }

    // Check for struct field access through variable: variableName.fieldName or this.variableName
    const fieldAccessRegex = /^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)$/;
    const fieldAccessMatch = expr.trim().match(fieldAccessRegex);
    if (fieldAccessMatch) {
      const varName = fieldAccessMatch[1];
      const fieldName = fieldAccessMatch[2];

      // Special case: this.this returns the bound outer scope when available
      if (varName === 'this' && fieldName === 'this' && !context.has('this')) {
        const boundThis = context.get('$boundThis');
        if (boundThis?.type?.kind === 'This') {
          return snapshotRuntimeValue(boundThis);
        }
        return buildThisValue(context);
      }

      // Special case: this.x refers to variable x in the current scope
      if (varName === 'this' && !context.has('this')) {
        return ensureVariable(fieldName, context);
      }

      const varInfo = ensureVariable(varName, context);

      // Handle special .length property for strings and arrays
      if (fieldName === 'length') {
        const lengthResult = evaluateLengthProperty(varInfo, context);
        if (lengthResult !== null) {
          return lengthResult;
        }
        throw new Error('cannot access .length on non-string/non-array type');
      }

      if (fieldName === 'this' && varInfo.type?.kind === 'This') {
        return snapshotRuntimeValue(varInfo);
      }

      const boundFunctionValue = buildBoundThisFunctionValue(
        snapshotRuntimeValue(varInfo),
        fieldName,
        functions,
        varName
      );
      if (boundFunctionValue) {
        return boundFunctionValue;
      }

      // Special case: if varInfo is a pointer to This, dereference and access variable
      if (varInfo.type?.kind === 'Ptr' && varInfo.type.pointsTo.kind === 'This') {
        return ensureVariable(fieldName, context);
      }

      if (!varInfo.structFields) {
        throw new Error('variable ' + varName + ' is not a struct');
      }
      const fieldValue = varInfo.structFields.get(fieldName);
      if (!fieldValue) {
        throw new Error(
          'struct ' + (varInfo.structName || 'unknown') + ' has no field: ' + fieldName
        );
      }
      return fieldValue;
    }

    // Check for :: member access (unbound function pointer extraction): expr::fieldName
    const colonColonMatch = expr.trim().match(/^(.+)::([a-zA-Z_]\w*)$/);
    if (colonColonMatch) {
      const baseExpr = colonColonMatch[1].trim();
      const fieldName = colonColonMatch[2];
      const baseValue = processExprWithContext(baseExpr, context, functions, structs);
      const unboundFnPtr = buildUnboundFunctionPointerValue(baseValue, fieldName, functions);
      if (unboundFnPtr) {
        return unboundFnPtr;
      }
      throw new Error('cannot access ' + fieldName + ' via :: on non-This type');
    }

    // Check for field access on expression results: expr.fieldName
    const exprFieldMatch = expr.trim().match(/^(.+)\s*\.\s*([a-zA-Z_]\w*)$/);
    if (exprFieldMatch) {
      const baseExpr = exprFieldMatch[1].trim();
      const fieldName = exprFieldMatch[2];
      const baseValue = processExprWithContext(baseExpr, context, functions, structs);

      // Handle special .length property for strings and arrays
      if (fieldName === 'length') {
        const lengthResult = evaluateLengthProperty(baseValue, context);
        if (lengthResult !== null) {
          return lengthResult;
        }
        throw new Error('cannot access .length on non-string/non-array type');
      }

      if (fieldName === 'this' && baseValue.type?.kind === 'This') {
        return baseValue;
      }
      const boundFunctionValue = buildBoundThisFunctionValue(baseValue, fieldName, functions);
      if (boundFunctionValue) {
        return boundFunctionValue;
      }

      if (baseValue.type?.kind === 'Ptr' && baseValue.type.pointsTo.kind === 'This') {
        return ensureVariable(fieldName, context);
      }

      if (!baseValue.structFields) {
        throw new Error('expression is not a struct');
      }
      const fieldValue = baseValue.structFields.get(fieldName);
      if (!fieldValue) {
        throw new Error(
          'struct ' + (baseValue.structName || 'unknown') + ' has no field: ' + fieldName
        );
      }
      return fieldValue;
    }

    const trailingCall = parseTrailingCall(expr);
    if (trailingCall) {
      const { calleeExpr, argsStr } = trailingCall;
      if (calleeExpr.includes('.')) {
        // handled by method-style call
      } else if (!calleeExpr.match(/^[a-zA-Z_]\w*(?:\s*<\s*[^>]+\s*>)?$/)) {
        const calleeValue = processExprWithContext(calleeExpr, context, functions, structs);
        if (calleeValue.refersToFn) {
          if (calleeValue.boundThis) {
            const derivedContext = buildContextFromThisValue(calleeValue.boundThis, context);
            return executeFunctionCall(
              calleeValue.refersToFn,
              argsStr,
              derivedContext,
              functions,
              structs
            );
          }
          return executeFunctionCall(calleeValue.refersToFn, argsStr, context, functions, structs);
        }
        throw new Error('function not found: ' + calleeExpr);
      }
    }

    // Check for method-style calls: expr.methodName(args...)
    // Need to be careful not to match dots inside bracket expressions
    const methodCallMatch = expr.trim().match(/^(.+)\s*\.\s*([a-zA-Z_]\w*)\s*\(\s*(.*)\s*\)$/);
    if (methodCallMatch) {
      const baseExpr = methodCallMatch[1].trim();
      const fnName = methodCallMatch[2];
      const argsStr = methodCallMatch[3];

      // Check if base expression has balanced brackets
      let bracketDepth = 0;
      let isBalanced = true;
      for (let i = 0; i < baseExpr.length; i++) {
        if (baseExpr[i] === '(' || baseExpr[i] === '[' || baseExpr[i] === '{') {
          bracketDepth++;
        } else if (baseExpr[i] === ')' || baseExpr[i] === ']' || baseExpr[i] === '}') {
          bracketDepth--;
          if (bracketDepth < 0) {
            isBalanced = false;
            break;
          }
        }
      }
      if (bracketDepth !== 0) {
        isBalanced = false;
      }

      if (isBalanced && baseExpr !== 'this') {
        const baseValue = processExprWithContext(baseExpr, context, functions, structs);
        if (!functions.has(fnName)) {
          throw new Error('function not found: ' + fnName);
        }
        const fnDef = functions.get(fnName);
        if (!fnDef) throw new Error('function not found: ' + fnName);

        const hasThisParam = fnDef.params[0]?.name === 'this';
        if (!hasThisParam) {
          if (baseValue.type?.kind === 'This') {
            const derivedContext = buildContextFromThisValue(baseValue, context);
            const args = parseCallArguments(argsStr, derivedContext, functions, structs);
            const result = executeFunctionCallWithArgs(
              fnName,
              args,
              derivedContext,
              functions,
              structs
            );
            if (baseExpr.match(/^[a-zA-Z_]\w*$/) && baseValue.structFields) {
              for (const key of baseValue.structFields.keys()) {
                const updatedValue = derivedContext.get(key);
                if (updatedValue) {
                  baseValue.structFields.set(key, snapshotRuntimeValue(updatedValue));
                }
              }
              const targetVar = context.get(baseExpr);
              if (targetVar) {
                context.set(baseExpr, { ...targetVar, structFields: baseValue.structFields });
              }
            }
            return result;
          }
        } else {
          let receiverArg = baseValue;
          if (fnDef.params[0]?.type.kind === 'Ptr') {
            if (baseExpr.match(/^[a-zA-Z_]\w*$/)) {
              const receiverVar = ensureVariable(baseExpr, context);
              if (fnDef.params[0].type.mutable && !receiverVar.mutable) {
                throw new Error('cannot take mutable reference to immutable variable');
              }
              receiverArg = {
                value: 0,
                type: {
                  kind: 'Ptr',
                  pointsTo: receiverVar.type || { kind: 'I', width: 32 },
                  mutable: fnDef.params[0].type.mutable,
                },
                refersTo: baseExpr,
              };
            } else {
              throw new Error('cannot take reference to non-variable receiver');
            }
          }

          const args = [receiverArg, ...parseCallArguments(argsStr, context, functions, structs)];
          return executeFunctionCallWithArgs(fnName, args, context, functions, structs);
        }
      }
    }

    // Check for function calls: name() or name(arg1, arg2, ...)
    const functionCallRegex = /^([a-zA-Z_]\w*)\s*(?:<\s*([^>]+)\s*>)?\s*\(\s*(.*)\s*\)$/;
    const callMatch = expr.trim().match(functionCallRegex);
    if (callMatch) {
      const nameOrVar = callMatch[1];
      const explicitTypeArgs = callMatch[2];
      const callArgsStr = callMatch[3];
      const explicitTypes = parseExplicitTypeArgs(explicitTypeArgs);
      let fnName = nameOrVar;
      let boundThis: RuntimeValue | undefined;
      let boundThisInfo: RuntimeValue | undefined;

      // Check if this is a function pointer variable
      if (!functions.has(nameOrVar) && context.has(nameOrVar)) {
        const varInfo = context.get(nameOrVar);
        if (varInfo?.refersToFn) {
          fnName = varInfo.refersToFn;
          boundThis = varInfo.boundThis;
          boundThisInfo = varInfo;
        }
      }

      if (!functions.has(fnName) && !currentNativeFunctions?.has(fnName)) {
        throw new Error('function not found: ' + fnName);
      }

      if (boundThis) {
        const derivedContext = buildContextFromThisValue(boundThis, context);
        const result = executeFunctionCall(
          fnName,
          callArgsStr,
          derivedContext,
          functions,
          structs,
          explicitTypes
        );
        if (boundThisInfo?.boundThisRef && boundThis.structFields) {
          const fieldKeys =
            boundThisInfo.boundThisFieldKeys || Array.from(boundThis.structFields.keys());
          updateThisFieldsInContext(boundThisInfo.boundThisRef, fieldKeys, derivedContext, context);
        }
        return result;
      }
      return executeFunctionCall(fnName, callArgsStr, context, functions, structs, explicitTypes);
    }

    // Check for function calls through this notation: this.functionName()
    const thisFunctionCallRegex = /^this\s*\.\s*([a-zA-Z_]\w*)\s*\(\s*(.*)\s*\)$/;
    const thisCallMatch = expr.trim().match(thisFunctionCallRegex);
    if (thisCallMatch) {
      if (!functions.has(thisCallMatch[1])) {
        throw new Error('function not found: ' + thisCallMatch[1]);
      }
      return executeFunctionCall(thisCallMatch[1], thisCallMatch[2], context, functions, structs);
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

      if (closePos === -1) {
        const start = Math.max(0, openPos - 20);
        const end = Math.min(e.length, openPos + 30);
        const context = e.substring(start, end);
        const pointerPos = openPos - start;
        throw new Error(
          'mismatched ' +
            openChar +
            (openChar === '(' ? ')' : '}') +
            ': unmatched ' +
            openChar +
            ' at position ' +
            openPos +
            '\n  ' +
            context +
            '\n  ' +
            ' '.repeat(pointerPos) +
            '^'
        );
      }

      const content = e.substring(openPos + 1, closePos);
      let res: RuntimeValue;

      // Check if this is a block with expressions or assignments
      if (openChar === '{') {
        const blockResult = processBlock(content, context, functions, structs);
        res = blockResult.result;
        sawBlockReplacement = true;
        // Update parent context with changes from block
        mergeBlockContext(blockResult, context);
      } else {
        // Regular parenthesization - just evaluate the contents
        res = processExprWithContext(content, context, functions, structs);
      }

      let replacement = res.value.toString();
      if (res.type) {
        if (res.type.kind === 'Bool') {
          replacement = res.value === 1 ? 'true' : 'false';
        } else if (res.type.kind === 'Ptr') {
          // For pointers, we store the reference variable name, don't change the representation
          // The value is already the variable index or reference
          replacement = res.value.toString();
        } else if ('width' in res.type) {
          replacement += res.type.kind + res.type.width;
        }
      }
      e = e.substring(0, openPos) + replacement + e.substring(closePos + 1);
    }

    try {
      return evaluateExpression(e, context, functions, structs);
    } catch (err) {
      if (sawBlockReplacement && err instanceof Error && err.message === 'invalid expression') {
        const trimmed = e.trim();
        const match = trimmed.match(/^(true|false|[+-]?\d+(?:\.\d+)?(?:[A-Za-z]+\d*)?)\s+(.+)$/);
        if (match) {
          return evaluateExpression(match[2], context, functions, structs);
        }
      }
      throw err;
    }
  }

  // Helper to process a code block and return the final expression result along with updated context
  function processBlock(
    blockContent: string,
    parentContext: Context,
    functions: FunctionTable,
    structs: StructTable
  ): {
    result: RuntimeValue;
    context: Context;
    declaredInThisBlock: Set<string>;
    hasTrailingExpression: boolean;
  } {
    const context = new Map(parentContext);
    const declaredInThisBlock = new Set<string>();

    // Split by ';' but respect bracket boundaries
    const statements: string[] = [];
    let currentStmt = '';
    let bracketDepth = 0;
    const isIdentChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9_]/.test(ch);

    for (let i = 0; i < blockContent.length; i++) {
      const ch = blockContent[i];
      if (bracketDepth === 0 && blockContent.startsWith('fn ', i)) {
        const prev = i > 0 ? blockContent[i - 1] : undefined;
        if (!isIdentChar(prev) && currentStmt.trim()) {
          statements.push(currentStmt.trim());
          currentStmt = '';
        }
      }
      if (ch === '(' || ch === '{' || ch === '[') {
        bracketDepth++;
        currentStmt += ch;
      } else if (ch === ')' || ch === '}' || ch === ']') {
        bracketDepth--;
        currentStmt += ch;
      } else if (ch === ';' && bracketDepth === 0) {
        if (currentStmt.trim()) {
          statements.push(currentStmt.trim());
        }
        currentStmt = '';
      } else if (ch === '\n' && bracketDepth === 0) {
        const trimmed = currentStmt.trim();
        if (trimmed.startsWith('fn ') && trimmed.includes('=>')) {
          statements.push(trimmed);
          currentStmt = '';
        } else {
          currentStmt += ch;
        }
      } else {
        currentStmt += ch;
      }
    }

    let hasTrailingExpression = !!currentStmt.trim();
    if (hasTrailingExpression) {
      statements.push(currentStmt.trim());
    }

    const structNames = new Set<string>();
    let finalExpr = '';
    let lastProcessedValue: RuntimeValue | undefined;
    for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
      const stmt = statements[stmtIndex];
      if (stmt.startsWith('type ')) {
        const typeMatch = stmt.match(
          /^type\s+([a-zA-Z_]\w*)\s*=\s*(.+?)(?:\s+then\s+([a-zA-Z_]\w*))?$/
        );
        if (!typeMatch) throw new Error('invalid type alias');
        const aliasName = typeMatch[1];
        if (typeAliases.has(aliasName)) {
          throw new Error('type alias already defined: ' + aliasName);
        }
        const aliasTypeStr = typeMatch[2].trim();
        const dropFnName = typeMatch[3];
        const aliasSuffix = tryParseSuffix(aliasTypeStr);
        if (!aliasSuffix) throw new Error('invalid type alias');
        typeAliases.set(aliasName, { type: aliasSuffix, dropFn: dropFnName });
        continue;
      }
      if (stmt.startsWith('fn ')) {
        const fnMatch = parseFunctionDefinition(stmt);
        const fnName = fnMatch.name;
        const genericsRaw = fnMatch.genericsRaw;
        const paramsStr = fnMatch.paramsStr;
        const returnTypeRaw = fnMatch.returnTypeRaw;
        let fnBody = fnMatch.body;
        let remainder = '';
        if (fnBody.startsWith('{')) {
          let depth = 0;
          let closePos = -1;
          for (let i = 0; i < fnBody.length; i++) {
            if (fnBody[i] === '{') {
              depth++;
            } else if (fnBody[i] === '}') {
              depth--;
              if (depth === 0) {
                closePos = i;
                break;
              }
            }
          }
          if (closePos !== -1 && closePos < fnBody.length - 1) {
            remainder = fnBody.substring(closePos + 1).trim();
            fnBody = fnBody.substring(0, closePos + 1).trim();
          }
        }
        const generics = genericsRaw
          ? genericsRaw
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean)
          : [];
        if (new Set(generics).size !== generics.length) {
          throw new Error('duplicate generic parameter');
        }
        if (functions.has(fnName)) {
          throw new Error('function already defined: ' + fnName);
        }
        const returnTypeStr = returnTypeRaw ? returnTypeRaw.trim() : undefined;

        const params: Array<{ name: string; type: Type }> = [];
        const paramNames = new Set<string>();
        if (paramsStr.trim()) {
          const paramParts = paramsStr.split(',').map((p) => p.trim());
          for (const paramPart of paramParts) {
            const paramMatch = paramPart.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
            if (!paramMatch) throw new Error('invalid parameter');
            const paramName = paramMatch[1];
            if (paramNames.has(paramName)) {
              throw new Error('duplicate parameter name: ' + paramName);
            }
            const paramType = paramMatch[2].trim();

            let paramSuffix: Type | undefined;
            if (paramType.startsWith('*mut ')) {
              paramSuffix = parsePointerSuffix(paramType.substring(5).trim(), true);
            } else if (paramType.startsWith('*')) {
              paramSuffix = parsePointerSuffix(paramType.substring(1).trim(), false);
            } else {
              paramSuffix = tryParseSuffix(paramType);
            }
            if (!paramSuffix && generics.includes(paramType)) {
              paramSuffix = { kind: 'Generic', name: paramType };
            }
            if (!paramSuffix) throw new Error('invalid parameter type: ' + paramType);
            paramNames.add(paramName);
            params.push({ name: paramName, type: paramSuffix });
          }
        }

        let returnSuffix: Type | undefined;
        if (returnTypeStr) {
          if (returnTypeStr.startsWith('*mut ')) {
            returnSuffix = parsePointerSuffix(returnTypeStr.substring(5).trim(), true);
          } else if (returnTypeStr.startsWith('*')) {
            returnSuffix = parsePointerSuffix(returnTypeStr.substring(1).trim(), false);
          } else {
            returnSuffix = tryParseSuffix(returnTypeStr);
          }
          if (!returnSuffix && generics.includes(returnTypeStr)) {
            returnSuffix = { kind: 'Generic', name: returnTypeStr };
          }
          if (!returnSuffix) throw new Error('invalid return type: ' + returnTypeStr);
        }

        functions.set(fnName, {
          params,
          returnType: returnSuffix,
          generics,
          body: fnBody,
        });
        if (remainder) {
          statements.splice(stmtIndex + 1, 0, remainder);
        }
      } else if (stmt.startsWith('struct ')) {
        let remainder = stmt;
        while (remainder.startsWith('struct ')) {
          const structMatch = remainder.match(
            /^struct\s+([a-zA-Z_]\w*)(?:\s*<\s*([^>]+)\s*>)?\s*\{\s*([\s\S]*?)\s*\}\s*(?:;\s*)?/
          );
          if (!structMatch) throw new Error('invalid struct declaration');
          const structName = structMatch[1];
          const typeParamsStr = structMatch[2];
          const typeParams = typeParamsStr
            ? typeParamsStr.split(',').map((p) => p.trim())
            : undefined;
          if (structs.has(structName) || structNames.has(structName)) {
            throw new Error('struct already defined: ' + structName);
          }
          structNames.add(structName);
          const fieldNames = new Set<string>();
          const fieldDefs: Array<{ name: string; type: Type }> = [];
          const fields = structMatch[3].split(';');
          for (const field of fields) {
            const fieldTrimmed = field.trim();
            if (!fieldTrimmed) continue;
            const fieldMatch = fieldTrimmed.match(/^([a-zA-Z_]\w*)\s*:\s*([\s\S]+)$/);
            if (!fieldMatch) throw new Error('invalid struct field: ' + fieldTrimmed);
            const fieldName = fieldMatch[1];
            if (fieldNames.has(fieldName)) {
              throw new Error('duplicate struct field: ' + fieldName);
            }
            const fieldType = parseStructFieldType(fieldMatch[2]);
            if (!fieldType) {
              throw new Error('invalid struct field type: ' + fieldMatch[2].trim());
            }
            fieldNames.add(fieldName);
            fieldDefs.push({ name: fieldName, type: fieldType });
          }
          structs.set(structName, { fields: fieldDefs, typeParams });
          remainder = remainder.substring(structMatch[0].length).trim();
        }
        if (remainder) {
          statements.splice(stmtIndex + 1, 0, remainder);
        }
        continue;
      } else if (stmt.startsWith('object ')) {
        const nameMatch = stmt.match(/^object\s+([a-zA-Z_]\w*)\s*/);
        if (!nameMatch) {
          throw new Error('invalid object declaration');
        }
        const objectName = nameMatch[1];
        if (declaredInThisBlock.has(objectName)) {
          throw new Error('variable already declared: ' + objectName);
        }
        const braceStart = stmt.indexOf('{');
        const braceEnd = stmt.lastIndexOf('}');
        if (braceStart === -1 || braceEnd === -1 || braceEnd < braceStart) {
          throw new Error('invalid object declaration');
        }
        const body = stmt.substring(braceStart + 1, braceEnd);
        let remainder = stmt.substring(braceEnd + 1).trim();
        if (remainder.startsWith(';')) {
          remainder = remainder.substring(1).trim();
        }
        const objectContext = new Map<
          string,
          RuntimeValue & { mutable: boolean; initialized: boolean }
        >();
        const objectResult = processBlock(body, objectContext, functions, structs);

        const fields = new Map<string, RuntimeValue>();
        for (const [key, value] of objectResult.context) {
          if (!value.initialized) {
            continue;
          }
          fields.set(key, snapshotRuntimeValue(value));
        }

        context.set(objectName, {
          value: 0,
          type: { kind: 'This' },
          mutable: false,
          initialized: true,
          structName: objectName,
          structFields: fields,
        });
        declaredInThisBlock.add(objectName);

        if (remainder) {
          statements.splice(stmtIndex + 1, 0, remainder);
        }

        finalExpr = '';
        lastProcessedValue = undefined;
      } else if (stmt.startsWith('let ')) {
        // parse: let [mut] x [: Type] [= expr]
        // Type can be: U8, I32, Bool, *I32, *U16, etc.
        const parsedLet = parseLetStatement(stmt);
        const isMutable = parsedLet.isMutable;
        const varName = parsedLet.varName;
        if (declaredInThisBlock.has(varName)) {
          throw new Error('variable already declared: ' + varName);
        }
        const varType = parsedLet.varType; // undefined if no type specified
        const varExprStr = parsedLet.varExprStr;

        // evaluate the initialization expression if present
        let varValue = 0;
        let valSuffix: Type | undefined;
        let initialized = false;
        let refersTo: string | undefined;

        let structName: string | undefined;
        let structFields: Map<string, RuntimeValue> | undefined;
        let arrayElements: Array<RuntimeValue | undefined> | undefined;
        let arrayInitializedCount: number | undefined;
        let tupleElements: RuntimeValue[] | undefined;
        let refersToFn: string | undefined;
        let boundThis: RuntimeValue | undefined;
        let stringValue: string | undefined;

        // First, try to parse the declared type
        let declaredSuffix: Type | undefined;
        let maxValue: number | undefined;
        let normalizedVarType = varType;
        if (varType) {
          const constraintMatch = varType.match(/^(.+?)\s*<\s*([+-]?\d+)\s*$/);
          if (constraintMatch) {
            normalizedVarType = constraintMatch[1].trim();
            maxValue = Number(constraintMatch[2]);
            if (!Number.isInteger(maxValue)) {
              throw new Error('invalid type constraint');
            }
          }
        }
        if (normalizedVarType) {
          if (normalizedVarType === 'Bool') {
            declaredSuffix = { kind: 'Bool', width: 1 };
          } else if (normalizedVarType.startsWith('*mut ')) {
            declaredSuffix = parsePointerSuffix(normalizedVarType.substring(5).trim(), true);
          } else if (normalizedVarType.startsWith('[')) {
            declaredSuffix = tryParseSuffix(normalizedVarType);
          } else {
            // Try parsing as function pointer type or other general types first
            declaredSuffix = tryParseSuffix(normalizedVarType);
            if (!declaredSuffix) {
              // If that failed and it starts with *, try as pointer type
              if (normalizedVarType.startsWith('*')) {
                declaredSuffix = parsePointerSuffix(normalizedVarType.substring(1).trim(), false);
              } else {
                const typeMatch = normalizedVarType.match(/^([UI])(\d+)$/);
                if (typeMatch) {
                  const kind = typeMatch[1] as 'U' | 'I';
                  const width = Number(typeMatch[2]);
                  declaredSuffix = { kind, width };
                }
              }
            }
          }
        }

        // Handle function pointer assignment specially
        if (declaredSuffix?.kind === 'FnPtr' && varExprStr !== undefined) {
          const exprTrimmed = varExprStr.trim();
          // Check if varExprStr is just a function name (no parentheses)
          const fnNameMatch = exprTrimmed.match(/^([a-zA-Z_]\w*)$/);
          if (fnNameMatch) {
            const fnName = fnNameMatch[1];
            if (functions.has(fnName)) {
              // This is a function pointer assignment
              varValue = 0; // Function pointers have value 0
              valSuffix = declaredSuffix;
              refersToFn = fnName;
              initialized = true;
            } else {
              // Not a known function, try normal evaluation
              const varValueObj = evaluateNonVoidExpression(
                varExprStr,
                context,
                functions,
                structs
              );
              varValue = varValueObj.value;
              valSuffix = varValueObj.type;
              refersTo = varValueObj.refersTo;
              refersToFn = varValueObj.refersToFn;
              boundThis = varValueObj.boundThis;
              stringValue = varValueObj.stringValue;
              initialized = true;
            }
          } else {
            // Not a simple function name, try normal evaluation
            const varValueObj = evaluateNonVoidExpression(varExprStr, context, functions, structs);
            varValue = varValueObj.value;
            valSuffix = varValueObj.type;
            refersTo = varValueObj.refersTo;
            refersToFn = varValueObj.refersToFn;
            boundThis = varValueObj.boundThis;
            stringValue = varValueObj.stringValue;
            initialized = true;
          }
        } else if (varExprStr !== undefined) {
          const varValueObj = evaluateNonVoidExpression(varExprStr, context, functions, structs);
          const isArrayLiteral = varExprStr.trim().startsWith('[');
          if (varValueObj.type?.kind === 'Array' && !isArrayLiteral) {
            throw new Error('cannot copy arrays');
          }
          varValue = varValueObj.value;
          valSuffix = varValueObj.type;
          refersTo = varValueObj.refersTo;
          refersToFn = varValueObj.refersToFn;
          structName = varValueObj.structName;
          structFields = varValueObj.structFields;
          arrayElements = varValueObj.arrayElements;
          arrayInitializedCount = varValueObj.arrayInitializedCount;
          tupleElements = varValueObj.tupleElements;
          boundThis = varValueObj.boundThis;
          stringValue = varValueObj.stringValue;
          initialized = true;
        }

        // validate against the type only if specified
        if (declaredSuffix && initialized) {
          if (declaredSuffix.kind !== 'FnPtr') {
            validateNarrowing(valSuffix, declaredSuffix);
            if (
              declaredSuffix.kind !== 'Ptr' &&
              declaredSuffix.kind !== 'Array' &&
              'width' in declaredSuffix
            ) {
              validateValueAgainstSuffix(varValue, declaredSuffix.kind, declaredSuffix.width);
            }
            if (maxValue !== undefined) {
              if (declaredSuffix.kind !== 'U' && declaredSuffix.kind !== 'I') {
                throw new Error('invalid type constraint');
              }
              if (varValue >= maxValue) {
                throw new Error('value exceeds type constraint');
              }
            }
            if (declaredSuffix.kind === 'Array' && arrayElements) {
              if (arrayElements.length !== declaredSuffix.length) {
                throw new Error('array length mismatch');
              }
              if (arrayElements.length !== declaredSuffix.initializedCount) {
                throw new Error('array initialized count mismatch');
              }
              for (const element of arrayElements) {
                if (!element) {
                  throw new Error('array element not initialized');
                }
                const elementSuffix = element.type || { kind: 'I', width: 32 };
                validateNarrowing(elementSuffix, declaredSuffix.elementType);
                if (
                  declaredSuffix.elementType.kind !== 'Ptr' &&
                  declaredSuffix.elementType.kind !== 'Array' &&
                  'width' in declaredSuffix.elementType
                ) {
                  validateValueAgainstSuffix(
                    element.value,
                    declaredSuffix.elementType.kind,
                    declaredSuffix.elementType.width
                  );
                }
              }
            }
          }
        }

        if (!initialized && declaredSuffix?.kind === 'Array') {
          if (declaredSuffix.initializedCount > 0) {
            throw new Error('array requires initializer');
          }
          arrayElements = new Array(declaredSuffix.length).fill(undefined);
          arrayInitializedCount = 0;
        }

        if (
          initialized &&
          declaredSuffix?.kind === 'Array' &&
          arrayElements &&
          arrayInitializedCount === undefined
        ) {
          arrayInitializedCount = arrayElements.length;
        }

        const varInfo = {
          value: varValue,
          type: declaredSuffix || valSuffix || { kind: 'I', width: 32 },
          mutable: isMutable,
          initialized: initialized,
          refersTo: refersTo,
          refersToFn: refersToFn,
          boundThis: boundThis,
          structName: structName,
          structFields: structFields,
          arrayElements: arrayElements,
          arrayInitializedCount: arrayInitializedCount,
          tupleElements: tupleElements,
          stringValue: stringValue,
          maxValue: maxValue,
          dropFn: normalizedVarType ? getAliasDropFn(normalizedVarType) : undefined,
        };
        context.set(varName, varInfo);
        declaredInThisBlock.add(varName);

        finalExpr = '';
        lastProcessedValue = undefined;
      } else if (stmt.startsWith('while ')) {
        // while loop: while (condition) body
        const m = stmt.match(/^while\s*\(\s*(.+?)\s*\)\s*(.+)$/);
        if (!m) {
          finalExpr = stmt;
          lastProcessedValue = undefined;
          continue;
        }
        const conditionExpr = m[1];
        let bodyExpr = m[2].trim();

        // If body starts with {, extract just the bracketed part
        if (bodyExpr.startsWith('{')) {
          let depth = 0;
          let endPos = -1;
          for (let i = 0; i < bodyExpr.length; i++) {
            if (bodyExpr[i] === '{') depth++;
            else if (bodyExpr[i] === '}') depth--;
            if (depth === 0) {
              endPos = i;
              break;
            }
          }
          if (endPos !== -1) {
            bodyExpr = bodyExpr.substring(0, endPos + 1);
          }
        }

        // Execute while loop
        while (true) {
          const condObj = processExprWithContext(conditionExpr, context, functions, structs);
          if (condObj.type?.kind !== 'Bool') {
            throw new Error('while condition must be boolean');
          }
          if (!condObj.value) break; // condition is false
          // Execute body as a block statement to update context
          const bodyBlockResult = processBlock(bodyExpr, context, functions, structs);
          // Merge changes from body back into current context
          for (const [key, value] of bodyBlockResult.context) {
            if (context.has(key)) {
              context.set(key, value);
            }
          }
        }

        // Check if there's trailing content after the while body (for the final expression)
        const bodyEndInStmt = stmt.indexOf(bodyExpr) + bodyExpr.length;
        const trailing = stmt.substring(bodyEndInStmt).trim();
        finalExpr = trailing || stmt;
        lastProcessedValue = undefined;
      } else if (stmt.includes('=') && !stmt.startsWith('let ')) {
        // assignment: x = 100 or compound: x += 1, x -= 2, x *= 3, x /= 4 or *y = 100
        const recordAssignment = (
          varName: string,
          updatedVarInfo: RuntimeValue & { mutable: boolean; initialized: boolean }
        ) => {
          context.set(varName, updatedVarInfo);
          if (!declaredInThisBlock.has(varName) && parentContext.has(varName)) {
            parentContext.set(varName, updatedVarInfo);
          }
          finalExpr = stmt;
          lastProcessedValue = updatedVarInfo;
        };

        const ensureMutableVar = (varName: string) => {
          const varInfo = ensureVariable(varName, context);
          if (!varInfo.mutable && varInfo.initialized) {
            throw new Error('cannot assign to immutable variable: ' + varName);
          }
          return varInfo;
        };

        // First check if it's a dereferenced pointer assignment (*y = ...)
        const derefMatch = stmt.match(/^\*([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
        if (derefMatch) {
          const ptrName = derefMatch[1];
          const op = derefMatch[2];
          const varExprStr = derefMatch[3].trim();

          const ptrInfo = ensurePointer(ptrName, context);
          if (!(ptrInfo.type as { kind: 'Ptr'; pointsTo: Type; mutable: boolean }).mutable) {
            throw new Error('cannot assign through immutable pointer');
          }

          const targetVarName = ptrInfo.refersTo;
          const targetVarInfo = ensureVariable(targetVarName, context);
          if (!targetVarInfo.mutable) {
            throw new Error('cannot assign to immutable variable through pointer');
          }

          const newValueObj = evaluateAssignmentValue(
            targetVarInfo.value,
            op,
            varExprStr,
            context,
            functions,
            structs
          );
          const newValue = newValueObj.value;
          const newValSuffix = newValueObj.type;

          // validate against pointee type
          const ptrType = ptrInfo.type as { kind: 'Ptr'; pointsTo: Type; mutable: boolean };
          const pointeeType = ptrType.pointsTo;
          if (pointeeType) {
            validateNarrowing(newValSuffix, pointeeType);
            if (pointeeType.kind !== 'Ptr' && 'width' in pointeeType) {
              validateValueAgainstSuffix(newValue, pointeeType.kind, pointeeType.width);
            }
          }

          const updatedTargetInfo = { ...targetVarInfo, value: newValue, initialized: true };
          recordAssignment(targetVarName, updatedTargetInfo);
        } else {
          // Array element assignment: array[index] = value or array[index] += value
          const arrayAssignMatch = stmt.match(
            /^([a-zA-Z_]\w*)\s*\[\s*([+-]?\d+)\s*\]\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/
          );
          if (arrayAssignMatch) {
            const varName = arrayAssignMatch[1];
            const index = Number(arrayAssignMatch[2]);
            const op = arrayAssignMatch[3];
            const varExprStr = arrayAssignMatch[4].trim();

            const varInfo = ensureMutableVar(varName);
            if (varInfo.type?.kind !== 'Array') {
              throw new Error('variable ' + varName + ' is not an array');
            }
            const arrayLength = varInfo.type.length;
            const elements = varInfo.arrayElements || new Array(arrayLength).fill(undefined);
            if (index < 0 || index >= elements.length) {
              throw new Error('array index out of bounds');
            }

            const currentInitializedCount =
              varInfo.arrayInitializedCount ?? elements.filter((e) => e !== undefined).length;
            if (!elements[index] && index !== currentInitializedCount) {
              throw new Error('array elements must be initialized in order');
            }

            const currentElement = elements[index];
            if (op !== '=' && !currentElement) {
              throw new Error('array element not initialized');
            }

            const currentValue = currentElement ? currentElement.value : 0;
            const newValueObj = evaluateAssignmentValue(
              currentValue,
              op,
              varExprStr,
              context,
              functions,
              structs
            );

            const newValue = newValueObj.value;
            const newValSuffix = newValueObj.type || { kind: 'I', width: 32 };
            const elementType = varInfo.type.elementType;
            validateNarrowing(newValSuffix, elementType);
            if (
              elementType.kind !== 'Ptr' &&
              elementType.kind !== 'Array' &&
              'width' in elementType
            ) {
              validateValueAgainstSuffix(newValue, elementType.kind, elementType.width);
            }

            elements[index] = { value: newValue, suffix: newValSuffix };
            const newInitCount = currentElement
              ? currentInitializedCount
              : currentInitializedCount + 1;
            const updatedSuffix = {
              ...varInfo.type,
              initializedCount: newInitCount,
            };

            const updatedVarInfo = {
              ...varInfo,
              type: updatedSuffix,
              arrayElements: elements,
              arrayInitializedCount: newInitCount,
              initialized: true,
            };
            recordAssignment(varName, updatedVarInfo);
            continue;
          }
          // Regular variable assignment or this.x assignment or pointerToThis.x assignment
          let m = stmt.match(/^([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
          let varName: string;
          let op: string;
          let varExprStr: string;

          let shouldUpdateBoundThis = false;
          if (!m) {
            // Check for this.x assignment or pointerVar.x assignment
            const dotAssignMatch = stmt.match(
              /^([a-zA-Z_]\w*)\s*\.\s*([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/
            );
            if (!dotAssignMatch) {
              finalExpr = stmt;
              lastProcessedValue = undefined;
              continue;
            }

            const assignTarget = dotAssignMatch[1];
            const fieldName = dotAssignMatch[2];
            op = dotAssignMatch[3];
            varExprStr = dotAssignMatch[4].trim();
            if (assignTarget === 'this') {
              varName = fieldName;
              shouldUpdateBoundThis = true;
            } else {
              // Check if this is a pointer to This
              const ptrVarInfo = ensureVariable(assignTarget, context);
              if (
                ptrVarInfo.type?.kind === 'Ptr' &&
                ptrVarInfo.type.pointsTo.kind === 'This' &&
                ptrVarInfo.type.mutable
              ) {
                varName = fieldName;
                shouldUpdateBoundThis = true;
              } else {
                // Regular field assignment on a struct through a variable
                throw new Error('assignments to struct fields not yet supported');
              }
            }
          } else {
            varName = m[1];
            op = m[2];
            varExprStr = m[3].trim();
          }

          const varInfo = ensureMutableVar(varName);

          if (op !== '=' && varInfo.type?.kind === 'Bool') {
            throw new Error('cannot perform arithmetic on booleans');
          }

          const newValueObj = evaluateAssignmentValue(
            varInfo.value,
            op,
            varExprStr,
            context,
            functions,
            structs
          );
          const newValue = newValueObj.value;
          const newValSuffix = newValueObj.type;

          const isArrayLiteral = varExprStr.trim().startsWith('[');
          if (newValSuffix?.kind === 'Array' && !isArrayLiteral) {
            throw new Error('cannot copy arrays');
          }
          if (varInfo.maxValue !== undefined && newValue >= varInfo.maxValue) {
            throw new Error('value exceeds type constraint');
          }

          // validate against original type
          if (varInfo.type) {
            validateNarrowing(newValSuffix, varInfo.type);
            if (varInfo.type.kind !== 'Ptr' && 'width' in varInfo.type) {
              validateValueAgainstSuffix(newValue, varInfo.type.kind, varInfo.type.width);
            }
          }

          const updatedVarInfo = { ...varInfo, value: newValue, initialized: true };
          recordAssignment(varName, updatedVarInfo);
          if (shouldUpdateBoundThis) {
            const boundThis = context.get('$boundThis');
            if (boundThis?.type?.kind === 'This' && boundThis.structFields) {
              boundThis.structFields.set(varName, snapshotRuntimeValue(updatedVarInfo));
              context.set('$boundThis', boundThis);
              context.set('$boundThisDirty', {
                value: 1,
                type: { kind: 'Bool', width: 1 },
                mutable: false,
                initialized: true,
              });
            }
          }
        }
      } else {
        // Execute statement for side effects, or treat as final expression
        if (stmtIndex < statements.length - 1) {
          // Not the last statement - execute for side effects
          processExprWithContext(stmt, context, functions, structs);
          lastProcessedValue = undefined;
        } else {
          // Last statement - treat as final expression
          finalExpr = stmt;
          lastProcessedValue = undefined;
        }
      }
    }

    // Helper to call drop functions for variables going out of scope
    const callDropFunctions = () => {
      for (const varName of declaredInThisBlock) {
        const varInfo = context.get(varName);
        if (varInfo?.dropFn && varInfo.initialized) {
          const dropFn = functions.get(varInfo.dropFn);
          if (dropFn) {
            // Call drop function with variable value
            const fnContext = new Map<
              string,
              RuntimeValue & { mutable: boolean; initialized: boolean }
            >(context);
            if (dropFn.params.length === 1) {
              const param = dropFn.params[0];
              fnContext.set(param.name, {
                value: varInfo.value,
                type: varInfo.type,
                mutable: false,
                initialized: true,
                structName: varInfo.structName,
                structFields: varInfo.structFields,
                arrayElements: varInfo.arrayElements,
                arrayInitializedCount: varInfo.arrayInitializedCount,
                tupleElements: varInfo.tupleElements,
              });
              const bodyResult = processBlock(dropFn.body, fnContext, functions, structs);
              // Merge changes back to context (for closure updates)
              mergeBlockContext(bodyResult, context);
            }
          }
        }
      }
    };

    if (hasTrailingExpression && !finalExpr.trim() && !lastProcessedValue) {
      hasTrailingExpression = false;
    }

    if (!hasTrailingExpression || !finalExpr.trim()) {
      callDropFunctions();
      return { result: { value: 0 }, context, declaredInThisBlock, hasTrailingExpression };
    }

    if (lastProcessedValue) {
      callDropFunctions();
      return { result: lastProcessedValue, context, declaredInThisBlock, hasTrailingExpression };
    }

    callDropFunctions();
    return {
      result: processExprWithContext(finalExpr, context, functions, structs),
      context,
      declaredInThisBlock,
      hasTrailingExpression,
    };
  }

  // Check for top-level code (which can be a single expression or multiple statements)
  try {
    const functions: FunctionTable = new Map();
    const structs: StructTable = new Map();
    return processBlock(s, new Map(), functions, structs).result.value;
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

// Main REPL entry point
if (require.main === module) {
  try {
    const replInputs = buildReplInputs(process.cwd());
    const result = interpretAll(replInputs.inputs, replInputs.config, replInputs.nativeConfig);
    console.log(result);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

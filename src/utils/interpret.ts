import { interpretWithScope } from "../app";

export function interpret(input: string): number {
  return interpretWithScope(input, new Map(), new Map(), new Map());
}

function isIdentifierChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

function findImportedModules(code: string): string[] {
  const imports: string[] = [];
  let searchPos = 0;

  while (true) {
    const fromIndex = code.indexOf(" from ", searchPos);
    if (fromIndex === -1) {
      break;
    }

    searchPos = fromIndex + 6;
    let moduleNameStart = fromIndex + 6;
    while (
      moduleNameStart < code.length &&
      (code[moduleNameStart] === " " || code[moduleNameStart] === "\t")
    ) {
      moduleNameStart++;
    }

    if (moduleNameStart >= code.length) {
      break;
    }

    let moduleNameEnd = moduleNameStart;
    while (
      moduleNameEnd < code.length &&
      isIdentifierChar(code[moduleNameEnd])
    ) {
      moduleNameEnd++;
    }

    if (moduleNameEnd > moduleNameStart) {
      const moduleName = code.slice(moduleNameStart, moduleNameEnd);
      if (!imports.includes(moduleName)) {
        imports.push(moduleName);
      }
    }
  }

  return imports;
}

function findModuleConfig(
  moduleName: string,
  config: Map<string[], string>,
): string | undefined {
  for (const [key, value] of config.entries()) {
    if (key.length === 1 && key[0] === moduleName) {
      return value;
    }
  }
  return undefined;
}

function buildExecutionOrder(
  modulePath: string[],
  config: Map<string[], string>,
  visited: Set<string> = new Set(),
): string[][] {
  const order: string[][] = [];
  const pathStr = modulePath.join(":");

  if (visited.has(pathStr)) {
    return order;
  }
  visited.add(pathStr);

  const moduleName = modulePath[0];
  if (!moduleName) {
    return order;
  }

  const moduleCode = findModuleConfig(moduleName, config);
  if (!moduleCode) {
    return order;
  }

  const imports = findImportedModules(moduleCode);
  for (const importedModule of imports) {
    const importedOrder = buildExecutionOrder(
      [importedModule],
      config,
      visited,
    );
    order.push(...importedOrder);
  }

  order.push(modulePath);
  return order;
}

export function interpretAll(
  inputs: string[],
  config: Map<string[], string>,
): number {
  const executionOrder = buildExecutionOrder(inputs, config);

  // Shared typeMap to accumulate type definitions across modules
  const sharedTypeMap = new Map<string, number>();

  // First pass: execute all modules in isolated scopes to populate global functionDefs and typeMap
  for (const modulePath of executionOrder) {
    const moduleName = modulePath[0];
    if (moduleName) {
      const moduleCode = findModuleConfig(moduleName, config);
      if (moduleCode) {
        interpretWithScope(
          moduleCode,
          new Map(),
          sharedTypeMap,
          new Map(),
        );
      }
    }
  }

  // Second pass: execute main module with shared scope pointing to end result
  const scope = new Map<string, number>();
  const mutMap = new Map<string, boolean>();
  const visMap = new Map<string, boolean>();

  const mainModuleName = inputs[0];
  if (!mainModuleName) {
    return 0;
  }

  const mainCode = findModuleConfig(mainModuleName, config);
  if (!mainCode) {
    return 0;
  }

  return interpretWithScope(
    mainCode,
    scope,
    sharedTypeMap,
    mutMap,
    new Set(),
    new Set(),
    visMap,
  );
}

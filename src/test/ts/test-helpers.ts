import { expect } from "bun:test";
import {
  compileTuffToTS,
  compileTuffToTSWithModules,
  type SourceMap,
} from "../../main/ts/compile";

const transpiler = new Bun.Transpiler({});

export function expectValid(
  source: string,
  args: string[],
  expectedExitCode: number,
) {
  const compiled = compileTuffToTS(source);
  if (!compiled.isOk) {
    expect(compiled.error).toBeUndefined();
    return;
  }
  const tsCode = compiled.value;
  let rawJS: string;
  try {
    rawJS = transpiler.transformSync(tsCode);
  } catch (e) {
    expect(
      "Failed to transpile TS code: '" + tsCode + "'. Cause: " + e,
    ).toBeUndefined();
    return;
  }
  const wrappedJS =
    "let __ret__ = 0;let process = { exit(code) { __ret__ = code; } }; " +
    rawJS +
    "return __ret__;";
  let actualExitCode: number;
  try {
    actualExitCode = new Function("__args__", wrappedJS)(args);
  } catch (e) {
    expect(
      "Failed to execute transpiled JS. Generated: '" +
        wrappedJS +
        "'. Cause: " +
        e,
    ).toBeUndefined();
    return;
  }
  expect(actualExitCode).toBe(expectedExitCode);
}

export function expectInvalid(source: string) {
  const generated = compileTuffToTS(source);
  if (generated.isOk) {
    expect(
      "Expected compiler to invalidate but generated unexpected: '" +
        generated.value +
        "'",
    ).toBeUndefined();
  }
}

function transpileTSSource(source: string): string | undefined {
  try {
    return transpiler.transformSync(source);
  } catch (e) {
    expect(
      "Failed to transpile TS code: '" + source + "'. Cause: " + e,
    ).toBeUndefined();
    return undefined;
  }
}

function buildModuleSystemPrelude(): string {
  return (
    "let __ret__ = 0;" +
    "let process = { exit(code) { __ret__ = code; } };" +
    "const __moduleCache__ = {};" +
    "function require(namespace) {" +
    "if (__moduleCache__[namespace]) { return __moduleCache__[namespace]; }" +
    "const moduleFunc = __modules__[namespace];" +
    "if (!moduleFunc) { throw new Error('Module not found: ' + namespace); }" +
    "const moduleExports = {};" +
    "moduleFunc(moduleExports, require);" +
    "__moduleCache__[namespace] = moduleExports;" +
    "return moduleExports;" +
    "};" +
    "const __modules__ = {};"
  );
}

function buildModuleRegistrations(jsSourceMap: SourceMap): string {
  let code = "";
  for (const [namespace, source] of Object.entries(jsSourceMap)) {
    code +=
      '__modules__["' +
      namespace +
      '"] = function(exports, require) {' +
      source +
      "};";
  }
  return code;
}

function buildMainModuleCall(mainNamespace: string[]): string {
  const mainPath = mainNamespace.join(".");
  return (
    'const mainModule = require("' +
    mainPath +
    '");' +
    'if (mainModule && typeof mainModule.main === "function") {' +
    "mainModule.main(__args__);" +
    "}" +
    "return __ret__;"
  );
}

export function expectValidWithModules(
  mainNamespace: string[],
  sourceMap: SourceMap,
  args: string[],
  expectedExitCode: number,
) {
  const generatedSourceMap = compileTuffToTSWithModules(
    mainNamespace,
    sourceMap,
  );
  if (!generatedSourceMap.isOk) {
    expect(generatedSourceMap.error).toBeUndefined();
    return;
  }

  const tsSourceMap: SourceMap = generatedSourceMap.value;
  const jsSourceMap: SourceMap = {};

  for (const [namespace, source] of Object.entries(tsSourceMap)) {
    const rawJS = transpileTSSource(source);
    if (rawJS === undefined) return;
    jsSourceMap[namespace] = rawJS;
  }

  let totalJSCode = buildModuleSystemPrelude();
  totalJSCode += buildModuleRegistrations(jsSourceMap);
  totalJSCode += buildMainModuleCall(mainNamespace);

  let actualExitCode: number;
  try {
    actualExitCode = new Function("__args__", totalJSCode)(args);
  } catch (e) {
    expect(
      "Failed to execute transpiled JS. Generated: '" +
        totalJSCode +
        "'. Cause: " +
        e,
    ).toBeUndefined();
    return;
  }
  expect(actualExitCode).toBe(expectedExitCode);
}

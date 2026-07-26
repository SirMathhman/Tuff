import type {
  Result,
  CompileError,
  Expression,
  ModuleExportInfo,
  CheckCtx,
} from "./types";
import { errResult } from "./semantic-errors";
function resolveModuleName(obj: Expression | undefined): string | undefined {
  if (obj && obj.type === "Identifier") return (obj as { name: string }).name;
  if (obj && obj.type === "MemberExpression") {
    const me = obj as { object: Expression; field: string };
    if (me.object.type === "Identifier")
      return (me.object as { name: string }).name;
    if (me.object.type === "MemberExpression") {
      const inner = me.object as { object: Expression; field: string };
      if (inner.object.type === "Identifier")
        return (inner.object as { name: string }).name + "." + inner.field;
    }
  }
  return undefined;
}
function findExportedFunction(
  exports: ModuleExportInfo[],
  functionName: string,
): ModuleExportInfo | undefined {
  return exports.find((e) => e.isFunction && e.name === functionName);
}
export function lookupCrossModuleFn(
  callExpr: {
    functionName: string;
    object?: Expression;
    line: number;
    column: number;
  },
  ctx: CheckCtx,
): Result<ModuleExportInfo, CompileError> {
  const moduleName = resolveModuleName(callExpr.object);
  if (!moduleName) {
    return errResult(
      "Cannot resolve module for function call",
      "Module function calls require a module name.",
      "Use 'module.function(args)' syntax.",
      callExpr.line,
      callExpr.column,
    );
  }
  const moduleKey = moduleName.replace(/\./g, "::");
  const exports = ctx.moduleExports?.[moduleKey];
  if (!exports) {
    return errResult(
      "Use of undeclared module '" + moduleName + "'",
      "Module must be defined in the source map.",
      "Ensure the module exists and is accessible.",
      callExpr.line,
      callExpr.column,
    );
  }
  const fn = findExportedFunction(exports, callExpr.functionName);
  if (!fn) {
    return errResult(
      "Function '" +
        callExpr.functionName +
        "' not found in module '" +
        moduleName +
        "'",
      "Function must be exported from the module.",
      "Export the function with 'out fn' in the module.",
      callExpr.line,
      callExpr.column,
    );
  }
  return { isOk: true, value: fn };
}

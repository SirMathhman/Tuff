import { createDeclarationParser } from "./declaration-parser";
import {
  removeTypeSyntax,
  extractVarDeclarations,
  transformControlFlow,
} from "./transforms/syntax-transforms";
import {
  replaceBooleanLiterals,
  stripTypeAnnotationsAndValidate,
  convertStatementsToExpressions,
  transformCharLiterals,
} from "./transforms/syntax/literal-transforms";
import { transformStringIndexing } from "./transforms/syntax/string-transforms";
import { validateTypedArithmetic } from "./transforms/validation/type-arithmetic-validation";
import { transformStructInstantiation } from "./transforms/syntax/struct-transform";
import { transformObjectInstantiations } from "./transforms/syntax/object-instance-transform";
import {
  transformModules,
  transformModuleAccess,
} from "./transforms/entities/module-transforms";
import { transformObjects } from "./transforms/entities/object-transforms";
import {
  collectModuleMetadata,
  validateModuleAccess,
} from "./transforms/helpers/module-validation";
import { transformPointers } from "./transforms/pointers/pointer-transforms";
import { transformMethodCalls } from "./transforms/entities/method-transforms";
import { clearVariableTypes } from "./parsing/parser-utils";
import { validateFunctionCalls } from "./transforms/validation/function-call-validation";
import { validateStructInstantiation } from "./transforms/validation/struct-instantiation-validation";
import { preparePointerHandling } from "./compiler-utils";
import { transformDestructorScopes } from "./transforms/destructors/destructor-scopes";
import type { VariableInfo } from "./declaration-parser-helpers";

function finalizeExpression(expr: string): string {
  // If expression is empty, only whitespace, or only structural elements like (),
  // default to 0
  const trimmedExpr = expr.trim();
  if (
    !trimmedExpr ||
    trimmedExpr === "()" ||
    trimmedExpr === "();" ||
    trimmedExpr === ")"
  ) {
    return "0";
  }
  return expr;
}

function createTuffCompiler(source: string) {
  const variables: Map<string, VariableInfo> = new Map();
  return {
    compile(): string {
      clearVariableTypes();
      const parser = createDeclarationParser(source, variables);
      parser.parseDeclarations();
      validateFunctionCalls(source);
      validateStructInstantiation(source);
      const { sourceWithWrappedPointers, pointerTargets, arrayVars } =
        preparePointerHandling(source, variables);
      validateTypedArithmetic(sourceWithWrappedPointers);
      const moduleMetadata = collectModuleMetadata(sourceWithWrappedPointers);
      validateModuleAccess(sourceWithWrappedPointers, moduleMetadata);

      const objectNames = new Set<string>();
      for (const meta of moduleMetadata) {
        if (meta.type === "object") objectNames.add(meta.name);
      }

      const withObjects = transformObjects(sourceWithWrappedPointers);
      const withModules = transformModules(withObjects);
      const objectInst = transformObjectInstantiations(
        withModules,
        objectNames,
      );
      const withStructs = transformStructInstantiation(objectInst.source);
      const transformed = transformControlFlow(withStructs);
      const withDestructors = transformDestructorScopes(transformed);
      const js = removeTypeSyntax(withDestructors);
      const { expression, varDeclarations } = extractVarDeclarations(js);
      let expr = transformStringIndexing(expression, arrayVars);
      expr = transformCharLiterals(expr);
      expr = replaceBooleanLiterals(expr);
      expr = stripTypeAnnotationsAndValidate(expr);
      expr = transformModuleAccess(expr);
      expr = transformPointers(expr, pointerTargets);
      expr = transformMethodCalls(expr);
      expr = convertStatementsToExpressions(expr);
      expr = finalizeExpression(expr);

      const varDeclString =
        varDeclarations.length > 0 ? `var ${varDeclarations.join(", ")};` : "";

      const runtime = objectInst.needsRuntime
        ? "var __tuffObjectInstanceCache = new Map(); function __tuffObjectInstance(key) { var v = __tuffObjectInstanceCache.get(key); if (v !== undefined) return v; v = [0]; __tuffObjectInstanceCache.set(key, v); return v; }"
        : "";

      return `(function() { ${varDeclString} ${runtime} return (${expr}); })()`;
    },
  };
}

/**
 * Compile Tuff source code to JavaScript string
 * @param _source Tuff source code
 * @returns JavaScript code as a string
 */
export function compile(_source: string): string {
  const source = _source.trim();

  // Empty source compiles to empty script
  if (!source) {
    return "";
  }

  // Parse and compile the source
  const compiler = createTuffCompiler(source);
  return compiler.compile();
}

/**
 * Execute Tuff source code by compiling and evaluating
 * @param source Tuff source code
 * @returns The numeric result of execution
 */
export function execute(source: string): number {
  return evalImpl(compile(source));
}

export function evalImpl(js: string) {
  const result = eval(js);
  if (typeof result === "boolean") {
    return result ? 1 : 0;
  }
  return typeof result === "number" ? result : 0;
}

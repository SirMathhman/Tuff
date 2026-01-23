import { type Instruction, OpCode } from "../../core/vm";
import { type VariableContext } from "../../types/variable-types";
import { type FunctionContext } from "../../types/function-types";
import {
  allocateVariable,
  parseLetComponents,
  isReadExpressionPattern,
  adjustReadInstructions,
  buildLetStoreInstructions,
  extractExpressionType,
  extractIfBranchFunctionInfo,
} from "../../support/let-binding";
import {
  isReferenceOperator,
  extractReferenceTarget,
  findConditionParentheses,
} from "../../parsing/parser";
import {
  isFunctionDefinition,
  parseFunctionDefinition,
} from "../../parsing/function-parsing";

function determineResultAddress(
  exprCompile: Instruction[],
  exprPart: string,
): number {
  let resultAddress = 900;
  const lastInstruction = exprCompile[exprCompile.length - 1];
  if (lastInstruction && lastInstruction.opcode === OpCode.Halt) {
    resultAddress = lastInstruction.operand1;
  }
  if (isReadExpressionPattern(exprPart)) resultAddress = 903;
  return resultAddress;
}

function handleFunctionDefinitionBinding(
  exprPart: string,
  varName: string,
  typeAnnotation: string | undefined,
  context: VariableContext,
  mutable: boolean,
  functionContext: FunctionContext,
): Omit<LetExpressionResult, "instructions"> | undefined {
  const trimmedExpr = exprPart.trim();
  if (!isFunctionDefinition(trimmedExpr)) return undefined;

  const funcDef = parseFunctionDefinition(trimmedExpr);
  if (!funcDef) return undefined;

  const newFunctionContext: FunctionContext = [
    ...functionContext,
    {
      name: varName,
      parameters: funcDef.parameters,
      returnType: funcDef.returnType,
      body: funcDef.body,
    },
  ];

  const varType = typeAnnotation || extractExpressionType(exprPart, context);
  const { context: newContext } = allocateVariable(
    context,
    varName,
    varType,
    mutable,
    false,
    undefined,
    funcDef.body,
    funcDef.parameters,
  );

  return { newContext, newFunctionContext };
}

function parseDeclarationOnlyBinding(
  varName: string,
  typeAnnotation: string,
  context: VariableContext,
  functionContext: FunctionContext,
): LetExpressionResult {
  const { context: newContext } = allocateVariable(
    context,
    varName,
    typeAnnotation,
    true,
    true,
  );

  return {
    instructions: [],
    newContext,
    newFunctionContext: functionContext,
  };
}

function buildArrayOrScalarInstructions(
  exprCompile: Instruction[],
  varType: string | undefined,
  exprPart: string,
  address: number,
): Instruction[] {
  const isArray = varType && varType.startsWith("[");
  return isArray
    ? exprCompile.slice(0, -1)
    : buildLetStoreInstructions(
        adjustReadInstructions(exprCompile.slice(0, -1), exprPart),
        determineResultAddress(exprCompile, exprPart),
        address,
      );
}

function buildVariableAllocation(
  varName: string,
  exprPart: string,
  typeAnnotation: string | undefined,
  mutable: boolean,
  context: VariableContext,
): {
  varType: string | undefined;
  newContext: VariableContext;
  address: number;
  functionBody?: string;
  functionParameters?: { name: string; type: string }[];
} {
  const varType = typeAnnotation || extractExpressionType(exprPart, context);
  const trimmedExpr = exprPart.trim();
  const sourceArrayName = isReferenceOperator(trimmedExpr)
    ? extractReferenceTarget(trimmedExpr)
    : undefined;

  // Check if this is a reference to another function variable
  let functionBody: string | undefined;
  let functionParameters: { name: string; type: string }[] | undefined;

  // Check if expression is an if-expression that returns functions
  if (trimmedExpr.startsWith("if")) {
    const ifFuncInfo = extractIfBranchFunctionInfo(trimmedExpr, context);
    if (ifFuncInfo.functionBody && ifFuncInfo.functionParameters) {
      functionBody = ifFuncInfo.functionBody;
      functionParameters = ifFuncInfo.functionParameters;
    }
  } else if (!trimmedExpr.includes(" ") && !trimmedExpr.includes("(")) {
    // Simple identifier check for function variable reference
    const sourceBinding = context.find((b) => b.name === trimmedExpr);
    if (sourceBinding?.functionBody && sourceBinding?.functionParameters) {
      functionBody = sourceBinding.functionBody;
      functionParameters = sourceBinding.functionParameters;
    }
  }

  const { context: newContext, address } = allocateVariable(
    context,
    varName,
    varType,
    mutable,
    false,
    sourceArrayName,
    functionBody,
    functionParameters,
  );

  return { varType, newContext, address, functionBody, functionParameters };
}

function parseInitializedBinding(
  varName: string,
  exprPart: string,
  typeAnnotation: string | undefined,
  mutable: boolean,
  context: VariableContext,
  exprCompile: Instruction[],
  functionContext: FunctionContext,
): LetExpressionResult | undefined {
  // Check if this is a function definition being assigned
  const funcResult = handleFunctionDefinitionBinding(
    exprPart,
    varName,
    typeAnnotation,
    context,
    mutable,
    functionContext,
  );
  if (funcResult) {
    return {
      instructions: [],
      newContext: funcResult.newContext,
      newFunctionContext: funcResult.newFunctionContext,
    };
  }

  const { varType, newContext, address } = buildVariableAllocation(
    varName,
    exprPart,
    typeAnnotation,
    mutable,
    context,
  );

  const storeInstructions = buildArrayOrScalarInstructions(
    exprCompile,
    varType,
    exprPart,
    address,
  );

  return {
    instructions: [...storeInstructions],
    newContext,
    newFunctionContext: functionContext,
  };
}

function handleFunctionAssignment(
  exprPart: string,
  varName: string,
  typeAnnotation: string | undefined,
  context: VariableContext,
  mutable: boolean,
  functionContext: FunctionContext,
): LetExpressionResult | undefined {
  const funcResult = handleFunctionDefinitionBinding(
    exprPart,
    varName,
    typeAnnotation,
    context,
    mutable,
    functionContext,
  );
  return funcResult ? { instructions: [], ...funcResult } : undefined;
}

type CompileWithContextFn = (
  expr: string,
  ctx: VariableContext,
) =>
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined;

type LetExpressionResult = {
  instructions: Instruction[];
  newContext: VariableContext;
  newFunctionContext: FunctionContext;
};

function allocateFunctionVariable(
  varName: string,
  typeAnnotation: string | undefined,
  trimmed: string,
  mutable: boolean,
  context: VariableContext,
  functionBody: string,
  functionParameters: { name: string; type: string }[],
): VariableContext {
  const varType = typeAnnotation || extractExpressionType(trimmed, context);
  const { context: newContext } = allocateVariable(
    context,
    varName,
    varType,
    mutable,
    false,
    undefined,
    functionBody,
    functionParameters,
  );
  return newContext;
}

function handleIfExpressionFunctionBinding(
  trimmed: string,
  varName: string,
  typeAnnotation: string | undefined,
  mutable: boolean,
  context: VariableContext,
  functionContext: FunctionContext,
  compileWithContextFn: CompileWithContextFn,
): LetExpressionResult | undefined {
  const ifFuncInfo = extractIfBranchFunctionInfo(trimmed, context);
  if (!ifFuncInfo.functionBody || !ifFuncInfo.functionParameters) {
    return undefined;
  }

  const parens = findConditionParentheses(trimmed, 2);
  const conditionCompiled = parens
    ? compileWithContextFn(
        trimmed.substring(parens.start + 1, parens.end).trim(),
        context,
      )
    : undefined;

  const newContext = allocateFunctionVariable(
    varName,
    typeAnnotation,
    trimmed,
    mutable,
    context,
    ifFuncInfo.functionBody,
    ifFuncInfo.functionParameters,
  );

  return {
    instructions: conditionCompiled?.instructions.slice(0, -1) || [],
    newContext,
    newFunctionContext: functionContext,
  };
}

function parseExpressionPart(
  exprPart: string,
  varName: string,
  typeAnnotation: string | undefined,
  mutable: boolean,
  context: VariableContext,
  functionContext: FunctionContext,
  compileWithContextFn: CompileWithContextFn,
): LetExpressionResult | undefined {
  // Check if this is a function definition
  if (isFunctionDefinition(exprPart.trim())) {
    return handleFunctionAssignment(
      exprPart,
      varName,
      typeAnnotation,
      context,
      mutable,
      functionContext,
    );
  }

  // Special case: if-expression returning function references
  const trimmed = exprPart.trim();
  if (trimmed.startsWith("if")) {
    const result = handleIfExpressionFunctionBinding(
      trimmed,
      varName,
      typeAnnotation,
      mutable,
      context,
      functionContext,
      compileWithContextFn,
    );
    if (result) return result;
  }

  // For regular variable assignments, compile the expression
  const exprCompileResult = compileWithContextFn(exprPart, context);
  if (!exprCompileResult?.instructions.length) return undefined;

  return parseInitializedBinding(
    varName,
    exprPart,
    typeAnnotation,
    mutable,
    context,
    exprCompileResult.instructions,
    functionContext,
  );
}

export function parseLetExpression(
  source: string,
  compileWithContextFn: CompileWithContextFn,
  context: VariableContext,
  functionContext: FunctionContext,
): LetExpressionResult | undefined {
  if (!source.startsWith("let")) return undefined;

  const components = parseLetComponents(source);
  if (!components) return undefined;

  const { varName, exprPart, typeAnnotation, mutable } = components;

  // Handle declaration-only bindings (let x : Type;)
  if (exprPart === "") {
    if (!typeAnnotation) return undefined;
    return parseDeclarationOnlyBinding(
      varName,
      typeAnnotation,
      context,
      functionContext,
    );
  }

  return parseExpressionPart(
    exprPart,
    varName,
    typeAnnotation,
    mutable,
    context,
    functionContext,
    compileWithContextFn,
  );
}

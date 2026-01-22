import {
  type FunctionBinding,
  type FunctionContext,
} from "../types/function-types";
import { parseFunctionDefinition } from "../parsing/function-parsing";

export function extractFunctionDefinitions(source: string): FunctionContext {
  const functions: FunctionBinding[] = [];
  let remaining = source;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith("fn ")) break;

    const parsed = parseFunctionDefinition(remaining);
    if (!parsed) break;

    functions.push({
      name: parsed.name,
      parameters: parsed.parameters,
      returnType: parsed.returnType,
      body: parsed.body,
    });

    remaining = parsed.remaining;
  }

  return functions;
}

export function getRemainningAfterFunctions(source: string): string {
  let remaining = source;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith("fn ")) break;

    const parsed = parseFunctionDefinition(remaining);
    if (!parsed) break;

    remaining = parsed.remaining;
  }

  return remaining;
}

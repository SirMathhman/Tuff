import { registerAnonymousFunction } from "./anonymous-functions";
import { functionDefs } from "../functions";

// Track the most recently registered lambda from a function body
// Used when a function returns a lambda
let lastRegisteredLambdaName: string | undefined;

export function getLastRegisteredLambdaName(): string | undefined {
  return lastRegisteredLambdaName;
}

export function clearLastRegisteredLambdaName(): void {
  lastRegisteredLambdaName = undefined;
}

export function handleLambdaExpression(
  s: string,
  typeMap: Map<string, number>,
): number | undefined {
  const trimmed = s.trim();

  // Check if this looks like a lambda: starts with ( and contains =>
  if (!trimmed.startsWith("(") || !trimmed.includes("=>")) {
    return undefined;
  }

  // Find the => arrow to verify this is a lambda
  const arrowIdx = trimmed.indexOf("=>");
  if (arrowIdx === -1) return undefined;

  // Basic validation: should have matching parens before =>
  let parenCount = 0;
  for (let i = 0; i < arrowIdx; i++) {
    if (trimmed[i] === "(") parenCount++;
    else if (trimmed[i] === ")") parenCount--;
  }

  // If unbalanced before =>, this isn't a simple lambda
  if (parenCount !== 0) return undefined;

  // Try to register this as an anonymous function
  // Default to I32 return type if not specified
  const anonResult = registerAnonymousFunction(trimmed, typeMap, 32);

  if (!anonResult) return undefined;

  // Store the lambda name and register it
  lastRegisteredLambdaName = anonResult.name;
  functionDefs.set(anonResult.name, anonResult.def);

  // Return 1 to indicate a function value
  return 1;
}

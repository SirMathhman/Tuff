import type { BaseHandlerParams } from "../../utils/function/function-call-params";
import { isIdentifierChar } from "../../utils/helpers/char-utils";
import { createPointer } from "./pointer-operations";

// Global object instance storage: maps instance key (objName::fieldValues) to instance ID
const instanceCache = new Map<string, string>();
let instanceCounter = 0;

function parseObjectName(trimmed: string): { name: string; afterName: string } | undefined {
  let i = 0;
  while (i < trimmed.length && isIdentifierChar(trimmed[i])) {
    i++;
  }
  if (i === 0) return undefined;
  return {
    name: trimmed.slice(0, i),
    afterName: trimmed.slice(i).trim(),
  };
}

function findClosingBrace(afterName: string): number {
  let braceDepth = 0;
  for (let j = 0; j < afterName.length; j++) {
    if (afterName[j] === "{") braceDepth++;
    else if (afterName[j] === "}") {
      braceDepth--;
      if (braceDepth === 0) return j;
    }
  }
  return -1;
}

function createOrGetInstance(
  objectName: string,
  fieldsStr: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  interpreter: BaseHandlerParams["interpreter"],
): string {
  const instanceKey = `${objectName}::${fieldsStr}`;
  if (instanceCache.has(instanceKey)) {
    return instanceCache.get(instanceKey)!;
  }

  const instanceId = `__instance_${objectName}_${instanceCounter++}`;
  instanceCache.set(instanceKey, instanceId);

  const fieldAssignments = parseFieldAssignments(fieldsStr);
  for (const [fieldName, fieldValue] of fieldAssignments) {
    const evaluatedValue = interpreter(
      fieldValue,
      scope,
      typeMap,
      new Map(),
      new Set(),
      new Set(),
      new Map(),
    );
    scope.set(`${instanceId}.${fieldName}`, evaluatedValue);
  }
  return instanceId;
}

/**
 * Parse object instantiation pattern: ObjectName { field1: value1, field2: value2 }
 * Returns instance reference if successful, undefined otherwise
 */
export function handleObjectInstantiation(
  p: Pick<BaseHandlerParams, "s" | "scope" | "typeMap" | "interpreter">,
): number | undefined {
  const trimmed = p.s.trim();
  if (!trimmed.startsWith("&")) return undefined;

  const afterRef = trimmed.slice(1).trim();
  const parsed = parseObjectName(afterRef);
  if (!parsed) return undefined;

  const { name: objectName, afterName } = parsed;
  if (!afterName.startsWith("{")) return undefined;
  if (!p.typeMap?.has("__object__" + objectName)) return undefined;

  const endIdx = findClosingBrace(afterName);
  if (endIdx === -1) return undefined;

  const fieldsStr = afterName.slice(1, endIdx).trim();
  const instanceId = createOrGetInstance(
    objectName,
    fieldsStr,
    p.scope,
    p.typeMap,
    p.interpreter,
  );

  return createPointer(instanceId);
}

function parseFieldAssignments(fieldsStr: string): [string, string][] {
  const assignments: [string, string][] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < fieldsStr.length; i++) {
    const ch = fieldsStr[i];

    if ((ch === "," && depth === 0) || i === fieldsStr.length - 1) {
      if (i === fieldsStr.length - 1 && ch !== ",") current += ch;

      const trimmed = current.trim();
      if (trimmed) {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
          const fieldName = trimmed.slice(0, colonIdx).trim();
          const fieldValue = trimmed.slice(colonIdx + 1).trim();
          assignments.push([fieldName, fieldValue]);
        }
      }
      current = "";
    } else {
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
      current += ch;
    }
  }

  return assignments;
}

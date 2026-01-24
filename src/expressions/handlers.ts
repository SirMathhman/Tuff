export type Interpreter = (
  input: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
) => number;

export function handleIfExpression(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  if (s.indexOf("if ") !== 0) return undefined;
  const cIdx = s.indexOf(")");
  if (cIdx <= 0) return undefined;

  const cond = interpretWithScope(
    s.slice(4, cIdx),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  let elseIdx = -1;
  let ifDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = cIdx + 1; i < s.length; i++) {
    if (s[i] === "(") parenDepth++;
    else if (s[i] === ")") parenDepth--;
    else if (s[i] === "{") braceDepth++;
    else if (s[i] === "}") braceDepth--;
    else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      s.slice(i, i + 5) === " else"
    ) {
      if (ifDepth === 0) {
        elseIdx = i;
        break;
      }
      ifDepth--;
    } else if (
      parenDepth === 0 &&
      braceDepth === 0 &&
      s.slice(i, i + 3) === "if " &&
      (i === 0 || " \t\n".includes(s.charAt(i - 1)))
    ) {
      ifDepth++;
    }
  }

  if (elseIdx > 0) {
    const thenStr = s.slice(cIdx + 1, elseIdx).trim(),
      elseStr = s.slice(elseIdx + 6).trim();
    return cond !== 0
      ? interpretWithScope(
          thenStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        )
      : interpretWithScope(
          elseStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        );
  }
  const thenStr = s.slice(cIdx + 1).trim();
  if (cond !== 0) {
    return interpretWithScope(
      thenStr,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
    );
  }
  return 0;
}

export function handleVarAssignment(
  s: string,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpretWithScope: Interpreter,
): number | undefined {
  const eqIdx = s.indexOf("=");
  if (eqIdx <= 0) return undefined;

  // Check if this is a compound assignment (+=, -=, etc.) or regular assignment
  const prevChar = s[eqIdx - 1];
  let isCompound = false;
  let operator = "";

  if (
    prevChar === "+" ||
    prevChar === "-" ||
    prevChar === "*" ||
    prevChar === "/" ||
    prevChar === "!" ||
    prevChar === "<" ||
    prevChar === ">"
  ) {
    isCompound = true;
    operator = prevChar;
    // For compound assignment, the lhs is from 0 to eqIdx - 1
    // But we need to verify it's actually a compound operator before proceeding
    if (s[eqIdx + 1] === "=") {
      // This is ==, !=, <=, >= - not an assignment
      return undefined;
    }
  } else if (s[eqIdx + 1] === "=") {
    // This is ==, !=, <=, >=  or just = after something
    return undefined;
  }

  const lhs = isCompound
    ? s.slice(0, eqIdx - 1).trim()
    : s.slice(0, eqIdx).trim();

  if (!scope.has(lhs)) return undefined;

  const semiIdx = s.indexOf(";", eqIdx);
  if (!mutMap.has(lhs)) throw new Error(`variable '${lhs}' is immutable`);
  
  // If no semicolon, treat the entire rest as the RHS (for function bodies)
  const rhsEnd = semiIdx === -1 ? s.length : semiIdx;

  let newValue = interpretWithScope(
    s.slice(eqIdx + 1, rhsEnd).trim(),
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );

  // Handle compound assignment
  if (isCompound) {
    const currentValue = scope.get(lhs)!;
    switch (operator) {
      case "+":
        newValue = currentValue + newValue;
        break;
      case "-":
        newValue = currentValue - newValue;
        break;
      case "*":
        newValue = currentValue * newValue;
        break;
      case "/":
        if (newValue === 0) throw new Error("divide by 0");
        newValue = Math.floor(currentValue / newValue);
        break;
      default:
        return undefined;
    }
  }

  scope.set(lhs, newValue);
  if (unmutUninitializedSet.has(lhs)) {
    unmutUninitializedSet.delete(lhs);
    mutMap.delete(lhs);
  }
  
  // Only process rest if there was a semicolon
  if (semiIdx === -1) {
    return newValue;
  }
  
  const rest = s.slice(semiIdx + 1).trim();
  if (rest === "") {
    return newValue;
  }
  return interpretWithScope(
    rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}

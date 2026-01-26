export function validateParamReferences(
  paramsStr: string,
  _fnName: string,
  variables: Map<string, Record<string, unknown>>,
): void {
  const paramParts = paramsStr.split(",");
  for (const part of paramParts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx !== -1) {
      const paramName = part.slice(0, colonIdx).trim();
      if (paramName && variables.has(paramName)) {
        throw new Error(
          `Parameter '${paramName}' shadows an existing variable`,
        );
      }
    }
  }
}

export function throwInvalidReferenceTarget(restAfterAmpersand: string): never {
  throw new Error(
    `invalid: can only take reference of variable names, got: &${restAfterAmpersand}`,
  );
}

export function throwCannotCreateMutablePointerToImmutableVariable(
  varName: string,
): never {
  throw new Error(
    `cannot create mutable pointer to immutable variable '${varName}'`,
  );
}

export function throwCannotAssignNonPointerToPointerType(
  pointerType: string,
): never {
  throw new Error(
    `cannot assign non-pointer value to pointer type '${pointerType}'`,
  );
}

export function throwCannotAssignToImmutablePointer(
  pointerName?: string,
): never {
  if (pointerName) {
    throw new Error(`cannot assign to immutable pointer '${pointerName}'`);
  }
  throw new Error("cannot assign to immutable pointer");
}

export function throwPointerTypeMismatch(
  refTarget: string,
  actualType: string | undefined,
  expectedType: string,
): never {
  throw new Error(
    `type mismatch: cannot create pointer to '${refTarget}' of type ${actualType || "unknown"}, expected ${expectedType}`,
  );
}

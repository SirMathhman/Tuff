export class ReturnValue extends Error {
  public readonly __isReturnValue = true;
  constructor(public value: unknown) {
    super();
    Object.setPrototypeOf(this, ReturnValue.prototype);
  }
}

export function isReturnValue(e: unknown): boolean {
  return typeof e === "object" && e !== null && "__isReturnValue" in e;
}

/**
 * Result type for error handling without throw statements
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Success variant of Result
 */
export class Ok<T> {
  constructor(readonly value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<never> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Ok(fn(this.value));
  }

  mapErr<F>(): Result<T, F> {
    return this;
  }

  getOrThrow(): T {
    return this.value;
  }
}

/**
 * Error variant of Result
 */
export class Err<E> {
  constructor(readonly error: E) {}

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }

  map<U>(): Result<U, E> {
    return this;
  }

  mapErr<F>(fn: (error: E) => F): Result<never, F> {
    return new Err(fn(this.error));
  }

  getOrThrow(): never {
    if (typeof this.error === "string") {
      // eslint-disable-next-line no-restricted-syntax
      throw new Error(this.error);
    }
    // eslint-disable-next-line no-restricted-syntax
    throw this.error;
  }
}

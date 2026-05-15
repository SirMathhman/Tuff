export class Ok<T> {
  readonly value: T;
  constructor(value: T) {
    this.value = value;
  }
}

export class Err<E> {
  readonly error: E;
  constructor(error: E) {
    this.error = error;
  }
}

export type Result<T, E> = Ok<T> | Err<E>;

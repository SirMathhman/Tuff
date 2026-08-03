export class TuffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class LexError extends TuffError {}
export class ParseError extends TuffError {}
export class RuntimeError extends TuffError {}
export class TypeError extends RuntimeError {}

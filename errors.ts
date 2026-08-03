export class TuffError extends Error {
  constructor(
    message: string,
    public readonly position?: number
  ) {
    super(message);
    this.name = "TuffError";
  }
}

export class LexError extends TuffError {
  constructor(message: string, position?: number) {
    super(message, position);
    this.name = "LexError";
  }
}

export class ParseError extends TuffError {
  constructor(message: string, position?: number) {
    super(message, position);
    this.name = "ParseError";
  }
}

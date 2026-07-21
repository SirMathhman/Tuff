// ── Position ───────────────────────────────────────────────────────────────

export interface Position {
  line: number;
  col: number;
}

// ── Token ──────────────────────────────────────────────────────────────────

export interface Token {
  text: string;
  pos: Position;
}

// ── Error Types ────────────────────────────────────────────────────────────

export class TuffError extends Error {
  public loc?: Position;

  constructor(message: string, loc?: Position) {
    super(message);
    this.name = this.constructor.name;
    this.loc = loc;
  }
}

export class ParseError extends TuffError {}

export class TypeError extends TuffError {}

export class RuntimeError extends TuffError {}

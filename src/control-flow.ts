export class Break extends Error {}
export class Continue extends Error {}

export class Yield extends Error {
  constructor(public value: number) {
    super("yield");
  }
}

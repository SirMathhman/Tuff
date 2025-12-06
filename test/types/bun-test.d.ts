declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void): void;
  export function expect(actual: any): any;
  export function beforeAll(fn: () => void): void;
  export function afterAll(fn: () => void): void;
}

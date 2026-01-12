// Public entrypoint: keep this module path stable for consumers/tests.
// The implementation is split into smaller modules under `src/interpreter/`
// to satisfy lint constraints (e.g., max-lines-per-file).
export { interpret } from "./interpreter/interpret";
export type { Env, EnvItem } from "./interpreter/types";

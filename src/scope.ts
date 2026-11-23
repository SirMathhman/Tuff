// A plain value: a number or a boolean.
export type Operand = number | boolean;

// A declared variable. `id` names its slot in the value table. `mutable` is
// true only for `let mut`.
export interface Variable {
  id: number;
  mutable: boolean;
}

// A value that points at another variable's slot. `mutable` is true for `&mut`.
export interface Reference {
  target: number;
  mutable: boolean;
}

// What a variable slot holds: a number, a boolean, or a reference to another slot.
export type Value = Operand | Reference;

// The state at one point of the source. `names` maps visible names to their
// variables, including those of enclosing blocks. `own` holds the names declared
// by the current block. `cells` is the value table, keyed by variable id. `nextId`
// is the id for the next declared variable.
export interface Scope {
  names: ReadonlyMap<string, Variable>;
  own: ReadonlySet<string>;
  cells: ReadonlyMap<number, Value>;
  nextId: number;
}

export function rootScope(): Scope {
  return {
    names: new Map<string, Variable>(),
    own: new Set<string>(),
    cells: new Map<number, Value>(),
    nextId: 0,
  };
}

// A block's scope starts with every variable of the enclosing scope and no
// declarations of its own.
export function childScope(outer: Scope): Scope {
  return {
    names: outer.names,
    own: new Set<string>(),
    cells: outer.cells,
    nextId: outer.nextId,
  };
}

// The scope of the enclosing block after the block `inner` has closed. Assignments
// made inside the block are kept. The block's own variables go out of scope.
export function closeScope(outer: Scope, inner: Scope): Scope {
  return {
    names: outer.names,
    own: outer.own,
    cells: inner.cells,
    nextId: inner.nextId,
  };
}

// The name of an enclosing variable that holds a reference to one of the
// variables `inner` declares, or undefined if there is none. Such a reference
// would dangle once the block closes.
export function findEscape(outer: Scope, inner: Scope): string | undefined {
  const ownIds = new Set<number>(
    [...inner.own].flatMap((name) => {
      const variable = inner.names.get(name);
      return variable === undefined ? [] : [variable.id];
    }),
  );
  for (const [name, variable] of outer.names) {
    const cell = inner.cells.get(variable.id);
    if (
      cell !== undefined &&
      typeof cell === "object" &&
      ownIds.has(cell.target)
    ) {
      return name;
    }
  }
  return undefined;
}

// Returns a new scope with `name` declared in this block, holding `value`.
export function declare(
  scope: Scope,
  name: string,
  mutable: boolean,
  value: Value,
): Scope {
  const id = scope.nextId;
  return {
    names: new Map<string, Variable>([
      ...scope.names,
      [name, { id, mutable }] as const,
    ]),
    own: new Set<string>([...scope.own, name]),
    cells: new Map<number, Value>([...scope.cells, [id, value] as const]),
    nextId: id + 1,
  };
}

// Returns a new scope where the slot `id` holds `value`.
export function setCell(scope: Scope, id: number, value: Value): Scope {
  return {
    ...scope,
    cells: new Map<number, Value>([...scope.cells, [id, value] as const]),
  };
}

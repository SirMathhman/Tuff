/**
 * Declarative assignment parser - configuration-driven approach.
 * Eliminates duplicated regex matching patterns.
 */

export interface AssignmentFlags {
  isDeref: boolean;
  isDeclOnly: boolean;
}

export interface AssignmentTarget {
  thisField?: { fieldName: string };
  indexed?: { indexExpr: string };
}

export interface AssignmentParts {
  flags: AssignmentFlags;
  name: string;
  op: string | undefined;
  rhs: string;
  target?: AssignmentTarget;
}

interface AssignmentPatternConfig {
  name: string;
  pattern: RegExp;
  mapper: (match: RegExpMatchArray) => AssignmentParts;
}

/**
 * Factory helpers to reduce duplication in mapper functions
 */
// eslint-disable-next-line max-params
function makeMapper(
  isDeref: boolean,
  nameIdx: number,
  opIdx: number | undefined,
  rhsIdx: number,
  targetType?: "thisField" | "indexed"
) {
  return (m: RegExpMatchArray): AssignmentParts => {
    const base = {
      flags: { isDeref, isDeclOnly: false },
      name: m[nameIdx],
      op: opIdx !== undefined ? m[opIdx] : undefined,
      rhs: m[rhsIdx].trim(),
    };

    if (targetType === "thisField") {
      return { ...base, target: { thisField: { fieldName: m[nameIdx] } } };
    }
    if (targetType === "indexed") {
      return { ...base, target: { indexed: { indexExpr: m[2].trim() } } };
    }
    return base;
  };
}

/**
 * All assignment patterns in order of precedence (most specific first)
 */
const ASSIGNMENT_PATTERNS: AssignmentPatternConfig[] = [
  // this.field compound assignment: this.x += expr
  {
    name: "thisFieldCompound",
    // eslint-disable-next-line no-useless-escape
    pattern: /^this\s*\.\s*([a-zA-Z_]\w*)\s*([+\-*\/%])=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, 2, 3, "thisField"),
  },
  // this.field assignment: this.x = expr
  {
    name: "thisField",
    pattern: /^this\s*\.\s*([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, undefined, 2, "thisField"),
  },
  // Deref compound assignment: *x += expr
  {
    name: "derefCompound",
    // eslint-disable-next-line no-useless-escape
    pattern: /^\*\s*([a-zA-Z_]\w*)\s*([+\-*\/%])=\s*([\s\S]+)$/,
    mapper: makeMapper(true, 1, 2, 3),
  },
  // Deref assignment: *x = expr
  {
    name: "deref",
    pattern: /^\*\s*([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/,
    mapper: makeMapper(true, 1, undefined, 2),
  },
  // Deref declaration-only: *x : type
  {
    name: "derefDeclOnly",
    pattern: /^\*\s*([a-zA-Z_]\w*)\s*:\s*([\s\S]+)$/,
    mapper: makeMapper(true, 1, undefined, 2),
  },
  // Function pointer assignment: (*fn) = expr
  {
    name: "functionPtr",
    pattern: /^\(\*([a-zA-Z_]\w*)\)\s*=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, undefined, 2),
  },
  // Indexed compound assignment: arr[i] += expr
  {
    name: "indexedCompound",
    pattern:
      /^([a-zA-Z_]\w*)\s*\[\s*([\s\S]+?)\s*\]\s*([+\-*/%])=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, 3, 4, "indexed"),
  },
  // Indexed assignment: arr[i] = expr
  {
    name: "indexed",
    pattern: /^([a-zA-Z_]\w*)\s*\[\s*([\s\S]+?)\s*\]\s*=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, undefined, 3, "indexed"),
  },
  // Compound assignment: x += expr
  {
    name: "compound",
    pattern: /^([a-zA-Z_]\w*)\s*([+\-*/%])=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, 2, 3),
  },
  // Simple assignment: x = expr
  {
    name: "simple",
    pattern: /^([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/,
    mapper: makeMapper(false, 1, undefined, 2),
  },
];

/**
 * Extract assignment parts using declarative pattern matching
 */
export function extractAssignmentParts(
  stmt: string
): AssignmentParts | undefined {
  for (const config of ASSIGNMENT_PATTERNS) {
    const m = stmt.match(config.pattern);
    if (m) {
      return config.mapper(m);
    }
  }
  return undefined;
}

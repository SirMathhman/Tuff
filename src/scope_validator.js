// Scope validation utilities — range building and ref info collection.
import { intBounds } from "./types";

// Build initial ranges Map from varTypes (each typed variable gets its type bounds).
export function buildRanges(varTypes) {
  const ranges = new Map();
  for (const [name, vType] of varTypes) {
    if (intBounds.has(vType)) {
      const b = intBounds.get(vType);
      ranges.set(name, { min: b.min, max: b.max });
    }
  }
  return ranges;
}

// Collect ref-related info from AST nodes into provided sets/map.
export function collectRefInfo(stmts) {
  const refTargetVars = new Set();
  const refHolderVars = new Set();
  const refTargetArrayVars = new Set();
  const arrayRefHolders = new Set();
  const sliceViewHolders = new Map();

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ref" && node.expr?.type === "varref") {
      refTargetVars.add(node.expr.name);
    }
    const isLetLike = node.type === "let" || node.type === "out_let";
    if (
      isLetLike &&
      (node.init?.type === "array" || node.init?.type === "index")
    ) {
      refTargetArrayVars.add(node.name);
    }
    if (isLetLike && node.init?.type === "ref") {
      refHolderVars.add(node.name);
      if (
        node.init.expr?.type === "varref" &&
        refTargetArrayVars.has(node.init.expr.name)
      ) {
        arrayRefHolders.add(node.name);
      }
      if (
        node.init.expr?.type === "slice" &&
        node.init.expr.target?.type === "varref"
      ) {
        const baseName = node.init.expr.target.name;
        const startOffset =
          node.init.expr.from?.type === "numlit"
            ? Number(node.init.expr.from.value)
            : 0;
        arrayRefHolders.add(node.name);
        sliceViewHolders.set(node.name, { baseVar: baseName, startOffset });
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object") walk(child);
    }
  }

  stmts.forEach(walk);
  return {
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  };
}

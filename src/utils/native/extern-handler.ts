import type { StatementContext } from "../statement-context";
import { handleUseStatement } from "../use-statement";

export function handleExternStatement(
  remaining: string,
  ctx: StatementContext,
): number | undefined {
  // extern use { ... } from module; - same as regular use
  if (remaining.startsWith("use ")) {
    return handleUseStatement(remaining.slice(4), ctx);
  }

  // extern fn name(...) : Type; - skip (just type declaration)
  if (remaining.startsWith("fn ")) {
    const semicolonIndex = remaining.indexOf(";");
    if (semicolonIndex !== -1) {
      const rest = remaining.slice(semicolonIndex + 1).trim();
      return rest
        ? ctx.interpreter(
            rest,
            ctx.scope,
            ctx.typeMap,
            ctx.mutMap,
            ctx.uninitializedSet,
            ctx.unmutUninitializedSet,
            ctx.visMap,
          )
        : 0;
    }
    return 0;
  }

  return undefined;
}

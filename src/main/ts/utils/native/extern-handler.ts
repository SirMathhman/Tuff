import {
  interpretAfterSemicolon,
  type StatementContext,
} from "../statement-context";
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
      return interpretAfterSemicolon(remaining, semicolonIndex, ctx);
    }
    return 0;
  }

  return undefined;
}

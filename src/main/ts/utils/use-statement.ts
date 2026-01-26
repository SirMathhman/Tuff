import {
  interpretAfterSemicolon,
  interpretRest,
  type StatementContext,
} from "./statement-context";

export function handleUseStatement(
  remaining: string,
  ctx: StatementContext,
): number | undefined {
  if (!remaining.includes(" from ")) return undefined;
  const fromIndex = remaining.indexOf(" from ");
  const beforeFrom = remaining.slice(0, fromIndex).trim();
  const semicolonIndex = remaining.indexOf(";");
  if (semicolonIndex === -1) return undefined;
  if (beforeFrom.startsWith("{") && beforeFrom.endsWith("}")) {
    return interpretAfterSemicolon(remaining, semicolonIndex, ctx);
  }
  if (beforeFrom.length === 0) return undefined;
  const afterFrom = remaining.slice(fromIndex + 6).trim();
  const moduleNameEnd = afterFrom.indexOf(";");
  const moduleName = afterFrom.slice(0, moduleNameEnd).trim();
  if (moduleName.length === 0) return undefined;
  ctx.scope.set(beforeFrom, 1);
  ctx.typeMap.set("__module__" + beforeFrom, moduleName as unknown as number);
  return interpretRest(remaining.slice(semicolonIndex + 1), ctx);
}

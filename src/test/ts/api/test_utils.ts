import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prebuiltSelfhostUrl(relPath: string): string {
  return pathToFileURL(resolve("selfhost", "prebuilt", relPath)).toString();
}

export function normalizeNewlines(s: string): string {
  return String(s).replace(/\r\n/g, "\n");
}

export type DiagLike = { msg: string; help?: string | null | undefined };

export function diagListToText(diags: DiagLike[]): string {
  return (diags ?? []).map((d) => `${d.msg}\n${d.help ?? ""}`).join("\n");
}

export function combinedDiagText(r: {
  diagnostics?: string | null | undefined;
  errors?: DiagLike[] | null | undefined;
  warnings?: DiagLike[] | null | undefined;
}): string {
  return [String(r.diagnostics ?? ""), diagListToText(r.errors ?? [])]
    .join("\n")
    .trim();
}

export function combinedWarnText(r: {
  warnings?: DiagLike[] | null | undefined;
}): string {
  return diagListToText(r.warnings ?? []).trim();
}

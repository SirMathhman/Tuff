export type CompileError = {
  kind: "parse" | "type" | "emit";
  location: { line: number; column: number };
  message: string;
  fix?: string;
};

export type CompileResult =
  | { ok: true; value: string }
  | { ok: false; error: CompileError };

export function isCompileError(v: unknown): v is CompileError {
  return (
    typeof v === "object" &&
    v !== null &&
    "kind" in v &&
    ((v as CompileError).kind === "parse" ||
      (v as CompileError).kind === "type" ||
      (v as CompileError).kind === "emit")
  );
}

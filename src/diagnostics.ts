export type Severity = "error" | "warning";

export type SourceSpan = {
  filePath: string;
  start: number;
  end: number;
  line: number;
  col: number;
};

export type Diagnostic = {
  severity: Severity;
  message: string;
  span?: SourceSpan;
};

export class Diagnostics {
  private readonly list: Diagnostic[] = [];

  error(message: string, span?: SourceSpan) {
    this.list.push({ severity: "error", message, span });
  }

  warning(message: string, span?: SourceSpan) {
    this.list.push({ severity: "warning", message, span });
  }

  get all(): readonly Diagnostic[] {
    return this.list;
  }

  get hasErrors(): boolean {
    return this.list.some((d) => d.severity === "error");
  }
}

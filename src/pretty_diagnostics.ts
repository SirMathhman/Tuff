import type { Diagnostic, SourceSpan } from "./diagnostics";

export type FormatDiagnosticOptions = {
  contextLines?: number;
};

function computeLineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
}

function getLineText(src: string, lineStarts: number[], line: number): string {
  const idx = Math.max(1, line) - 1;
  const start = lineStarts[idx] ?? 0;
  const end = lineStarts[idx + 1] ?? src.length;
  // drop trailing newline
  const raw = src.slice(start, end);
  return raw.endsWith("\n") ? raw.slice(0, -1) : raw;
}

function padLeft(s: string, width: number): string {
  if (s.length >= width) return s;
  return " ".repeat(width - s.length) + s;
}

function caretLine(col: number, lineNoWidth: number): string {
  const safeCol = Math.max(1, col);
  return `${" ".repeat(lineNoWidth)} | ${" ".repeat(safeCol - 1)}^`;
}

function header(
  span: SourceSpan | undefined,
  severity: string,
  message: string
) {
  if (!span) return `${severity}: ${message}`;
  return `${span.filePath}:${span.line}:${span.col} ${severity}: ${message}`;
}

/**
 * Formats a single diagnostic into a human-friendly error message with a code frame.
 *
 * Note: `source` should be the text for `diag.span.filePath`.
 */
export function formatDiagnostic(
  diag: Diagnostic,
  source?: string,
  opts: FormatDiagnosticOptions = {}
): string {
  const severity = diag.severity;
  const h = header(diag.span, severity, diag.message);
  if (!diag.span || source === undefined) return h;

  const span = diag.span;
  const contextLines = opts.contextLines ?? 0;
  const lineStarts = computeLineStarts(source);
  const lineNo = Math.max(1, span.line);
  const startLine = Math.max(1, lineNo - contextLines);
  const endLine = Math.min(lineStarts.length, lineNo + contextLines);
  const lineNoWidth = String(endLine).length;

  const lines: string[] = [h];
  for (let ln = startLine; ln <= endLine; ln++) {
    const txt = getLineText(source, lineStarts, ln);
    lines.push(`${padLeft(String(ln), lineNoWidth)} | ${txt}`);
    if (ln === lineNo) lines.push(caretLine(span.col, lineNoWidth));
  }
  return lines.join("\n");
}

export function formatDiagnostics(
  diags: readonly Diagnostic[],
  sourceByFilePath: Record<string, string>,
  opts: FormatDiagnosticOptions = {}
): string {
  return diags
    .map((d) => {
      const src = d.span ? sourceByFilePath[d.span.filePath] : undefined;
      return formatDiagnostic(d, src, opts);
    })
    .join("\n\n");
}

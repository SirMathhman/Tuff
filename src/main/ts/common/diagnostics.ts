import { Span } from "./span.js";

export enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
    Hint
}

export interface Diagnostic {
    severity: DiagnosticSeverity;
    message: string;
    span?: Span;
}

export class DiagnosticReporter {
    private diagnostics: Diagnostic[] = [];

    report(diagnostic: Diagnostic) {
        this.diagnostics.push(diagnostic);
        this.printDiagnostic(diagnostic);
    }

    private printDiagnostic(diagnostic: Diagnostic) {
        const severityStr = DiagnosticSeverity[diagnostic.severity].toUpperCase();
        let message = `[${severityStr}] ${diagnostic.message}`;
        
        if (diagnostic.span) {
            const { start, sourceFile } = diagnostic.span;
            message = `${sourceFile}:${start.line}:${start.column} - ${message}`;
        }
        
        if (diagnostic.severity === DiagnosticSeverity.Error) {
            console.error(message);
        } else {
            console.log(message);
        }
    }

    hasErrors(): boolean {
        return this.diagnostics.some(d => d.severity === DiagnosticSeverity.Error);
    }

    getDiagnostics(): Diagnostic[] {
        return this.diagnostics;
    }
}

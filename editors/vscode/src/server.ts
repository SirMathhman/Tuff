import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
  DefinitionParams,
  Location,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

// Tuff compiler interface types
interface DiagInfo {
  line: number;
  col: number;
  start: number;
  end: number;
  msg: string;
  help: string;
}

interface LineCol {
  line: number;
  col: number;
}

interface DefLocation {
  found: boolean;
  defStart: number;
  defEnd: number;
  defFile: string;
}

// Dynamically import the Tuff compiler modules
let tuffcLib: {
  lsp_check_file: (src: string, filePath: string) => boolean;
  lsp_get_errors: () => DiagInfo[];
  lsp_get_warnings: () => DiagInfo[];
  lsp_line_col: (src: string, offset: number) => LineCol;
  lsp_find_definition: (
    src: string,
    offset: number,
    filePath: string
  ) => DefLocation;
} | null = null;

let prebuiltPathFromClient: string | undefined;

// TypeScript compiled to CommonJS will downlevel `import()` to `require()`,
// which cannot load ESM `.mjs` modules. Use native dynamic import via Function.
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  "specifier",
  "return import(specifier)"
) as any;

function isProbablyDirectoryPath(p: string): boolean {
  // A best-effort heuristic. If it has an extension, assume it is a file.
  // If it ends with a path separator, it is a directory.
  if (p.endsWith(path.sep) || p.endsWith("/")) return true;
  return path.extname(p) === "";
}

function candidateCompilerPaths(input: string): string[] {
  // Accept either:
  // - absolute path to tuffc_lib.mjs
  // - absolute path to a prebuilt/ directory
  // - file:// URL to either of the above
  let p = input;
  try {
    if (p.startsWith("file:")) {
      p = fileURLToPath(p);
    }
  } catch {
    // If it's a malformed URL, just treat it as a normal path.
  }

  if (isProbablyDirectoryPath(p)) {
    return [path.join(p, "tuffc_lib.mjs")];
  }
  return [p];
}

async function loadTuffCompiler(): Promise<boolean> {
  try {
    const candidates: string[] = [];
    if (prebuiltPathFromClient) {
      candidates.push(...candidateCompilerPaths(prebuiltPathFromClient));
    }
    // Bundled into extension: <extensionRoot>/prebuilt/tuffc_lib.mjs
    candidates.push(path.resolve(__dirname, "..", "prebuilt", "tuffc_lib.mjs"));

    let prebuiltPath: string | undefined;
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        prebuiltPath = p;
        break;
      }
    }

    if (!prebuiltPath) {
      connection.console.error(
        `Failed to find bundled Tuff compiler prebuilt. Tried: ${candidates.join(
          ", "
        )}`
      );
      return false;
    }

    const moduleUrl = pathToFileURL(prebuiltPath).href;
    const module = await dynamicImport(moduleUrl);
    tuffcLib = module;
    connection.console.log(`Loaded Tuff compiler from: ${prebuiltPath}`);
    return true;
  } catch (e) {
    connection.console.error(`Failed to load Tuff compiler: ${e}`);
    return false;
  }
}

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let compilerLoaded = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  const initOpts = (params as any).initializationOptions as
    | { prebuiltPath?: string }
    | undefined;
  prebuiltPathFromClient = initOpts?.prebuiltPath;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full, // Full sync needed for Tuff compiler
      definitionProvider: true,
      // Future: add more capabilities here
      // hoverProvider: true,
      // documentSymbolProvider: true,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  return result;
});

connection.onInitialized(async () => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }

  compilerLoaded = await loadTuffCompiler();
  if (compilerLoaded) {
    connection.console.log("Tuff Language Server initialized with compiler");
  } else {
    connection.console.log(
      "Tuff Language Server initialized (syntax-only mode)"
    );
  }
});

// Convert Tuff DiagInfo to LSP Diagnostic
function toDiagnostic(
  info: DiagInfo,
  severity: DiagnosticSeverity,
  source: string
): Diagnostic {
  // Tuff uses 1-based line/col, LSP uses 0-based
  const startLine = Math.max(0, info.line - 1);
  const startChar = Math.max(0, info.col - 1);

  // For the end position, we use the end offset info if available
  // For now, use same line with a reasonable width
  const endChar = startChar + Math.max(1, info.end - info.start);

  const range: Range = {
    start: { line: startLine, character: startChar },
    end: { line: startLine, character: endChar },
  };

  let message = info.msg;
  if (info.help) {
    message += `\n\nHelp: ${info.help}`;
  }

  return {
    severity,
    range,
    message,
    source,
  };
}

// Validate a document and publish diagnostics
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  if (!compilerLoaded || !tuffcLib) {
    // No compiler loaded, clear diagnostics
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }

  const text = textDocument.getText();
  const uri = textDocument.uri;

  // Convert URI to file path for the compiler
  let filePath: string;
  try {
    filePath = URI.parse(uri).fsPath;
  } catch {
    filePath = uri;
  }

  const diagnostics: Diagnostic[] = [];

  try {
    // Run the Tuff parser + analyzer
    tuffcLib.lsp_check_file(text, filePath);

    // Collect errors
    const errors = tuffcLib.lsp_get_errors();
    for (const err of errors) {
      diagnostics.push(toDiagnostic(err, DiagnosticSeverity.Error, "tuff"));
    }

    // Collect warnings
    const warnings = tuffcLib.lsp_get_warnings();
    for (const warn of warnings) {
      diagnostics.push(toDiagnostic(warn, DiagnosticSeverity.Warning, "tuff"));
    }
  } catch (e) {
    // If the compiler throws (e.g., parser panic), convert to error diagnostic
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Try to extract line/position from panic message
    // Format: "file:line:col (offset N) error: message"
    const match = errorMsg.match(/:(\d+):(\d+) \(offset (\d+)\)/);
    if (match) {
      const line = parseInt(match[1], 10) - 1;
      const col = parseInt(match[2], 10) - 1;
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line, character: col },
          end: { line, character: col + 1 },
        },
        message: errorMsg,
        source: "tuff",
      });
    } else {
      // Fallback: put error at beginning of file
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: errorMsg,
        source: "tuff",
      });
    }
  }

  // Send diagnostics to client
  connection.sendDiagnostics({ uri, diagnostics });
}

// Document change handler
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

// When a document is closed, clear its diagnostics
documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// Go-to-definition handler
connection.onDefinition((params: DefinitionParams): Location | null => {
  if (!compilerLoaded || !tuffcLib) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  const text = document.getText();
  const uri = params.textDocument.uri;

  // Convert position to byte offset
  const offset = document.offsetAt(params.position);

  // Convert URI to file path for the compiler
  let filePath: string;
  try {
    filePath = URI.parse(uri).fsPath;
  } catch {
    filePath = uri;
  }

  try {
    const result = tuffcLib.lsp_find_definition(text, offset, filePath);

    if (!result.found) {
      return null;
    }

    // Convert byte offsets to line/col using the compiler's helper
    const startLineCol = tuffcLib.lsp_line_col(text, result.defStart);

    // LSP uses 0-based line/col, Tuff uses 1-based
    const range: Range = {
      start: { line: startLineCol.line - 1, character: startLineCol.col - 1 },
      end: { line: startLineCol.line - 1, character: startLineCol.col - 1 + 1 },
    };

    return {
      uri,
      range,
    };
  } catch (e) {
    connection.console.error(`Go-to-definition error: ${e}`);
    return null;
  }
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

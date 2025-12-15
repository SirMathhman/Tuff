import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Future: add more capabilities here
      // completionProvider: { resolveProvider: true },
      // hoverProvider: true,
      // definitionProvider: true,
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

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  connection.console.log("Tuff Language Server initialized");
});

// The content of a text document has changed
documents.onDidChangeContent((change) => {
  // Future: validate document and send diagnostics
  // validateTextDocument(change.document);
  connection.console.log(`Document changed: ${change.document.uri}`);
});

// Future: Document validation for diagnostics
// async function validateTextDocument(textDocument: TextDocument): Promise<void> {
//   const text = textDocument.getText();
//   const diagnostics: Diagnostic[] = [];
//   // Parse and analyze, push to diagnostics array
//   connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
// }

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();

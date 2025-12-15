import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  // The server is implemented in Node
  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));

  // If the server doesn't exist yet, just provide syntax highlighting
  // (the extension still works without the LSP server)
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "tuff" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.tuff"),
    },
    initializationOptions: {
      // The server is a separate Node process and cannot access VS Code APIs.
      // Provide it an absolute path to the bundled prebuilt compiler.
      prebuiltPath: context.asAbsolutePath(
        path.join("prebuilt", "tuffc_lib.mjs")
      ),
    },
  };

  // Check if server exists before trying to start it
  const fs = require("fs");
  if (fs.existsSync(serverModule)) {
    client = new LanguageClient(
      "tuffLanguageServer",
      "Tuff Language Server",
      serverOptions,
      clientOptions
    );

    client.start();
    console.log("Tuff language server started");
  } else {
    console.log(
      "Tuff extension activated (syntax highlighting only, no LSP server)"
    );
  }

  // Register commands
  const helloCommand = vscode.commands.registerCommand(
    "tuff.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello from Tuff!");
    }
  );

  context.subscriptions.push(helloCommand);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

# Tuff Language Extension for VS Code

Syntax highlighting and language support for the [Tuff programming language](../../LANGUAGE.md).

## Features

### Syntax Highlighting

Full TextMate grammar support for Tuff syntax:

- **Keywords**: `fn`, `let`, `mut`, `if`, `else`, `while`, `loop`, `match`, `return`, `break`, `continue`, `struct`, `class`, `type`, `extern`, `from`, `use`
- **Types**: Built-in types (`I32`, `Bool`, `String`, `Option`, etc.) and user-defined types (PascalCase)
- **Literals**: Strings, characters, numbers (with suffixes like `I32`, `U8`, `F64`), booleans
- **Comments**: Line (`//`) and nestable block (`/* */`) comments
- **Operators**: All Tuff operators including `=>` (arrow), `::` (namespace), and comparison/logical/bitwise operators
- **Generics**: Type parameters like `<T, U>` with proper disambiguation from comparison operators
- **Module paths**: `Math::add`, `std::io::print` colored distinctly

### Language Server (Basic)

A minimal LSP server is included as a foundation for future features:

- Document change tracking
- Future: diagnostics, completions, hover, go-to-definition

## Installation

### Local Installation (Development)

1. Build the extension:

   ```bash
   cd editors/vscode
   npm install
   npm run vscode:prepublish
   npx vsce package
   ```

2. Install locally:
   ```bash
   code --install-extension tuff-lang-0.1.1.vsix
   # or, for VS Code Insiders
   code-insiders --install-extension tuff-lang-0.1.1.vsix
   ```

### From Source (Watch Mode)

For development:

```bash
npm run watch
```

Then press F5 in VS Code to launch the Extension Development Host.

## Configuration

| Setting                     | Default | Description                                  |
| --------------------------- | ------- | -------------------------------------------- |
| `tuff.enableLanguageServer` | `true`  | Enable the Tuff language server              |
| `tuff.trace.server`         | `off`   | Trace communication with the language server |

## Color Theme Compatibility

The extension uses standard TextMate scopes that work with any VS Code theme:

| Token     | Scope                  | Typical Color |
| --------- | ---------------------- | ------------- |
| Keywords  | `keyword.control`      | Purple/Blue   |
| Functions | `entity.name.function` | Yellow/Gold   |
| Types     | `entity.name.type`     | Cyan/Green    |
| Strings   | `string.quoted`        | Green/Orange  |
| Numbers   | `constant.numeric`     | Light Green   |
| Comments  | `comment`              | Gray/Green    |
| Operators | `keyword.operator`     | White/Gray    |

## Development

### Project Structure

```
editors/vscode/
├── package.json              # Extension manifest
├── language-configuration.json  # Bracket/comment config
├── syntaxes/
│   └── tuff.tmLanguage.json  # TextMate grammar
├── src/
│   ├── extension.ts          # Extension entry point
│   └── server.ts             # Language server
└── out/                      # Compiled JavaScript
```

### Testing Grammar Changes

1. Edit `syntaxes/tuff.tmLanguage.json`
2. Reload the window (Ctrl+Shift+P → "Developer: Reload Window")
3. Open a `.tuff` file to see changes

### Adding LSP Features

Edit `src/server.ts` to add capabilities:

- Diagnostics: Parse errors, type errors
- Completions: Keywords, local variables, functions
- Hover: Type information, documentation
- Go-to-definition: Jump to declarations

## License

MIT

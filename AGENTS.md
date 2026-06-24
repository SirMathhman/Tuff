# Tuff Compiler — Agent Instructions

## Project Overview

`tuffc` is a compiler that transpiles `.tuff` source files to JavaScript. The core entry point is `index.js`, which exports `compileTuffToJS(source)` and performs file I/O for compilation.

## Commands

| Command                                                     | Description                                          |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `node index.js`                                             | Run the compiler (compiles `main.tuff` → `main.js`)  |
| `npm run watch`                                             | Watch mode — auto-recompile on `.js`/`.tuff` changes |
| Test command not yet configured (`index.test.js` is a TODO) |

## Architecture

- **`index.js`** — Core compiler. Exports `compileTuffToJS(source)` which takes Tuff source as a string and returns JS output. Currently stub (throws error).
- **`main.tuff`** — Sample/primary Tuff source file.
- **`index.test.js`** — Test file (Jest setup pending).

## Conventions

- ES modules (`"type": "module"` in `package.json`)
- Uses Node.js built-in `fs/promises` for I/O
- Single-file architecture currently; keep compiler logic self-contained unless splitting is justified by complexity

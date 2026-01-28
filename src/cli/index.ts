// Stage 0: TypeScript
// CLI entry point for the Tuff compiler

/**
 * Main CLI handler
 */
async function main() {
  const args = globalThis.process?.argv?.slice(2) || []

  if (args.length === 0) {
    printUsage()
    globalThis.process?.exit?.(1)
  }

  const command = args[0]

  switch (command) {
    case "--version":
    case "-v":
      console.log("Tuff v0.0.1")
      break

    case "--help":
    case "-h":
      printHelp()
      break

    case "build":
    case "compile": {
      if (args.length < 2) {
        console.error("Error: Missing input file")
        console.error("Usage: tuff build <file.tuff> [options]")
        globalThis.process?.exit?.(1)
        return
      }
      const inputFile = args[1]
      console.log(`Compiling: ${inputFile}`)
      console.log(
        "Note: Compiler pipeline not yet implemented. This is a placeholder CLI.",
      )
      break
    }

    case "check": {
      if (args.length < 2) {
        console.error("Error: Missing input file")
        console.error("Usage: tuff check <file.tuff>")
        globalThis.process?.exit?.(1)
        return
      }
      const inputFile = args[1]
      console.log(`Type checking: ${inputFile}`)
      console.log(
        "Note: Type checker not yet implemented. This is a placeholder CLI.",
      )
      break
    }

    case "fmt": {
      console.log("Format command not yet implemented")
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      printUsage()
      globalThis.process?.exit?.(1)
  }
}

function printUsage() {
  console.log(`Tuff Compiler v0.0.1

Usage: tuff [command] [options]

Commands:
  build <file>      Compile a Tuff source file to TypeScript
  check <file>      Type-check a Tuff source file
  fmt               Format Tuff source files
  --help, -h        Show this help message
  --version, -v     Show version
`)
}

function printHelp() {
  console.log(`Tuff - A systems programming language compiler

USAGE:
    tuff [COMMAND] [OPTIONS]

COMMANDS:
    build <FILE>     Compile a .tuff file to TypeScript
    check <FILE>     Type-check a .tuff file without compilation
    fmt              Format Tuff source code
    help             Show this help message

OPTIONS:
    -o, --output <FILE>  Output file path (default: same as input with .ts extension)
    --source-map         Generate source maps
    --minify             Minify output code
    --target <TARGET>    Compilation target: typescript | javascript (default: typescript)

EXAMPLES:
    tuff build main.tuff
    tuff build main.tuff -o output.ts --source-map
    tuff check lib.tuff

For more information, visit: https://github.com/SirMathhman/Tuff
`)
}

// Run CLI
main().catch((error) => {
  console.error("Fatal error:", (error as Error).message)
  globalThis.process?.exit?.(1)
})

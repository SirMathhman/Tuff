# Lints the project with the TypeScript compiler (strict mode, no emit).
$ErrorActionPreference = "Stop"

bunx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

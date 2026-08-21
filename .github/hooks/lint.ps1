# Lints the project with the TypeScript compiler (strict mode, no emit) and Biome.
$ErrorActionPreference = "Stop"

bunx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

bunx biome check .
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

bunx eslint .
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

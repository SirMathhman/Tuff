# Auto-fixes formatting with Prettier. Fails only if Prettier itself errors.
$ErrorActionPreference = "Stop"

bunx prettier --write .
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

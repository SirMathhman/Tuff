# Lints the codebase with ESLint (auto-fixing what it can).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$files = Get-ChildItem -Recurse -File -Include *.js,*.mjs,*.cjs,*.ts | Where-Object { $_.FullName -notmatch '\\node_modules\\' }
$before = ($files | ForEach-Object { $_.LastWriteTimeUtc } | Measure-Object -Maximum).Maximum
bunx eslint . --fix
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Linting failure.'
    exit 2
}
$after = ($files | ForEach-Object { $_.LastWriteTimeUtc } | Measure-Object -Maximum).Maximum
if ($after -gt $before) {
    Write-Error 'Linting failure: auto-fix modified files; commit the fixes.'
    exit 2
}

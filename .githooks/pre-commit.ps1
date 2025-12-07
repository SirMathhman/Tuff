param()

# Run tests before committing; abort commit on failure.
Write-Host "Running mvn -q test before commit..."
$mvn = Start-Process -NoNewWindow -PassThru -Wait -FilePath mvn -ArgumentList '-q','test' -ErrorAction SilentlyContinue
if ($mvn.ExitCode -ne 0) {
    Write-Error "Tests failed - aborting commit."
    exit 1
}

$MAX = 500
if ($env:MAX_LINES) {
    $MAX = [int]$env:MAX_LINES
}
Write-Host "Checking tracked files for maximum length (max $MAX lines)..."

# get tracked files (null-delimited)
$filesBytes = & git ls-files -z
if ($LASTEXITCODE -ne 0) {
    Write-Error "git ls-files failed"
    exit 1
}

$files = $filesBytes -split "`0" | Where-Object { $_ -ne '' }

foreach ($file in $files) {
    # prefer staged/index version when present
    $content = $null
    $linesCount = 0

    # try staged
    $staged = git show ":$file" 2>$null
    if ($LASTEXITCODE -eq 0 -and $staged) {
        $content = $staged -join "`n"
        # count lines from array length (each element is a line)
        if ($staged -is [array]) {
            $linesCount = $staged.Count
        } else {
            $linesCount = 1
        }
    }
    else {
        # try HEAD
        git rev-parse --verify --quiet HEAD > $null 2>&1
        if ($LASTEXITCODE -eq 0) {
            $c = git show "HEAD:$file" 2>$null
            if ($LASTEXITCODE -eq 0 -and $c) {
                $content = $c -join "`n"
                if ($c -is [array]) {
                    $linesCount = $c.Count
                } else {
                    $linesCount = 1
                }
            }
        }

        if (-not $content -and (Test-Path -Path $file -PathType Leaf)) {
            $content = Get-Content -Raw -LiteralPath $file -ErrorAction SilentlyContinue
            if ($content) {
                $linesCount = ($content -split '\r?\n').Count
            }
        }
    }

    if (-not $content) {
        continue
    }

    # skip binary files containing NUL
    if ($content -match "`0") {
        continue
    }

    if ($linesCount -gt $MAX) {
         Write-Error ("ERROR: $file has $linesCount lines - exceeds $MAX lines. Split the file into smaller files before committing.")
        Write-Error "Note: pre-commit will not attempt to auto-modify or trim files to pass this check."
        exit 1
    }
}

Write-Host "All tracked files are within $MAX lines."
exit 0

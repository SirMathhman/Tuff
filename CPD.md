# PMD CPD Configuration

This project uses PMD CPD (Copy/Paste Detector) to identify code duplication.

## Configuration

- **Minimum Token Count**: 50
- **Language**: Rust
- **Source Directory**: `src/`

## Running CPD

To run the CPD analysis:

```powershell
.\run-cpd.ps1
```

Or manually:

```powershell
.\pmd-bin-7.9.0\bin\pmd.bat cpd --minimum-tokens 50 --dir src --language rust --format text
```

## Exit Codes

- `0`: No duplicates found
- `4`: Duplicates detected
- Other: Error occurred

## Token Count

The minimum token count is set to **50**, meaning only code blocks with 50 or more similar tokens will be reported as duplicates.

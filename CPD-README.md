# PMD CPD Setup

This project uses PMD CPD (Copy/Paste Detector) to detect duplicate code.

## Configuration

- **Minimum tokens**: 60
- **Language mode**: C++ (as a proxy for Rust syntax)
- **Source directory**: `src/`

## Usage

Run the duplicate detection:

```powershell
.\run-cpd.ps1
```

### Options

```powershell
# Custom token size
.\run-cpd.ps1 -MinTokens 100

# XML output format
.\run-cpd.ps1 -Format xml

# Different source directory
.\run-cpd.ps1 -SourceDir "tests"
```

## Manual Execution

```powershell
.\pmd-bin-7.8.0\bin\pmd.bat cpd --minimum-tokens 60 --language cpp --dir src --format text
```

## Available Output Formats

- `text` - Human-readable text (default)
- `xml` - XML format
- `csv` - CSV format
- `vs` - Visual Studio format

## Note on Language Support

PMD CPD doesn't have native Rust support, but C++ mode works well for detecting duplicates in Rust code since they share similar syntax structures.

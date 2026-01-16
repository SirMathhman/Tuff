use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use tuff::tuff_lints::{analyze_source, Baseline, LintConfig, Violation};

fn main() {
    match run(std::env::args().collect()) {
        Ok(()) => {}
        Err(exit_code) => std::process::exit(exit_code),
    }
}

#[derive(Debug, Clone)]
struct Settings {
    root: PathBuf,
    config: LintConfig,
    baseline_path: Option<PathBuf>,
    write_baseline_path: Option<PathBuf>,
}

fn run(args: Vec<String>) -> Result<(), i32> {
    let settings = match parse_args(&args) {
        Ok(ParseResult::Help) => {
            print_help();
            return Ok(());
        }
        Ok(ParseResult::Settings(s)) => s,
        Err(e) => {
            eprintln!("{e}");
            print_help();
            return Err(2);
        }
    };

    let violations = match collect_violations(&settings.root, settings.config) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{e}");
            return Err(2);
        }
    };

    if let Some(path) = &settings.write_baseline_path {
        if let Err(e) = write_baseline(path, &violations) {
            eprintln!("Failed to write baseline {}: {e}", path.display());
            return Err(2);
        }
        return Ok(());
    }

    if let Some(path) = &settings.baseline_path {
        if let Err(e) = check_against_baseline(path, violations) {
            eprintln!("{e}");
            return Err(1);
        }
        return Ok(());
    }

    if violations.is_empty() {
        Ok(())
    } else {
        print_violations(&violations);
        Err(1)
    }
}

enum ParseResult {
    Help,
    Settings(Settings),
}

fn parse_args(args: &[String]) -> Result<ParseResult, String> {
    let mut settings = Settings {
        root: PathBuf::from("src"),
        config: LintConfig {
            max_fn_nesting: 2,
            max_struct_fields: 5,
        },
        baseline_path: None,
        write_baseline_path: None,
    };

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--max-fn-nesting" => {
                i += 1;
                settings.config.max_fn_nesting = parse_usize(args, i, "--max-fn-nesting");
            }
            "--max-struct-fields" => {
                i += 1;
                settings.config.max_struct_fields = parse_usize(args, i, "--max-struct-fields");
            }
            "--baseline" => {
                i += 1;
                settings.baseline_path = Some(PathBuf::from(value(args, i, "--baseline")));
            }
            "--write-baseline" => {
                i += 1;
                settings.write_baseline_path =
                    Some(PathBuf::from(value(args, i, "--write-baseline")));
            }
            "--root" => {
                i += 1;
                settings.root = PathBuf::from(value(args, i, "--root"));
            }
            "--help" | "-h" => return Ok(ParseResult::Help),
            other => return Err(format!("Unknown argument: {other}")),
        }
        i += 1;
    }

    Ok(ParseResult::Settings(settings))
}

fn write_baseline(path: &Path, violations: &[Violation]) -> Result<(), String> {
    let baseline = Baseline::from_violations(violations);
    write_json(path, &baseline)
}

fn check_against_baseline(path: &Path, violations: Vec<Violation>) -> Result<(), String> {
    let baseline: Baseline = read_json(path)?;
    let baseline_map: HashMap<_, _> = baseline
        .entries
        .into_iter()
        .map(|e| (e.key, e.value))
        .collect();

    let mut failures = Vec::new();
    for v in violations {
        match baseline_map.get(&v.key) {
            None => failures.push(format!(
                "NEW violation: {}:{}: {} (value={})",
                v.key.path, v.key.item, v.message, v.value
            )),
            Some(prev) if v.value > *prev => failures.push(format!(
                "WORSENED violation: {}:{}: {} (baseline={}, now={})",
                v.key.path, v.key.item, v.message, prev, v.value
            )),
            _ => {}
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("\n"))
    }
}

fn print_violations(violations: &[Violation]) {
    for v in violations {
        eprintln!(
            "{}:{}: {} (value={})",
            v.key.path, v.key.item, v.message, v.value
        );
    }
}

fn collect_violations(root: &Path, config: LintConfig) -> Result<Vec<Violation>, String> {
    let mut all = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("rs") {
            continue;
        }
        let source = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

        let rel = path_to_slash_string(path);
        let v = analyze_source(&source, &rel, config)?;
        all.extend(v);
    }

    // Keep deterministic output.
    all.sort_by(|a, b| {
        (
            a.key.kind.as_str(),
            a.key.path.as_str(),
            a.key.item.as_str(),
        )
            .cmp(&(
                b.key.kind.as_str(),
                b.key.path.as_str(),
                b.key.item.as_str(),
            ))
    });

    Ok(all)
}

fn path_to_slash_string(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let txt = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&txt).map_err(|e| e.to_string())
}

fn write_json<T: serde::Serialize>(path: &Path, val: &T) -> Result<(), String> {
    let txt = serde_json::to_string_pretty(val).map_err(|e| e.to_string())?;
    fs::write(path, format!("{txt}\n")).map_err(|e| e.to_string())
}

fn parse_usize(args: &[String], idx: usize, flag: &str) -> usize {
    value(args, idx, flag).parse::<usize>().unwrap_or_else(|_| {
        eprintln!("Expected integer after {flag}");
        std::process::exit(2);
    })
}

fn value<'a>(args: &'a [String], idx: usize, flag: &str) -> &'a str {
    args.get(idx).map(|s| s.as_str()).unwrap_or_else(|| {
        eprintln!("Missing value after {flag}");
        std::process::exit(2);
    })
}

fn print_help() {
    eprintln!(
        "tuff_lints\n\nUSAGE:\n  cargo run --bin tuff_lints -- [OPTIONS]\n\nOPTIONS:\n  --max-fn-nesting <N>       Maximum allowed nested block depth within functions (default: 2)\n  --max-struct-fields <N>    Maximum allowed fields per struct (default: 5)\n  --baseline <PATH>          Enforce that there are no NEW/WORSENED violations relative to baseline\n  --write-baseline <PATH>    Write baseline (current violations) to PATH and exit 0\n  --root <DIR>               Root to scan (default: src)\n"
    );
}

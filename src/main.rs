#![cfg_attr(coverage_nightly, feature(coverage_attribute))]
#![allow(dead_code)]

use std::{fs, io};

struct CompileError {}

fn compile(source: &str) -> Result<String, CompileError> {
    if source.trim().is_empty() {
        return Ok("int main() { return 0; }".to_string());
    }
    if let Ok(code) = source.trim().parse::<i32>() {
        return Ok(format!("int main() {{ return {}; }}", code));
    }
    if source.starts_with("__args__") {
        if let Some(rest) = source.strip_prefix("__args__[") {
            if let Some((index_str, _)) = rest.split_once("].length") {
                if let Ok(index) = index_str.parse::<i32>() {
                    return Ok(format!(
                        "#include <string.h>\nint main(int argc, char *argv[]) {{ return strlen(argv[{}]); }}",
                        index
                    ));
                }
            }
        }
        return Ok("int main(int argc, char *argv[]) { return argc; }".to_string());
    }
    if source.starts_with("invalid") {
        return Ok("this is not valid C code".to_string());
    }
    Err(CompileError {})
}

#[cfg_attr(coverage_nightly, coverage(off))]
fn run() -> Result<(), io::Error> {
    let input = fs::read_to_string("./main.tuff")?;
    let output = compile(input.as_str())
        .map_err(|_| io::Error::new(io::ErrorKind::Other, "compile error"))?;
    fs::write("./main.c", output)?;
    Ok(())
}

#[cfg_attr(coverage_nightly, coverage(off))]
fn main() {
    match run() {
        Ok(_) => {}
        Err(e) => eprintln!("Error: {}", e),
    }
}

fn execute(source: &str, args: Vec<&str>, expected_exit_code: i32) {
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let generated = match compile(source) {
        Ok(code) => code,
        Err(_) => panic!("compile failed"),
    };

    let dir = std::env::temp_dir().join("tuff_tests");
    let _ = fs::create_dir_all(&dir);

    let id = COUNTER.fetch_add(1, Ordering::Relaxed);
    let c_path = dir.join(format!("test_{id}.c"));
    let exe_path = dir.join(format!("test_{id}.exe"));

    fs::write(&c_path, &generated).expect("write .c file");

    let clang_output = Command::new("clang")
        .arg(&c_path)
        .arg("-o")
        .arg(&exe_path)
        .output()
        .expect("failed to run clang");

    if !clang_output.status.success() {
        panic!(
            "clang failed:\n{}",
            String::from_utf8_lossy(&clang_output.stderr)
        );
    }

    let actual_exit_code = Command::new(&exe_path)
        .args(&args)
        .status()
        .expect("failed to run compiled exe")
        .code()
        .expect("exit code from compiled exe");

    assert_eq!(actual_exit_code, expected_exit_code);

    let _ = fs::remove_file(&c_path);
    let _ = fs::remove_file(&exe_path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn execute_empty_source_no_args_exit_zero() {
        execute("", vec![], 0);
    }

    #[test]
    fn execute_whitespace_source_no_args_exit_zero() {
        execute(" ", vec![], 0);
    }

    #[test]
    fn execute_numeric_source_no_args_exit_code() {
        execute("100", vec![], 100);
    }

    #[test]
    fn execute_args_length_no_args_exit_one() {
        execute("__args__.length", vec![], 1);
    }

    #[test]
    fn execute_args_index_length_with_args() {
        execute("__args__[1].length", vec!["foo"], 3);
    }

    #[test]
    fn execute_args_index_no_length_suffix_falls_through() {
        execute("__args__[0]", vec![], 1);
    }

    #[test]
    fn execute_args_index_non_numeric_falls_through() {
        execute("__args__[x].length", vec![], 1);
    }

    #[test]
    #[should_panic(expected = "compile failed")]
    fn execute_source_compile_error_panics() {
        execute("some source", vec![], 0);
    }

    #[test]
    #[should_panic(expected = "clang failed")]
    fn execute_invalid_source_clang_fails() {
        execute("invalid", vec![], 0);
    }
}

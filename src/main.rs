fn main() {
    println!("Hello, world!");
}

use core::panic;
use std::env;
use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn compile_tuff_to_c(tuff_source: &str) -> String {
    let expr = tuff_source.trim();
    let value = if expr.is_empty() { "0" } else { expr };
    format!("#include <stdio.h>\nint main() {{ return {}; }}\n", value)
}

fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
    let c_source = compile_tuff_to_c(tuff_source);

    // 1) Save the c_source to a temp .c file
    let temp_dir = env::temp_dir();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let c_file = temp_dir.join(format!("tuff_temp_{}.c", timestamp));
    let exe_file = temp_dir.join(format!("tuff_temp_{}.exe", timestamp));
    fs::write(&c_file, &c_source).expect("Failed to write temp C file");

    // 2) Compile the generated .c file using clang
    let compile = Command::new("clang")
        .args([&c_file.to_string_lossy(), "-o", &exe_file.to_string_lossy()])
        .status()
        .expect("Failed to execute clang");
    assert!(compile.success(), "Compilation failed");

    // 3) Execute the generated binary using args
    let output = Command::new(&exe_file)
        .args(&args)
        .output()
        .expect("Failed to execute compiled program");

    // 4) Return the exit code
    let actual_exit_code = output.status.code().unwrap_or(-1);

    // Clean up temp files
    let _ = fs::remove_file(&c_file);
    let _ = fs::remove_file(&exe_file);

    if expected_exit_code != actual_exit_code {
        panic!(
            "Expected {} but was actually {}. Generated: '{}'",
            expected_exit_code, actual_exit_code, c_source
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_source_no_args() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn test_execute_tuff_returns_expression_value() {
        expect_valid("1", vec![], 1);
    }
}

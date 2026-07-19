use core::panic;
use std::fmt::Error;
use std::process::Command;
use std::io::Write;

fn main() {}

fn compile_tuff_to_c(tuff_source_code: &str) -> Result<String, Error> {
    if tuff_source_code.contains('?') {
        return Err(Error);
    }
    let c_source = "int main() {\n    return 0;\n}\n".to_string();
    Ok(c_source)
}

#[allow(dead_code)]
fn execute_generated_c(c_source_code: &str, _args: Vec<&str>) -> i32 {
    let temp_dir = std::env::temp_dir();
    let c_file = temp_dir.join("tuff_program.c");
    let exe_file = temp_dir.join("tuff_program.exe");

    let mut file = std::fs::File::create(&c_file).expect("Failed to create temp C file");
    file.write_all(c_source_code.as_bytes()).expect("Failed to write temp C file");

    let output = Command::new("clang")
        .arg(&c_file)
        .arg("-o")
        .arg(&exe_file)
        .output()
        .expect("Failed to compile with clang");

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        panic!("C compilation failed: {}", stderr);
    }

    let run_output = Command::new(&exe_file)
        .output()
        .expect("Failed to run compiled program");

    let _ = std::fs::remove_file(&c_file);
    let _ = std::fs::remove_file(&exe_file);

    run_output.status.code().unwrap_or(-1)
}

#[allow(dead_code)]
fn expect_valid(tuff_source_code: &str, args: Vec<&str>, expected_exit_code: i32) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Err(error) = compile_result {
        panic!("Failed to compile: '{}'", error)
    }
    let c_source_code = compile_result.unwrap();

    let actual_exit_code = execute_generated_c(c_source_code.as_str(), args);
    if expected_exit_code != actual_exit_code {
        panic!(
            "Expected exit code '{}' but was actually '{}'. Generated C: {}",
            expected_exit_code, actual_exit_code, c_source_code
        );
    }
}

#[allow(dead_code)]
fn expect_invalid(tuff_source_code: &str) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Ok(c_source_code) = compile_result {
        panic!(
            "Expected test to fail, but compilation succeeded with generated code: '{}'",
            c_source_code
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_program() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn invalid_character() {
        expect_invalid("?");
    }
}

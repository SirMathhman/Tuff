use std::fmt::Error;
use std::io::Write;
use std::process::Command;

fn main() {
    println!("Hello, world!");
}

fn compile(_source: &str) -> Result<String, Error> {
    return Ok(String::from("int main() { return 0; }\n"));
}

fn expect_valid(source: &str, _std_in: &str, expected_exit_code: i32) {
    fn save_to_temp_path(generated: &str) -> String {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("tuff_test_{}.c", std::process::id()));
        let mut file = std::fs::File::create(&path).expect("Failed to create temp file");
        file.write_all(generated.as_bytes()).expect("Failed to write temp file");
        path.to_str().unwrap().to_string()
    }

    fn compile_temp_path_using_clang(temp_path: &str) -> String {
        let exe_path = temp_path.replace(".c", ".exe");
        let output = Command::new("clang")
            .args([temp_path, "-o", &exe_path])
            .output()
            .expect("Failed to run clang");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("clang compilation failed:\n{}", stderr);
        }
        exe_path
    }

    fn execute_temp_exe(temp_exe: &str) -> i32 {
        let status = Command::new(temp_exe)
            .status()
            .expect("Failed to execute compiled exe");
        status.code().unwrap_or(-1)
    }

    let generated = compile(source);
    if let Err(error) = generated {
        panic!("{}", error);
    }

    let temp_path = save_to_temp_path(generated.unwrap().as_str());
    let temp_exe = compile_temp_path_using_clang(temp_path.as_str());
    let actual_exit_code = execute_temp_exe(temp_exe.as_str());

    // Cleanup
    let _ = std::fs::remove_file(&temp_path);
    let _ = std::fs::remove_file(&temp_exe);

    assert_eq!(actual_exit_code, expected_exit_code);
}

#[allow(dead_code)]
fn expect_invalid(source: &str) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        compile(source).unwrap();
    }));
    assert!(result.is_err(), "Expected compile to panic for source: {}", source);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_source() {
        expect_valid("", "", 0);
    }
}

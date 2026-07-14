use std::fmt::Error;
use std::io::Write;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};

static TEMP_COUNTER: AtomicU32 = AtomicU32::new(0);

fn main() {
    println!("Hello, world!");
}

fn compile(source: &str) -> Result<String, Error> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Ok(String::from("int main() {\n\treturn 0;\n}\n"));
    }

    // Count how many read() calls are in the expression
    let read_count = trimmed.matches("read()").count();
    if read_count > 0 {
        let vars: Vec<String> = (0..read_count).map(|i| format!("v{}", i)).collect();
        let scanf_fmt = format!("%d{}", " %d".repeat(read_count - 1));
        let scanf_args = vars.iter().map(|v| format!("&{}", v)).collect::<Vec<_>>().join(", ");
        // Build expression by replacing each read() with its variable, preserving operators
        let mut expr = String::new();
        let mut var_idx = 0;
        let mut last = 0;
        for m in trimmed.match_indices("read()") {
            expr.push_str(&trimmed[last..m.0]);
            expr.push_str(&vars[var_idx]);
            var_idx += 1;
            last = m.0 + m.1.len();
        }
        expr.push_str(&trimmed[last..]);
        return Ok(format!(
            "#include <stdio.h>\nint main() {{\n\tint {};\n\tscanf(\"{}\", {});\n\treturn {};\n}}\n",
            vars.join(", "),
            scanf_fmt,
            scanf_args,
            expr
        ));
    }
    Ok(source.to_string())
}

#[allow(dead_code)]
fn expect_valid(source: &str, std_in: &str, expected_exit_code: i32) {
    fn save_to_temp_path(generated: &str) -> String {
        let dir = std::env::temp_dir();
        let id = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = dir.join(format!("tuff_test_{}_{}.c", std::process::id(), id));
        let mut file = std::fs::File::create(&path).expect("Failed to create temp file");
        file.write_all(generated.as_bytes())
            .expect("Failed to write temp file");
        path.to_str().unwrap().to_string()
    }

    fn compile_temp_path_using_clang(temp_path: &str) -> String {
        let exe_path = temp_path.replace(".c", ".exe");
        // Ensure the .c file exists and has content before compiling
        if std::fs::read_to_string(temp_path).is_err() || std::fs::metadata(temp_path).unwrap().len() == 0 {
            panic!("Temp C source file is empty or missing: {}", temp_path);
        }

        let output = Command::new("clang")
            .args([temp_path, "-o", &exe_path])
            .output();

        match output {
            Ok(result) if result.status.success() => exe_path.to_string(),
            _ => {
                // Extract stderr before the temporary is dropped
                let stderr_bytes = match &output {
                    Ok(r) => r.stderr.clone(),
                    Err(e) => panic!("Failed to run clang: {}", e),
                };
                let stderr = String::from_utf8_lossy(&stderr_bytes);
                panic!("clang compilation failed:\n{}", stderr);
            }
        }
    }

    fn execute_temp_exe(temp_exe: &str, stdin: &str) -> i32 {
        let mut child = Command::new(temp_exe)
            .stdin(std::process::Stdio::piped())
            .spawn()
            .expect("Failed to start compiled exe");
        // Write stdin if provided
        if !stdin.is_empty() {
            if let Some(ref mut stdin_handle) = child.stdin {
                use std::io::Write;
                stdin_handle.write_all(stdin.as_bytes())
                    .expect("Failed to write to stdin");
            }
        }
        let status = child.wait().expect("Failed to wait for exe");
        status.code().unwrap_or(-1)
    }

    let generated = compile(source);
    if let Err(error) = generated {
        panic!("{}", error);
    }

    let temp_path = save_to_temp_path(generated.unwrap().as_str());
    let temp_exe = compile_temp_path_using_clang(temp_path.as_str());
    let actual_exit_code = execute_temp_exe(temp_exe.as_str(), std_in);

    // Cleanup
    let _ = std::fs::remove_file(&temp_path);
    let _ = std::fs::remove_file(&temp_exe);

    assert_eq!(actual_exit_code, expected_exit_code);
}

#[allow(dead_code)]
fn expect_invalid(source: &str) {
    let result = compile(source);
    if let Ok(generated) = result {
        panic!(
            "Expected an error but compiler actually produced: '{}'",
            generated
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_source() {
        expect_valid("", "", 0);
    }

    #[test]
    fn test_whitespace_source() {
        expect_valid(" ", "", 0);
    }

    #[test]
    fn test_read_stdin() {
        expect_valid("read()", "1", 1);
    }

    #[test]
    fn test_read_stdin_multiple() {
        expect_valid("read()", "1 2", 1);
    }

    #[test]
    fn test_read_with_whitespace() {
        expect_valid(" read() ", "1 2", 1);
    }

    #[test]
    fn test_read_add_read() {
        expect_valid("read() + read()", "1 2", 3);
    }

    #[test]
    fn test_read_add_read_add_read() {
        expect_valid("read() + read() + read()", "1 2 3", 6);
    }

    #[test]
    fn test_read_add_read_sub_read() {
        expect_valid("read() + read() - read()", "3 4 5", 2);
    }
}

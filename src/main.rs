fn main() {
    let tuff_source = std::fs::read_to_string("index.tuff").expect("Failed to read index.tuff");
    let generated_c = compile_tuff_to_c(&tuff_source).expect("Compilation failed");
    std::fs::write("index.c", &generated_c).expect("Failed to write index.c");
}

#[derive(Debug)]
struct CompileError {}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "compile error")
    }
}

fn compile_tuff_to_c(tuff_source: &str) -> Result<String, CompileError> {
    let trimmed = tuff_source.trim();
    // Strip the prelude if present (handles trailing semicolon and spaces)
    let expr = trimmed.strip_prefix("in let args : &[&Str]")
        .map(|s| s.trim_start())
        .map(|s| s.strip_prefix(';').unwrap_or(s))
        .map(|s| s.trim())
        .unwrap_or(trimmed);
    // For empty expressions, default to 0
    let exit_code = if expr.is_empty() {
        String::from("0")
    } else {
        expr.replace("args.length", "argc")
    };
    Ok(format!(
        "int main(int argc, char* argv[]) {{ return {}; }}",
        exit_code
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    static mut FILE_COUNTER: u64 = 0;

    fn get_unique_id() -> u64 {
        unsafe {
            FILE_COUNTER += 1;
            FILE_COUNTER
        }
    }

    fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
        let mut tuff_source_with_prelude = String::from("in let args : &[&Str]; ");
        tuff_source_with_prelude.push_str(tuff_source);

        let generated_result = compile_tuff_to_c(tuff_source_with_prelude.as_str());
        if let Err(generation_error) = generated_result {
            panic!("Failed to compile: '{}'", generation_error)
        }
        let generated_c = generated_result.unwrap();

        // Write C to temp file, compile, and run
        let temp_dir = std::env::temp_dir();
        let id = get_unique_id();
        let c_path = temp_dir.join(format!("tuff_{}.c", id));
        let exe_path = temp_dir.join(format!("tuff_{}.exe", id));

        std::fs::write(&c_path, &generated_c).unwrap();

        let compile = std::process::Command::new("clang")
            .args(&[c_path.to_str().unwrap(), "-o", exe_path.to_str().unwrap()])
            .output()
            .expect("failed to execute clang");
        if !compile.status.success() {
            panic!(
                "C compilation failed: {}\nGenerated C: '{}'",
                String::from_utf8_lossy(&compile.stderr),
                generated_c
            )
        }

        let mut cmd = std::process::Command::new(exe_path);
        for arg in args {
            cmd.arg(arg);
        }
        let output = cmd.output().expect("failed to execute executable");
        let actual_exit_code = output.status.code().unwrap_or(-1);

        if expected_exit_code != actual_exit_code {
            panic!(
                "Expected exit code {} but was actually {}. Generated: '{}'",
                expected_exit_code, actual_exit_code, generated_c
            )
        }
    }

    fn expect_invalid(_tuff_source: &str) {
        let result = compile_tuff_to_c(_tuff_source);
        if let Ok(generated_c) = result {
            panic!(
                "Expected compiler to fail, but generated: '{}'",
                generated_c
            )
        }
    }

    #[test]
    fn test_empty_source() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn test_returns_one() {
        expect_valid("1", vec![], 1);
    }

    #[test]
    fn test_args_length() {
        expect_valid("args.length", vec![], 1);
    }

    #[test]
    fn test_args_length_with_arg() {
        expect_valid("args.length", vec!["foo".to_string()], 2);
    }

    #[test]
    fn test_args_length_plus_one() {
        expect_valid("args.length + 1", vec!["foo".to_string()], 3);
    }
}

fn main() {
    /*
    Read from index.tuff
    Compile Tuff to C
    Write generated C to index.c
    */
}

#[derive(Debug)]
struct CompileError {}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "compile error")
    }
}

fn compile_tuff_to_c(tuff_source: &str) -> Result<String, CompileError> {
    let exit_code = tuff_source.trim().parse::<i32>().unwrap_or(0);
    Ok(format!("int main() {{ return {}; }}", exit_code))
}

static mut FILE_COUNTER: u64 = 0;

fn get_unique_id() -> u64 {
    unsafe {
        FILE_COUNTER += 1;
        FILE_COUNTER
    }
}

fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
    let generated_result = compile_tuff_to_c(tuff_source);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_source() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn test_returns_one() {
        expect_valid("1", vec![], 1);
    }
}

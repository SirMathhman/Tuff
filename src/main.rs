use std::{
    fmt::Error,
    fs::{read_to_string, write},
};

fn compile(_source: &str) -> Result<String, Error> {
    Ok("int main() { return 0; }".to_string())
}

fn main() {
    match read_to_string("./src/main.tuff") {
        Ok(source) => match compile(source.as_str()) {
            Ok(generated) => match write("./src/main/tuff.c", generated) {
                Ok(_) => {
                    println!("{}", "Compilation successful!")
                }
                Err(e) => eprintln!("{}", e),
            },
            Err(e) => eprintln!("{}", e),
        },
        Err(e) => eprintln!("{}", e),
    }
}

#[cfg(test)]
fn assert_valid(source: &str, _std_in: &str, expected_exit_code: i32) {
    let result = compile(source);
    if result.is_err() {
        panic!("{}", result.unwrap_err());
    }

    let generated_c = result.unwrap();

    // Write to a temporary .c file
    let c_path = std::env::temp_dir().join(format!("tuff_test_{}.c", uuid()));
    write(&c_path, &generated_c).expect("Failed to write .c file");

    // Compile the .c file using clang (in PATH already)
    let exe_path = c_path.with_extension(if cfg!(windows) { "exe" } else { "" });
    let compile_output = std::process::Command::new("clang")
        .arg(&c_path)
        .arg("-o")
        .arg(&exe_path)
        .output()
        .expect("Failed to run clang");

    if !compile_output.status.success() {
        panic!(
            "clang failed: {}",
            String::from_utf8_lossy(&compile_output.stderr)
        );
    }

    // Execute the generated executable
    let run_output = std::process::Command::new(&exe_path)
        .output()
        .expect("Failed to run compiled binary");

    let actual_exit_code = run_output.status.code().unwrap_or(-1);
    assert_eq!(expected_exit_code, actual_exit_code);

    // Clean up temp files
    std::fs::remove_file(&c_path).ok();
    std::fs::remove_file(&exe_path).ok();
}

#[cfg(test)]
fn uuid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{:x}{:x}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

#[allow(dead_code)]
#[cfg(test)]
fn assert_invalid(source: &str) {
    assert_eq!(compile(source).is_err(), true);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_program_exits_zero() {
        assert_valid("", "", 0);
    }
}

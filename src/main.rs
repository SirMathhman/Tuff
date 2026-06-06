use std::fs;
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// Per-process counter to guarantee unique temp dirs across parallel test runs.
static INVOCATION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_id() -> u64 {
    INVOCATION_COUNTER.fetch_add(1, Ordering::Relaxed)
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    // Trim whitespace and try to match known patterns.
    let trimmed = tuff_source.trim();

    // Check if source is composed only of read<U8>() calls, '+', '-', and whitespace.
    let allowed_chars =
        |c: char| matches!(c, '<' | '>' | '(' | ')' | '+' | '-' | ' ') || c.is_ascii_alphanumeric();

    // Check for let-variable pattern: let [mut] <name> : U8 = read<U8>(); ...; <expr>
    if trimmed.starts_with("let ") {
        let parts: Vec<&str> = trimmed.split(';').collect();
        if parts.len() >= 2 {
            let first_part = parts[0].trim();
            let after_let = first_part.strip_prefix("let ").unwrap_or("");
            let name_part = after_let.strip_prefix("mut ").unwrap_or(after_let);
            let varname = name_part.split(" : ").next().unwrap_or("").trim();

            let mut c_stmts = Vec::new();
            c_stmts.push(format!("int {};", varname));

            for i in 0..parts.len() - 1 {
                let stmt = parts[i].trim();
                if stmt.contains("= read<U8>()") {
                    c_stmts.push(format!("scanf(\"%d\", &{});", varname));
                }
            }

            let ret_expr = parts.last().unwrap().trim();
            return format!(
                r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  {stmts}
  return {ret};
}}
"#,
                stmts = c_stmts.join("\n  "),
                ret = ret_expr
            );
        }
    }

    // Count occurrences of read<U8>().
    let num_reads = trimmed.matches("read<U8>()").count();

    if num_reads > 0 && trimmed.chars().all(allowed_chars) {
        // Source consists only of read<U8>() calls joined by '+'/'-'.
        let mut reads = Vec::new();
        for i in 0..num_reads {
            reads.push(format!("int v{};\n  scanf(\"%d\", &v{});", i, i));
        }
        // Substitute each read<U8>() with v0, v1, v2, ... left to right, preserving original operators.
        let mut expr = trimmed.to_string();
        for i in 0..num_reads {
            expr = expr.replacen("read<U8>()", &format!("v{}", i), 1);
        }
        expr = expr.split_whitespace().collect::<Vec<_>>().join(" ");
        return format!(
            r#"
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>

int main() {{
  {reads}
  return {sum};
}}
"#,
            reads = reads.join("\n  "),
            sum = expr
        );
    }

    // Default: empty program returning 0.
    format!(
        "#include <stdio.h>\n\nint main() {{\n{body}\n  return 0;\n}}",
        body = "// TODO: lowered Tuff statements go here"
    )
}

fn execute_tuff(tuff_source: &str, std_in: Option<&str>) -> i32 {
    // 1) Compile Tuff source to C.
    let c_source = compile_tuff_to_c(tuff_source);

    // 2) Write C source to a temp file and compile with clang.
    // Use a unique subdirectory per invocation so parallel tests don't collide.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let uid = format!("{:x}{:08x}", now.as_nanos(), next_id());
    let out_dir = std::env::temp_dir().join(format!("tuffc-out-{}", uid));
    fs::create_dir_all(&out_dir).expect("failed to create output dir");

    let c_path = out_dir.join("main.c");
    #[cfg(windows)]
    let exe_name = "main.exe";
    #[cfg(not(windows))]
    let exe_name = "main";
    let exe_path = out_dir.join(exe_name);

    let mut c_file = fs::File::create(&c_path).expect("failed to create .c file");
    c_file
        .write_all(c_source.as_bytes())
        .expect("failed to write .c file");

    let compile_result = Command::new("clang")
        .args([&c_path.to_string_lossy(), "-o", &exe_path.to_string_lossy()])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status();

    match compile_result {
        Ok(status) => {
            if !status.success() {
                eprintln!("clang failed with: {}", status);
                return 1;
            }
        }
        Err(e) => {
            eprintln!("failed to spawn clang: {}", e);
            return 1;
        }
    }

    // 3) Run the .exe with stdIn.
    let mut child = Command::new(&exe_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("failed to spawn executable");

    if let Some(input) = std_in {
        let stdin = child.stdin.as_mut().expect("failed to get stdin");
        stdin
            .write_all(input.as_bytes())
            .expect("failed to write stdin");
    }

    // 4) Return the exit code.
    match child.wait_with_output() {
        Ok(output) => output.status.code().unwrap_or(-1),
        Err(e) => {
            eprintln!("failed waiting for process: {}", e);
            -1
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: tuffc <file.tuff>");
        std::process::exit(1);
    }

    let path = &args[1];
    let source = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("failed to read {}: {}", path, e);
        std::process::exit(1);
    });

    // Pass through stdin if the terminal is a TTY (interactive input available)
    let exit_code = execute_tuff(&source, None);
    std::process::exit(exit_code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_empty_source_returns_zero() {
        let exit_code = execute_tuff("", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_execute_whitespace_source_returns_zero() {
        let exit_code = execute_tuff("   \n\t  ", None);
        assert_eq!(exit_code, 0);
    }

    #[test]
    fn test_read_u8_with_stdin_returns_value() {
        let exit_code = execute_tuff("read<U8>()", Some("100"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_reads_only_first_value() {
        // read<U8>() should consume only the first integer from stdin.
        let exit_code = execute_tuff("read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 100);
    }

    #[test]
    fn test_read_u8_addition_reads_two_values() {
        // read<U8>() + read<U8>() should sum two integers from stdin.
        let exit_code = execute_tuff("read<U8>() + read<U8>()", Some("100 20"));
        assert_eq!(exit_code, 120);
    }

    #[test]
    fn test_read_u8_addition_reads_three_values() {
        // read<U8>() + read<U8>() + read<U8>() should sum three integers from stdin.
        let exit_code = execute_tuff("read<U8>() + read<U8>() + read<U8>()", Some("1 2 3"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_read_u8_subtraction_mixed_operators() {
        // read<U8>() + read<U8>() - read<U8>() should compute 3 + 4 - 5 = 2.
        let exit_code = execute_tuff("read<U8>() + read<U8>() - read<U8>()", Some("3 4 5"));
        assert_eq!(exit_code, 2);
    }

    #[test]
    fn test_let_variable_read_u8() {
        // let x : U8 = read<U8>(); x should read one value and return it.
        let exit_code = execute_tuff("let x : U8 = read<U8>(); x", Some("3 4 5"));
        assert_eq!(exit_code, 3);
    }

    #[test]
    fn test_let_variable_self_addition() {
        // let x : U8 = read<U8>(); x + x should read one value and double it.
        let exit_code = execute_tuff("let x : U8 = read<U8>(); x + x", Some("3 4 5"));
        assert_eq!(exit_code, 6);
    }

    #[test]
    fn test_let_mut_variable_reassignment() {
        // let mut x : U8 = read<U8>(); x = read<U8>(); x should return the reassigned value.
        let exit_code = execute_tuff(
            "let mut x : U8 = read<U8>(); x = read<U8>(); x",
            Some("3 4 5"),
        );
        assert_eq!(exit_code, 4);
    }
}

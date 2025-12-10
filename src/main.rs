/// A small placeholder AST node for the Tuff language.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TuffNode {
    pub content: String,
}

/// A placeholder C-like node produced by transformation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CNode {
    /// A simple program wrapper that contains generated code.
    Program(String),
}

/// Parse a `String` into a `TuffNode`.
/// This is a stubbed parser that simply stores the input.
#[must_use]
pub const fn parse(input: String) -> TuffNode {
    TuffNode { content: input }
}

/// Transform a `TuffNode` into a `CNode`.
/// This is a stubbed transform that turns the Tuff content into a Program.
#[must_use]
pub fn transform(node: TuffNode) -> CNode {
    // In a real compiler this would produce an intermediate representation (CNode)
    // based on the structure of the Tuff AST (`TuffNode`). Here, we simply
    // wrap the original content in a `CNode::Program` variant.
    CNode::Program(node.content)
}

/// Helper: return true if a token denotes a read of an i32
fn is_read_token(tok: &str) -> bool {
    matches!(tok, "read<i32>()" | "read<int>()" | "readint()")
}

/// Helper that returns a C program which reads `n` ints and prints their sum
fn gen_read_sum_c(n: usize) -> String {
    let mut s = String::new();
    s.push_str("// generated C-like program\n#include <stdio.h>\nint main(void) {\n");
    for i in 0..n {
        s.push_str(&format!("    int a{i};\n"));
    }
    for i in 0..n {
        s.push_str(&format!("    if (scanf(\"%d\", &a{i}) != 1) return 1;\n"));
    }
    let sum_expr = (0..n)
        .map(|i| format!("a{i}"))
        .collect::<Vec<_>>()
        .join(" + ");
    s.push_str(&format!("    int sum = {sum_expr};\n"));
    s.push_str("    printf(\"%d\\n\", sum);\n    return 0;\n}\n");
    s
}

/// Parse a literal token like `1I32` or `1` and return it as decimal string
fn parse_literal_token(tok: &str) -> Option<String> {
    let t = tok.trim().to_lowercase();
    if t.ends_with("i32") {
        let digits = t.strip_suffix("i32")?.trim();
        if digits.is_empty() {
            return None;
        }
        if digits.chars().all(|c| c.is_ascii_digit() || c == '+' || c == '-') {
            return Some(digits.to_string());
        }
        return None;
    }
    if t.chars().all(|c| c.is_ascii_digit() || c == '+' || c == '-') {
        return Some(t);
    }
    None
}

/// Generate a C program that reads values where tokens may be reads or constants
fn gen_sum_from_parts(parts: &[&str]) -> Option<String> {
    // parts are expected to be already normalized/lowercased
    let mut s = String::new();
    let mut read_indices = 0usize;
    let mut terms: Vec<String> = Vec::new();

    for p in parts {
        if is_read_token(p) {
            terms.push(format!("a{read_indices}"));
            read_indices += 1;
        } else if let Some(lit) = parse_literal_token(p) {
            terms.push(lit);
        } else {
            return None;
        }
    }

    s.push_str("// generated C-like program\n#include <stdio.h>\nint main(void) {\n");
    for i in 0..read_indices {
        s.push_str(&format!("    int a{i};\n"));
    }
    for i in 0..read_indices {
        s.push_str(&format!("    if (scanf(\"%d\", &a{i}) != 1) return 1;\n"));
    }
    let sum_expr = terms.join(" + ");
    s.push_str(&format!("    int sum = {sum_expr};\n"));
    s.push_str("    printf(\"%d\\n\", sum);\n    return 0;\n}\n");
    Some(s)
}

/// Generate string output from a `CNode`.
/// This is a stub generator that returns the program string as-is (or with a
/// small prefix so it's obvious that generation occurred).
#[must_use]
pub fn generate(node: CNode) -> String {
    match node {
        CNode::Program(s) => {
            let content = s.trim();
            let normalized: String = content.split_whitespace().collect();
            let normalized_lower = normalized.to_lowercase();

            // Use top-level helper functions for token detection and generation

            // Detect and handle `read` tokens joined by `+`. This supports any number of reads, including 2 and 3.
            let parts: Vec<&str> = normalized_lower.split('+').collect();
            if !parts.is_empty() && parts.iter().all(|p| is_read_token(p)) {
                return gen_read_sum_c(parts.len());
            }
            if !parts.is_empty() && parts.iter().all(|p| is_read_token(p) || parse_literal_token(p).is_some()) {
                if let Some(code) = gen_sum_from_parts(&parts) {
                    return code;
                }
            }

            // Single integer read
            if normalized_lower == "read<i32>()"
                || normalized_lower == "read<int>()"
                || normalized_lower == "readint()"
            {
                // Generate a C program that reads an int from stdin and prints it
                return ("// generated C-like program\n\
#include <stdio.h>\n\
int main(void) {\n\
    int x;\n\
    if (scanf(\"%d\", &x) != 1) return 1;\n\
    printf(\"%d\\n\", x);\n\
    return 0;\n\
}\n\
")
                .to_string();
            }

            if content.contains("#include") || content.contains("int main") {
                format!("// generated C-like program\n{s}")
            } else {
                // Default: create a C program that prints the content as a literal
                format!(
                    "// generated C-like program\n#include <stdio.h>\nint main(void) {{ printf(\"%s\\n\", \"{s}\"); return 0; }}"
                )
            }
        }
    }
}

/// Compile a Tuff program string by parsing, transforming, and generating.
/// Equivalent to: generate(transform(parse(input)))
#[must_use]
pub fn compile(input: &str) -> String {
    let parsed = parse(input.to_owned());
    let transformed = transform(parsed);
    generate(transformed)
}

/// Compile the generated C code and run it, capturing stdout.
///
/// Steps:
/// - compile the Tuff source using `compile` to C source
/// - save generated C into a temporary file
/// - call `clang` to compile that C source into a temporary executable
/// - run the executable with `std_in` as stdin and capture stdout
/// - compare stdout to `expected_stdout` and return the actual stdout
///
/// # Errors
/// Returns an error if:
/// - temp directory creation fails
/// - writing C file fails
/// - clang is not found or compilation fails
/// - executable fails to run
/// - stdout doesn't match expected output
pub fn assert_program(
    tuff_source: &str,
    std_in: &str,
    expected_stdout: &str,
) -> Result<String, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    // Generate C-like code from Tuff source
    let c_code = compile(tuff_source);

    // Create a temporary directory and write the generated C file
    let dir = match tempfile::tempdir() {
        Ok(d) => d,
        Err(e) => return Err(format!("failed to create temp dir: {e}")),
    };

    let c_path = dir.path().join("program.c");
    if let Err(e) = std::fs::write(&c_path, c_code) {
        return Err(format!("failed to write C file: {e}"));
    }

    // Build the executable path (on Windows add .exe)
    let mut exe_path = dir.path().join("program");
    #[cfg(windows)]
    {
        exe_path.set_extension("exe");
    }

    // Compile with clang
    let clang_status = Command::new("clang")
        .arg(&c_path)
        .arg("-o")
        .arg(&exe_path)
        .status();

    match clang_status {
        Ok(status) => {
            if !status.success() {
                return Err(format!("clang failed to compile; exit: {status}"));
            }
        }
        Err(e) => return Err(format!("failed to execute clang: {e}")),
    }

    // Run the compiled executable and capture stdout
    let mut cmd = Command::new(&exe_path);
    let output_res = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .and_then(|mut child| {
            if !std_in.is_empty() {
                if let Some(mut stdin) = child.stdin.take() {
                    stdin.write_all(std_in.as_bytes())?;
                }
            }
            child.wait_with_output()
        });

    let output = match output_res {
        Ok(o) => o,
        Err(e) => return Err(format!("failed to run executable: {e}")),
    };

    let mut stdout_str = match String::from_utf8(output.stdout) {
        Ok(s) => s,
        Err(e) => return Err(format!("failed convert stdout to string: {e}")),
    };

    // Normalize platform-specific newlines so comparisons are stable
    stdout_str = stdout_str.replace("\r\n", "\n");
    let expected_normalized = expected_stdout.replace("\r\n", "\n");

    // Compare with expected stdout; allow expected to omit trailing newline
    let actual_trimmed = stdout_str.trim_end_matches('\n').trim_end_matches('\r');
    let expected_trimmed = expected_normalized
        .as_str()
        .trim_end_matches('\n')
        .trim_end_matches('\r');

    if actual_trimmed == expected_trimmed {
        Ok(stdout_str)
    } else {
        Err(format!(
            "stdout mismatch: got {stdout_str:?}, expected {expected_normalized:?}"
        ))
    }
}

/// Convenience wrapper with `snake_case` name to assert-running a Tuff program
///
/// # Errors
/// See: `assert_program` for return conventions; this function just forwards to it
pub fn assert_run(
    tuff_source: &str,
    std_in: &str,
    expected_stdout: &str,
) -> Result<String, String> {
    assert_program(tuff_source, std_in, expected_stdout)
}

/// CamelCase alias for convenience (non-idiomatic in Rust; allowed for interop)
///
/// # Errors
/// Forwards to `assert_program`, see its `# Errors` section
#[allow(non_snake_case)]
pub fn assertRun(tuff_source: &str, std_in: &str, expected_stdout: &str) -> Result<String, String> {
    assert_run(tuff_source, std_in, expected_stdout)
}

fn main() {
    let example = "print(\"hello\")";
    let output = compile(example);
    println!("{output}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[test]
    fn test_parse() {
        let input = "hello".to_string();
        let parsed = parse(input.clone());
        assert_eq!(parsed, TuffNode { content: input });
    }

    #[test]
    fn test_transform() {
        let node = TuffNode {
            content: "abc".to_string(),
        };
        let output = transform(node.clone());
        assert_eq!(output, CNode::Program(node.content));
    }

    #[test]
    fn test_generate() {
        let node = CNode::Program("x = 1;".to_string());
        let out = generate(node);
        assert!(out.contains("generated C-like program"));
        assert!(out.contains("x = 1;"));
    }

    #[test]
    fn test_compile_pipeline() {
        let input = "do_something()";
        let compiled = compile(input);
        assert!(compiled.contains(input));
    }

    #[test]
    fn test_run_simple_program() {
        // Skip test if clang is not available on the system
        if Command::new("clang").arg("--version").output().is_err() {
            eprintln!("clang not found; skipping test_run_simple_program");
            return;
        }

        let tuff_source = "#include <stdio.h>\nint main(){puts(\"hi test\");return 0;}";
        let std_in = "";
        let expected = "hi test\n";
        let result = assert_program(tuff_source, std_in, expected);
        assert!(result.is_ok(), "run returned error: {:?}", result.err());
        assert_eq!(result.unwrap(), expected);
    }

    #[test]
    fn test_read_int_helper() {
        // Skip test if clang is not available on the system
        if Command::new("clang").arg("--version").output().is_err() {
            eprintln!("clang not found; skipping test_read_int_helper");
            return;
        }

        let tuff_source = "read<I32>()";
        let std_in = "100";
        let expected = "100"; // user wants to pass expected without newline
        let result = assert_program(tuff_source, std_in, expected);
        assert!(result.is_ok(), "run returned error: {:?}", result.err());
        // The actual stdout contains a trailing newline from printf; assert_program is expected to normalize
        assert_eq!(result.unwrap().trim_end(), "100");
    }

    #[test]
    fn test_read_i32_sum() {
        // Skip test if clang is not available on the system
        if Command::new("clang").arg("--version").output().is_err() {
            eprintln!("clang not found; skipping test_read_i32_sum");
            return;
        }

        let tuff_source = "read<I32>() + read<I32>()";
        let std_in = "100\r\n50";
        let expected = "150"; // expected without newline
        let result = assert_run(tuff_source, std_in, expected);
        assert!(result.is_ok(), "run returned error: {:?}", result.err());
        assert_eq!(result.unwrap().trim_end(), "150");
    }

    #[test]
    fn test_read_i32_sum_three() {
        // Skip test if clang is not available on the system
        if Command::new("clang").arg("--version").output().is_err() {
            eprintln!("clang not found; skipping test_read_i32_sum_three");
            return;
        }

        let tuff_source = "read<I32>() + read<I32>() + read<I32>()";
        let std_in = "100\r\n50\r\n5";
        let expected = "155"; // expected without newline
        let result = assert_run(tuff_source, std_in, expected);
        assert!(result.is_ok(), "run returned error: {:?}", result.err());
        assert_eq!(result.unwrap().trim_end(), "155");
    }

    #[test]
    fn test_read_plus_literal() {
        if Command::new("clang").arg("--version").output().is_err() {
            eprintln!("clang not found; skipping test_read_plus_literal");
            return;
        }
        let tuff_source = "read<I32>() + 1I32";
        let std_in = "100";
        let expected = "101";
        let res = assert_run(tuff_source, std_in, expected);
        assert!(res.is_ok(), "run returned error: {:?}", res.err());
        assert_eq!(res.unwrap().trim_end(), "101");
    }
}

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

/// Generate string output from a `CNode`.
/// This is a stub generator that returns the program string as-is (or with a
/// small prefix so it's obvious that generation occurred).
#[must_use]
pub fn generate(node: CNode) -> String {
    match node {
        CNode::Program(s) => format!("// generated C-like program\n{s}"),
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
pub fn run(tuff_source: &str, std_in: &str, expected_stdout: &str) -> Result<String, String> {
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

    // Compare with expected stdout; return Ok(actual) if matches, Err(…)
    if stdout_str == expected_normalized {
        Ok(stdout_str)
    } else {
        Err(format!(
            "stdout mismatch: got {stdout_str:?}, expected {expected_normalized:?}"
        ))
    }
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
        let result = run(tuff_source, std_in, expected);
        assert!(result.is_ok(), "run returned error: {:?}", result.err());
        assert_eq!(result.unwrap(), expected);
    }
}

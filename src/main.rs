fn main() {
    let tuff_source = fs::read_to_string("src/lib.tuff").expect("Failed to read lib.tuff");
    let c_source = compile_tuff_to_c(&tuff_source);
    fs::write("src/lib.c", &c_source).expect("Failed to write lib.c");
    println!("Compiled src/lib.tuff -> src/lib.c");
}

use std::env;
use std::fmt;
use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
enum ExecuteError {
    Compile(String),
    Execute(String),
}

impl fmt::Display for ExecuteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ExecuteError::Compile(msg) => write!(f, "Compilation failed: {}", msg),
            ExecuteError::Execute(msg) => write!(f, "Execution failed: {}", msg),
        }
    }
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    let expr = tuff_source.trim();
    if expr.is_empty() {
        return "#include <stdio.h>\nint main(int argc, char* argv[]) { return 0; }\n".into();
    }

    // Parse statements
    let mut declarations = String::new();
    let mut return_expr = expr;

    // Handle let declarations
    if let Some(semi_idx) = expr.find(';') {
        let before_semi = &expr[..semi_idx];
        return_expr = &expr[semi_idx + 1..].trim();
        if let Some(let_end) = before_semi.strip_prefix("let ") {
            // Extract variable name and check if it's assigned from args
            if let Some((var_name, _type_annotation)) = let_end.split_once(':') {
                let var_name = var_name.trim();
                let rest = _type_annotation.trim();
                if let Some(assign_val) = rest.strip_suffix("= args") {
                    let _ = assign_val; // Type annotation, ignore for now
                    declarations.push_str(&format!("    char** {} = argv;\n", var_name));
                }
            }
        }
    }

    // Handle .length on args or variables that reference args
    let final_value = if return_expr == "args.length" {
        "argc"
    } else if let Some(var_name) = return_expr.strip_suffix(".length") {
        let var_name = var_name.trim();
        // Check if this variable was declared as args
        if declarations.contains(&format!("char** {} = argv", var_name)) {
            "argc"
        } else {
            return_expr
        }
    } else {
        return_expr
    };

    format!(
        "#include <stdio.h>\nint main(int argc, char* argv[]) {{\n{}\n    return {};\n}}\n",
        declarations, final_value
    )
}

fn execute_tuff(tuff_source: &str, args: Vec<String>) -> Result<i32, ExecuteError> {
    let c_source = compile_tuff_to_c(tuff_source);

    // 1) Save the c_source to a temp .c file
    let temp_dir = env::temp_dir();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let c_file = temp_dir.join(format!("tuff_temp_{}.c", timestamp));
    let exe_file = temp_dir.join(format!("tuff_temp_{}.exe", timestamp));
    fs::write(&c_file, &c_source).map_err(|e| ExecuteError::Compile(e.to_string()))?;

    // 2) Compile the generated .c file using clang
    let compile = Command::new("clang")
        .args([&c_file.to_string_lossy(), "-o", &exe_file.to_string_lossy()])
        .status()
        .map_err(|e| ExecuteError::Compile(e.to_string()))?;
    if !compile.success() {
        return Err(ExecuteError::Compile("clang returned non-zero exit code".into()));
    }

    // 3) Execute the generated binary using args
    let output = Command::new(&exe_file)
        .args(&args)
        .output()
        .map_err(|e| ExecuteError::Execute(e.to_string()))?;

    // 4) Return the exit code
    let exit_code = output.status.code().unwrap_or(-1);

    // Clean up temp files
    let _ = fs::remove_file(&c_file);
    let _ = fs::remove_file(&exe_file);

    Ok(exit_code)
}

fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
    let c_source = compile_tuff_to_c(tuff_source);
    let actual_exit_code = execute_tuff(tuff_source, args).expect("execute_tuff failed");

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

    #[test]
    fn test_execute_tuff_args_length_empty() {
        expect_valid("args.length", vec![], 1);
    }

    #[test]
    fn test_execute_tuff_let_args_length() {
        expect_valid("let args0 : &[&Str] = args; args0.length", vec![], 1);
    }
}

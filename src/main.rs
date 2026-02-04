fn compile_tuff_to_js(inpsourceut: String) -> Result<String, String> {
    // Strip type suffixes from numeric literals
    // E.g., "100U8" -> "100", "42I32" -> "42", "-100I8" -> "-100"
    // Error on negative unsigned types: "-100U8" -> Err
    let mut result = inpsourceut.clone();

    // Check for unsigned type suffixes
    let unsigned_types = ["U8", "U16", "U32", "U64"];
    for unsigned_type in &unsigned_types {
        if result.ends_with(unsigned_type) {
            if let Some(captured) = result.strip_suffix(unsigned_type) {
                if captured.starts_with('-') {
                    return Err(format!(
                        "Negative numbers cannot have unsigned type suffixes: {}",
                        inpsourceut
                    ));
                }
                result = captured.to_string();
                return Ok(result);
            }
        }
    }

    // Remove type suffixes at the end for signed and float types
    if let Some(captured) = result
        .strip_suffix("I8")
        .or_else(|| result.strip_suffix("I16"))
        .or_else(|| result.strip_suffix("I32"))
        .or_else(|| result.strip_suffix("I64"))
        .or_else(|| result.strip_suffix("F32"))
        .or_else(|| result.strip_suffix("F64"))
    {
        result = captured.to_string();
    }

    Ok(result)
}

fn execute_js(source: &str) -> i32 {
    use boa_engine::{Context, Source};

    // Empty source code evaluates to 0
    if source.is_empty() {
        return 0;
    }

    let mut context = Context::default();
    let source = Source::from_bytes(source.as_bytes());

    match context.eval(source) {
        Ok(result) => {
            // Convert the result to string and try to parse as i32
            let result_str = result
                .to_string(&mut context)
                .map(|s| s.to_std_string().unwrap_or_default())
                .unwrap_or_default();
            result_str.parse::<i32>().unwrap_or(1)
        }
        Err(_) => 1, // Return 1 on error
    }
}

fn run(source: String) -> i32 {
    match compile_tuff_to_js(source) {
        Ok(js_source) => execute_js(&js_source),
        Err(_) => 1, // Return error code on compilation failure
    }
}

fn main() {
    // REPL for run

    use std::io::{self, Write};

    loop {
        print!("tuff> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin().read_line(&mut input).unwrap();

        let result = run(input.trim().to_string());
        println!("Result: {}", result);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_empty_string() {
        assert_eq!(run("".to_string()), 0);
    }

    #[test]
    fn test_run_numeric_literal() {
        assert_eq!(run("100".to_string()), 100);
    }

    #[test]
    fn test_run_typed_numeric_literal() {
        assert_eq!(run("100U8".to_string()), 100);
    }

    #[test]
    fn test_run_negative_unsigned_typed_literal() {
        assert_eq!(run("-100U8".to_string()), 1); // Error code
    }

    #[test]
    fn test_run_negative_signed_typed_literal() {
        assert_eq!(run("-100I8".to_string()), -100);
    }
}

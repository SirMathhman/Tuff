fn compile_tuff_to_js(inpsourceut: String) -> Result<String, String> {
    // Strip type suffixes from numeric literals
    // E.g., "100U8" -> "100", "42I32" -> "42", "-100I8" -> "-100"
    let mut result = inpsourceut.clone();

    // Remove type suffixes at the end
    if let Some(captured) = result
        .strip_suffix("U8")
        .or_else(|| result.strip_suffix("U16"))
        .or_else(|| result.strip_suffix("U32"))
        .or_else(|| result.strip_suffix("U64"))
        .or_else(|| result.strip_suffix("I8"))
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
    fn test_run_negative_typed_numeric_literal() {
        assert_eq!(run("-100I8".to_string()), -100);
    }
}

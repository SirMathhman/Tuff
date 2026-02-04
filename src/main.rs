fn compile_tuff_to_js(inpsourceut: String) -> String {
    // For now, just return empty string for empty input
    if inpsourceut.is_empty() {
        return String::new();
    }
    todo!("not implemented")
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
    let js_source: String = compile_tuff_to_js(source);
    return execute_js(&js_source);
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
}

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

fn compile_tuff_to_c(_tuff_source: &str) -> Result<String, CompileError> {
    Ok(String::new())
}

fn expect_valid(_tuff_source: &str, _args: Vec<String>, expected_exit_code: i32) {
    let generated_result = compile_tuff_to_c(_tuff_source);
    if let Err(generation_error) = generated_result {
        panic!("Failed to compile: '{}'", generation_error)
    }
    let generated_c = generated_result.unwrap();

    let actual_exit_code = 0;
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
}



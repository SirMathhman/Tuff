use core::panic;

fn main() {
    /*
    Read from index.tuff
    Compile Tuff to C
    Write generated C to index.c
    */

    todo!()
}

#[derive(Debug, Display)]
struct CompileError {}

fn compile_tuff_to_c(tuff_source: &str) -> Result<String, CompileError> {
    Ok(String::new())
}

fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
    let generated_result = compile_tuff_to_c(tuff_source);
    if let Err(generation_error) = generated_result {
        panic!("Failed to compile: '{}'", generation_error)
    }
    let generated_c = generated_result.unwrap();

    /*
    1) Write the c to a temp .c file (not in the root directory)
    2) Compile the temp .c file to a .exe using clang. If C compilation fails, provide an error and include the generated .c
    3) Execute the .exe using args
    4) Get the actual exit code
    */

    let actual_exit_code = -1;
    if expected_exit_code != actual_exit_code {
        panic!(
            "Expected exit code {} but was actually {}. Generated: '{}'",
            expected_exit_code, actual_exit_code, generated_c
        )
    }

    todo!()
}

fn expect_invalid(tuff_source: &str) {
    let result = compile_tuff_to_c(tuff_source);
    if let Ok(generated_c) = result {
        panic!(
            "Expected compiler to fail, but generated: '{}'",
            generated_c
        )
    }
}



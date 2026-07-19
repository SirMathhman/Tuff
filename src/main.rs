use core::panic;
use std::fmt::Error;

fn main() {}

fn compile_tuff_to_c(tuff_source_code: &str) -> Result<String, Error> {
    todo!()
}

fn execute_generated_c(c_source_code: &str, args : Vec<&str>) -> i32 {
    todo!()
}

fn expect_valid(tuff_source_code: &str, args: Vec<&str>, expected_exit_code: i32) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Err(error) = compile_result {
        panic!("Failed to compile: '{}'", error)
    }
    let c_source_code = compile_result.unwrap();

    let actual_exit_code = execute_generated_c(c_source_code.as_str(), args);
    if (expected_exit_code != actual_exit_code) {
        panic!(
            "Expected exit code '{}' but was actually '{}'. Generated C: {}",
            expected_exit_code, actual_exit_code, c_source_code
        );
    }
}

fn expect_invalid(tuff_source_code: &str) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Ok(c_source_code) = compile_result {
        panic!(
            "Expected test to fail, but compilation succeeded with generated code: '{}'",
            c_source_code
        )
    }
}

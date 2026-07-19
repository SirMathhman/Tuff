use core::panic;
use std::fmt::Error;
use std::process::Command;
use std::io::Write;
use std::sync::atomic::{AtomicU32, Ordering};

fn main() {}

static TEMP_COUNTER: AtomicU32 = AtomicU32::new(0);

fn compile_tuff_to_c(tuff_source_code: &str) -> Result<String, Error> {
    let s = tuff_source_code.trim();

    if s.is_empty() {
        return Ok("int main() {\n    return 0;\n}\n".to_string());
    }

    // Parse the literal
    let (sign, rest) = if let Some(stripped) = s.strip_prefix('-') {
        (-1i128, stripped)
    } else if let Some(stripped) = s.strip_prefix('+') {
        (1, stripped)
    } else {
        (1, s)
    };

    // Find where digits end and optional suffix begins
    let digit_end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    if digit_end == 0 {
        return Err(Error);
    }

    let digits = &rest[..digit_end];
    let suffix = &rest[digit_end..];

    let abs_value: i128 = digits.parse().map_err(|_| Error)?;
    let value = sign * abs_value;

    // Determine the type, validate range, and emit C code
    let (c_type, min, max): (&str, i128, i128) = match suffix {
        "" | "I32" => ("int", i32::MIN as i128, i32::MAX as i128),
        "U8" => ("unsigned char", 0, u8::MAX as i128),
        "I8" => ("signed char", i8::MIN as i128, i8::MAX as i128),
        "I16" => ("short", i16::MIN as i128, i16::MAX as i128),
        "U32" => ("unsigned int", 0, u32::MAX as i128),
        "I64" => ("long long", i64::MIN as i128, i64::MAX as i128),
        "U64" => ("unsigned long long", 0, u64::MAX as i128),
        _ => return Err(Error),
    };

    if value < min || value > max {
        return Err(Error);
    }

    let c_code = format!(
        "int main() {{\n    return ({})({});\n}}\n",
        c_type, value
    );
    Ok(c_code)
}

#[allow(dead_code)]
fn execute_generated_c(c_source_code: &str, _args: Vec<&str>) -> i32 {
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp_dir = std::env::temp_dir();
    let stem = format!("tuff_program_{}", counter);
    let c_file = temp_dir.join(format!("{}.c", stem));
    let exe_file = temp_dir.join(format!("{}.exe", stem));

    let mut file = std::fs::File::create(&c_file).expect("Failed to create temp C file");
    file.write_all(c_source_code.as_bytes()).expect("Failed to write temp C file");

    let output = Command::new("clang")
        .arg(&c_file)
        .arg("-o")
        .arg(&exe_file)
        .output()
        .expect("Failed to compile with clang");

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        panic!("C compilation failed: {}", stderr);
    }

    let run_output = Command::new(&exe_file)
        .output()
        .expect("Failed to run compiled program");

    let _ = std::fs::remove_file(&c_file);
    let _ = std::fs::remove_file(&exe_file);

    run_output.status.code().unwrap_or(-1)
}

#[allow(dead_code)]
fn expect_valid(tuff_source_code: &str, args: Vec<&str>, expected_exit_code: i32) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Err(error) = compile_result {
        panic!("Failed to compile: '{}'", error)
    }
    let c_source_code = compile_result.unwrap();

    let actual_exit_code = execute_generated_c(c_source_code.as_str(), args);
    if expected_exit_code != actual_exit_code {
        panic!(
            "Expected exit code '{}' but was actually '{}'. Generated C: {}",
            expected_exit_code, actual_exit_code, c_source_code
        );
    }
}

#[allow(dead_code)]
fn expect_invalid(tuff_source_code: &str) {
    let compile_result = compile_tuff_to_c(tuff_source_code);
    if let Ok(c_source_code) = compile_result {
        panic!(
            "Expected test to fail, but compilation succeeded with generated code: '{}'",
            c_source_code
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Positive: empty program ---

    #[test]
    fn empty_program() {
        expect_valid("", vec![], 0);
    }

    // --- Positive: integer literals (default I32) ---

    #[test]
    fn integer_literal() {
        expect_valid("42", vec![], 42);
    }

    #[test]
    fn integer_literal_zero() {
        expect_valid("0", vec![], 0);
    }

    #[test]
    fn integer_literal_negative() {
        expect_valid("-10", vec![], -10);
    }

    #[test]
    fn integer_literal_with_whitespace() {
        expect_valid("  42  ", vec![], 42);
    }

    // --- Positive: type suffixes ---

    #[test]
    fn integer_literal_u8() {
        expect_valid("100U8", vec![], 100);
    }

    #[test]
    fn integer_literal_u8_max() {
        expect_valid("255U8", vec![], 255);
    }

    #[test]
    fn integer_literal_i8() {
        expect_valid("-1I8", vec![], -1);
    }

    #[test]
    fn integer_literal_i8_min() {
        expect_valid("-128I8", vec![], -128);
    }

    #[test]
    fn integer_literal_i16() {
        expect_valid("200I16", vec![], 200);
    }

    #[test]
    fn integer_literal_i64() {
        expect_valid("99999I64", vec![], 99999);
    }

    #[test]
    fn integer_literal_u64() {
        expect_valid("123U64", vec![], 123);
    }

    // --- Negative: non-numeric ---

    #[test]
    fn invalid_character() {
        expect_invalid("?");
    }

    #[test]
    fn invalid_non_numeric() {
        expect_invalid("abc");
    }

    #[test]
    fn invalid_bad_suffix() {
        expect_invalid("42XYZ");
    }

    // --- Negative: overflow ---

    #[test]
    fn overflow_u8() {
        expect_invalid("256U8");
    }

    #[test]
    fn underflow_u8() {
        expect_invalid("-1U8");
    }

    #[test]
    fn overflow_i8() {
        expect_invalid("128I8");
    }

    #[test]
    fn underflow_i8() {
        expect_invalid("-129I8");
    }

    #[test]
    fn overflow_i16() {
        expect_invalid("32768I16");
    }

    #[test]
    fn underflow_i16() {
        expect_invalid("-32769I16");
    }

    #[test]
    fn overflow_i32() {
        expect_invalid("2147483648I32");
    }

    #[test]
    fn underflow_i32() {
        expect_invalid("-2147483649I32");
    }

    #[test]
    fn overflow_default_i32() {
        // unsuffixed literal that overflows I32
        expect_invalid("9999999999999999999");
    }
}

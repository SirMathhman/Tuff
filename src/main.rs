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

    let tokens = tokenize(s)?;
    let mut pos = 0;
    let result = parse_expression(&tokens, &mut pos)?;
    if pos != tokens.len() {
        return Err(Error);
    }

    let (min, max) = type_bounds(&result.type_name);
    if result.value < min || result.value > max {
        return Err(Error);
    }

    let c_type = type_to_c_type(&result.type_name);
    let c_code = format!(
        "int main() {{\n    return ({})({});\n}}\n",
        c_type, result.value
    );
    Ok(c_code)
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Lit { value: i128, suffix: String },
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
}

fn tokenize(s: &str) -> Result<Vec<Token>, Error> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        i = tokenize_step(&chars, i, &mut tokens)?;
    }
    Ok(tokens)
}

fn tokenize_step(chars: &[char], i: usize, tokens: &mut Vec<Token>) -> Result<usize, Error> {
    if chars[i].is_ascii_whitespace() {
        return Ok(i + 1);
    }
    let (token, next) = tokenize_one(chars, i)?;
    tokens.push(token);
    Ok(next)
}

fn tokenize_one(chars: &[char], i: usize) -> Result<(Token, usize), Error> {
    if chars[i].is_ascii_digit() {
        tokenize_number(chars, i)
    } else {
        tokenize_operator(chars, i)
    }
}

fn tokenize_number(chars: &[char], start: usize) -> Result<(Token, usize), Error> {
    let mut i = start;
    while i < chars.len() && chars[i].is_ascii_digit() {
        i += 1;
    }
    let digits: String = chars[start..i].iter().collect();
    let value: i128 = digits.parse().map_err(|_| Error)?;
    let mut suffix = String::new();
    while i < chars.len() && chars[i].is_ascii_alphanumeric() {
        suffix.push(chars[i]);
        i += 1;
    }
    if !suffix.is_empty() && type_bounds(&suffix).0 == i128::MAX {
        return Err(Error);
    }
    Ok((Token::Lit { value, suffix }, i))
}

fn tokenize_operator(chars: &[char], i: usize) -> Result<(Token, usize), Error> {
    let tok = match chars[i] {
        '+' => Token::Plus,
        '-' => Token::Minus,
        '*' => Token::Star,
        '/' => Token::Slash,
        '%' => Token::Percent,
        _ => return Err(Error),
    };
    Ok((tok, i + 1))
}

#[derive(Debug, Clone)]
struct TypedValue {
    value: i128,
    type_name: String,
}

fn parse_expression(tokens: &[Token], pos: &mut usize) -> Result<TypedValue, Error> {
    let mut left = parse_term(tokens, pos)?;
    while *pos < tokens.len() {
        let op = match &tokens[*pos] {
            Token::Plus => bin_op_add as fn(i128, i128) -> i128,
            Token::Minus => bin_op_sub as fn(i128, i128) -> i128,
            _ => break,
        };
        *pos += 1;
        let right = parse_term(tokens, pos)?;
        left = apply_bin_op(left, right, op)?;
    }
    Ok(left)
}

fn bin_op_add(a: i128, b: i128) -> i128 { a + b }
fn bin_op_sub(a: i128, b: i128) -> i128 { a - b }

fn parse_term(tokens: &[Token], pos: &mut usize) -> Result<TypedValue, Error> {
    let mut left = parse_factor(tokens, pos)?;
    while *pos < tokens.len() {
        let (op, is_div_or_mod) = match &tokens[*pos] {
            Token::Star => (bin_op_star as fn(i128, i128) -> i128, false),
            Token::Slash => (bin_op_slash as fn(i128, i128) -> i128, true),
            Token::Percent => (bin_op_percent as fn(i128, i128) -> i128, true),
            _ => break,
        };
        *pos += 1;
        let right = parse_factor(tokens, pos)?;
        check_div_by_zero(is_div_or_mod, right.value)?;
        left = apply_bin_op(left, right, op)?;
    }
    Ok(left)
}

fn check_div_by_zero(is_div_or_mod: bool, value: i128) -> Result<(), Error> {
    if is_div_or_mod && value == 0 {
        Err(Error)
    } else {
        Ok(())
    }
}

fn bin_op_star(a: i128, b: i128) -> i128 { a * b }
fn bin_op_slash(a: i128, b: i128) -> i128 { a / b }
fn bin_op_percent(a: i128, b: i128) -> i128 { a % b }

fn parse_factor(tokens: &[Token], pos: &mut usize) -> Result<TypedValue, Error> {
    if *pos >= tokens.len() {
        return Err(Error);
    }
    if tokens[*pos] == Token::Minus {
        return parse_negated_factor(tokens, pos);
    }
    match &tokens[*pos] {
        Token::Lit { value, suffix } => {
            let type_name = suffix_to_type_name(suffix);
            *pos += 1;
            Ok(TypedValue { value: *value, type_name })
        }
        _ => Err(Error),
    }
}

fn parse_negated_factor(tokens: &[Token], pos: &mut usize) -> Result<TypedValue, Error> {
    *pos += 1;
    let mut inner = parse_factor(tokens, pos)?;
    let (min, _max) = type_bounds(&inner.type_name);
    if -inner.value < min {
        return Err(Error);
    }
    inner.value = -inner.value;
    Ok(inner)
}

fn suffix_to_type_name(suffix: &str) -> String {
    if suffix.is_empty() { "I32".to_string() } else { suffix.to_string() }
}

fn apply_bin_op(
    left: TypedValue,
    right: TypedValue,
    op: fn(i128, i128) -> i128,
) -> Result<TypedValue, Error> {
    let result_type = promote_type(&left.type_name, &right.type_name);
    let (min, max) = type_bounds(&result_type);

    let l = left.value;
    let r = right.value;

    // Check for overflow: compute in i128 and check bounds
    let result = op(l, r);
    if result < min || result > max {
        return Err(Error);
    }

    Ok(TypedValue {
        value: result,
        type_name: result_type,
    })
}

fn type_rank(name: &str) -> u32 {
    match name {
        "U8" => 0,
        "I8" => 1,
        "I16" => 2,
        "I32" => 3,
        "U32" => 4,
        "I64" => 5,
        "U64" => 6,
        _ => 99,
    }
}

fn promote_type(a: &str, b: &str) -> String {
    if type_rank(a) >= type_rank(b) {
        a.to_string()
    } else {
        b.to_string()
    }
}

fn type_bounds(name: &str) -> (i128, i128) {
    match name {
        "U8" => (0, u8::MAX as i128),
        "I8" => (i8::MIN as i128, i8::MAX as i128),
        "I16" => (i16::MIN as i128, i16::MAX as i128),
        "I32" => (i32::MIN as i128, i32::MAX as i128),
        "U32" => (0, u32::MAX as i128),
        "I64" => (i64::MIN as i128, i64::MAX as i128),
        "U64" => (0, u64::MAX as i128),
        _ => (i128::MAX, i128::MIN), // sentinel: invalid type
    }
}

fn type_to_c_type(name: &str) -> &str {
    match name {
        "U8" => "unsigned char",
        "I8" => "signed char",
        "I16" => "short",
        "I32" => "int",
        "U32" => "unsigned int",
        "I64" => "long long",
        "U64" => "unsigned long long",
        _ => "int",
    }
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

    // --- Positive: arithmetic (I32 by default) ---

    #[test]
    fn arithmetic_add() {
        expect_valid("1 + 2", vec![], 3);
    }

    #[test]
    fn arithmetic_sub() {
        expect_valid("5 - 3", vec![], 2);
    }

    #[test]
    fn arithmetic_mul() {
        expect_valid("3 * 4", vec![], 12);
    }

    #[test]
    fn arithmetic_div() {
        expect_valid("10 / 3", vec![], 3);
    }

    #[test]
    fn arithmetic_mod() {
        expect_valid("10 % 3", vec![], 1);
    }

    #[test]
    fn arithmetic_chain() {
        expect_valid("1 + 2 + 3 + 4", vec![], 10);
    }

    // --- Positive: arithmetic with precedence ---

    #[test]
    fn precedence_mul_before_add() {
        expect_valid("2 + 3 * 4", vec![], 14);
    }

    #[test]
    fn precedence_div_before_add() {
        expect_valid("10 / 2 + 3", vec![], 8);
    }

    #[test]
    fn precedence_mul_before_sub() {
        expect_valid("10 - 2 * 3", vec![], 4);
    }

    #[test]
    fn precedence_multiple() {
        expect_valid("10 * 2 + 3 * 4", vec![], 32);
    }

    // --- Positive: unary minus ---

    #[test]
    fn arithmetic_neg_start() {
        expect_valid("-5 + 3", vec![], -2);
    }

    #[test]
    fn arithmetic_neg_middle() {
        expect_valid("3 + -5", vec![], -2);
    }

    #[test]
    fn arithmetic_neg_twice() {
        expect_valid("--5", vec![], 5);
    }

    // --- Positive: arithmetic with type suffixes ---

    #[test]
    fn arithmetic_u8_ok() {
        expect_valid("200U8 + 55U8", vec![], 255);
    }

    #[test]
    fn arithmetic_mixed_types() {
        expect_valid("100U8 + 200I16", vec![], 300);
    }

    // --- Negative: arithmetic overflow ---

    #[test]
    fn arithmetic_overflow_u8() {
        expect_invalid("200U8 + 100U8");
    }

    #[test]
    fn arithmetic_overflow_i8() {
        expect_invalid("127I8 + 1I8");
    }

    #[test]
    fn arithmetic_underflow_i8() {
        expect_invalid("-128I8 + -1I8");
    }

    #[test]
    fn arithmetic_overflow_mul() {
        expect_invalid("100000 * 100000");
    }

    // --- Negative: division by zero ---

    #[test]
    fn arithmetic_div_by_zero() {
        expect_invalid("1 / 0");
    }

    #[test]
    fn arithmetic_mod_by_zero() {
        expect_invalid("5 % 0");
    }

    // --- Negative: invalid arithmetic syntax ---

    #[test]
    fn arithmetic_double_op() {
        expect_invalid("1 ++ 2");
    }
}

use core::panic;
use std::collections::HashMap;
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
    let mut env = VarEnv::new();
    let mut c_stmts: Vec<String> = Vec::new();

    parse_stmts(&tokens, &mut pos, &mut env, &mut c_stmts)?;

    let result = parse_expression(&tokens, &mut pos, &env)?;
    if pos != tokens.len() {
        return Err(Error);
    }

    let (min, max) = type_bounds(&result.type_name);
    if result.value < min || result.value > max {
        return Err(Error);
    }

    let c_type = type_to_c_type(&result.type_name);
    let mut c_code = String::from("int main() {\n");
    for stmt in &c_stmts {
        c_code.push_str(&format!("    {};\n", stmt));
    }
    c_code.push_str(&format!("    return ({})({});\n}}\n", c_type, result.value));
    Ok(c_code)
}

fn parse_stmts(tokens: &[Token], pos: &mut usize, env: &mut VarEnv, c_stmts: &mut Vec<String>) -> Result<(), Error> {
    while *pos < tokens.len() && parse_one_stmt(tokens, pos, env, c_stmts)? {
        // continue parsing statements
    }
    Ok(())
}

fn parse_one_stmt(tokens: &[Token], pos: &mut usize, env: &mut VarEnv, c_stmts: &mut Vec<String>) -> Result<bool, Error> {
    if *pos >= tokens.len() {
        return Ok(false);
    }
    if tokens[*pos] == Token::Let {
        let stmt = parse_let_stmt(tokens, pos, env)?;
        c_stmts.push(stmt);
        return Ok(true);
    }
    if is_assignment_start(tokens, *pos) {
        let stmt = parse_assign_stmt(tokens, pos, env)?;
        c_stmts.push(stmt);
        return Ok(true);
    }
    if tokens[*pos] == Token::LBrace {
        let stmt = parse_block_stmt(tokens, pos, env)?;
        c_stmts.push(stmt);
        return Ok(true);
    }
    Ok(false)
}

fn parse_block_stmt(tokens: &[Token], pos: &mut usize, env: &mut VarEnv) -> Result<String, Error> {
    // consume {
    *pos += 1;

    // Save the set of variable names that existed before this block
    let outer_vars: Vec<String> = env.vars.keys().cloned().collect();
    let outer_c_names: Vec<String> = env.c_names.keys().cloned().collect();
    let outer_shadow: Vec<String> = env.shadow_count.keys().cloned().collect();

    let mut inner_stmts: Vec<String> = Vec::new();
    parse_stmts(tokens, pos, env, &mut inner_stmts)?;

    // expect }
    if *pos >= tokens.len() || tokens[*pos] != Token::RBrace {
        return Err(Error);
    }
    *pos += 1;

    // Remove variables declared inside the block (block-scoped)
    env.vars.retain(|k, _| outer_vars.contains(k));
    env.c_names.retain(|k, _| outer_c_names.contains(k));
    env.shadow_count.retain(|k, _| outer_shadow.contains(k));

    let mut c_block = String::from("{\n");
    for stmt in &inner_stmts {
        c_block.push_str(&format!("        {};\n", stmt));
    }
    c_block.push_str("    }");
    Ok(c_block)
}

fn is_assignment_start(tokens: &[Token], pos: usize) -> bool {
    matches!(&tokens[pos], Token::Ident(_))
        && pos + 1 < tokens.len()
        && tokens[pos + 1] == Token::Equals
}

fn parse_let_stmt(tokens: &[Token], pos: &mut usize, env: &mut VarEnv) -> Result<String, Error> {
    // consume 'let'
    *pos += 1;

    // optional 'mut'
    let is_mut = if *pos < tokens.len() && tokens[*pos] == Token::Mut {
        *pos += 1;
        true
    } else {
        false
    };

    // variable name
    let name = match &tokens.get(*pos) {
        Some(Token::Ident(n)) => {
            *pos += 1;
            n.clone()
        }
        _ => return Err(Error),
    };

    // Get a fresh C name for this variable (handles shadowing)
    let c_name = env.fresh_c_name(&name);

    // colon
    expect_token(tokens, pos, Token::Colon)?;

    // type annotation
    let type_name = match &tokens.get(*pos) {
        Some(Token::Ident(t)) => {
            *pos += 1;
            t.clone()
        }
        _ => return Err(Error),
    };
    // validate type
    if type_bounds(&type_name).0 == i128::MAX {
        return Err(Error);
    }

    // equals
    expect_token(tokens, pos, Token::Equals)?;

    // initializer expression
    let value = parse_expression(tokens, pos, env)?;
    let raw_value = value.value;

    // semicolon
    expect_token(tokens, pos, Token::Semicolon)?;

    // store in environment
    env.set(name.clone(), TypedValue {
        value: raw_value,
        type_name: type_name.clone(),
        is_mut,
    });

    let c_type = type_to_c_type(&type_name);
    Ok(format!("{} {} = {}", c_type, c_name, raw_value))
}

fn parse_assign_stmt(tokens: &[Token], pos: &mut usize, env: &mut VarEnv) -> Result<String, Error> {
    let name = match &tokens[*pos] {
        Token::Ident(n) => n.clone(),
        _ => return Err(Error),
    };
    *pos += 1;

    // Check variable exists and is mutable
    let var = env.get(&name).ok_or(Error)?;
    if !var.is_mut {
        return Err(Error);
    }

    // equals
    expect_token(tokens, pos, Token::Equals)?;

    // value expression
    let value = parse_expression(tokens, pos, env)?;

    // semicolon
    expect_token(tokens, pos, Token::Semicolon)?;

    // update environment
    env.set(name.clone(), TypedValue { value: value.value, type_name: var.type_name.clone(), is_mut: true });

    let c_name = env.get_c_name(&name);
    Ok(format!("{} = {}", c_name, value.value))
}

fn expect_token(tokens: &[Token], pos: &mut usize, expected: Token) -> Result<(), Error> {
    if *pos >= tokens.len() || tokens[*pos] != expected {
        return Err(Error);
    }
    *pos += 1;
    Ok(())
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Lit { value: i128, suffix: String },
    Ident(String),
    Let,
    Mut,
    True,
    False,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Colon,
    Semicolon,
    Equals,
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
        return tokenize_number(chars, i);
    }
    if chars[i].is_ascii_alphabetic() || chars[i] == '_' {
        return tokenize_ident_or_keyword(chars, i);
    }
    tokenize_symbol(chars, i)
}

fn tokenize_ident_or_keyword(chars: &[char], start: usize) -> Result<(Token, usize), Error> {
    let mut i = start;
    while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
        i += 1;
    }
    let word: String = chars[start..i].iter().collect();
    let token = match word.as_str() {
        "let" => Token::Let,
        "mut" => Token::Mut,
        "true" => Token::True,
        "false" => Token::False,
        _ => Token::Ident(word),
    };
    Ok((token, i))
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

fn tokenize_symbol(chars: &[char], i: usize) -> Result<(Token, usize), Error> {
    let tok = match chars[i] {
        '+' => Token::Plus,
        '-' => Token::Minus,
        '*' => Token::Star,
        '/' => Token::Slash,
        '%' => Token::Percent,
        '(' => Token::LParen,
        ')' => Token::RParen,
        '{' => Token::LBrace,
        '}' => Token::RBrace,
        ':' => Token::Colon,
        ';' => Token::Semicolon,
        '=' => Token::Equals,
        _ => return Err(Error),
    };
    Ok((tok, i + 1))
}

#[derive(Debug, Clone)]
struct TypedValue {
    value: i128,
    type_name: String,
    is_mut: bool,
}

struct VarEnv {
    pub vars: HashMap<String, TypedValue>,
    pub c_names: HashMap<String, String>,
    pub shadow_count: HashMap<String, u32>,
}

impl VarEnv {
    fn new() -> Self {
        VarEnv {
            vars: HashMap::new(),
            c_names: HashMap::new(),
            shadow_count: HashMap::new(),
        }
    }

    fn get(&self, name: &str) -> Option<&TypedValue> {
        self.vars.get(name)
    }

    fn set(&mut self, name: String, value: TypedValue) {
        self.vars.insert(name, value);
    }

    fn fresh_c_name(&mut self, name: &str) -> String {
        let count = self.shadow_count.entry(name.to_string()).or_insert(0);
        let c_name = shadow_name(name, *count);
        *count += 1;
        self.c_names.insert(name.to_string(), c_name.clone());
        c_name
    }

    fn get_c_name(&self, name: &str) -> String {
        self.c_names.get(name).cloned().unwrap_or_else(|| name.to_string())
    }
}

fn shadow_name(name: &str, count: u32) -> String {
    if count == 0 { name.to_string() } else { format!("{}_{}", name, count) }
}

fn parse_expression(tokens: &[Token], pos: &mut usize, env: &VarEnv) -> Result<TypedValue, Error> {
    let mut left = parse_term(tokens, pos, env)?;
    while *pos < tokens.len() {
        let op = match &tokens[*pos] {
            Token::Plus => bin_op_add as fn(i128, i128) -> i128,
            Token::Minus => bin_op_sub as fn(i128, i128) -> i128,
            _ => break,
        };
        *pos += 1;
        let right = parse_term(tokens, pos, env)?;
        left = apply_bin_op(left, right, op)?;
    }
    Ok(left)
}

fn bin_op_add(a: i128, b: i128) -> i128 { a + b }
fn bin_op_sub(a: i128, b: i128) -> i128 { a - b }

fn parse_term(tokens: &[Token], pos: &mut usize, env: &VarEnv) -> Result<TypedValue, Error> {
    let mut left = parse_factor(tokens, pos, env)?;
    while *pos < tokens.len() {
        let (op, is_div_or_mod) = match &tokens[*pos] {
            Token::Star => (bin_op_star as fn(i128, i128) -> i128, false),
            Token::Slash => (bin_op_slash as fn(i128, i128) -> i128, true),
            Token::Percent => (bin_op_percent as fn(i128, i128) -> i128, true),
            _ => break,
        };
        *pos += 1;
        let right = parse_factor(tokens, pos, env)?;
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

fn parse_factor(tokens: &[Token], pos: &mut usize, env: &VarEnv) -> Result<TypedValue, Error> {
    if *pos >= tokens.len() {
        return Err(Error);
    }
    if tokens[*pos] == Token::Minus {
        return parse_negated_factor(tokens, pos, env);
    }
    if tokens[*pos] == Token::LParen {
        return parse_parenthesized(tokens, pos, env);
    }
    if tokens[*pos] == Token::True {
        *pos += 1;
        return Ok(TypedValue { value: 1, type_name: "Bool".to_string(), is_mut: false });
    }
    if tokens[*pos] == Token::False {
        *pos += 1;
        return Ok(TypedValue { value: 0, type_name: "Bool".to_string(), is_mut: false });
    }
    match &tokens[*pos] {
        Token::Lit { value, suffix } => {
            let type_name = suffix_to_type_name(suffix);
            *pos += 1;
            Ok(TypedValue { value: *value, type_name, is_mut: false })
        }
        Token::Ident(name) => {
            let var = env.get(name).ok_or(Error)?.clone();
            *pos += 1;
            Ok(var)
        }
        _ => Err(Error),
    }
}

fn parse_parenthesized(tokens: &[Token], pos: &mut usize, env: &VarEnv) -> Result<TypedValue, Error> {
    *pos += 1; // consume (
    if *pos >= tokens.len() || tokens[*pos] == Token::RParen {
        return Err(Error);
    }
    let result = parse_expression(tokens, pos, env)?;
    if *pos >= tokens.len() || tokens[*pos] != Token::RParen {
        return Err(Error);
    }
    *pos += 1; // consume )
    Ok(result)
}

fn parse_negated_factor(tokens: &[Token], pos: &mut usize, env: &VarEnv) -> Result<TypedValue, Error> {
    *pos += 1;
    let mut inner = parse_factor(tokens, pos, env)?;
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
    // Reject arithmetic on Bool values
    if left.type_name == "Bool" || right.type_name == "Bool" {
        return Err(Error);
    }

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
        is_mut: false,
    })
}

fn type_rank(name: &str) -> u32 {
    match name {
        "Bool" => 0,
        "U8" => 1,
        "I8" => 2,
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
        "Bool" => (0, 1),
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
        "Bool" => "int",
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

    // --- Positive: parentheses ---

    #[test]
    fn parens_simple() {
        expect_valid("(1 + 2) * 3", vec![], 9);
    }

    #[test]
    fn parens_with_division() {
        expect_valid("(10 + 2) / 3", vec![], 4);
    }

    #[test]
    fn parens_nested() {
        expect_valid("((1 + 2) * (3 + 4))", vec![], 21);
    }

    #[test]
    fn parens_deeply_nested() {
        expect_valid("(((1 + 2) * 3) - 4) / 5", vec![], 1);
    }

    #[test]
    fn parens_unary_minus() {
        expect_valid("-(2 + 3)", vec![], -5);
    }

    #[test]
    fn parens_negated_group() {
        expect_valid("-(2 + 3) * 4", vec![], -20);
    }

    // --- Negative: parentheses ---

    #[test]
    fn parens_empty() {
        expect_invalid("()");
    }

    #[test]
    fn parens_mismatched() {
        expect_invalid("(1 + 2");
    }

    #[test]
    fn parens_unopened() {
        expect_invalid("1 + 2)");
    }

    // --- Positive: let statements ---

    #[test]
    fn let_simple() {
        expect_valid("let x: I32 = 42; x", vec![], 42);
    }

    #[test]
    fn let_multiple() {
        expect_valid("let x: I32 = 10; let y: I32 = 20; x + y", vec![], 30);
    }

    #[test]
    fn let_mut_reassign() {
        expect_valid("let mut x: I32 = 10; x = 20; x", vec![], 20);
    }

    #[test]
    fn let_in_expression() {
        expect_valid("let x: I32 = 5; let y: I32 = 10; x * y + 2", vec![], 52);
    }

    #[test]
    fn let_shadow() {
        expect_valid("let x: I32 = 10; let x: I32 = 20; x", vec![], 20);
    }

    #[test]
    fn let_typed_u8() {
        expect_valid("let x: U8 = 200U8; let y: U8 = 55U8; x + y", vec![], 255);
    }

    // --- Negative: let statements ---

    #[test]
    fn let_missing_semicolon() {
        expect_invalid("let x: I32 = 42");
    }

    #[test]
    fn let_undeclared_var() {
        expect_invalid("let x: I32 = 42; y");
    }

    #[test]
    fn let_reassign_immutable() {
        expect_invalid("let x: I32 = 10; x = 20; x");
    }

    #[test]
    fn let_missing_type() {
        expect_invalid("let x = 42; x");
    }

    #[test]
    fn let_missing_name() {
        expect_invalid("let: I32 = 42;");
    }

    // --- Positive: blocks ---

    #[test]
    fn block_empty() {
        expect_valid("let mut x: I32 = 0; { x = 1; } x", vec![], 1);
    }

    #[test]
    fn block_scoped_var() {
        expect_valid("{ let x: I32 = 42; } 0", vec![], 0);
    }

    #[test]
    fn block_nested() {
        expect_valid("let mut x: I32 = 0; { { x = 1; } } x", vec![], 1);
    }

    #[test]
    fn block_multiple_stmts() {
        expect_valid("let mut x: I32 = 0; { let y: I32 = 10; x = y; } x", vec![], 10);
    }

    #[test]
    fn block_between_stmts() {
        expect_valid("let mut x: I32 = 0; { x = 1; } let y: I32 = x + 1; y", vec![], 2);
    }

    // --- Negative: blocks ---

    #[test]
    fn block_var_not_visible() {
        expect_invalid("{ let x: I32 = 42; } x");
    }

    #[test]
    fn block_missing_close() {
        expect_invalid("{ let x: I32 = 42;");
    }

    // --- Positive: Bool literals ---

    #[test]
    fn bool_true() {
        expect_valid("true", vec![], 1);
    }

    #[test]
    fn bool_false() {
        expect_valid("false", vec![], 0);
    }

    #[test]
    fn bool_typed_let() {
        expect_valid("let x: Bool = true; x", vec![], 1);
    }

    #[test]
    fn bool_false_let() {
        expect_valid("let x: Bool = false; x", vec![], 0);
    }

    // --- Negative: Bool ---

    #[test]
    fn bool_arithmetic() {
        expect_invalid("true + false");
    }

    #[test]
    fn bool_not_keyword() {
        expect_invalid("let true: I32 = 42;");
    }
}

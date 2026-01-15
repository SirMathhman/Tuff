use crate::validators::validate_type_range;
use std::collections::HashMap;

#[derive(Clone)]
pub struct VariableInfo {
    pub value: i32,
    pub type_name: String,
    pub is_mutable: bool,
}

pub type Environment = HashMap<String, VariableInfo>;

fn parse_number_inner(input: &str) -> Result<(i64, String, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();

    let digit_end = trimmed
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(trimmed.len());

    if digit_end == 0 {
        return Err("No digits found".to_string());
    }

    let digit_str = &trimmed[..digit_end];
    let value = digit_str.parse::<i64>().map_err(|e| e.to_string())?;

    let remainder = &trimmed[digit_end..];
    let suffix_end = remainder
        .find(|c: char| !c.is_alphanumeric())
        .unwrap_or(remainder.len());

    let suffix = &remainder[..suffix_end];
    let suffix_upper = suffix.to_uppercase();

    Ok((value, suffix_upper, ws_offset + digit_end + suffix_end))
}

pub fn parse_number_with_type(input: &str) -> Result<(i32, String, usize), String> {
    let (value, suffix_upper, len) = parse_number_inner(input)?;
    let result = validate_type_range(&suffix_upper, value)?;
    Ok((result, suffix_upper, len))
}

pub fn parse_identifier(input: &str) -> Result<(String, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();

    let end = trimmed
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(trimmed.len());

    if end == 0 {
        return Err("No identifier found".to_string());
    }

    let ident = trimmed[..end].to_string();
    Ok((ident, ws_offset + end))
}

fn skip_whitespace(input: &str, pos: &mut usize) {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();
}

fn read_type_name_after_colon(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let (type_name, len) = parse_identifier(&input[*pos..])?;
    *pos += len;
    Ok(type_name)
}

fn parse_type_annotation_optional(input: &str, pos: &mut usize) -> Result<Option<String>, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with(':') {
        return Ok(None);
    }

    let ws_offset = rest.len() - trimmed.len();
    *pos += ws_offset + 1;

    let type_name = read_type_name_after_colon(input, pos)?;
    Ok(Some(type_name))
}

fn expect_closing(
    input: &str,
    pos: &mut usize,
    close: char,
    close_err: &str,
) -> Result<(), String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    if !trimmed.starts_with(close) {
        return Err(close_err.to_string());
    }
    *pos += 1;
    Ok(())
}

fn is_type_compatible(declared: &str, actual: &str) -> bool {
    // Empty type (no suffix) is compatible with any declared type
    if actual.is_empty() {
        return true;
    }

    // Same type is always compatible
    if declared == actual {
        return true;
    }

    // Type widening: smaller types can be assigned to larger types
    let widening_rules = [
        ("U16", &["U8"][..]),
        ("U32", &["U8", "U16"][..]),
        ("U64", &["U8", "U16", "U32"][..]),
        ("I16", &["I8"][..]),
        ("I32", &["I8", "I16"][..]),
        ("I64", &["I8", "I16", "I32"][..]),
    ];

    for (larger_type, smaller_types) in &widening_rules {
        if declared == *larger_type && smaller_types.contains(&actual) {
            return true;
        }
    }

    false
}

fn store_variable(
    env: &mut Environment,
    var_name: String,
    val: i32,
    declared_type: Option<String>,
    actual_type: String,
    is_mutable: bool,
) -> Result<(), String> {
    // If a type was declared, check that the actual type is compatible
    if let Some(ref decl_type) = declared_type {
        if !is_type_compatible(decl_type, &actual_type) {
            return Err(format!(
                "Type mismatch: declared type '{}' but got '{}'",
                decl_type, actual_type
            ));
        }
    }

    let stored_type = declared_type.unwrap_or(actual_type);
    env.insert(
        var_name,
        VariableInfo {
            value: val,
            type_name: stored_type,
            is_mutable,
        },
    );
    Ok(())
}

fn update_mutable_var(
    env: &mut Environment,
    var_name: String,
    var_info: VariableInfo,
    new_val: i32,
    new_type: String,
) -> Result<(), String> {
    if !is_type_compatible(&var_info.type_name, &new_type) {
        return Err(format!(
            "Type mismatch in assignment to '{}': declared type '{}' but got '{}'",
            var_name, var_info.type_name, new_type
        ));
    }

    env.insert(
        var_name,
        VariableInfo {
            value: new_val,
            type_name: var_info.type_name,
            is_mutable: true,
        },
    );
    Ok(())
}

fn parse_let_statement(input: &str, pos: &mut usize, env: &mut Environment) -> Result<(), String> {
    if !&input[*pos..].trim_start().starts_with("let ") {
        return Ok(());
    }

    skip_whitespace(input, pos);
    *pos += 4;

    skip_whitespace(input, pos);

    // Check for 'mut' keyword
    let is_mutable = if input[*pos..].trim_start().starts_with("mut ") {
        skip_whitespace(input, pos);
        *pos += 4;
        skip_whitespace(input, pos);
        true
    } else {
        false
    };

    let (var_name, len) = parse_identifier(&input[*pos..])?;
    *pos += len;

    if env.contains_key(&var_name) {
        return Err(format!("Variable '{}' is already declared", var_name));
    }

    let declared_type = parse_type_annotation_optional(input, pos)?;

    skip_whitespace(input, pos);

    if !input[*pos..].trim_start().starts_with('=') {
        return Err("Expected '=' in let statement".to_string());
    }
    *pos += 1;

    skip_whitespace(input, pos);

    let value = parse_term_with_type(input, pos, env)?;
    let (val, actual_type) = value;

    store_variable(env, var_name, val, declared_type, actual_type, is_mutable)?;

    skip_whitespace(input, pos);

    if !input[*pos..].trim_start().starts_with(';') {
        return Err("Expected ';' after let statement".to_string());
    }
    *pos += 1;

    Ok(())
}

fn parse_assignment_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    let ws_offset = rest.len() - trimmed.len();

    // Try to parse an identifier
    if !trimmed
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        return Ok(false);
    }

    // Look ahead to see if there's an '=' sign
    let (potential_var, var_len) = parse_identifier(trimmed)?;
    let after_var = &trimmed[var_len..];
    let after_var_trimmed = after_var.trim_start();

    if !after_var_trimmed.starts_with('=') {
        return Ok(false);
    }

    // This is an assignment
    *pos += ws_offset + var_len;
    let var_name = potential_var;

    // Check if variable exists and is mutable
    let var_info = env
        .get(&var_name)
        .ok_or_else(|| format!("Undefined variable: {}", var_name))?
        .clone();

    if !var_info.is_mutable {
        return Err(format!(
            "Cannot assign to immutable variable '{}'",
            var_name
        ));
    }

    skip_whitespace(input, pos);

    if !input[*pos..].trim_start().starts_with('=') {
        return Err("Expected '=' in assignment".to_string());
    }
    *pos += 1;

    skip_whitespace(input, pos);

    let (new_val, new_type) = parse_term_with_type(input, pos, env)?;
    update_mutable_var(env, var_name, var_info, new_val, new_type)?;

    skip_whitespace(input, pos);

    if !input[*pos..].trim_start().starts_with(';') {
        return Err("Expected ';' after assignment".to_string());
    }
    *pos += 1;

    Ok(true)
}

fn parse_block(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = 0i32;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed = rest.trim_start();
        *pos += rest.len() - trimmed.len();

        if trimmed.is_empty() || trimmed.starts_with('}') {
            break;
        }

        if trimmed.starts_with("let ") {
            parse_let_statement(input, pos, env)?;
        } else if parse_assignment_statement(input, pos, env)? {
            // Assignment was parsed
        } else {
            result = interpret_at(input, pos, env)?;
            break;
        }
    }

    Ok(result)
}

fn apply_multiplication_division(lhs: i32, op: char, rhs: i32) -> Result<i32, String> {
    match op {
        '*' => Ok(lhs * rhs),
        '/' => {
            if rhs == 0 {
                return Err("Division by zero".to_string());
            }
            Ok(lhs / rhs)
        }
        _ => Err(format!("Unknown operator: {}", op)),
    }
}

fn parse_term(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let (value, _) = parse_term_with_type(input, pos, env)?;
    Ok(value)
}

pub fn interpret_at(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = parse_term(input, pos, env)?;

    while *pos < input.len() {
        if let Some(op) = check_and_consume_op(input, pos, "+-") {
            let term = parse_term(input, pos, env)?;
            result = match op {
                '+' => result + term,
                '-' => result - term,
                _ => return Err(format!("Unknown operator: {}", op)),
            };
        } else {
            break;
        }
    }

    Ok(result)
}

fn parse_factor_with_type(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    skip_whitespace(input, pos);

    if input[*pos..].trim_start().starts_with('(') {
        *pos += 1;
        let result = interpret_at(input, pos, env)?;
        expect_closing(input, pos, ')', "Missing closing parenthesis")?;
        Ok((result, "".to_string()))
    } else if input[*pos..].trim_start().starts_with('{') {
        *pos += 1;
        let result = parse_block(input, pos, env)?;
        expect_closing(input, pos, '}', "Missing closing curly brace")?;
        Ok((result, "".to_string()))
    } else if input[*pos..]
        .trim_start()
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        let (var_name, len) = parse_identifier(&input[*pos..])?;
        *pos += len;
        let var_info = env
            .get(&var_name)
            .ok_or_else(|| format!("Undefined variable: {}", var_name))?
            .clone();
        Ok((var_info.value, var_info.type_name))
    } else {
        let (value, ty, len) = parse_number_with_type(&input[*pos..])?;
        *pos += len;
        Ok((value, ty))
    }
}

fn check_and_consume_op(input: &str, pos: &mut usize, ops: &str) -> Option<char> {
    let trimmed = input[*pos..].trim_start();
    let ws_len = input[*pos..].len() - trimmed.len();

    if let Some(op) = trimmed.chars().next() {
        if ops.contains(op) {
            *pos += ws_len + 1;
            return Some(op);
        }
    }
    None
}

fn parse_term_with_type(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    let (mut result, mut result_type) = parse_factor_with_type(input, pos, env)?;

    while *pos < input.len() {
        if let Some(op) = check_and_consume_op(input, pos, "*/") {
            let (factor, _) = parse_factor_with_type(input, pos, env)?;
            result = apply_multiplication_division(result, op, factor)?;
            result_type = "".to_string();
        } else {
            break;
        }
    }

    Ok((result, result_type))
}

fn parse_top_level_let(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("let ") {
        return Ok(false);
    }

    parse_let_statement(input, pos, env)?;
    Ok(true)
}

fn parse_top_level_assignment(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    parse_assignment_statement(input, pos, env)
}

pub fn interpret(input: &str) -> Result<i32, String> {
    let input = input.trim();
    let mut pos = 0;
    let mut env = Environment::new();

    loop {
        let parsed_let = parse_top_level_let(input, &mut pos, &mut env)?;
        let parsed_assign = parse_top_level_assignment(input, &mut pos, &mut env)?;

        if !parsed_let && !parsed_assign {
            break;
        }
    }

    // Skip whitespace after let statements
    let rest = &input[pos..];
    let trimmed = rest.trim_start();
    pos += rest.len() - trimmed.len();

    // If there's no expression, return 0
    if pos >= input.len() || trimmed.is_empty() {
        return Ok(0);
    }

    let result = interpret_at(input, &mut pos, &mut env)?;

    if pos < input.len() {
        let rest = &input[pos..].trim_start();
        if !rest.is_empty() {
            return Err(format!("Unexpected input: {}", rest));
        }
    }

    Ok(result)
}

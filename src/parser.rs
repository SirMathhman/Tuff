use crate::statements::{parse_block, parse_top_level_assignment, parse_top_level_let};
use crate::validators::validate_type_range;
use crate::variables::Environment;

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

pub fn skip_whitespace(input: &str, pos: &mut usize) {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();
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
    parse_or_expression(input, pos, env)
}

fn parse_or_expression(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = parse_and_expression(input, pos, env)?;

    while *pos < input.len() {
        let trimmed = input[*pos..].trim_start();
        if trimmed.starts_with("||") {
            *pos += input[*pos..].len() - trimmed.len() + 2;
            let rhs = parse_and_expression(input, pos, env)?;
            result = if result != 0 || rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }

    Ok(result)
}

fn parse_and_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let mut result = parse_addition_expression(input, pos, env)?;

    while *pos < input.len() {
        let trimmed = input[*pos..].trim_start();
        if trimmed.starts_with("&&") {
            *pos += input[*pos..].len() - trimmed.len() + 2;
            let rhs = parse_addition_expression(input, pos, env)?;
            result = if result != 0 && rhs != 0 { 1 } else { 0 };
        } else {
            break;
        }
    }

    Ok(result)
}

fn parse_addition_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
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

#[allow(clippy::too_many_lines)]
fn parse_factor_with_type(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    use crate::pointers::resolve_dereference;

    skip_whitespace(input, pos);

    // Handle dereference operator *
    if input[*pos..].trim_start().starts_with('*') {
        let t = input[*pos..].trim_start();
        let o = input[*pos..].len() - t.len();
        *pos += o + 1;
        skip_whitespace(input, pos);
        let (n, l) = parse_identifier(&input[*pos..])?;
        *pos += l;
        resolve_dereference(&n, env)
    } else if input[*pos..].trim_start().starts_with('&') {
        let t = input[*pos..].trim_start();
        *pos += input[*pos..].len() - t.len() + 1;
        skip_whitespace(input, pos);
        let (n, l) = parse_identifier(&input[*pos..])?;
        *pos += l;
        let v = env
            .get(&n)
            .ok_or_else(|| format!("Undefined variable: {}", n))?
            .clone();
        let _ = v
            .value
            .ok_or_else(|| format!("Variable '{}' is not initialized", n))?;
        Ok((0, format!("*{}", v.type_name)))
    } else if input[*pos..].trim_start().starts_with('(') {
        *pos += 1;
        let result = interpret_at(input, pos, env)?;
        expect_closing(input, pos, ')', "Missing closing parenthesis")?;
        Ok((result, "".to_string()))
    } else if input[*pos..].trim_start().starts_with('{') {
        *pos += 1;
        let (result, _) = parse_block(input, pos, env)?;
        expect_closing(input, pos, '}', "Missing closing curly brace")?;
        Ok((result, "".to_string()))
    } else if input[*pos..]
        .trim_start()
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        let (identifier, len) = parse_identifier(&input[*pos..])?;
        *pos += len;

        // Check for Bool literals
        if identifier == "true" {
            return Ok((1, "Bool".to_string()));
        } else if identifier == "false" {
            return Ok((0, "Bool".to_string()));
        }

        // Otherwise it's a variable
        let var_info = env
            .get(&identifier)
            .ok_or_else(|| format!("Undefined variable: {}", identifier))?
            .clone();
        let val = var_info
            .value
            .ok_or_else(|| format!("Variable '{}' is not initialized", identifier))?;
        Ok((val, var_info.type_name))
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

pub fn parse_term_with_type(
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

    let mut result = 0;

    // Parse remaining expressions and blocks
    loop {
        // Skip whitespace
        let rest = &input[pos..];
        let trimmed = rest.trim_start();
        pos += rest.len() - trimmed.len();

        // If we've reached the end, return the last result
        if pos >= input.len() || trimmed.is_empty() {
            break;
        }

        // Check if it's a block statement
        if trimmed.starts_with('{') {
            pos += 1;
            let (block_result, is_expression) = parse_block(input, &mut pos, &mut env)?;
            expect_closing(input, &mut pos, '}', "Missing closing curly brace")?;
            result = block_result;

            // If it's a block expression, check if it's the final thing
            if is_expression {
                let rest = &input[pos..];
                let remaining = rest.trim_start();
                if !remaining.is_empty() {
                    // Block expression followed by more code - invalid
                    return Err(
                        "Block expressions must be used in a context (e.g., as an initializer)"
                            .to_string(),
                    );
                }
                // Block expression is the final thing - valid as return value
                break;
            }

            // Continue parsing for statement blocks
            continue;
        }

        // Otherwise parse as expression and we're done
        result = interpret_at(input, &mut pos, &mut env)?;
        break;
    }

    if pos < input.len() {
        let rest = &input[pos..].trim_start();
        if !rest.is_empty() {
            return Err(format!("Unexpected input: {}", rest));
        }
    }

    Ok(result)
}

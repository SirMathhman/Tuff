use std::collections::HashMap;
use crate::validators::validate_type_range;

pub type Environment = HashMap<String, i32>;

pub fn parse_number(input: &str) -> Result<(i32, usize), String> {
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
    let result = validate_type_range(&suffix.to_uppercase(), value)?;
    Ok((result, ws_offset + digit_end + suffix_end))
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

fn parse_type_annotation_optional(
    input: &str,
    pos: &mut usize,
) -> Result<Option<String>, String> {
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

fn parse_let_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    if !&input[*pos..].trim_start().starts_with("let ") {
        return Ok(());
    }

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();
    *pos += 4;

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    let (var_name, len) = parse_identifier(&input[*pos..])?;
    *pos += len;

    if env.contains_key(&var_name) {
        return Err(format!("Variable '{}' is already declared", var_name));
    }

    parse_type_annotation_optional(input, pos)?;

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    if !trimmed.starts_with('=') {
        return Err("Expected '=' in let statement".to_string());
    }
    *pos += 1;

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    let value = parse_term(input, pos, env)?;
    env.insert(var_name, value);

    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    if !trimmed.starts_with(';') {
        return Err("Expected ';' after let statement".to_string());
    }
    *pos += 1;

    Ok(())
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
        } else {
            result = interpret_at(input, pos, env)?;
            break;
        }
    }

    Ok(result)
}

fn parse_grouped(
    input: &str,
    pos: &mut usize,
    _open: char,
    close: char,
    close_err: &str,
    env: &mut Environment,
) -> Result<i32, String> {
    *pos += 1;
    let result = interpret_at(input, pos, env)?;
    expect_closing(input, pos, close, close_err)?;
    Ok(result)
}

fn parse_factor(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();

    if trimmed.starts_with('(') {
        parse_grouped(input, pos, '(', ')', "Missing closing parenthesis", env)
    } else if trimmed.starts_with('{') {
        *pos += 1;
        let result = parse_block(input, pos, env)?;
        expect_closing(input, pos, '}', "Missing closing curly brace")?;
        Ok(result)
    } else if trimmed
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        let (var_name, len) = parse_identifier(&input[*pos..])?;
        *pos += len;
        env.get(&var_name)
            .copied()
            .ok_or_else(|| format!("Undefined variable: {}", var_name))
    } else {
        let (value, len) = parse_number(&input[*pos..])?;
        *pos += len;
        Ok(value)
    }
}

fn parse_term(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = parse_factor(input, pos, env)?;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed_rest = rest.trim_start();
        let ws_len = rest.len() - trimmed_rest.len();

        if trimmed_rest.is_empty() {
            break;
        }

        let op = trimmed_rest.chars().next().ok_or("Unexpected end")?;
        if op != '*' && op != '/' {
            break;
        }

        *pos += ws_len + 1;
        let factor = parse_factor(input, pos, env)?;

        result = match op {
            '*' => result * factor,
            '/' => {
                if factor == 0 {
                    return Err("Division by zero".to_string());
                }
                result / factor
            }
            _ => return Err(format!("Unknown operator: {}", op)),
        };
    }

    Ok(result)
}

pub fn interpret_at(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let mut result = parse_term(input, pos, env)?;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed_rest = rest.trim_start();
        *pos += rest.len() - trimmed_rest.len();

        if trimmed_rest.is_empty() {
            break;
        }

        let op = trimmed_rest.chars().next().ok_or("Unexpected end")?;
        if op != '+' && op != '-' {
            break;
        }

        *pos += 1;

        let term = parse_term(input, pos, env)?;

        result = match op {
            '+' => result + term,
            '-' => result - term,
            _ => return Err(format!("Unknown operator: {}", op)),
        };
    }

    Ok(result)
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

pub fn interpret(input: &str) -> Result<i32, String> {
    let input = input.trim();
    let mut pos = 0;
    let mut env = Environment::new();

    loop {
        let parsed = parse_top_level_let(input, &mut pos, &mut env)?;
        if !parsed {
            break;
        }
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

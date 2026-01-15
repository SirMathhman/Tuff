use std::collections::HashMap;

mod validators;
use validators::validate_type_range;

type Environment = HashMap<String, i32>;

#[allow(dead_code)]
fn parse_number(input: &str) -> Result<(i32, usize), String> {
    let trimmed = input.trim_start();
    let ws_offset = input.len() - trimmed.len();

    // Find digit part
    let digit_end = trimmed
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(trimmed.len());

    if digit_end == 0 {
        return Err("No digits found".to_string());
    }

    let digit_str = &trimmed[..digit_end];
    let value = digit_str.parse::<i64>().map_err(|e| e.to_string())?;

    // Find suffix part (letters followed by digits, like U8, I16)
    let remainder = &trimmed[digit_end..];
    let suffix_end = remainder
        .find(|c: char| !c.is_alphanumeric())
        .unwrap_or(remainder.len());

    let suffix = &remainder[..suffix_end];
    let result = validate_type_range(&suffix.to_uppercase(), value)?;
    Ok((result, ws_offset + digit_end + suffix_end))
}

#[allow(dead_code)]
fn parse_identifier(input: &str) -> Result<(String, usize), String> {
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

#[allow(dead_code)]
fn skip_whitespace(input: &str, pos: &mut usize) {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    *pos += rest.len() - trimmed.len();
}

#[allow(dead_code)]
fn read_type_name_after_colon(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);

    let (type_name, len) = parse_identifier(&input[*pos..])?;
    *pos += len;
    Ok(type_name)
}

#[allow(dead_code)]
fn parse_type_annotation_optional(input: &str, pos: &mut usize) -> Result<Option<String>, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    // If no colon, type annotation is absent
    if !trimmed.starts_with(':') {
        return Ok(None);
    }

    // Skip the colon
    let ws_offset = rest.len() - trimmed.len();
    *pos += ws_offset + 1;

    let type_name = read_type_name_after_colon(input, pos)?;
    Ok(Some(type_name))
}

#[allow(dead_code)]
fn parse_type_annotation(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let rest = &input[*pos..];

    if !rest.trim_start().starts_with(':') {
        return Err("Expected ':' in type annotation".to_string());
    }
    *pos += rest.len() - rest.trim_start().len() + 1;

    read_type_name_after_colon(input, pos)
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
fn parse_block(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = 0i32;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed = rest.trim_start();
        *pos += rest.len() - trimmed.len();

        if trimmed.is_empty() || trimmed.starts_with('}') {
            break;
        }

        // Check for let statement
        if trimmed.starts_with("let ") {
            *pos += 4;

            let rest = &input[*pos..];
            let trimmed = rest.trim_start();
            *pos += rest.len() - trimmed.len();

            let (var_name, len) = parse_identifier(&input[*pos..])?;
            *pos += len;

            // Check if variable is already declared in this scope
            if env.contains_key(&var_name) {
                return Err(format!("Variable '{}' is already declared", var_name));
            }

            // Type annotation is optional
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
        } else {
            // Otherwise parse as an expression that becomes the result
            result = interpret_at(input, pos, env)?;
            break;
        }
    }

    Ok(result)
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
fn interpret_at(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
    let mut result = parse_term(input, pos, env)?;

    while *pos < input.len() {
        let rest = &input[*pos..];
        let trimmed_rest = rest.trim_start();
        *pos += rest.len() - trimmed_rest.len();

        if trimmed_rest.is_empty() {
            break;
        }

        let op = trimmed_rest.chars().next().ok_or("Unexpected end")?;
        if op != '+' && op != '-' && op != ')' && op != '}' {
            return Err(format!("Unknown operator: {}", op));
        }

        if op == ')' || op == '}' {
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

#[allow(dead_code)]
fn interpret(input: &str) -> Result<i32, String> {
    let input = input.trim();
    let mut pos = 0;
    let mut env = Environment::new();
    let result = interpret_at(input, &mut pos, &mut env)?;

    if pos < input.len() {
        let rest = &input[pos..].trim_start();
        if !rest.is_empty() {
            return Err(format!("Unexpected input: {}", rest));
        }
    }

    Ok(result)
}

fn main() {
    println!("Hello, world!");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_100() {
        assert_eq!(interpret("100"), Ok(100));
    }

    #[test]
    fn test_interpret_100u8() {
        assert_eq!(interpret("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_negative_100u8() {
        assert!(interpret("-100U8").is_err());
    }

    #[test]
    fn test_interpret_256u8() {
        assert!(interpret("256U8").is_err());
    }

    // U8 tests
    #[test]
    fn test_u8_valid() {
        assert_eq!(interpret("255U8"), Ok(255));
    }

    #[test]
    fn test_u8_out_of_range() {
        assert!(interpret("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_u16_valid() {
        assert_eq!(interpret("65535U16"), Ok(65535));
    }

    #[test]
    fn test_u16_out_of_range() {
        assert!(interpret("65536U16").is_err());
    }

    // U32 tests
    #[test]
    fn test_u32_valid() {
        assert_eq!(interpret("4294967295U32"), Ok(-1)); // Wraps when cast to i32
    }

    // I8 tests
    #[test]
    fn test_i8_valid() {
        assert_eq!(interpret("127I8"), Ok(127));
    }

    #[test]
    fn test_i8_out_of_range() {
        assert!(interpret("128I8").is_err());
    }

    // I16 tests
    #[test]
    fn test_i16_valid() {
        assert_eq!(interpret("32767I16"), Ok(32767));
    }

    #[test]
    fn test_i16_out_of_range() {
        assert!(interpret("32768I16").is_err());
    }

    // I32 tests
    #[test]
    fn test_i32_valid() {
        assert_eq!(interpret("2147483647I32"), Ok(2147483647));
    }

    #[test]
    fn test_i32_out_of_range() {
        assert!(interpret("2147483648I32").is_err());
    }

    // No suffix test
    #[test]
    fn test_no_suffix() {
        assert_eq!(interpret("100"), Ok(100));
    }

    // Arithmetic tests
    #[test]
    fn test_addition() {
        assert_eq!(interpret("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_mixed_suffix() {
        assert_eq!(interpret("1 + 2U8"), Ok(3));
    }

    #[test]
    fn test_addition_different_types() {
        assert_eq!(interpret("1U8 + 2U16"), Ok(3));
    }

    #[test]
    fn test_addition_overflow() {
        assert!(interpret("1U8 + 65565U16").is_err());
    }

    #[test]
    fn test_chained_addition() {
        assert_eq!(interpret("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_chained_with_out_of_range() {
        assert!(interpret("1U8 + 1 + 65564U16").is_err());
    }

    #[test]
    fn test_addition_and_subtraction() {
        assert_eq!(interpret("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_multiplication_and_subtraction() {
        assert_eq!(interpret("2 * 3 - 4"), Ok(2));
    }

    #[test]
    fn test_operator_precedence() {
        assert_eq!(interpret("4 + 2 * 3"), Ok(10));
    }

    #[test]
    fn test_division() {
        assert_eq!(interpret("10 / 2"), Ok(5));
    }

    #[test]
    fn test_division_by_zero() {
        assert!(interpret("10 / 0").is_err());
    }

    #[test]
    fn test_parentheses() {
        assert_eq!(interpret("(4 + 2) * 3"), Ok(18));
    }

    #[test]
    fn test_curly_braces() {
        assert_eq!(interpret("(4 + { 2 }) * 3"), Ok(18));
    }

    #[test]
    fn test_variable_declaration() {
        assert_eq!(interpret("(4 + { let x : I32 = 2; x }) * 3"), Ok(18));
    }

    #[test]
    fn test_multiple_variable_declarations() {
        assert_eq!(
            interpret("(4 + { let x : I32 = 2; let y : I32 = x; y }) * 3"),
            Ok(18)
        );
    }

    #[test]
    fn test_variable_redeclaration_error() {
        assert!(interpret("(4 + { let x : I32 = 2; let x : I32 = 1; x }) * 3").is_err());
    }

    #[test]
    fn test_variable_declaration_without_type() {
        assert_eq!(interpret("(4 + { let x = 2; x }) * 3"), Ok(18));
    }
}

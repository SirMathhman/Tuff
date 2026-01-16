use crate::parse_utils::{
    check_and_consume_op, parse_dot_and_identifier, parse_identifier, parse_number_with_type,
    skip_whitespace, try_parse_this_keyword, try_construct_struct_from_this,
};
use crate::statements::{
    parse_block, parse_top_level_assignment, parse_top_level_let, parse_top_level_struct,
    parse_while_statement,
};
use crate::variables::Environment;

mod comparison;

#[allow(dead_code)]
fn try_parse_field_access(
    var_name: &str,
    input: &str,
    pos: &mut usize,
    env: &Environment,
) -> Result<Option<(i32, String)>, String> {
    if let Ok(Some(field_name)) = parse_dot_and_identifier(input, pos) {
        let field_value = crate::structs::get_field_value(var_name, &field_name, env)?;
        Ok(Some((field_value, "".to_string())))
    } else {
        Ok(None)
    }
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
    let mut result = comparison::parse_comparison_expression(input, pos, env)?;

    while *pos < input.len() {
        let trimmed = input[*pos..].trim_start();
        if trimmed.starts_with("&&") {
            *pos += input[*pos..].len() - trimmed.len() + 2;
            let rhs = comparison::parse_comparison_expression(input, pos, env)?;
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

        // Check for if expression
        if identifier == "if" {
            return parse_if_expression(input, pos, env);
        }

        // Check for match expression
        if identifier == "match" {
            return parse_match_expression(input, pos, env);
        }

        // Check for Bool literals
        if identifier == "true" {
            return Ok((1, "Bool".to_string()));
        } else if identifier == "false" {
            return Ok((0, "Bool".to_string()));
        }

        // Check for 'this' keyword for scope variable access or struct construction
        if identifier == "this" {
            skip_whitespace(input, pos);
            if input[*pos..].trim_start().starts_with('.') {
                // this.field - field access
                if let Ok(Some((val, type_name))) = try_parse_this_keyword(input, pos, env) {
                    return Ok((val, type_name));
                }
            } else {
                // bare 'this' - try to construct a struct from parameters
                if let Some((val, type_name)) = try_construct_struct_from_this(env)? {
                    return Ok((val, type_name));
                }
            }
        }

        // Try to parse struct instantiation
        if let Ok(Some((val, type_name))) =
            crate::structs::try_parse_struct_instantiation(&identifier, input, pos, env)
        {
            // Check for field access on struct instantiation
            let temp_var_name = format!("_struct_inst_{}", identifier);
            if let Ok(Some((field_value, _))) =
                try_parse_field_access(&temp_var_name, input, pos, env)
            {
                return Ok((field_value, "".to_string()));
            }
            return Ok((val, type_name));
        }

        // Try to parse function call
        if let Ok(Some((val, type_name))) =
            crate::functions::try_parse_function_call(&identifier, input, pos, env)
        {
            return Ok((val, type_name));
        }

        // Otherwise it's a variable
        let var_info = env
            .get(&identifier)
            .ok_or_else(|| format!("Undefined variable: {}", identifier))?
            .clone();

        // Check for field access
        if let Ok(Some((field_value, _))) = try_parse_field_access(&identifier, input, pos, env) {
            return Ok((field_value, "".to_string()));
        }

        // Check for function pointer call
        if let Some(func_name) = &var_info.function_name {
            if let Ok(Some((val, type_name))) =
                crate::functions::try_parse_function_call(func_name, input, pos, env)
            {
                return Ok((val, type_name));
            }
        }

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

fn parse_paren_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with('(') {
        return Err("Expected '(' to open expression".to_string());
    }
    *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
    let result = interpret_at(input, pos, env)?;
    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with(')') {
        return Err("Expected ')' to close expression".to_string());
    }
    *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
    Ok(result)
}

fn parse_if_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    let condition = parse_paren_expression(input, pos, env)
        .map_err(|_| "Expected '(' after 'if'".to_string())?;

    skip_whitespace(input, pos);
    let then_value = interpret_at(input, pos, env)?;

    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with("else") {
        return Err("Expected 'else' after then branch".to_string());
    }
    *pos += input[*pos..].len() - trimmed.len() + 4;

    skip_whitespace(input, pos);
    let else_value = interpret_at(input, pos, env)?;

    let result = if condition != 0 {
        then_value
    } else {
        else_value
    };
    Ok((result, "".to_string()))
}

fn parse_match_case(input: &str, pos: &mut usize) -> Result<(i32, bool), String> {
    skip_whitespace(input, pos);

    // Parse pattern
    let trimmed = input[*pos..].trim_start();
    let is_wildcard = trimmed.starts_with('_');

    let pattern_value = if is_wildcard {
        *pos += input[*pos..].len() - trimmed.len() + 1;
        -1 // Wildcard marker
    } else {
        let (value, _, len) = parse_number_with_type(&input[*pos..])?;
        *pos += len;
        value
    };

    skip_whitespace(input, pos);

    // Expect arrow
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with("=>") {
        return Err("Expected '=>' after pattern in match case".to_string());
    }
    *pos += input[*pos..].len() - trimmed.len() + 2;

    Ok((pattern_value, is_wildcard))
}

fn parse_match_expression(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String), String> {
    let scrutinee = parse_paren_expression(input, pos, env)
        .map_err(|_| "Expected '(' after 'match'".to_string())?;

    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with('{') {
        return Err("Expected '{' after match scrutinee".to_string());
    }
    *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;

    let mut matched = false;
    let mut result = 0;

    loop {
        skip_whitespace(input, pos);

        if input[*pos..].trim_start().starts_with('}') {
            *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
            break;
        }

        let trimmed = input[*pos..].trim_start();
        if !trimmed.starts_with("case") {
            return Err("Expected 'case' in match expression".to_string());
        }
        *pos += input[*pos..].len() - trimmed.len() + 4;

        let (pattern_value, is_wildcard) = parse_match_case(input, pos)?;

        skip_whitespace(input, pos);
        let case_value = interpret_at(input, pos, env)?;

        if !matched && (is_wildcard || pattern_value == scrutinee) {
            result = case_value;
            matched = true;
        }

        skip_whitespace(input, pos);
        let trimmed = input[*pos..].trim_start();
        if !trimmed.starts_with(';') {
            return Err("Expected ';' after match case value".to_string());
        }
        *pos += input[*pos..].len() - trimmed.len() + 1;
    }

    if !matched {
        return Err("No matching case in match expression".to_string());
    }

    Ok((result, "".to_string()))
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

#[allow(clippy::too_many_lines)]
pub fn interpret(input: &str) -> Result<i32, String> {
    let input = input.trim();
    let mut pos = 0;
    let mut env = Environment::new();

    loop {
        let parsed_struct = parse_top_level_struct(input, &mut pos)?;
        let parsed_function = crate::statements::parse_top_level_function(input, &mut pos)?;
        let parsed_let = parse_top_level_let(input, &mut pos, &mut env)?;
        let parsed_assign = parse_top_level_assignment(input, &mut pos, &mut env)?;
        let parsed_if = crate::statements::parse_if_statement(input, &mut pos, &mut env)?;
        let parsed_while = parse_while_statement(input, &mut pos, &mut env)?;
        let parsed_for = crate::statements::parse_for_statement(input, &mut pos, &mut env)?;

        if !parsed_struct
            && !parsed_function
            && !parsed_let
            && !parsed_assign
            && !parsed_if
            && !parsed_while
            && !parsed_for
        {
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

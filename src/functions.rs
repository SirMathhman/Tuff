use crate::parse_utils::{parse_identifier, skip_whitespace};
use crate::variables::{register_function, get_function, FunctionDef, Environment};
use crate::parser::parse_term_with_type;

// Type alias to reduce complexity
pub type FunctionHeader = (String, Vec<(String, String)>, String);
pub type CompleteFunction = (String, Vec<(String, String)>, String, String);

pub fn consume_token(input: &str, pos: &mut usize, token: &str) -> Result<(), String> {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with(token) {
        return Err(format!("Expected '{}'", token));
    }
    *pos += input[*pos..].len() - trimmed.len() + token.len();
    Ok(())
}

pub fn parse_list<T, F>(
    input: &str,
    pos: &mut usize,
    mut parser: F,
) -> Result<Vec<T>, String>
where
    F: FnMut(&str, &mut usize) -> Result<T, String>,
{
    let mut items = Vec::new();

    loop {
        skip_whitespace(input, pos);
        let trimmed = input[*pos..].trim_start();

        if trimmed.starts_with(')') {
            *pos += input[*pos..].len() - trimmed.len() + 1;
            break;
        }

        items.push(parser(input, pos)?);

        skip_whitespace(input, pos);
        let trimmed = input[*pos..].trim_start();

        match trimmed.chars().next() {
            Some(',') => {
                *pos += input[*pos..].len() - trimmed.len() + 1;
            }
            Some(')') => {
                *pos += input[*pos..].len() - trimmed.len() + 1;
                break;
            }
            _ => return Err("Expected ',' or ')' after item".to_string()),
        }
    }

    Ok(items)
}

fn parse_parameter(input: &str, pos: &mut usize) -> Result<(String, String), String> {
    let (param_name, name_len) = parse_identifier(&input[*pos..])?;
    *pos += name_len;

    consume_token(input, pos, ":")?;

    let (param_type, type_len) = parse_identifier(&input[*pos..])?;
    *pos += type_len;

    Ok((param_name, param_type))
}

pub fn parse_parameter_list(input: &str, pos: &mut usize) -> Result<Vec<(String, String)>, String> {
    parse_list(input, pos, parse_parameter)
}

/// Parse a complete function definition (header and body)
/// Returns (name, params, return_type, body)
pub fn parse_complete_function(
    input: &str,
    pos: &mut usize,
) -> Result<CompleteFunction, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("fn ") {
        return Err("Expected 'fn'".to_string());
    }

    let start_pos = *pos + rest.len() - trimmed.len();
    *pos = start_pos;

    // Parse function header
    let (func_name, params, return_type) = parse_function_header(input, pos)?;

    // Parse function body using shared helper
    let body = parse_function_body(input, pos)?;

    Ok((func_name, params, return_type, body))
}

/// Parse function header (fn name(params) : return_type =>)
/// Returns (name, params, return_type)
pub fn parse_function_header(
    input: &str,
    pos: &mut usize,
) -> Result<FunctionHeader, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("fn ") {
        return Err("Expected 'fn'".to_string());
    }

    *pos += rest.len() - trimmed.len() + 3; // "fn " = 3 chars

    // Parse function name
    let (func_name, name_len) = parse_identifier(&input[*pos..])?;
    *pos += name_len;

    consume_token(input, pos, "(")?;

    // Parse parameters
    let params = parse_parameter_list(input, pos)?;

    consume_token(input, pos, ":")?;

    // Parse return type
    let (return_type, type_len) = parse_identifier(&input[*pos..])?;
    *pos += type_len;

    consume_token(input, pos, "=>")?;

    Ok((func_name, params, return_type))
}

fn parse_argument(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let (arg_val, _arg_type) = parse_term_with_type(input, pos, env)?;
    Ok(arg_val)
}

/// Parse function arguments and verify count
fn parse_and_verify_arguments(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
    func_name: &str,
    expected_count: usize,
) -> Result<Vec<i32>, String> {
    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    // Parse arguments
    let args = parse_list(input, pos, |inp, p| parse_argument(inp, p, env))?;

    // Verify argument count matches parameter count
    if args.len() != expected_count {
        return Err(format!(
            "Function '{}' expects {} arguments but got {}",
            func_name, expected_count, args.len()
        ));
    }

    Ok(args)
}
fn bind_parameters(
    params: &[(String, String)],
    args: &[i32],
    base_env: &Environment,
) -> Environment {
    let mut func_env = base_env.clone();
    for ((param_name, _param_type), arg_val) in params.iter().zip(args.iter()) {
        func_env.insert(
            param_name.clone(),
            crate::variables::VariableInfo {
                value: Some(*arg_val),
                type_name: "I32".to_string(),
                is_mutable: false,
                points_to: None,
                struct_fields: None,
                function_name: None,
                local_function: None,
            },
        );
    }
    func_env
}

/// Parse function body that starts after `=>`
/// Returns the body string and updates position
#[allow(dead_code)]
pub fn parse_function_body(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);

    let body_start = *pos;
    let rest = &input[body_start..];
    let trimmed = rest.trim_start();
    
    let body = if trimmed.starts_with('{') {
        // If the body starts with '{', find the matching closing brace
        let ws_offset = rest.len() - trimmed.len();
        let mut brace_count = 0;
        let mut found_end = false;
        let mut end_pos = body_start + ws_offset;
        
        for (i, c) in trimmed.chars().enumerate() {
            if c == '{' {
                brace_count += 1;
            } else if c == '}' {
                brace_count -= 1;
                if brace_count == 0 {
                    end_pos = body_start + ws_offset + i + 1;
                    found_end = true;
                    break;
                }
            }
        }
        
        if !found_end {
            return Err("Unclosed brace in function body".to_string());
        }
        
        let body_str = input[body_start..end_pos].trim().to_string();
        
        // After the closing brace, check for a semicolon
        *pos = end_pos;
        skip_whitespace(input, pos);
        if *pos < input.len() && input[*pos..].starts_with(';') {
            *pos += 1;
        }
        body_str
    } else {
        // For non-block bodies, find the semicolon
        let mut found_end = false;
        let mut body_end = body_start;
        for (i, c) in rest.chars().enumerate() {
            if c == ';' {
                body_end = body_start + i;
                *pos = body_start + i + 1;
                found_end = true;
                break;
            }
        }
        
        if !found_end {
            return Err("Function body must end with ';'".to_string());
        }
        
        input[body_start..body_end].trim().to_string()
    };

    Ok(body)
}

#[allow(clippy::too_many_lines)]
pub fn parse_function_definition(
    input: &str,
    pos: &mut usize,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("fn ") {
        return Ok(false);
    }

    let start_pos = *pos + rest.len() - trimmed.len();
    *pos = start_pos;

    // Parse complete function
    let (func_name, params, return_type, body) = parse_complete_function(input, pos)?;

    let func_def = FunctionDef {
        name: func_name,
        params,
        return_type,
        body,
    };

    register_function(func_def);

    Ok(true)
}

#[allow(clippy::too_many_lines)]
pub fn try_parse_function_call(
    func_name: &str,
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<Option<(i32, String)>, String> {
    skip_whitespace(input, pos);

    // Expect '('
    if !input[*pos..].trim_start().starts_with('(') {
        return Ok(None);
    }

    // Check if this is a local function first
    let local_func_opt = env.get(func_name).and_then(|v| v.local_function.clone());
    
    if let Some(local_func) = local_func_opt {
        let args = parse_and_verify_arguments(input, pos, env, func_name, local_func.params.len())?;

        // Create a new scope starting from the captured environment and bind parameters
        let mut func_env = bind_parameters(&local_func.params, &args, &local_func.captured_env);

        // Evaluate the function body
        let mut body_pos = 0;
        let result = crate::parser::interpret_at(&local_func.body, &mut body_pos, &mut func_env)?;

        return Ok(Some((result, local_func.return_type.clone())));
    }

    // Check global function registry
    let func = match get_function(func_name) {
        Some(f) => f,
        None => return Ok(None),
    };

    let args = parse_and_verify_arguments(input, pos, env, func_name, func.params.len())?;

    // Create a new scope with parameters bound to arguments
    let mut func_env = bind_parameters(&func.params, &args, env);

    // Evaluate the function body
    let mut body_pos = 0;
    let result = crate::parser::interpret_at(&func.body, &mut body_pos, &mut func_env)?;

    // If the return type is a struct, copy the temporary struct variable back to the caller's environment
    if !func.return_type.is_empty() && func.return_type.chars().next().is_some_and(|c| c.is_uppercase()) {
        let temp_var_name = format!("_struct_inst_{}", func.return_type);
        if let Some(struct_var) = func_env.get(&temp_var_name) {
            env.insert(temp_var_name, struct_var.clone());
        }
    }

    Ok(Some((result, func.return_type)))
}

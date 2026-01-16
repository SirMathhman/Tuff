use crate::parse_utils::{parse_identifier, skip_whitespace};
use crate::variables::{register_function, get_function, FunctionDef, Environment};
use crate::parser::parse_term_with_type;

fn consume_token(input: &str, pos: &mut usize, token: &str) -> Result<(), String> {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();
    if !trimmed.starts_with(token) {
        return Err(format!("Expected '{}'", token));
    }
    *pos += input[*pos..].len() - trimmed.len() + token.len();
    Ok(())
}

fn parse_list<T, F>(
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

fn parse_parameter_list(input: &str, pos: &mut usize) -> Result<Vec<(String, String)>, String> {
    parse_list(input, pos, parse_parameter)
}

fn parse_argument(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i32, String> {
    let (arg_val, _arg_type) = parse_term_with_type(input, pos, env)?;
    Ok(arg_val)
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


    skip_whitespace(input, pos);

    // Find the function body - it ends at ';'
    let body_start = *pos;
    let mut body_end = *pos;
    let rest = &input[body_start..];
    
    // Find the semicolon that ends the function definition
    for (i, c) in rest.chars().enumerate() {
        if c == ';' {
            body_end = body_start + i;
            *pos = body_start + i + 1;
            break;
        }
    }

    if body_end == body_start {
        return Err("Function body must end with ';'".to_string());
    }

    let body = input[body_start..body_end].trim().to_string();

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
    let func = match get_function(func_name) {
        Some(f) => f,
        None => return Ok(None),
    };

    skip_whitespace(input, pos);

    // Expect '('
    if !input[*pos..].trim_start().starts_with('(') {
        return Ok(None);
    }

    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    // Parse arguments
    let args = parse_list(input, pos, |inp, p| parse_argument(inp, p, env))?;

    // Verify argument count matches parameter count
    if args.len() != func.params.len() {
        return Err(format!(
            "Function '{}' expects {} arguments but got {}",
            func_name,
            func.params.len(),
            args.len()
        ));
    }

    // Create a new scope with parameters bound to arguments
    let mut func_env = env.clone();
    for ((param_name, _param_type), arg_val) in func.params.iter().zip(args.iter()) {
        func_env.insert(
            param_name.clone(),
            crate::variables::VariableInfo {
                value: Some(*arg_val),
                type_name: "I32".to_string(), // Simplified - could be improved
                is_mutable: false,
                points_to: None,
                struct_fields: None,
            },
        );
    }

    // Evaluate the function body
    let mut body_pos = 0;
    let result = crate::parser::interpret_at(&func.body, &mut body_pos, &mut func_env)?;

    Ok(Some((result, func.return_type)))
}

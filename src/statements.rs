use crate::parser::{parse_identifier, skip_whitespace};
use crate::pointers::resolve_reference;
use crate::variables::{is_type_compatible, Environment, VariableInfo};

fn read_type_name_after_colon(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let rest = &input[*pos..];
    let mut type_str = String::new();
    let mut temp_pos = 0;
    while temp_pos < rest.len() && rest.chars().nth(temp_pos).is_some_and(|c| c == '*') {
        type_str.push('*');
        temp_pos += 1;
    }
    let (type_name, len) = parse_identifier(&rest[temp_pos..])?;
    type_str.push_str(&type_name);
    *pos += temp_pos + len;
    Ok(type_str)
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

fn store_variable(
    env: &mut Environment,
    var_name: String,
    val: Option<i32>,
    declared_type: Option<String>,
    actual_type: Option<String>,
    is_mutable: bool,
    points_to: Option<String>,
) -> Result<(), String> {
    let stored_type = if let Some(declared) = declared_type {
        if let Some(actual) = actual_type {
            if !is_type_compatible(&declared, &actual) {
                return Err(format!(
                    "Type mismatch: declared type '{}' but got '{}'",
                    declared, actual
                ));
            }
        }
        declared
    } else if val.is_none() {
        return Err("Type annotation required for uninitialized variable".to_string());
    } else {
        actual_type.unwrap_or_default()
    };
    env.insert(
        var_name,
        VariableInfo {
            value: val,
            type_name: stored_type,
            is_mutable,
            points_to,
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
    points_to: Option<String>,
) -> Result<(), String> {
    if !is_type_compatible(&var_info.type_name, &new_type) {
        return Err(format!(
            "Type mismatch in assignment to '{}': declared type '{}' but got '{}'",
            var_name, var_info.type_name, new_type
        ));
    }

    // If variable was uninitialized (None), make it immutable after first assignment
    let new_mutability = var_info.value.is_some();

    env.insert(
        var_name,
        VariableInfo {
            value: Some(new_val),
            type_name: var_info.type_name,
            is_mutable: new_mutability,
            points_to,
        },
    );
    Ok(())
}

fn expect_semicolon(input: &str, pos: &mut usize) -> Result<(), String> {
    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with(';') {
        return Err("Expected ';'".to_string());
    }
    *pos += 1;
    Ok(())
}

pub fn parse_value_or_reference(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(i32, String, Option<String>), String> {
    if input[*pos..].trim_start().starts_with('&') {
        let trimmed = input[*pos..].trim_start();
        let ws_offset = input[*pos..].len() - trimmed.len();
        *pos += ws_offset + 1;
        skip_whitespace(input, pos);
        let (ref_var_name, len) = parse_identifier(&input[*pos..])?;
        *pos += len;
        let ref_type = resolve_reference(&ref_var_name, env)?;
        Ok((0, ref_type, Some(ref_var_name)))
    } else {
        let (val, ty) = crate::parser::parse_term_with_type(input, pos, env)?;
        Ok((val, ty, None))
    }
}

#[allow(clippy::too_many_lines)]
pub fn parse_let_statement(input: &str, pos: &mut usize, env: &mut Environment) -> Result<(), String> {
    if !&input[*pos..].trim_start().starts_with("let ") {
        return Ok(());
    }
    skip_whitespace(input, pos);
    *pos += 4;
    skip_whitespace(input, pos);
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
        if !input[*pos..].trim_start().starts_with(';') {
            return Err("Expected ';' or '=' in let statement".to_string());
        }
        store_variable(env, var_name, None, declared_type, None, true, None)?;
        skip_whitespace(input, pos);
        *pos += 1;
        return Ok(());
    }
    *pos += 1;
    skip_whitespace(input, pos);
    let (val, actual_type, points_to) = parse_value_or_reference(input, pos, env)?;
    store_variable(
        env,
        var_name,
        Some(val),
        declared_type,
        Some(actual_type),
        is_mutable,
        points_to,
    )?;
    expect_semicolon(input, pos)?;
    Ok(())
}

pub fn parse_assignment_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    let ws_offset = rest.len() - trimmed.len();
    if !trimmed
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_')
    {
        return Ok(false);
    }
    let (potential_var, var_len) = parse_identifier(trimmed)?;
    let after_var = &trimmed[var_len..];
    let after_var_trimmed = after_var.trim_start();
    if !after_var_trimmed.starts_with('=') {
        return Ok(false);
    }
    *pos += ws_offset + var_len;
    let var_name = potential_var;
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

    let (val, actual_type, points_to) = parse_value_or_reference(input, pos, env)?;

    update_mutable_var(env, var_name, var_info, val, actual_type, points_to)?;

    expect_semicolon(input, pos)?;
    Ok(true)
}

pub fn parse_block(input: &str, pos: &mut usize, env: &mut Environment) -> Result<i32, String> {
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
            result = crate::parser::interpret_at(input, pos, env)?;
            break;
        }
    }

    Ok(result)
}

pub fn parse_top_level_let(
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

pub fn parse_top_level_assignment(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    parse_assignment_statement(input, pos, env)
}

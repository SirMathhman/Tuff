use crate::parse_utils::{parse_identifier, skip_whitespace};
use crate::variables::{is_type_compatible, Environment, VariableInfo};

mod assignment;
mod control_flow;
mod type_utils;
pub use assignment::{expect_semicolon, parse_assignment_statement, parse_value_or_reference};
pub use control_flow::{
    parse_block, parse_for_statement, parse_if_statement, parse_while_statement,
};
use type_utils::parse_type_annotation_optional;
#[allow(clippy::too_many_arguments)]
fn store_variable(
    env: &mut Environment,
    var_name: String,
    val: Option<i32>,
    declared_type: Option<String>,
    actual_type: Option<String>,
    is_mutable: bool,
    points_to: Option<String>,
    struct_fields: Option<std::collections::HashMap<String, i32>>,
    function_name: Option<String>,
    methods: Option<std::collections::HashMap<String, Box<crate::variables::LocalFunction>>>,
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
    } else if val.is_none() && function_name.is_none() {
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
            struct_fields,
            function_name,
            local_function: None,
            methods,
        },
    );
    Ok(())
}
#[allow(clippy::too_many_lines)]
pub fn parse_let_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<(), String> {
    skip_whitespace(input, pos);
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
        store_variable(
            env,
            var_name,
            None,
            declared_type,
            None,
            true,
            None,
            None,
            None,
            None,
        )?;
        skip_whitespace(input, pos);
        *pos += 1;
        return Ok(());
    }
    *pos += 1;
    skip_whitespace(input, pos);

    // Check if this is a function pointer assignment (RHS is an identifier that refers to a function)
    let saved_pos = *pos;
    if let Ok((func_name, name_len)) = parse_identifier(&input[*pos..]) {
        let after_name_pos = saved_pos + name_len;
        let after_name = &input[after_name_pos..].trim_start();

        // If RHS is just an identifier followed by semicolon, check if it's a function
        if after_name.starts_with(';') && crate::variables::get_function(&func_name).is_some() {
            *pos = after_name_pos;
            store_variable(
                env,
                var_name,
                None,
                declared_type,
                None,
                is_mutable,
                None,
                None,
                Some(func_name),
                None,
            )?;
            skip_whitespace(input, pos);
            *pos += 1;
            return Ok(());
        }
    }

    // Otherwise parse as normal expression
    *pos = saved_pos;
    let (val, actual_type, points_to) = parse_value_or_reference(input, pos, env)?;

    // If we have a declared struct type, extract struct_fields and methods from temp variable
    let (mut struct_fields, mut methods) = if let Some(ref decl_type) = declared_type {
        let temp_var_name = format!("_struct_inst_{}", decl_type);
        if let Some(info) = env.get(&temp_var_name) {
            (info.struct_fields.clone(), info.methods.clone())
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    if struct_fields.is_none()
        && methods.is_none()
        && !actual_type.is_empty()
        && actual_type.chars().next().is_some_and(|c| c.is_uppercase())
    {
        let temp_var_name = format!("_struct_inst_{}", actual_type);
        if let Some(info) = env.get(&temp_var_name) {
            struct_fields = info.struct_fields.clone();
            methods = info.methods.clone();
        }
    }

    let var_name_for_func = var_name.clone();
    store_variable(
        env,
        var_name,
        Some(val),
        declared_type,
        Some(actual_type),
        is_mutable,
        points_to,
        struct_fields,
        None,
        methods,
    )?;

    if let Some(returned_func) = env.remove("_returned_function") {
        if let Some(local_func) = returned_func.local_function {
            if let Some(existing) = env.get(&var_name_for_func).cloned() {
                env.insert(
                    var_name_for_func.clone(),
                    VariableInfo {
                        local_function: Some(local_func),
                        points_to: returned_func.points_to.clone(),
                        ..existing
                    },
                );
            }
        }
    }
    expect_semicolon(input, pos)?;
    Ok(())
}
fn check_keyword_match(input: &str, pos: &mut usize, keyword: &str) -> bool {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with(keyword) {
        return false;
    }

    // Only update pos if it matches
    *pos += rest.len() - trimmed.len() + keyword.len();
    true
}

pub fn parse_top_level_let(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    if !check_keyword_match(input, pos, "let ") {
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
pub fn parse_top_level_struct(input: &str, pos: &mut usize) -> Result<bool, String> {
    crate::structs::parse_struct_definition(input, pos)
}

pub fn parse_top_level_function(input: &str, pos: &mut usize) -> Result<bool, String> {
    crate::functions::parse_function_definition(input, pos)
}

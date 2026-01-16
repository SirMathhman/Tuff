use crate::parse_utils::{parse_identifier, parse_number_with_type, skip_whitespace};
use crate::variables::{register_struct, Environment, StructDef, VariableInfo, get_struct_registry};
use std::collections::HashMap;

fn parse_field_header(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let (field_name, name_len) = parse_identifier(&input[*pos..])?;
    *pos += name_len;

    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with(':') {
        return Err("Expected ':' after field name".to_string());
    }
    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    skip_whitespace(input, pos);
    Ok(field_name)
}

fn try_consume_closing_brace(input: &str, pos: &mut usize) -> bool {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();

    if trimmed.starts_with('}') {
        *pos += input[*pos..].len() - trimmed.len() + 1;
        return true;
    }
    false
}

#[allow(dead_code)]
fn try_consume_comma(input: &str, pos: &mut usize) -> bool {
    skip_whitespace(input, pos);
    let trimmed = input[*pos..].trim_start();

    if trimmed.starts_with(',') {
        *pos += input[*pos..].len() - trimmed.len() + 1;
        return true;
    }
    false
}

#[allow(clippy::too_many_lines)]
pub fn parse_struct_definition(
    input: &str,
    pos: &mut usize,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("struct ") {
        return Ok(false);
    }

    *pos += rest.len() - trimmed.len() + 7; // "struct " = 7 chars

    // Parse struct name
    let (struct_name, name_len) = parse_identifier(&input[*pos..])?;
    *pos += name_len;

    skip_whitespace(input, pos);

    // Expect '{'
    if !input[*pos..].trim_start().starts_with('{') {
        return Err("Expected '{' after struct name".to_string());
    }
    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    // Parse fields
    let mut fields = Vec::new();
    loop {
        if try_consume_closing_brace(input, pos) {
            break;
        }

        let field_name = parse_field_header(input, pos)?;

        // Parse field type
        let (field_type, type_len) = parse_identifier(&input[*pos..])?;
        *pos += type_len;

        fields.push((field_name, field_type));

        if try_consume_closing_brace(input, pos) {
            break;
        } else if !try_consume_comma(input, pos) {
            return Err("Expected ',' or '}' after field".to_string());
        }
    }

    let struct_def = StructDef {
        name: struct_name,
        fields,
    };
    
    register_struct(struct_def);

    Ok(true)
}

#[allow(clippy::too_many_lines)]
pub fn try_parse_struct_instantiation(
    struct_name: &str,
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<Option<(i32, String)>, String> {
    let registry = get_struct_registry();
    
    if !registry.contains_key(struct_name) {
        return Ok(None);
    }

    skip_whitespace(input, pos);

    // Expect '{'
    if !input[*pos..].trim_start().starts_with('{') {
        return Ok(None);
    }

    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    let mut field_values = HashMap::new();

    loop {
        if try_consume_closing_brace(input, pos) {
            break;
        }

        let field_name = parse_field_header(input, pos)?;

        // Parse field value - can be number or variable
        let value = if input[*pos..]
            .trim_start()
            .chars()
            .next()
            .is_some_and(|c| c.is_alphabetic() || c == '_')
        {
            // Parse as variable
            let (var_name, var_len) = parse_identifier(&input[*pos..])?;
            *pos += var_len;
            let var_info = env
                .get(&var_name)
                .ok_or_else(|| format!("Undefined variable: {}", var_name))?;
            var_info
                .value
                .ok_or_else(|| format!("Variable '{}' is not initialized", var_name))?
        } else {
            // Parse as number
            let (value, _, val_len) = parse_number_with_type(&input[*pos..])?;
            *pos += val_len;
            value
        };

        field_values.insert(field_name, value);

        if try_consume_closing_brace(input, pos) {
            break;
        } else if !try_consume_comma(input, pos) {
            return Err("Expected ',' or '}' in struct instantiation".to_string());
        }
    }

    // Store the struct instance in a variable
    let var_name = format!("_struct_inst_{}", struct_name);
    let var_info = VariableInfo {
        value: Some(0), // Placeholder value
        type_name: struct_name.to_string(),
        is_mutable: false,
        points_to: None,
        struct_fields: Some(field_values),
    };
    env.insert(var_name.clone(), var_info);

    Ok(Some((0, struct_name.to_string())))
}

pub fn get_field_value(
    struct_var: &str,
    field_name: &str,
    env: &Environment,
) -> Result<i32, String> {
    let var_info = env
        .get(struct_var)
        .ok_or_else(|| format!("Undefined variable: {}", struct_var))?;
    
    let fields = var_info
        .struct_fields
        .as_ref()
        .ok_or_else(|| format!("Variable '{}' is not a struct", struct_var))?;
    
    fields
        .get(field_name)
        .copied()
        .ok_or_else(|| format!("Field '{}' not found in struct", field_name))
}

use crate::validators::validate_type_range;
use crate::variables::Environment;

pub fn parse_number_inner(input: &str) -> Result<(i64, String, usize), String> {
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

pub fn check_and_consume_op(input: &str, pos: &mut usize, ops: &str) -> Option<char> {
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

pub fn try_parse_this_keyword(
    input: &str,
    pos: &mut usize,
    env: &Environment,
) -> Result<Option<(i32, String)>, String> {
    if let Ok(Some(var_name)) = parse_dot_and_identifier(input, pos) {
        let var_info = env
            .get(&var_name)
            .ok_or_else(|| format!("Undefined variable: {}", var_name))?
            .clone();

        Ok(Some((
            var_info.value.ok_or("Variable has no value")?,
            var_info.type_name,
        )))
    } else {
        Ok(None)
    }
}

pub fn try_construct_struct_from_this(env: &mut crate::variables::Environment) -> Result<Option<(i32, String)>, String> {
    // Get struct registry and find a struct whose fields match parameters in env
    for (struct_name, struct_def) in crate::variables::get_struct_registry() {
        let mut struct_fields = std::collections::HashMap::new();
        let mut all_fields_found = true;
        
        for (field_name, _field_type) in struct_def.fields.iter() {
            if let Some(var_info) = env.get(field_name) {
                if let Some(value) = var_info.value {
                    struct_fields.insert(field_name.clone(), value);
                } else {
                    all_fields_found = false;
                    break;
                }
            } else {
                all_fields_found = false;
                break;
            }
        }
        
        if all_fields_found && !struct_def.fields.is_empty() {
            // Found a matching struct - collect methods from environment
            let mut methods = std::collections::HashMap::new();
            for (var_name, var_info) in env.iter() {
                if let Some(local_func) = &var_info.local_function {
                    methods.insert(var_name.clone(), local_func.clone());
                }
            }
            
            // Store the struct instance like struct instantiation does
            let temp_var_name = format!("_struct_inst_{}", struct_name);
            let var_info = crate::variables::VariableInfo {
                value: Some(0),
                type_name: struct_name.clone(),
                is_mutable: false,
                points_to: None,
                struct_fields: Some(struct_fields),
                function_name: None,
                local_function: None,
                methods: if methods.is_empty() { None } else { Some(methods) },
            };
            env.insert(temp_var_name, var_info);
            
            return Ok(Some((0, struct_name.clone())));
        }
    }
    Ok(None)
}

pub fn parse_dot_and_identifier(input: &str, pos: &mut usize) -> Result<Option<String>, String> {
    skip_whitespace(input, pos);
    if !input[*pos..].trim_start().starts_with('.') {
        return Ok(None);
    }

    let trimmed = input[*pos..].trim_start();
    *pos += input[*pos..].len() - trimmed.len() + 1;

    let (field_name, field_len) = parse_identifier(&input[*pos..])?;
    *pos += field_len;

    Ok(Some(field_name))
}

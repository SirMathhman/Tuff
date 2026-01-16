use crate::parse_utils::{parse_identifier, skip_whitespace};
use crate::variables::{is_type_compatible, Environment, VariableInfo};

mod control_flow;
pub use control_flow::{
    parse_block, parse_for_statement, parse_if_statement, parse_while_statement,
};
#[allow(clippy::too_many_lines)]
fn read_type_name_after_colon(input: &str, pos: &mut usize) -> Result<String, String> {
    skip_whitespace(input, pos);
    let rest = &input[*pos..];

    // Check for function pointer type: (Type, Type) => ReturnType
    if rest.starts_with('(') {
        let mut type_str = String::new();
        let mut depth = 0;
        let mut temp_pos = 0;

        while temp_pos < rest.len() {
            let c = rest
                .chars()
                .nth(temp_pos)
                .ok_or("Invalid character in type")?;

            if c == '(' {
                depth += 1;
                type_str.push(c);
            } else if c == ')' {
                depth -= 1;
                type_str.push(c);
                temp_pos += 1;
                break;
            } else {
                type_str.push(c);
            }
            temp_pos += 1;
        }

        if depth != 0 {
            return Err("Unmatched parentheses in function type".to_string());
        }

        skip_whitespace(&rest[temp_pos..], &mut 0);
        let remaining = &rest[temp_pos..].trim_start();

        if remaining.starts_with("=>") {
            type_str.push_str(" => ");
            temp_pos += rest[temp_pos..].len() - remaining.len() + 2;

            let (return_type, return_len) = parse_identifier(&rest[temp_pos..])?;
            type_str.push_str(&return_type);
            temp_pos += return_len;

            *pos += temp_pos;
            return Ok(type_str);
        }

        Err("Expected '=>' in function type".to_string())
    } else {
        // Regular type with optional pointers
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
            struct_fields: var_info.struct_fields,
            function_name: None,
            local_function: None,
            methods: None,
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

        // Check for &mut
        let is_mutable_ref = if input[*pos..].trim_start().starts_with("mut ") {
            skip_whitespace(input, pos);
            *pos += 4;
            skip_whitespace(input, pos);
            true
        } else {
            false
        };

        let (ref_var_name, len) = parse_identifier(&input[*pos..])?;
        *pos += len;
        let ref_type = crate::pointers::resolve_reference(&ref_var_name, env, is_mutable_ref)?;
        Ok((0, ref_type, Some(ref_var_name)))
    } else {
        let (val, ty) = crate::parser::parse_term_with_type(input, pos, env)?;
        Ok((val, ty, None))
    }
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
    let (struct_fields, methods) = if let Some(ref decl_type) = declared_type {
        let temp_var_name = format!("_struct_inst_{}", decl_type);
        if let Some(info) = env.get(&temp_var_name) {
            (info.struct_fields.clone(), info.methods.clone())
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

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
    expect_semicolon(input, pos)?;
    Ok(())
}
fn try_parse_dereference_assignment(
    input: &str,
    pos: &mut usize,
    trimmed: &str,
    ws_offset: usize,
    env: &mut Environment,
) -> Result<bool, String> {
    if let Some(after_star) = trimmed.strip_prefix('*') {
        let after_star_trimmed = after_star.trim_start();

        // Only proceed if it looks like it could be a dereference assignment
        if after_star_trimmed
            .chars()
            .next()
            .is_some_and(|c| c.is_alphabetic() || c == '_')
        {
            // Look ahead to see if there's an = after the identifier
            let (potential_var, var_len) = parse_identifier(after_star_trimmed)?;
            let after_var = &after_star_trimmed[var_len..];
            let after_var_trimmed = after_var.trim_start();

            if after_var_trimmed.starts_with('=') {
                // This is a dereference assignment
                *pos += ws_offset + 1; // skip *
                skip_whitespace(input, pos);
                *pos += after_star_trimmed.len() - after_var_trimmed.len(); // skip var
                skip_whitespace(input, pos);

                skip_whitespace(input, pos);
                if !input[*pos..].trim_start().starts_with('=') {
                    return Err("Expected '=' in dereference assignment".to_string());
                }
                *pos += 1;
                skip_whitespace(input, pos);

                let (val, _actual_type, _) = parse_value_or_reference(input, pos, env)?;

                // Update the pointed variable through the pointer
                crate::pointers::assign_through_pointer(&potential_var, val, env)?;

                expect_semicolon(input, pos)?;
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn execute_compound_assignment(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
    op: char,
    var_name: String,
    var_info: VariableInfo,
) -> Result<(), String> {
    if !input[*pos..].trim_start().starts_with(&format!("{}=", op)) {
        return Err(format!("Expected '{}='", op));
    }
    *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 2;
    skip_whitespace(input, pos);

    let (rhs_val, actual_type, _) = parse_value_or_reference(input, pos, env)?;
    let lhs_val = var_info
        .value
        .ok_or_else(|| format!("Variable '{}' is not initialized", var_name))?;
    let result = match op {
        '+' => lhs_val + rhs_val,
        '-' => lhs_val - rhs_val,
        '*' => lhs_val * rhs_val,
        '/' => {
            if rhs_val == 0 {
                return Err("Division by zero".to_string());
            } else {
                lhs_val / rhs_val
            }
        }
        _ => return Err(format!("Unknown operator: {}", op)),
    };

    update_mutable_var(env, var_name, var_info, result, actual_type, None)?;
    Ok(())
}

// Note: function is at 56 lines due to complex compound assignment parsing logic
#[allow(clippy::too_many_lines)]
pub fn parse_assignment_statement(
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
) -> Result<bool, String> {
    let rest = &input[*pos..];
    let trimmed = rest.trim_start();
    let ws_offset = rest.len() - trimmed.len();

    if try_parse_dereference_assignment(input, pos, trimmed, ws_offset, env)? { return Ok(true); }
    if let Some(after_this) = trimmed.strip_prefix("this.") {
        if let Ok((var_name, var_len)) = parse_identifier(after_this) {
            if after_this[var_len..].trim_start().starts_with('=') {
                *pos += ws_offset + 5 + var_len;
                skip_whitespace(input, pos);
                *pos += 1;
                skip_whitespace(input, pos);
                let vi = env.get(&var_name).ok_or(format!("Undefined: {}", var_name))?.clone();
                if !vi.is_mutable { return Err(format!("Cannot assign to immutable '{}'", var_name)); }
                let (val, ty, pts) = parse_value_or_reference(input, pos, env)?;
                update_mutable_var(env, var_name, vi, val, ty, pts)?;
                skip_whitespace(input, pos);
                if !input[*pos..].trim_start().starts_with(';') { return Err("Expected ';'".to_string()); }
                *pos += input[*pos..].len() - input[*pos..].trim_start().len() + 1;
                return Ok(true);
            }
        }
    }

    if !trimmed.chars().next().is_some_and(|c| c.is_alphabetic() || c == '_') { return Ok(false); }
    let (potential_var, var_len) = parse_identifier(trimmed)?;
    let after_var = &trimmed[var_len..];
    let after_var_trimmed = after_var.trim_start();
    let compound_op = if after_var_trimmed.starts_with("+=") {
        Some('+')
    } else if after_var_trimmed.starts_with("-=") {
        Some('-')
    } else if after_var_trimmed.starts_with("*=") {
        Some('*')
    } else if after_var_trimmed.starts_with("/=") {
        Some('/')
    } else {
        None
    };
    if compound_op.is_none() && !after_var_trimmed.starts_with('=') {
        return Ok(false);
    }

    *pos += ws_offset + var_len;
    let var_name = potential_var;
    let var_info = env.get(&var_name).ok_or_else(|| format!("Undefined variable: {}", var_name))?.clone();
    if !var_info.is_mutable {
        return Err(format!("Cannot assign to immutable variable '{}'", var_name));
    }
    skip_whitespace(input, pos);
    if let Some(op) = compound_op {
        execute_compound_assignment(input, pos, env, op, var_name, var_info)?;
    } else {
        if !input[*pos..].trim_start().starts_with('=') {
            return Err("Expected '=' in assignment".to_string());
        }
        *pos += 1;
        skip_whitespace(input, pos);
        let (val, actual_type, points_to) = parse_value_or_reference(input, pos, env)?;
        update_mutable_var(env, var_name, var_info, val, actual_type, points_to)?;
    }

    expect_semicolon(input, pos)?;
    Ok(true)
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

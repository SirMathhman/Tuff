use crate::parse_context::ParseEnvContextMut;
use crate::parse_utils::{skip_whitespace, try_construct_struct_from_this, try_parse_this_keyword};
use crate::parser::methods::{try_parse_method, try_parse_method_pointer_access, MethodMode};
use crate::structs::{
    resolve_temp_struct_access, try_parse_field_access, try_parse_struct_instantiation, ParsedValue,
};

fn handle_this_keyword(
    ctx: &mut ParseEnvContextMut,
) -> Result<Option<(i32, String)>, String> {
    skip_whitespace(ctx.input, ctx.pos);
    if ctx.input[*ctx.pos..].trim_start().starts_with('.') {
        // this.field - field access
        try_parse_this_keyword(ctx.input, ctx.pos, ctx.env)
    } else {
        // bare 'this' - try to construct a struct from parameters
        try_construct_struct_from_this(ctx.env)
    }
}

fn handle_struct_logic(
    identifier: &str,
    ctx: &mut ParseEnvContextMut,
) -> Result<Option<(i32, String)>, String> {
    // Try to parse struct instantiation
    if let Ok(Some((val, type_name))) = try_parse_struct_instantiation(ctx, identifier) {
        // Check for field access on struct instantiation
        let temp_var_name = format!("_struct_inst_{}", identifier);
        return resolve_temp_struct_access(
            ctx,
            &temp_var_name,
            ParsedValue { val, type_name },
        )
        .map(Some);
    }
    Ok(None)
}

fn handle_function_call(
    identifier: &str,
    ctx: &mut ParseEnvContextMut,
) -> Result<Option<(i32, String)>, String> {
    if let Ok(Some((val, type_name))) = crate::functions::try_parse_function_call(identifier, ctx) {
        // If the function returned a struct, allow immediate field/method access
        if type_name.chars().next().is_some_and(|c| c.is_uppercase()) {
            let temp_var_name = format!("_struct_inst_{}", type_name);
            if let Ok(Some((result, method_type))) =
                try_parse_method(ctx, &temp_var_name, MethodMode::Call)
            {
                return Ok(Some((result, method_type)));
            }
            if let Ok(Some((result, method_type))) =
                try_parse_method(ctx, &temp_var_name, MethodMode::Access)
            {
                return Ok(Some((result, method_type)));
            }
            return resolve_temp_struct_access(
                ctx,
                &temp_var_name,
                ParsedValue { val, type_name },
            )
            .map(Some);
        }

        // Check if the result is a function type (contains =>) and try to call it again
        return crate::currying::handle_chained_function_calls(ctx, val, type_name).map(Some);
    }
    Ok(None)
}

fn handle_variable_access(
    identifier: &str,
    ctx: &mut ParseEnvContextMut,
) -> Result<(i32, String), String> {
    let var_info = ctx
        .env
        .get(identifier)
        .ok_or_else(|| format!("Undefined variable: {}", identifier))?
        .clone();

    // Check for method call first (has higher precedence than field access)
    if let Ok(Some((result, type_name))) = try_parse_method(ctx, identifier, MethodMode::Call) {
        return Ok((result, type_name));
    }

    // Check for method access without invocation (returns a function)
    if let Ok(Some((result, type_name))) = try_parse_method(ctx, identifier, MethodMode::Access) {
        return Ok((result, type_name));
    }

    // Check for field access
    if let Ok(Some((field_value, _))) = try_parse_field_access(ctx, identifier) {
        return Ok((field_value, "".to_string()));
    }

    // Check for function pointer call
    if let Some(func_name) = &var_info.extra.function_name {
        if let Ok(Some((val, type_name))) =
            crate::functions::try_parse_function_call(func_name, ctx)
        {
            return Ok((val, type_name));
        }
    }

    let val = var_info
        .value
        .ok_or_else(|| format!("Variable '{}' is not initialized", identifier))?;
    Ok((val, var_info.type_name))
}

pub fn handle_complex_identifier(
    identifier: &str,
    ctx: &mut ParseEnvContextMut,
) -> Result<(i32, String), String> {
    // Check for 'this' keyword
    if identifier == "this" {
        if let Some(res) = handle_this_keyword(ctx)? {
            return Ok(res);
        }
    }

    // Try to parse method pointer access (point::get)
    if let Ok(Some((val, type_name))) = try_parse_method_pointer_access(ctx, identifier) {
        return Ok((val, type_name));
    }

    if let Some(res) = handle_struct_logic(identifier, ctx)? {
        return Ok(res);
    }

    if let Some(res) = handle_function_call(identifier, ctx)? {
        return Ok(res);
    }

    handle_variable_access(identifier, ctx)
}

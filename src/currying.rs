use crate::functions::parse_complete_function;
use crate::parse_context::ParseEnvContextMut;
use crate::parse_utils::skip_whitespace;
use crate::variables::{Environment, LocalFunction, VariableInfo};

/// Execute a function body, handling nested function definitions at the beginning
/// Returns the computed value of the function body expression
#[allow(clippy::too_many_lines)]
pub fn execute_function_body_with_definitions(
    body: &str,
    env: &mut Environment,
) -> Result<i32, String> {
    // Check if the body is a block (starts with {)
    let trimmed = body.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        // Parse as a block
        let mut pos = 0;
        let block_content = &trimmed[1..trimmed.len() - 1]; // Remove outer braces

        // Use parse_block to handle the nested environment
        let (result, _) = crate::statements::parse_block(block_content, &mut pos, env)?;
        return Ok(result);
    }

    // Otherwise, parse as simple function body with optional nested definitions
    let mut pos = 0;
    let mut last_defined_func: Option<String> = None;

    // First, try to parse any nested function definitions
    loop {
        skip_whitespace(body, &mut pos);

        if pos >= body.len() {
            break;
        }

        let rest = &body[pos..];
        let trimmed = rest.trim_start();

        // Try to parse a nested function definition
        if trimmed.starts_with("fn ") {
            let start_pos = pos + rest.len() - trimmed.len();
            pos = start_pos;

            match parse_complete_function(body, &mut pos) {
                Ok((func_name, params, return_type, nested_body)) => {
                    // Create a local function with captured environment
                    let local_func = LocalFunction {
                        params,
                        return_type: return_type.clone(),
                        body: nested_body,
                        captured_env: env.clone(),
                    };

                    let func_info = VariableInfo {
                        value: None,
                        type_name: "fn".to_string(),
                        is_mutable: false,
                        points_to: None,
                        struct_fields: None,
                        function_name: None,
                        local_function: Some(Box::new(local_func)),
                        methods: None,
                    };

                    env.insert(func_name.clone(), func_info);
                    last_defined_func = Some(func_name);
                    continue;
                }
                Err(_) => break,
            }
        } else {
            break;
        }
    }

    // After parsing all definitions, evaluate the remaining expression
    skip_whitespace(body, &mut pos);
    let remaining = &body[pos..];

    if remaining.trim().is_empty() {
        // No expression after definitions - this might be just a function definition
        // Mark the last defined function as the returned function
        if let Some(func_name) = last_defined_func {
            if let Some(var_info) = env.get(&func_name) {
                env.insert("_returned_function".to_string(), var_info.clone());
            }
        }
        return Ok(0);
    }

    // Check if the remaining expression is just an identifier (a function name)
    // If so, and it's a local function, mark it as the returned function
    if let Ok((possible_func_name, name_len)) = crate::parse_utils::parse_identifier(remaining) {
        // Check if it's just an identifier (no operators or other stuff after it)
        let rest_after_ident = &remaining[name_len..];
        if rest_after_ident.is_empty() || rest_after_ident.chars().all(char::is_whitespace) {
            if let Some(var_info) = env.get(&possible_func_name) {
                if var_info.local_function.is_some() {
                    // Store the returned function in a special marker
                    env.insert("_returned_function".to_string(), var_info.clone());
                    return Ok(0); // Return 0 as a marker for "returned function"
                }
            }
        }
    }

    // Otherwise evaluate as a normal expression from the remaining string
    let mut expr_pos = 0;
    crate::parser::interpret_at(remaining, &mut expr_pos, env)
}

/// Handle chained function calls where a function returns another function
/// This processes calls like: a(3)(4) where a(3) returns a function
pub fn handle_chained_function_calls(
    ctx: &mut ParseEnvContextMut,
    initial_val: i32,
    return_type: String,
) -> Result<(i32, String), String> {
    let mut current_val = initial_val;
    let mut current_type = return_type;

    loop {
        if !current_type.contains("=>") {
            // Not a function type anymore, return what we have
            return Ok((current_val, current_type));
        }

        crate::parse_utils::skip_whitespace(ctx.input, ctx.pos);
        if !ctx.input[*ctx.pos..].trim_start().starts_with('(') {
            // No more function calls, return what we have
            return Ok((current_val, current_type));
        }

        // Try to call the returned function
        if let Some(returned_func_var) = ctx.env.get("_returned_function").cloned() {
            if let Some(local_func) = returned_func_var.local_function {
                // Parse arguments - use a generic name since this is a returned function
                let args = crate::functions::parse_and_verify_arguments(
                    ctx,
                    "<returned_function>",
                    local_func.params.len(),
                )?;

                // Bind parameters and call the function
                let mut func_env = crate::functions::bind_parameters(
                    &local_func.params,
                    &args,
                    &local_func.captured_env,
                );

                // Execute the function body
                let result =
                    execute_function_body_with_definitions(&local_func.body, &mut func_env)?;

                // Check if we need to copy the _returned_function marker again
                if let Some(next_func_var) = func_env.get("_returned_function").cloned() {
                    ctx.env.insert("_returned_function".to_string(), next_func_var);
                } else {
                    ctx.env.remove("_returned_function");
                }

                current_val = result;
                current_type = local_func.return_type.clone();

                // Continue the loop to check if we can call again
                continue;
            }
        }

        // Couldn't call the returned function, return what we have
        return Ok((current_val, current_type));
    }
}

use crate::functions::parse_and_verify_arguments;
use crate::parse_context::ParseEnvContextMut;
use crate::parse_utils::{parse_dot_and_identifier, parse_identifier, skip_whitespace};
use crate::variables::{Environment, VariableInfo};

fn format_function_type(params: &[(String, String)], return_type: &str) -> String {
    let param_types: Vec<String> = params.iter().map(|(_, ty)| ty.clone()).collect();
    let params_str = if param_types.is_empty() {
        "()".to_string()
    } else {
        format!("({})", param_types.join(", "))
    };
    format!("{} => {}", params_str, return_type)
}

fn parse_method_selector(
    ctx: &mut ParseEnvContextMut,
) -> Result<Option<(String, bool, usize)>, String> {
    skip_whitespace(ctx.input, ctx.pos);
    let saved_pos = *ctx.pos;

    if let Ok(Some(method_name)) = parse_dot_and_identifier(ctx.input, ctx.pos) {
        skip_whitespace(ctx.input, ctx.pos);
        let is_call = ctx.input[*ctx.pos..].trim_start().starts_with('(');
        return Ok(Some((method_name, is_call, saved_pos)));
    }

    Ok(None)
}

fn lookup_method(
    var_name: &str,
    method_name: &str,
    env: &Environment,
) -> Result<Option<Box<crate::variables::LocalFunction>>, String> {
    let var_info = env
        .get(var_name)
        .ok_or_else(|| format!("Undefined variable: {}", var_name))?
        .clone();

    if let Some(methods) = &var_info.methods {
        if let Some(method) = methods.get(method_name) {
            return Ok(Some(method.clone()));
        }
    }

    Ok(None)
}

fn store_returned_method(
    env: &mut Environment,
    method: &crate::variables::LocalFunction,
    points_to: Option<String>,
) -> String {
    let func_type = format_function_type(&method.params, &method.return_type);
    let returned = VariableInfo {
        value: None,
        type_name: "fn".to_string(),
        is_mutable: false,
        points_to,
        struct_fields: None,
        function_name: None,
        local_function: Some(Box::new(method.clone())),
        methods: None,
    };
    env.insert("_returned_function".to_string(), returned);
    func_type
}

pub enum MethodMode {
    Call,
    Access,
}

#[allow(clippy::too_many_lines)]
pub fn try_parse_method(
    ctx: &mut ParseEnvContextMut,
    var_name: &str,
    mode: MethodMode,
) -> Result<Option<(i32, String)>, String> {
    let selector = parse_method_selector(ctx)?;
    let (method_name, is_call, saved_pos) = match selector {
        Some(value) => value,
        None => return Ok(None),
    };

    match mode {
        MethodMode::Call => {
            if !is_call {
                *ctx.pos = saved_pos;
                return Ok(None);
            }

            if let Some(method) = lookup_method(var_name, &method_name, ctx.env)? {
                let args =
                    parse_and_verify_arguments(ctx, &method_name, method.params.len())?;

                let mut method_env =
                    crate::functions::bind_parameters(&method.params, &args, &method.captured_env);

                let mut body_pos = 0;
                let result =
                    crate::parser::interpret_at(&method.body, &mut body_pos, &mut method_env)?;

                return Ok(Some((result, method.return_type.clone())));
            }
        }
        MethodMode::Access => {
            if is_call {
                *ctx.pos = saved_pos;
                return Ok(None);
            }

            if let Some(method) = lookup_method(var_name, &method_name, ctx.env)? {
                let func_type = store_returned_method(ctx.env, &method, None);
                return Ok(Some((0, func_type)));
            }
        }
    }

    *ctx.pos = saved_pos;
    Ok(None)
}

/// Try to parse a method pointer access using `::` (e.g., point::get)
pub fn try_parse_method_pointer_access(
    ctx: &mut ParseEnvContextMut,
    var_name: &str,
) -> Result<Option<(i32, String)>, String> {
    skip_whitespace(ctx.input, ctx.pos);
    let rest = &ctx.input[*ctx.pos..];
    let trimmed = rest.trim_start();

    if !trimmed.starts_with("::") {
        return Ok(None);
    }

    let saved_pos = *ctx.pos;
    *ctx.pos += rest.len() - trimmed.len() + 2;

    let (method_name, name_len) = parse_identifier(&ctx.input[*ctx.pos..])?;
    *ctx.pos += name_len;

    if let Some(method) = lookup_method(var_name, &method_name, ctx.env)? {
        let func_type = store_returned_method(
            ctx.env,
            &method,
            Some("__method_ptr__".to_string()),
        );
        return Ok(Some((0, format!("*{}", func_type))));
    }

    *ctx.pos = saved_pos;
    Ok(None)
}

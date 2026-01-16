use crate::functions::parse_and_verify_arguments;
use crate::parse_utils::{parse_dot_and_identifier, skip_whitespace};
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
    input: &str,
    pos: &mut usize,
) -> Result<Option<(String, bool, usize)>, String> {
    skip_whitespace(input, pos);
    let saved_pos = *pos;

    if let Ok(Some(method_name)) = parse_dot_and_identifier(input, pos) {
        skip_whitespace(input, pos);
        let is_call = input[*pos..].trim_start().starts_with('(');
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

pub enum MethodMode {
    Call,
    Access,
}

#[allow(clippy::too_many_lines)]
pub fn try_parse_method(
    var_name: &str,
    input: &str,
    pos: &mut usize,
    env: &mut Environment,
    mode: MethodMode,
) -> Result<Option<(i32, String)>, String> {
    let selector = parse_method_selector(input, pos)?;
    let (method_name, is_call, saved_pos) = match selector {
        Some(value) => value,
        None => return Ok(None),
    };

    match mode {
        MethodMode::Call => {
            if !is_call {
                *pos = saved_pos;
                return Ok(None);
            }

            if let Some(method) = lookup_method(var_name, &method_name, env)? {
                let args = parse_and_verify_arguments(
                    input,
                    pos,
                    env,
                    &method_name,
                    method.params.len(),
                )?;

                let mut method_env = crate::functions::bind_parameters(
                    &method.params,
                    &args,
                    &method.captured_env,
                );

                let mut body_pos = 0;
                let result =
                    crate::parser::interpret_at(&method.body, &mut body_pos, &mut method_env)?;

                return Ok(Some((result, method.return_type.clone())));
            }
        }
        MethodMode::Access => {
            if is_call {
                *pos = saved_pos;
                return Ok(None);
            }

            if let Some(method) = lookup_method(var_name, &method_name, env)? {
                let func_type = format_function_type(&method.params, &method.return_type);
                let returned = VariableInfo {
                    value: None,
                    type_name: "fn".to_string(),
                    is_mutable: false,
                    points_to: None,
                    struct_fields: None,
                    function_name: None,
                    local_function: Some(method.clone()),
                    methods: None,
                };
                env.insert("_returned_function".to_string(), returned);
                return Ok(Some((0, func_type)));
            }
        }
    }

    *pos = saved_pos;
    Ok(None)
}

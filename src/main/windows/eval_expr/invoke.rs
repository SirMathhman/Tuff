use crate::statement::Var;
use std::collections::HashMap;

use crate::eval_expr::eval_expr_with_env;

#[allow(clippy::too_many_arguments)]
pub(crate) fn invoke_fn_value(
    fn_value: &str,
    args_text: &str,
    env: &HashMap<String, Var>,
    maybe_captures_override: Option<&str>,
) -> Result<(String, Option<String>), String> {
    let (maybe_caps, params_part, _, body_part) = crate::fn_utils::parse_fn_value(fn_value);
    let param_names = crate::fn_utils::extract_param_names(params_part);
    let mut local_env = env.clone();

    // Apply captures from either override or parsed value
    let captures_to_use = maybe_captures_override.or(maybe_caps);
    if let Some(captures_str) = captures_to_use {
        for capture in captures_str.split(',') {
            let cap = capture.trim();
            let var_name = cap
                .strip_prefix("&mut ")
                .or_else(|| cap.strip_prefix('&'))
                .unwrap_or(cap)
                .trim();
            if let Some(captured_var) = env.get(var_name) {
                local_env.insert(var_name.to_string(), captured_var.clone());
            }
        }
    }

    // Collect args while respecting nested parentheses
    bind_args_to_local_env(&param_names, args_text, env, &mut local_env)?;

    crate::statement::eval_block_expr(body_part, &local_env, &eval_expr_with_env)
}

fn collect_args(args_text: &str) -> Vec<&str> {
    let mut args: Vec<&str> = Vec::new();
    let mut start = 0usize;
    let mut depth: i32 = 0;
    for (i, ch) in args_text.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                let piece = args_text[start..i].trim();
                if !piece.is_empty() {
                    args.push(piece);
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    let last_piece = args_text[start..].trim();
    if !last_piece.is_empty() {
        args.push(last_piece);
    }
    args
}

#[allow(clippy::too_many_arguments)]
fn bind_args_to_local_env(
    param_names: &[String],
    args_text: &str,
    env: &HashMap<String, Var>,
    local_env: &mut HashMap<String, Var>,
) -> Result<(), String> {
    let args = collect_args(args_text);
    for (i, arg_expr) in args.into_iter().enumerate() {
        let (val, suf) = eval_expr_with_env(arg_expr, env)?;
        let name = param_names.get(i).map(|s| s.as_str()).unwrap_or("");
        if !name.is_empty() {
            local_env.insert(
                name.to_string(),
                Var {
                    mutable: false,
                    suffix: suf.clone(),
                    value: val.clone(),
                    borrowed_mut: false,
                    declared_type: None,
                },
            );
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn invoke_fn_value_with_captures(
    fn_value: &str,
    args_text: &str,
    env: &HashMap<String, Var>,
    captures_str: Option<&str>,
    struct_value: &str,
) -> Result<Option<(String, Option<String>)>, String> {
    let (_, params_part, _, body_part) = crate::fn_utils::parse_fn_value(fn_value);
    let param_names = crate::fn_utils::extract_param_names(params_part);
    let mut local_env = env.clone();

    // Extract captured values from the struct
    if let Some(captures) = captures_str {
        if struct_value.starts_with("__STRUCT__:") {
            for capture in captures.split(',') {
                let cap = capture.trim();
                let var_name = cap
                    .strip_prefix("&mut ")
                    .or_else(|| cap.strip_prefix('&'))
                    .unwrap_or(cap)
                    .trim();

                if let Some(fval) =
                    crate::property_access::extract_field_from_struct_value(struct_value, var_name)
                {
                    // Parse the value - might have a suffix like "3I32"
                    let (val, suf) = if let Some(stripped) = fval.strip_suffix("I32") {
                        (stripped.to_string(), Some("I32".to_string()))
                    } else {
                        (fval.to_string(), None)
                    };
                    local_env.insert(
                        var_name.to_string(),
                        Var {
                            mutable: false,
                            suffix: suf,
                            value: val,
                            borrowed_mut: false,
                            declared_type: None,
                        },
                    );
                }
            }
        }
    }

    // Collect args while respecting nested parentheses
    bind_args_to_local_env(&param_names, args_text, env, &mut local_env)?;

    let result = crate::statement::eval_block_expr(body_part, &local_env, &eval_expr_with_env)?;
    Ok(Some(result))
}

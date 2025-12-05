use super::{eval_block_expr_mut, ExprEvaluator, StatementContext, Var};
use std::collections::HashMap;

/// Common logic for executing a function call with mutable captures.
/// Takes the environment and evaluator by reference and returns mutations to apply.
fn execute_fn_with_mut_captures(
    trimmed: &str,
    env: &mut HashMap<String, Var>,
    eval_expr: ExprEvaluator,
) -> Result<Option<(String, Option<String>)>, String> {
    // Check if this looks like a function call: name(args) or name()
    let paren_pos = match trimmed.find('(') {
        Some(p) => p,
        None => return Ok(None),
    };

    if !trimmed.ends_with(')') {
        return Ok(None);
    }

    let fn_name = trimmed[..paren_pos].trim();
    if fn_name.is_empty() || !fn_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Ok(None);
    }

    // Check if this function has mutable captures
    let captures_key = format!("__captures__{}", fn_name);
    let captures_str = match env.get(&captures_key) {
        Some(v) => v.value.clone(),
        None => return Ok(None), // No captures, use normal eval
    };

    // Check if any capture is mutable
    let has_mut_capture = captures_str
        .split(',')
        .any(|cap| cap.trim().starts_with("&mut "));
    if !has_mut_capture {
        return Ok(None); // Only immutable captures, use normal eval
    }

    // Get the function definition
    let fn_key = format!("__fn__{}", fn_name);
    let func_var = match env.get(&fn_key) {
        Some(v) => v.clone(),
        None => return Err(format!("unknown function: {}", fn_name)),
    };

    let (params_part, _, body_part) = crate::fn_utils::parse_fn_value(&func_var.value);
    let param_names = crate::fn_utils::extract_param_names(params_part);

    // Create local environment with captures
    let mut local_env = env.clone();

    // Track which variables are mutable captures (need to copy back)
    let mut mut_capture_names: Vec<String> = Vec::new();

    for capture in captures_str.split(',') {
        let cap = capture.trim();
        let is_mut = cap.starts_with("&mut ");
        let var_name = cap
            .strip_prefix("&mut ")
            .or_else(|| cap.strip_prefix('&'))
            .unwrap_or(cap)
            .trim();

        if let Some(captured_var) = env.get(var_name) {
            let mut var_clone = captured_var.clone();
            if is_mut {
                var_clone.mutable = true; // Allow mutation within function
                mut_capture_names.push(var_name.to_string());
            }
            local_env.insert(var_name.to_string(), var_clone);
        }
    }

    // Parse and evaluate arguments
    let args_str = &trimmed[paren_pos + 1..trimmed.len() - 1];
    let args = split_args(args_str);

    for (i, arg_expr) in args.into_iter().enumerate() {
        let (val, suf) = eval_expr(arg_expr, env)?;
        if let Some(name) = param_names.get(i) {
            local_env.insert(
                name.to_string(),
                Var {
                    mutable: false,
                    suffix: suf,
                    value: val,
                    borrowed_mut: false,
                },
            );
        }
    }

    // Execute the function body with mutable local_env
    let (result_val, result_suf) = eval_block_expr_mut(body_part, &mut local_env, eval_expr)?;

    // Copy mutable captures back to the original environment
    for var_name in mut_capture_names {
        if let Some(new_var) = local_env.get(&var_name) {
            if let Some(orig_var) = env.get_mut(&var_name) {
                orig_var.value = new_var.value.clone();
            }
        }
    }

    Ok(Some((result_val, result_suf)))
}

/// Try to handle a function call with mutable captures (block context).
pub fn try_call_with_mut_captures(
    s: &str,
    ctx: &mut StatementContext,
) -> Result<Option<(String, Option<String>)>, String> {
    execute_fn_with_mut_captures(s.trim(), ctx.env, ctx.eval_expr)
}

/// Try to handle a function call with mutable captures (top-level context).
pub fn try_call_with_mut_captures_top(
    s: &str,
    ctx: &mut super::TopStmtContext,
) -> Result<Option<(String, Option<String>)>, String> {
    execute_fn_with_mut_captures(s.trim(), ctx.env, ctx.eval_expr)
}

/// Split function arguments by comma, respecting parentheses depth
pub fn split_args(s: &str) -> Vec<&str> {
    let mut args = Vec::new();
    let mut depth = 0;
    let mut start = 0;

    for (i, ch) in s.char_indices() {
        match ch {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            ',' if depth == 0 => {
                let arg = s[start..i].trim();
                if !arg.is_empty() {
                    args.push(arg);
                }
                start = i + 1;
            }
            _ => {}
        }
    }

    let last = s[start..].trim();
    if !last.is_empty() {
        args.push(last);
    }

    args
}

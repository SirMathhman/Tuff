use super::Var;
use std::collections::HashMap;

// Try to copy a function definition and its captures from `src` to `target`.
// Returns Some((func_value, Some("FN"))) when successful, else None.
pub fn try_copy_fn_definition(
    env: &mut HashMap<String, Var>,
    src: &str,
    target: &str,
) -> Option<(String, Option<String>)> {
    let src_fn_key = format!("__fn__{}", src);
    if let Some(func_var) = env.get(&src_fn_key).cloned() {
        let target_fn_key = format!("__fn__{}", target);
        env.insert(target_fn_key.clone(), func_var.clone());
        let src_capt_key = format!("__captures__{}", src);
        if let Some(capt) = env.get(&src_capt_key).cloned() {
            let target_capt_key = format!("__captures__{}", target);
            env.insert(target_capt_key, capt.clone());
        }
        return Some((func_var.value.clone(), Some("FN".to_string())));
    }
    None
}

// Resolve RHS when possibly assigning a named function to `target`.
#[allow(clippy::too_many_arguments)]
pub fn resolve_fn_or_eval_rhs(
    env: &mut HashMap<String, Var>,
    rhs: &str,
    target: &str,
    eval_expr: super::ExprEvaluator,
) -> Result<(String, Option<String>), String> {
    let rhs_trim = rhs.trim();
    // If RHS is a function literal, parse it and store as a function under the target name
    if let Some((_, captures_str, params_str, return_type, body)) = parse_fn_literal(rhs_trim) {
        let fn_value = format!("{}|{}|{}", params_str, return_type, body);
        let fn_key = format!("__fn__{}", target);
        env.insert(
            fn_key.clone(),
            Var {
                mutable: false,
                value: fn_value.clone(),
                suffix: Some("FN".to_string()),
                borrowed_mut: false,
                declared_type: None,
            },
        );

        if !captures_str.is_empty() {
            let captures_key = format!("__captures__{}", target);
            env.insert(
                captures_key,
                Var {
                    mutable: false,
                    value: captures_str,
                    suffix: Some("CAPTURES".to_string()),
                    borrowed_mut: false,
                    declared_type: None,
                },
            );
        }

        return Ok((fn_value, Some("FN".to_string())));
    }
    if rhs_trim.chars().all(|c| c.is_alphanumeric() || c == '_') {
        if let Some((val, suf)) = try_copy_fn_definition(env, rhs_trim, target) {
            return Ok((val, suf));
        }
    }
    super::eval_rhs(rhs, env, eval_expr)
}

// Return a list of (variable_name, declared_type) for variables that have a declared type
pub fn collect_droppable_vars(env: &HashMap<String, Var>) -> Vec<(String, String)> {
    env.iter()
        .filter_map(|(name, var)| {
            var.declared_type
                .as_ref()
                .map(|dtype| (name.clone(), dtype.clone()))
        })
        .collect()
}

// Parse a function literal or definition string and extract (name, captures, params, return_type, body)
// Returns None if parsing fails.
pub fn parse_fn_literal(s: &str) -> Option<(String, String, String, String, String)> {
    if !s.trim_start().starts_with("fn ") {
        return None;
    }

    let s = s.trim();
    let mut arrow_pos_opt: Option<usize> = None;
    let mut open_brace: Option<usize> = None;
    let mut close_brace: Option<usize> = None;

    if let Some((arrow_pos, ob, cb)) = crate::brace_utils::find_fn_arrow_and_braces(s) {
        arrow_pos_opt = Some(arrow_pos);
        open_brace = Some(ob);
        close_brace = Some(cb);
    } else if let Some(a) = s.find("=>") {
        arrow_pos_opt = Some(a);
    }

    if let Some(arrow_pos) = arrow_pos_opt {
        let sig_str = s[3..arrow_pos].trim();

        let mut captures_str = String::new();
        let mut params_str = String::new();
        let mut return_type = String::new();

        let name_end = sig_str
            .find('[')
            .or_else(|| sig_str.find('('))
            .unwrap_or(sig_str.len());
        let fn_name = sig_str[..name_end].trim().to_string();

        if let Some(bracket_start) = sig_str.find('[') {
            if let Some(bracket_end) = sig_str.find(']') {
                if bracket_start < bracket_end {
                    captures_str = sig_str[bracket_start + 1..bracket_end].to_string();
                }
            }
        }

        if let Some(paren_start) = sig_str.find('(') {
            if let Some(paren_end) = sig_str.find(')') {
                if paren_start < paren_end {
                    params_str = sig_str[paren_start + 1..paren_end].to_string();
                    let after_paren = sig_str[paren_end + 1..].trim();
                    return_type = after_paren
                        .strip_prefix(':')
                        .unwrap_or(after_paren)
                        .trim()
                        .to_string();
                }
            }
        }

        let body = if let (Some(ob), Some(cb)) = (open_brace, close_brace) {
            s[ob + 1..cb].to_string()
        } else {
            let mut b = s[arrow_pos + 2..].trim().to_string();
            if b.ends_with(';') {
                b.pop();
                b = b.trim().to_string();
            }
            b
        };

        return Some((fn_name, captures_str, params_str, return_type, body));
    }

    None
}

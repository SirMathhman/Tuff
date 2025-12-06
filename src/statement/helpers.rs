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

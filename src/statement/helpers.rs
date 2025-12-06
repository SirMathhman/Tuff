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

/// Insert a named function definition and optional captures into the provided env.
#[allow(clippy::too_many_arguments)]
pub fn insert_named_fn(
    env: &mut HashMap<String, Var>,
    fn_name: &str,
    fn_value: &str,
    captures: Option<&str>,
) {
    let fn_key = format!("__fn__{}", fn_name);
    env.insert(
        fn_key.clone(),
        Var {
            mutable: false,
            value: fn_value.to_string(),
            suffix: Some("FN".to_string()),
            borrowed_mut: false,
            declared_type: None,
        },
    );

    if let Some(caps) = captures {
        if !caps.is_empty() {
            let captures_key = format!("__captures__{}", fn_name);
            env.insert(
                captures_key,
                Var {
                    mutable: false,
                    value: caps.to_string(),
                    suffix: Some("CAPTURES".to_string()),
                    borrowed_mut: false,
                    declared_type: None,
                },
            );
        }
    }
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
        let sig_slice = if s.starts_with("fn ") {
            &s[3..arrow_pos]
        } else {
            &s[..arrow_pos]
        };
        let sig_str = sig_slice.trim();

        let mut captures_str = String::new();
        let mut params_str = String::new();
        let mut return_type = String::new();

        // Create owned signature string so we can inspect/manipulate it
        let sig_owned = sig_str.to_string();

        let name_end = sig_owned
            .find('[')
            .or_else(|| sig_str.find('('))
            .unwrap_or(sig_str.len());
        let mut fn_name = sig_owned[..name_end].trim().to_string();
        // Arrow-style literals like `() => ...` won't have a name; clear it if it's just parentheses
        if fn_name.starts_with('(') || fn_name.is_empty() {
            fn_name = String::new();
        }

        if let Some(bracket_start) = sig_owned.find('[') {
            if let Some(bracket_end) = sig_str.find(']') {
                if bracket_start < bracket_end {
                    captures_str = sig_owned[bracket_start + 1..bracket_end].to_string();
                }
            }
        }

        if let Some(paren_start) = sig_owned.find('(') {
            if let Some(paren_end) = sig_str.find(')') {
                if paren_start < paren_end {
                    params_str = sig_owned[paren_start + 1..paren_end].to_string();
                    let after_paren = sig_owned[paren_end + 1..].trim();
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

/// Transform a class definition into a function that returns this.
/// Input: "class fn Point(x : I32, y : I32) => {fn manhattan() => x + y;}"
/// Output: "fn Point(x : I32, y : I32) => {fn manhattan() => x + y; this}"
/// Also preserves any tail after the closing brace.
pub fn transform_class_to_fn(input: &str) -> String {
    let s = input.trim();
    if !s.starts_with("class ") {
        return input.to_string();
    }

    // Strip "class " prefix
    let without_class = &s[6..].trim_start();

    // Check if it's a braced function body
    if let Some((_arrow_pos, _ob, cb)) = crate::brace_utils::find_fn_arrow_and_braces(without_class)
    {
        // Find the => and opening {
        if let Some(arrow_idx) = without_class.find("=>") {
            let fn_sig = &without_class[..arrow_idx];
            if let Some(open_brace_idx) = without_class[arrow_idx..].find('{') {
                let abs_open_idx = arrow_idx + open_brace_idx;
                let body_content = &without_class[abs_open_idx + 1..cb].trim();

                // Add "; this" to the body if not already there
                let new_body = if body_content.trim_end().ends_with('}') {
                    // Body already has nested braces
                    format!("{}; this", body_content)
                } else if body_content.trim_end().ends_with(';') {
                    format!("{} this", body_content)
                } else {
                    format!("{}; this", body_content)
                };

                // Preserve any tail after the closing brace
                let tail = &without_class[cb + 1..];

                // Keep the arrow in the output: fn_sig already contains "fn " and the signature
                return format!("{} => {{ {} }}{}", fn_sig.trim(), new_body, tail);
            }
        }
    }

    // For arrow-style functions without braces
    // Transform: class fn make() => fn inner() => 100
    // To: fn make() => (fn inner() => 100, this)  -- but we need it to return this, not both
    // Actually for non-braced: class fn make() => expression
    // We need to change it so it still returns a single value that is this
    // For now, skip non-braced classes

    input.to_string()
}

use crate::eval_expr::eval_expr_with_env;
use crate::evaluator::{build_struct_instance, Environment};

/// Find the first (or rightmost) dot at depth 0 in a string.
fn find_dot_at_depth_zero(text: &str, find_rightmost: bool) -> Option<usize> {
    let mut depth = 0i32;
    let mut paren_depth = 0i32;
    let mut result: Option<usize> = None;
    for (i, ch) in text.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => depth = depth.saturating_sub(1),
            '(' => paren_depth += 1,
            ')' => paren_depth = paren_depth.saturating_sub(1),
            '.' if depth == 0 && paren_depth == 0 => {
                result = Some(i);
                if !find_rightmost {
                    break;
                }
            }
            _ => {}
        }
    }
    result
}

/// Replace a substring in `trimmed` and optionally continue scanning for more dots.
fn replace_and_continue(
    trimmed: &mut String,
    range: (usize, usize),
    fval: String,
) -> Option<usize> {
    *trimmed = format!("{}{}{}", &trimmed[..range.0], fval, &trimmed[range.1..]);
    trimmed.find('.')
}

/// Preprocess property accesses in expressions, replacing simple identifier.field patterns
/// with their values so that expressions like `temp.x + temp.y` work.
pub fn preprocess_property_access(trimmed: &mut String, env: &Environment) {
    let dot_idx = find_dot_at_depth_zero(trimmed, false);

    if let Some(mut dotpos) = dot_idx {
        // Preprocess top-level property accesses so expressions like
        // `temp.x + temp.y` work by replacing `temp.x` occurrences with their field values.
        loop {
            // find immediate identifier after the dot
            let start_idx = dotpos + 1;
            let mut right_end_idx = start_idx;
            for (_i, ch) in trimmed[start_idx..].char_indices() {
                if ch.is_alphanumeric() || ch == '_' {
                    right_end_idx += ch.len_utf8();
                } else {
                    break;
                }
            }
            if right_end_idx == start_idx {
                break;
            }
            let right_ident = trimmed[start_idx..right_end_idx].trim().to_string();

            // Find the left identifier by scanning backwards from the dot
            let mut left_start_idx = dotpos;
            for (_, ch) in trimmed[..dotpos].char_indices().rev() {
                if ch.is_alphanumeric() || ch == '_' {
                    left_start_idx -= ch.len_utf8();
                } else {
                    break;
                }
            }
            if left_start_idx >= dotpos {
                break; // No identifier found before dot
            }
            let left_slice = trimmed[left_start_idx..dotpos].trim().to_string();

            if !left_slice.is_empty() {
                // Support literal `this.<field>` even though `this` is not a real env var
                if left_slice == "this" {
                    if let Some(field_var) = env.get(&right_ident) {
                        let fval = if let Some(s) = &field_var.suffix {
                            format!("{}{}", field_var.value, s)
                        } else {
                            field_var.value.clone()
                        };
                        if let Some(new_dot) =
                            replace_and_continue(trimmed, (left_start_idx, right_end_idx), fval)
                        {
                            dotpos = new_dot;
                            continue;
                        }
                    }
                }

                if let Some(var) = env.get(&left_slice) {
                    let left_val = &var.value;
                    if left_val.starts_with("__STRUCT__:") {
                        let rest = &left_val[10..];
                        let mut found = None;
                        for ent in rest.split('|').skip(1) {
                            if let Some(eq) = ent.find('=') {
                                let fname = &ent[..eq];
                                let fval = &ent[eq + 1..];
                                if fname == right_ident {
                                    found = Some(fval.to_string());
                                    break;
                                }
                            }
                        }
                        if let Some(fval) = found {
                            if let Some(new_dot) =
                                replace_and_continue(trimmed, (left_start_idx, right_end_idx), fval)
                            {
                                dotpos = new_dot;
                                continue;
                            }
                        }
                    }
                }
            }
            break;
        }
    }
}

/// Handle property access when the left side is not a simple identifier.
/// This handles cases like struct literals: `Wrapper { 100 }.value`
pub fn handle_complex_property_access(
    trimmed: &str,
    env: &Environment,
) -> Result<Option<(String, Option<String>)>, String> {
    let rightmost_dot = find_dot_at_depth_zero(trimmed, true);

    if let Some(dot_pos) = rightmost_dot {
        let left = trimmed[..dot_pos].trim();
        let right = trimmed[dot_pos + 1..].trim();

        // Check if right is a valid identifier
        if !right.is_empty() && right.chars().all(|c| c.is_alphanumeric() || c == '_') {
            // Check for struct literal: TypeName { ... }.field
            if let Some(open_br) = left.rfind('{') {
                if let Some(close_br) = left[open_br..].find('}').map(|i| i + open_br) {
                    let type_name = left[..open_br].trim();
                    if !type_name.is_empty() {
                        let key = format!("__struct__{}", type_name);
                        if env.contains_key(&key) {
                            let args_text = &left[open_br + 1..close_br];
                            let values_map = build_struct_instance(type_name, args_text, env)?;
                            if let Some(v) = values_map.get(right) {
                                return Ok(Some((v.clone(), None)));
                            }
                            return Err("field not found on struct instance".to_string());
                        }
                    }
                }
            }

            // Evaluate left as expression and check if it's a struct
            let (left_val, _left_suf) = eval_expr_with_env(left, env)?;
            if left_val.starts_with("__STRUCT__:") {
                let rest = &left_val[10..];
                let mut parts = rest.split('|');
                let _typename = parts.next();
                for ent in parts {
                    if let Some(eq) = ent.find('=') {
                        let fname = &ent[..eq];
                        let fval = &ent[eq + 1..];
                        if fname == right {
                            return Ok(Some((fval.to_string(), None)));
                        }
                    }
                }
                return Err("field not found on struct instance".to_string());
            }
        }
    }
    Ok(None)
}

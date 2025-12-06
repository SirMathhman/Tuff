use crate::brace_utils;
use crate::evaluator;
use crate::parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use crate::statement;
use crate::statement::Var;
// SUFFIXES are not used directly in this module
use std::collections::HashMap;

fn build_struct_instance(
    type_name: &str,
    args_text: &str,
    env: &HashMap<String, Var>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let key = format!("__struct__{}", type_name);
    let templ = env
        .get(&key)
        .ok_or_else(|| "unknown struct type".to_string())?;
    let fields_def = templ.value.trim();
    let mut field_names: Vec<String> = Vec::new();
    for part in fields_def.split(|c| [',', ';'].contains(&c)) {
        let p = part.trim();
        if p.is_empty() {
            continue;
        }
        let fn_name = p.split(':').next().unwrap_or("").trim();
        if !fn_name.is_empty() {
            field_names.push(fn_name.to_string());
        }
    }

    let mut args: Vec<&str> = Vec::new();
    let mut start = 0usize;
    let mut depth2: i32 = 0;
    for (i, ch) in args_text.char_indices() {
        match ch {
            '{' => depth2 += 1,
            '}' => depth2 = depth2.saturating_sub(1),
            '(' => depth2 += 1,
            ')' => depth2 = depth2.saturating_sub(1),
            ',' if depth2 == 0 => {
                let piece = args_text[start..i].trim();
                if !piece.is_empty() {
                    args.push(piece);
                }
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < args_text.len() {
        let last = args_text[start..].trim();
        if !last.is_empty() {
            args.push(last);
        }
    }

    let mut values_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for (i, a) in args.into_iter().enumerate() {
        let (val, _suf) = eval_expr_with_env(a, env)?;
        if let Some(fname) = field_names.get(i) {
            values_map.insert(fname.clone(), val);
        }
    }

    Ok(values_map)
}

/// Helper to invoke a function given its parsed value, args, and env.
/// Returns the result of calling the function.
#[allow(clippy::too_many_arguments)]
fn invoke_fn_value(
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

    statement::eval_block_expr(body_part, &local_env, &eval_expr_with_env)
}

pub fn eval_expr_with_env(
    expr: &str,
    env: &HashMap<String, Var>,
) -> Result<(String, Option<String>), String> {
    let mut trimmed = expr.trim().to_string();

    // Disallow standalone arrow-style function literals as top-level expressions.
    // Arrow-style function literals are only allowed when used as RHS (e.g. `let a = () => ...`) or
    // inside other expressions. Reject bare `(args) => {}` or `() => expr` at top level.
    if crate::statement::parse_fn_literal(&trimmed).is_some() && !trimmed.starts_with("fn ") {
        return Err("invalid input".to_string());
    }

    // Support function literals as expressions (return as FN values)
    if trimmed.starts_with("fn ") {
        if let Some((_name, captures_str, params_str, return_type, body)) =
            crate::statement::parse_fn_literal(&trimmed)
        {
            let fn_value = if captures_str.is_empty() {
                format!("{}|{}|{}", params_str, return_type, body)
            } else {
                format!("{}|{}|{}|{}", captures_str, params_str, return_type, body)
            };
            return Ok((fn_value, Some("FN".to_string())));
        }
    }

    // address-of operator: &var
    if let Some(stripped) = trimmed.strip_prefix('&') {
        let mut inner = stripped.trim();
        let mut is_mutref = false;
        if let Some(rest) = inner.strip_prefix("mut ") {
            is_mutref = true;
            inner = rest.trim();
        }
        // only support taking address of simple identifiers for now
        if !inner.is_empty() && inner.chars().all(|c| c.is_alphanumeric() || c == '_') {
            if let Some(v) = env.get(inner) {
                if is_mutref && !v.mutable {
                    return Err("cannot take mutable reference of immutable variable".to_string());
                }
                if !is_mutref && v.borrowed_mut {
                    return Err(
                        "cannot take immutable reference while variable already mutably borrowed"
                            .to_string(),
                    );
                }
                // pointer encoded as: __PTR__:<pointee_suffix>|<target_name>
                let (ptr_val, ptr_suffix) =
                    crate::pointer_utils::build_ptr_components(v.suffix.as_ref(), inner, is_mutref);
                return Ok((ptr_val, ptr_suffix));
            } else {
                return Err("address-of to unknown identifier".to_string());
            }
        }
    }

    if trimmed == "true" || trimmed == "false" {
        return Ok((trimmed.to_string(), None));
    }

    if let Some(first) = trimmed.chars().next() {
        if (first.is_alphabetic() || first == '_')
            && trimmed.chars().all(|c| c.is_alphanumeric() || c == '_')
        {
            if let Some(v) = env.get(trimmed.as_str()) {
                return Ok((v.value.clone(), v.suffix.clone()));
            }
        }
    }

    loop {
        let mut brace_start = None;
        let mut depth: i32 = 0;
        let mut paren_depth: i32 = 0;
        let mut found_block = false;

        for (i, ch) in trimmed.char_indices() {
            match ch {
                '{' if paren_depth == 0 => {
                    let prev_char_opt = trimmed[..i].chars().rev().find(|c| !c.is_whitespace());
                    let seen_ident_before = prev_char_opt
                        .map(|pc| pc.is_alphanumeric() || pc == '_')
                        .unwrap_or(false);
                    if !seen_ident_before && brace_start.is_none() {
                        brace_start = Some(i);
                    }
                    depth += 1;
                }
                '}' if paren_depth == 0 => {
                    depth = depth.saturating_sub(1);
                    if let Some(block_start) = brace_start {
                        if depth == 0 {
                            let block_content = &trimmed[block_start + 1..i];
                            let (block_value, block_suffix) = statement::eval_block_expr(
                                block_content,
                                env,
                                &eval_expr_with_env,
                            )?;
                            let block_result = if let Some(suffix) = block_suffix {
                                format!("{}{}", block_value, suffix)
                            } else {
                                block_value
                            };
                            trimmed = format!(
                                "{}{}{}",
                                &trimmed[..block_start],
                                block_result,
                                &trimmed[i + 1..]
                            );
                            found_block = true;
                            break;
                        }
                    }
                }
                '(' => paren_depth += 1,
                ')' => paren_depth = paren_depth.saturating_sub(1),
                _ => {}
            }
        }

        if !found_block {
            break;
        }
    }

    // dereference operator: *ptr
    if let Some(stripped) = trimmed.strip_prefix('*') {
        let inner = stripped.trim();
        let (val, _suf) = eval_expr_with_env(inner, env)?;
        if let Some(rest) = val.strip_prefix("__PTR__:") {
            if let Some(pipe) = rest.find('|') {
                let _ptype = &rest[..pipe];
                let target = &rest[pipe + 1..];
                if let Some(tv) = env.get(target) {
                    return Ok((tv.value.clone(), tv.suffix.clone()));
                }
                return Err("dereference to invalid pointer".to_string());
            }
        }
        return Err("dereference of non-pointer value".to_string());
    }

    // property access handling
    {
        let mut depth = 0i32;
        let mut paren_depth = 0i32;
        let mut dot_idx: Option<usize> = None;
        for (i, ch) in trimmed.char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => depth = depth.saturating_sub(1),
                '(' => paren_depth += 1,
                ')' => paren_depth = paren_depth.saturating_sub(1),
                '.' if depth == 0 && paren_depth == 0 => {
                    dot_idx = Some(i);
                    break;
                }
                _ => {}
            }
        }

        if let Some(dotpos) = dot_idx {
            let left = trimmed[..dotpos].trim();
            let right = trimmed[dotpos + 1..].trim();
            if right.chars().all(|c| c.is_alphanumeric() || c == '_') && !right.is_empty() {
                if let Some(open_br) = left.find('{') {
                    if left.ends_with('}') {
                        if let Some(close_br) = brace_utils::find_matching_brace(left, open_br) {
                            let type_name = left[..open_br].trim();
                            if !type_name.is_empty() {
                                let key = format!("__struct__{}", type_name);
                                if env.contains_key(&key) {
                                    let args_text = &left[open_br + 1..close_br];
                                    let values_map =
                                        build_struct_instance(type_name, args_text, env)?;
                                    if let Some(v) = values_map.get(right) {
                                        return Ok((v.clone(), None));
                                    }
                                    return Err("field not found on struct instance".to_string());
                                }
                            }
                        }
                    }
                }

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
                                return Ok((fval.to_string(), None));
                            }
                        }
                    }
                    return Err("field not found on struct instance".to_string());
                }
            }
        }
    }

    if trimmed.ends_with(')') {
        // Find the opening paren matching the final closing paren so calls like make()() work
        let mut depth: i32 = 0;
        let mut open_idx_opt: Option<usize> = None;
        for (i, ch) in trimmed.char_indices().rev() {
            match ch {
                ')' => depth += 1,
                '(' => {
                    depth -= 1;
                    if depth == 0 {
                        open_idx_opt = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }

        if let Some(open_idx) = open_idx_opt {
            let left = trimmed[..open_idx].trim();
            let args_text = &trimmed[open_idx + 1..trimmed.len() - 1];

            // Check if left is a function identifier before attempting parsing
            if !left.is_empty() && left.chars().all(|c| c.is_alphanumeric() || c == '_') {
                let name = left;
                let key = format!("__fn__{}", name);
                if let Some(func_var) = env.get(&key) {
                    // Check for external captures in __captures__<name>
                    let captures_key = format!("__captures__{}", name);
                    let captures_override = env.get(&captures_key).map(|v| v.value.as_str());
                    return invoke_fn_value(&func_var.value, args_text, env, captures_override);
                }
            } else if !left.is_empty() && left.ends_with(')') {
                // Left ends with ) which means it's a chained call like make()()
                // Evaluate left and if it returns a function value, call that function
                let (left_val, left_sfx) = eval_expr_with_env(left, env)?;
                if left_sfx.as_deref() == Some("FN") {
                    return invoke_fn_value(&left_val, args_text, env, None);
                }
            }
        }
    }

    if let Some(open_br) = trimmed.find('{') {
        if trimmed.ends_with('}') {
            if let Some(close_br) = brace_utils::find_matching_brace(&trimmed, open_br) {
                if close_br + 1 == trimmed.len() {
                    let type_name = trimmed[..open_br].trim();
                    if !type_name.is_empty() {
                        let key = format!("__struct__{}", type_name);
                        if env.contains_key(&key) {
                            let args_text = &trimmed[open_br + 1..close_br];
                            let values_map = build_struct_instance(type_name, args_text, env)?;
                            let mut parts: Vec<String> = Vec::new();
                            parts.push(type_name.to_string());
                            for (name, value) in values_map.into_iter() {
                                parts.push(format!("{}={}", name, value));
                            }
                            let encoded = format!("__STRUCT__:{}", parts.join("|"));
                            return Ok((encoded, None));
                        }
                    }
                }
            }
        }
    }

    let tokens = tokenize_expr(&trimmed)?;
    let mut detection_tokens = tokens.clone();
    for t in detection_tokens.iter_mut() {
        if let Some(var) = env.get(t.as_str()) {
            if let Some(s) = &var.suffix {
                *t = format!("{}{}", var.value, s);
            } else {
                *t = var.value.clone();
            }
        }
    }

    let seen_suffix = detect_suffix_from_tokens(&detection_tokens)?;

    let mut resolved_tokens: Vec<String> = Vec::new();
    for t in tokens {
        if t == "+" || t == "-" || t == "*" || t == "(" || t == ")" {
            resolved_tokens.push(t.clone());
            continue;
        }
        if let Some(var) = env.get(t.as_str()) {
            if let Some(s) = &var.suffix {
                resolved_tokens.push(format!("{}{}", var.value, s));
            } else {
                resolved_tokens.push(var.value.clone());
            }
        } else {
            resolved_tokens.push(t.clone());
        }
    }

    let output = tokens_to_rpn(&resolved_tokens)?;
    let (value_out, maybe_suffix) = evaluator::eval_output_with_suffix(&output, seen_suffix)?;
    Ok((value_out, maybe_suffix))
}

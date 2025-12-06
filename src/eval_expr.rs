use crate::brace_utils;
use crate::evaluator;
use crate::evaluator::build_struct_instance;
use crate::parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use crate::property_access::{handle_complex_property_access, preprocess_property_access};
use crate::statement;
use crate::statement::Var;
// SUFFIXES are not used directly in this module
use std::collections::HashMap;

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

/// Public version of invoke_fn_value for method calls.
/// This version also takes the struct value to extract captured values from.
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
            let rest = &struct_value[10..];
            for capture in captures.split(',') {
                let cap = capture.trim();
                let var_name = cap
                    .strip_prefix("&mut ")
                    .or_else(|| cap.strip_prefix('&'))
                    .unwrap_or(cap)
                    .trim();

                // Look for this variable in the struct
                for ent in rest.split('|').skip(1) {
                    if let Some(eq) = ent.find('=') {
                        let fname = &ent[..eq];
                        let fval = &ent[eq + 1..];
                        if fname == var_name {
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
                            break;
                        }
                    }
                }
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

    let result = statement::eval_block_expr(body_part, &local_env, &eval_expr_with_env)?;
    Ok(Some(result))
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

    // Array literal support: [a, b, c]
    if trimmed.starts_with('[') {
        // Ensure the first matching ']' for the opening '[' is the final character
        let mut d = 0i32;
        let mut match_idx: Option<usize> = None;
        for (i, ch) in trimmed.char_indices() {
            if ch == '[' {
                d += 1;
            } else if ch == ']' {
                d -= 1;
                if d == 0 {
                    match_idx = Some(i);
                    break;
                }
            }
        }
        if match_idx.is_none() || match_idx.unwrap() != trimmed.len() - 1 {
            // Not a standalone array literal — fall through and let indexing logic handle it
        } else {
            // it's a top-level array literal
        let inner = &trimmed[1..trimmed.len() - 1];
        // split by commas while respecting nested braces/parentheses
        let mut elems: Vec<&str> = Vec::new();
        let mut start = 0usize;
        let mut depth: i32 = 0;
        for (i, ch) in inner.char_indices() {
            match ch {
                '{' | '(' | '[' => depth += 1,
                '}' | ')' | ']' => depth = depth.saturating_sub(1),
                ',' if depth == 0 => {
                    let piece = inner[start..i].trim();
                    if !piece.is_empty() {
                        elems.push(piece);
                    }
                    start = i + 1;
                }
                _ => {}
            }
        }
        if start < inner.len() {
            let last = inner[start..].trim();
            if !last.is_empty() {
                elems.push(last);
            }
        }

        // Evaluate each element and collect their values and suffixes
        let mut collected: Vec<String> = Vec::new();
        let mut elem_suffix: Option<String> = None;
        for e in elems.into_iter() {
            let (val, suf) = eval_expr_with_env(e, env)?;
            if let Some(s) = suf {
                if elem_suffix.is_none() {
                    elem_suffix = Some(s.clone());
                } else if elem_suffix.as_ref() != Some(&s) {
                    // mixed suffixes — represent elements individually but don't set a common suffix
                    elem_suffix = None;
                }
                collected.push(format!("{}{}", val, s));
            } else {
                collected.push(val);
            }
        }

            let encoded = if let Some(s) = elem_suffix.as_ref() {
            format!("__ARRAY__:{}|{}", s, collected.join(","))
        } else {
            format!("__ARRAY__:|{}", collected.join(","))
        };
            return Ok((encoded, Some("ARRAY".to_string())));
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

    // `this` evaluates to a struct-like snapshot of the current environment's variables
    if trimmed == "this" {
        let mut parts: Vec<String> = Vec::new();
        parts.push("This".to_string());
        for (k, v) in env.iter() {
            // Include regular variables
            if !k.starts_with("__") {
                let mut val = v.value.clone();
                if let Some(s) = &v.suffix {
                    val = format!("{}{}", val, s);
                }
                parts.push(format!("{}={}", k, val));
            }
            // Also include functions (stored as __fn__name)
            else if let Some(fn_name) = k.strip_prefix("__fn__") {
                // Store function as __fn__name=value with | replaced by ~ to avoid conflicts
                let encoded_fn_value = v.value.replace('|', "~");
                parts.push(format!("__fn__{}={}", fn_name, encoded_fn_value));
                // Also include captures if they exist
                let captures_key = format!("__captures__{}", fn_name);
                if let Some(captures_var) = env.get(&captures_key) {
                    parts.push(format!("__captures__{}={}", fn_name, captures_var.value));
                }
            }
        }
        let encoded = format!("__STRUCT__:{}", parts.join("|"));
        return Ok((encoded, None));
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
        preprocess_property_access(&mut trimmed, env);
    }

    // Fallback: handle property access when left side is not a simple identifier
    // (e.g., struct literals like "Wrapper { 100 }.value")
    if let Some(result) = handle_complex_property_access(&trimmed, env)? {
        return Ok(result);
    }

    // Indexing expressions: left[index]
    if trimmed.ends_with(']') {
        // Find matching '[' for the trailing ']'
        let mut depth: i32 = 0;
        let mut open_idx_opt: Option<usize> = None;
        for (i, ch) in trimmed.char_indices().rev() {
            match ch {
                ']' => depth += 1,
                '[' => {
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
            let idx_text = &trimmed[open_idx + 1..trimmed.len() - 1];

            // Evaluate index expression
            let (idx_val_str, _idx_suf) = eval_expr_with_env(idx_text, env)?;
            let idx_val = idx_val_str
                .parse::<i128>()
                .map_err(|_| "invalid index".to_string())?;
            if idx_val < 0 {
                return Err("negative index".to_string());
            }
            let idx_usize = idx_val as usize;

            // Evaluate left expression to get array value
            let (left_val, _left_sfx) = if left.is_empty() {
                // e.g. literal indexing like [1,2,3][0] - evaluate the literal
                eval_expr_with_env(&format!("[{}]", idx_text), env)?
            } else {
                eval_expr_with_env(left, env)?
            };

            // Accept encoded array format: __ARRAY__:<elem_suffix>|e1,e2,e3
            if left_val.starts_with("__ARRAY__:") {
                let after = &left_val[9..];
                if let Some(bar_idx) = after.find('|') {
                    let _elem_sfx = &after[..bar_idx];
                    let elems_str = &after[bar_idx + 1..];
                    let mut items: Vec<&str> = Vec::new();
                    // split on commas (simple split is OK because elements were encoded without nested commas)
                    for part in elems_str.split(',') {
                        items.push(part);
                    }
                    if idx_usize >= items.len() {
                        return Err("index out of range".to_string());
                    }
                    let item = items[idx_usize];
                    // determine suffix if present (e.g., 3I32)
                    for sfx in crate::range_check::SUFFIXES.iter() {
                        if item.ends_with(sfx) {
                            let pos = item.len() - sfx.len();
                            return Ok((item[..pos].to_string(), Some(sfx.to_string())));
                        }
                    }
                    return Ok((item.to_string(), None));
                }
            }
            // If left didn't evaluate to an array, error
            return Err("indexing into non-array".to_string());
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
            } else if !left.is_empty() && left.contains('.') {
                // Left contains a dot, so it's a property access like obj.method()
                // Try to evaluate it as a property access first
                match eval_expr_with_env(left, env) {
                    Ok((left_val, left_sfx)) => {
                        if left_sfx.as_deref() == Some("FN") {
                            // Need to also get captures from the struct
                            // Look for __captures__<method_name> in the struct
                            let method_name = left.rsplit('.').next().unwrap_or("");
                            let captures_key = format!("__captures__{}", method_name);

                            // Get the struct value to look for captures
                            let struct_left = &left[..left.rfind('.').unwrap_or(0)];
                            let mut captures_override = None;
                            if let Ok((struct_val, _)) = eval_expr_with_env(struct_left, env) {
                                if struct_val.starts_with("__STRUCT__:") {
                                    let rest = &struct_val[10..];
                                    for ent in rest.split('|').skip(1) {
                                        if let Some(eq) = ent.find('=') {
                                            let fname = &ent[..eq];
                                            let fval = &ent[eq + 1..];
                                            if fname == captures_key {
                                                captures_override = Some(fval.to_string());
                                                break;
                                            }
                                        }
                                    }
                                }
                            }

                            return invoke_fn_value(
                                &left_val,
                                args_text,
                                env,
                                captures_override.as_deref(),
                            );
                        }
                    }
                    Err(_e) => {
                        // Property access failed, continue to next case
                    }
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

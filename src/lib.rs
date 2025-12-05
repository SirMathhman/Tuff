mod brace_utils;
mod control;
mod evaluator;
mod parser;
mod range_check;
mod statement;

use parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use range_check::{check_unsigned_range, SUFFIXES};
use statement::{process_single_stmt, split_statements, Var};

pub fn interpret(input: &str) -> Result<String, String> {
    use std::collections::HashMap;

    // Helper to evaluate an expression with access to the current environment.
    fn eval_expr_with_env(
        expr: &str,
        env: &HashMap<String, Var>,
    ) -> Result<(String, Option<String>), String> {
        let mut trimmed = expr.trim().to_string();

        // Fast-path: boolean literals allowed inside expressions for control flow
        if trimmed == "true" || trimmed == "false" {
            return Ok((trimmed.to_string(), None));
        }

        // Preprocess braced blocks in the expression. E.g., "{let x = 3; x} + {let y = 4; y}"
        // becomes "3 + 4" after evaluating each block in its own local scope.
        loop {
            // Find the first braced block at the top level (outside parens)
            let mut brace_start = None;
            let mut depth: i32 = 0;
            let mut paren_depth: i32 = 0;
            let mut found_block = false;

            for (i, ch) in trimmed.char_indices() {
                match ch {
                    '{' if paren_depth == 0 => {
                        if brace_start.is_none() {
                            brace_start = Some(i);
                        }
                        depth += 1;
                    }
                    '}' if paren_depth == 0 => {
                        depth = depth.saturating_sub(1);
                        if let Some(block_start) = brace_start {
                            if depth == 0 {
                                // Found a complete block, evaluate it
                                let block_content = &trimmed[block_start + 1..i];
                                let (block_value, block_suffix) =
                                    crate::statement::eval_block_expr(
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

        // Fast-path: function call syntax like `name(arg1, arg2)` where the
        // whole expression is the call. This allows calling functions defined
        // in the environment (stored under the key __fn__<name>).
        if let Some(open_idx) = trimmed.find('(') {
            if trimmed.ends_with(')') {
                let name = trimmed[..open_idx].trim();
                if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_') {
                    // split arguments at top-level commas
                    let args_text = &trimmed[open_idx + 1..trimmed.len() - 1];
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

                    // lookup function by special key
                    let key = format!("__fn__{}", name);
                    if let Some(func_var) = env.get(&key) {
                        // function stored as expected
                        // stored format: params_list|return_type|body
                        let parts: Vec<&str> = func_var.value.splitn(3, '|').collect();
                        let params_part = parts.first().copied().unwrap_or("");
                        let body_part = parts.get(2).copied().unwrap_or("");

                        // parse param names e.g. "a:I32,b:I32" -> ["a","b"]
                        let mut param_names: Vec<String> = Vec::new();
                        if !params_part.is_empty() {
                            for p in params_part.split(',') {
                                let n = p.split(':').next().unwrap_or("").trim();
                                if !n.is_empty() {
                                    param_names.push(n.to_string());
                                }
                            }
                        }

                        // evaluate each arg and bind to local env
                        let mut local_env = env.clone();
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
                                    },
                                );
                            }
                        }

                        // execute function body
                        // evaluate function body in the local environment
                        // Body is stored without outer braces, so wrap it for eval_block_expr
                        let (v, sfx) = crate::statement::eval_block_expr(
                            body_part,
                            &local_env,
                            &eval_expr_with_env,
                        )?;
                        return Ok((v, sfx));
                    }
                }
            }
        }

        let tokens = tokenize_expr(&trimmed)?;

        // Prepare tokens for suffix detection by substituting variable values.
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

        // Resolve variable tokens to their literal values.
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

    // If input starts with a function definition followed by a call without
    // semicolons (e.g. "fn add(...) => { ... } add(3,4)") handle the definition
    // first then evaluate the tail expression.
    if input.trim_start().starts_with("fn ") {
        let s = input.trim();
        if let Some((_arrow_pos, _open_brace, end_idx)) = brace_utils::find_fn_arrow_and_braces(s) {
            let def_str = &s[..=end_idx];
            let tail = s[end_idx + 1..].trim();
            let mut env: HashMap<String, Var> = HashMap::new();
            let mut last_value: Option<String> = None;
            // register the function
            process_single_stmt(def_str, &mut env, &mut last_value, &eval_expr_with_env)?;

            if tail.is_empty() {
                return Ok("".to_string());
            }
            // evaluate the tail expression in the environment with the function registered
            let (val, _suf) = eval_expr_with_env(tail, &env)?;
            return Ok(val);
        }
    }

    // Handle a single top-level struct declaration without semicolons
    if input.trim_start().starts_with("struct ") {
        let s = input.trim();
        if let Some(open_idx) = s.find('{') {
            if let Some(close_idx) = brace_utils::find_matching_brace(s, open_idx) {
                let name = s[6..open_idx]
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .trim();
                if !name.is_empty() {
                    let mut env: HashMap<String, Var> = HashMap::new();
                    env.insert(
                        format!("__struct__{}", name),
                        Var {
                            mutable: false,
                            value: s[open_idx + 1..close_idx].to_string(),
                            suffix: Some("STRUCT".to_string()),
                        },
                    );
                    return Ok("".to_string());
                }
            }
        }
        return Err("invalid struct declaration".to_string());
    }

    // Check if input is an expression with braced blocks that should be evaluated
    // before treating it as statements (e.g., "{let x = 3; x} + {let x = 4; x}")
    // This must happen before the semicolon check, since blocks contain semicolons.
    if input.contains('{')
        && input.contains('}')
        && (input.contains('+') || input.contains('-') || input.contains('*'))
    {
        let env: HashMap<String, Var> = HashMap::new();
        if let Ok((val, suf)) = eval_expr_with_env(input, &env) {
            let result = if let Some(suffix) = suf {
                format!("{}{}", val, suffix)
            } else {
                val
            };
            return Ok(result);
        }
        // If it fails, fall through to other handlers
    }

    // Handle semicolon-separated statements
    if input.contains(';') {
        let mut seq = input.trim();
        if seq.starts_with('{') && seq.ends_with('}') {
            seq = seq[1..seq.len() - 1].trim();
        }

        let stmts_raw = split_statements(seq);
        let mut env: HashMap<String, Var> = HashMap::new();
        let mut last_value: Option<String> = None;

        let mut i = 0usize;
        while i < stmts_raw.len() {
            if let Some(s) = stmts_raw.get(i) {
                // If this is an 'if' without an 'else' included, and the next statement
                // starts with 'else', merge them into a single handler string so
                // process_single_stmt/process_if_statement can parse them together.
                if s.trim_start().starts_with("if") && !s.contains("else") {
                    if let Some(next) = stmts_raw.get(i + 1) {
                        if next.trim_start().starts_with("else") {
                            let merged = format!("{} {}", s, next);
                            process_single_stmt(
                                merged.as_str(),
                                &mut env,
                                &mut last_value,
                                &eval_expr_with_env,
                            )?;
                            i += 2;
                            continue;
                        }
                    }
                }
                // Process normal statement
                process_single_stmt(s, &mut env, &mut last_value, &eval_expr_with_env)?;
            }
            i += 1;
        }

        return if let Some(value) = last_value {
            Ok(value)
        } else {
            Ok("".to_string())
        };
    }

    // `typeOf(<literal or expr>)` helper: return the suffix portion if present, e.g. typeOf(100U8) -> "U8"
    if input.trim_start().starts_with("typeOf(") && input.trim_end().ends_with(')') {
        let inner = input.trim();
        let inner = &inner[7..inner.len() - 1]; // between parentheses
        let inner = inner.trim();

        // fast-path: a single literal token
        for sfx in SUFFIXES {
            if inner.ends_with(sfx) {
                return Ok(sfx.to_string());
            }
        }

        // interpret as expression: tokenize, detect suffix
        let tokens = tokenize_expr(inner)?;
        let seen_suffix = detect_suffix_from_tokens(&tokens)?;
        return Ok(seen_suffix.unwrap_or("").to_string());
    }

    // Handle a simple binary addition: "<lhs> + <rhs>" where both operands
    // are integers with the same type suffix (e.g. "1U8 + 2U8").
    if input.contains('+')
        || input.contains('-')
        || input.contains('*')
        || input.contains('(')
        || input.contains(')')
    {
        // Tokenize and detect suffix across tokens
        let tokens = tokenize_expr(input)?;
        let seen_suffix = detect_suffix_from_tokens(&tokens)?;

        let output = tokens_to_rpn(&tokens)?;

        let (value_out, _maybe_suffix) = evaluator::eval_output_with_suffix(&output, seen_suffix)?;
        return Ok(value_out);
    }
    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
            let pos = input.len() - sfx.len();
            if pos > 0
                && input
                    .as_bytes()
                    .get(pos - 1)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false)
            {
                // If suffix denotes an unsigned type, reject negative values
                // and ensure the numeric value fits the type's range.
                let numeric_part = &input[..pos];
                if sfx.starts_with('U') {
                    if numeric_part.starts_with('-') {
                        return Err("negative value for unsigned suffix".to_string());
                    }

                    let num_str = numeric_part.strip_prefix('+').unwrap_or(numeric_part);

                    // Parse as a wide unsigned and compare with the type max.
                    let parsed = num_str
                        .parse::<u128>()
                        .map_err(|_| "invalid numeric value for unsigned suffix".to_string())?;

                    check_unsigned_range(parsed, sfx)?;
                }

                return Ok(numeric_part.to_string());
            }
        }
    }

    // Accept plain integer literals (signed) as valid input
    let trimmed = input.trim();
    let num_candidate = trimmed.strip_prefix('+').unwrap_or(trimmed);
    if num_candidate.parse::<i128>().is_ok() {
        return Ok(trimmed.to_string());
    }

    // Explicitly accept boolean literals; otherwise treat unexpected input as an error
    if trimmed == "true" || trimmed == "false" {
        return Ok(trimmed.to_string());
    }

    Err("invalid input".to_string())
}

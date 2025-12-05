mod evaluator;
mod parser;
mod range_check;

use parser::{detect_suffix_from_tokens, tokenize_expr, tokens_to_rpn};
use range_check::{check_signed_range, check_unsigned_range, SUFFIXES};

pub fn interpret(input: &str) -> Result<String, String> {
    // Support multiple semicolon-separated statements and a simple variable environment.
    // Examples supported:
    //  - let mut x = 100; x = 200; x  => "200"
    //  - let x : I8 = 10I8 * (3 - 5I8); x => "-20"
    use std::collections::HashMap;

    #[derive(Clone, Debug)]
    struct Var {
        mutable: bool,
        suffix: Option<String>, // e.g. Some("U8") or None
        value: String,          // numeric string without suffix
    }

    // Helper to evaluate an expression with access to the current environment.
    fn eval_expr_with_env(
        expr: &str,
        env: &HashMap<String, Var>,
    ) -> Result<(String, Option<String>), String> {
        // Tokenize and allow variable tokens
        let tokens = tokenize_expr(expr)?;

        // Prepare a view for suffix detection. Replace var tokens that have suffixes
        // with value+suffix so detect_suffix_from_tokens sees them.
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

        // Replace tokens with their resolved literal equivalents (numbers) for evaluation.
        let mut resolved_tokens: Vec<String> = Vec::new();
        for t in tokens {
            if t == "+" || t == "-" || t == "*" || t == "(" || t == ")" {
                resolved_tokens.push(t.clone());
                continue;
            }

            if let Some(var) = env.get(t.as_str()) {
                // If variable has a suffix, append it so parser funcs validate correctly.
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

        // Evaluate RPN output using evaluator helper
        let (value_out, maybe_suffix) = evaluator::eval_output_with_suffix(&output, seen_suffix)?;
        Ok((value_out, maybe_suffix))
    }

    // If there are semicolon-separated statements, process them sequentially
    if input.contains(';') {
        // Allow optional surrounding braces: { ... }
        let mut seq = input.trim();
        if seq.starts_with('{') && seq.ends_with('}') {
            // remove outer braces and trim
            seq = seq[1..seq.len() - 1].trim();
        }

        // Split by semicolons, but respect braces: don't split inside { ... }
        let mut stmts_raw: Vec<&str> = Vec::new();
        let mut start = 0;
        let mut depth: i32 = 0;
        for (i, ch) in seq.char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => depth = depth.saturating_sub(1),
                ';' if depth == 0 => {
                    let stmt = seq[start..i].trim();
                    if !stmt.is_empty() {
                        stmts_raw.push(stmt);
                    }
                    start = i + 1;
                }
                _ => {}
            }
        }
        let stmt = seq[start..].trim();
        if !stmt.is_empty() {
            stmts_raw.push(stmt);
        }

        let mut env: HashMap<String, Var> = HashMap::new();
        let mut last_value: Option<String> = None;

        // Evaluate a braced block as an expression using a cloned local environment.
        fn eval_block_expr(
            block_text: &str,
            env: &HashMap<String, Var>,
            eval_expr_with_env: &dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>,
        ) -> Result<(String, Option<String>), String> {
            // Create a local cloned environment so inner declarations do not leak
            let mut local_env = env.clone();

            // Reuse the brace-aware splitter to get inner statements
            let mut stmts: Vec<&str> = Vec::new();
            let mut start = 0usize;
            let mut depth: i32 = 0;
            let seq = block_text.trim();
            for (i, ch) in seq.char_indices() {
                match ch {
                    '{' => depth += 1,
                    '}' => depth = depth.saturating_sub(1),
                    ';' if depth == 0 => {
                        let stmt = seq[start..i].trim();
                        if !stmt.is_empty() {
                            stmts.push(stmt);
                        }
                        start = i + 1;
                    }
                    _ => {}
                }
            }
            let stmt = seq[start..].trim();
            if !stmt.is_empty() {
                stmts.push(stmt);
            }

            let mut last_value: Option<(String, Option<String>)> = None;

            // Internal helper that mirrors the behavior of process_single_stmt but returns suffix for final expressions
            fn run_stmt(
                s: &str,
                local_env: &mut HashMap<String, Var>,
                last_value: &mut Option<(String, Option<String>)>,
                eval_expr_with_env: &dyn Fn(&str, &HashMap<String, Var>) -> Result<(String, Option<String>), String>,
            ) -> Result<(), String> {
                let s = s.trim();
                if s.starts_with('{') && s.ends_with('}') {
                    // nested block expression: evaluate with a fresh clone so nested locals don't leak outward
                    let inner = s[1..s.len() - 1].trim();
                    let (val, suf) = eval_block_expr(inner, local_env, eval_expr_with_env)?;
                    *last_value = Some((val, suf));
                    return Ok(());
                }

                // Declaration inside block-local environment
                if s.starts_with("let ") {
                    let rest = s.trim_start_matches("let").trim();
                    let (mutable, rest) = if rest.starts_with("mut ") {
                        (true, rest.trim_start_matches("mut").trim())
                    } else {
                        (false, rest)
                    };

                    let mut parts = rest.splitn(2, '=');
                    let left = parts
                        .next()
                        .ok_or_else(|| "invalid declaration".to_string())?
                        .trim();
                    let rhs = parts
                        .next()
                        .ok_or_else(|| "invalid declaration".to_string())?
                        .trim();

                    let mut left_parts = left.splitn(2, ':');
                    let name = left_parts
                        .next()
                        .ok_or_else(|| "invalid declaration".to_string())?
                        .trim();
                    if name.is_empty() {
                        return Err("invalid declaration".to_string());
                    }
                    let ty_opt = left_parts
                        .next()
                        .map(|s| s.trim())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());

                    if local_env.contains_key(name) {
                        return Err("duplicate declaration".to_string());
                    }

                    // RHS may itself be a block expression
                    let (value, expr_suffix) = if rhs.starts_with('{') && rhs.ends_with('}') {
                        eval_block_expr(rhs[1..rhs.len() - 1].trim(), local_env, eval_expr_with_env)?
                    } else {
                        eval_expr_with_env(rhs, local_env)?
                    };

                    if let Some(ty) = &ty_opt {
                        if ty.starts_with('U') {
                            let v = value
                                .parse::<u128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_unsigned_range(v, ty)?;
                        } else {
                            let v = value
                                .parse::<i128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_signed_range(v, ty)?;
                        }
                    }

                    let stored_suffix = ty_opt.or(expr_suffix);
                    local_env.insert(
                        name.to_string(),
                        Var {
                            mutable,
                            suffix: stored_suffix,
                            value,
                        },
                    );
                    *last_value = None;
                    return Ok(());
                }

                // Assignment
                if s.contains('=') && !s.starts_with("let ") {
                    let mut parts = s.splitn(2, '=');
                    let name = parts
                        .next()
                        .ok_or_else(|| "invalid assignment".to_string())?
                        .trim();
                    let rhs = parts
                        .next()
                        .ok_or_else(|| "invalid assignment".to_string())?
                        .trim();

                    if !local_env.contains_key(name) {
                        return Err("assignment to undeclared variable".to_string());
                    }

                    let (value, expr_suffix) = if rhs.starts_with('{') && rhs.ends_with('}') {
                        eval_block_expr(rhs[1..rhs.len() - 1].trim(), local_env, eval_expr_with_env)?
                    } else {
                        eval_expr_with_env(rhs, local_env)?
                    };

                    let var = local_env
                        .get_mut(name)
                        .ok_or_else(|| "assignment to undeclared variable".to_string())?;
                    if !var.mutable {
                        return Err("assignment to immutable variable".to_string());
                    }

                    if let Some(declared) = &var.suffix {
                        if let Some(sfx) = &expr_suffix {
                            if sfx != declared {
                                return Err("type suffix mismatch on assignment".to_string());
                            }
                        }
                        if declared.starts_with('U') {
                            let v = value
                                .parse::<u128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_unsigned_range(v, declared)?;
                        } else {
                            let v = value
                                .parse::<i128>()
                                .map_err(|_| "invalid numeric value".to_string())?;
                            check_signed_range(v, declared)?;
                        }
                    }

                    var.value = value;
                    *last_value = None;
                    return Ok(());
                }

                // Expression
                let (value, suf) = eval_expr_with_env(s, local_env)?;
                *last_value = Some((value, suf));
                Ok(())
            }

            // Iterate through inner statements
            for st in stmts {
                run_stmt(st, &mut local_env, &mut last_value, eval_expr_with_env)?;
            }

            if let Some((v, suf)) = last_value {
                Ok((v, suf))
            } else {
                Ok(("".to_string(), None))
            }
        }

        fn process_single_stmt(
            stmt_text: &str,
            env: &mut HashMap<String, Var>,
            last_value: &mut Option<String>,
            eval_expr_with_env: &dyn Fn(
                &str,
                &HashMap<String, Var>,
            ) -> Result<(String, Option<String>), String>,
        ) -> Result<(), String> {
            let s = stmt_text.trim();

            // If this statement is a braced block
            if s.starts_with('{') && s.ends_with('}') {
                let inner = s[1..s.len() - 1].trim();
                if inner.contains(';') {
                    for inner_stmt in inner.split(';').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                        process_single_stmt(inner_stmt, env, last_value, eval_expr_with_env)?;
                    }
                    return Ok(());
                } else {
                    // single-expression block
                    let (value, _suffix) = eval_expr_with_env(inner, env)?;
                    *last_value = Some(value);
                    return Ok(());
                }
            }

            // Declaration: let [mut] name [: Type]? = expr
            if s.starts_with("let ") {
                let rest = s.trim_start_matches("let").trim();
                // check for 'mut'
                let (mutable, rest) = if rest.starts_with("mut ") {
                    (true, rest.trim_start_matches("mut").trim())
                } else {
                    (false, rest)
                };

                // split left (name [:type]) and rhs
                let mut parts = rest.splitn(2, '=');
                let left = parts
                    .next()
                    .ok_or_else(|| "invalid declaration".to_string())?
                    .trim();
                let rhs = parts
                    .next()
                    .ok_or_else(|| "invalid declaration".to_string())?
                    .trim();

                let mut left_parts = left.splitn(2, ':');
                let name = left_parts
                    .next()
                    .ok_or_else(|| "invalid declaration".to_string())?
                    .trim();
                if name.is_empty() {
                    return Err("invalid declaration".to_string());
                }
                let ty_opt = left_parts
                    .next()
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string());

                // Ensure name isn't already declared
                if env.contains_key(name) {
                    return Err("duplicate declaration".to_string());
                }

                // Evaluate RHS using current env. If RHS is a braced block, evaluate it
                // in a local cloned environment and take its result as the RHS value.
                let (value, expr_suffix) = if rhs.starts_with('{') && rhs.ends_with('}') {
                    eval_block_expr(rhs[1..rhs.len() - 1].trim(), env, eval_expr_with_env)?
                } else {
                    eval_expr_with_env(rhs, env)?
                };

                // If explicit type provided, validate
                if let Some(ty) = &ty_opt {
                    if ty.starts_with('U') {
                        let v = value
                            .parse::<u128>()
                            .map_err(|_| "invalid numeric value".to_string())?;
                        check_unsigned_range(v, ty)?;
                    } else {
                        let v = value
                            .parse::<i128>()
                            .map_err(|_| "invalid numeric value".to_string())?;
                        check_signed_range(v, ty)?;
                    }
                }

                // Determine final stored suffix
                let stored_suffix = ty_opt.or(expr_suffix);

                env.insert(
                    name.to_string(),
                    Var {
                        mutable,
                        suffix: stored_suffix,
                        value,
                    },
                );
                *last_value = None;
                return Ok(());
            }

            // Assignment: <name> = <expr>
            if s.contains('=') && !s.starts_with("let ") {
                let mut parts = s.splitn(2, '=');
                let name = parts
                    .next()
                    .ok_or_else(|| "invalid assignment".to_string())?
                    .trim();
                let rhs = parts
                    .next()
                    .ok_or_else(|| "invalid assignment".to_string())?
                    .trim();

                if !env.contains_key(name) {
                    return Err("assignment to undeclared variable".to_string());
                }

                let (value, expr_suffix) = if rhs.starts_with('{') && rhs.ends_with('}') {
                    eval_block_expr(rhs[1..rhs.len() - 1].trim(), env, eval_expr_with_env)?
                } else {
                    eval_expr_with_env(rhs, env)?
                };
                let var = env
                    .get_mut(name)
                    .ok_or_else(|| "assignment to undeclared variable".to_string())?;
                if !var.mutable {
                    return Err("assignment to immutable variable".to_string());
                }

                if let Some(declared) = &var.suffix {
                    if let Some(sfx) = &expr_suffix {
                        if sfx != declared {
                            return Err("type suffix mismatch on assignment".to_string());
                        }
                    }
                    if declared.starts_with('U') {
                        let v = value
                            .parse::<u128>()
                            .map_err(|_| "invalid numeric value".to_string())?;
                        check_unsigned_range(v, declared)?;
                    } else {
                        let v = value
                            .parse::<i128>()
                            .map_err(|_| "invalid numeric value".to_string())?;
                        check_signed_range(v, declared)?;
                    }
                }

                var.value = value;
                *last_value = None;
                return Ok(());
            }

            // Expression or variable reference — evaluate and keep as last_value
            let (value, _suffix) = eval_expr_with_env(s, env)?;
            *last_value = Some(value);
            Ok(())
        }

        for stmt in stmts_raw {
            process_single_stmt(stmt, &mut env, &mut last_value, &eval_expr_with_env)?;
        }

        // Return the last evaluated value or empty string if only declarations
        if let Some(value) = last_value {
            return Ok(value);
        } else {
            return Ok("".to_string());
        }
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

#[cfg(test)]
mod tests {
    use crate::interpret;

    #[test]
    fn interpret_returns_same_string() {
        let input = "hello world";
        let out = interpret(input);
        assert_eq!(out, Err("invalid input".to_string()));
        // boolean literals return as-is
        assert_eq!(interpret("true"), Ok("true".to_string()));
        assert_eq!(interpret("false"), Ok("false".to_string()));
    }

    #[test]
    fn interpret_strips_type_like_suffix() {
        assert_eq!(interpret("100U8"), Ok("100".to_string()));
        assert_eq!(interpret("123U16"), Ok("123".to_string()));
        assert_eq!(interpret("7I32"), Ok("7".to_string()));
        assert_eq!(interpret("900U64"), Ok("900".to_string()));

        // Case-sensitive: lowercase should not match and is unexpected
        assert!(interpret("42u32").is_err());

        // Don't strip when letters are part of a word -> unexpected
        assert!(interpret("valueU16").is_err());

        // digits-only should be unchanged
        assert_eq!(interpret("12345"), Ok("12345".to_string()));

        // Negative value with unsigned suffix is invalid
        assert!(interpret("-100U8").is_err());

        // values above the unsigned max are invalid
        assert!(interpret("256U8").is_err());
        assert_eq!(interpret("255U8"), Ok("255".to_string()));

        // Simple addition of same-suffix operands
        assert_eq!(interpret("1U8 + 2U8"), Ok("3".to_string()));

        // Chained addition where plain numbers adopt the suffixed type
        assert_eq!(interpret("1U8 + 3 + 2U8"), Ok("6".to_string()));

        // Chained expression with subtraction
        assert_eq!(interpret("10U8 + 3 - 5U8"), Ok("8".to_string()));

        // Multiplication then subtraction, left-to-right evaluation
        assert_eq!(interpret("10U8 * 3 - 5U8"), Ok("25".to_string()));

        // Signed multiplication then subtraction
        assert_eq!(interpret("10I8 * 3 - 5I8"), Ok("25".to_string()));

        // Parentheses + precedence: multiplication outside parentheses.
        assert_eq!(interpret("10I8 * (3 - 5I8)"), Ok("-20".to_string()));

        // Simple declaration and usage (no-type declaration supported)
        assert_eq!(
            interpret("let x : I8 = 10I8 * (3 - 5I8); x"),
            Ok("-20".to_string())
        );

        // Duplicate declarations should be an error
        assert!(interpret("let x : I32 = 100; let x : I32 = 200;").is_err());

        // Declaration-only returns empty string
        assert_eq!(interpret("let x : I32 = 100;"), Ok("".to_string()));

        // Declaration without type should work: let x = 100; x => "100"
        assert_eq!(interpret("let x = 100; x"), Ok("100".to_string()));

        // Mutable variable and assignment
        assert_eq!(
            interpret("let mut x = 100; x = 200; x"),
            Ok("200".to_string())
        );

        // Braced statement block should work the same
        assert_eq!(
            interpret("{let mut x = 100; x = 200; x}"),
            Ok("200".to_string())
        );

        // Braced expression as a statement should also work
        assert_eq!(
            interpret("let mut x = 100; x = 200; {x}"),
            Ok("200".to_string())
        );

        // Multi-statement braced block should also work and modify outer env
        assert_eq!(
            interpret("let mut x = 100; {x = 200; x}"),
            Ok("200".to_string())
        );

        // Block expressions used as RHS should evaluate in a local scope
        assert_eq!(interpret("let x = {let y = 200; y}; x"), Ok("200".to_string()));

        // Assignment to immutable variable should error with a clear message
        assert_eq!(
            interpret("let x = 100; x = 200; x"),
            Err("assignment to immutable variable".to_string())
        );

        // Assignment to declared I8 that overflows should error
        assert_eq!(
            interpret("let mut x : I8 = 100; x = 1000; x"),
            Err("value out of range for I8".to_string())
        );

        // typeOf helper should return type suffix for literal
        assert_eq!(interpret("typeOf(100U8)"), Ok("U8".to_string()));

        // typeOf should examine expressions and report the seen suffix
        assert_eq!(interpret("typeOf(10I8 * (3 - 5I8))"), Ok("I8".to_string()));

        // Declaration with unsigned overflow should error
        assert!(interpret("let x : U8 = 1000;").is_err());

        // Unsigned underflow should produce an error
        assert!(interpret("0U8 - 5U8").is_err());

        // Overflow when result exceeds the type max should be an error
        assert!(interpret("1U8 + 255U8").is_err());
    }
}
// test
// test2
// test3
// test4
// test5

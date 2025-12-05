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
        let tokens = tokenize_expr(expr)?;

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

    // Handle semicolon-separated statements
    if input.contains(';') {
        let mut seq = input.trim();
        if seq.starts_with('{') && seq.ends_with('}') {
            seq = seq[1..seq.len() - 1].trim();
        }

        let stmts_raw = split_statements(seq);
        let mut env: HashMap<String, Var> = HashMap::new();
        let mut last_value: Option<String> = None;

        for stmt in stmts_raw {
            process_single_stmt(stmt, &mut env, &mut last_value, &eval_expr_with_env)?;
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
        assert_eq!(
            interpret("let x = {let y = 200; y}; x"),
            Ok("200".to_string())
        );

        // Top-level braced block with nested block RHS should evaluate correctly
        assert_eq!(
            interpret("{let x = {let y = 200; y}; x}"),
            Ok("200".to_string())
        );

        // Declaration with explicit type but no initializer should be allowed,
        // then assignment and usage later should work.
        assert_eq!(interpret("let x : I32; x = 200; x"), Ok("200".to_string()));
        assert_eq!(
            interpret("{let x : I32; x = 200; x}"),
            Ok("200".to_string())
        );
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

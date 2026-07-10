use crate::scope::{ParseError, Scope, Value, try_is_type_check, type_width};

fn merge_width(left: Option<u32>, right: Option<u32>) -> Option<u32> {
    Some(
        left.map(|l| l.max(right.unwrap_or(0)))
            .unwrap_or(right.unwrap_or(0)),
    )
}

#[cfg_attr(coverage_nightly, coverage(off))] // llvm-cov misattributes loop body lines for param binding
fn bind_fn_params(scope: &mut Scope, params: &[String], arg_values: &[i64]) -> usize {
    let mut bound_count = 0;
    for (i, param_name) in params.iter().enumerate() {
        if i < arg_values.len() {
            scope.push();
            if let Some(frame) = scope.last_frame_mut() {
                frame.insert(param_name.clone(), (Value::Int(arg_values[i]), true, None));
            }
            bound_count += 1;
        }
    }
    bound_count
}

/// Check that an argument type width is compatible with a declared parameter type.
/// Returns Ok(()) if compatible, Err otherwise.
fn check_param_type_compat(
    arg_tw: Option<u32>,
    param_expected_tw: Option<u32>,
) -> Result<(), ParseError> {
    match (arg_tw, param_expected_tw) {
        // No constraint on either side — always ok
        (None, None) => Ok(()),
        // Param has no declared type — accepts anything
        (_, None) => Ok(()),
        // Arg is untyped literal but param expects a specific non-numeric type (Bool, etc.)
        // u32::MAX signals Bool-like types; plain int literals have tw=None -> mismatch
        (None, Some(u32::MAX)) => Err(ParseError::UnexpectedEndOfInput),
        // Arg has a wider type than param expects
        (Some(arg_w), Some(expected_w)) if arg_w > expected_w => {
            Err(ParseError::UnexpectedEndOfInput)
        }
        _ => Ok(()),
    }
}

pub fn parse_expression(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let (mut left_val, mut left_tw) = parse_and(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "||" {
        *pos += 1;
        let right = parse_and(tokens, pos, scope)?.0;
        left_val = if left_val != 0 || right != 0 { 1 } else { 0 };
        left_tw = None;
    }

    Ok((left_val, left_tw))
}

fn parse_comparison(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let (mut left_val, mut left_tw) = parse_additive(tokens, pos, scope)?;

    while *pos < tokens.len() && matches!(tokens[*pos].as_str(), "<" | ">" | "<=" | ">=") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_additive(tokens, pos, scope)?.0;
        left_val = if (op == "<" && left_val < right)
            || (op == ">" && left_val > right)
            || (op == "<=" && left_val <= right)
            || (op == ">=" && left_val >= right)
        {
            1
        } else {
            0
        };
        left_tw = None;
    }

    // Handle `is TYPE` type-check operator at this precedence level
    if *pos < tokens.len() && tokens[*pos] == "is" {
        let target = crate::scope::type_width(&tokens[*pos + 1]).unwrap_or(0);
        *pos += 2; // skip "is" and target type token
        left_val = if left_tw.map(|w| w <= target).unwrap_or(true) {
            1
        } else {
            0
        };
        left_tw = None;
    }

    Ok((left_val, left_tw))
}

fn parse_and(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let (mut left_val, mut left_tw) = parse_comparison(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "&&" {
        *pos += 1;
        let right = parse_comparison(tokens, pos, scope)?.0;
        // Logical AND: result is 1 if both operands are non-zero, else 0
        left_val = if left_val != 0 && right != 0 { 1 } else { 0 };
        left_tw = None;
    }

    Ok((left_val, left_tw))
}

fn parse_additive(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let (mut left_val, mut left_tw) = parse_term(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        if scope.is_returned() {
            break;
        }
        let op = tokens[*pos].clone();
        *pos += 1;
        let (right_val, right_tw) = parse_term(tokens, pos, scope)?;
        left_val = if op == "+" {
            left_val + right_val
        } else {
            left_val - right_val
        };
        // Result width is the max of both operands
        left_tw = merge_width(left_tw, right_tw);
    }

    Ok((left_val, left_tw))
}

fn parse_term(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let (mut left_val, mut left_tw) = parse_factor(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%")
    {
        if scope.is_returned() {
            break;
        }
        let op = tokens[*pos].clone();
        *pos += 1;
        let (right_val, right_tw) = parse_factor(tokens, pos, scope)?;
        left_val = if op == "*" {
            left_val * right_val
        } else if op == "/" {
            left_val / right_val
        } else {
            left_val % right_val
        };
        // Result width is the max of both operands
        left_tw = merge_width(left_tw, right_tw);
    }

    Ok((left_val, left_tw))
}

fn parse_factor(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    if *pos >= tokens.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }

    let token = &tokens[*pos];

    match token.as_str() {
        "(" => {
            *pos += 1;
            let val = parse_expression(tokens, pos, scope)?;
            if !scope.is_returned() && *pos < tokens.len() && tokens[*pos] == ")" {
                *pos += 1;
            }
            Ok(val)
        }
        "{" => {
            *pos += 1;
            let (val, returned) = crate::parser_statements::parse_block(tokens, pos, scope)?;
            if !returned && *pos < tokens.len() && tokens[*pos] == "}" {
                *pos += 1;
            } else if returned {
                // On return, skip to end of block and mark scope as returned
                while *pos < tokens.len() && tokens[*pos] != "}" {
                    *pos += 1;
                }
                if *pos < tokens.len() {
                    *pos += 1; // skip "}"
                }
                scope.mark_returned_with_value(val);
            }
            Ok((val, None))
        }
        "true" => {
            *pos += 1;
            Ok((1, Some(u32::MAX)))
        }
        "false" => {
            *pos += 1;
            Ok((0, Some(u32::MAX)))
        }
        "if" => {
            *pos += 1;
            let cond = crate::parser_statements::parse_if_condition(tokens, pos, scope)?;
            let (then_val, _) = parse_expression(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "else" {
                *pos += 1;
            }
            let (else_val, _) = parse_expression(tokens, pos, scope)?;
            Ok((if cond != 0 { then_val } else { else_val }, None))
        }
        "match" => {
            *pos += 1;
            if *pos >= tokens.len() || tokens[*pos] != "(" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;
            let scrutinee = parse_expression(tokens, pos, scope)?.0;

            if *pos >= tokens.len() || tokens[*pos] != ")" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;
            if *pos >= tokens.len() || tokens[*pos] != "{" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;

            let mut result: Option<i64> = None;
            loop {
                if *pos >= tokens.len() || tokens[*pos] != "case" {
                    break;
                }
                *pos += 1;

                let is_wildcard = *pos < tokens.len() && tokens[*pos] == "_";
                if !is_wildcard {
                    let pat_val = parse_expression(tokens, pos, scope)?.0;
                    if *pos >= tokens.len() || tokens[*pos] != "=>" {
                        return Err(ParseError::UnexpectedEndOfInput);
                    }
                    *pos += 1;
                    let arm_val = parse_expression(tokens, pos, scope)?.0;
                    if scrutinee == pat_val && result.is_none() {
                        result = Some(arm_val);
                    }
                } else {
                    *pos += 1;
                    if *pos >= tokens.len() || tokens[*pos] != "=>" {
                        return Err(ParseError::UnexpectedEndOfInput);
                    }
                    *pos += 1;
                    let arm_val = parse_expression(tokens, pos, scope)?.0;
                    if result.is_none() {
                        result = Some(arm_val);
                    }
                }

                crate::scope::consume_semicolon(pos, tokens);
            }

            if *pos >= tokens.len() || tokens[*pos] != "}" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;

            match result {
                Some(v) => Ok((v, None)),
                None => Err(ParseError::UnexpectedEndOfInput),
            }
        }
        _ => parse_primary(tokens, pos, scope),
    }
}

fn parse_primary(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    let token = &tokens[*pos];

    // Try to parse as integer literal, optionally with uppercase type suffix (e.g. "100U8")
    if let Some(n) = crate::scope::extract_int(token.as_str()) {
        *pos += 1;
        let val_tw = crate::scope::extract_suffix(token.as_str()).and_then(|sfx| type_width(sfx));
        if let Some(result) = try_is_type_check(pos, tokens, val_tw) {
            return Ok((result, None));
        }
        Ok((n, val_tw))
    } else if scope.get_fn_body(token.as_str()).is_some()
        && *pos + 1 < tokens.len()
        && tokens[*pos + 1] == "("
    {
        // Function call: name(args...)
        let (begin, params, param_types) = scope.get_fn_body(token.as_str()).unwrap();
        *pos += 1; // skip ident
        *pos += 1; // skip "("

        // Evaluate comma-separated arguments into a Vec<(i64, Option<u32>)>
        let mut arg_results: Vec<(i64, Option<u32>)> = Vec::new();
        if *pos < tokens.len() && tokens[*pos] != ")" {
            loop {
                let (arg_val, arg_tw) = parse_expression(tokens, pos, scope)?;
                // Validate argument type against declared parameter type
                let param_expected = param_types.get(arg_results.len()).copied().flatten();
                check_param_type_compat(arg_tw, param_expected)?;
                arg_results.push((arg_val, arg_tw));
                if *pos < tokens.len() && tokens[*pos] == "," {
                    *pos += 1; // skip comma
                } else {
                    break;
                }
            }
        }

        if !scope.is_returned() && *pos < tokens.len() && tokens[*pos] == ")" {
            *pos += 1;
        }

        let arg_values: Vec<i64> = arg_results.iter().map(|(v, _)| *v).collect();

        // Bind params to args in new scope frames, then evaluate body
        let bound_count = bind_fn_params(scope, &params, &arg_values);

        let mut fn_pos = begin;
        let (val, tw) = parse_expression(tokens, &mut fn_pos, scope)?;
        // Pop the param frames we just pushed
        for _ in 0..bound_count {
            scope.pop();
        }
        // Clear returned flag so subsequent function calls start fresh
        scope.clear_returned();
        Ok((val, tw))
    } else if scope.contains_key(token.as_str())
        && (*pos + 1 >= tokens.len() || tokens[*pos + 1] != "=")
    {
        // Variable reference (not an assignment)
        let var_type = scope.get(token.as_str()).map(|e| e.2);
        *pos += 1;
        if let Some(result) = try_is_type_check(pos, tokens, var_type.map(|w| w.unwrap_or(0))) {
            return Ok((result, None));
        }
        let val = scope
            .get(token.as_str())
            .map(|e| e.0.clone())
            .unwrap_or(crate::scope::Value::Int(0))
            .as_int();
        Ok((val, var_type.flatten()))
    } else if scope.contains_key(token.as_str())
        && (*pos + 1 < tokens.len())
        && tokens[*pos + 1] == "="
    {
        // Assignment expression: x = expr
        let var_name = token.clone();
        *pos += 1;
        let val = crate::parser_statements::do_assignment(tokens, pos, scope, &var_name)?;
        crate::scope::consume_semicolon(pos, tokens);
        Ok((val, None))
    } else {
        Err(ParseError::UnknownIdentifier(token.clone()))
    }
}

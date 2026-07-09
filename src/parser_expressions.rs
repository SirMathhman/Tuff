use crate::scope::{ParseError, Scope, try_is_type_check, type_width};

fn merge_width(left: Option<u32>, right: Option<u32>) -> Option<u32> {
    Some(
        left.map(|l| l.max(right.unwrap_or(0)))
            .unwrap_or(right.unwrap_or(0)),
    )
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
            if *pos < tokens.len() && tokens[*pos] == ")" {
                *pos += 1;
            }
            Ok(val)
        }
        "{" => {
            *pos += 1;
            let val = crate::parser_statements::parse_block(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "}" {
                *pos += 1;
            }
            Ok(val)
        }
        "true" => {
            *pos += 1;
            Ok((1, None))
        }
        "false" => {
            *pos += 1;
            Ok((0, None))
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
        // Function call: name() (guard above already confirmed "(" at pos+1)
        let (begin, _end) = scope.get_fn_body(token.as_str()).unwrap();
        *pos += 1; // skip ident
        *pos += 1; // skip "("
        if *pos < tokens.len() && tokens[*pos] == ")" {
            *pos += 1;
        }
        // Evaluate the stored body token span in a fresh scope frame
        scope.push();
        let mut fn_pos = begin;
        let (val, tw) = parse_expression(tokens, &mut fn_pos, scope)?;
        scope.pop();
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

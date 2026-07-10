use crate::scope::{ParseError, Scope, Value, consume_semicolon};

const MAX_LOOP_ITERATIONS: u32 = 1024;

pub fn parse_if_condition(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "(" {
        *pos += 1;
    }
    let cond = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
    if *pos < tokens.len() && tokens[*pos] == ")" {
        *pos += 1;
    }
    Ok(cond)
}

/// Returns (value, returned) — `returned` is true if a return was encountered and should terminate the enclosing function.
fn parse_if_body(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, bool), ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "{" {
        *pos += 1;
        let (val, returned) = parse_block(tokens, pos, scope)?;
        if !returned {
            // Only consume closing brace if we didn't return
            if *pos < tokens.len() && tokens[*pos] == "}" {
                *pos += 1;
            }
        } else {
            // Skip to end of block on return
            while *pos < tokens.len() && tokens[*pos] != "}" {
                *pos += 1;
            }
            if *pos < tokens.len() {
                *pos += 1; // skip "}"
            }
        }
        Ok((val, returned))
    } else if *pos < tokens.len() && tokens[*pos] == "return" {
        *pos += 1;
        let (val, _) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
        consume_semicolon(pos, tokens);
        Ok((val, true))
    } else if *pos < tokens.len() && tokens[*pos] == "yield" {
        // Handle `if (cond) yield expr;` — propagate the yielded value up through control flow
        *pos += 1; // skip "yield"
        let result = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
        consume_semicolon(pos, tokens);
        Ok((result, true))
    } else {
        let result = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
        consume_semicolon(pos, tokens);
        Ok((result, false))
    }
}

/// Returns Some((value, returned)) — `returned` is true if a return was triggered and the caller should terminate.
pub fn parse_if_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<(i64, bool)>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "if" {
        return Ok(None);
    }
    *pos += 1;
    let cond = parse_if_condition(tokens, pos, scope)?;

    let (then_val, then_yielded) = parse_if_body(tokens, pos, scope)?;
    if then_yielded && cond != 0 {
        return Ok(Some((then_val, true)));
    }

    if *pos < tokens.len() && tokens[*pos] == "else" {
        *pos += 1;
        let (else_val, else_yielded) = parse_if_body(tokens, pos, scope)?;
        if else_yielded && cond == 0 {
            return Ok(Some((else_val, true)));
        }
    } else if cond != 0 {
    }

    Ok(Some((0i64, false)))
}

fn is_assignment_start(tokens: &[String], pos: usize, scope: &Scope) -> bool {
    pos < tokens.len()
        && scope.contains_key(tokens[pos].as_str())
        && pos + 1 < tokens.len()
        && matches!(tokens[pos + 1].as_str(), "=" | "+=")
}

fn eval_loop_body_stmt(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(), ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "{" {
        *pos += 1;
        parse_block(tokens, pos, scope)?;
        if *pos < tokens.len() && tokens[*pos] == "}" {
            *pos += 1;
        }
    } else if is_assignment_start(tokens, *pos, scope) {
        let var_name = tokens[*pos].clone();
        *pos += 1;
        do_assignment(tokens, pos, scope, &var_name)?;
        consume_semicolon(pos, tokens);
    } else {
        crate::parser_expressions::parse_expression(tokens, pos, scope).map(|_| ())?;
        consume_semicolon(pos, tokens);
    }
    Ok(())
}

pub fn parse_for_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "for" {
        return Ok(None);
    }

    *pos += 1;
    if *pos >= tokens.len() || tokens[*pos] != "(" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1;

    let var_name = tokens[*pos].clone();
    *pos += 1;

    if *pos >= tokens.len() || tokens[*pos] != "in" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1;
    let (start_val, end_val) = if scope.get_range(&tokens[*pos]).is_some() && *pos < tokens.len() {
        // Range variable: `for (i in range_var)` — resolve bounds from scope
        let (s, e) = scope.get_range(&tokens[*pos]).unwrap();
        *pos += 1; // skip ident
        (s, e)
    } else {
        // Inline range: `for (i in start..end)`
        let s = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
        if *pos >= tokens.len() || tokens[*pos] != ".." {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        *pos += 1; // skip ".."
        let e = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
        (s, e)
    };

    // Skip closing paren: `)`
    if *pos >= tokens.len() || tokens[*pos] != ")" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1; // skip ")"

    let body_begin = *pos;

    // Pre-declare loop variable so the first-pass scan can resolve references to it
    if let Some(frame) = scope.last_frame_mut() {
        frame.insert(var_name.clone(), (Value::Int(start_val), true, None));
    }
    // First pass: scan body to find loop boundary
    let mut scan_pos = body_begin;
    eval_loop_body_stmt(tokens, &mut scan_pos, scope)?;
    let loop_end = scan_pos;

    // Replay: iterate from start_val to end_val (exclusive)
    let range_len = end_val - start_val;
    if range_len < 0 || range_len > MAX_LOOP_ITERATIONS as i64 {
        return Err(ParseError::MaxIterationsExceeded);
    }

    let remaining = if range_len > 0 { range_len - 1 } else { 0 };
    for i in 1..=remaining {
        // Set loop variable to current value
        if let Some(frame) = scope.last_frame_mut() {
            frame.insert(var_name.clone(), (Value::Int(start_val + i), true, None));
        }

        // Execute body at fresh position
        let mut body_pos = body_begin;
        eval_loop_body_stmt(tokens, &mut body_pos, scope)
            .map_err(|_| ParseError::MaxIterationsExceeded)?;
    }

    *pos = loop_end;
    Ok(Some(()))
}

pub fn parse_while_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "while" {
        return Ok(None);
    }

    let while_start = *pos + 1;

    let mut scan_pos = while_start;
    parse_if_condition(tokens, &mut scan_pos, scope)?;
    let body_begin = scan_pos;
    eval_loop_body_stmt(tokens, &mut scan_pos, scope)?;
    let loop_end = scan_pos;

    // Replay: evaluate condition + body up to MAX_ITERATIONS times using fresh positions
    let mut exhausted = true;
    for _ in 0..MAX_LOOP_ITERATIONS {
        let mut iter_cond_pos = while_start;
        let cond_val = parse_if_condition(tokens, &mut iter_cond_pos, scope)?;

        if cond_val == 0 {
            exhausted = false;
            break;
        }

        // Execute body at fresh position starting from body_begin
        let mut body_pos = body_begin;
        eval_loop_body_stmt(tokens, &mut body_pos, scope)
            .map_err(|_| ParseError::MaxIterationsExceeded)?;
    }

    if exhausted {
        return Err(ParseError::MaxIterationsExceeded);
    }

    *pos = loop_end;
    Ok(Some(()))
}

/// Advance `pos` until the terminator token (or end of input) is reached.
fn skip_to_terminator(tokens: &[String], pos: &mut usize, terminator: Option<&'static str>) {
    while *pos < tokens.len() && terminator.map_or(true, |t| tokens[*pos] != t) {
        *pos += 1;
    }
}

fn parse_statement_list_with_tw(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    terminator: Option<&'static str>,
) -> Result<(i64, bool), ParseError> {
    let mut result = (0i64, false);

    while *pos < tokens.len() && terminator.map_or(true, |t| tokens[*pos] != t) {
        // Handle yield: `yield expr;` — sets block return value and exits the block immediately
        if tokens[*pos] == "yield" {
            *pos += 1; // skip "yield"
            let (val, _) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
            result.0 = val;
            consume_semicolon(pos, tokens);
            break;
        }
        // Handle return: `return expr;` — terminates the entire function with that value
        if tokens[*pos] == "return" {
            *pos += 1; // skip "return"
            let val = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
            consume_semicolon(pos, tokens);
            scope.mark_returned_with_value(val.0);
            return Ok((val.0, true));
        }
        if crate::parser_declarations::parse_fn_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if crate::parser_declarations::parse_let_statement(tokens, pos, scope)? == Some(()) {
            // Check for return triggered during let RHS evaluation
            if scope.is_returned() {
                result.0 = scope.get_return_value();
                skip_to_terminator(tokens, pos, terminator);
                break;
            }
            continue;
        }
        // Handle assignment statement: x = expr ; or compound x += expr ;
        if is_assignment_start(tokens, *pos, scope) {
            let var_name = tokens[*pos].clone();
            *pos += 1; // skip ident
            do_assignment(tokens, pos, scope, &var_name)?;
            consume_semicolon(pos, tokens);
            continue;
        }
        if parse_for_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        let (if_val, returned_or_yielded) = if let Some(r) = parse_if_statement(tokens, pos, scope)?
        {
            r
        } else {
            (0i64, false)
        };
        if returned_or_yielded {
            result.0 = if_val;
            // Skip remaining tokens in the block until terminator — don't overwrite yield value
            skip_to_terminator(tokens, pos, terminator);
            break;
        }
        if parse_while_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if tokens[*pos] == ";" {
            *pos += 1;
        } else {
            let (val, _) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
            result.0 = val;
            // If a return was triggered during expression evaluation and we're inside a block,
            // propagate it upward to terminate the function body
            if terminator.is_some() && scope.is_returned() {
                result.0 = scope.get_return_value();
                skip_to_terminator(tokens, pos, terminator);
                break;
            } else if terminator.is_none() {
                // At top level (REPL), clear returned flag so subsequent statements work
                scope.clear_returned();
            }
        }
    }

    Ok(result)
}

pub fn parse_block(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, bool), ParseError> {
    scope.push();
    let (val, returned) = parse_statement_list_with_tw(tokens, pos, scope, Some("}"))?;
    if !returned {
        // Pop the block's local scope frame
        scope.pop();
    }
    Ok((val, returned))
}

pub fn parse_statements(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let (val, _) = parse_statement_list_with_tw(tokens, pos, scope, None)?;
    Ok(val)
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub fn do_assignment(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    var_name: &str,
) -> Result<i64, ParseError> {
    let op = tokens[*pos].clone();
    *pos += 1; // skip "=" or "+="
    let val = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
    // Search all frames innermost-first for the variable (reassignment path)
    if let Some(frame) = scope.find_frame_mut(var_name) {
        if let Some(entry) = frame.get_mut(var_name) {
            // Reassignment — check mutability
            if !entry.1 {
                return Err(ParseError::ImmutableReassignment(var_name.to_string()));
            }
            entry.0 = Value::Int(if op == "+=" {
                entry.0.as_int() + val
            } else {
                val
            });
        } else {
            unreachable!("variable was found but get_mut returned None");
        }
    } else {
        // Variable not declared — callers should guard with contains_key,
        // but if we reach here treat it as unknown identifier
        return Err(ParseError::UnknownIdentifier(var_name.to_string()));
    }
    Ok(val)
}

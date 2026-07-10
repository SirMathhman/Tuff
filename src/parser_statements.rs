use crate::scope::{ParseError, Scope, Value, check_type, consume_semicolon, infer_type};

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

fn parse_if_body(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "{" {
        *pos += 1;
        let (val, _) = parse_block(tokens, pos, scope)?;
        if *pos < tokens.len() && tokens[*pos] == "}" {
            *pos += 1;
        }
        Ok(val)
    } else {
        let result = crate::parser_expressions::parse_expression(tokens, pos, scope)?.0;
        consume_semicolon(pos, tokens);
        Ok(result)
    }
}

pub fn parse_if_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "if" {
        return Ok(None);
    }
    *pos += 1;
    let cond = parse_if_condition(tokens, pos, scope)?;

    let _then_val = parse_if_body(tokens, pos, scope)?;

    if *pos < tokens.len() && tokens[*pos] == "else" {
        *pos += 1;
        let _else_val = parse_if_body(tokens, pos, scope)?;
    } else if cond != 0 {
    }

    Ok(Some(()))
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

fn parse_statement_list_with_tw(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    terminator: Option<&'static str>,
) -> Result<(i64, Option<u32>), ParseError> {
    let mut result = (0i64, None);

    while *pos < tokens.len() && terminator.map_or(true, |t| tokens[*pos] != t) {
        if parse_fn_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if parse_let_statement(tokens, pos, scope)? == Some(()) {
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
        if parse_if_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if parse_while_statement(tokens, pos, scope)? == Some(()) {
            continue;
        }
        if tokens[*pos] == ";" {
            *pos += 1;
        } else {
            result = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
        }
    }

    Ok(result)
}

pub fn parse_block(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<(i64, Option<u32>), ParseError> {
    scope.push();
    let (val, tw) = parse_statement_list_with_tw(tokens, pos, scope, Some("}"))?;
    scope.pop();
    Ok((val, tw))
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

/// Skip an optional `:` TypeToken annotation if present.
#[cfg_attr(coverage_nightly, coverage(off))] // called from coverage-off fn, so lines not attributed correctly
// Parse optional parameter type annotation: `:` TypeToken -> returns type width or None
fn parse_param_type(pos: &mut usize, tokens: &[String]) -> Result<Option<u32>, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == ":" {
        *pos += 1; // skip ":"
        if *pos >= tokens.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        let type_token = tokens[*pos].clone();
        *pos += 1; // skip type token
        Ok(crate::scope::type_width(&type_token))
    } else {
        Ok(None)
    }
}

#[cfg_attr(coverage_nightly, coverage(off))] // llvm-cov attribution issues with closures in type-checking helpers
fn parse_fn_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "fn" {
        return Ok(None);
    }
    *pos += 1; // skip "fn"

    // Expect identifier for function name
    let fn_name = if *pos < tokens.len() {
        tokens[*pos].clone()
    } else {
        return Err(ParseError::UnexpectedEndOfInput);
    };
    *pos += 1; // skip ident

    // Skip "("
    if *pos >= tokens.len() || tokens[*pos] != "(" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1;

    // Parse optional parameters: name : Type, ...
    let mut params = Vec::<String>::new();
    let mut param_types = Vec::<Option<u32>>::new();
    if *pos < tokens.len() && tokens[*pos] != ")" {
        loop {
            let param_name = tokens[*pos].clone();
            *pos += 1;
            let param_type = parse_param_type(pos, tokens)?;
            params.push(param_name);
            param_types.push(param_type);
            if *pos < tokens.len() && tokens[*pos] == "," {
                *pos += 1;
            } else {
                break;
            }
        }
    }

    // Skip ")"
    if *pos >= tokens.len() || tokens[*pos] != ")" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1;

    // Optional return type annotation: `:` ReturnTypeToken
    let mut ret_type_width: Option<u32> = None;
    if *pos < tokens.len() && tokens[*pos] == ":" {
        *pos += 1; // skip ":"
        if *pos >= tokens.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        ret_type_width = crate::scope::type_width(&tokens[*pos]);
        *pos += 1; // skip type token
    }

    // Expect "=>"
    if *pos >= tokens.len() || tokens[*pos] != "=>" {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    *pos += 1; // skip "=>"

    // Record body start (the expression token position)
    let begin = *pos;

    // Bind params as dummy values so the body evaluation doesn't fail on unknown identifiers
    for param_name in &params {
        scope.push();
        if let Some(frame) = scope.last_frame_mut() {
            frame.insert(param_name.clone(), (Value::Int(0), true, None));
        }
    }

    // Evaluate the body once to advance pos past it and check return type compatibility
    let (_body_val, body_tw) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
    if let Some(expected) = ret_type_width {
        if let Some(actual) = body_tw {
            if actual > expected {
                return Err(ParseError::UnexpectedEndOfInput);
            }
        }
    }
    consume_semicolon(pos, tokens);

    // Clean up dummy param frames
    for _ in 0..params.len() {
        scope.pop();
    }

    // Store function body token span + params in outermost (global) frame
    if !scope.0.is_empty() {
        scope.0[0].insert(
            fn_name,
            (
                Value::FunctionBody {
                    begin,
                    params,
                    param_types,
                    ret_type_width,
                },
                true,
                None,
            ),
        );
    }

    Ok(Some(()))
}

#[cfg_attr(coverage_nightly, coverage(off))] // llvm-cov attribution issues with closures in type-checking helpers
fn parse_let_statement(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<Option<()>, ParseError> {
    if *pos >= tokens.len() || tokens[*pos] != "let" {
        return Ok(None);
    }
    *pos += 1;
    let is_mut = *pos < tokens.len() && tokens[*pos] == "mut";
    if is_mut {
        *pos += 1;
    }
    if *pos >= tokens.len() {
        return Err(ParseError::MissingVariableName);
    }
    let var_name = tokens[*pos].clone();
    *pos += 1;
    let declared_type = if *pos < tokens.len() && tokens[*pos] == ":" {
        *pos += 1;
        if *pos >= tokens.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        Some(tokens[*pos].clone())
    } else {
        None
    };
    for _ in declared_type.iter() {
        *pos += 1;
    }
    if *pos >= tokens.len() || tokens[*pos] != "=" {
        return Err(ParseError::MissingEqualsSign);
    }
    *pos += 1;
    let rhs_token = (*pos < tokens.len()).then(|| tokens[*pos].clone());
    let (lhs, _) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;

    // Determine RHS type width: prefer variable type, then function return type from FunctionBody
    let rhs_type_from_var = rhs_token.as_ref().and_then(|tok| {
        scope.get(tok).map(|entry| match &entry.0 {
            Value::FunctionBody {
                ret_type_width: Some(w),
                ..
            } => *w,
            _ => entry.2.unwrap_or(0),
        })
    });

    if let Some(ref dt) = declared_type {
        check_type(
            dt,
            rhs_token.as_ref().map(|s| s as &String),
            rhs_type_from_var,
        )?;
    }

    if *pos < tokens.len() && tokens[*pos] == ".." {
        *pos += 1;
        let (rhs, _) = crate::parser_expressions::parse_expression(tokens, pos, scope)?;
        if let Some(frame) = scope.last_frame_mut() {
            frame.insert(
                var_name.clone(),
                (
                    Value::Range {
                        start: lhs,
                        end: rhs,
                    },
                    is_mut,
                    None,
                ),
            );
        }
    } else {
        if let Some(frame) = scope.last_frame_mut() {
            let declared_ref: Option<&String> = declared_type.as_ref().map(|s| s);
            let rhs_ref: Option<&String> = rhs_token.as_ref().map(|s| s);
            let inferred_type = infer_type(declared_ref, rhs_ref);
            frame.insert(var_name.clone(), (Value::Int(lhs), is_mut, inferred_type));
        }
    }
    consume_semicolon(pos, tokens);
    Ok(Some(()))
}

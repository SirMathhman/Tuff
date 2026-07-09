use crate::scope::{ParseError, Scope, Value, extract_int, extract_suffix};

pub fn interpret(source: &str) -> Result<i64, String> {
    use crate::lexer;
    let tokens = lexer::tokenize(source);
    if tokens.is_empty() {
        return Ok(0);
    }
    let mut scope = Scope::new();
    parse_statements(&tokens, &mut 0, &mut scope).map_err(|e| e.to_string())
}

fn parse_statements(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    parse_statement_list(tokens, pos, scope, None)
}

fn parse_if_condition(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "(" {
        *pos += 1;
    }
    let cond = parse_expression(tokens, pos, scope)?;
    if *pos < tokens.len() && tokens[*pos] == ")" {
        *pos += 1;
    }
    Ok(cond)
}

fn parse_if_body(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    if *pos < tokens.len() && tokens[*pos] == "{" {
        *pos += 1;
        let val = parse_block(tokens, pos, scope)?;
        if *pos < tokens.len() && tokens[*pos] == "}" {
            *pos += 1;
        }
        Ok(val)
    } else {
        let result = parse_expression(tokens, pos, scope)?;
        consume_semicolon(pos, tokens);
        Ok(result)
    }
}

fn parse_if_statement(
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

const MAX_LOOP_ITERATIONS: u32 = 1024;

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
        parse_expression(tokens, pos, scope)?;
        consume_semicolon(pos, tokens);
    }
    Ok(())
}

fn parse_for_statement(
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
        let s = parse_expression(tokens, pos, scope)?;
        if *pos >= tokens.len() || tokens[*pos] != ".." {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        *pos += 1; // skip ".."
        let e = parse_expression(tokens, pos, scope)?;
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
        frame.insert(var_name.clone(), (Value::Int(start_val), true));
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
            frame.insert(var_name.clone(), (Value::Int(start_val + i), true));
        }

        // Execute body at fresh position
        let mut body_pos = body_begin;
        eval_loop_body_stmt(tokens, &mut body_pos, scope)
            .map_err(|_| ParseError::MaxIterationsExceeded)?;
    }

    *pos = loop_end;
    Ok(Some(()))
}

fn parse_while_statement(
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

fn parse_statement_list(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    terminator: Option<&'static str>,
) -> Result<i64, ParseError> {
    let mut result = 0i64;

    while *pos < tokens.len() && terminator.map_or(true, |t| tokens[*pos] != t) {
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
            result = parse_expression(tokens, pos, scope)?;
        }
    }

    Ok(result)
}

#[cfg_attr(coverage_nightly, coverage(off))]
fn do_assignment(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
    var_name: &str,
) -> Result<i64, ParseError> {
    let op = tokens[*pos].clone();
    *pos += 1; // skip "=" or "+="
    let val = parse_expression(tokens, pos, scope)?;
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

fn consume_semicolon(pos: &mut usize, tokens: &[String]) {
    if *pos < tokens.len() && tokens[*pos] == ";" {
        *pos += 1;
    }
}

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
    let lhs = parse_expression(tokens, pos, scope)?;

    fn type_width(t: &str) -> Option<u32> {
        let digits = t
            .chars()
            .skip_while(|c| c.is_ascii_uppercase())
            .collect::<String>();
        if digits.is_empty() {
            Some(0)
        } else {
            digits.parse::<u32>().ok()
        }
    }

    fn check_type(dt: &str, rt: Option<&String>) -> Result<(), ParseError> {
        let dw = type_width(dt).unwrap_or(0);
        match (rt.and_then(|tok| extract_suffix(tok.as_str())), rt) {
            (Some(sfx), _) => {
                if type_width(sfx).unwrap_or(0) > dw {
                    Err(ParseError::UnexpectedEndOfInput)
                } else {
                    Ok(())
                }
            }
            (_, Some(tok)) if extract_int(tok.as_str()).is_some() => {
                Err(ParseError::UnexpectedEndOfInput)
            }
            _ => Ok(()),
        }
    }

    if let Some(ref dt) = declared_type {
        check_type(dt, rhs_token.as_ref().map(|s| s as &String))?;
    }

    if *pos < tokens.len() && tokens[*pos] == ".." {
        *pos += 1;
        let rhs = parse_expression(tokens, pos, scope)?;
        if let Some(frame) = scope.last_frame_mut() {
            frame.insert(
                var_name.clone(),
                (
                    Value::Range {
                        start: lhs,
                        end: rhs,
                    },
                    is_mut,
                ),
            );
        }
    } else {
        if let Some(frame) = scope.last_frame_mut() {
            frame.insert(var_name.clone(), (Value::Int(lhs), is_mut));
        }
    }
    consume_semicolon(pos, tokens);
    Ok(Some(()))
}

fn parse_expression(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_and(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "||" {
        *pos += 1;
        let right = parse_and(tokens, pos, scope)?;
        left = if left != 0 || right != 0 { 1 } else { 0 };
    }

    Ok(left)
}

fn parse_comparison(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_additive(tokens, pos, scope)?;

    while *pos < tokens.len() && matches!(tokens[*pos].as_str(), "<" | ">" | "<=" | ">=") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_additive(tokens, pos, scope)?;
        left = if (op == "<" && left < right)
            || (op == ">" && left > right)
            || (op == "<=" && left <= right)
            || (op == ">=" && left >= right)
        {
            1
        } else {
            0
        };
    }

    Ok(left)
}

fn parse_and(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    let mut left = parse_comparison(tokens, pos, scope)?;

    while *pos < tokens.len() && tokens[*pos] == "&&" {
        *pos += 1;
        let right = parse_comparison(tokens, pos, scope)?;
        // Logical AND: result is 1 if both operands are non-zero, else 0
        left = if left != 0 && right != 0 { 1 } else { 0 };
    }

    Ok(left)
}

fn parse_additive(
    tokens: &[String],
    pos: &mut usize,
    scope: &mut Scope,
) -> Result<i64, ParseError> {
    let mut left = parse_term(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_term(tokens, pos, scope)?;
        left = if op == "+" {
            left + right
        } else {
            left - right
        };
    }

    Ok(left)
}

fn parse_term(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    let mut left = parse_factor(tokens, pos, scope)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%")
    {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_factor(tokens, pos, scope)?;
        left = if op == "*" {
            left * right
        } else if op == "/" {
            left / right
        } else {
            left % right
        };
    }

    Ok(left)
}

fn parse_factor(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
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
            let val = parse_block(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "}" {
                *pos += 1;
            }
            Ok(val)
        }
        "true" => {
            *pos += 1;
            Ok(1)
        }
        "false" => {
            *pos += 1;
            Ok(0)
        }
        "if" => {
            *pos += 1;
            let cond = parse_if_condition(tokens, pos, scope)?;
            let then_val = parse_expression(tokens, pos, scope)?;
            if *pos < tokens.len() && tokens[*pos] == "else" {
                *pos += 1;
            }
            let else_val = parse_expression(tokens, pos, scope)?;
            Ok(if cond != 0 { then_val } else { else_val })
        }
        "match" => {
            *pos += 1;
            if *pos >= tokens.len() || tokens[*pos] != "(" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;
            let scrutinee = parse_expression(tokens, pos, scope)?;

            if *pos >= tokens.len() || tokens[*pos] != ")" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;
            if *pos >= tokens.len() || tokens[*pos] != "{" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;

            let mut result = None;
            loop {
                if *pos >= tokens.len() || tokens[*pos] != "case" {
                    break;
                }
                *pos += 1;

                let is_wildcard = *pos < tokens.len() && tokens[*pos] == "_";
                if !is_wildcard {
                    let pat_val = parse_expression(tokens, pos, scope)?;
                    if *pos >= tokens.len() || tokens[*pos] != "=>" {
                        return Err(ParseError::UnexpectedEndOfInput);
                    }
                    *pos += 1;
                    let arm_val = parse_expression(tokens, pos, scope)?;
                    if scrutinee == pat_val && result.is_none() {
                        result = Some(arm_val);
                    }
                } else {
                    *pos += 1;
                    if *pos >= tokens.len() || tokens[*pos] != "=>" {
                        return Err(ParseError::UnexpectedEndOfInput);
                    }
                    *pos += 1;
                    let arm_val = parse_expression(tokens, pos, scope)?;
                    if result.is_none() {
                        result = Some(arm_val);
                    }
                }

                consume_semicolon(pos, tokens);
            }

            if *pos >= tokens.len() || tokens[*pos] != "}" {
                return Err(ParseError::UnexpectedEndOfInput);
            }
            *pos += 1;

            match result {
                Some(v) => Ok(v),
                None => Err(ParseError::UnexpectedEndOfInput),
            }
        }
        _ => {
            // Try to parse as integer literal, optionally with uppercase type suffix (e.g. "100U8")
            if let Some(n) = extract_int(token.as_str()) {
                *pos += 1;
                Ok(n)
            } else if scope.contains_key(token.as_str())
                && (*pos + 1 >= tokens.len() || tokens[*pos + 1] != "=")
            {
                // Variable reference (not an assignment)
                let val = scope
                    .get(token.as_str())
                    .map(|e| e.0)
                    .unwrap_or(Value::Int(0))
                    .as_int();
                *pos += 1;
                Ok(val)
            } else if scope.contains_key(token.as_str())
                && (*pos + 1 < tokens.len())
                && tokens[*pos + 1] == "="
            {
                // Assignment expression: x = expr
                let var_name = token.clone();
                *pos += 1;
                let val = do_assignment(tokens, pos, scope, &var_name)?;
                consume_semicolon(pos, tokens);
                Ok(val)
            } else {
                Err(ParseError::UnknownIdentifier(token.clone()))
            }
        }
    }
}

fn parse_block(tokens: &[String], pos: &mut usize, scope: &mut Scope) -> Result<i64, ParseError> {
    scope.push();
    let result = parse_statement_list(tokens, pos, scope, Some("}"));
    scope.pop();
    result
}

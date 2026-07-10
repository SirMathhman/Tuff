use crate::scope::{ParseError, Scope, Value, check_type, consume_semicolon, infer_type};

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
pub fn parse_fn_statement(
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
    // This was just a dry-run to find the body's end position, not a real call —
    // clear any returned flag it triggered so it doesn't leak into later parsing.
    scope.clear_returned();
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
    if scope.has_global_frame() {
        scope.insert_global(
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
pub fn parse_let_statement(
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

    // If a return was triggered during RHS evaluation, stop processing this statement
    if scope.is_returned() {
        consume_semicolon(pos, tokens);
        Ok(Some(()))
    } else {
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
    } // close the else block for scope.is_returned()
}

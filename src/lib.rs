//! Tuff programming language interpreter library.
//!
//! Parses and evaluates expressions with typed integer literals
//! (U8, U16, U32, U64, I8, Bool) and arithmetic operators (+, -, *, /, %),
//! logical operators (&&, ||), with proper operator precedence, bounds-checking,
//! block expressions, `let` bindings, and mutable assignment.

use std::collections::HashMap;

/// Macro to parse a typed suffix literal (e.g. "42U8") and return its
/// value along with the inclusive `[min, max]` range for the type.
macro_rules! parse_suffix {
    ($input:expr, $suffix:literal, $ty:ty, $min:expr, $max:expr) => {
        if let Some(num) = $input.strip_suffix($suffix) {
            let value: $ty = num.parse().map_err(|_| "invalid literal")?;
            return Ok((value as i64, $min, $max));
        }
    };
}

/// Type alias for a variable scope: name → (value, min_bound, max_bound, is_mutable).
type Scope<'a> = HashMap<&'a str, (i64, i64, i64, bool)>;

/// Parses a single typed literal token (e.g. `"100U8"`, `"-128I8"`).
///
/// Returns the integer value and its inclusive `[min, max]` bounds.
fn parse_literal(input: &str) -> Result<(i64, i64, i64), &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Err("empty literal");
    }

    if let Some(num) = trimmed.strip_suffix("U64") {
        let value: u64 = num.parse().map_err(|_| "invalid literal")?;
        if value > i64::MAX as u64 {
            return Err("literal exceeds i64 range");
        }
        return Ok((value as i64, 0, i64::MAX));
    }

    parse_suffix!(trimmed, "U32", u32, 0, u32::MAX as i64);
    parse_suffix!(trimmed, "U16", u16, 0, u16::MAX as i64);
    parse_suffix!(trimmed, "U8", u8, 0, u8::MAX as i64);
    parse_suffix!(trimmed, "I8", i8, i8::MIN as i64, i8::MAX as i64);

    // Boolean literals
    if trimmed == "true" {
        return Ok((1, 0, 1));
    }
    if trimmed == "false" {
        return Ok((0, 0, 1));
    }

    Err("unknown literal")
}

/// Parses a literal or resolves a variable name from the given scope.
fn parse_literal_or_var<'a>(
    input: &'a str,
    scope: &Scope<'a>,
) -> Result<(i64, i64, i64), &'static str> {
    let trimmed = input.trim();
    if let Some(&(val, lo, hi, _)) = scope.get(trimmed) {
        return Ok((val, lo, hi));
    }
    parse_literal(trimmed)
}

/// Checks that `val` falls within the inclusive range `[min, max]`.
fn check_bounds(val: i64, min: i64, max: i64) -> Result<(), &'static str> {
    if val < min || val > max {
        return Err("value out of bounds");
    }
    Ok(())
}

/// Tokenizes an expression string, resolving variables from `scope`.
fn tokenize_expr<'a>(
    input: &'a str,
    scope: &Scope<'a>,
) -> Result<Vec<(i64, i64, i64, char)>, &'static str> {
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    let mut tokens = Vec::new();

    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }

        if chars[i] == '+' || chars[i] == '*' || chars[i] == '/' || chars[i] == '%' {
            tokens.push((0, 0, 0, chars[i]));
            i += 1;
            continue;
        }

        if chars[i] == '-' {
            if i + 1 >= chars.len() || chars[i + 1].is_whitespace() {
                tokens.push((0, 0, 0, '-'));
                i += 1;
                continue;
            }
        }

        if chars[i] == '(' || chars[i] == '{' {
            let open = chars[i];
            let close = if open == '(' { ')' } else { '}' };
            let mut depth = 1;
            let mut j = i + 1;
            while j < chars.len() && depth > 0 {
                if chars[j] == open {
                    depth += 1;
                } else if chars[j] == close {
                    depth -= 1;
                }
                j += 1;
            }
            if depth != 0 {
                return Err("mismatched grouping");
            }
            let inner = &input[i + 1..j - 1];
            let (val, lo, hi) = if open == '(' {
                eval_expr(inner, scope)?
            } else {
                eval_block(inner)?
            };
            tokens.push((val, lo, hi, ' '));
            i = j;
            continue;
        }

        if chars[i] == ')' || chars[i] == '}' {
            return Err("unexpected closing bracket");
        }

        let start = i;
        if chars[i] == '-' {
            i += 1;
        }
        while i < chars.len()
            && !chars[i].is_whitespace()
            && chars[i] != '+'
            && chars[i] != '-'
            && chars[i] != '*'
            && chars[i] != '/'
            && chars[i] != '%'
            && chars[i] != '('
            && chars[i] != ')'
            && chars[i] != '{'
            && chars[i] != '}'
        {
            i += 1;
        }
        let literal: String = chars[start..i].iter().collect();
        let (val, lo, hi) = parse_literal_or_var(&literal, scope)?;
        tokens.push((val, lo, hi, ' '));
    }

    Ok(tokens)
}

/// Evaluates a parenthesized or simple expression with the given scope.
fn eval_expr(input: &str, scope: &Scope) -> Result<(i64, i64, i64), &'static str> {
    let trimmed = input.trim();

    // Handle logical ops (lowest precedence) — split at top-level || and &&
    if let Some(result) = eval_logical(trimmed, scope)? {
        return Ok(result);
    }

    let has_ops = trimmed.contains('+')
        || trimmed.contains('-')
        || trimmed.contains('*')
        || trimmed.contains('/')
        || trimmed.contains('%');

    if !has_ops {
        if trimmed.is_empty() {
            return Ok((0, 0, 0));
        }
        return parse_literal_or_var(trimmed, scope);
    }

    let tokens = tokenize_expr(trimmed, scope)?;
    let tokens = fold_multiplicative(&tokens)?;
    let result = fold_additive(&tokens)?;
    Ok((result, 0, 0))
}

/// Splits `input` at top-level (depth 0) occurrences of `pat`, returning parts.
fn split_top_level<'a>(input: &'a str, pat: &str) -> Vec<&'a str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut start = 0;
    for (i, ch) in input.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => depth -= 1,
            _ if depth == 0 && input[i..].starts_with(pat) => {
                parts.push(&input[start..i]);
                start = i + pat.len();
            }
            _ => {}
        }
    }
    parts.push(&input[start..]);
    parts
}

/// Splits at top-level `||`/`&&`, respecting operator precedence (&& before ||).
fn eval_logical<'a>(
    input: &'a str,
    scope: &Scope<'a>,
) -> Result<Option<(i64, i64, i64)>, &'static str> {
    let or_parts = split_top_level(input, "||");
    if or_parts.len() <= 1 {
        // Check for && at top-level
        let and_parts = split_top_level(input, "&&");
        if and_parts.len() <= 1 {
            return Ok(None);
        }
        // Evaluate &&: all must be truthy
        let mut result = 1i64;
        for part in &and_parts {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                continue;
            }
            let (val, _, _) = eval_expr(trimmed, scope)?;
            if val == 0 {
                result = 0;
                break;
            }
        }
        return Ok(Some((result, 0, 1)));
    }

    // Evaluate ||: short-circuit on first truthy
    for part in &or_parts {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Sub-evaluate each OR operand (which may contain &&)
        let sub = eval_logical(trimmed, scope)?;
        let val = match sub {
            Some((v, _, _)) => v,
            None => eval_expr(trimmed, scope)?.0,
        };
        if val != 0 {
            return Ok(Some((1, 0, 1)));
        }
    }
    Ok(Some((0, 0, 1)))
}

/// Evaluates a block `{ stmt; stmt; ...; expr }`.
///
/// Processes `let` bindings and returns the value of the last expression.
fn eval_block(input: &str) -> Result<(i64, i64, i64), &'static str> {
    let trimmed = input.trim();
    let mut scope: Scope = HashMap::new();
    let mut last_val = (0i64, 0i64, 0i64);

    // Split into statements at top-level `;` only (respecting brace depth).
    let mut stmt_start = 0;
    let mut depth = 0;
    for (i, ch) in trimmed.char_indices() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => depth -= 1,
            ';' if depth == 0 => {
                let stmt = trimmed[stmt_start..i].trim();
                if !stmt.is_empty() {
                    eval_stmt(stmt, &mut scope)?;
                    // Semicolon-terminated statements don't set last_val.
                }
                stmt_start = i + 1;
            }
            _ => {}
        }
    }
    // Last expression after the final `;` sets last_val.
    let tail = trimmed[stmt_start..].trim();
    if !tail.is_empty() {
        last_val = eval_stmt(tail, &mut scope)?;
    }

    Ok(last_val)
}

/// Returns the inclusive `[min, max]` bounds for a named type (e.g. "U8", "I8").
fn type_bounds(ty: &str) -> Option<(i64, i64)> {
    match ty.trim() {
        "U8" => Some((0, u8::MAX as i64)),
        "U16" => Some((0, u16::MAX as i64)),
        "U32" => Some((0, u32::MAX as i64)),
        "U64" => Some((0, i64::MAX)),
        "I8" => Some((i8::MIN as i64, i8::MAX as i64)),
        "Bool" => Some((0, 1)),
        _ => None,
    }
}

/// Evaluates a single statement, which may be a `let` binding, assignment, or expression.
fn eval_stmt<'a>(stmt: &'a str, scope: &mut Scope<'a>) -> Result<(i64, i64, i64), &'static str> {
    // let [mut] name [: Type] = expr
    if let Some(rhs) = stmt.strip_prefix("let ") {
        let (_is_mut, rest) = if let Some(r) = rhs.strip_prefix("mut ") {
            (true, r)
        } else {
            (false, rhs)
        };
        let mut parts = rest.splitn(2, '=');
        let binding = parts.next().unwrap().trim();
        let expr_str = parts.next().ok_or("expected '=' in let binding")?.trim();

        let name: &str;
        let type_name: Option<&str>;
        if let Some((n, t)) = binding.split_once(':') {
            name = n.trim();
            type_name = Some(t.trim());
        } else {
            name = binding.trim();
            type_name = None;
        }

        let (val, lo, hi) = eval_expr(expr_str, scope)?;

        if let Some(ty) = type_name {
            if let Some((tmin, tmax)) = type_bounds(ty) {
                if lo < tmin || hi > tmax {
                    return Err("type mismatch");
                }
            }
        }

        scope.insert(name, (val, lo, hi, _is_mut));
        return Ok((val, lo, hi));
    }

    // Assignment: name = expr
    if let Some((var, rhs_str)) = stmt.split_once('=') {
        let var = var.trim();
        let rhs_str = rhs_str.trim();
        if let Some(&(_val, lo, hi, is_mut)) = scope.get(var) {
            if !is_mut {
                return Err("cannot assign to immutable variable");
            }
            let (_new_val, rlo, rhi) = eval_expr(rhs_str, scope)?;
            if _new_val < lo || _new_val > hi {
                return Err("assignment out of bounds");
            }
            if rlo < lo || rhi > hi {
                return Err("assignment type mismatch");
            }
            scope.insert(var, (_new_val, lo, hi, true));
            return Ok((_new_val, lo, hi));
        }
        return Err("unknown variable in assignment");
    }

    eval_expr(stmt, scope)
}

/// Folds `*`, `/`, `%` operators with left-to-right precedence,
/// collapsing each multiplication/division/modulo into a single token.
fn fold_multiplicative(
    tokens: &[(i64, i64, i64, char)],
) -> Result<Vec<(i64, i64, i64, char)>, &'static str> {
    let mut out = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        if tokens[i].3 == ' '
            && i + 2 < tokens.len()
            && (tokens[i + 1].3 == '*' || tokens[i + 1].3 == '/' || tokens[i + 1].3 == '%')
        {
            let (lv, llo, lhi, _) = tokens[i];
            let (rv, rlo, rhi, _) = tokens[i + 2];
            if rv == 0 {
                return Err("division by zero");
            }
            let result = match tokens[i + 1].3 {
                '*' => lv.checked_mul(rv).ok_or("i64 overflow")?,
                '/' => lv.checked_div(rv).ok_or("i64 division error")?,
                '%' => lv.checked_rem(rv).ok_or("i64 modulo error")?,
                _ => unreachable!(),
            };
            let lo = llo.min(rlo);
            let hi = lhi.max(rhi);
            check_bounds(result, lo, hi)?;
            out.push((result, lo, hi, ' '));
            i += 3;
        } else {
            out.push(tokens[i]);
            i += 1;
        }
    }

    Ok(out)
}

/// Folds `+` and `-` operators left-to-right across the token stream.
fn fold_additive(tokens: &[(i64, i64, i64, char)]) -> Result<i64, &'static str> {
    let mut acc = 0i64;
    let mut lo = i64::MAX;
    let mut hi = i64::MIN;
    let mut op = '+';
    let mut i = 0;

    while i < tokens.len() {
        if tokens[i].3 == ' ' {
            let (val, tlo, thi, _) = tokens[i];
            lo = lo.min(tlo);
            hi = hi.max(thi);
            match op {
                '+' => acc = acc.checked_add(val).ok_or("i64 overflow")?,
                '-' => acc = acc.checked_sub(val).ok_or("i64 underflow")?,
                _ => unreachable!(),
            }
            check_bounds(acc, lo, hi)?;
            i += 1;
        } else {
            op = tokens[i].3;
            i += 1;
        }
    }

    Ok(acc)
}

/// Returns true if `input` contains a `;` at depth 0 (not inside braces/parens).
fn has_top_level_semicolons(input: &str) -> bool {
    let mut depth = 0;
    for ch in input.chars() {
        match ch {
            '(' | '{' => depth += 1,
            ')' | '}' => depth -= 1,
            ';' if depth == 0 => return true,
            _ => {}
        }
    }
    false
}

/// Parses and evaluates a Tuff expression, returning the resulting `i64`.
///
/// The string may contain typed integer literals (U8, U16, U32, U64, I8, Bool)
/// combined with arithmetic operators (+, -, *, /, %), logical operators (&&, ||),
/// parentheses, block expressions, `let` bindings, and mutable assignment.
pub fn interpret_tuff(input: &str) -> Result<i64, &'static str> {
    let trimmed = input.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        let inner = &trimmed[1..trimmed.len() - 1];
        return eval_block(inner).map(|(val, _, _)| val);
    }
    // Top-level statement sequence (semicolons at depth 0)
    if has_top_level_semicolons(trimmed) {
        return eval_block(trimmed).map(|(val, _, _)| val);
    }
    eval_expr(trimmed, &HashMap::new()).map(|(val, _, _)| val)
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;

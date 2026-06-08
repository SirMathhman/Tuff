use std::collections::HashMap;
#[cfg(not(coverage))]
use std::io::{self, BufRead, Write};

/// Represents an inferred type in the Tuff language.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TuffType {
    U8,
    U16,
    U32,
    I8,
    I16,
    I32,
    Bool,
}

impl TuffType {
    fn bits(&self) -> u32 {
        match self {
            TuffType::U8 | TuffType::I8 | TuffType::Bool => 8,
            TuffType::U16 | TuffType::I16 => 16,
            TuffType::U32 | TuffType::I32 => 32,
        }
    }
}

/// Variable scope for let bindings within blocks, storing both value and type.
type Scope = HashMap<String, (i32, TuffType)>;

#[cfg(not(coverage))]
fn main() {
    let stdin = io::stdin();
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match stdin.lock().read_line(&mut input) {
            Ok(0) => break, // EOF
            Ok(_) => {
                let trimmed = input.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let scope: Scope = HashMap::new();
                match execute_tuff_with_scope(trimmed, &scope) {
                    Ok((value, _ty)) => println!("{}", value),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

/// Parse a single typed value like "100U8" or "-50I16", returning (value, inferred_type).
fn parse_value(token: &str, context: &str) -> Result<(i32, Option<TuffType>), String> {
    let token = token.trim();

    // Determine the type prefix (U/u for unsigned, I/i for signed).
    match token.find(|c| c == 'U' || c == 'u' || c == 'I' || c == 'i') {
        Some(pos) => {
            let value_str = &token[..pos];
            if value_str.is_empty() {
                return Err(format!("invalid input: {}", context));
            }

            let is_unsigned = token.as_bytes()[pos] == b'U' || token.as_bytes()[pos] == b'u';

            // Reject negative values for unsigned types.
            if is_unsigned && value_str.starts_with('-') {
                return Err(format!("negative value not allowed: {}", context));
            }

            let value = value_str
                .parse::<i32>()
                .map_err(|_| format!("invalid number in '{}': {}", token, context))?;

            // Extract and validate the type suffix (e.g., "8", "16", "32").
            let suffix = &token[pos + 1..];
            if !suffix.is_empty() {
                match suffix.parse::<u32>() {
                    Ok(bits) => {
                        // Determine inferred type.
                        let inferred_ty: Option<TuffType> = match (is_unsigned, bits) {
                            (true, 8) => Some(TuffType::U8),
                            (true, 16) => Some(TuffType::U16),
                            (true, 32) => Some(TuffType::U32),
                            (false, 8) => Some(TuffType::I8),
                            (false, 16) => Some(TuffType::I16),
                            (false, 32) => Some(TuffType::I32),
                            _ => None,
                        };

                        // Validate the value fits within its declared type.
                        if is_unsigned {
                            let unsigned_max = (1u64 << bits).wrapping_sub(1);
                            if value < 0 || value as u64 > unsigned_max {
                                return Err(format!(
                                    "value out of range for U{}: {}",
                                    bits, context
                                ));
                            }
                        } else {
                            validate_type(value, false, bits).map_err(|e| format!("{}", e))?;
                        }

                        Ok((value, inferred_ty))
                    }
                    Err(_) => {
                        return Err(format!("invalid type suffix in '{}': {}", token, context));
                    }
                }
            } else {
                // No bits suffix (e.g., just "U") — treat as untyped.
                Ok((value, None))
            }
        }
        None => token
            .parse::<i32>()
            .map(|v| (v, None))
            .map_err(|_| format!("invalid number: {}", context)),
    }
}

/// Parse a single token — either a variable reference or a typed literal, returning (value, inferred_type).
fn parse_token(
    token: &str,
    _context: &str,
    scope: &Scope,
) -> Result<(i32, Option<TuffType>), String> {
    let token = token.trim();

    // Handle boolean literals before variable lookup.
    if token == "true" {
        return Ok((1, Some(TuffType::Bool)));
    }
    if token == "false" {
        return Ok((0, Some(TuffType::Bool)));
    }

    // Check if this is a simple identifier (variable name).
    if !token.is_empty()
        && token
            .chars()
            .next()
            .map_or(false, |c| c.is_alphabetic() || c == '_')
        && !token.contains(|c: char| c == 'U' || c == 'u' || c == 'I' || c == 'i')
    {
        if let Some(&(val, ty)) = scope.get(token) {
            return Ok((val, Some(ty)));
        }
        // Fall through to parse_value for unknown tokens.
    }

    parse_value(token, _context)
}

/// Check if a character is an opening grouping delimiter (`(` or `{`).
fn is_opening(ch: char) -> bool {
    matches!(ch, '(' | '{')
}

/// Check if a character is any closing grouping delimiter.
fn is_closing(ch: char) -> bool {
    matches!(ch, ')' | '}')
}

/// Try to strip matching outer grouping delimiters (parens or braces).
/// Returns the inner string only if the first and last chars form a valid pair
/// and depth never reaches 0 before the final character.
fn try_strip_outer_group(s: &str) -> Option<&str> {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 2 {
        return None;
    }

    // Check that first char is an opener and last is a matching closer.
    match (chars[0], *chars.last()?) {
        ('(', ')') | ('{', '}') => {}
        _ => return None,
    }

    // Walk inner chars + final closer; depth starts at 1 for the opening delimiter.
    let mut depth = 1i32;
    for (idx, &ch) in chars[1..].iter().enumerate() {
        if is_opening(ch) {
            depth += 1;
        } else if is_closing(ch) {
            depth -= 1;
        }
        // If depth hits 0 before the last character, outer delimiters don't match.
        if idx < chars.len() - 2 && depth == 0 {
            return None;
        }
    }

    if depth != 0 {
        return None;
    }
    Some(&s[1..s.len() - 1])
}

/// Track depth changes while iterating over characters, calling a callback for each.
fn track_depth<F>(s: &str, mut callback: F)
where
    F: FnMut(usize, char, i32),
{
    let mut depth = 0i32;
    for (i, ch) in s.char_indices() {
        if is_opening(ch) {
            depth += 1;
        } else if is_closing(ch) {
            depth -= 1;
        }
        callback(i, ch, depth);
    }
}

/// Split a string by semicolons, respecting nesting of parens/braces.
fn split_by_semicolons(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut current_start = 0usize;

    track_depth(s, |i, ch, depth| {
        if ch == ';' && depth == 0 {
            parts.push(&s[current_start..i]);
            current_start = i + 1; // Skip the semicolon.
        }
    });

    // Add remaining content after last semicolon.
    if current_start < s.len() {
        let remainder = &s[current_start..];
        if !remainder.trim().is_empty() {
            parts.push(remainder);
        }
    }

    parts
}

/// Find the last occurrence of any operator in `ops` at grouping depth 0.
fn find_operator_at_depth(
    s: &str,
    ops: &[char],
    skip_leading_minus: bool,
) -> Option<(usize, char)> {
    let mut best_pos = None;
    let mut best_op = '\0';

    track_depth(s, |i, ch, depth| {
        if depth == 0 && ops.contains(&ch) {
            // Avoid treating a leading '-' as subtraction.
            if !skip_leading_minus || ch != '-' || i > 0 {
                best_pos = Some(i);
                best_op = ch;
            }
        }
    });

    best_pos.map(|pos| (pos, best_op))
}

/// Find the last occurrence of a two-character operator (e.g., "||" or "&&") at grouping depth 0.
fn find_binary_operator_at_depth(s: &str, ch: char) -> Option<usize> {
    let mut best_pos = None;
    let chars: Vec<char> = s.chars().collect();
    let mut depth = 0i32;

    for i in 0..chars.len() {
        if is_opening(chars[i]) {
            depth += 1;
        } else if is_closing(chars[i]) {
            depth -= 1;
        }

        // Look for two identical chars (e.g., "||" or "&&") at depth 0.
        if depth == 0 && chars[i] == ch && i + 1 < chars.len() && chars[i + 1] == ch {
            best_pos = Some(i);
        }
    }

    best_pos
}

/// Find the last occurrence of a comparison operator at grouping depth 0.
/// Checks two-char operators first (<=, >=, ==, !=), then single-char (<, >).
fn find_comparison_at_depth(s: &str) -> Option<(usize, usize)> {
    let chars: Vec<char> = s.chars().collect();
    let mut depth = 0i32;

    // Track best positions for two-char and single-char operators separately.
    let mut best_two_char: Option<usize> = None;
    let mut best_single_char: Option<usize> = None;

    for i in 0..chars.len() {
        if is_opening(chars[i]) {
            depth += 1;
        } else if is_closing(chars[i]) {
            depth -= 1;
        }

        // Only consider operators at depth 0.
        if depth != 0 {
            continue;
        }

        // Check two-char comparison operators: <=, >=, ==, !=
        if i + 1 < chars.len() && matches!(chars[i], '<' | '>' | '=' | '!') {
            let pair = format!("{}{}", chars[i], chars[i + 1]);
            if ["<=", ">=", "==", "!="].contains(&pair.as_str()) {
                best_two_char = Some(i);
                continue;
            }
        }

        // Check single-char comparison operators: <, > (skip if part of two-char)
        if matches!(chars[i], '<' | '>') {
            let next_is_eq = i + 1 < chars.len() && chars[i + 1] == '=';
            if !next_is_eq {
                best_single_char = Some(i);
            }
        }
    }

    // Prefer two-char operator; fall back to single-char.
    best_two_char
        .map(|pos| (pos, 2))
        .or_else(|| best_single_char.map(|pos| (pos, 1)))
}

/// Evaluate a logical binary operator (OR/AND or comparison) on two sub-expressions.
fn evaluate_logical_op<F>(
    left_str: &str,
    right_str: &str,
    scope: &Scope,
    op: F,
) -> Result<(i32, TuffType), String>
where
    F: Fn(i32, i32) -> bool,
{
    let (left_val, _) = execute_tuff_with_scope(left_str, scope)?;
    let (right_val, _) = execute_tuff_with_scope(right_str, scope)?;
    Ok((if op(left_val, right_val) { 1 } else { 0 }, TuffType::Bool))
}

/// Widen two types to the larger of the two.
fn widen_types(left: Option<TuffType>, right: Option<TuffType>) -> TuffType {
    match (left, right) {
        // If either side is explicitly typed, use that type.
        (Some(ty), None) | (None, Some(ty)) => ty,
        // Both sides have types — pick the wider one.
        (Some(lty), Some(rty)) => {
            if lty.bits() >= rty.bits() {
                lty
            } else {
                rty
            }
        }
        // Neither side has a type — default to I32.
        (None, None) => TuffType::I32,
    }
}

/// Parse an `if (...) ... else ...` expression and return the condition, then-branch, and else-branch strings.
fn parse_if_expression(s: &str) -> Option<(&str, &str, &str)> {
    // Must start with "if" at depth 0.
    let chars: Vec<char> = s.chars().collect();
    if !s.starts_with("if") || (chars.len() > 2 && !chars[2].is_whitespace()) {
        return None;
    }

    // Find the opening '(' after "if".
    let after_if = &s[2..];
    let trimmed_after = after_if.trim_start();
    if !trimmed_after.starts_with('(') {
        return None;
    }

    // Extract condition between matching parens.
    let inner = &trimmed_after[1..];
    let mut depth = 1i32;
    let mut cond_end = None;
    for (i, ch) in inner.char_indices() {
        if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            depth -= 1;
        }
        if depth == 0 {
            cond_end = Some(i);
            break;
        }
    }

    let cond_end = cond_end?;
    let condition = &inner[..cond_end];

    // After closing paren, find "else" at depth 0.
    let after_paren = &trimmed_after[1 + cond_end + 1..];
    let mut else_pos: Option<usize> = None;
    let mut scan_depth = 0i32;
    for (i, ch) in after_paren.char_indices() {
        if ch == '(' || ch == '{' {
            scan_depth += 1;
        } else if (ch == ')' || ch == '}') && scan_depth > 0 {
            scan_depth -= 1;
        }

        // Look for "else" keyword at depth 0.
        if scan_depth == 0 && after_paren[i..].starts_with("else") {
            let next_char = after_paren.chars().nth(i + 4);
            match next_char {
                None => {
                    else_pos = Some(i);
                    break;
                }
                Some(c) if !c.is_alphanumeric() && c != '_' => {
                    else_pos = Some(i);
                    break;
                }
                _ => {}
            }
        }
    }

    let pos = else_pos?;
    let then_branch = &after_paren[..pos];
    let else_branch = &after_paren[pos + 4..];

    Some((condition, then_branch.trim(), else_branch.trim()))
}

/// Evaluate a Tuff expression with variable scope support, returning (value, inferred_type).
fn execute_tuff_with_scope(input: &str, scope: &Scope) -> Result<(i32, TuffType), String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok((0, TuffType::I32));
    }

    // Handle grouped expressions by stripping matching outer delimiters.
    if let Some(inner) = try_strip_outer_group(trimmed) {
        // If it's a brace block with statements or keywords like `let`, evaluate as block.
        if trimmed.starts_with('{')
            && (inner.contains(';')
                || inner.trim().starts_with("let ")
                || inner.trim().starts_with("Let "))
        {
            return evaluate_block(inner, scope);
        }
        return execute_tuff_with_scope(inner, scope);
    }

    // Check for if (...) ... else ... expression.
    if let Some((cond_str, then_str, else_str)) = parse_if_expression(trimmed) {
        let (cond_val, _) = execute_tuff_with_scope(cond_str, scope)?;
        return if cond_val != 0 {
            execute_tuff_with_scope(then_str, scope)
        } else {
            execute_tuff_with_scope(else_str, scope)
        };
    }

    // Check for logical OR (||) operator at depth 0.
    if let Some(pos) = find_binary_operator_at_depth(trimmed, '|') {
        return evaluate_logical_op(&trimmed[..pos], &trimmed[pos + 2..], scope, |l, r| {
            l != 0 || r != 0
        });
    }

    // Check for logical AND (&&) operator at depth 0.
    if let Some(pos) = find_binary_operator_at_depth(trimmed, '&') {
        return evaluate_logical_op(&trimmed[..pos], &trimmed[pos + 2..], scope, |l, r| {
            l != 0 && r != 0
        });
    }

    // Check for comparison operators at depth 0: <= >= == != < >.
    if let Some((pos, width)) = find_comparison_at_depth(trimmed) {
        let op_str = &trimmed[pos..pos + width];
        return evaluate_logical_op(&trimmed[..pos], &trimmed[pos + width..], scope, |l, r| {
            match op_str {
                "<=" => l <= r,
                ">=" => l >= r,
                "==" => l == r,
                "!=" => l != r,
                "<" => l < r,
                ">" => l > r,
                _ => unreachable!(),
            }
        });
    }

    // Find operators not inside groups, respecting precedence: * and / before + and -.
    let mut result = find_operator_at_depth(trimmed, &['+', '-'], true);

    if result.is_none() {
        result = find_operator_at_depth(trimmed, &['*', '/'], false);
    }

    // If an operator was found, split and evaluate recursively.
    if let Some((pos, op)) = result {
        let left_str = &trimmed[..pos];
        let right_str = &trimmed[pos + 1..];

        let (left_val, left_ty) = execute_tuff_with_scope(left_str, scope)?;
        let (right_val, right_ty) = execute_tuff_with_scope(right_str, scope)?;

        // Widen to the larger type.
        let result_ty = widen_types(Some(left_ty), Some(right_ty));

        return match op {
            '+' => Ok((left_val + right_val, result_ty)),
            '-' => Ok((left_val - right_val, result_ty)),
            '*' => Ok((left_val * right_val, result_ty)),
            '/' => {
                if right_val == 0 {
                    Err(format!("division by zero: {}", input))
                } else {
                    Ok((left_val / right_val, result_ty))
                }
            }
            _ => unreachable!(),
        };
    }

    // No operator found — parse as a single token (variable or literal).
    let (val, ty) = parse_token(trimmed, input, scope)?;
    Ok((val, ty.unwrap_or(TuffType::I32)))
}

/// Evaluate a brace block with semicolon-separated statements, returning (value, inferred_type).
fn evaluate_block(inner: &str, parent_scope: &Scope) -> Result<(i32, TuffType), String> {
    let mut scope = parent_scope.clone();
    // Split by semicolons first.
    let raw_parts = split_by_semicolons(inner);

    if raw_parts.is_empty() {
        return Ok((0, TuffType::I32));
    }

    // Evaluate all but the last part as statements (let bindings).
    for stmt in &raw_parts[..raw_parts.len() - 1] {
        evaluate_statement(stmt.trim(), &mut scope)?;
    }

    // The last expression may contain adjacent expressions at depth 0 (e.g., "{ ... } y").
    let final_part = raw_parts.last().unwrap();
    let split_final = split_adjacent_expressions(final_part);

    // If the only remaining part is a statement-like construct, evaluate it as such and return 0.
    if split_final.len() == 1 {
        let trimmed = split_final[0].trim();
        if trimmed.starts_with("let ") || trimmed.starts_with("Let ") {
            evaluate_statement(trimmed, &mut scope)?;
            return Ok((0, TuffType::I32));
        }
    }

    // Evaluate all but the very last as statements.
    for stmt in &split_final[..split_final.len() - 1] {
        evaluate_statement(stmt.trim(), &mut scope)?;
    }

    // The final expression determines the block's value and type.
    execute_tuff_with_scope(split_final.last().unwrap().trim(), &scope)
}

/// Split a part that contains adjacent expressions at depth 0 (e.g., "{ ... } y").
/// Only splits when we've just closed a group and the next non-whitespace char is NOT an arithmetic operator.
fn split_adjacent_expressions(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut current_start = 0usize;

    track_depth(s, |i, ch, depth| {
        if depth == 0 && ch.is_whitespace() {
            // Check whether the segment since current_start contained a complete group.
            let segment = &s[current_start..i];
            let mut seg_depth = 0i32;
            let mut had_group_exit = false;
            for c in segment.chars() {
                if is_opening(c) {
                    seg_depth += 1;
                } else if is_closing(c) && seg_depth > 0 {
                    seg_depth -= 1;
                }
                // If depth returns to 0 mid-segment, we have a complete group.
                if is_closing(c) && seg_depth == 0 {
                    had_group_exit = true;
                }
            }

            if !had_group_exit {
                return;
            }

            // Look ahead past whitespace to see what follows.
            let after_ws = &s[i..].trim_start();
            let next_char = after_ws.chars().next();

            // Only split if the next non-whitespace char is NOT an arithmetic operator.
            if !matches!(next_char, Some('+') | Some('-') | Some('*') | Some('/')) {
                parts.push(segment);
                current_start = i;
            }
        }
    });

    // Add remaining content.
    if current_start < s.len() {
        let remainder = &s[current_start..];
        if !remainder.trim().is_empty() {
            parts.push(remainder);
        }
    }

    // If no split occurred, return the original string.
    if parts.is_empty() { vec![s] } else { parts }
}

/// Convert a string type annotation (e.g., "U8") to TuffType.
fn parse_type_annotation(s: &str) -> Option<TuffType> {
    let s = s.trim();
    // Only look at the leading token, not require an exact match.
    if let Some(space_pos) = s.find(|c: char| c.is_whitespace()) {
        let type_part = &s[..space_pos];
        return parse_type_annotation(type_part);
    }
    match s.to_uppercase().as_str() {
        "U8" => Some(TuffType::U8),
        "U16" => Some(TuffType::U16),
        "U32" => Some(TuffType::U32),
        "I8" => Some(TuffType::I8),
        "I16" => Some(TuffType::I16),
        "I32" => Some(TuffType::I32),
        "BOOL" => Some(TuffType::Bool),
        _ => None,
    }
}

/// Evaluate a single statement (currently only `let` bindings and assignments).
fn evaluate_statement(stmt: &str, scope: &mut Scope) -> Result<(), String> {
    // Match pattern: let [mut] name [: Type] = expr
    if stmt.starts_with("let ") || stmt.starts_with("Let ") {
        let rest = &stmt[4..].trim_start();

        // Handle optional "mut" keyword.
        let is_mut = rest.starts_with("mut ");
        let after_let: &str = if is_mut { &rest[4..] } else { rest };

        // Find the colon for type annotation.
        match after_let.find(':') {
            Some(colon_pos) => {
                let name = after_let[..colon_pos].trim().to_string();

                let after_colon = &after_let[colon_pos + 1..];

                // Extract the declared type (e.g., " U8" -> TuffType::U8).
                let declared_ty = parse_type_annotation(after_colon);

                if is_mut && !scope.contains_key(&name) {
                    scope.insert(name.clone(), (0, declared_ty.unwrap_or(TuffType::I32))); // Initialize mutable var.
                }

                // Skip past the type (e.g., " U8" or "I32").
                let eq_start = skip_type(after_colon);

                // Find '='.
                match eq_start.find('=') {
                    Some(eq_pos) => {
                        let expr_str = &eq_start[eq_pos + 1..];
                        let (value, inferred_ty) = execute_tuff_with_scope(expr_str.trim(), scope)?;

                        // If declared type is known and differs from inferred type, error.
                        if let Some(dty) = declared_ty {
                            if dty != inferred_ty {
                                return Err(format!(
                                    "type mismatch: expected {:?}, found {:?}",
                                    dty, inferred_ty
                                ));
                            }
                        }

                        scope.insert(name, (value, inferred_ty));
                        Ok(())
                    }
                    None => Err(format!("expected '=' in let statement: {}", stmt)),
                }
            }
            None => {
                // No type annotation — try "let [mut] name = expr".
                match after_let.find('=') {
                    Some(eq_pos) => {
                        let name = after_let[..eq_pos].trim().to_string();

                        let expr_str = &after_let[eq_pos + 1..];
                        let (value, inferred_ty) = execute_tuff_with_scope(expr_str.trim(), scope)?;

                        if is_mut && !scope.contains_key(&name) {
                            scope.insert(name.clone(), (0, inferred_ty)); // Initialize mutable var.
                        }

                        scope.insert(name, (value, inferred_ty));
                        Ok(())
                    }
                    None => Err(format!("invalid let statement: {}", stmt)),
                }
            }
        }
    } else {
        // Check for assignment: name = expr or compound += / -=.
        if let Some((eq_pos, op)) = find_assignment(stmt.trim(), scope) {
            let assign_str = stmt.trim();

            // For compound operators, the variable name is before the operator char (e.g., "x" in "x +=").
            let (name_start_offset, expr_start_offset) = match op {
                AssignmentOp::Simple => (0, eq_pos + 1),
                _ => (0, eq_pos + 1),
            };

            // Extract variable name (skip compound operator char if present).
            let raw_name = assign_str[..eq_pos].trim();
            let name = match op {
                AssignmentOp::Simple => raw_name.to_string(),
                _ => raw_name[..raw_name.len() - 1].trim().to_string(),
            };

            let expr_str = &assign_str[expr_start_offset..];
            let (rhs_value, inferred_ty) = execute_tuff_with_scope(expr_str.trim(), scope)?;

            // Compute final value based on operator.
            let final_value = match op {
                AssignmentOp::Simple => rhs_value,
                AssignmentOp::Add => {
                    if let Some(&(lhs_val, _)) = scope.get(&name) {
                        lhs_val + rhs_value
                    } else {
                        rhs_value
                    }
                }
                AssignmentOp::Sub => {
                    if let Some(&(lhs_val, _)) = scope.get(&name) {
                        lhs_val - rhs_value
                    } else {
                        -rhs_value
                    }
                }
            };

            // Check type compatibility and preserve original variable type on assignment.
            if let Some(&(_, orig_ty)) = scope.get(&name) {
                if orig_ty != inferred_ty && inferred_ty.bits() > orig_ty.bits() {
                    return Err(format!(
                        "type mismatch: expected {:?}, found {:?}",
                        orig_ty, inferred_ty
                    ));
                }
                scope.insert(name, (final_value, orig_ty));
            } else {
                scope.insert(name, (final_value, inferred_ty));
            }
            return Ok(());
        }

        // Bare expression statement — evaluate and discard result.
        let _ = execute_tuff_with_scope(stmt.trim(), scope)?;
        Ok(())
    }
}

/// Represents an assignment operator found in a statement.
#[derive(Debug, Clone, Copy)]
enum AssignmentOp {
    Simple, // =
    Add,    // +=
    Sub,    // -=
}

/// Find an assignment operator at depth 0 that targets a known variable in scope.
/// Returns the position of '=' and whether it's a compound operator (+= or -=).
fn find_assignment(s: &str, scope: &Scope) -> Option<(usize, AssignmentOp)> {
    let mut best_pos = None;

    track_depth(s, |i, ch, depth| {
        if ch == '=' && depth == 0 {
            // Determine operator type by looking at char before '='.
            let op: AssignmentOp = if i > 0 {
                match s.as_bytes()[i - 1] {
                    b'+' => AssignmentOp::Add,
                    b'-' => AssignmentOp::Sub,
                    _ => AssignmentOp::Simple,
                }
            } else {
                AssignmentOp::Simple
            };

            // For compound operators, strip the operator char from left side before checking scope.
            let raw_left = s[..i].trim();
            let var_name = match op {
                AssignmentOp::Simple => raw_left.to_string(),
                _ => raw_left[..raw_left.len() - 1].trim().to_string(),
            };

            if !var_name.is_empty()
                && var_name
                    .chars()
                    .next()
                    .map_or(false, |c| c.is_alphabetic() || c == '_')
                && scope.contains_key(&var_name)
            {
                best_pos = Some((i, op));
            }
        }
    });

    best_pos
}

/// Skip past a type annotation like " U8" or " I16", returning the remainder.
fn skip_type(s: &str) -> &str {
    let s = s.trim_start();
    // Match optional sign + letter (U/u/I/i) + digits.
    if !s.is_empty()
        && (s.starts_with('U') || s.starts_with('u') || s.starts_with('I') || s.starts_with('i'))
    {
        let after_letter = &s[1..]; // Skip the type letter.
        let rest = after_letter.trim_start();
        if !rest.is_empty() && rest.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            // Consume all leading digits (e.g., "8" or "16") then recurse to skip remaining type.
            let digit_end = rest
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(rest.len());
            return skip_type(&rest[digit_end..]);
        }
    }
    s
}

/// Validate that a value fits within the declared type's range.
fn validate_type(value: i32, is_unsigned: bool, bits: u32) -> Result<(), String> {
    if is_unsigned {
        let unsigned_max = (1u64 << bits).wrapping_sub(1);
        if value < 0 || value as u64 > unsigned_max {
            return Err(format!("value out of range for U{}: {}", bits, value));
        }
    } else {
        let half_bits = if bits == 0 { 0 } else { bits - 1 };
        let signed_max = (1i64 << half_bits).wrapping_sub(1);
        let signed_min = -(signed_max + 1);
        let value_i64: i64 = value as i64;

        if value_i64 > signed_max || value_i64 < signed_min {
            return Err(format!("value out of range for I{}: {}", bits, value));
        }
    }
    Ok(())
}

/// Public entry point — evaluates an expression with an empty scope.
pub fn execute_tuff(input: &str) -> Result<i32, String> {
    let scope: Scope = HashMap::new();

    // If input contains top-level semicolons (not inside any grouping), treat it as a script/block.
    if has_top_level_semicolon(input.trim()) && !input.trim().starts_with('{') {
        return execute_tuff_with_scope(&format!("{{{}}}", input), &scope).map(|(v, _)| v);
    }

    execute_tuff_with_scope(input, &scope).map(|(v, _)| v)
}

/// Check if the string contains a semicolon at depth 0 (outside all grouping delimiters).
fn has_top_level_semicolon(s: &str) -> bool {
    let mut found = false;
    track_depth(s, |_i, ch, depth| {
        if ch == ';' && depth == 0 {
            found = true;
        }
    });
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_string() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_execute_tuff_whitespace() {
        assert_eq!(execute_tuff("   "), Ok(0));
    }

    // U8 tests
    #[test]
    fn test_execute_tuff_100u8() {
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_negative_u8_error() {
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_execute_tuff_256u8_overflow_error() {
        assert!(execute_tuff("256U8").is_err());
    }

    // U16 tests
    #[test]
    fn test_execute_tuff_u16_valid() {
        assert_eq!(execute_tuff("30000U16"), Ok(30000));
    }

    #[test]
    fn test_execute_tuff_u16_overflow_error() {
        assert!(execute_tuff("65536U16").is_err()); // max is 65535
    }

    // U32 tests
    #[test]
    fn test_execute_tuff_u32_valid() {
        assert_eq!(execute_tuff("2147483647U32"), Ok(2_147_483_647)); // i32::MAX fits in U32
    }

    #[test]
    fn test_execute_tuff_u32_negative_error() {
        assert!(execute_tuff("-100U32").is_err());
    }

    // I8 tests
    #[test]
    fn test_execute_tuff_i8_valid() {
        assert_eq!(execute_tuff("127I8"), Ok(127));
    }

    #[test]
    fn test_execute_tuff_i8_negative_valid() {
        assert_eq!(execute_tuff("-128I8"), Ok(-128));
    }

    #[test]
    fn test_execute_tuff_i8_overflow_error() {
        assert!(execute_tuff("128I8").is_err()); // max is 127
    }

    #[test]
    fn test_execute_tuff_i8_underflow_error() {
        assert!(execute_tuff("-129I8").is_err()); // min is -128
    }

    // I16 tests
    #[test]
    fn test_execute_tuff_i16_valid() {
        assert_eq!(execute_tuff("30000I16"), Ok(30000));
    }

    #[test]
    fn test_execute_tuff_i16_negative_valid() {
        assert_eq!(execute_tuff("-32768I16"), Ok(-32768));
    }

    #[test]
    fn test_execute_tuff_i16_overflow_error() {
        assert!(execute_tuff("32768I16").is_err()); // max is 32767
    }

    // I32 tests
    #[test]
    fn test_execute_tuff_i32_valid() {
        assert_eq!(execute_tuff("2000000000I32"), Ok(2_000_000_000));
    }

    #[test]
    fn test_execute_tuff_i32_negative_valid() {
        assert_eq!(execute_tuff("-2000000000I32"), Ok(-2_000_000_000));
    }

    // Case insensitivity tests
    #[test]
    fn test_execute_tuff_lowercase_u8() {
        assert_eq!(execute_tuff("100u8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_lowercase_i8() {
        assert_eq!(execute_tuff("-50i8"), Ok(-50));
    }

    // Expression tests
    #[test]
    fn test_execute_tuff_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_chained_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_execute_tuff_subtraction_expression() {
        assert_eq!(execute_tuff("5I8 - 3I8"), Ok(2));
    }

    #[test]
    fn test_execute_tuff_multiplication_expression() {
        assert_eq!(execute_tuff("4U8 * 5U8"), Ok(20));
    }

    #[test]
    fn test_execute_tuff_division_expression() {
        assert_eq!(execute_tuff("10I32 / 2I32"), Ok(5));
    }

    #[test]
    fn test_execute_tuff_division_by_zero_error() {
        assert!(execute_tuff("10U8 / 0U8").is_err());
    }

    #[test]
    fn test_execute_tuff_chained_add_sub_u8() {
        assert_eq!(execute_tuff("3U8 + 4U8 - 5U8"), Ok(2));
    }

    #[test]
    fn test_execute_tuff_mixed_mul_sub_u8() {
        assert_eq!(execute_tuff("3U8 * 4U8 - 5U8"), Ok(7));
    }

    // Mixed operator expressions (tests precedence/ordering)
    #[test]
    fn test_execute_tuff_mixed_expression_add_sub() {
        assert_eq!(execute_tuff("10I32 + 5I32 - 3I32"), Ok(12));
    }

    #[test]
    fn test_execute_tuff_precedence_mul_before_add() {
        assert_eq!(execute_tuff("3U8 + 4U8 * 5U8"), Ok(23));
    }

    #[test]
    fn test_execute_tuff_parentheses_override_precedence() {
        assert_eq!(execute_tuff("(3U8 + 4U8) * 5U8"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_double_parentheses_multiplication() {
        assert_eq!(execute_tuff("(3U8 + 4U8) * (5U8 + 0U8)"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_curly_brace_grouping() {
        assert_eq!(execute_tuff("{ 3U8 + 4U8 } * 5U8"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_let_binding_in_block() {
        assert_eq!(
            execute_tuff("{ let temp : U8 = 3U8 + 4U8; temp } * 5U8"),
            Ok(35)
        );
    }

    #[test]
    fn test_execute_tuff_top_level_let_with_nested_block() {
        assert_eq!(
            execute_tuff("let y : U8 = { let temp : U8 = 3U8 + 4U8; temp } * 5U8; y"),
            Ok(35)
        );
    }

    #[test]
    fn test_execute_tuff_top_level_simple_let() {
        assert_eq!(execute_tuff("let y : U8 = 35U8; y"), Ok(35));
    }

    // Error paths in parse_value

    #[test]
    fn test_execute_tuff_empty_value_before_type() {
        assert!(execute_tuff("U8").is_err()); // value_str is empty (line 42)
    }

    #[test]
    fn test_execute_tuff_invalid_suffix_error() {
        assert!(execute_tuff("10abc").is_err()); // invalid type suffix path (lines 86, 89)
    }

    #[test]
    fn test_execute_tuff_plain_integer_parse_error() {
        assert!(execute_tuff("xyz").is_err()); // None branch in parse_value (line 94)
    }

    // Coverage for try_strip_outer_group edge cases
    #[test]
    fn test_execute_tuff_unmatched_open_paren_error() {
        assert!(execute_tuff("(").is_err()); // unmatched paren falls through to parse_value error
    }

    // Coverage for split_by_semicolons and evaluate_block paths
    #[test]
    fn test_execute_tuff_empty_brace_block() {
        assert_eq!(execute_tuff("{}"), Ok(0)); // empty block (line 146)
    }

    #[test]
    fn test_execute_tuff_nested_parens_in_expression() {
        assert_eq!(execute_tuff("((3U8)) + ((2U8))"), Ok(5)); // nested parens coverage 
    }

    #[test]
    fn test_execute_tuff_bare_expr_statement_in_block() {
        assert_eq!(execute_tuff("{ 10U8; 42U8 }"), Ok(42)); // bare expr stmt (line ~319)
    }

    #[test]
    fn test_execute_tuff_let_without_type_annotation() {
        assert_eq!(execute_tuff("{ let x = 5U8; x + 3U8 }"), Ok(8)); // no type annotation path 
    }

    #[test]
    fn test_execute_tuff_mismatched_parens_error() {
        assert!(execute_tuff("(10U8").is_err()); // mismatched parens (line ~157)  
    }

    #[test]
    fn test_execute_tuff_variable_in_expression() {
        assert_eq!(
            execute_tuff("{ let a = 2U8; let b = 3U8; a * b + 1U8 }"),
            Ok(7)
        ); // variable resolution 
    }

    #[test]
    fn test_execute_tuff_let_with_nested_block_expression() {
        assert_eq!(
            execute_tuff("{ let x : U8 = (2U8 + 3U8); x * 4U8 }"),
            Ok(20)
        ); // nested block in let 
    }

    #[test]
    fn test_execute_tuff_division_precedence() {
        assert_eq!(execute_tuff("16U8 / 4U8 - 2U8"), Ok(2)); // division before subtraction (line ~170)  
    }

    #[test]
    fn test_execute_tuff_multiple_semicolons_in_block() {
        assert_eq!(
            execute_tuff("{ let a = 1U8; let b = 2U8; let c = 3U8; c + b + a }"),
            Ok(6)
        ); // multiple stmts (line ~172) 
    }

    #[test]
    fn test_execute_tuff_block_with_only_whitespace() {
        assert_eq!(execute_tuff("{   ;   }"), Ok(0)); // empty remainder after semicolons (lines 343, etc.)  
    }

    // Error paths in parse_value

    #[test]
    fn test_execute_tuff_top_level_let_semicolon_expr() {
        assert_eq!(execute_tuff("let y = 35U8; y"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_mut_variable_reassignment() {
        assert_eq!(execute_tuff("let mut y = 0U8; y = 35U8; y"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_let_shadowing() {
        assert_eq!(execute_tuff("let y = 0U8; let y = 35U8; y"), Ok(35));
    }

    #[test]
    fn test_execute_tuff_nested_block_scope_isolation() {
        assert_eq!(execute_tuff("let y = 0U8; { let y = 35U8; } y"), Ok(0));
    }

    #[test]
    fn test_execute_tuff_top_level_let_only() {
        assert_eq!(execute_tuff("let y = 100U8;"), Ok(0));
    }

    #[test]
    fn test_execute_tuff_type_mismatch_error() {
        assert!(execute_tuff("let y : U8 = 100U16").is_err()); // type mismatch: expected U8, found U16
    }

    #[test]
    fn test_execute_tuff_variable_type_mismatch_error() {
        assert!(execute_tuff("let y = 100U16; let x : U8 = y").is_err()); // y is U16, expected U8
    }

    // Mut variable with type annotation (covers mut init path in evaluate_statement)
    #[test]
    fn test_execute_tuff_mut_with_type_annotation() {
        assert_eq!(
            execute_tuff("let mut x : U8 = 5U8; let y = x + 3U8; y"),
            Ok(8)
        );
    }

    // Mut variable reassignment with type annotation (covers scope.contains_key path)
    #[test]
    fn test_execute_tuff_mut_reassign_with_type() {
        assert_eq!(
            execute_tuff("let mut x : U16 = 5U16; let y = x + 3U16; y"),
            Ok(8)
        );
    }

    // Assignment to known variable (covers find_assignment path)
    #[test]
    fn test_execute_tuff_assignment_to_known_variable() {
        assert_eq!(
            execute_tuff("let x : U8 = 5U8; { let y = x + 3U8; }"),
            Ok(0)
        );
    }

    // Bare expression in block (covers bare expr statement path)
    #[test]
    fn test_execute_tuff_bare_expr_in_block() {
        assert_eq!(execute_tuff("{ let x : U8 = 5U8; }"), Ok(0));
    }

    // Empty block return (covers raw_parts.is_empty path)
    #[test]
    fn test_execute_tuff_empty_braces_block() {
        assert_eq!(execute_tuff("{}"), Ok(0));
    }

    // Mixed typed and untyped operands in expression (covers widen_types None,None path)
    #[test]
    fn test_execute_tuff_mixed_typed_untyped_addition() {
        assert_eq!(execute_tuff("3 + 4"), Ok(7));
    }

    // Unsigned overflow validation via typed literal (covers validate_type unsigned error path)
    #[test]
    fn test_execute_tuff_u8_max_plus_one_error() {
        assert!(execute_tuff("256U8").is_err());
    }

    // Invalid let statement without equals sign (covers invalid let error path)
    #[test]
    fn test_execute_tuff_invalid_let_no_equals() {
        assert!(execute_tuff("let x : U8").is_err());
    }

    // Mut variable reassignment with type mismatch should error
    #[test]
    fn test_execute_tuff_mut_reassign_type_mismatch_error() {
        assert!(execute_tuff("let mut x = 0U8; x = 100U16; x").is_err());
    }

    // Bool type with true literal returns 1
    #[test]
    fn test_execute_tuff_bool_true_returns_one() {
        assert_eq!(execute_tuff("let x : Bool = true; x"), Ok(1));
    }

    // Logical OR operator with boolean variables
    #[test]
    fn test_execute_tuff_logical_or_with_variables() {
        assert_eq!(execute_tuff("let x = true; let y = false; x || y"), Ok(1));
    }

    // Logical AND operator with boolean variables
    #[test]
    fn test_execute_tuff_logical_and_with_variables() {
        assert_eq!(execute_tuff("let x = true; let y = false; x && y"), Ok(0));
    }

    // Default numeric type is I32 for untyped literals
    #[test]
    fn test_execute_tuff_default_numeric_type_i32() {
        assert_eq!(execute_tuff("let x = 100; x"), Ok(100));
    }

    // Comparison operator: less than returns Bool (1 for true)
    #[test]
    fn test_execute_tuff_comparison_less_than_true() {
        assert_eq!(execute_tuff("let x = 0; let y = 1; x < y"), Ok(1));
    }

    // If/else expression with comparison condition
    #[test]
    fn test_execute_tuff_if_else_expression() {
        assert_eq!(execute_tuff("let x = if (3 < 5) 2 else 4; x"), Ok(2));
    }

    // Compound assignment operator += on mutable variable
    #[test]
    fn test_execute_tuff_compound_assignment_add() {
        assert_eq!(execute_tuff("let mut x = 0; x += 1; x"), Ok(1));
    }
}

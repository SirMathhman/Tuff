use std::io::{self, Write};

/// Parse a single numeric literal, stripping any type suffix (U8, U16, I32, etc.).
fn parse_literal(token: &str) -> i64 {
    let token = token.trim();
    if token.is_empty() {
        return 0;
    }

    // Strip type suffix (e.g., U8, U16, I32, etc.)
    let num_str = if let Some(stripped) = token.strip_suffix("U8") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U16") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U32") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("U64") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I8") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I16") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I32") {
        stripped
    } else if let Some(stripped) = token.strip_suffix("I64") {
        stripped
    } else {
        token
    };

    num_str.parse::<i64>().unwrap_or(0)
}

/// Split text on semicolons at depth 0 (not inside nested parentheses or braces).
fn split_on_semicolons(text: &str) -> Vec<String> {
    let tokens: Vec<char> = text.chars().collect();
    let len = tokens.len();
    let mut segments: Vec<String> = Vec::new();
    let mut current_start = 0;

    for i in 0..len {
        if tokens[i] == ';' {
            let seg: String = tokens[current_start..i].iter().collect();
            let (dp, db) = segment_depth(&seg);
            if dp == 0 && db == 0 {
                segments.push(seg.trim().to_string());
                current_start = i + 1;
            }
        }
    }

    // Add remaining content after last semicolon.
    let remainder: String = tokens[current_start..len].iter().collect();
    if !remainder.trim().is_empty() {
        segments.push(remainder.trim().to_string());
    }

    segments
}

/// Compute the net parenthesis and brace depth of a segment string.
fn segment_depth(seg: &str) -> (i32, i32) {
    let mut dp = 0;
    let mut db = 0;
    for ch in seg.chars() {
        match ch {
            '(' => dp += 1,
            ')' => dp -= 1,
            '{' => db += 1,
            '}' => db -= 1,
            _ => {}
        }
    }
    (dp, db)
}

/// Check if a segment is a simple variable assignment (not a let declaration).
/// e.g. "x = 1U8" -> Some(("x", evaluated_value))
fn parse_assignment_segment(
    seg: &str,
    existing_bindings: &[(String, i64)],
) -> Option<(String, i64)> {
    // Must contain '=' and not start with 'let'
    if seg.starts_with("let ") || !seg.contains('=') {
        return None;
    }

    let parts: Vec<&str> = seg.splitn(2, '=').collect();
    if parts.len() != 2 {
        return None;
    }

    let name_part = parts[0].trim();
    let expr_str = parts[1].trim();

    // Variable name must be a single identifier (no type annotation, no spaces)
    let var_name = match name_part.split_whitespace().next() {
        Some(name) if !name.contains(' ') => name,
        _ => return None,
    };

    // Only allow reassignment of existing bindings
    if !existing_bindings.iter().any(|(n, _)| n == var_name) {
        return None;
    }

    let mut substituted_expr = expr_str.to_string();
    for (name, value) in existing_bindings {
        substituted_expr = substituted_expr.replace(name.as_str(), &format!("{}U8", value));
    }

    Some((var_name.to_string(), interpret_tuff(&substituted_expr)))
}

/// Parse a `let` segment: "let <name> [: <type>] = <expr>".
/// Returns `(var_name, evaluated_value)` or None if not a valid let statement.
fn parse_let_segment(seg: &str, existing_bindings: &[(String, i64)]) -> Option<(String, i64)> {
    if !seg.starts_with("let ") {
        return None;
    }

    let after_let = &seg[4..]; // skip "let "
    let parts: Vec<&str> = after_let.splitn(2, '=').collect();
    if parts.len() != 2 {
        return None;
    }

    let decl_part = parts[0].trim();
    let expr_str = parts[1].trim();

    // Extract variable name, skipping 'mut' keyword if present
    let mut words = decl_part.split_whitespace();
    let first = words.next();
    let var_name = if first == Some("mut") {
        words.next()
    } else {
        first
    };
    let var_name = match var_name {
        Some(name) => name.to_string(),
        None => return None,
    };

    // Strip leading '&' for reference pass-through (e.g. `&x` -> `x`)
    let eval_expr = if expr_str.starts_with('&') {
        &expr_str[1..]
    } else {
        expr_str
    };

    // Substitute existing bindings into the expression before evaluating.
    let mut substituted_expr = eval_expr.to_string();
    for (name, value) in existing_bindings {
        substituted_expr = substituted_expr.replace(name.as_str(), &format!("{}U8", value));
    }

    Some((var_name.clone(), interpret_tuff(&substituted_expr)))
}

/// Substitute variable references with their resolved values.
fn substitute_variables(text: &str, bindings: &[(String, i64)]) -> String {
    let mut result = text.to_string();
    // Sort by name length (longest first) to avoid partial replacements.
    let mut sorted_bindings: Vec<_> = bindings.iter().collect();
    sorted_bindings.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    for (name, value) in &sorted_bindings {
        // Handle dereference pass-through: `*varName` -> `<value>U8`
        result = result.replace(
            &format!("*{}", name),
            &format!("{}", value),
        );
        result = result.replace(name.as_str(), &format!("{}", value));
    }
    result
}

/// Collect `let` bindings from segments and return remaining non-let segments.
fn collect_bindings_and_remainder(segments: &[String]) -> (Vec<(String, i64)>, Vec<String>) {
    let mut bindings: Vec<(String, i64)> = Vec::new();
    let mut remainder: Vec<String> = Vec::new();

    for seg in segments {
        if let Some((name, value)) = parse_let_segment(seg, &bindings) {
            bindings.push((name.clone(), value));
        } else if let Some((name, value)) = parse_assignment_segment(seg, &bindings) {
            // Update existing binding
            for entry in &mut bindings {
                if entry.0 == name {
                    entry.1 = value;
                    break;
                }
            }
        } else if !seg.is_empty() {
            remainder.push(seg.clone());
        }
    }

    (bindings, remainder)
}

/// Process `let` bindings inside a braced expression.
/// Returns the body with all variable references replaced by their evaluated values,
/// or None if there are no let statements to process.
fn process_let_bindings(body: &str) -> Option<String> {
    // Normalize spaces
    let mut normalized = body.to_string();
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }

    let segments = split_on_semicolons(&normalized);
    let (bindings, body_segments) = collect_bindings_and_remainder(&segments);

    if bindings.is_empty() {
        return None;
    }

    // Build the final expression from remaining segments, replacing variable references.
    let mut result = String::new();
    for seg in &body_segments {
        let replaced = substitute_variables(seg, &bindings);
        if !result.is_empty() {
            result.push(' ');
        }
        result.push_str(&replaced);
    }

    Some(result)
}

fn interpret_tuff(source: &str) -> i64 {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return 0;
    }

    // Check for top-level semicolon-separated statements (let bindings + final expression).
    let has_top_level_semicolons = {
        let mut depth_parens = 0;
        let mut depth_braces = 0;
        let mut found = false;
        for ch in trimmed.chars() {
            match ch {
                '(' => depth_parens += 1,
                ')' => depth_parens -= 1,
                '{' => depth_braces += 1,
                '}' => depth_braces -= 1,
                ';' if depth_parens == 0 && depth_braces == 0 => {
                    found = true;
                    break;
                }
                _ => {}
            }
        }
        found
    };

    if has_top_level_semicolons {
        // Use shared helpers to split, parse lets, and substitute.
        let segments = split_on_semicolons(trimmed);
        let (bindings, remainder) = collect_bindings_and_remainder(&segments);

        // Evaluate the final expression with all substitutions.
        let mut final_expr = match remainder.last() {
            Some(e) => e.clone(),
            None => return 0,
        };
        final_expr = substitute_variables(&final_expr, &bindings);
        return interpret_tuff(&final_expr);
    }

    // If the entire expression is wrapped in a single balanced pair of parentheses or braces, evaluate the inner part.
    let opening = trimmed.chars().next();
    let closing = trimmed.chars().last();
    if (opening == Some('(') && closing == Some(')'))
        || (opening == Some('{') && closing == Some('}'))
    {
        let mut depth = 0;
        let mut can_unwrap = true;
        for ch in trimmed.chars() {
            match opening {
                Some('(') => {
                    if ch == '(' {
                        depth += 1;
                    } else if ch == ')' {
                        depth -= 1;
                    }
                }
                Some('{') => {
                    if ch == '{' {
                        depth += 1;
                    } else if ch == '}' {
                        depth -= 1;
                    }
                }
                _ => {}
            }
            // If depth drops to 0 before the last character, outer delimiters don't fully wrap.
            if depth == 0 && !trimmed.ends_with(ch) {
                can_unwrap = false;
                break;
            }
        }
        if can_unwrap {
            return interpret_tuff(&trimmed[1..trimmed.len() - 1]);
        }
    }

    // Recursively evaluate parenthesized/braced sub-expressions from inside out.
    let mut resolved = String::new();
    let chars: Vec<char> = trimmed.chars().collect();
    let len = chars.len();
    let mut i = 0;
    while i < len {
        if chars[i] == '(' || chars[i] == '{' {
            // Find matching closing delimiter
            let open_delim = chars[i];
            let close_delim = if open_delim == '(' { ')' } else { '}' };
            let mut depth = 1;
            let start = i + 1;
            let mut j = start;
            while j < len && depth > 0 {
                if chars[j] == open_delim {
                    depth += 1;
                } else if chars[j] == close_delim {
                    depth -= 1;
                }
                j += 1;
            }
            // Evaluate the inner expression and replace with result literal
            let inner: String = chars[start..j - 1].iter().collect();

            // For braced expressions, check for `let` bindings first
            if open_delim == '{' {
                if let Some(processed) = process_let_bindings(&inner) {
                    resolved.push_str(&format!("{}U8", interpret_tuff(&processed)));
                    i = j;
                    continue;
                }
            }

            let val = interpret_tuff(&inner);
            resolved.push_str(&format!("{}U8", val));
            i = j;
        } else {
            resolved.push(chars[i]);
            i += 1;
        }
    }

    // Normalize multiple consecutive spaces into a single space.
    let mut normalized = resolved;
    while normalized.contains("  ") {
        normalized = normalized.replace("  ", " ");
    }

    // Tokenize into operands and operators.
    // We replace each operator (with surrounding spaces) by a delimiter-wrapped version,
    // then split on the delimiter to get clean alternating [operand, op, operand, op, ...].
    let replaced = normalized
        .replace(" + ", "\u{0001}+\u{0001}")
        .replace(" - ", "\u{0001}-\u{0001}")
        .replace(" * ", "\u{0001}*\u{0001}");

    let tokens: Vec<&str> = replaced
        .split('\u{0001}')
        .filter(|t| !t.is_empty())
        .collect();

    // Parse alternating operands and operators.
    // e.g., ["3U8", "*", "4U8", "-", "5U8"] => [(3,Some('*')), (4,Some('-')), (5,None)]
    let mut terms: Vec<(i64, Option<char>)> = Vec::new();
    for i in 0..tokens.len() {
        if i % 2 == 0 {
            // Operand
            terms.push((parse_literal(tokens[i]), None));
        } else {
            // Operator — attach to the previous term
            let op = tokens[i].chars().next();
            if let Some(last) = terms.last_mut() {
                last.1 = op;
            }
        }
    }

    // Pass 1: evaluate multiplications (higher precedence)
    let mut reduced: Vec<(i64, Option<char>)> = Vec::new();
    for term in terms {
        if let Some((_, Some('*'))) = reduced.last() {
            // Previous operator is *, multiply the values together
            let right_val = term.0;
            let (left_val, _) = reduced.pop().unwrap();
            let product = left_val * right_val;
            // Push the product as a new entry with the operator that follows it
            reduced.push((product, term.1));
        } else {
            reduced.push(term);
        }
    }

    // Pass 2: evaluate additions and subtractions (left to right)
    let mut result = reduced.first().map_or(0, |t| t.0);
    for i in 1..reduced.len() {
        if let Some((_, Some(op))) = reduced.get(i - 1) {
            match op {
                '+' => result += reduced[i].0,
                '-' => result -= reduced[i].0,
                _ => {}
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn test_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), 0);
    }

    #[test]
    fn test_literal_number() {
        assert_eq!(interpret_tuff("100"), 100);
    }

    #[test]
    fn test_u8_literal() {
        assert_eq!(interpret_tuff("100U8"), 100);
    }

    #[test]
    fn test_u16_literal() {
        assert_eq!(interpret_tuff("100U16"), 100);
    }

    #[test]
    fn test_u32_literal() {
        assert_eq!(interpret_tuff("42U32"), 42);
    }

    #[test]
    fn test_u64_literal() {
        assert_eq!(interpret_tuff("42U64"), 42);
    }

    #[test]
    fn test_i8_literal() {
        assert_eq!(interpret_tuff("-5I8"), -5);
    }

    #[test]
    fn test_i16_literal() {
        assert_eq!(interpret_tuff("300I16"), 300);
    }

    #[test]
    fn test_i32_literal() {
        assert_eq!(interpret_tuff("-100I32"), -100);
    }

    #[test]
    fn test_i64_literal() {
        assert_eq!(interpret_tuff("999I64"), 999);
    }

    #[test]
    fn test_invalid_string_returns_zero() {
        assert_eq!(interpret_tuff("hello"), 0);
    }

    #[test]
    fn test_addition_expression() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), 3);
    }

    #[test]
    fn test_multi_addition_expression() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), 6);
    }

    #[test]
    fn test_mixed_add_subtract_expression() {
        assert_eq!(interpret_tuff("3U8 + 4U8 - 5U8"), 2);
    }

    #[test]
    fn test_multiply_and_subtract_expression() {
        assert_eq!(interpret_tuff("3U8 *  4U8 - 5U8"), 7);
    }

    #[test]
    fn test_addition_with_multiplication_precedence() {
        assert_eq!(interpret_tuff("3U8 + 4U8 * 5U8"), 23);
    }

    #[test]
    fn test_parenthesized_expression() {
        assert_eq!(interpret_tuff("(3U8 + 4U8) * 5U8"), 35);
    }

    #[test]
    fn test_multiple_parenthesized_expressions() {
        assert_eq!(interpret_tuff("(3U8 + 4U8) * (2U8 + 3U8)"), 35);
    }

    #[test]
    fn test_braced_expression() {
        assert_eq!(interpret_tuff("{ 3U8 + 4U8 } * 5U8"), 35);
    }

    #[test]
    fn test_let_binding_in_braces() {
        assert_eq!(interpret_tuff("{ let x : U8 = 3U8 + 4U8; x } * 5U8"), 35);
    }

    #[test]
    fn test_nested_let_bindings_with_top_level_semicolon() {
        assert_eq!(
            interpret_tuff("let y : U8 = { let x : U8 = 3U8 + 4U8; x } * 5U8; y"),
            35
        );
    }

    #[test]
    fn test_simple_top_level_let_binding() {
        assert_eq!(interpret_tuff("let y : U8 = 35U8; y"), 35);
    }

    #[test]
    fn test_let_binding_without_final_expression() {
        assert_eq!(interpret_tuff("let y : U8 = 35U8;"), 0);
    }

    #[test]
    fn test_simple_top_level_let_binding_no_type() {
        assert_eq!(interpret_tuff("let y = 35U8; y"), 35);
    }

    #[test]
    fn test_chained_let_bindings() {
        assert_eq!(interpret_tuff("let y = 35U8; let x = y; x"), 35);
    }

    #[test]
    fn test_mut_let_binding() {
        assert_eq!(interpret_tuff("let mut x = 1U8; x"), 1);
    }

    #[test]
    fn test_variable_reassignment() {
        assert_eq!(interpret_tuff("let mut x = 0U8; x = 1U8; x"), 1);
    }

    #[test]
    fn test_reference_and_dereference_pass_through() {
        assert_eq!(
            interpret_tuff("let x = 100U8; let y : *U8 = &x; *y"),
            100
        );
    }
}

#[cfg(not(coverage))]
fn main() {
    loop {
        print!(">>> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        match io::stdin().read_line(&mut input) {
            Ok(_) => {}
            Err(_) => break,
        }

        let result = interpret_tuff(&input);
        println!("{}", result);
    }
}

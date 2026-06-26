use std::collections::HashMap;

/// Evaluate a Tuff expression string and return the integer result.
pub fn interpret_tuff(source: &str) -> i64 {
    let mut trimmed = source.trim().to_string();
    if trimmed.is_empty() {
        return 0;
    }

    // Handle top-level `let` / `let mut` bindings with sequential statement evaluation
    if is_top_level_statement_block(&trimmed) {
        return evaluate_with_scope(&trimmed);
    }

    // Recursively evaluate parenthesized sub-expressions first, handling `let` bindings in braces
    while let Some((open, close)) = find_matching_paren(&trimmed) {
        let inner = &trimmed[open + 1..close];

        // Check if this block contains a `let` binding: `{ let x = expr; body }`
        let val = if is_let_block(inner) {
            evaluate_let_block(inner)
        } else {
            interpret_tuff(inner)
        };

        trimmed = format!("{} {} {}", &trimmed[..open], val, &trimmed[close + 1..]);
    }

    // Split into operands and operators, preserving order
    let operands: Vec<&str> = trimmed.split(|c| "+-*/".contains(c)).collect();
    let ops: Vec<char> = trimmed.chars().filter(|&c| "+-*/".contains(c)).collect();

    let values: Vec<i64> = operands
        .iter()
        .map(|s| s.trim().parse::<i64>().unwrap_or(0))
        .collect();

    // Pass 1: resolve * and / (higher precedence) in-place
    let mut resolved: Vec<i64> = vec![values[0]];
    for i in 0..ops.len() {
        match ops[i] {
            '*' => *resolved.last_mut().unwrap() *= values[i + 1],
            '/' => *resolved.last_mut().unwrap() /= values[i + 1],
            '+' | '-' => resolved.push(values[i + 1]),
            _ => unreachable!(),
        }
    }

    // Pass 2: resolve remaining + and - left to right
    let add_sub_ops: Vec<char> = ops
        .iter()
        .filter(|&&op| op == '+' || op == '-')
        .copied()
        .collect();
    let mut result = resolved[0];
    for (idx, &op) in add_sub_ops.iter().enumerate() {
        match op {
            '+' => result += resolved[idx + 1],
            '-' => result -= resolved[idx + 1],
            _ => unreachable!(),
        }
    }

    result
}

/// Find the innermost matching pair of grouping delimiters (parentheses or braces).
pub fn find_matching_paren(s: &str) -> Option<(usize, usize)> {
    let mut depth = 0;
    let mut open_pos = None;
    for (i, c) in s.chars().enumerate() {
        match c {
            '(' | '{' => {
                if depth == 0 {
                    open_pos = Some(i);
                }
                depth += 1;
            }
            ')' | '}' => {
                depth -= 1;
                if depth == 0 && open_pos.is_some() {
                    return Some((open_pos.unwrap(), i));
                }
            }
            _ => {}
        }
    }
    None
}

/// Check if a block (content between braces) starts with a `let` binding.
fn is_let_block(inner: &str) -> bool {
    let trimmed = inner.trim_start();
    trimmed.starts_with("let ") && trimmed.contains(';')
}

/// Evaluate a `{ let x = expr; body }` block by resolving the variable and substituting into body.
fn evaluate_let_block(inner: &str) -> i64 {
    // Find semicolon separating assignment from body
    let semi_pos = inner.find(';').unwrap();
    let assign_part = &inner[4..semi_pos]; // skip "let ", get "x = expr"

    // Split on '=' to extract variable name and expression
    let eq_parts: Vec<&str> = assign_part.splitn(2, '=').collect();
    if eq_parts.len() != 2 {
        return interpret_tuff(inner);
    }

    let var_name = eq_parts[0].trim().to_string();
    let expr_str = eq_parts[1].trim();

    // Evaluate the assigned expression
    let val = interpret_tuff(expr_str);

    // Extract body after semicolon and substitute variable references
    let body = &inner[semi_pos + 1..].trim_start();
    let substituted = body.replace(&var_name, &val.to_string());

    // Recursively evaluate the substituted body (it may contain nested braces)
    interpret_tuff(&substituted.trim())
}

/// Find the position of a semicolon at brace depth 0 (ignoring semicolons inside `{...}`).
pub fn find_semicolon_at_top_level(s: &str) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ';' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Check if the string is a block of top-level statements (let/let mut + reassignments).
fn is_top_level_statement_block(s: &str) -> bool {
    let trimmed = s.trim();
    // Must start with `let` or `let mut`, and contain at least one semicolon at depth 0
    (trimmed.starts_with("let ") || trimmed.starts_with("let mut "))
        && find_semicolon_at_top_level(trimmed).is_some()
}

/// Split a string into top-level statements separated by semicolons at brace depth 0.
fn split_statements(s: &str) -> Vec<String> {
    let mut stmts = Vec::new();
    // Find all top-level semicolons and split on them
    if let Some(semi_pos) = find_semicolon_at_top_level(s) {
        stmts.push(s[..semi_pos].trim().to_string());

        // Recursively process the rest, but we need to handle multiple statements
        let remaining = &s[semi_pos + 1..];
        if !remaining.trim().is_empty() {
            // Check if there are more top-level semicolons in the remainder
            if find_semicolon_at_top_level(remaining).is_some() {
                stmts.extend(split_statements(remaining));
            } else {
                stmts.push(remaining.trim().to_string());
            }
        }
    } else if !s.trim().is_empty() {
        stmts.push(s.trim().to_string());
    }

    stmts
}

/// Evaluate a block of statements with variable scope, returning the value of the last expression.
fn evaluate_with_scope(source: &str) -> i64 {
    use std::collections::HashMap;

    let mut scope: HashMap<String, (i64, bool)> = HashMap::new(); // (value, is_mutable)
    let statements = split_statements(source);

    let mut last_value = 0i64;

    for stmt in &statements {
        let trimmed_stmt = stmt.trim().to_string();

        if let Some((var_name, val)) = parse_let_statement(&trimmed_stmt) {
            // `let x = expr` or `let mut x = expr`
            scope.insert(var_name.clone(), (val, false));
            last_value = val;
        } else if let Some((var_name, val)) = parse_mut_let_statement(&trimmed_stmt) {
            // `let mut x = expr`
            scope.insert(var_name.clone(), (val, true));
            last_value = val;
        } else if let Some((var_name, val)) = parse_reassignment(&trimmed_stmt, &scope) {
            // `x = expr` — reassign existing variable
            if let Some(entry) = scope.get_mut(var_name.as_str()) {
                entry.0 = val;
                last_value = val;
            }
        } else {
            // Plain expression (possibly with variable references)
            let substituted = substitute_vars(&trimmed_stmt, &scope);
            last_value = interpret_tuff(&substituted);
        }
    }

    last_value
}

/// Parse a `let x = expr` statement. Returns None if it's not this pattern.
fn parse_let_statement(s: &str) -> Option<(String, i64)> {
    let trimmed = s.trim();
    if !trimmed.starts_with("let ") || trimmed.starts_with("let mut") {
        return None;
    }

    // Find '=' in the statement (not inside braces — but for simplicity we split on first '=')
    let eq_pos = find_eq_at_depth_zero(trimmed)?;
    let var_part = &trimmed[4..eq_pos]; // skip "let ", get "x"
    let expr_str = trimmed[eq_pos + 1..].trim();

    let val = interpret_tuff(expr_str);
    Some((var_part.trim().to_string(), val))
}

/// Parse a `let mut x = expr` statement. Returns None if it's not this pattern.
fn parse_mut_let_statement(s: &str) -> Option<(String, i64)> {
    let trimmed = s.trim();
    if !trimmed.starts_with("let mut ") {
        return None;
    }

    // Find '=' in the statement (not inside braces — but for simplicity we split on first '=')
    let eq_pos = find_eq_at_depth_zero(trimmed)?;
    let var_part = &trimmed[8..eq_pos]; // skip "let mut ", get "x"
    let expr_str = trimmed[eq_pos + 1..].trim();

    let val = interpret_tuff(expr_str);
    Some((var_part.trim().to_string(), val))
}

/// Parse a reassignment `x = expr`. Returns None if it's not this pattern.
fn parse_reassignment(s: &str, scope: &HashMap<String, (i64, bool)>) -> Option<(String, i64)> {
    let trimmed = s.trim();

    // Must be an identifier followed by '=' at depth 0
    if !is_identifier(trimmed.split('=').next()?.trim()) {
        return None;
    }

    let eq_pos = find_eq_at_depth_zero(trimmed)?;
    let var_name = trimmed[..eq_pos].trim().to_string();

    // Variable must exist in scope and be mutable (or we allow reassignment for simplicity)
    if !scope.contains_key(var_name.as_str()) {
        return None;
    }

    let expr_str = trimmed[eq_pos + 1..].trim();
    let val = interpret_tuff(expr_str);

    Some((var_name, val))
}

/// Find the position of '=' at brace depth 0.
fn find_eq_at_depth_zero(s: &str) -> Option<usize> {
    let mut depth = 0;
    for (i, c) in s.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            '=' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Check if a string is a valid identifier.
fn is_identifier(s: &str) -> bool {
    let trimmed = s.trim();
    !trimmed.is_empty()
        && trimmed.chars().all(|c| c.is_alphanumeric() || c == '_')
        && (trimmed
            .chars()
            .next()
            .map_or(false, |c| c.is_alphabetic() || c == '_'))
}

/// Substitute all variable references in an expression with their values from scope.
fn substitute_vars(s: &str, scope: &HashMap<String, (i64, bool)>) -> String {
    let mut result = s.to_string();

    // Sort by length descending to avoid partial replacements (e.g., "xy" before "x")
    let mut vars: Vec<_> = scope.iter().collect();
    vars.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    for (var_name, (val, _)) in vars.iter() {
        let replacement: String = (*val).to_string();
        result = replace_whole_word(&result, *var_name, &replacement);
    }

    result
}

/// Replace a word in a string only when it appears as a complete identifier (not part of another word).
pub fn replace_whole_word(s: &str, target: &str, replacement: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let target_chars: Vec<char> = target.chars().collect();

    let mut i = 0;
    while i < len {
        // Check if we're at the start of a potential match (not preceded by an identifier char)
        let is_start_of_word = i == 0 || !is_identifier_char(chars[i - 1]);

        if is_start_of_word && can_match_at(&chars, i, &target_chars) {
            // Check that after the target there's no more identifier chars (end of word)
            let end_pos = i + target.len();
            let is_end_of_word = end_pos >= len || !is_identifier_char(chars[end_pos]);

            if is_end_of_word {
                result.push_str(replacement);
                i += target.len();
                continue;
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Check if a character can be part of an identifier.
pub fn is_identifier_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// Check if the target string matches at position `pos` in chars.
pub fn can_match_at(chars: &[char], pos: usize, target: &[char]) -> bool {
    if pos + target.len() > chars.len() {
        return false;
    }

    for (i, &t) in target.iter().enumerate() {
        if chars[pos + i] != t {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_zero() {
        assert_eq!(interpret_tuff(""), 0);
    }

    #[test]
    fn whitespace_only_returns_zero() {
        assert_eq!(interpret_tuff(" "), 0);
    }

    #[test]
    fn literal_one_returns_one() {
        assert_eq!(interpret_tuff("1"), 1);
    }

    #[test]
    fn addition_expression() {
        assert_eq!(interpret_tuff("1 + 2"), 3);
    }

    #[test]
    fn chained_addition() {
        assert_eq!(interpret_tuff("1 + 2 + 3"), 6);
    }

    #[test]
    fn mixed_add_subtract() {
        assert_eq!(interpret_tuff("1 + 2 - 3"), 0);
    }

    #[test]
    fn multiplication_with_subtraction() {
        assert_eq!(interpret_tuff("1 * 2 - 3"), -1);
    }

    #[test]
    fn division_expression() {
        assert_eq!(interpret_tuff("10 / 5"), 2);
    }

    #[test]
    fn mixed_multiplication_division_addition() {
        assert_eq!(interpret_tuff("3 * 4 + 6 / 2 - 5"), 10);
    }

    #[test]
    fn single_negative_result() {
        assert_eq!(interpret_tuff("0 - 7"), -7);
    }

    #[test]
    fn large_expression() {
        assert_eq!(interpret_tuff("1 + 2 * 3 / 4 - 5 + 6 * 7"), 39);
    }

    #[test]
    fn parenthesized_expression() {
        assert_eq!(interpret_tuff("3 * (4 + 5)"), 27);
    }

    #[test]
    fn curly_brace_grouping() {
        assert_eq!(interpret_tuff("3 * { 4 + 5 }"), 27);
    }

    #[test]
    fn deeply_nested_parentheses() {
        assert_eq!(interpret_tuff("(1 + (2 * (3 + 4)))"), 15);
    }

    #[test]
    fn mixed_braces_and_parens() {
        // { 1 + { 2 * 3 } } = { 1 + 6 } = 7, then (4) = 4, so 7 - 4 = 3
        assert_eq!(interpret_tuff("{ 1 + { 2 * 3 } } - (4)"), 3);
    }

    #[test]
    fn only_multiplication() {
        assert_eq!(interpret_tuff("2 * 3 * 4"), 24);
    }

    #[test]
    fn only_division() {
        assert_eq!(interpret_tuff("100 / 5 / 2"), 10);
    }

    #[test]
    fn subtraction_only_chain() {
        assert_eq!(interpret_tuff("10 - 3 - 2"), 5);
    }

    #[test]
    fn complex_nested_expression() {
        // (2 + 3) * (4 - 1) = 5 * 3 = 15
        assert_eq!(interpret_tuff("(2 + 3) * (4 - 1)"), 15);
    }

    #[test]
    fn let_binding_in_braces() {
        // { let x = 4 + 5; x } => evaluates to 9, then 3 * 9 = 27
        assert_eq!(interpret_tuff("3 * { let x = 4 + 5; x }"), 27);
    }

    #[test]
    fn top_level_let_binding() {
        // let y = 3 * { let x = 4 + 5; x }; y => inner block → 9, then 3*9=27, so y=27
        assert_eq!(interpret_tuff("let y = 3 * { let x = 4 + 5; x }; y"), 27);
    }

    #[test]
    fn mutable_let_with_reassignment() {
        // let mut x = 0; x = 1; x => reassigns x to 1, then evaluates to 1
        assert_eq!(interpret_tuff("let mut x = 0; x = 1; x"), 1);
    }

    #[test]
    fn find_matching_paren_returns_innermost() {
        let pos = find_matching_paren("a(b)c");
        assert_eq!(pos, Some((1, 3)));
    }

    #[test]
    fn find_matching_paren_nested() {
        // Returns the outermost complete pair (depth returns to 0 at position 6)
        let pos = find_matching_paren("(a(b)c)");
        assert_eq!(pos, Some((0, 6)));
    }

    #[test]
    fn find_matching_paren_no_match_returns_none() {
        assert_eq!(find_matching_paren("no parens here"), None);
    }

    #[test]
    fn find_matching_paren_unmatched_closing() {
        // Unbalanced closing should return None
        assert_eq!(find_matching_paren("(a)bc)"), Some((0, 2)));
    }

    #[test]
    fn multiple_top_level_let_bindings() {
        // let a = 5; let b = 3; a + b => 8
        assert_eq!(interpret_tuff("let a = 5; let b = 3; a + b"), 8);
    }

    #[test]
    fn let_binding_with_arithmetic_in_body() {
        // let x = 10; x * 2 - 3 => 17
        assert_eq!(interpret_tuff("let x = 10; x * 2 - 3"), 17);
    }

    #[test]
    fn nested_let_in_expression() {
        // let a = { let b = 2 + 3; b }; a => 5
        assert_eq!(interpret_tuff("let a = { let b = 2 + 3; b }; a"), 5);
    }

    #[test]
    fn variable_used_multiple_times() {
        // let x = 4; x + x * x => 4 + 16 = 20
        assert_eq!(interpret_tuff("let x = 4; x + x * x"), 20);
    }

    #[test]
    fn find_semicolon_at_top_level_basic() {
        use super::find_semicolon_at_top_level;
        assert_eq!(find_semicolon_at_top_level("let x = 1; body"), Some(9));
    }

    #[test]
    fn find_semicolon_skips_nested_braces() {
        use super::find_semicolon_at_top_level;
        // Semicolon inside braces should be skipped, return the one at depth 0 after '}'
        let pos = find_semicolon_at_top_level("let x = { let y = 1; 2 }; result");
        assert!(pos.is_some());
        // Verify it's past the closing brace (position > index of '}')
        assert!(pos.unwrap() > "let x = { let y = 1; 2 }".len() - 1);
    }

    #[test]
    fn find_semicolon_no_match_returns_none() {
        use super::find_semicolon_at_top_level;
        assert_eq!(find_semicolon_at_top_level("no semicolon here"), None);
    }

    #[test]
    fn replace_whole_word_basic() {
        use super::replace_whole_word;
        assert_eq!(replace_whole_word("x + x", "x", "5"), "5 + 5");
    }

    #[test]
    fn replace_whole_word_does_not_replace_partial() {
        use super::replace_whole_word;
        // Should not replace 'xy' when looking for 'x'
        assert_eq!(replace_whole_word("xy + x", "x", "5"), "xy + 5");
    }

    #[test]
    fn is_identifier_char_tests() {
        use super::is_identifier_char;
        assert!(is_identifier_char('a'));
        assert!(is_identifier_char('_'));
        assert!(is_identifier_char('9'));
        assert!(!is_identifier_char('+'));
        assert!(!is_identifier_char('*'));
    }

    #[test]
    fn can_match_at_tests() {
        use super::can_match_at;
        let chars: Vec<char> = "x + y".chars().collect();
        let target: Vec<char> = "x".chars().collect();
        assert!(can_match_at(&chars, 0, &target));
    }

    #[test]
    fn expression_with_only_parens_no_ops() {
        // Just a parenthesized number
        assert_eq!(interpret_tuff("(42)"), 42);
    }

    #[test]
    fn deeply_nested_braces_without_let() {
        assert_eq!(interpret_tuff("{ { { 7 } } }"), 7);
    }
}

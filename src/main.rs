use std::collections::HashMap;
use std::io::{self, BufRead, Write};

/// Variable scope for let bindings within blocks.
type Scope = HashMap<String, i32>;

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
                    Ok(value) => println!("{}", value),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(_) => break,
        }
    }
}

/// Parse a single typed value like "100U8" or "-50I16".
fn parse_value(token: &str, context: &str) -> Result<i32, String> {
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
                        if is_unsigned {
                            // Unsigned range: [0, 2^bits - 1]
                            let unsigned_max = (1u64 << bits).wrapping_sub(1);
                            if value < 0 || value as u64 > unsigned_max {
                                return Err(format!(
                                    "value out of range for U{}: {}",
                                    bits, context
                                ));
                            }
                        } else {
                            // Signed range: [-2^(bits-1), 2^(bits-1) - 1]
                            let half_bits = if bits == 0 { 0 } else { bits - 1 };
                            let signed_max = (1i64 << half_bits).wrapping_sub(1);
                            let signed_min = -(signed_max + 1);
                            let value_i64: i64 = value as i64;

                            if value_i64 > signed_max || value_i64 < signed_min {
                                return Err(format!(
                                    "value out of range for I{}: {}",
                                    bits, context
                                ));
                            }
                        }
                    }
                    Err(_) => {
                        return Err(format!("invalid type suffix in '{}': {}", token, context));
                    }
                }
            }

            Ok(value)
        }
        None => token
            .parse::<i32>()
            .map_err(|_| format!("invalid number: {}", context)),
    }
}

/// Parse a single token — either a variable reference or a typed literal.
fn parse_token(token: &str, context: &str, scope: &Scope) -> Result<i32, String> {
    let token = token.trim();

    // Check if this is a simple identifier (variable name).
    if !token.is_empty()
        && token.chars().next().map_or(false, |c| c.is_alphabetic() || c == '_')
        && !token.contains(|c: char| c == 'U' || c == 'u' || c == 'I' || c == 'i')
    {
        if let Some(&val) = scope.get(token) {
            return Ok(val);
        }
        // Fall through to parse_value for unknown tokens.
    }

    parse_value(token, context)
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

/// Split a string by semicolons, respecting nesting of parens/braces.
fn split_by_semicolons(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut current_start = 0usize;

    for (i, ch) in s.char_indices() {
        if is_opening(ch) {
            depth += 1;
        } else if is_closing(ch) {
            depth -= 1;
        } else if ch == ';' && depth == 0 {
            parts.push(&s[current_start..i]);
            current_start = i + 1; // Skip the semicolon.
        }
    }

    // Add remaining content after last semicolon.
    if current_start < s.len() {
        let remainder = &s[current_start..];
        if !remainder.trim().is_empty() {
            parts.push(remainder);
        }
    }

    parts
}

/// Evaluate a Tuff expression with variable scope support.
fn execute_tuff_with_scope(input: &str, scope: &Scope) -> Result<i32, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Handle grouped expressions by stripping matching outer delimiters.
    if let Some(inner) = try_strip_outer_group(trimmed) {
        // If it's a brace block, check for statements (let bindings).
        if trimmed.starts_with('{') && inner.contains(';') {
            return evaluate_block(inner, scope);
        }
        return execute_tuff_with_scope(inner, scope);
    }

    // Find operators not inside groups, respecting precedence: * and / before + and -.
    let mut best_pos = None;
    let mut best_op = '\0';

    // First look for '+' or '-' at depth 0 (lowest precedence).
    let mut depth = 0i32;
    for (i, ch) in trimmed.char_indices() {
        if is_opening(ch) {
            depth += 1;
        } else if matches!(ch, ')' | '}') {
            depth -= 1;
        } else if depth == 0 && (ch == '+' || ch == '-') {
            // Avoid treating a leading '-' as subtraction.
            if ch != '-' || i > 0 {
                best_pos = Some(i);
                best_op = ch;
            }
        }
    }

    // If no +/- found at depth 0, look for '*' or '/' outside groups.
    if best_pos.is_none() {
        depth = 0;
        for (i, ch) in trimmed.char_indices() {
            if is_opening(ch) {
                depth += 1;
            } else if matches!(ch, ')' | '}') {
                depth -= 1;
            } else if depth == 0 && (ch == '*' || ch == '/') {
                best_pos = Some(i);
                best_op = ch;
            }
        }
    }

    // If an operator was found, split and evaluate recursively.
    if let Some(pos) = best_pos {
        let left_str = &trimmed[..pos];
        let right_str = &trimmed[pos + 1..];

        let left_val = execute_tuff_with_scope(left_str, scope)?;
        let right_val = execute_tuff_with_scope(right_str, scope)?;

        return match best_op {
            '+' => Ok(left_val + right_val),
            '-' => Ok(left_val - right_val),
            '*' => Ok(left_val * right_val),
            '/' => {
                if right_val == 0 {
                    Err(format!("division by zero: {}", input))
                } else {
                    Ok(left_val / right_val)
                }
            }
            _ => unreachable!(),
        };
    }

    // No operator found — parse as a single token (variable or literal).
    parse_token(trimmed, input, scope)
}

/// Evaluate a brace block with semicolon-separated statements.
fn evaluate_block(inner: &str, parent_scope: &Scope) -> Result<i32, String> {
    let mut scope = parent_scope.clone();
    let parts = split_by_semicolons(inner);

    if parts.is_empty() {
        return Ok(0);
    }

    // Evaluate all but the last part as statements (let bindings).
    for stmt in &parts[..parts.len() - 1] {
        evaluate_statement(stmt.trim(), &mut scope)?;
    }

    // The last expression determines the block's value.
    let result = execute_tuff_with_scope(parts.last().unwrap().trim(), &scope);
    result
}

/// Evaluate a single statement (currently only `let` bindings).
fn evaluate_statement(stmt: &str, scope: &mut Scope) -> Result<(), String> {
    // Match pattern: let name : Type = expr
    if stmt.starts_with("let ") || stmt.starts_with("Let ") {
        let rest = &stmt[4..].trim_start();

        // Find the colon for type annotation.
        match rest.find(':') {
            Some(colon_pos) => {
                let name = rest[..colon_pos].trim().to_string();
                let after_colon = &rest[colon_pos + 1..];

                // Skip past the type (e.g., " U8" or "I32").
                let eq_start = skip_type(after_colon);

                // Find '='.
                match eq_start.find('=') {
                    Some(eq_pos) => {
                        let expr_str = &eq_start[eq_pos + 1..];
                        let value = execute_tuff_with_scope(expr_str.trim(), scope)?;
                        scope.insert(name, value);
                        Ok(())
                    }
                    None => Err(format!("expected '=' in let statement: {}", stmt)),
                }
            }
            None => {
                // No type annotation — try "let name = expr".
                match rest.find('=') {
                    Some(eq_pos) => {
                        let name = rest[..eq_pos].trim().to_string();
                        let expr_str = &rest[eq_pos + 1..];
                        let value = execute_tuff_with_scope(expr_str.trim(), scope)?;
                        scope.insert(name, value);
                        Ok(())
                    }
                    None => Err(format!("invalid let statement: {}", stmt)),
                }
            }
        }
    } else {
        // Bare expression statement — evaluate and discard result.
        execute_tuff_with_scope(stmt.trim(), scope)?;
        Ok(())
    }
}

/// Skip past a type annotation like " U8" or " I16".
fn skip_type(s: &str) -> &str {
    let s = s.trim_start();
    // Match optional sign + letter (U/u/I/i) + digits.
    if !s.is_empty() && (s.starts_with('U') || s.starts_with('u') || s.starts_with('I') || s.starts_with('i')) {
        let after_letter = &s[1..]; // Skip the type letter.
        let rest = after_letter.trim_start();
        if !rest.is_empty() && rest.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            return skip_type(rest); // Recursively skip digits (e.g., "8").
        }
    }
    s
}

/// Public entry point — evaluates an expression with an empty scope.
pub fn execute_tuff(input: &str) -> Result<i32, String> {
    let scope: Scope = HashMap::new();
    execute_tuff_with_scope(input, &scope)
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
        assert_eq!(execute_tuff("{ let a = 2U8; let b = 3U8; a * b + 1U8 }"), Ok(7)); // variable resolution 
    }

    #[test]
    fn test_execute_tuff_let_with_nested_block_expression() {
        assert_eq!(execute_tuff("{ let x : U8 = (2U8 + 3U8); x * 4U8 }"), Ok(20)); // nested block in let 
    }

    #[test]
    fn test_execute_tuff_division_precedence() {
        assert_eq!(execute_tuff("16U8 / 4U8 - 2U8"), Ok(2)); // division before subtraction (line ~170)  
    }

    #[test] 
    fn test_execute_tuff_multiple_semicolons_in_block() {
        assert_eq!(execute_tuff("{ let a = 1U8; let b = 2U8; let c = 3U8; c + b + a }"), Ok(6)); // multiple stmts (line ~172) 
    }

    #[test]
    fn test_execute_tuff_block_with_only_whitespace() {
        assert_eq!(execute_tuff("{   ;   }"), Ok(0)); // empty remainder after semicolons (lines 343, etc.)  
    }

    // Error paths in parse_value
}

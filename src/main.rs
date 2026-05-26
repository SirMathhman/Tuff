use std::collections::HashMap;

/// Type definitions for Tuff suffixed integers: (suffix, min_value, max_value).
const TYPE_BOUNDS: [(&str, i64, i64); 6] = [
    ("U8", 0i64, 255),
    ("U16", 0, 65_535),
    ("U32", 0, 4_294_967_295),
    ("I8", -128, 127),
    ("I16", -32_768, 32_767),
    ("I32", -2_147_483_648, 2_147_483_647),
];

/// Represents a parsed Tuff value with its type bounds.
struct ParsedValue {
    num: i64,
    min_val: i64,
    max_val: i64,
    suffix: &'static str,
}

// Parse a single suffixed number (e.g., "100U8", "-5I32")
fn parse_value(token: &str) -> Result<ParsedValue, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("empty value".to_string());
    }

    for &(suffix, min_val, max_val) in &TYPE_BOUNDS {
        if let Some(num_str) = token.strip_suffix(suffix) {
            if let Ok(num) = num_str.parse::<i64>() {
                if num < min_val || num > max_val {
                    return Err(format!("value {} out of range for {}", num, suffix));
                }
                return Ok(ParsedValue {
                    num,
                    min_val,
                    max_val,
                    suffix,
                });
            }
        }
    }

    Err(format!("no valid suffix found in '{}'", token))
}

// Internal state passed through the recursive descent parser.
struct ParseState {
    tokens: Vec<String>,
    pos: usize,
    suffix: &'static str,
    min_val: i64,
    max_val: i64,
    env: HashMap<String, i64>, // variable name -> value (type checked at declaration time)
}

impl ParseState {
    // Check that a value fits within the type bounds.
    fn check_range(&self, val: i64) -> Result<i64, String> {
        if val < self.min_val || val > self.max_val {
            Err(format!("result {} out of range for {}", val, self.suffix))
        } else {
            Ok(val)
        }
    }

    // Consume and return a reference to the current token.
    fn consume(&mut self) -> &str {
        let tok = &self.tokens[self.pos];
        self.pos += 1;
        tok.as_str()
    }

    // Return a reference to the current token (or None at EOF).
    fn peek(&self) -> Option<&str> {
        self.tokens.get(self.pos).map(|s| s.as_str())
    }

    /* ---- precedence levels (lowest → highest) ---- */

    // expression : term (('+' | '-') term)*
    fn parse_expression(&mut self) -> Result<i64, String> {
        let mut result = self.parse_term()?;

        loop {
            let op = match self.peek() {
                Some(t) => t.to_string(),
                None => break,
            };
            match op.as_str() {
                "+" | "-" => {
                    self.consume(); // eat operator
                    let rhs = self.parse_term()?;
                    result = match op.as_str() {
                        "+" => self.check_range(result + rhs)?,
                        "-" => self.check_range(result - rhs)?,
                        _ => unreachable!(),
                    };
                }
                _ => break,
            }
        }

        Ok(result)
    }

    // term : factor (('*' | '/') factor)*
    fn parse_term(&mut self) -> Result<i64, String> {
        let mut result = self.parse_factor()?;

        loop {
            let op = match self.peek() {
                Some(t) => t.to_string(),
                None => break,
            };
            match op.as_str() {
                "*" | "/" => {
                    self.consume(); // eat operator
                    let rhs = self.parse_factor()?;
                    result = match op.as_str() {
                        "*" => self.check_range(result * rhs)?,
                        "/" => {
                            if rhs == 0 {
                                return Err("division by zero".to_string());
                            }
                            self.check_range(result / rhs)?
                        }
                        _ => unreachable!(),
                    };
                }
                _ => break,
            }
        }

        Ok(result)
    }

    // factor : '(' expression ')' | '{' statements '}' | identifier | value (with type-checking against the first operand's type)
    fn parse_factor(&mut self) -> Result<i64, String> {
        let tok = match self.peek() {
            Some(t) => t.to_string(),
            None => return Err("unexpected end of input".to_string()),
        };

        if tok == "(" || tok == "{" {
            // Determine expected closing delimiter.
            let close_char = if tok == "(" { ')' } else { '}' };
            self.consume(); // eat opening delimiter

            if tok == "(" {
                // Parentheses: simple expression grouping (no variable support).
                match (self.parse_expression(), self.peek()) {
                    (Ok(v), Some(t)) if t == close_char.to_string() => {
                        self.consume(); // eat closing delimiter
                        Ok(v)
                    }
                    (Err(e), _) => Err(e),
                    _ => Err(format!(
                        "expected '{}', found nothing or wrong token",
                        close_char
                    )),
                }
            } else {
                // Block: parse let-statements and final expression.
                self.parse_statements(Some('}'), true)
            }
        } else if tok == "let" || is_identifier(&tok) {
            // Variable reference (identifier used in an expression context).
            self.consume();
            match self.env.get(&tok) {
                Some(&val) => Ok(val),
                None => Err(format!("undefined variable '{}'", tok)),
            }
        } else {
            let parsed = parse_value(&tok)?;

            if parsed.suffix != self.suffix {
                return Err(format!(
                    "cannot use {} and {}, types must match",
                    self.suffix, parsed.suffix
                ));
            }

            // Consume the value token.
            self.consume();
            Ok(parsed.num)
        }
    }

    // Shared loop: parse let-statements and expressions until terminated.
    // - close_char = Some(c) → stops at closing delimiter c, consumes it
    // - close_char = None   → stops at EOF (top-level)
    fn parse_statements(
        &mut self,
        close_char: Option<char>,
        require_expression: bool,
    ) -> Result<i64, String> {
        let mut last_value = 0i64;
        let mut has_expression = false;

        loop {
            match self.peek() {
                None => {
                    if close_char.is_none() {
                        break; // EOF for top-level
                    } else {
                        return Err("unexpected end of input".to_string());
                    }
                }
                Some(t) if close_char.map_or(false, |c| t.chars().next() == Some(c)) => {
                    self.consume(); // eat closing delimiter
                    break;
                }
                Some(t) if t == "let" => {
                    self.parse_let_statement()?;
                    has_expression = false;
                }
                _ => {
                    last_value = self.parse_expression()?;
                    has_expression = true;

                    // Optionally consume trailing ';'.
                    if let Some(t) = self.peek() {
                        if t == ";" {
                            self.consume();
                        }
                    }
                }
            }
        }

        if require_expression && !has_expression {
            Err("block has no final expression".to_string())
        } else {
            Ok(last_value)
        }
    }

    // Parse: let <identifier> : <TypeSuffix> = <expression>;
    fn parse_let_statement(&mut self) -> Result<(), String> {
        // Consume 'let'.
        self.consume();

        // Expect identifier.
        let var_name = match self.peek() {
            Some(t) if is_identifier(t) => t.to_string(),
            _ => return Err("expected variable name after 'let'".to_string()),
        };
        self.consume();

        // Expect ':' type annotation separator (already tokenized as separate token).
        match self.peek() {
            Some(t) if t == ":" => {}
            _ => return Err("expected ':' after variable name in 'let'".to_string()),
        }
        self.consume();

        // Expect type suffix (e.g., "U8", "I32").
        let type_token = match self.peek() {
            Some(t) if is_type_suffix(t) => t.to_string(),
            _ => return Err("expected type suffix after ':' in 'let'".to_string()),
        };
        self.consume();

        // Expect '='.
        match self.peek() {
            Some(t) if t == "=" => {}
            _ => return Err("expected '=' in 'let' statement".to_string()),
        }
        self.consume();

        // Parse the initializer expression.
        let value = self.parse_expression()?;

        // Validate range against declared type.
        let (min_val, max_val) = match type_token.as_str() {
            "U8" => (0i64, 255),
            "U16" => (0, 65_535),
            "U32" => (0, 4_294_967_295),
            "I8" => (-128, 127),
            "I16" => (-32_768, 32_767),
            "I32" => (-2_147_483_648, 2_147_483_647),
            _ => return Err(format!("unknown type '{}'", type_token)),
        };
        if value < min_val || value > max_val {
            return Err(format!("value {} out of range for {}", value, type_token));
        }

        // Store in environment.
        self.env.insert(var_name, value);

        // Consume trailing ';'.
        if let Some(t) = self.peek() {
            if t == ";" {
                self.consume();
            } else {
                return Err("expected ';' at end of 'let' statement".to_string());
            }
        } else {
            return Err("expected ';' at end of 'let' statement".to_string());
        }

        Ok(())
    }
}

// Check if a token is an identifier (starts with lowercase letter or underscore, alphanumeric).
fn is_identifier(token: &str) -> bool {
    let mut chars = token.chars();
    let first_ok = match chars.next() {
        Some(c) if c.is_lowercase() || c == '_' => true,
        _ => false,
    };
    first_ok && chars.all(|c| c.is_alphanumeric())
}

// Check if a token is a valid type suffix.
fn is_type_suffix(token: &str) -> bool {
    matches!(token, "U8" | "U16" | "U32" | "I8" | "I16" | "I32")
}

// Split whitespace-delimited tokens further so that leading/trailing '(' and ')' become their own tokens.
fn tokenize(source: &str) -> Vec<String> {
    let mut result = Vec::new();
    for word in source.split_whitespace() {
        // Strip leading grouping delimiters ('(' or '{'), each as its own token.
        let mut remaining = word;
        while remaining.starts_with('(') || remaining.starts_with('{') {
            result.push(remaining[..1].to_string());
            remaining = &remaining[1..];
        }
        if !remaining.is_empty() {
            // Count trailing grouping delimiters (')' or '}' or ';') so we can push them AFTER the core token.
            let mut trimmed = remaining;
            while trimmed.ends_with(')') || trimmed.ends_with('}') || trimmed.ends_with(';') {
                trimmed = &trimmed[..trimmed.len() - 1];
            }
            if !trimmed.is_empty() {
                result.push(trimmed.to_string());
            }
            // Now push the trailing delimiter tokens.
            let trailing_count = remaining.len() - trimmed.len();
            for i in (0..trailing_count).rev() {
                result.push(
                    remaining[remaining.len() - trailing_count + i
                        ..remaining.len() - trailing_count + 1]
                        .to_string(),
                );
            }
        }
    }
    result
}

// Feel free to change param type if required
fn interpret_tuff(source: &str) -> Result<i64, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    // Tokenize by whitespace and parentheses.
    let token_strings: Vec<String> = tokenize(source);
    if token_strings.is_empty() {
        return Ok(0);
    }

    // Convert to owned strings so ParseState can hold them.
    let tokens: Vec<String> = token_strings;

    // Parse the first value to establish the type for all operands (skip leading grouping delimiters).
    let mut idx = 0;
    while idx < tokens.len() && (tokens[idx] == "(" || tokens[idx] == "{") {
        idx += 1;
    }
    if idx >= tokens.len() {
        return Err("empty expression".to_string());
    }

    // Helper to look up type bounds for a suffix string.
    let lookup_type_bounds = |suffix: &str| -> Option<(&'static str, i64, i64)> {
        TYPE_BOUNDS
            .iter()
            .find(|(s, _, _)| *s == suffix)
            .map(|&(s, mn, mx)| (s, mn, mx))
    };

    // Try to determine the type: either from a let declaration or by parsing the first value.
    let mut inferred_suffix: Option<&'static str> = None;
    let mut inferred_min: i64 = 0;
    let mut inferred_max: i64 = 0;

    if tokens[idx] == "let" {
        // Skip past `let <identifier> : <TypeSuffix> = ... ;` to infer type from the declaration.
        let mut scan_idx = idx + 1; // skip 'let'
        if scan_idx < tokens.len() && is_identifier(&tokens[scan_idx]) {
            scan_idx += 1; // skip identifier
        }
        if scan_idx < tokens.len() && tokens[scan_idx] == ":" {
            scan_idx += 1; // skip ':'
        }
        if scan_idx < tokens.len() && is_type_suffix(&tokens[scan_idx]) {
            if let Some((suffix, mn, mx)) = lookup_type_bounds(&tokens[scan_idx]) {
                inferred_suffix = Some(suffix);
                inferred_min = mn;
                inferred_max = mx;
            }
        }
    }

    let (suffix, min_val, max_val) = if let Some(s) = inferred_suffix {
        (s, inferred_min, inferred_max)
    } else {
        let first_parsed = parse_value(&tokens[idx])?;
        (
            first_parsed.suffix,
            first_parsed.min_val,
            first_parsed.max_val,
        )
    };

    let mut state = ParseState {
        tokens,
        pos: 0,
        suffix,
        min_val,
        max_val,
        env: HashMap::new(),
    };

    // Top-level call — EOF-terminated, no-op if only statements (returns 0).
    let result = state.parse_statements(None, false)?;

    Ok(result)
}

use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = stdout.lock();

    println!("Tuff REPL. Type an expression (e.g., 1U8 + 2U8) or 'quit' to exit.");

    for line in stdin.lock().lines() {
        match line {
            Ok(l) if l.trim().eq_ignore_ascii_case("quit") => break,
            Ok(l) if l.trim().is_empty() => continue,
            Ok(l) => {
                let result = interpret_tuff(&l);
                match result {
                    Ok(value) => writeln!(out, "=> {}", value).unwrap(),
                    Err(e) => eprintln!("Error: {}", e),
                }
            }
            Err(e) => eprintln!("Read error: {}", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpret_tuff_empty_string() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_whitespace() {
        assert_eq!(interpret_tuff("   "), Ok(0));
        assert_eq!(interpret_tuff("\t"), Ok(0));
        assert_eq!(interpret_tuff("\n"), Ok(0));
    }

    #[test]
    fn test_interpret_tuff_number_u8() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u16() {
        assert_eq!(interpret_tuff("100U16"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_number_u32() {
        assert_eq!(interpret_tuff("100U32"), Ok(100));
    }

    #[test]
    fn test_interpret_tuff_negative_u32() {
        assert!(interpret_tuff("-100U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u8() {
        assert!(interpret_tuff("256U8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u16() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_u32() {
        assert!(interpret_tuff("4294967296U32").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i8() {
        assert!(interpret_tuff("128I8").is_err());
        assert!(interpret_tuff("-129I8").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i16() {
        assert!(interpret_tuff("32768I16").is_err());
        assert!(interpret_tuff("-32769I16").is_err());
    }

    #[test]
    fn test_interpret_tuff_overflow_i32() {
        assert!(interpret_tuff("2147483648I32").is_err());
        assert!(interpret_tuff("-2147483649I32").is_err());
    }

    #[test]
    fn test_interpret_tuff_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_interpret_tuff_addition_overflow_u8() {
        // 1 + 255 = 256, which exceeds U8 max (255)
        assert!(interpret_tuff("1U8 + 255U8").is_err());
    }

    #[test]
    fn test_interpret_tuff_addition_multiple_terms() {
        // Support infinitely many terms: 1 + 2 + 3 = 6
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_interpret_tuff_subtraction() {
        // 3 + 2 - 1 = 4
        assert_eq!(interpret_tuff("3U8 + 2U8 - 1U8"), Ok(4));
    }

    #[test]
    fn test_interpret_tuff_multiplication_and_subtraction() {
        // 3 * 2 - 1 = 5
        assert_eq!(interpret_tuff("3U8 * 2U8 - 1U8"), Ok(5));
    }

    #[test]
    fn test_interpret_tuff_operator_precedence() {
        // 3 + 2 * 5 = 13 (multiplication before addition)
        assert_eq!(interpret_tuff("3U8 + 2U8 * 5U8"), Ok(13));
    }

    #[test]
    fn test_interpret_tuff_parentheses_grouping() {
        // (3 + 2) * 5 = 25 (parentheses override precedence)
        assert_eq!(interpret_tuff("(3U8 + 2U8) * 5U8"), Ok(25));
    }

    #[test]
    fn test_interpret_tuff_block_grouping() {
        // {3 + 2} * 5 = 25 (block braces also override precedence)
        assert_eq!(interpret_tuff("{ 3U8 + 2U8 } * 5U8"), Ok(25));
    }

    #[test]
    fn test_interpret_tuff_let_in_block() {
        // let x = 3 + 2; x * 5 = 25
        assert_eq!(
            interpret_tuff("{ let x : U8 = 3U8 + 2U8; x } * 5U8"),
            Ok(25)
        );
    }

    #[test]
    fn test_interpret_tuff_top_level_let() {
        // Top-level let: y = ({x} * 5) = (5 * 5) = 25, then return y
        assert_eq!(
            interpret_tuff("let y : U8 = { let x : U8 = 3U8 + 2U8; x } * 5U8; y"),
            Ok(25)
        );
    }

    #[test]
    fn test_interpret_tuff_top_level_let_noop() {
        // Top-level let with no final expression is a no-op, returns 0
        assert_eq!(
            interpret_tuff("let y : U8 = { let x : U8 = 3U8 + 2U8; x } * 5U8;"),
            Ok(0)
        );
    }
}

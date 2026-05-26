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

    // (suffix, min_val, max_val)
    let types = [
        ("U8", 0i64, 255),
        ("U16", 0, 65_535),
        ("U32", 0, 4_294_967_295),
        ("I8", -128, 127),
        ("I16", -32_768, 32_767),
        ("I32", -2_147_483_648, 2_147_483_647),
    ];

    for &(suffix, min_val, max_val) in &types {
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
struct ParseState<'a> {
    tokens: Vec<&'a str>,
    pos: usize,
    suffix: &'static str,
    min_val: i64,
    max_val: i64,
}

impl<'a> ParseState<'a> {
    // Check that a value fits within the type bounds.
    fn check_range(&self, val: i64) -> Result<i64, String> {
        if val < self.min_val || val > self.max_val {
            Err(format!("result {} out of range for {}", val, self.suffix))
        } else {
            Ok(val)
        }
    }

    // Consume and return the current token.
    fn consume(&mut self) -> &'a str {
        let tok = self.tokens[self.pos];
        self.pos += 1;
        tok
    }

    // Return the current token (or None at EOF).
    fn peek(&self) -> Option<&'a str> {
        self.tokens.get(self.pos).copied()
    }

    /* ---- precedence levels (lowest → highest) ---- */

    // expression : term (('+' | '-') term)*
    fn parse_expression(&mut self) -> Result<i64, String> {
        let mut result = self.parse_term()?;

        while let Some(op) = self.peek() {
            match op {
                "+" | "-" => {
                    self.consume(); // eat operator
                    let rhs = self.parse_term()?;
                    result = match op {
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

        while let Some(op) = self.peek() {
            match op {
                "*" | "/" => {
                    self.consume(); // eat operator
                    let rhs = self.parse_factor()?;
                    result = match op {
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

    // factor : value (with type-checking against the first operand's type)
    fn parse_factor(&mut self) -> Result<i64, String> {
        let tok = self.consume();
        let parsed = parse_value(tok)?;

        if parsed.suffix != self.suffix {
            return Err(format!(
                "cannot use {} and {}, types must match",
                self.suffix, parsed.suffix
            ));
        }

        Ok(parsed.num)
    }
}

// Feel free to change param type if required
fn interpret_tuff(source: &str) -> Result<i64, String> {
    let source = source.trim();
    if source.is_empty() {
        return Ok(0);
    }

    // Tokenize by whitespace: ["3U8", "+", "2U8", "-", "1U8"]
    let tokens: Vec<&str> = source.split_whitespace().collect();
    if tokens.is_empty() {
        return Ok(0);
    }

    // Parse the first value to establish the type for all operands.
    let first_parsed = parse_value(tokens[0])?;

    let mut state = ParseState {
        tokens,
        pos: 0,
        suffix: first_parsed.suffix,
        min_val: first_parsed.min_val,
        max_val: first_parsed.max_val,
    };

    // Top-level call to the lowest-precedence rule.
    let result = state.parse_expression()?;

    // Ensure we consumed all tokens (no trailing garbage).
    if state.pos < state.tokens.len() {
        return Err(format!("unexpected token '{}'", state.peek().unwrap()));
    }

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
}

use std::collections::HashMap;

fn range_for_suffix(suffix: &str) -> Option<(i64, i64)> {
    match suffix.to_uppercase().as_str() {
        "U8" => Some((0, u8::MAX as i64)),
        "U16" => Some((0, u16::MAX as i64)),
        "U32" => Some((0, u32::MAX as i64)),
        "U64" => Some((0, i64::MAX)),
        "I8" => Some((i8::MIN as i64, i8::MAX as i64)),
        "I16" => Some((i16::MIN as i64, i16::MAX as i64)),
        "I32" => Some((i32::MIN as i64, i32::MAX as i64)),
        "I64" => Some((i64::MIN, i64::MAX)),
        _ => None,
    }
}

struct Parser<'a> {
    input: &'a str,
    pos: usize,
    suffix: String,
    variables: HashMap<String, i64>,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Parser {
            input,
            pos: 0,
            suffix: String::new(),
            variables: HashMap::new(),
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.input.len() && self.input.as_bytes()[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn peek(&mut self) -> Option<char> {
        self.skip_whitespace();
        self.input[self.pos..].chars().next()
    }

    fn consume(&mut self) -> Option<char> {
        self.skip_whitespace();
        let c = self.input[self.pos..].chars().next()?;
        self.pos += c.len_utf8();
        Some(c)
    }

    fn read_while<F>(&mut self, predicate: F) -> &'a str
    where
        F: Fn(u8) -> bool,
    {
        let start = self.pos;
        while self.pos < self.input.len() && predicate(self.input.as_bytes()[self.pos]) {
            self.pos += 1;
        }
        &self.input[start..self.pos]
    }

    fn parse_literal(&mut self) -> Result<i64, String> {
        let num_str = self.read_while(|b| b.is_ascii_digit());

        if num_str.is_empty() {
            return Err(format!(
                "invalid literal at position {} in: {}",
                self.pos, self.input
            ));
        }

        let value = num_str
            .parse::<i64>()
            .map_err(|e| format!("{e}: {num_str}"))?;

        // Parse suffix (e.g., U8, U16, I8, I16)
        let suf = self.read_while(|b| b.is_ascii_alphabetic() || b.is_ascii_digit());

        if suf.is_empty() {
            return Err(format!("missing type suffix at position {}", self.pos));
        }

        let (_min, max) = range_for_suffix(suf).ok_or_else(|| format!("unknown suffix: {suf}"))?;

        // Only check upper bound at parse time; unary minus handles lower bound
        if value > max {
            return Err(format!("value out of range for {suf}: {value}"));
        }

        if self.suffix.is_empty() {
            self.suffix = suf.to_string();
        } else if self.suffix != suf {
            return Err(format!("type mismatch: {suf} != {}", self.suffix));
        }

        Ok(value)
    }

    fn parse_identifier(&mut self) -> Result<String, String> {
        self.skip_whitespace();
        let ident = self.read_while(|b| b.is_ascii_alphabetic() || b == b'_');
        if ident.is_empty() {
            return Err(format!("expected identifier at position {}", self.pos));
        }
        Ok(ident.to_string())
    }

    fn parse_type_name(&mut self) -> Result<String, String> {
        self.skip_whitespace();
        let name = self.read_while(|b| b.is_ascii_alphabetic() || b.is_ascii_digit());
        if name.is_empty() {
            return Err(format!("expected type name at position {}", self.pos));
        }
        Ok(name.to_string())
    }

    fn parse_factor(&mut self) -> Result<i64, String> {
        if self.peek() == Some('-') {
            self.consume(); // '-'
            let value = self.parse_factor()?;
            let negated = -value;
            if let Some((min, _)) = range_for_suffix(&self.suffix) {
                if negated < min {
                    return Err(format!("value out of range for {}: {negated}", self.suffix));
                }
            }
            return Ok(negated);
        }
        if self.peek() == Some('{') {
            self.consume(); // '{'
            return self.parse_block();
        }
        if self.peek() == Some('(') {
            self.consume(); // '('
            let value = self.parse_expr()?;

            if self.consume() != Some(')') {
                return Err("expected ')'".to_string());
            }

            // Check for overflow against current suffix range
            if let Some((min, max)) = range_for_suffix(&self.suffix) {
                if value < min || value > max {
                    return Err(format!("overflow in {}: {value}", self.suffix));
                }
            }

            Ok(value)
        } else if self
            .peek()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        {
            // Identifier: either a variable reference or "let" binding
            let ident = self.parse_identifier()?;
            if ident == "let" {
                self.parse_let_binding()
            } else {
                // Variable reference
                self.variables
                    .get(&ident)
                    .copied()
                    .ok_or_else(|| format!("undefined variable: {ident}"))
            }
        } else {
            self.parse_literal()
        }
    }

    fn parse_let_binding(&mut self) -> Result<i64, String> {
        // Already consumed "let"
        let name = self.parse_identifier()?;

        // Expect ':'
        if self.consume() != Some(':') {
            return Err("expected ':' after variable name in let binding".to_string());
        }

        // Parse type annotation (e.g., U8, I32)
        let type_name = self.parse_type_name()?;
        if range_for_suffix(&type_name).is_none() {
            return Err(format!("unknown type in let binding: {type_name}"));
        }

        // Expect '='
        if self.consume() != Some('=') {
            return Err("expected '=' in let binding".to_string());
        }

        let value = self.parse_expr()?;

        // Expect ';'
        if self.consume() != Some(';') {
            return Err("expected ';' after let binding".to_string());
        }

        self.variables.insert(name, value);
        // Continue parsing the block (next expression is the block body)
        self.parse_expr()
    }

    fn parse_block(&mut self) -> Result<i64, String> {
        let saved_vars = self.variables.clone();
        let result = self.parse_expr()?;

        let close = self.consume();
        if close != Some('}') {
            let got = close
                .map(|c| c.to_string())
                .unwrap_or_else(|| "EOF".to_string());
            return Err(format!("expected '}}', got {got}"));
        }

        // Check overflow
        if let Some((min, max)) = range_for_suffix(&self.suffix) {
            if result < min || result > max {
                return Err(format!("overflow in {}: {result}", self.suffix));
            }
        }

        // Restore variables (block scoping)
        self.variables = saved_vars;

        Ok(result)
    }

    fn parse_term(&mut self) -> Result<i64, String> {
        let mut value = self.parse_factor()?;

        loop {
            match self.peek() {
                Some('*') => {
                    self.consume();
                    let right = self.parse_factor()?;
                    let (min, max) = range_for_suffix(&self.suffix).unwrap_or((i64::MIN, i64::MAX));
                    let product = value * right;
                    if product < min || product > max {
                        return Err(format!("overflow in {}: {product}", self.suffix));
                    }
                    value = product;
                }
                Some('/') => {
                    self.consume();
                    let right = self.parse_factor()?;
                    if right == 0 {
                        return Err("division by zero".to_string());
                    }
                    value /= right;
                }
                Some('%') => {
                    self.consume();
                    let right = self.parse_factor()?;
                    if right == 0 {
                        return Err("division by zero".to_string());
                    }
                    value %= right;
                }
                _ => break,
            }
        }

        Ok(value)
    }

    fn parse_expr(&mut self) -> Result<i64, String> {
        let mut value = self.parse_term()?;

        loop {
            match self.peek() {
                Some('+') => {
                    self.consume();
                    let right = self.parse_term()?;
                    let (min, max) = range_for_suffix(&self.suffix).unwrap_or((i64::MIN, i64::MAX));
                    let sum = value + right;
                    if sum < min || sum > max {
                        return Err(format!("overflow in {}: {sum}", self.suffix));
                    }
                    value = sum;
                }
                Some('-') => {
                    self.consume();
                    let right = self.parse_term()?;
                    let (min, max) = range_for_suffix(&self.suffix).unwrap_or((i64::MIN, i64::MAX));
                    let diff = value - right;
                    if diff < min || diff > max {
                        return Err(format!("overflow in {}: {diff}", self.suffix));
                    }
                    value = diff;
                }
                _ => break,
            }
        }

        Ok(value)
    }
}

fn execute_tuff(input: &str) -> Result<i64, String> {
    let input = input.trim();

    if input.is_empty() {
        return Ok(0);
    }

    let mut parser = Parser::new(input);
    let result = parser.parse_expr()?;

    // Ensure we consumed all input
    parser.skip_whitespace();
    if parser.pos < input.len() {
        return Err(format!(
            "unexpected trailing input: {}",
            &input[parser.pos..]
        ));
    }

    Ok(result)
}

fn main() {
    use std::io::{self, Write};

    loop {
        print!("tuff> ");
        io::stdout().flush().unwrap();

        let mut line = String::new();
        if io::stdin().read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }

        let line = line.trim();
        match execute_tuff(line) {
            Ok(value) => println!("{value}"),
            Err(e) => println!("error: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn single_u8_returns_value() {
        assert_eq!(execute_tuff("1U8"), Ok(1));
    }

    #[test]
    fn negative_u8_returns_err() {
        assert!(execute_tuff("-1U8").is_err());
    }

    #[test]
    fn u8_overflow_returns_err() {
        assert!(execute_tuff("256U8").is_err());
    }

    #[test]
    fn u16_within_range_returns_value() {
        assert_eq!(execute_tuff("256U16"), Ok(256));
    }

    #[test]
    fn simple_addition() {
        assert_eq!(execute_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn chained_addition() {
        assert_eq!(execute_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn addition_overflow_returns_err() {
        assert!(execute_tuff("1U8 + 255U8").is_err());
    }

    #[test]
    fn mixed_addition_subtraction() {
        assert_eq!(execute_tuff("2U8 + 3U8 - 4U8"), Ok(1));
    }

    #[test]
    fn mixed_multiplication_addition_subtraction() {
        assert_eq!(execute_tuff("2U8 * 3U8 - 4U8"), Ok(2));
    }

    #[test]
    fn multiplication_precedes_addition() {
        assert_eq!(execute_tuff("2U8 + 3U8 * 4U8"), Ok(14));
    }

    #[test]
    fn integer_division() {
        assert_eq!(execute_tuff("10U8 / 3U8"), Ok(3));
    }

    #[test]
    fn parentheses_override_precedence() {
        assert_eq!(execute_tuff("(2U8 + 3U8) * 4U8"), Ok(20));
    }

    #[test]
    fn modulo_operator() {
        assert_eq!(execute_tuff("10U8 % 3U8"), Ok(1));
    }

    #[test]
    fn negative_i64_literal() {
        assert_eq!(execute_tuff("-1I64"), Ok(-1));
    }

    #[test]
    fn signed_underflow_returns_err() {
        assert!(execute_tuff("-100I8 + (-100I8)").is_err());
    }

    #[test]
    fn division_by_zero_returns_err() {
        assert!(execute_tuff("10U8 / 0U8").is_err());
    }

    #[test]
    fn modulo_by_zero_returns_err() {
        assert!(execute_tuff("10U8 % 0U8").is_err());
    }

    #[test]
    fn curly_braces_as_parentheses() {
        assert_eq!(execute_tuff("{ 2U8 + 3U8 } * 4U8"), Ok(20));
    }

    #[test]
    fn let_binding_in_block() {
        assert_eq!(execute_tuff("{ let x : U8 = 2U8 + 3U8; x } * 4U8"), Ok(20));
    }
}

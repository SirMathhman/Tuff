use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum TuffError {
    UnexpectedToken(String),
    UnterminatedBlock,
    ExpectedColon,
    ExpectedType,
    ExpectedEquals,
    ExpectedSemicolon,
    ExpectedClosingParen,
    ExpectedClosingBrace,
    UndefinedVariable(String),
    InvalidLiteral(String),
    ArithmeticOverflow,
    NegativeLiteral,
    TypeMismatch,
}

fn type_max(suffix: &str) -> Option<u64> {
    match suffix {
        "U8" => Some(255),
        "U16" => Some(65535),
        "U32" => Some(4_294_967_295),
        "U64" => Some(u64::MAX),
        "Bool" => Some(1),
        _ => None,
    }
}

#[derive(Debug, Clone, Copy)]
struct TypedValue {
    value: u64,
    max: u64,
}

fn parse_typed_literal(token: &str) -> Result<TypedValue, TuffError> {
    for (suffix, max) in [
        ("U8", 255u64),
        ("U16", 65535),
        ("U32", 4_294_967_295),
        ("U64", u64::MAX),
    ] {
        if let Some(literal) = token.strip_suffix(suffix) {
            if literal.starts_with('-') {
                return Err(TuffError::NegativeLiteral);
            }
            if let Ok(n) = literal.parse::<u64>() {
                if n <= max {
                    return Ok(TypedValue { value: n, max });
                }
            }
            return Err(TuffError::InvalidLiteral(token.to_string()));
        }
    }

    // Bool literals
    if token == "true" {
        return Ok(TypedValue { value: 1, max: 1 });
    }
    if token == "false" {
        return Ok(TypedValue { value: 0, max: 1 });
    }

    // Default: treat bare integer literals as I32
    if let Ok(n) = token.parse::<i64>() {
        let i32_max: u64 = i32::MAX as u64;
        if n >= 0 && (n as u64) <= i32_max {
            return Ok(TypedValue {
                value: n as u64,
                max: i32_max,
            });
        }
    }

    Err(TuffError::InvalidLiteral(token.to_string()))
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut buf = String::new();
    for c in input.chars() {
        if c.is_whitespace() {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
        } else if c == '(' || c == ')' || c == '{' || c == '}' || c == ';' || c == ':' {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            tokens.push(c.to_string());
        } else {
            buf.push(c);
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }
    tokens
}

struct Parser {
    tokens: Vec<String>,
    pos: usize,
    scopes: Vec<HashMap<String, (TypedValue, bool)>>, // (value, is_mutable)
}

impl Parser {
    fn new(tokens: Vec<String>) -> Self {
        Parser {
            tokens,
            pos: 0,
            scopes: vec![HashMap::new()],
        }
    }

    fn binop(
        acc: TypedValue,
        b: TypedValue,
        checked_op: impl FnOnce(u64, u64) -> Option<u64>,
    ) -> Result<TypedValue, TuffError> {
        let max = acc.max.max(b.max);
        Ok(TypedValue {
            value: checked_op(acc.value, b.value).ok_or(TuffError::ArithmeticOverflow)?,
            max,
        })
    }

    fn parse_expr(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_term()?;
        while self.pos < self.tokens.len() {
            match self.tokens[self.pos].as_str() {
                "+" => {
                    self.pos += 1;
                    let b = self.parse_term()?;
                    acc = Self::binop(acc, b, u64::checked_add)?;
                }
                "-" => {
                    self.pos += 1;
                    let b = self.parse_term()?;
                    acc = Self::binop(acc, b, u64::checked_sub)?;
                }
                _ => break,
            }
        }
        Ok(acc)
    }

    fn parse_term(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_factor()?;
        while self.pos < self.tokens.len() {
            match self.tokens[self.pos].as_str() {
                "*" => {
                    self.pos += 1;
                    let b = self.parse_factor()?;
                    acc = Self::binop(acc, b, u64::checked_mul)?;
                }
                "/" => {
                    self.pos += 1;
                    let b = self.parse_factor()?;
                    acc = Self::binop(acc, b, u64::checked_div)?;
                }
                _ => break,
            }
        }
        Ok(acc)
    }

    fn parse_block(&mut self) -> Result<TypedValue, TuffError> {
        self.scopes.push(HashMap::new());
        let mut value = TypedValue {
            value: 0,
            max: u64::MAX,
        };
        loop {
            if self.pos >= self.tokens.len() {
                self.scopes.pop();
                return Err(TuffError::UnterminatedBlock);
            }
            if self.tokens[self.pos] == "}" {
                self.pos += 1;
                self.scopes.pop();
                return Ok(value);
            }
            value = self.parse_one_stmt(value)?;
        }
    }

    fn is_ident(token: &str) -> bool {
        !token.ends_with("U8")
            && !token.ends_with("U16")
            && !token.ends_with("U32")
            && !token.ends_with("U64")
            && token
                .chars()
                .next()
                .map_or(false, |c| c.is_alphabetic() || c == '_')
    }

    fn parse_one_stmt(&mut self, mut value: TypedValue) -> Result<TypedValue, TuffError> {
        if self.tokens[self.pos] == "let" {
            self.pos += 1;
            self.parse_let()?;
        } else if self.pos + 1 < self.tokens.len()
            && self.tokens[self.pos + 1] == "="
            && Self::is_ident(&self.tokens[self.pos])
        {
            // assignment: ident = expr
            let name = self.tokens[self.pos].clone();
            self.pos += 2; // skip ident and =
            let val = self.parse_expr()?;
            let mut found = false;
            for scope in self.scopes.iter_mut().rev() {
                if let Some(pair) = scope.get_mut(&name) {
                    if !pair.1 {
                        return Err(TuffError::UnexpectedToken(format!(
                            "cannot assign to immutable variable '{}'",
                            name
                        )));
                    }
                    if val.max > pair.0.max {
                        return Err(TuffError::TypeMismatch);
                    }
                    pair.0.value = val.value;
                    found = true;
                    break;
                }
            }
            if !found {
                return Err(TuffError::UndefinedVariable(name));
            }
            if self.pos < self.tokens.len() && self.tokens[self.pos] == ";" {
                self.pos += 1;
            }
        } else {
            value = self.parse_expr()?;
            if self.pos < self.tokens.len() && self.tokens[self.pos] == ";" {
                self.pos += 1;
            }
        }
        Ok(value)
    }

    fn parse_let(&mut self) -> Result<(), TuffError> {
        if self.pos >= self.tokens.len() {
            return Err(TuffError::UnexpectedToken("end of input".to_string()));
        }

        let is_mut = self.tokens[self.pos] == "mut";
        if is_mut {
            self.pos += 1;
        }

        let name = self.tokens[self.pos].clone();
        self.pos += 1;
        // optional type annotation
        let annotated_max = if self.pos < self.tokens.len() && self.tokens[self.pos] == ":" {
            self.pos += 1;
            if self.pos >= self.tokens.len() {
                return Err(TuffError::ExpectedType);
            }
            let type_token = self.tokens[self.pos].clone();
            self.pos += 1;
            type_max(&type_token).ok_or(TuffError::ExpectedType)?
        } else {
            u64::MAX
        };
        if self.pos >= self.tokens.len() || self.tokens[self.pos] != "=" {
            return Err(TuffError::ExpectedEquals);
        }
        self.pos += 1;
        let val = self.parse_expr()?;
        let effective_max = if annotated_max == u64::MAX {
            val.max
        } else {
            if val.max > annotated_max {
                return Err(TuffError::TypeMismatch);
            }
            annotated_max
        };
        if self.pos >= self.tokens.len() || self.tokens[self.pos] != ";" {
            return Err(TuffError::ExpectedSemicolon);
        }
        self.pos += 1;
        if let Some(scope) = self.scopes.last_mut() {
            if scope.contains_key(&name) {
                return Err(TuffError::UnexpectedToken(format!(
                    "redeclaration of '{}'",
                    name
                )));
            }
            scope.insert(
                name,
                (
                    TypedValue {
                        value: val.value,
                        max: effective_max,
                    },
                    is_mut,
                ),
            );
        }
        Ok(())
    }

    fn parse_factor(&mut self) -> Result<TypedValue, TuffError> {
        if self.pos >= self.tokens.len() {
            return Err(TuffError::UnexpectedToken("end of input".to_string()));
        }
        if self.tokens[self.pos] == "(" {
            self.pos += 1;
            let val = self.parse_expr()?;
            if self.pos >= self.tokens.len() || self.tokens[self.pos] != ")" {
                return Err(TuffError::ExpectedClosingParen);
            }
            self.pos += 1;
            Ok(val)
        } else if self.tokens[self.pos] == "{" {
            self.pos += 1;
            self.parse_block()
        } else if self.tokens[self.pos] == "let" {
            self.pos += 1;
            self.parse_let()?;
            Err(TuffError::UnexpectedToken("let".to_string()))
        } else {
            let token = &self.tokens[self.pos];
            for scope in self.scopes.iter().rev() {
                if let Some(&(tv, _)) = scope.get(token) {
                    self.pos += 1;
                    return Ok(tv);
                }
            }
            let lit = parse_typed_literal(token)?;
            self.pos += 1;
            Ok(lit)
        }
    }

    fn parse_all(&mut self) -> Result<u64, TuffError> {
        let mut value = TypedValue {
            value: 0,
            max: u64::MAX,
        };
        while self.pos < self.tokens.len() {
            value = self.parse_one_stmt(value)?;
        }
        Ok(value.value)
    }
}

fn interpret_tuff(input: &str) -> Result<u64, TuffError> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(0);
    }

    let tokens = tokenize(input);
    if tokens.is_empty() {
        return Ok(0);
    }

    let mut parser = Parser::new(tokens);
    parser.parse_all()
}

use std::io::{self, Write};

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush()?;

        let mut line = String::new();
        if stdin.read_line(&mut line)? == 0 {
            break;
        }

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line == ":quit" || line == ":q" {
            break;
        }

        match interpret_tuff(line) {
            Ok(value) => println!("{:?}", value),
            Err(e) => println!("{:?}", e),
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_tuff_empty_string_returns_0() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn interpret_tuff_whitespace_only_returns_0() {
        assert_eq!(interpret_tuff(" "), Ok(0));
    }

    #[test]
    fn interpret_tuff_u8_suffix() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn interpret_tuff_negative_u8_is_err() {
        assert_eq!(interpret_tuff("-100U8"), Err(TuffError::NegativeLiteral));
    }

    #[test]
    fn interpret_tuff_u8_overflow_is_err() {
        assert_eq!(
            interpret_tuff("256U8"),
            Err(TuffError::InvalidLiteral("256U8".to_string()))
        );
    }

    #[test]
    fn interpret_tuff_u16_suffix() {
        assert_eq!(interpret_tuff("500U16"), Ok(500));
    }

    #[test]
    fn interpret_tuff_u16_overflow_is_err() {
        assert_eq!(
            interpret_tuff("65536U16"),
            Err(TuffError::InvalidLiteral("65536U16".to_string()))
        );
    }

    #[test]
    fn interpret_tuff_u32_suffix() {
        assert_eq!(interpret_tuff("70000U32"), Ok(70000));
    }

    #[test]
    fn interpret_tuff_u32_overflow_is_err() {
        assert_eq!(
            interpret_tuff("4294967296U32"),
            Err(TuffError::InvalidLiteral("4294967296U32".to_string()))
        );
    }

    #[test]
    fn interpret_tuff_u64_suffix() {
        assert_eq!(interpret_tuff("100U64"), Ok(100));
    }

    #[test]
    fn interpret_tuff_u64_large_value() {
        assert_eq!(interpret_tuff("3000000000U64"), Ok(3000000000));
    }

    #[test]
    fn interpret_tuff_u64_max_value() {
        assert_eq!(
            interpret_tuff("18446744073709551615U64"),
            Ok(18446744073709551615)
        );
    }

    #[test]
    fn interpret_tuff_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn interpret_tuff_multi_addition() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn interpret_tuff_precedence() {
        assert_eq!(interpret_tuff("1U8 * 2U8 + 3U8"), Ok(5));
    }

    #[test]
    fn interpret_tuff_reverse_precedence() {
        assert_eq!(interpret_tuff("1U8 + 2U8 * 3U8"), Ok(7));
    }

    #[test]
    fn interpret_tuff_parentheses() {
        assert_eq!(interpret_tuff("(1U8 + 2U8) * 3U8"), Ok(9));
    }

    #[test]
    fn interpret_tuff_curly_braces() {
        assert_eq!(interpret_tuff("{ 1U8 + 2U8 } * 3U8"), Ok(9));
    }

    #[test]
    fn interpret_tuff_let_in_block() {
        assert_eq!(interpret_tuff("{ let x : U8 = 1U8 + 2U8; x } * 3U8"), Ok(9));
    }

    #[test]
    fn interpret_tuff_let_with_block_expr() {
        assert_eq!(
            interpret_tuff("let y : U8 = { let x : U8 = 1U8 + 2U8; x } * 3U8; y"),
            Ok(9)
        );
    }

    #[test]
    fn interpret_tuff_let_no_type() {
        assert_eq!(interpret_tuff("let x = 100U8; x"), Ok(100));
    }

    #[test]
    fn interpret_tuff_let_default_i32() {
        assert_eq!(interpret_tuff("let x = 100; x"), Ok(100));
    }

    #[test]
    fn interpret_tuff_mut_assign() {
        assert_eq!(interpret_tuff("let mut x = 0; x = 100; x"), Ok(100));
    }

    #[test]
    fn interpret_tuff_immut_assign_err() {
        assert_eq!(
            interpret_tuff("let x = 0; x = 100; x"),
            Err(TuffError::UnexpectedToken(
                "cannot assign to immutable variable 'x'".to_string()
            ))
        );
    }

    #[test]
    fn interpret_tuff_assign_type_mismatch() {
        assert_eq!(
            interpret_tuff("let mut x = 0U8; x = 100U16; x"),
            Err(TuffError::TypeMismatch)
        );
    }

    #[test]
    fn interpret_tuff_bool() {
        assert_eq!(interpret_tuff("let x : Bool = true; x"), Ok(1));
    }

    #[test]
    fn interpret_tuff_let_reference() {
        assert_eq!(interpret_tuff("let x = 100U8; let y = x; y"), Ok(100));
    }

    #[test]
    fn interpret_tuff_let_no_expr() {
        assert_eq!(interpret_tuff("let x = 100U8;"), Ok(0));
    }

    #[test]
    fn interpret_tuff_let_redeclaration() {
        assert_eq!(
            interpret_tuff("let x = 100U8; let x = 0U8;"),
            Err(TuffError::UnexpectedToken(
                "redeclaration of 'x'".to_string()
            ))
        );
    }

    #[test]
    fn interpret_tuff_type_mismatch() {
        assert_eq!(
            interpret_tuff("let x : U8 = 100U16;"),
            Err(TuffError::TypeMismatch)
        );
    }

    #[test]
    fn interpret_tuff_widening_ok() {
        assert_eq!(interpret_tuff("let x : U16 = 100U8; x"), Ok(100));
    }

    #[test]
    fn interpret_tuff_narrowing_err() {
        assert_eq!(
            interpret_tuff("let x = 100U16; let y : U8 = x;"),
            Err(TuffError::TypeMismatch)
        );
    }
}

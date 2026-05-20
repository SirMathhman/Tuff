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

#[derive(Debug, Clone, Copy, PartialEq)]
enum TypeKind {
    Bool,
    U8,
    U16,
    U32,
    U64,
    I8,
    I16,
    I32,
    I64,
}

fn type_kind(suffix: &str) -> Option<TypeKind> {
    match suffix {
        "Bool" => Some(TypeKind::Bool),
        "U8" => Some(TypeKind::U8),
        "U16" => Some(TypeKind::U16),
        "U32" => Some(TypeKind::U32),
        "U64" => Some(TypeKind::U64),
        "I8" => Some(TypeKind::I8),
        "I16" => Some(TypeKind::I16),
        "I32" => Some(TypeKind::I32),
        "I64" => Some(TypeKind::I64),
        _ => None,
    }
}

fn type_max(kind: TypeKind) -> u64 {
    match kind {
        TypeKind::Bool => 1,
        TypeKind::U8 => 255,
        TypeKind::U16 => 65535,
        TypeKind::U32 => 4_294_967_295,
        TypeKind::U64 => u64::MAX,
        TypeKind::I8 => i8::MAX as u64,
        TypeKind::I16 => i16::MAX as u64,
        TypeKind::I32 => i32::MAX as u64,
        TypeKind::I64 => i64::MAX as u64,
    }
}

#[derive(Debug, Clone, Copy)]
struct TypedValue {
    value: u64,
    kind: TypeKind,
}

fn can_assign(from: TypeKind, to: TypeKind) -> bool {
    if from == to {
        return true;
    }
    match (from, to) {
        // unsigned widening
        (TypeKind::U8, TypeKind::U16 | TypeKind::U32 | TypeKind::U64) => true,
        (TypeKind::U16, TypeKind::U32 | TypeKind::U64) => true,
        (TypeKind::U32, TypeKind::U64) => true,
        // signed widening
        (TypeKind::I8, TypeKind::I16 | TypeKind::I32 | TypeKind::I64) => true,
        (TypeKind::I16, TypeKind::I32 | TypeKind::I64) => true,
        (TypeKind::I32, TypeKind::I64) => true,
        // signed to unsigned (larger capacity)
        (TypeKind::I8, TypeKind::U16 | TypeKind::U32 | TypeKind::U64) => true,
        (TypeKind::I16, TypeKind::U32 | TypeKind::U64) => true,
        (TypeKind::I32, TypeKind::U64) => true,
        _ => false,
    }
}

fn parse_suffixed_literal(token: &str, suffix: &str, kind: TypeKind) -> Option<TypedValue> {
    let literal = token.strip_suffix(suffix)?;
    let n = literal.parse::<u64>().ok()?;
    if n <= type_max(kind) {
        Some(TypedValue { value: n, kind })
    } else {
        None
    }
}

fn parse_negated_signed(
    literal: &str,
    kind: TypeKind,
    full_token: &str,
) -> Result<TypedValue, TuffError> {
    let without_sign = literal.strip_prefix('-').unwrap();
    if let Ok(n) = without_sign.parse::<i64>() {
        let neg = n.checked_neg().ok_or(TuffError::ArithmeticOverflow)?;
        if neg >= -(type_max(kind) as i64 + 1) {
            return Ok(TypedValue {
                value: neg as i64 as u64,
                kind,
            });
        }
    }
    Err(TuffError::InvalidLiteral(full_token.to_string()))
}

fn parse_typed_literal(token: &str) -> Result<TypedValue, TuffError> {
    // All suffix patterns: signed first (they allow negatives)
    let suffix_list: [(&str, TypeKind); 8] = [
        ("I8", TypeKind::I8),
        ("I16", TypeKind::I16),
        ("I32", TypeKind::I32),
        ("I64", TypeKind::I64),
        ("U8", TypeKind::U8),
        ("U16", TypeKind::U16),
        ("U32", TypeKind::U32),
        ("U64", TypeKind::U64),
    ];
    for &(suffix, kind) in &suffix_list {
        if !token.ends_with(suffix) {
            continue;
        }
        let literal = token.strip_suffix(suffix).unwrap();
        if literal.starts_with('-') {
            match kind {
                TypeKind::I8 | TypeKind::I16 | TypeKind::I32 | TypeKind::I64 => {
                    return parse_negated_signed(literal, kind, token);
                }
                _ => return Err(TuffError::NegativeLiteral),
            }
        }
        return match parse_suffixed_literal(token, suffix, kind) {
            Some(tv) => Ok(tv),
            None => Err(TuffError::InvalidLiteral(token.to_string())),
        };
    }

    if token == "true" {
        return Ok(TypedValue {
            value: 1,
            kind: TypeKind::Bool,
        });
    }
    if token == "false" {
        return Ok(TypedValue {
            value: 0,
            kind: TypeKind::Bool,
        });
    }

    if let Ok(n) = token.parse::<i64>() {
        if n >= 0 && (n as u64) <= type_max(TypeKind::I32) {
            return Ok(TypedValue {
                value: n as u64,
                kind: TypeKind::I32,
            });
        }
    }

    Err(TuffError::InvalidLiteral(token.to_string()))
}

fn tokenize(input: &str) -> Vec<String> {
    let two_char_tokens = [
        ("<=", "<="),
        (">=", ">="),
        ("==", "=="),
        ("!=", "!="),
        ("||", "||"),
        ("&&", "&&"),
    ];
    let single_char_tokens = "(){};:<>";

    let mut tokens = Vec::new();
    let mut buf = String::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            i += 1;
        } else if let Some(tok) = two_char_tokens.iter().find(|t| {
            i + 1 < chars.len()
                && c == t.0.chars().next().unwrap()
                && chars[i + 1] == t.0.chars().nth(1).unwrap()
        }) {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            tokens.push(tok.1.to_string());
            i += 2;
        } else if single_char_tokens.contains(c) {
            if !buf.is_empty() {
                tokens.push(std::mem::take(&mut buf));
            }
            tokens.push(c.to_string());
            i += 1;
        } else {
            buf.push(c);
            i += 1;
        }
    }
    if !buf.is_empty() {
        tokens.push(buf);
    }
    tokens
}

fn to_i64(tv: TypedValue) -> i64 {
    match tv.kind {
        TypeKind::I8 => tv.value as i8 as i64,
        TypeKind::I16 => tv.value as i16 as i64,
        TypeKind::I32 => tv.value as i32 as i64,
        TypeKind::I64 => tv.value as i64,
        _ => tv.value as i64,
    }
}

struct Parser {
    tokens: Vec<String>,
    pos: usize,
    scopes: Vec<HashMap<String, (TypedValue, bool)>>,
}

impl Parser {
    fn new(tokens: Vec<String>) -> Self {
        Parser {
            tokens,
            pos: 0,
            scopes: vec![HashMap::new()],
        }
    }

    fn combine(
        acc: TypedValue,
        b: TypedValue,
        checked_op: impl FnOnce(u64, u64) -> Option<u64>,
    ) -> Result<TypedValue, TuffError> {
        let max_acc = type_max(acc.kind);
        let max_b = type_max(b.kind);
        let result_kind = if max_acc >= max_b { acc.kind } else { b.kind };
        Ok(TypedValue {
            value: checked_op(acc.value, b.value).ok_or(TuffError::ArithmeticOverflow)?,
            kind: result_kind,
        })
    }

    fn parse_expr(&mut self) -> Result<TypedValue, TuffError> {
        self.parse_or_expr()
    }

    fn parse_or_expr(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_and_expr()?;
        while self.pos < self.tokens.len() && self.tokens[self.pos] == "||" {
            self.pos += 1;
            let b = self.parse_and_expr()?;
            let val = if (acc.value != 0) || (b.value != 0) {
                1
            } else {
                0
            };
            acc = TypedValue {
                value: val,
                kind: TypeKind::Bool,
            };
        }
        Ok(acc)
    }

    fn parse_and_expr(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_cmp_expr()?;
        while self.pos < self.tokens.len() && self.tokens[self.pos] == "&&" {
            self.pos += 1;
            let b = self.parse_cmp_expr()?;
            let val = if (acc.value != 0) && (b.value != 0) {
                1
            } else {
                0
            };
            acc = TypedValue {
                value: val,
                kind: TypeKind::Bool,
            };
        }
        Ok(acc)
    }

    fn parse_cmp_expr(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_add_expr()?;
        while self.pos < self.tokens.len() {
            let op = match self.tokens[self.pos].as_str() {
                "<" | ">" | "<=" | ">=" | "==" | "!=" => {
                    self.pos += 1;
                    self.tokens[self.pos - 1].clone()
                }
                _ => break,
            };
            let b = self.parse_add_expr()?;
            acc = TypedValue {
                value: match op.as_str() {
                    "<" => {
                        if acc.value < b.value {
                            1
                        } else {
                            0
                        }
                    }
                    ">" => {
                        if acc.value > b.value {
                            1
                        } else {
                            0
                        }
                    }
                    "<=" => {
                        if acc.value <= b.value {
                            1
                        } else {
                            0
                        }
                    }
                    ">=" => {
                        if acc.value >= b.value {
                            1
                        } else {
                            0
                        }
                    }
                    "==" => {
                        if acc.value == b.value {
                            1
                        } else {
                            0
                        }
                    }
                    _ => {
                        if acc.value != b.value {
                            1
                        } else {
                            0
                        }
                    }
                },
                kind: TypeKind::Bool,
            };
        }
        Ok(acc)
    }

    fn parse_add_expr(&mut self) -> Result<TypedValue, TuffError> {
        let mut acc = self.parse_term()?;
        while self.pos < self.tokens.len() {
            match self.tokens[self.pos].as_str() {
                "+" => {
                    self.pos += 1;
                    acc = Self::combine(acc, self.parse_term()?, u64::checked_add)?;
                }
                "-" => {
                    self.pos += 1;
                    acc = Self::combine(acc, self.parse_term()?, u64::checked_sub)?;
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
                    acc = Self::combine(acc, self.parse_factor()?, u64::checked_mul)?;
                }
                "/" => {
                    self.pos += 1;
                    acc = Self::combine(acc, self.parse_factor()?, u64::checked_div)?;
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
            kind: TypeKind::I32,
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
        let t = token;
        !t.ends_with("U8")
            && !t.ends_with("U16")
            && !t.ends_with("U32")
            && !t.ends_with("U64")
            && !t.ends_with("I8")
            && !t.ends_with("I16")
            && !t.ends_with("I32")
            && !t.ends_with("I64")
            && t.chars()
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
            let name = self.tokens[self.pos].clone();
            self.pos += 2;
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
                    if val.kind != pair.0.kind {
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
        let (annotated_kind, explicit_annotation) =
            if self.pos < self.tokens.len() && self.tokens[self.pos] == ":" {
                self.pos += 1;
                if self.pos >= self.tokens.len() {
                    return Err(TuffError::ExpectedType);
                }
                let type_token = self.tokens[self.pos].clone();
                self.pos += 1;
                (type_kind(&type_token).ok_or(TuffError::ExpectedType)?, true)
            } else {
                (TypeKind::I32, false)
            };
        if self.pos >= self.tokens.len() || self.tokens[self.pos] != "=" {
            return Err(TuffError::ExpectedEquals);
        }
        self.pos += 1;
        let val = self.parse_expr()?;
        if explicit_annotation
            && val.kind != annotated_kind
            && !can_assign(val.kind, annotated_kind)
        {
            return Err(TuffError::TypeMismatch);
        }
        let stored_kind = if explicit_annotation {
            annotated_kind
        } else {
            val.kind
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
                        kind: stored_kind,
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
        } else if self.tokens[self.pos] == "if" {
            self.pos += 1;
            let cond = self.parse_expr()?;
            let then_val = self.parse_factor()?;
            if self.pos >= self.tokens.len() || self.tokens[self.pos] != "else" {
                return Err(TuffError::UnexpectedToken("expected 'else'".to_string()));
            }
            self.pos += 1;
            let else_val = self.parse_factor()?;
            Ok(if cond.value != 0 { then_val } else { else_val })
        } else {
            let token = &self.tokens[self.pos];
            for scope in self.scopes.iter().rev() {
                if let Some(&(tv, _)) = scope.get(token) {
                    self.pos += 1;
                    return Ok(tv);
                }
            }
            // Check if it's an undefined variable (but not a keyword)
            if Self::is_ident(token)
                && token != "true"
                && token != "false"
                && token != "if"
                && token != "else"
                && token != "let"
            {
                return Err(TuffError::UndefinedVariable(token.clone()));
            }
            let lit = parse_typed_literal(token)?;
            self.pos += 1;
            Ok(lit)
        }
    }

    fn parse_all(&mut self) -> Result<i64, TuffError> {
        let mut value = TypedValue {
            value: 0,
            kind: TypeKind::I32,
        };
        while self.pos < self.tokens.len() {
            value = self.parse_one_stmt(value)?;
        }
        Ok(to_i64(value))
    }
}

fn interpret_tuff(input: &str) -> Result<i64, TuffError> {
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
            Ok(v) => println!("{:?}", v),
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
        assert_eq!(interpret_tuff("18446744073709551615U64"), Ok(-1i64));
    }
    #[test]
    fn interpret_tuff_if_expr() {
        assert_eq!(interpret_tuff("let x = if (true) 3 else 5; x"), Ok(3));
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
    fn interpret_tuff_mut_in_block() {
        assert_eq!(interpret_tuff("let mut x = 0; { x = 3; } x"), Ok(3));
    }
    #[test]
    fn interpret_tuff_scope_err() {
        assert_eq!(
            interpret_tuff("{ let mut x = 0; } x"),
            Err(TuffError::UndefinedVariable("x".to_string()))
        );
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
    fn interpret_tuff_assign_bool_to_u8_err() {
        assert_eq!(
            interpret_tuff("let mut x = 100U8; x = true; x"),
            Err(TuffError::TypeMismatch)
        );
    }
    #[test]
    fn interpret_tuff_logical_or() {
        assert_eq!(interpret_tuff("let x = true; let y = false; x || y"), Ok(1));
    }
    #[test]
    fn interpret_tuff_logical_and() {
        assert_eq!(interpret_tuff("let x = true; let y = false; x && y"), Ok(0));
    }
    #[test]
    fn interpret_tuff_less_than() {
        assert_eq!(interpret_tuff("let x = 1; let y = 2; x < y"), Ok(1));
    }
    #[test]
    fn interpret_tuff_assign_int_to_bool_err() {
        assert_eq!(
            interpret_tuff("let mut x = true; x = 100; x"),
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
    fn interpret_tuff_signed_negative() {
        assert_eq!(interpret_tuff("-100I8"), Ok(-100));
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
    #[test]
    fn interpret_tuff_bool_to_u8_err() {
        assert_eq!(
            interpret_tuff("let x = true; let y : U8 = x;"),
            Err(TuffError::TypeMismatch)
        );
    }
}

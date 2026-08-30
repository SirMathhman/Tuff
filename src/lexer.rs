use crate::errors::Error;
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Number(i64),
    Ident(String),
    Let,
    Mut,
    True,
    Plus,
    Minus,
    Star,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Semicolon,
    Eq,
    Amp,
}

impl Token {
    /// A short human-readable form of the token, used in diagnostics.
    pub fn describe(&self) -> String {
        match self {
            Token::Number(n) => n.to_string(),
            Token::Ident(s) => s.clone(),
            Token::Let => "let".to_string(),
            Token::Mut => "mut".to_string(),
            Token::True => "true".to_string(),
            Token::Plus => "+".to_string(),
            Token::Minus => "-".to_string(),
            Token::Star => "*".to_string(),
            Token::LParen => "(".to_string(),
            Token::RParen => ")".to_string(),
            Token::LBrace => "{".to_string(),
            Token::RBrace => "}".to_string(),
            Token::Semicolon => ";".to_string(),
            Token::Eq => "=".to_string(),
            Token::Amp => "&".to_string(),
        }
    }
}

/// A token together with its position in the original source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpannedToken {
    pub token: Token,
    pub span: Span,
}

/// Convert source text into a token stream.
///
/// The lexer only rejects what is lexically invalid (bad characters,
/// malformed numbers). Structural validation (operator/operand ordering,
/// balanced parentheses) is the parser's job.
pub fn lex(input: &str) -> Result<Vec<SpannedToken>, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let base = input.len() - input.trim_start().len();
    let chars: Vec<char> = trimmed.chars().collect();
    let mut pos = 0;
    let mut tokens: Vec<SpannedToken> = Vec::new();

    while pos < chars.len() {
        pos = skip_whitespace(&chars, pos);
        if pos >= chars.len() {
            break;
        }
        match chars[pos] {
            '+' => {
                tokens.push(spanned(Token::Plus, base, pos, 1));
                pos += 1;
            }
            '-' => {
                // The lexer always emits Minus; the parser decides whether
                // it is unary (negative) or binary (subtraction).
                tokens.push(spanned(Token::Minus, base, pos, 1));
                pos += 1;
            }
            '*' => {
                tokens.push(spanned(Token::Star, base, pos, 1));
                pos += 1;
            }
            '(' => {
                tokens.push(spanned(Token::LParen, base, pos, 1));
                pos += 1;
            }
            ')' => {
                tokens.push(spanned(Token::RParen, base, pos, 1));
                pos += 1;
            }
            '{' => {
                tokens.push(spanned(Token::LBrace, base, pos, 1));
                pos += 1;
            }
            '}' => {
                tokens.push(spanned(Token::RBrace, base, pos, 1));
                pos += 1;
            }
            ';' => {
                tokens.push(spanned(Token::Semicolon, base, pos, 1));
                pos += 1;
            }
            '=' => {
                tokens.push(spanned(Token::Eq, base, pos, 1));
                pos += 1;
            }
            '&' => {
                tokens.push(spanned(Token::Amp, base, pos, 1));
                pos += 1;
            }
            _ => {
                if chars[pos].is_ascii_alphabetic() {
                    let (ident, new_pos) = parse_ident(&chars, pos);
                    let token = keyword_or_ident(ident);
                    tokens.push(spanned(token, base, pos, new_pos - pos));
                    pos = new_pos;
                } else {
                    let (val, new_pos) = parse_number(&chars, pos, base)?;
                    tokens.push(spanned(Token::Number(val), base, pos, new_pos - pos));
                    pos = new_pos;
                }
            }
        }
    }
    Ok(tokens)
}

fn spanned(token: Token, base: usize, start: usize, len: usize) -> SpannedToken {
    SpannedToken {
        token,
        span: Span {
            start: base + start,
            end: base + start + len,
        },
    }
}

fn skip_whitespace(chars: &[char], pos: usize) -> usize {
    let mut p = pos;
    while p < chars.len() && chars[p].is_whitespace() {
        p += 1;
    }
    p
}

fn parse_ident(chars: &[char], mut pos: usize) -> (String, usize) {
    let start = pos;
    while pos < chars.len() && (chars[pos].is_ascii_alphanumeric() || chars[pos] == '_') {
        pos += 1;
    }
    let ident: String = chars[start..pos].iter().collect();
    (ident, pos)
}

/// Convert an identifier string to a keyword token if it matches a
/// reserved word, otherwise return it as a regular `Ident`.
fn keyword_or_ident(ident: String) -> Token {
    match ident.as_str() {
        "let" => Token::Let,
        "mut" => Token::Mut,
        "true" => Token::True,
        _ => Token::Ident(ident),
    }
}

fn parse_number(chars: &[char], mut pos: usize, base: usize) -> Result<(i64, usize), Error> {
    let start = pos;
    let mut num_str = String::new();
    while pos < chars.len() && chars[pos].is_ascii_digit() {
        num_str.push(chars[pos]);
        pos += 1;
    }
    if num_str.is_empty() {
        return Err(Error::UnexpectedChar {
            span: Span {
                start: base + start,
                end: base + start + 1,
            },
            ch: chars[start],
        });
    }
    let val: i64 = num_str.parse().map_err(|_| Error::InvalidNumber {
        span: Span {
            start: base + start,
            end: base + pos,
        },
        text: num_str,
    })?;
    Ok((val, pos))
}

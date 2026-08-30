use crate::errors::Error;
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Number(i64),
    Ident(String),
    Let,
    Mut,
    True,
    False,
    Plus,
    Minus,
    Star,
    LParen,
    RParen,
    LBrace,
    RBrace,
    Semicolon,
    Eq,
    EqEq,
    Lt,
    Amp,
    Or,
    And,
    Not,
    If,
    Else,
    PlusEq,
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
            Token::False => "false".to_string(),
            Token::Plus => "+".to_string(),
            Token::Minus => "-".to_string(),
            Token::Star => "*".to_string(),
            Token::LParen => "(".to_string(),
            Token::RParen => ")".to_string(),
            Token::LBrace => "{".to_string(),
            Token::RBrace => "}".to_string(),
            Token::Semicolon => ";".to_string(),
            Token::Eq => "=".to_string(),
            Token::EqEq => "==".to_string(),
            Token::Lt => "<".to_string(),
            Token::Amp => "&".to_string(),
            Token::Or => "||".to_string(),
            Token::And => "&&".to_string(),
            Token::Not => "!".to_string(),
            Token::If => "if".to_string(),
            Token::Else => "else".to_string(),
            Token::PlusEq => "+=".to_string(),
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
        let (token, new_pos) = next_token(&chars, pos, base)?;
        tokens.push(spanned(token, base, pos, new_pos - pos));
        pos = new_pos;
    }
    Ok(tokens)
}

/// Lex a single token starting at `chars[pos]`, returning the token and the
/// position just past it. `base` is the offset of the trimmed input within
/// the original source, used to build real spans.
fn next_token(chars: &[char], pos: usize, base: usize) -> Result<(Token, usize), Error> {
    match chars[pos] {
        '+' => {
            // '+=' is the compound-addition operator; a lone '+' is addition.
            if chars.get(pos + 1) == Some(&'=') {
                Ok((Token::PlusEq, pos + 2))
            } else {
                Ok((Token::Plus, pos + 1))
            }
        }
        '-' => {
            // The lexer always emits Minus; the parser decides whether
            // it is unary (negative) or binary (subtraction).
            Ok((Token::Minus, pos + 1))
        }
        '*' => Ok((Token::Star, pos + 1)),
        '(' => Ok((Token::LParen, pos + 1)),
        ')' => Ok((Token::RParen, pos + 1)),
        '{' => Ok((Token::LBrace, pos + 1)),
        '}' => Ok((Token::RBrace, pos + 1)),
        ';' => Ok((Token::Semicolon, pos + 1)),
        '=' => {
            // '==' is the equality operator; a lone '=' is assignment.
            if chars.get(pos + 1) == Some(&'=') {
                Ok((Token::EqEq, pos + 2))
            } else {
                Ok((Token::Eq, pos + 1))
            }
        }
        '!' => Ok((Token::Not, pos + 1)),
        '<' => Ok((Token::Lt, pos + 1)),
        '&' => {
            // '&&' is the logical-and operator; a lone '&' is a reference.
            if chars.get(pos + 1) == Some(&'&') {
                Ok((Token::And, pos + 2))
            } else {
                Ok((Token::Amp, pos + 1))
            }
        }
        '|' => {
            // '||' is the logical-or operator; a lone '|' is invalid.
            if chars.get(pos + 1) == Some(&'|') {
                Ok((Token::Or, pos + 2))
            } else {
                Err(Error::UnexpectedChar {
                    span: Span {
                        start: base + pos,
                        end: base + pos + 1,
                    },
                    ch: '|',
                })
            }
        }
        _ => {
            if chars[pos].is_ascii_alphabetic() {
                let (ident, new_pos) = parse_ident(chars, pos);
                Ok((keyword_or_ident(ident), new_pos))
            } else {
                let (val, new_pos) = parse_number(chars, pos, base)?;
                Ok((Token::Number(val), new_pos))
            }
        }
    }
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
        "false" => Token::False,
        "if" => Token::If,
        "else" => Token::Else,
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

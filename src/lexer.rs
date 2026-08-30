use crate::errors::{Error, Span};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Number(i64),
    Plus,
    Minus,
    Star,
    LParen,
    RParen,
}

impl Token {
    /// A short human-readable form of the token, used in diagnostics.
    pub fn describe(&self) -> String {
        match self {
            Token::Number(n) => n.to_string(),
            Token::Plus => "+".to_string(),
            Token::Minus => "-".to_string(),
            Token::Star => "*".to_string(),
            Token::LParen => "(".to_string(),
            Token::RParen => ")".to_string(),
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
        let is_operand_start = tokens.is_empty()
            || matches!(
                tokens.last().map(|t| &t.token),
                Some(Token::Plus) | Some(Token::Minus) | Some(Token::Star) | Some(Token::LParen)
            );
        match chars[pos] {
            '+' => {
                tokens.push(spanned(Token::Plus, base, pos, 1));
                pos += 1;
            }
            '-' => {
                // A '-' is a negative sign when it starts an operand
                // (at the beginning, after an operator, or after '(');
                // otherwise it is a subtraction operator.
                if is_operand_start {
                    let (val, new_pos) = parse_number(&chars, pos, true, base)?;
                    tokens.push(spanned(Token::Number(val), base, pos, new_pos - pos));
                    pos = new_pos;
                } else {
                    tokens.push(spanned(Token::Minus, base, pos, 1));
                    pos += 1;
                }
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
            _ => {
                let (val, new_pos) = parse_number(&chars, pos, false, base)?;
                tokens.push(spanned(Token::Number(val), base, pos, new_pos - pos));
                pos = new_pos;
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

fn parse_number(
    chars: &[char],
    mut pos: usize,
    allow_negative: bool,
    base: usize,
) -> Result<(i64, usize), Error> {
    let start = pos;
    let mut num_str = String::new();
    if allow_negative && chars[pos] == '-' {
        num_str.push('-');
        pos += 1;
    }
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
    if num_str == "-" {
        return Err(Error::InvalidNumber {
            span: Span {
                start: base + start,
                end: base + pos,
            },
            text: num_str,
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

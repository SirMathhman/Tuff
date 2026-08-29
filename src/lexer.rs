use crate::errors::{Error, Span};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Number(i64),
    Plus,
    Minus,
    Star,
}

pub fn lex(input: &str) -> Result<Vec<Token>, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let base = input.len() - input.trim_start().len();
    let chars: Vec<char> = trimmed.chars().collect();
    let mut pos = 0;
    let mut tokens: Vec<Token> = Vec::new();
    let mut last_op_span: Option<Span> = None;

    while pos < chars.len() {
        pos = skip_whitespace(&chars, pos);
        if pos >= chars.len() {
            break;
        }
        let is_operand_start = tokens.is_empty()
            || matches!(
                tokens.last(),
                Some(Token::Plus) | Some(Token::Minus) | Some(Token::Star)
            );
        match chars[pos] {
            '+' | '*' => {
                if is_operand_start {
                    return Err(Error::UnexpectedChar {
                        span: Span {
                            start: base + pos,
                            end: base + pos + 1,
                        },
                        ch: chars[pos],
                    });
                }
                tokens.push(if chars[pos] == '+' {
                    Token::Plus
                } else {
                    Token::Star
                });
                last_op_span = Some(Span {
                    start: base + pos,
                    end: base + pos + 1,
                });
                pos += 1;
            }
            '-' => {
                if is_operand_start {
                    let (val, new_pos) = parse_number(&chars, pos, true, base)?;
                    tokens.push(Token::Number(val));
                    pos = new_pos;
                } else {
                    tokens.push(Token::Minus);
                    last_op_span = Some(Span {
                        start: base + pos,
                        end: base + pos + 1,
                    });
                    pos += 1;
                }
            }
            _ => {
                let (val, new_pos) = parse_number(&chars, pos, false, base)?;
                tokens.push(Token::Number(val));
                pos = new_pos;
            }
        }
    }
    // A trailing operator with no operand is malformed
    if matches!(
        tokens.last(),
        Some(Token::Plus) | Some(Token::Minus) | Some(Token::Star)
    ) {
        let span = last_op_span.unwrap();
        let ch = match tokens.last().unwrap() {
            Token::Plus => '+',
            Token::Minus => '-',
            Token::Star => '*',
            _ => unreachable!(),
        };
        return Err(Error::UnexpectedChar { span, ch });
    }
    Ok(tokens)
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

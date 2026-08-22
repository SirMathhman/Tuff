use crate::Span;

/// A lexical token with its source span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    Num(i64, Span),
    Plus(Span),
    Minus(Span),
    Star(Span),
    LParen(Span),
    RParen(Span),
    LBrace(Span),
    RBrace(Span),
    Ident(String, Span),
    Let(Span),
    Eq(Span),
    Semi(Span),
}

/// Convert source text into a flat list of tokens.
pub fn lex(input: &str) -> Result<Vec<Token>, crate::TuffError> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut pos = 0;
    while pos < chars.len() {
        let c = chars[pos];
        if c.is_whitespace() {
            pos += 1;
        } else if c.is_ascii_digit() {
            let start = pos;
            while pos < chars.len() && chars[pos].is_ascii_digit() {
                pos += 1;
            }
            let digits: String = chars[start..pos].iter().collect();
            let value = digits.parse().map_err(|_| crate::TuffError::Lex {
                span: Span { start, end: pos },
                message: "number out of range".to_string(),
            })?;
            tokens.push(Token::Num(value, Span { start, end: pos }));
        } else if c == '+' || c == '-' || c == '*' {
            tokens.push(match c {
                '+' => Token::Plus(Span {
                    start: pos,
                    end: pos + 1,
                }),
                '-' => Token::Minus(Span {
                    start: pos,
                    end: pos + 1,
                }),
                _ => Token::Star(Span {
                    start: pos,
                    end: pos + 1,
                }),
            });
            pos += 1;
        } else if c == '(' || c == ')' {
            tokens.push(if c == '(' {
                Token::LParen(Span {
                    start: pos,
                    end: pos + 1,
                })
            } else {
                Token::RParen(Span {
                    start: pos,
                    end: pos + 1,
                })
            });
            pos += 1;
        } else if c == '{' || c == '}' {
            tokens.push(if c == '{' {
                Token::LBrace(Span {
                    start: pos,
                    end: pos + 1,
                })
            } else {
                Token::RBrace(Span {
                    start: pos,
                    end: pos + 1,
                })
            });
            pos += 1;
        } else if c.is_ascii_alphabetic() || c == '_' {
            let start = pos;
            while pos < chars.len()
                && (chars[pos].is_ascii_alphabetic()
                    || chars[pos].is_ascii_digit()
                    || chars[pos] == '_')
            {
                pos += 1;
            }
            let word: String = chars[start..pos].iter().collect();
            let span = Span { start, end: pos };
            tokens.push(if word == "let" {
                Token::Let(span)
            } else {
                Token::Ident(word, span)
            });
        } else if c == '=' {
            tokens.push(Token::Eq(Span {
                start: pos,
                end: pos + 1,
            }));
            pos += 1;
        } else if c == ';' {
            tokens.push(Token::Semi(Span {
                start: pos,
                end: pos + 1,
            }));
            pos += 1;
        } else {
            return Err(crate::TuffError::Lex {
                span: Span {
                    start: pos,
                    end: pos + 1,
                },
                message: format!("unexpected character '{c}'"),
            });
        }
    }
    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexes_number_and_operators() {
        assert_eq!(
            lex("1 + 2"),
            Ok(vec![
                Token::Num(1, Span { start: 0, end: 1 }),
                Token::Plus(Span { start: 2, end: 3 }),
                Token::Num(2, Span { start: 4, end: 5 }),
            ])
        );
    }

    #[test]
    fn lexes_empty_input_as_no_tokens() {
        assert_eq!(lex(""), Ok(vec![]));
    }

    #[test]
    fn rejects_unexpected_character() {
        assert_eq!(
            lex("1 @"),
            Err(crate::TuffError::Lex {
                span: Span { start: 2, end: 3 },
                message: "unexpected character '@'".to_string(),
            })
        );
    }

    #[test]
    fn lexes_let_binding() {
        assert_eq!(
            lex("let x = 1;"),
            Ok(vec![
                Token::Let(Span { start: 0, end: 3 }),
                Token::Ident("x".to_string(), Span { start: 4, end: 5 }),
                Token::Eq(Span { start: 6, end: 7 }),
                Token::Num(1, Span { start: 8, end: 9 }),
                Token::Semi(Span { start: 9, end: 10 }),
            ])
        );
    }
}

use crate::Span;

/// A lexical token with its source span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Token {
    /// An integer literal.
    Num(i64, Span),
    /// `+`
    Plus(Span),
    /// `-`
    Minus(Span),
    /// `*`
    Star(Span),
    /// `/`
    Slash(Span),
    /// `(`
    LParen(Span),
    /// `)`
    RParen(Span),
    /// `{`
    LBrace(Span),
    /// `}`
    RBrace(Span),
    /// A variable name.
    Ident(String, Span),
    /// The `let` keyword.
    Let(Span),
    /// The `mut` keyword.
    Mut(Span),
    /// `=`
    Eq(Span),
    /// `==`
    EqEq(Span),
    /// `!=`
    Ne(Span),
    /// `<`
    Lt(Span),
    /// `<=`
    LtEq(Span),
    /// `>`
    Gt(Span),
    /// `>=`
    GtEq(Span),
    /// `[`
    LBracket(Span),
    /// `]`
    RBracket(Span),
    /// `,`
    Comma(Span),
    /// `;`
    Semi(Span),
    /// `&`
    Ref(Span),
    /// `&mut`
    MutRef(Span),
    /// The `if` keyword.
    If(Span),
    /// The `else` keyword.
    Else(Span),
    /// A boolean literal (`true` or `false`).
    Bool(bool, Span),
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
            let value = digits
                .parse()
                .map_err(|_| crate::TuffError::NumberOutOfRange {
                    span: Span { start, end: pos },
                })?;
            tokens.push(Token::Num(value, Span { start, end: pos }));
        } else if c == '=' && chars.get(pos + 1) == Some(&'=') {
            tokens.push(Token::EqEq(Span {
                start: pos,
                end: pos + 2,
            }));
            pos += 2;
        } else if let Some((token, advance)) = two_char_comparison(c, chars.get(pos + 1), pos) {
            tokens.push(token);
            pos += advance;
        } else if let Some(token) = single_char_token(
            c,
            Span {
                start: pos,
                end: pos + 1,
            },
        ) {
            tokens.push(token);
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
            tokens.push(match word.as_str() {
                "let" => Token::Let(span),
                "mut" => Token::Mut(span),
                "if" => Token::If(span),
                "else" => Token::Else(span),
                "true" => Token::Bool(true, span),
                "false" => Token::Bool(false, span),
                _ => Token::Ident(word, span),
            });
        } else if c == '&' {
            let (token, advance) = lex_ref(&chars, pos);
            tokens.push(token);
            pos += advance;
        } else {
            return Err(crate::TuffError::UnexpectedChar {
                span: Span {
                    start: pos,
                    end: pos + 1,
                },
                ch: c,
            });
        }
    }
    Ok(tokens)
}

/// The token for a single-character operator or delimiter, if any.
fn single_char_token(c: char, span: Span) -> Option<Token> {
    Some(match c {
        '+' => Token::Plus(span),
        '-' => Token::Minus(span),
        '*' => Token::Star(span),
        '/' => Token::Slash(span),
        '(' => Token::LParen(span),
        ')' => Token::RParen(span),
        '{' => Token::LBrace(span),
        '}' => Token::RBrace(span),
        '=' => Token::Eq(span),
        '<' => Token::Lt(span),
        '>' => Token::Gt(span),
        '[' => Token::LBracket(span),
        ']' => Token::RBracket(span),
        ',' => Token::Comma(span),
        ';' => Token::Semi(span),
        _ => return None,
    })
}

/// The token for a two-character comparison operator (`<=`, `>=`, `!=`),
/// if the given characters form one.
fn two_char_comparison(c: char, next: Option<&char>, pos: usize) -> Option<(Token, usize)> {
    let span = Span {
        start: pos,
        end: pos + 2,
    };
    Some(match (c, next) {
        ('<', Some('=')) => (Token::LtEq(span), 2),
        ('>', Some('=')) => (Token::GtEq(span), 2),
        ('!', Some('=')) => (Token::Ne(span), 2),
        _ => return None,
    })
}

/// Lex a `&` or `&mut` reference token at the given position,
/// returning the token and how many characters to advance.
fn lex_ref(chars: &[char], pos: usize) -> (Token, usize) {
    let mut_end = pos + 1;
    let is_mut = chars.get(mut_end) == Some(&'m')
        && chars.get(mut_end + 1) == Some(&'u')
        && chars.get(mut_end + 2) == Some(&'t')
        && chars
            .get(mut_end + 3)
            .is_none_or(|c| !c.is_alphanumeric() && *c != '_');
    if is_mut {
        (
            Token::MutRef(Span {
                start: pos,
                end: pos + 4,
            }),
            4,
        )
    } else {
        (
            Token::Ref(Span {
                start: pos,
                end: pos + 1,
            }),
            1,
        )
    }
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
            Err(crate::TuffError::UnexpectedChar {
                span: Span { start: 2, end: 3 },
                ch: '@',
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

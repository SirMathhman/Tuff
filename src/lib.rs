mod errors;
pub use errors::Error;

pub fn evaluate(input: &str) -> Result<i64, Error> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let base = input.len() - input.trim_start().len();
    let chars: Vec<char> = trimmed.chars().collect();
    let terms = parse_terms(&chars, base)?;
    Ok(fold_terms(&terms))
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
            span: errors::Span {
                start: base + start,
                end: base + start + 1,
            },
            ch: chars[start],
        });
    }
    if num_str == "-" {
        return Err(Error::InvalidNumber {
            span: errors::Span {
                start: base + start,
                end: base + pos,
            },
            text: num_str,
        });
    }
    let val: i64 = num_str.parse().map_err(|_| Error::InvalidNumber {
        span: errors::Span {
            start: base + start,
            end: base + pos,
        },
        text: num_str,
    })?;
    Ok((val, pos))
}

fn parse_terms(chars: &[char], base: usize) -> Result<Vec<(char, i64)>, Error> {
    let mut pos = 0;
    let mut terms: Vec<(char, i64)> = Vec::new();
    let mut pending_op: Option<char> = None;

    while pos < chars.len() {
        pos = skip_whitespace(chars, pos);
        if pos >= chars.len() {
            break;
        }

        let allow_neg =
            pending_op.is_none() || matches!(pending_op, Some('+') | Some('-') | Some('*'));
        let (val, new_pos) = parse_number(chars, pos, allow_neg, base)?;
        let op = pending_op.take().unwrap_or('+');
        terms.push((op, val));
        pos = new_pos;

        pos = skip_whitespace(chars, pos);
        if pos >= chars.len() {
            break;
        }

        if matches!(chars[pos], '+' | '-' | '*') {
            pending_op = Some(chars[pos]);
            pos += 1;
        } else {
            return Err(Error::UnexpectedChar {
                span: errors::Span {
                    start: base + pos,
                    end: base + pos + 1,
                },
                ch: chars[pos],
            });
        }
    }
    Ok(terms)
}

fn fold_terms(terms: &[(char, i64)]) -> i64 {
    // Pass 1: fold * into terms
    let mut folded: Vec<(char, i64)> = Vec::new();
    for &(op, val) in terms {
        if op == '*' {
            if let Some((_, prev_val)) = folded.last_mut() {
                *prev_val *= val;
            }
        } else {
            folded.push((op, val));
        }
    }
    // Pass 2: fold + and -
    folded.iter().fold(0i64, |total, &(op, val)| match op {
        '+' => total + val,
        '-' => total - val,
        _ => unreachable!(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_empty_string() {
        assert_eq!(evaluate(""), Ok(0));
    }

    #[test]
    fn test_evaluate_single_digit() {
        assert_eq!(evaluate("1"), Ok(1));
    }

    #[test]
    fn test_evaluate_addition() {
        assert_eq!(evaluate("1 + 2"), Ok(3));
    }

    #[test]
    fn test_evaluate_chained_addition() {
        assert_eq!(evaluate("1 + 2 + 3"), Ok(6));
    }

    #[test]
    fn test_evaluate_addition_and_subtraction() {
        assert_eq!(evaluate("2 + 3 - 4"), Ok(1));
    }

    #[test]
    fn test_evaluate_multiplication_precedence() {
        assert_eq!(evaluate("2 * 3 + 4"), Ok(10));
    }

    #[test]
    fn test_evaluate_addition_before_multiplication() {
        assert_eq!(evaluate("2 + 3 * 4"), Ok(14));
    }

    #[test]
    fn test_evaluate_invalid_input() {
        match evaluate("1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 4, end: 5 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_span_with_leading_whitespace() {
        match evaluate("  1 + x") {
            Err(Error::UnexpectedChar { span, ch }) => {
                assert_eq!(ch, 'x');
                assert_eq!(span, errors::Span { start: 6, end: 7 });
            }
            other => panic!("expected UnexpectedChar, got {:?}", other),
        }
    }
}

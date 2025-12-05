use crate::range_check::SUFFIXES;

pub fn tokenize_expr(expr: &str) -> Result<Vec<String>, String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut last_was_op = true;

    fn push_op_local(tokens: &mut Vec<String>, cur: &mut String, ch: char, last_was_op: &mut bool) {
        if !cur.trim().is_empty() {
            tokens.push(cur.trim().to_string());
            cur.clear();
        }
        tokens.push(ch.to_string());
        *last_was_op = true;
    }

    for ch in expr.chars() {
        match ch {
            '+' | '-' => {
                if last_was_op {
                    cur.push(ch);
                } else {
                    push_op_local(&mut tokens, &mut cur, ch, &mut last_was_op);
                    continue;
                }
                last_was_op = true;
            }
            '*' => {
                if last_was_op {
                    return Err("invalid expression".to_string());
                }
                push_op_local(&mut tokens, &mut cur, ch, &mut last_was_op);
            }
            '(' => {
                push_op_local(&mut tokens, &mut cur, ch, &mut last_was_op);
            }
            ')' => {
                push_op_local(&mut tokens, &mut cur, ch, &mut last_was_op);
                last_was_op = false;
            }
            c if c.is_whitespace() => {
                if !cur.is_empty() {
                    cur.push(c);
                }
            }
            other => {
                cur.push(other);
                last_was_op = false;
            }
        }
    }

    if !cur.trim().is_empty() {
        tokens.push(cur.trim().to_string());
    }
    if tokens.is_empty() {
        return Err("invalid expression".to_string());
    }
    Ok(tokens)
}

pub fn detect_suffix_from_tokens(tokens: &[String]) -> Result<Option<&'static str>, String> {
    let mut seen_suffix: Option<&str> = None;
    for p in tokens {
        for sfx in SUFFIXES {
            if p.ends_with(sfx) {
                if let Some(existing) = seen_suffix {
                    if existing != sfx {
                        return Err("type suffix mismatch".to_string());
                    }
                } else {
                    seen_suffix = Some(sfx);
                }
            }
        }
    }
    Ok(seen_suffix)
}

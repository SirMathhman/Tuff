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

pub fn tokens_to_rpn(tokens: &[String]) -> Result<Vec<String>, String> {
    fn precedence(op: &str) -> i32 {
        match op {
            "*" => 2,
            "+" | "-" => 1,
            _ => 0,
        }
    }

    let mut op_stack: Vec<String> = Vec::new();
    let mut output: Vec<String> = Vec::new();

    for t in tokens {
        if t == "+" || t == "-" || t == "*" {
            while let Some(top) = op_stack.last() {
                if (top == "+" || top == "-" || top == "*") && precedence(top) >= precedence(t) {
                    output.push(
                        op_stack
                            .pop()
                            .ok_or_else(|| "invalid expression".to_string())?,
                    );
                } else {
                    break;
                }
            }
            op_stack.push(t.clone());
        } else if t == "(" {
            op_stack.push(t.clone());
        } else if t == ")" {
            while let Some(top) = op_stack.last() {
                if top == "(" {
                    op_stack.pop();
                    break;
                } else {
                    output.push(
                        op_stack
                            .pop()
                            .ok_or_else(|| "invalid expression".to_string())?,
                    );
                }
            }
        } else {
            output.push(t.clone());
        }
    }

    while let Some(op) = op_stack.pop() {
        if op == "(" || op == ")" {
            return Err("mismatched parentheses".to_string());
        }
        output.push(op);
    }

    Ok(output)
}

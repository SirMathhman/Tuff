use crate::range_check::SUFFIXES;

/// Context for tokenization state
pub struct TokenizerState {
    pub tokens: Vec<String>,
    pub cur: String,
    pub last_was_op: bool,
}

pub fn tokenize_expr(expr: &str) -> Result<Vec<String>, String> {
    let mut state = TokenizerState {
        tokens: Vec::new(),
        cur: String::new(),
        last_was_op: true,
    };

    fn push_op_local(state: &mut TokenizerState, ch: char) {
        if !state.cur.trim().is_empty() {
            state.tokens.push(state.cur.trim().to_string());
            state.cur.clear();
        }
        state.tokens.push(ch.to_string());
        state.last_was_op = true;
    }

    let mut chars = expr.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\'' => {
                if !state.cur.trim().is_empty() {
                    state.tokens.push(state.cur.trim().to_string());
                    state.cur.clear();
                }
                if let Some(char_val) = chars.next() {
                    if let Some(&closing) = chars.peek() {
                        if closing == '\'' {
                            chars.next();
                            state.tokens.push(format!("'{}'", char_val));
                            state.last_was_op = false;
                        } else {
                            return Err("unterminated character literal".to_string());
                        }
                    } else {
                        return Err("unterminated character literal".to_string());
                    }
                } else {
                    return Err("empty character literal".to_string());
                }
            }
            '+' | '-' => {
                if state.last_was_op {
                    state.cur.push(ch);
                } else {
                    push_op_local(&mut state, ch);
                    continue;
                }
                state.last_was_op = true;
            }
            '*' => {
                if state.last_was_op {
                    return Err("invalid expression".to_string());
                }
                push_op_local(&mut state, ch);
            }
            '(' => {
                push_op_local(&mut state, ch);
            }
            ')' => {
                push_op_local(&mut state, ch);
                state.last_was_op = false;
            }
            c if c.is_whitespace() => {
                if !state.cur.is_empty() {
                    state.cur.push(c);
                }
            }
            '<' | '>' | '=' | '!' => {
                // handle multi-character comparison operators
                if !state.cur.trim().is_empty() {
                    state.tokens.push(state.cur.trim().to_string());
                    state.cur.clear();
                }
                let mut op = ch.to_string();
                if let Some(&next_ch) = chars.peek() {
                    if next_ch == '=' {
                        op.push('=');
                        chars.next();
                    } else if ch == '=' {
                        // single '=' is invalid in expressions
                        return Err("invalid expression".to_string());
                    } else if ch == '!' && next_ch != '=' {
                        return Err("invalid expression".to_string());
                    }
                } else if ch == '=' || ch == '!' {
                    return Err("invalid expression".to_string());
                }
                state.tokens.push(op);
                state.last_was_op = true;
                continue;
            }
            other => {
                state.cur.push(other);
                state.last_was_op = false;
            }
        }
    }

    if !state.cur.trim().is_empty() {
        state.tokens.push(state.cur.trim().to_string());
    }
    if state.tokens.is_empty() {
        return Err("invalid expression".to_string());
    }
    Ok(state.tokens)
}

pub fn detect_suffix_from_tokens(tokens: &[String]) -> Result<Option<&'static str>, String> {
    let mut seen_suffix: Option<&str> = None;
    for p in tokens {
        // Check for char literals: 'x'
        if p.starts_with('\'') && p.ends_with('\'') && p.len() == 3 {
            if let Some(existing) = seen_suffix {
                if existing != "Char" {
                    return Err("type suffix mismatch".to_string());
                }
            } else {
                seen_suffix = Some("Char");
            }
        } else {
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
    }
    Ok(seen_suffix)
}

pub fn tokens_to_rpn(tokens: &[String]) -> Result<Vec<String>, String> {
    fn precedence(op: &str) -> i32 {
        match op {
            "*" => 3,
            "+" | "-" => 2,
            "<" | ">" | "<=" | ">=" | "==" | "!=" => 1,
            _ => 0,
        }
    }

    let mut op_stack: Vec<String> = Vec::new();
    let mut output: Vec<String> = Vec::new();

    for t in tokens {
        if t == "+"
            || t == "-"
            || t == "*"
            || t == "<"
            || t == ">"
            || t == "<="
            || t == ">="
            || t == "=="
            || t == "!="
        {
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

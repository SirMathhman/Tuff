/// Tokenize input string into a vector of token strings.
pub fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();

    while let Some(&ch) = chars.peek() {
        if ch.is_whitespace() {
            chars.next();
        } else if ch == '+' && chars.clone().nth(1) == Some('=') {
            // Handle += as a single token (must come before single-char handling)
            chars.next();
            chars.next();
            tokens.push("+=".to_string());
        } else if ch == '=' && chars.clone().nth(1) == Some('>') {
            // Handle => arrow (must come before single = handling)
            chars.next();
            chars.next();
            tokens.push("=>".to_string());
        } else if matches!(
            ch,
            ':' | '(' | ')' | '{' | '}' | '+' | '*' | '/' | '%' | '=' | ';'
        ) {
            tokens.push(ch.to_string());
            chars.next();
        } else if ch == '<' && chars.clone().nth(1) == Some('=') {
            // Handle <= as a single token
            chars.next();
            chars.next();
            tokens.push("<=".to_string());
        } else if ch == '>' && chars.clone().nth(1) == Some('=') {
            // Handle >= as a single token
            chars.next();
            chars.next();
            tokens.push(">=".to_string());
        } else if matches!(ch, '<' | '>') {
            tokens.push(ch.to_string());
            chars.next();
        } else if ch == '&' && *chars.peek().unwrap_or(&' ') == '&' {
            // Handle && as a single token
            chars.next();
            chars.next();
            tokens.push("&&".to_string());
        } else if ch == '|' && *chars.peek().unwrap_or(&' ') == '|' {
            // Handle || as a single token
            chars.next();
            chars.next();
            tokens.push("||".to_string());
        } else if ch == '.' && chars.clone().nth(1) == Some('.') {
            // Handle .. range operator
            chars.next();
            chars.next();
            tokens.push("..".to_string());
        } else if ch == '-'
            && !tokens.is_empty()
            && !matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")
        {
            tokens.push("-".to_string());
            chars.next();
        } else if ch.is_ascii_digit()
            || (ch == '-'
                && (tokens.is_empty()
                    || matches!(&*tokens[tokens.len() - 1], "(" | "+" | "-" | "*")))
        {
            let mut num = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_ascii_digit() || (num.is_empty() && c == '-') {
                    num.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            // Include uppercase type suffix in the token (e.g. "100U8")
            while let Some(&c) = chars.peek() {
                if c.is_ascii_uppercase() || c.is_ascii_digit() {
                    num.push(c);
                    chars.next();
                } else {
                    break;
                }
            }

            tokens.push(num);
        } else if ch.is_alphabetic() || ch == '_' {
            let mut ident = String::new();
            while let Some(&c) = chars.peek() {
                if c.is_alphanumeric() || c == '_' {
                    ident.push(c);
                    chars.next();
                } else {
                    break;
                }
            }
            tokens.push(ident);
        } else {
            chars.next();
        }
    }

    tokens
}

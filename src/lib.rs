// try_eval_addition helper removed — interpret handles expressions inline

// (doc comments moved closer to the public function)

fn split_leading_number(s: &str) -> (String, String, bool, bool) {
    let mut chars = s.chars().peekable();
    let mut out = String::new();

    let mut negative = false;
    if let Some(&c) = chars.peek() {
        if c == '+' || c == '-' {
            if c == '-' {
                negative = true;
            }
            out.push(c);
            chars.next();
        }
    }

    let mut found_digit = false;
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            found_digit = true;
            out.push(c);
            chars.next();
        } else {
            break;
        }
    }

    let remaining: String = chars.collect();
    (out, remaining, negative, found_digit)
}

fn validate_unsigned(digits_str: &str, suf: &str) -> Result<(), String> {
    let digits = digits_str.trim_start_matches('+');
    let v = digits.parse::<u128>().map_err(|_| {
        format!(
            "numeric literal out of range for {}",
            suf.to_ascii_uppercase()
        )
    })?;
    match suf {
        "u8" => {
            if v <= 255 {
                Ok(())
            } else {
                Err("numeric literal out of range for U8".to_string())
            }
        }
        "u16" => {
            if v <= 65535 {
                Ok(())
            } else {
                Err("numeric literal out of range for U16".to_string())
            }
        }
        "u32" => {
            if v <= 4294967295 {
                Ok(())
            } else {
                Err("numeric literal out of range for U32".to_string())
            }
        }
        "u64" => {
            if v <= 18446744073709551615u128 {
                Ok(())
            } else {
                Err("numeric literal out of range for U64".to_string())
            }
        }
        _ => Ok(()),
    }
}

fn validate_signed(out: &str, suf: &str) -> Result<(), String> {
    let v = out.parse::<i128>().map_err(|_| {
        format!(
            "numeric literal out of range for {}",
            suf.to_ascii_uppercase()
        )
    })?;
    match suf {
        "i8" => {
            if (-128..=127).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I8".to_string())
            }
        }
        "i16" => {
            if (-32768..=32767).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I16".to_string())
            }
        }
        "i32" => {
            if (-2147483648..=2147483647).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I32".to_string())
            }
        }
        "i64" => {
            if (-9223372036854775808..=9223372036854775807).contains(&v) {
                Ok(())
            } else {
                Err("numeric literal out of range for I64".to_string())
            }
        }
        _ => Ok(()),
    }
}

// binary helper functions removed — we evaluate n-ary expressions in
// `eval_nary_with_suffix` and single/binary expressions are handled by the
// same path, so these helpers are no longer necessary.

// old summing helpers were removed (no longer used after n-ary ops extension)

// precedence helper removed; parser handles precedence and parentheses

fn check_unsigned_suffix_range(suf: &str, acc: i128) -> Result<String, String> {
    match suf {
        "u8" => {
            if (0..=255).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for U8".to_string())
            }
        }
        "u16" => {
            if (0..=65535).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for U16".to_string())
            }
        }
        "u32" => {
            if (0..=4294967295).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for U32".to_string())
            }
        }
        "u64" => {
            if (0..=18446744073709551615i128).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for U64".to_string())
            }
        }
        _ => Err("unsupported unsigned suffix".to_string()),
    }
}

fn check_signed_suffix_range(suf: &str, acc: i128) -> Result<String, String> {
    match suf {
        "i8" => {
            if (-128..=127).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for I8".to_string())
            }
        }
        "i16" => {
            if (-32768..=32767).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for I16".to_string())
            }
        }
        "i32" => {
            if (-2147483648..=2147483647).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for I32".to_string())
            }
        }
        "i64" => {
            if (-9223372036854775808..=9223372036854775807).contains(&acc) {
                Ok(acc.to_string())
            } else {
                Err("numeric literal out of range for I64".to_string())
            }
        }
        _ => Err("unsupported signed suffix".to_string()),
    }
}

fn choose_suffix(rems: &[String]) -> Result<String, String> {
    let mut chosen: Option<String> = None;
    for r in rems {
        if !r.is_empty() {
            match &chosen {
                None => chosen = Some(r.to_ascii_lowercase()),
                Some(existing) if existing.eq_ignore_ascii_case(r) => {}
                _ => return Err("mismatched operand types".to_string()),
            }
        }
    }
    Ok(chosen.unwrap_or_default())
}

type TokenInfo = (Vec<String>, Vec<String>, bool, bool);

fn extract_token_info(
    tokens: &[Token],
) -> Option<Result<TokenInfo, String>> {
    let mut nums: Vec<String> = Vec::new();
    let mut rems: Vec<String> = Vec::new();
    let mut negs: Vec<bool> = Vec::new();
    let mut has_op = false;
    let mut has_paren = false;

    for t in tokens {
        match t {
            Token::Number(s) => {
                let (n, r, neg, found) = split_leading_number(s);
                if !found {
                    return Some(Err("invalid operands".to_string()));
                }
                nums.push(n);
                rems.push(r);
                negs.push(neg);
            }
            Token::Op(_) => has_op = true,
            Token::LParen | Token::RParen => has_paren = true,
        }
    }

    if !has_op && !has_paren {
        return None;
    }

    if nums.is_empty() {
        return Some(Err("invalid operands".to_string()));
    }

    Some(Ok((nums, rems, has_op, has_paren)))
}

fn finalize_result(suf: &str, acc: i128) -> Result<String, String> {
    if suf.is_empty() {
        return Ok(acc.to_string());
    }
    if suf.starts_with('u') {
        if acc < 0 {
            return Err("negative numeric literal with suffix not supported".to_string());
        }
        check_unsigned_suffix_range(suf, acc)
    } else {
        check_signed_suffix_range(suf, acc)
    }
}

#[derive(Debug)]
enum Token {
    Number(String),
    Op(char),
    LParen,
    RParen,
}

fn try_eval_addition(s: &str) -> Option<Result<String, String>> {

    fn is_delimiter(ch: char) -> bool {
        ch.is_ascii_whitespace() || ch == '+' || ch == '-' || ch == '*' || ch == '(' || ch == ')'
    }

    fn parse_number(s: &str, start: &mut usize) {
        let len = s.len();
        let get_byte = |idx: usize| *s.as_bytes().get(idx).unwrap_or(&0);
        while *start < len && get_byte(*start).is_ascii_digit() {
            *start += 1;
        }
        while *start < len && !is_delimiter(get_byte(*start) as char) {
            *start += 1;
        }
    }

    fn tokenize(s: &str) -> Result<Vec<Token>, String> {
        let mut tokens = Vec::new();
        let mut i = 0usize;
        let len = s.len();
        let get_byte = |idx: usize| *s.as_bytes().get(idx).unwrap_or(&0);

        while i < len {
            while i < len && get_byte(i).is_ascii_whitespace() {
                i += 1;
            }
            if i >= len {
                break;
            }

            let ch = get_byte(i) as char;
            match ch {
                '(' => {
                    tokens.push(Token::LParen);
                    i += 1;
                }
                ')' => {
                    tokens.push(Token::RParen);
                    i += 1;
                }
                '+' | '-' | '*' => {
                    let is_signed_number = (ch == '+' || ch == '-')
                        && s.as_bytes()
                            .get(i + 1)
                            .is_some_and(|b| b.is_ascii_digit());

                    if is_signed_number {
                        let start = i;
                        i += 1;
                        parse_number(s, &mut i);
                        tokens.push(Token::Number(s[start..i].to_string()));
                    } else {
                        tokens.push(Token::Op(ch));
                        i += 1;
                    }
                }
                _ if ch.is_ascii_digit() => {
                    let start = i;
                    parse_number(s, &mut i);
                    tokens.push(Token::Number(s[start..i].to_string()));
                }
                _ => return Err("invalid token".to_string()),
            }
        }

        Ok(tokens)
    }

    // tokenize and collect numeric token metadata
    let tokens = match tokenize(s) {
        Ok(toks) => toks,
        Err(e) => return Some(Err(e)),
    };

    let (_nums, rems, _has_op, _has_paren) = match extract_token_info(&tokens) {
        Some(Ok(info)) => info,
        Some(Err(e)) => return Some(Err(e)),
        None => return None,
    };

    // Process suffix and evaluate expression if valid
    let suf = match choose_suffix(&rems) {
        Err(e) => return Some(Err(e)),
        Ok(s) => s,
    };

    // now parse and evaluate full expression (with parentheses and precedence)
    // parse number literal according to suffix
    let parse_literal = |tok: &str| -> Result<i128, String> {
        let (out, _rem, neg, _found) = split_leading_number(tok);
        if suf.starts_with('u') && neg {
            return Err("negative numeric literal with suffix not supported".to_string());
        }
        // unsigned operands are parsed as positive integers
        if suf.starts_with('u') {
            let v = out
                .trim_start_matches('+')
                .parse::<i128>()
                .map_err(|_| "invalid integer".to_string())?;
            Ok(v)
        } else {
            let v = out
                .parse::<i128>()
                .map_err(|_| "invalid integer".to_string())?;
            Ok(v)
        }
    };

    // recursive descent parser
    fn parse_expr_rec(
        toks: &[Token],
        pos: &mut usize,
        suf: &str,
        parse_literal: &dyn Fn(&str) -> Result<i128, String>,
    ) -> Result<i128, String> {
        // expr = term { (+|-) term }
        let mut acc = parse_term_rec(toks, pos, suf, parse_literal)?;
        while *pos < toks.len() {
            match toks.get(*pos) {
                Some(Token::Op('+')) => {
                    *pos += 1;
                    let rhs = parse_term_rec(toks, pos, suf, parse_literal)?;
                    acc = acc.checked_add(rhs).ok_or_else(|| "overflow".to_string())?;
                }
                Some(Token::Op('-')) => {
                    *pos += 1;
                    let rhs = parse_term_rec(toks, pos, suf, parse_literal)?;
                    acc = acc.checked_sub(rhs).ok_or_else(|| "overflow".to_string())?;
                }
                _ => break,
            }
        }
        Ok(acc)
    }

    fn parse_term_rec(
        toks: &[Token],
        pos: &mut usize,
        suf: &str,
        parse_literal: &dyn Fn(&str) -> Result<i128, String>,
    ) -> Result<i128, String> {
        // term = factor { * factor }
        let mut acc = parse_factor_rec(toks, pos, suf, parse_literal)?;
        while *pos < toks.len() {
            match toks.get(*pos) {
                Some(Token::Op('*')) => {
                    *pos += 1;
                    let rhs = parse_factor_rec(toks, pos, suf, parse_literal)?;
                    acc = acc.checked_mul(rhs).ok_or_else(|| "overflow".to_string())?;
                }
                _ => break,
            }
        }
        Ok(acc)
    }

    fn parse_factor_rec(
        toks: &[Token],
        pos: &mut usize,
        suf: &str,
        parse_literal: &dyn Fn(&str) -> Result<i128, String>,
    ) -> Result<i128, String> {
        if *pos >= toks.len() {
            return Err("unexpected end of input".to_string());
        }
        match toks.get(*pos) {
            Some(Token::Number(s)) => {
                *pos += 1;
                parse_literal(s)
            }
            Some(Token::LParen) => {
                *pos += 1;
                let v = parse_expr_rec(toks, pos, suf, parse_literal)?;
                match toks.get(*pos) {
                    Some(Token::RParen) => {
                        *pos += 1;
                        Ok(v)
                    }
                    _ => Err("missing closing parenthesis".to_string()),
                }
            }
            _ => Err("invalid factor".to_string()),
        }
    }

    // now evaluate with parser
    let eval_res = (|| {
        let mut p = 0usize;
        let value = parse_expr_rec(&tokens, &mut p, &suf, &parse_literal)?;
        if p != tokens.len() {
            return Err("extra tokens".to_string());
        }
        Ok(value)
    })();

    match eval_res {
        Err(e) => Some(Err(e)),
        Ok(acc) => Some(finalize_result(&suf, acc)),
    }
}

// old binary eval helper removed — n-ary evaluation covers all cases

/// Interpret the given input string and return a resulting string.
pub fn interpret(input: &str) -> Result<String, String> {
    let s = input.trim();

    // evaluate expression first (if present)
    if let Some(res) = try_eval_addition(s) {
        return res;
    }

    // use module-level helpers for single-literal values
    let (out, remaining, negative, found_digit) = split_leading_number(s);

    if found_digit {
        if !remaining.is_empty() {
            let suf = remaining.to_ascii_lowercase();
            match suf.as_str() {
                "u8" | "u16" | "u32" | "u64" => {
                    if negative {
                        return Err(
                            "negative numeric literal with suffix not supported".to_string()
                        );
                    }
                    validate_unsigned(&out, suf.as_str())?;
                }
                "i8" | "i16" | "i32" | "i64" => {
                    validate_signed(&out, suf.as_str())?;
                }
                _ => {}
            }
        }

        return Ok(out);
    }

    Err("interpret not implemented yet".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_strips_suffixes_like_u8() {
        let res = interpret("100U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "100");
    }

    #[test]
    fn interpret_rejects_negative_with_suffix() {
        let res = interpret("-100U8");
        assert!(res.is_err());
    }

    #[test]
    fn interpret_accepts_max_u8() {
        let res = interpret("255U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "255");
    }

    #[test]
    fn interpret_rejects_overflow_u8() {
        let res = interpret("256U8");
        assert!(res.is_err());
    }

    #[test]
    fn interpret_u16_bounds() {
        assert_eq!(interpret("65535U16").unwrap(), "65535");
        assert!(interpret("65536U16").is_err());
    }

    #[test]
    fn interpret_u32_bounds() {
        assert_eq!(interpret("4294967295U32").unwrap(), "4294967295");
        assert!(interpret("4294967296U32").is_err());
    }

    #[test]
    fn interpret_u64_bounds() {
        assert_eq!(
            interpret("18446744073709551615U64").unwrap(),
            "18446744073709551615"
        );
        assert!(interpret("18446744073709551616U64").is_err());
    }

    #[test]
    fn interpret_i8_bounds() {
        assert_eq!(interpret("127I8").unwrap(), "127");
        assert!(interpret("128I8").is_err());
        assert_eq!(interpret("-128I8").unwrap(), "-128");
        assert!(interpret("-129I8").is_err());
    }

    #[test]
    fn interpret_add_u8() {
        let res = interpret("100U8 + 50U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "150");
    }

    #[test]
    fn interpret_add_u8_overflow() {
        assert!(interpret("200U8 + 100U8").is_err());
    }

    #[test]
    fn interpret_add_typed_and_plain() {
        let res = interpret("100U8 + 50");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "150");
    }

    #[test]
    fn interpret_add_plain_and_typed() {
        let res = interpret("100 + 50U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "150");
    }

    #[test]
    fn interpret_add_plain_plain() {
        let res = interpret("100 + 50");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "150");
    }

    #[test]
    fn interpret_rejects_typed_plus_large_plain() {
        assert!(interpret("100U8 + 200").is_err());
    }

    #[test]
    fn interpret_add_three_u8() {
        let res = interpret("1U8 + 2U8 + 3U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "6");
    }

    #[test]
    fn interpret_subtract_u8_mix() {
        let res = interpret("10U8 - 5U8 + 3U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "8");
    }

    #[test]
    fn interpret_subtract_plain() {
        let res = interpret("10 - 5 + 3");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "8");
    }

    #[test]
    fn interpret_subtract_u8_underflow() {
        assert!(interpret("5U8 - 10U8").is_err());
    }

    #[test]
    fn interpret_subtract_u8_underflow_small() {
        assert!(interpret("3U8 - 5U8").is_err());
    }

    #[test]
    fn interpret_mul_then_add_typed_u8() {
        let res = interpret("10U8 * 2U8 + 1U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "21");
    }

    #[test]
    fn interpret_mul_then_add_plain() {
        let res = interpret("2 * 3 + 1");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "7");
    }

    #[test]
    fn interpret_add_then_mul_typed_u8() {
        let res = interpret("1U8 + 10U8 * 2U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "21");
    }

    #[test]
    fn interpret_mul_overflow_u8() {
        assert!(interpret("20U8 * 100U8").is_err());
    }

    #[test]
    fn interpret_mul_signed_overflow_i8() {
        assert!(interpret("-100I8 * 50I8").is_err());
    }

    #[test]
    fn interpret_parentheses_precedence() {
        let res = interpret("(1U8 + 10U8) * 2U8");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "22");
    }

    #[test]
    fn interpret_rejects_mismatched_suffixes_in_expression() {
        assert!(interpret("100U8 + 50U16").is_err());
    }
}

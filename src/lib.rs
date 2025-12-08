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

fn apply_ops_with_precedence(
    nums: &[String],
    ops: &[char],
    parse_op: &dyn Fn(&str) -> Result<i128, String>,
) -> Result<i128, String> {
    if nums.is_empty() {
        return Err("invalid operands".to_string());
    }
    if nums.is_empty() {
        return Err("invalid operands".to_string());
    }

    // parse all operands first
    let mut values: Vec<i128> = Vec::with_capacity(nums.len());
    for n in nums {
        values.push(parse_op(n)?);
    }

    // first pass: handle multiplication (higher precedence)
    let mut vals2: Vec<i128> = Vec::new();
    let mut ops2: Vec<char> = Vec::new();
    vals2.push(
        *values
            .first()
            .ok_or_else(|| "invalid operands".to_string())?,
    );
    for (i, &op) in ops.iter().enumerate() {
        let rhs = values
            .get(i + 1)
            .ok_or_else(|| "invalid operands".to_string())?;
        if op == '*' {
            let last = vals2
                .last_mut()
                .ok_or_else(|| "invalid operands".to_string())?;
            *last = last
                .checked_mul(*rhs)
                .ok_or_else(|| "overflow".to_string())?;
        } else {
            ops2.push(op);
            vals2.push(*rhs);
        }
    }

    // second pass: handle + and - left-to-right
    let mut acc = *vals2
        .first()
        .ok_or_else(|| "invalid operands".to_string())?;
    for (i, &op) in ops2.iter().enumerate() {
        let rhs = vals2
            .get(i + 1)
            .ok_or_else(|| "invalid operands".to_string())?;
        acc = match op {
            '+' => acc
                .checked_add(*rhs)
                .ok_or_else(|| "overflow".to_string())?,
            '-' => acc
                .checked_sub(*rhs)
                .ok_or_else(|| "overflow".to_string())?,
            _ => return Err("unsupported operator".to_string()),
        };
    }

    Ok(acc)
}

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

type ParseTokens = Result<(Vec<String>, Vec<String>, Vec<bool>, Vec<char>), String>;

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

fn eval_nary_with_ops(
    suf: &str,
    nums: &[String],
    negs: &[bool],
    ops: &[char],
) -> Result<String, String> {
    if nums.is_empty() {
        return Err("invalid operands".to_string());
    }

    // helper: apply sequence of ops using provided operand parser
    let apply_ops = |parse_op: &dyn Fn(&str) -> Result<i128, String>| -> Result<i128, String> {
        apply_ops_with_precedence(nums, ops, parse_op)
    };

    // plain (no suffix) -> signed arithmetic
    if suf.is_empty() {
        let acc = apply_ops(&|s| s.parse::<i128>().map_err(|_| "invalid integer".to_string()))?;
        return Ok(acc.to_string());
    }

    // unsigned arithmetic: disallow negative literal operands
    if suf.starts_with('u') {
        if negs.iter().any(|&b| b) {
            return Err("negative numeric literal with suffix not supported".to_string());
        }

        let acc = apply_ops(&|s| {
            s.trim_start_matches('+')
                .parse::<i128>()
                .map_err(|_| "invalid integer".to_string())
        })?;

        // final range validation for unsigned types
        return check_unsigned_suffix_range(suf, acc);
    }

    // signed arithmetic (i8/i16/i32/i64)
    if suf.starts_with('i') {
        let acc = apply_ops(&|s| s.parse::<i128>().map_err(|_| "invalid integer".to_string()))?;

        return check_signed_suffix_range(suf, acc);
    }

    Err("unsupported suffix for expression".to_string())
}

fn try_eval_addition(s: &str) -> Option<Result<String, String>> {
    if !s.contains('+') && !s.contains('-') && !s.contains('*') {
        return None;
    }

    fn parse_add_sub_tokens(s: &str) -> ParseTokens {
        let mut nums: Vec<String> = Vec::new();
        let mut rems: Vec<String> = Vec::new();
        let mut negs: Vec<bool> = Vec::new();
        let mut ops: Vec<char> = Vec::new();

        let mut i = 0usize;
        let len = s.len();
        let get_byte = |idx: usize| *s.as_bytes().get(idx).unwrap_or(&0);

        let parse_next_token = |s: &str, mut start: usize| -> Result<(String, usize), String> {
            let token_start = start;
            // optional leading sign
            if start < len {
                let c = get_byte(start) as char;
                if c == '+' || c == '-' {
                    start += 1;
                }
            }

            // digits
            let mut seen_digit = false;
            while start < len && get_byte(start).is_ascii_digit() {
                seen_digit = true;
                start += 1;
            }
            if !seen_digit {
                return Err("invalid operands".to_string());
            }

            // suffix characters
            while start < len {
                let ch = get_byte(start) as char;
                if ch.is_ascii_whitespace() || ch == '+' || ch == '-' || ch == '*' {
                    break;
                }
                start += 1;
            }

            Ok((s[token_start..start].to_string(), start))
        };

        while i < len {
            while i < len && get_byte(i).is_ascii_whitespace() {
                i += 1;
            }
            if i >= len {
                break;
            }

            let start = i;
            let (token, next_i) = parse_next_token(s, start)?;
            i = next_i;

            let (n, r, neg, found) = split_leading_number(&token);
            if !found {
                return Err("invalid operands".to_string());
            }
            nums.push(n);
            rems.push(r);
            negs.push(neg);

            while i < len && get_byte(i).is_ascii_whitespace() {
                i += 1;
            }
            if i >= len {
                break;
            }

            let ch = get_byte(i) as char;
            if ch != '+' && ch != '-' && ch != '*' {
                return Err("invalid operator".to_string());
            }
            ops.push(ch);
            i += 1;
        }

        Ok((nums, rems, negs, ops))
    }

    let parsed = parse_add_sub_tokens(s);
    let (nums, rems, negs, ops) = match parsed {
        Ok(v) => v,
        Err(e) => return Some(Err(e)),
    };
    if nums.len() < 2 || ops.len() != nums.len().saturating_sub(1) {
        return None;
    }
    if !nums.iter().all(|p| p.chars().any(|c| c.is_ascii_digit())) {
        return None;
    }

    match choose_suffix(&rems) {
        Err(e) => Some(Err(e)),
        Ok(suf) => Some(eval_nary_with_ops(&suf, &nums, &negs, &ops)),
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
    fn interpret_rejects_mismatched_suffixes_in_expression() {
        assert!(interpret("100U8 + 50U16").is_err());
    }
}

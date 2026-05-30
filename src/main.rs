macro_rules! parse_suffix {
    ($input:expr, $suffix:literal, $ty:ty, $min:expr, $max:expr) => {
        if let Some(num) = $input.strip_suffix($suffix) {
            let value: $ty = num.parse().map_err(|_| "invalid literal")?;
            return Ok((value as i64, $min, $max));
        }
    };
}

fn parse_literal(input: &str) -> Result<(i64, i64, i64), &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Err("empty literal");
    }

    if let Some(num) = trimmed.strip_suffix("U64") {
        let value: u64 = num.parse().map_err(|_| "invalid literal")?;
        if value > i64::MAX as u64 {
            return Err("literal exceeds i64 range");
        }
        return Ok((value as i64, 0, i64::MAX));
    }

    parse_suffix!(trimmed, "U32", u32, 0, u32::MAX as i64);
    parse_suffix!(trimmed, "U16", u16, 0, u16::MAX as i64);
    parse_suffix!(trimmed, "U8", u8, 0, u8::MAX as i64);
    parse_suffix!(trimmed, "I8", i8, i8::MIN as i64, i8::MAX as i64);

    Err("unknown literal")
}

fn check_bounds(val: i64, min: i64, max: i64) -> Result<(), &'static str> {
    if val < min || val > max {
        return Err("value out of bounds");
    }
    Ok(())
}

fn tokenize(input: &str) -> Result<Vec<(i64, i64, i64, char)>, &'static str> {
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    let mut tokens = Vec::new();

    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }

        if chars[i] == '+' || chars[i] == '*' || chars[i] == '/' || chars[i] == '%' {
            tokens.push((0, 0, 0, chars[i]));
            i += 1;
            continue;
        }

        if chars[i] == '-' {
            if i + 1 >= chars.len() || chars[i + 1].is_whitespace() {
                tokens.push((0, 0, 0, '-'));
                i += 1;
                continue;
            }
        }

        let start = i;
        if chars[i] == '-' {
            i += 1;
        }
        while i < chars.len()
            && !chars[i].is_whitespace()
            && chars[i] != '+'
            && chars[i] != '-'
            && chars[i] != '*'
            && chars[i] != '/'
            && chars[i] != '%'
        {
            i += 1;
        }
        let literal: String = chars[start..i].iter().collect();
        let (val, lo, hi) = parse_literal(&literal)?;
        tokens.push((val, lo, hi, ' '));
    }

    Ok(tokens)
}

fn fold_multiplicative(
    tokens: &[(i64, i64, i64, char)],
) -> Result<Vec<(i64, i64, i64, char)>, &'static str> {
    let mut out = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        if tokens[i].3 == ' '
            && i + 2 < tokens.len()
            && (tokens[i + 1].3 == '*' || tokens[i + 1].3 == '/' || tokens[i + 1].3 == '%')
        {
            let (lv, llo, lhi, _) = tokens[i];
            let (rv, rlo, rhi, _) = tokens[i + 2];
            if rv == 0 {
                return Err("division by zero");
            }
            let result = match tokens[i + 1].3 {
                '*' => lv.checked_mul(rv).ok_or("i64 overflow")?,
                '/' => lv.checked_div(rv).ok_or("i64 division error")?,
                '%' => lv.checked_rem(rv).ok_or("i64 modulo error")?,
                _ => unreachable!(),
            };
            let lo = llo.min(rlo);
            let hi = lhi.max(rhi);
            check_bounds(result, lo, hi)?;
            out.push((result, lo, hi, ' '));
            i += 3;
        } else {
            out.push(tokens[i]);
            i += 1;
        }
    }

    Ok(out)
}

fn fold_additive(tokens: &[(i64, i64, i64, char)]) -> Result<i64, &'static str> {
    let mut acc = 0i64;
    let mut lo = i64::MAX;
    let mut hi = i64::MIN;
    let mut op = '+';
    let mut i = 0;

    while i < tokens.len() {
        if tokens[i].3 == ' ' {
            let (val, tlo, thi, _) = tokens[i];
            lo = lo.min(tlo);
            hi = hi.max(thi);
            match op {
                '+' => acc = acc.checked_add(val).ok_or("i64 overflow")?,
                '-' => acc = acc.checked_sub(val).ok_or("i64 underflow")?,
                _ => unreachable!(),
            }
            check_bounds(acc, lo, hi)?;
            i += 1;
        } else {
            op = tokens[i].3;
            i += 1;
        }
    }

    Ok(acc)
}

fn interpret_tuff(input: &str) -> Result<i64, &'static str> {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Ok(0);
    }

    if !trimmed.contains('+')
        && !trimmed.contains('-')
        && !trimmed.contains('*')
        && !trimmed.contains('/')
        && !trimmed.contains('%')
    {
        return parse_literal(trimmed).map(|(val, _, _)| val);
    }

    let tokens = tokenize(trimmed)?;
    let tokens = fold_multiplicative(&tokens)?;
    fold_additive(&tokens)
}

fn main() {
    use std::io::{self, BufRead, Write};

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush().ok();

        let mut line = String::new();
        if stdin.lock().read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }

        match interpret_tuff(line.trim()) {
            Ok(val) => println!("{val}"),
            Err(e) => println!("Error: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpret_empty_string_returns_zero() {
        assert_eq!(interpret_tuff(""), Ok(0));
    }

    #[test]
    fn interpret_whitespace_returns_zero() {
        assert_eq!(interpret_tuff("   "), Ok(0));
    }

    #[test]
    fn interpret_u8_literal() {
        assert_eq!(interpret_tuff("100U8"), Ok(100));
    }

    #[test]
    fn interpret_negative_u8_literal() {
        assert!(interpret_tuff("-100U8").is_err());
    }

    #[test]
    fn interpret_u8_literal_out_of_range() {
        assert!(interpret_tuff("256U8").is_err());
    }

    #[test]
    fn interpret_u16_literal() {
        assert_eq!(interpret_tuff("100U16"), Ok(100));
    }

    #[test]
    fn interpret_u16_literal_max() {
        assert_eq!(interpret_tuff("65535U16"), Ok(65535));
    }

    #[test]
    fn interpret_negative_u16_literal() {
        assert!(interpret_tuff("-1U16").is_err());
    }

    #[test]
    fn interpret_u16_literal_out_of_range() {
        assert!(interpret_tuff("65536U16").is_err());
    }

    #[test]
    fn interpret_u32_literal() {
        assert_eq!(interpret_tuff("100U32"), Ok(100));
    }

    #[test]
    fn interpret_u32_literal_max() {
        assert_eq!(interpret_tuff("4294967295U32"), Ok(4294967295));
    }

    #[test]
    fn interpret_negative_u32_literal() {
        assert!(interpret_tuff("-1U32").is_err());
    }

    #[test]
    fn interpret_u32_literal_out_of_range() {
        assert!(interpret_tuff("4294967296U32").is_err());
    }

    #[test]
    fn interpret_u64_literal() {
        assert_eq!(interpret_tuff("100U64"), Ok(100));
    }

    #[test]
    fn interpret_u64_literal_max_i64() {
        assert_eq!(
            interpret_tuff("9223372036854775807U64"),
            Ok(9223372036854775807)
        );
    }

    #[test]
    fn interpret_negative_u64_literal() {
        assert!(interpret_tuff("-1U64").is_err());
    }

    #[test]
    fn interpret_u64_literal_exceeds_i64() {
        assert!(interpret_tuff("9223372036854775808U64").is_err());
    }

    #[test]
    fn interpret_i8_literal_negative() {
        assert_eq!(interpret_tuff("-100I8"), Ok(-100));
    }

    #[test]
    fn interpret_i8_literal_positive() {
        assert_eq!(interpret_tuff("100I8"), Ok(100));
    }

    #[test]
    fn interpret_i8_literal_min() {
        assert_eq!(interpret_tuff("-128I8"), Ok(-128));
    }

    #[test]
    fn interpret_i8_literal_max() {
        assert_eq!(interpret_tuff("127I8"), Ok(127));
    }

    #[test]
    fn interpret_i8_literal_out_of_range_negative() {
        assert!(interpret_tuff("-129I8").is_err());
    }

    #[test]
    fn interpret_i8_literal_out_of_range_positive() {
        assert!(interpret_tuff("128I8").is_err());
    }

    #[test]
    fn interpret_i8_literal_out_of_range_large_negative() {
        assert!(interpret_tuff("-200I8").is_err());
    }

    #[test]
    fn interpret_addition_u8() {
        assert_eq!(interpret_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn interpret_addition_u8_three_terms() {
        assert_eq!(interpret_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn interpret_addition_u8_overflow() {
        assert!(interpret_tuff("1U8 + 255U8").is_err());
    }

    #[test]
    fn interpret_addition_mixed_types() {
        assert_eq!(interpret_tuff("1U8 + 255U16"), Ok(256));
    }

    #[test]
    fn interpret_subtraction_u8() {
        assert_eq!(interpret_tuff("3U8 + 2U8 - 4U8"), Ok(1));
    }

    #[test]
    fn interpret_multiplication_u8() {
        assert_eq!(interpret_tuff("3U8 * 2U8 - 4U8"), Ok(2));
    }

    #[test]
    fn interpret_precedence_mul_before_add() {
        assert_eq!(interpret_tuff("3U8 + 2U8 * 4U8"), Ok(11));
    }

    #[test]
    fn interpret_unsigned_underflow() {
        assert!(interpret_tuff("1U8 - 2U8").is_err());
    }

    #[test]
    fn interpret_unsigned_mul_overflow() {
        assert!(interpret_tuff("100U8 * 200U8").is_err());
    }

    #[test]
    fn interpret_signed_mul_overflow_negative() {
        assert!(interpret_tuff("100I8 * -2I8").is_err());
    }

    #[test]
    fn interpret_division_u8() {
        assert_eq!(interpret_tuff("10U8 / 3U8"), Ok(3));
    }

    #[test]
    fn interpret_modulo_u8() {
        assert_eq!(interpret_tuff("10U8 % 3U8"), Ok(1));
    }
}

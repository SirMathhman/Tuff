pub fn interpret(input: &str) -> Result<String, String> {
    // Handle simple variable declaration syntax: `let <name> : <Type> = <expr>; <name>`
    // This supports a single declaration followed by a variable reference.
    if input.trim_start().starts_with("let ") && input.contains(';') {
        let mut parts = input.splitn(2, ';');
        let decl = parts
            .next()
            .ok_or_else(|| "invalid declaration".to_string())?
            .trim();
        let lookup = parts.next().map(|s| s.trim()).unwrap_or("");

        // decl = "let <name> : <Type> = <rhs>"
        let decl = decl
            .strip_prefix("let")
            .ok_or_else(|| "invalid declaration".to_string())?
            .trim();
        let mut left_and_rhs = decl.splitn(2, '=');
        let left = left_and_rhs
            .next()
            .ok_or_else(|| "invalid declaration".to_string())?
            .trim();
        let rhs_expr = left_and_rhs
            .next()
            .ok_or_else(|| "invalid declaration".to_string())?
            .trim();

        let mut name_and_ty = left.splitn(2, ':');
        let name = name_and_ty
            .next()
            .ok_or_else(|| "invalid declaration".to_string())?
            .trim();
        let ty_opt = name_and_ty.next().map(|s| s.trim());

        // evaluate RHS expression
        let value = interpret(rhs_expr)?;

        // ensure the value fits the declared type (if provided)
        if let Some(ty) = ty_opt {
            if ty.starts_with('U') {
                let v = value
                    .parse::<u128>()
                    .map_err(|_| "invalid numeric value".to_string())?;
                check_unsigned_range(v, ty)?;
            } else {
                let v = value
                    .parse::<i128>()
                    .map_err(|_| "invalid numeric value".to_string())?;
                check_signed_range(v, ty)?;
            }
        }

        if lookup.is_empty() {
            // Declaration only — return empty string
            return Ok(String::new());
        }

        if lookup == name {
            return Ok(value);
        }

        return Err("unsupported declaration usage".to_string());
    }

    // `typeOf(<literal>)` helper: return the suffix portion if present, e.g. typeOf(100U8) -> "U8"
    if input.trim_start().starts_with("typeOf(") && input.trim_end().ends_with(')') {
        let inner = input.trim();
        let inner = &inner[7..inner.len() - 1]; // between parentheses
        let inner = inner.trim();
        const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];
        for sfx in SUFFIXES {
            if inner.ends_with(sfx) {
                return Ok(sfx.to_string());
            }
        }

        // no recognized suffix found -> empty string
        return Ok(String::new());
    }

    // Handle a simple binary addition: "<lhs> + <rhs>" where both operands
    // are integers with the same type suffix (e.g. "1U8 + 2U8").
    if input.contains('+')
        || input.contains('-')
        || input.contains('*')
        || input.contains('(')
        || input.contains(')')
    {
        // Tokenize into numbers, operators and parentheses; treat leading +/- as unary signs attached to numbers.
        let mut tokens: Vec<String> = Vec::new();
        let mut cur = String::new();
        let mut last_was_op = true;

        fn push_op(tokens: &mut Vec<String>, cur: &mut String, ch: char, last_was_op: &mut bool) {
            if !cur.trim().is_empty() {
                tokens.push(cur.trim().to_string());
                cur.clear();
            }
            tokens.push(ch.to_string());
            *last_was_op = true;
        }

        for ch in input.chars() {
            match ch {
                '+' | '-' => {
                    if last_was_op {
                        cur.push(ch); // unary sign
                    } else {
                        push_op(&mut tokens, &mut cur, ch, &mut last_was_op);
                        continue;
                    }
                    last_was_op = true;
                }
                '*' => {
                    if last_was_op {
                        return Err("invalid expression".to_string());
                    }
                    push_op(&mut tokens, &mut cur, ch, &mut last_was_op);
                }
                '(' => {
                    push_op(&mut tokens, &mut cur, ch, &mut last_was_op);
                }
                ')' => {
                    push_op(&mut tokens, &mut cur, ch, &mut last_was_op);
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

        const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

        let mut seen_suffix: Option<&str> = None;
        for p in &tokens {
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

        // Convert tokens to RPN using shunting-yard (supports +, -, *, parentheses)
        fn precedence(op: &str) -> i32 {
            match op {
                "*" => 2,
                "+" | "-" => 1,
                _ => 0,
            }
        }

        let mut op_stack: Vec<String> = Vec::new();
        let mut output: Vec<String> = Vec::new();

        for t in &tokens {
            if t == "+" || t == "-" || t == "*" {
                while let Some(top) = op_stack.last() {
                    if (top == "+" || top == "-" || top == "*") && precedence(top) >= precedence(t)
                    {
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
                // number token
                output.push(t.clone());
            }
        }
        while let Some(op) = op_stack.pop() {
            if op == "(" || op == ")" {
                return Err("mismatched parentheses".to_string());
            }
            output.push(op);
        }

        let suffix = seen_suffix.ok_or_else(|| "internal error determining suffix".to_string())?;
        let unsigned = suffix.starts_with('U');

        // Evaluate RPN output using a tiny generic evaluator to avoid duplicate code
        fn eval_rpn_generic<T, P, A>(
            output: &[String],
            suffix: &str,
            parse: P,
            apply: A,
        ) -> Result<T, String>
        where
            P: Fn(&str, &str) -> Result<T, String>,
            A: Fn(T, T, &char, &str) -> Result<T, String>,
            T: Copy,
        {
            let mut stack: Vec<T> = Vec::new();
            for tok in output {
                if tok == "+" || tok == "-" || tok == "*" {
                    let rhs = stack
                        .pop()
                        .ok_or_else(|| "invalid expression".to_string())?;
                    let lhs = stack
                        .pop()
                        .ok_or_else(|| "invalid expression".to_string())?;
                    let op_char = tok
                        .chars()
                        .next()
                        .ok_or_else(|| "invalid operator token".to_string())?;
                    let res = apply(lhs, rhs, &op_char, suffix)?;
                    stack.push(res);
                } else {
                    let v = parse(tok, suffix)?;
                    stack.push(v);
                }
            }
            if stack.len() != 1 {
                return Err("invalid expression".to_string());
            }
            stack.pop().ok_or_else(|| "invalid expression".to_string())
        }

        if unsigned {
            let res = eval_rpn_generic::<u128, _, _>(
                &output,
                suffix,
                parse_unsigned_token,
                apply_unsigned_op,
            )?;
            return Ok(res.to_string());
        } else {
            let res = eval_rpn_generic::<i128, _, _>(
                &output,
                suffix,
                parse_signed_token,
                apply_signed_op,
            )?;
            return Ok(res.to_string());
        }
    }
    const SUFFIXES: [&str; 8] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

    for sfx in SUFFIXES {
        if input.ends_with(sfx) {
            let pos = input.len() - sfx.len();
            if pos > 0
                && input
                    .as_bytes()
                    .get(pos - 1)
                    .map(|b| b.is_ascii_digit())
                    .unwrap_or(false)
            {
                // If suffix denotes an unsigned type, reject negative values
                // and ensure the numeric value fits the type's range.
                let numeric_part = &input[..pos];
                if sfx.starts_with('U') {
                    if numeric_part.starts_with('-') {
                        return Err("negative value for unsigned suffix".to_string());
                    }

                    let num_str = numeric_part.strip_prefix('+').unwrap_or(numeric_part);

                    // Parse as a wide unsigned and compare with the type max.
                    let parsed = num_str
                        .parse::<u128>()
                        .map_err(|_| "invalid numeric value for unsigned suffix".to_string())?;

                    check_unsigned_range(parsed, sfx)?;
                }

                return Ok(numeric_part.to_string());
            }
        }
    }

    Ok(input.to_string())
}

fn check_unsigned_range(value: u128, suffix: &str) -> Result<(), String> {
    let max = match suffix {
        "U8" => u8::MAX as u128,
        "U16" => u16::MAX as u128,
        "U32" => u32::MAX as u128,
        "U64" => u64::MAX as u128,
        _ => u128::MAX,
    };
    if value > max {
        return Err(format!("value out of range for {}", suffix));
    }
    Ok(())
}

fn check_signed_range(value: i128, suffix: &str) -> Result<(), String> {
    let (min, max) = match suffix {
        "I8" => (i8::MIN as i128, i8::MAX as i128),
        "I16" => (i16::MIN as i128, i16::MAX as i128),
        "I32" => (i32::MIN as i128, i32::MAX as i128),
        "I64" => (i64::MIN as i128, i64::MAX as i128),
        _ => (i128::MIN, i128::MAX),
    };
    if value < min || value > max {
        return Err(format!("value out of range for {}", suffix));
    }
    Ok(())
}

fn parse_unsigned_token(token: &str, suffix: &str) -> Result<u128, String> {
    let numeric = if let Some(stripped) = token.strip_suffix(suffix) {
        stripped
    } else {
        token
    };
    if numeric.starts_with('-') {
        return Err("negative value for unsigned suffix".to_string());
    }
    let v = numeric
        .strip_prefix('+')
        .unwrap_or(numeric)
        .parse::<u128>()
        .map_err(|_| "invalid numeric value".to_string())?;
    check_unsigned_range(v, suffix)?;
    Ok(v)
}

fn parse_signed_token(token: &str, suffix: &str) -> Result<i128, String> {
    let numeric = if let Some(stripped) = token.strip_suffix(suffix) {
        stripped
    } else {
        token
    };
    let v = numeric
        .strip_prefix('+')
        .unwrap_or(numeric)
        .parse::<i128>()
        .map_err(|_| "invalid numeric value".to_string())?;
    check_signed_range(v, suffix)?;
    Ok(v)
}

fn apply_unsigned_op(total: u128, rhs: u128, op: &char, suffix: &str) -> Result<u128, String> {
    let result = match op {
        '+' => total
            .checked_add(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => {
            if total < rhs {
                return Err("value out of range for unsigned after subtraction".to_string());
            }
            total
                .checked_sub(rhs)
                .ok_or_else(|| "overflow".to_string())?
        }
        '*' => total
            .checked_mul(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        _ => return Err("invalid operator".to_string()),
    };
    check_unsigned_range(result, suffix)?;
    Ok(result)
}

fn apply_signed_op(total: i128, rhs: i128, op: &char, suffix: &str) -> Result<i128, String> {
    let result = match op {
        '+' => total
            .checked_add(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '-' => total
            .checked_sub(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        '*' => total
            .checked_mul(rhs)
            .ok_or_else(|| "overflow".to_string())?,
        _ => return Err("invalid operator".to_string()),
    };
    check_signed_range(result, suffix)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use crate::interpret;

    #[test]
    fn interpret_returns_same_string() {
        let input = "hello world";
        let out = interpret(input);
        assert_eq!(out, Ok(input.to_string()));
    }

    #[test]
    fn interpret_strips_type_like_suffix() {
        assert_eq!(interpret("100U8"), Ok("100".to_string()));
        assert_eq!(interpret("123U16"), Ok("123".to_string()));
        assert_eq!(interpret("7I32"), Ok("7".to_string()));
        assert_eq!(interpret("900U64"), Ok("900".to_string()));

        // Case-sensitive: lowercase should not match
        assert_eq!(interpret("42u32"), Ok("42u32".to_string()));

        // Don't strip when letters are part of a word
        assert_eq!(interpret("valueU16"), Ok("valueU16".to_string()));

        // digits-only should be unchanged
        assert_eq!(interpret("12345"), Ok("12345".to_string()));

        // Negative value with unsigned suffix is invalid
        assert!(interpret("-100U8").is_err());

        // values above the unsigned max are invalid
        assert!(interpret("256U8").is_err());
        assert_eq!(interpret("255U8"), Ok("255".to_string()));

        // Simple addition of same-suffix operands
        assert_eq!(interpret("1U8 + 2U8"), Ok("3".to_string()));

        // Chained addition where plain numbers adopt the suffixed type
        assert_eq!(interpret("1U8 + 3 + 2U8"), Ok("6".to_string()));

        // Chained expression with subtraction
        assert_eq!(interpret("10U8 + 3 - 5U8"), Ok("8".to_string()));

        // Multiplication then subtraction, left-to-right evaluation
        assert_eq!(interpret("10U8 * 3 - 5U8"), Ok("25".to_string()));

        // Signed multiplication then subtraction
        assert_eq!(interpret("10I8 * 3 - 5I8"), Ok("25".to_string()));

        // Parentheses + precedence: multiplication outside parentheses.
        assert_eq!(interpret("10I8 * (3 - 5I8)"), Ok("-20".to_string()));

        // Simple declaration and usage (no-type declaration supported)
        assert_eq!(
            interpret("let x : I8 = 10I8 * (3 - 5I8); x"),
            Ok("-20".to_string())
        );

        // Duplicate declarations should be an error
        assert!(interpret("let x : I32 = 100; let x : I32 = 200;").is_err());

        // Declaration-only returns empty string
        assert_eq!(interpret("let x : I32 = 100;"), Ok("".to_string()));

        // Declaration without type should work: let x = 100; x => "100"
        assert_eq!(interpret("let x = 100; x"), Ok("100".to_string()));

        // typeOf helper should return type suffix for literal
        assert_eq!(interpret("typeOf(100U8)"), Ok("U8".to_string()));

        // Declaration with unsigned overflow should error
        assert!(interpret("let x : U8 = 1000;").is_err());

        // Unsigned underflow should produce an error
        assert!(interpret("0U8 - 5U8").is_err());

        // Overflow when result exceeds the type max should be an error
        assert!(interpret("1U8 + 255U8").is_err());
    }
}

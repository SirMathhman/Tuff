use std::collections::HashMap;
use std::io::{self, BufRead};

/// Variable environment for let bindings within blocks.
struct Environment {
    vars: HashMap<String, (i64, String, bool)>, // name -> (value, type, is_mut)
}

impl Environment {
    fn new() -> Self {
        Self {
            vars: HashMap::new(),
        }
    }

    /// Get a variable's value.
    fn get(&self, name: &str) -> Result<i64, &'static str> {
        self.vars
            .get(name)
            .map(|(v, _, _)| *v)
            .ok_or("undefined variable")
    }

    /// Get a variable's declared type (or inferred literal suffix).
    fn get_type(&self, name: &str) -> Result<&String, &'static str> {
        self.vars
            .get(name)
            .map(|(_, t, _)| t)
            .ok_or("undefined variable")
    }

    /// Set a new variable; returns Err if the variable is already bound (no redeclaration).
    fn set(&mut self, name: &str, value: i64, type_name: &str) -> Result<(), &'static str> {
        if self.vars.contains_key(name) {
            return Err("variable already declared");
        }
        self.vars
            .insert(name.to_string(), (value, type_name.to_string(), false));
        Ok(())
    }

    /// Set a mutable variable; checks mutability and type compatibility.
    fn set_mut(
        &mut self,
        name: &str,
        value: i64,
        assigned_type: Option<&str>,
    ) -> Result<(), &'static str> {
        let entry = self.vars.get(name).ok_or("undefined variable")?;
        if !entry.2 {
            return Err("cannot reassign immutable variable");
        }
        // If we know the assigned type, it must match the variable's declared type
        if let Some(ty) = assigned_type {
            if ty != entry.1 {
                return Err("type mismatch in assignment");
            }
        }
        self.vars
            .insert(name.to_string(), (value, entry.1.clone(), true));
        Ok(())
    }
}

fn main() {
    println!("Tuff REPL - type 'quit' to exit");
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        match line {
            Ok(input) => {
                if input.trim().eq_ignore_ascii_case("quit") {
                    break;
                }
                if input.is_empty() {
                    continue;
                }
                match execute_tuff(&input) {
                    Ok(result) => println!("=> {}", result),
                    Err(e) => println!("Error: {}", e),
                }
            }
            Err(_) => {
                eprintln!("Failed to read line");
                break;
            }
        }
    }
}

fn execute_tuff(input: &str) -> Result<u64, &'static str> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }

    // Tokenize into values, operators (+, -, *, /, %, ||), delimiters (; := ), and parentheses (, )
    // A `-` at the start or immediately after another operator is a unary minus (part of the value)
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut prev_was_operator_or_open_paren = true;

    let chars: Vec<char> = trimmed.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let ch = chars[i];
        if ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '%' {
            // `-` at start or after operator/( is unary, keep it with the value
            if ch == '-' && prev_was_operator_or_open_paren {
                current.push(ch);
                i += 1;
                continue;
            }
            // `*` before an identifier: pointer type prefix (*Bool, *U8, etc.) — absorb into token
            if ch == '*' && i + 1 < len && (chars[i + 1].is_alphanumeric() || chars[i + 1] == '_') {
                current.push(ch);
                prev_was_operator_or_open_paren = false;
                i += 1;
                continue;
            }
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            prev_was_operator_or_open_paren = true;
            i += 1;
        } else if ch == '&' && i + 1 < len && chars[i + 1] == '&' {
            // Logical AND: &&
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push("&&".to_string());
            prev_was_operator_or_open_paren = true;
            i += 2;
        } else if ch == '&' {
            // Single & as address-of operator
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push("&".to_string());
            prev_was_operator_or_open_paren = true;
            i += 1;
        } else if ch == '|' && i + 1 < len && chars[i + 1] == '|' {
            // Logical OR: ||
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push("||".to_string());
            prev_was_operator_or_open_paren = true;
            i += 2;
        } else if ch == '('
            || ch == ')'
            || ch == '{'
            || ch == '}'
            || ch == ';'
            || ch == ':'
            || ch == '='
        {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            // ( and { act like operators for unary minus; ) } ; : = do not
            prev_was_operator_or_open_paren = ch == '(' || ch == '{';
            i += 1;
        } else if ch.is_whitespace() {
            // Flush current token before skipping whitespace
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            i += 1;
        } else {
            current.push(ch);
            prev_was_operator_or_open_paren = false;
            i += 1;
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    // Recursive descent parser:
    //   Program      -> Statement (';' Statement)*
    //   Statement    -> 'let' name ':' Type '=' Expression | Expression
    //   LogicalOr    -> LogicalAnd ('||' LogicalAnd)*
    //   LogicalAnd   -> ArithmeticExpression ('&&' ArithmeticExpression)*
    //   ArithmeticExpression -> Term (('+' | '-') Term)*
    //   Term         -> Factor (('*' | '/' | '%') Factor)*
    //   Factor       -> '(' Expression ')' | '{' Block '}' | Identifier | Value
    let mut pos = 0;
    let mut env = Environment::new();
    let result = parse_program(&tokens, &mut pos, &mut env)?;

    if result < 0 {
        return Err("result underflows below zero");
    }
    Ok(result as u64)
}

// Parse a program: one or more statements separated by ';'
// Returns the value of the last expression, or 0 if only let-statements (no-ops).
fn parse_program(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let mut result = 0i64;

    loop {
        if *pos >= tokens.len() || tokens[*pos] == "}" {
            break;
        }

        // Check for 'let' statement: let [mut] name : Type = expression ;
        if tokens[*pos] == "let" {
            result = parse_let_statement(tokens, pos, env)?;
        } else if *pos + 1 < tokens.len()
            && tokens[*pos + 1] == "="
            && !parse_tuir_value(&tokens[*pos]).is_some()
            && !tokens[*pos]
                .chars()
                .next()
                .map_or(false, |c| c.is_ascii_digit())
        {
            // Assignment statement: identifier = expression
            result = parse_assignment(tokens, pos, env)?;
        } else {
            // Regular expression (could be the final value)
            result = parse_logical_or(tokens, pos, env)?;
        }

        // Consume ';' if present
        if *pos < tokens.len() && tokens[*pos] == ";" {
            *pos += 1;
            // If nothing follows the ';', this is a no-op (bare statement)
            if *pos >= tokens.len() || tokens[*pos] == "}" {
                return Ok(0);
            }
        } else {
            // No more statements
            break;
        }
    }

    Ok(result)
}

// Parse: LogicalAnd ('||' LogicalAnd)*
// Logical OR has the lowest precedence; result is 1 if either operand is truthy, else 0.
fn parse_logical_or(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let mut result = parse_logical_and(tokens, pos, env)?;

    while *pos < tokens.len() && tokens[*pos] == "||" {
        *pos += 1; // consume '||'
        let right = parse_logical_and(tokens, pos, env)?;
        result = if result != 0 || right != 0 { 1 } else { 0 };
    }

    Ok(result)
}

// Parse: ArithmeticExpression ('&&' ArithmeticExpression)*
// Logical AND has higher precedence than OR; result is 1 only if both operands are truthy, else 0.
fn parse_logical_and(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let mut result = parse_expression(tokens, pos, env)?;

    while *pos < tokens.len() && tokens[*pos] == "&&" {
        *pos += 1; // consume '&&'
        let right = parse_expression(tokens, pos, env)?;
        result = if result != 0 && right != 0 { 1 } else { 0 };
    }

    Ok(result)
}

// Parse: Term (('+' | '-') Term)*
fn parse_expression(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let mut result = parse_term(tokens, pos, env)?;

    while *pos < tokens.len() && (tokens[*pos] == "+" || tokens[*pos] == "-") {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_term(tokens, pos, env)?;
        result = match op.as_str() {
            "+" => result + right,
            _ => result - right,
        };
    }

    Ok(result)
}

// Parse: Factor (('*' | '/' | '%') Factor)*
fn parse_term(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let mut result = parse_factor(tokens, pos, env)?;

    while *pos < tokens.len() && (tokens[*pos] == "*" || tokens[*pos] == "/" || tokens[*pos] == "%")
    {
        let op = tokens[*pos].clone();
        *pos += 1;
        let right = parse_factor(tokens, pos, env)?;
        result = match op.as_str() {
            "*" => result * right,
            "/" => {
                if right == 0 {
                    return Err("division by zero");
                }
                result / right
            }
            "%" => {
                if right == 0 {
                    return Err("modulo by zero");
                }
                result % right
            }
            _ => unreachable!(),
        };
    }

    Ok(result)
}

// Parse: '(' Expression ')' | '{' Block '}' | Identifier | Value
fn parse_factor(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    if *pos >= tokens.len() {
        return Err("unexpected end of expression");
    }

    // Parenthesized group: ( Expression )
    if tokens[*pos] == "(" {
        *pos += 1; // consume '('
        let result = parse_expression(tokens, pos, env)?;
        if *pos >= tokens.len() || tokens[*pos] != ")" {
            return Err("missing closing delimiter");
        }
        *pos += 1; // consume ')'
        Ok(result)
    } else if tokens[*pos] == "&" {
        // Address-of operator: &identifier -> returns 0 (placeholder address value)
        *pos += 1; // consume '&'
        let token = &tokens[*pos];
        // Validate that the referenced variable exists
        env.get(token.as_str())?;
        *pos += 1;
        Ok(0)
    } else if tokens[*pos] == "{" {
        parse_block(tokens, pos, env)
    } else {
        let token = &tokens[*pos];
        // Try boolean literal first
        if let Some(val) = parse_bool_value(token.as_str()) {
            *pos += 1;
            return Ok(val);
        }
        // Try variable lookup (identifier without a TUIR suffix)
        if !parse_tuir_value(token.as_str()).is_some()
            && !token.chars().next().map_or(false, |c| c.is_ascii_digit())
        {
            *pos += 1;
            env.get(token.as_str())
        } else {
            let value = evaluate_value(token)? as i64;
            *pos += 1;
            if value < 0 {
                return Err("result underflows below zero");
            }
            Ok(value)
        }
    }
}

// Parse: identifier = expression
fn parse_assignment(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    let var_name = tokens[*pos].clone();
    *pos += 1; // consume identifier

    if *pos >= tokens.len() || tokens[*pos] != "=" {
        return Err("expected = in assignment");
    }
    *pos += 1; // consume '='

    // Infer the assigned value's type from the first token of the RHS expression
    let assigned_type: Option<String> = if *pos < tokens.len() {
        infer_assignment_type(tokens, pos, env)
    } else {
        None
    };

    let value = parse_expression(tokens, pos, env)?;
    env.set_mut(&var_name, value, assigned_type.as_deref())?;
    Ok(value)
}

// Infer the type of a simple RHS expression (literal or variable reference).
fn infer_assignment_type(tokens: &[String], pos: &usize, env: &Environment) -> Option<String> {
    let token = &tokens[*pos];

    // Try boolean literal first
    if parse_bool_value(token.as_str()).is_some() {
        return Some("Bool".to_string());
    }

    // Try literal suffix next
    if let Some((_, suffix)) = parse_tuir_value(token.as_str()) {
        return Some(suffix.to_string());
    }

    // Fall back to variable lookup
    if !token.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        if let Ok(ty) = env.get_type(token.as_str()) {
            return Some(ty.clone());
        }
    }

    None
}

// Parse a block: { statements; final_expression }
fn parse_block(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    *pos += 1; // consume '{'

    let result = parse_program(tokens, pos, env)?;

    if *pos >= tokens.len() || tokens[*pos] != "}" {
        return Err("missing closing delimiter");
    }
    *pos += 1; // consume '}'

    Ok(result)
}

// Determine the type of a single-token initializer (literal or variable reference).
fn infer_init_type(_tokens: &[String], init_token: &str, env: &Environment) -> Option<String> {
    // Try boolean literal first
    if parse_bool_value(init_token).is_some() {
        return Some("Bool".to_string());
    }
    // Try literal suffix next
    if let Some((_, suffix)) = parse_tuir_value(init_token) {
        return Some(suffix.to_string());
    }
    // Fall back to variable lookup
    if let Ok(ty) = env.get_type(init_token) {
        return Some(ty.clone());
    }
    None
}

// Parse: let [mut] name : Type = expression ;
fn parse_let_statement(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    *pos += 1; // consume 'let'

    // Check for 'mut' keyword
    let is_mut = if *pos < tokens.len() && tokens[*pos] == "mut" {
        *pos += 1;
        true
    } else {
        false
    };

    if *pos >= tokens.len() {
        return Err("expected variable name after let");
    }
    let var_name = tokens[*pos].clone();
    *pos += 1;

    // Consume ':' and capture declared type
    let mut declared_type: Option<&str> = None;
    if *pos < tokens.len() && tokens[*pos] == ":" {
        *pos += 1; // consume ':'
        if *pos < tokens.len() {
            declared_type = Some(tokens[*pos].as_str());
            *pos += 1; // skip type token
        }
    }

    // Consume '='
    if *pos >= tokens.len() || tokens[*pos] != "=" {
        return Err("expected = in let statement");
    }
    *pos += 1;

    // Infer the initializer's type (if it's a single literal or variable reference)
    let inferred_type: Option<String> = if *pos < tokens.len() {
        infer_init_type(tokens, &tokens[*pos], env)
    } else {
        None
    };

    // If both declared and inferred types exist, they must match
    if let Some(declared) = declared_type {
        if let Some(ref inferred) = inferred_type {
            if inferred.as_str() != declared {
                return Err("type mismatch in let binding");
            }
        }
    }

    // Use the declared type, or fall back to inferred, or default to "I32"
    let final_type: String = match (declared_type, inferred_type) {
        (_, Some(t)) => t,
        (Some(d), None) => d.to_string(),
        _ => "I32".to_string(),
    };

    // Parse the initializer expression
    let value = parse_expression(tokens, pos, env)?;

    if is_mut {
        // For mutable variables, insert directly with mut flag
        if env.vars.contains_key(&var_name) {
            return Err("variable already declared");
        }
        env.vars.insert(var_name.clone(), (value, final_type, true));
    } else {
        env.set(&var_name, value, &final_type)?;
    }

    Ok(value)
}

/// Evaluate a single TUIR value or return 0 for unrecognized input.
fn evaluate_value(input: &str) -> Result<u64, &'static str> {
    if let Some((value_str, suffix)) = parse_tuir_value(input) {
        // Reject negative numbers for unsigned types
        if value_str.starts_with('-') && !suffix.starts_with('I') {
            return Err("negative value not allowed for unsigned type");
        }
        let parsed: i64 = value_str
            .parse()
            .map_err(|_| "failed to parse numeric value")?;

        // Validate range based on suffix and return
        match suffix {
            "U8" => {
                if parsed < 0 || parsed > u8::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            "U16" => {
                if parsed < 0 || parsed > u16::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            "U32" => {
                if parsed < 0 || parsed > u32::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            "I8" => {
                if parsed < i8::MIN as i64 || parsed > i8::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            "I16" => {
                if parsed < i16::MIN as i64 || parsed > i16::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            "I32" => {
                if parsed < i32::MIN as i64 || parsed > i32::MAX as i64 {
                    return Err("value out of range for type");
                }
                return Ok(parsed as u64);
            }
            _ => {
                if parsed < 0 {
                    return Err("result underflows below zero");
                }
                return Ok(parsed as u64);
            }
        }
    }

    Ok(0)
}

/// Parse a TUIR-formatted value string like "100U8" into (numeric_part, type_suffix).
fn parse_tuir_value(input: &str) -> Option<(&str, &str)> {
    let suffixes = ["I64", "U64", "I32", "U32", "I16", "U16", "I8", "U8"];
    for suffix in &suffixes {
        if input.ends_with(suffix) {
            return Some((&input[..input.len() - suffix.len()], suffix));
        }
    }
    // If it's a bare number (no suffix), treat as I32
    if input.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Some((input, "I32"));
    }
    None
}

/// Parse a boolean literal: "true" -> 1, "false" -> 0.
fn parse_bool_value(input: &str) -> Option<i64> {
    match input {
        "true" => Some(1),
        "false" => Some(0),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_bare_let_is_noop() {
        assert_eq!(execute_tuff(r#"let y : U8 = 100U8;"#), Ok(0));
    }

    #[test]
    fn test_execute_tuff_let_then_variable_reference() {
        assert_eq!(execute_tuff(r#"let x : U8 = 100U8; x"#), Ok(100));
    }

    #[test]
    fn test_execute_tuff_duplicate_let_returns_err() {
        assert!(execute_tuff("let x : U8 = 0; let x : U8 = 0;").is_err());
    }

    #[test]
    fn test_execute_tuff_type_mismatch_in_let_binding() {
        assert!(execute_tuff("let x : U8 = 100U16;").is_err());
    }

    #[test]
    fn test_execute_tuff_variable_type_mismatch_propagates() {
        assert!(execute_tuff("let x = 100U16; let y : U8 = x;").is_err());
    }

    #[test]
    fn test_execute_tuff_mut_reassignment() {
        assert_eq!(execute_tuff(r#"let mut x = 0U8; x = 1U8; x"#), Ok(1));
    }

    #[test]
    fn test_execute_tuff_immutable_variable_cannot_be_reassigned() {
        assert!(execute_tuff("let x = 0U8; x = 1U8; x").is_err());
    }

    #[test]
    fn test_execute_tuff_mut_reassignment_type_mismatch() {
        assert!(execute_tuff("let mut x = 0U8; x = 1U16; x").is_err());
    }

    #[test]
    fn test_execute_tuff_bool_true_returns_one() {
        assert_eq!(execute_tuff(r#"let x : Bool = true; x"#), Ok(1));
    }

    #[test]
    fn test_execute_tuff_mut_reassignment_bool_to_u8_mismatch() {
        assert!(execute_tuff("let mut x = 0U8; x = true; x").is_err());
    }

    #[test]
    fn test_execute_tuff_logical_or_true_false_returns_one() {
        assert_eq!(
            execute_tuff(r#"let x = true; let y = false; x || y"#),
            Ok(1)
        );
    }

    #[test]
    fn test_execute_tuff_logical_and_true_false_returns_zero() {
        assert_eq!(
            execute_tuff(r#"let x = true; let y = false; x && y"#),
            Ok(0)
        );
    }

    #[test]
    fn test_execute_tuff_pointer_declaration_with_address_of() {
        assert_eq!(execute_tuff(r#"let x = true; let y : *Bool = &x;"#), Ok(0));
    }

    #[test]
    fn test_execute_tuff_default_inferred_type_is_i32() {
        assert_eq!(execute_tuff("let x = 100; x"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_i8_literal() {
        assert_eq!(execute_tuff(r#"let x : I8 = 10I8; x"#), Ok(10));
    }

    #[test]
    fn test_execute_tuff_i16_literal() {
        assert_eq!(execute_tuff(r#"let x : I16 = 30000I16; x"#), Ok(30000));
    }

    #[test]
    fn test_execute_tuff_i8_negative_overflow_returns_err() {
        assert!(execute_tuff("let x : I8 = -129I8;").is_err());
    }

    #[test]
    fn test_execute_tuff_i8_positive_overflow_returns_err() {
        assert!(execute_tuff("let x : I8 = 128I8;").is_err());
    }

    #[test]
    fn test_execute_tuff_i16_negative_overflow_returns_err() {
        assert!(execute_tuff("let x : I16 = -32769I16;").is_err());
    }

    #[test]
    fn test_execute_tuff_empty_string_returns_zero() {
        assert_eq!(execute_tuff(""), Ok(0));
    }

    #[test]
    fn test_execute_tuff_whitespace_returns_zero() {
        assert_eq!(execute_tuff("   "), Ok(0));
        assert_eq!(execute_tuff("\t\n"), Ok(0));
        assert_eq!(execute_tuff(" \t \n "), Ok(0));
    }

    #[test]
    fn test_execute_tuff_100u8_returns_100() {
        assert_eq!(execute_tuff("100U8"), Ok(100));
    }

    #[test]
    fn test_execute_tuff_negative_u8_returns_err() {
        assert!(execute_tuff("-100U8").is_err());
    }

    #[test]
    fn test_execute_tuff_256u8_overflow_returns_err() {
        assert!(execute_tuff("256U8").is_err());
    }

    #[test]
    fn test_execute_tuff_addition_expression() {
        assert_eq!(execute_tuff("1U8 + 2U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_multiple_additions() {
        assert_eq!(execute_tuff("1U8 + 2U8 + 3U8"), Ok(6));
    }

    #[test]
    fn test_execute_tuff_mixed_addition_subtraction() {
        assert_eq!(execute_tuff("3U8 + 2U8 - 4U8"), Ok(1));
    }

    #[test]
    fn test_execute_tuff_multiplication_with_subtraction() {
        assert_eq!(execute_tuff("3U8 * 2U8 - 4U8"), Ok(2));
    }

    #[test]
    fn test_execute_tuff_addition_after_multiplication_precedence() {
        assert_eq!(execute_tuff("4U8 + 3U8 * 2U8"), Ok(10));
    }

    #[test]
    fn test_execute_tuff_division_expression() {
        assert_eq!(execute_tuff("10U8 / 2U8"), Ok(5));
    }

    #[test]
    fn test_execute_tuff_integer_division_truncates() {
        assert_eq!(execute_tuff("10U8 / 3U8"), Ok(3));
    }

    #[test]
    fn test_execute_tuff_modulo_expression() {
        assert_eq!(execute_tuff("10U8 % 3U8"), Ok(1));
    }

    #[test]
    fn test_execute_tuff_let_variable_in_block() {
        assert_eq!(
            execute_tuff(r#"{ let x : U8 = 4U8 + 3U8; x } * 2U8"#),
            Ok(14)
        );
    }

    #[test]
    fn test_execute_tuff_nested_let_top_level() {
        assert_eq!(
            execute_tuff(r#"let y : U8 = { let x : U8 = 4U8 + 3U8; x } * 2U8; y"#),
            Ok(14)
        );
    }

    #[test]
    fn test_execute_tuff_parenthesized_multiplication() {
        assert_eq!(execute_tuff("(4U8 + 3U8) * 2U8"), Ok(14));
    }

    #[test]
    fn test_execute_tuff_curly_brace_grouping() {
        assert_eq!(execute_tuff("{ 4U8 + 3U8 } * 2U8"), Ok(14));
    }
}

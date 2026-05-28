use std::collections::HashMap;
use std::io::{self, BufRead};

/// Variable environment for let bindings within blocks.
struct Environment {
    vars: HashMap<String, (i64, String)>, // name -> (value, type)
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
            .map(|(v, _)| *v)
            .ok_or("undefined variable")
    }

    /// Get a variable's declared type (or inferred literal suffix).
    fn get_type(&self, name: &str) -> Result<&String, &'static str> {
        self.vars
            .get(name)
            .map(|(_, t)| t)
            .ok_or("undefined variable")
    }

    /// Set a variable; returns Err if the variable is already bound (no redeclaration).
    fn set(&mut self, name: &str, value: i64, type_name: &str) -> Result<(), &'static str> {
        if self.vars.contains_key(name) {
            return Err("variable already declared");
        }
        self.vars
            .insert(name.to_string(), (value, type_name.to_string()));
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

    // Tokenize into values, operators (+, -, *, /, %), delimiters (; := ), and parentheses (, )
    // A `-` at the start or immediately after another operator is a unary minus (part of the value)
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut prev_was_operator_or_open_paren = true;

    for ch in trimmed.chars() {
        if ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '%' {
            // `-` at start or after operator/( is unary, keep it with the value
            if ch == '-' && prev_was_operator_or_open_paren {
                current.push(ch);
                continue;
            }
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            tokens.push(format!("{}", ch));
            prev_was_operator_or_open_paren = true;
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
        } else if ch.is_whitespace() {
            // Flush current token before skipping whitespace
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        } else {
            current.push(ch);
            prev_was_operator_or_open_paren = false;
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    // Recursive descent parser:
    //   Program      -> Statement (';' Statement)*
    //   Statement    -> 'let' name ':' Type '=' Expression | Expression
    //   Expression   -> Term (('+' | '-') Term)*
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

        // Check for 'let' statement: let name : Type = expression ;
        if tokens[*pos] == "let" {
            result = parse_let_statement(tokens, pos, env)?;
        } else {
            // Regular expression (could be the final value)
            result = parse_expression(tokens, pos, env)?;
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
    } else if tokens[*pos] == "{" {
        parse_block(tokens, pos, env)
    } else {
        let token = &tokens[*pos];
        // Try variable lookup first (identifier without a TUIR suffix)
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
    // Try literal suffix first
    if let Some((_, suffix)) = parse_tuir_value(init_token) {
        return Some(suffix.to_string());
    }
    // Fall back to variable lookup
    if let Ok(ty) = env.get_type(init_token) {
        return Some(ty.clone());
    }
    None
}

// Parse: let name : Type = expression ;
fn parse_let_statement(
    tokens: &[String],
    pos: &mut usize,
    env: &mut Environment,
) -> Result<i64, &'static str> {
    *pos += 1; // consume 'let'

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

    // Use the declared type, or fall back to inferred, or default to "U8"
    let final_type: String = match (declared_type, inferred_type) {
        (_, Some(t)) => t,
        (Some(d), None) => d.to_string(),
        _ => "U8".to_string(),
    };

    // Parse the initializer expression
    let value = parse_expression(tokens, pos, env)?;
    env.set(&var_name, value, &final_type)?;

    Ok(value)
}

/// Evaluate a single TUIR value or return 0 for unrecognized input.
fn evaluate_value(input: &str) -> Result<u64, &'static str> {
    if let Some((value_str, suffix)) = parse_tuir_value(input) {
        // Reject negative numbers for unsigned types
        if value_str.starts_with('-') {
            return Err("negative value not allowed for unsigned type");
        }
        let parsed: u64 = value_str
            .parse()
            .map_err(|_| "failed to parse numeric value")?;

        // Validate range based on suffix
        let max_val = match suffix {
            "U8" => u8::MAX as u64,
            "U16" => u16::MAX as u64,
            "U32" => u32::MAX as u64,
            _ => u64::MAX,
        };

        if parsed > max_val {
            return Err("value out of range for type");
        }

        return Ok(parsed);
    }

    Ok(0)
}

/// Parse a TUIR-formatted value string like "100U8" into (numeric_part, type_suffix).
fn parse_tuir_value(input: &str) -> Option<(&str, &str)> {
    let suffixes = ["U64", "U32", "U16", "U8"];
    for suffix in &suffixes {
        if input.ends_with(suffix) {
            return Some((&input[..input.len() - suffix.len()], suffix));
        }
    }
    None
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

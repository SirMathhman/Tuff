fn main() {
    let tuff_source = fs::read_to_string("src/lib.tuff").expect("Failed to read lib.tuff");
    let c_source = compile_tuff_to_c(&tuff_source);
    fs::write("src/lib.c", &c_source).expect("Failed to write lib.c");
    println!("Compiled src/lib.tuff -> src/lib.c");
}

use std::env;
use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
enum ExecuteError {
    Compile(String),
    Execute(String),
}

// --- Tokenizer ---

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Ident(String),
    Number(i32),
    Let,
    Args,
    Colon,
    Equals,
    Dot,
    Semicolon,
    Eof,
}

struct Lexer {
    tokens: Vec<Token>,
    pos: usize,
}

impl Lexer {
    fn new(input: &str) -> Self {
        let mut tokens = Vec::new();
        let mut chars = input.chars().peekable();

        while let Some(&ch) = chars.peek() {
            if ch.is_whitespace() {
                chars.next();
                continue;
            }

            if ch.is_alphabetic() || ch == '_' {
                let mut ident = String::new();
                while let Some(&c) = chars.peek() {
                    if c.is_alphanumeric() || c == '_' {
                        ident.push(c);
                        chars.next();
                    } else {
                        break;
                    }
                }
                let token = match ident.as_str() {
                    "let" => Token::Let,
                    "args" => Token::Args,
                    _ => Token::Ident(ident),
                };
                tokens.push(token);
            } else if ch.is_digit(10) {
                let mut num = String::new();
                while let Some(&c) = chars.peek() {
                    if c.is_digit(10) {
                        num.push(c);
                        chars.next();
                    } else {
                        break;
                    }
                }
                tokens.push(Token::Number(num.parse().unwrap()));
            } else {
                let token = match ch {
                    ':' => {
                        chars.next();
                        Token::Colon
                    }
                    '=' => {
                        chars.next();
                        Token::Equals
                    }
                    '.' => {
                        chars.next();
                        Token::Dot
                    }
                    ';' => {
                        chars.next();
                        Token::Semicolon
                    }
                    _ => {
                        chars.next();
                        continue;
                    } // skip unknown chars
                };
                tokens.push(token);
            }
        }

        tokens.push(Token::Eof);
        Lexer { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.pos]
    }

    fn eat(&mut self) -> Token {
        let token = self.tokens[self.pos].clone();
        self.pos += 1;
        token
    }

    fn expect(&mut self, expected: &str) -> Token {
        let token = self.eat();
        if format!("{:?}", token).to_lowercase().contains(expected) {
            token
        } else {
            panic!("Expected {}, got {:?}", expected, token);
        }
    }
}

// --- AST ---

#[derive(Debug)]
enum Statement {
    Let {
        name: String,
        value: Box<Expression>,
    },
    Return(Expression),
}

#[derive(Debug)]
enum Expression {
    Number(i32),
    Ident(String),
    PropertyAccess {
        object: Box<Expression>,
        property: String,
    },
}

// --- Parser ---

struct Parser {
    lexer: Lexer,
}

impl Parser {
    fn new(input: &str) -> Self {
        Parser {
            lexer: Lexer::new(input),
        }
    }

    fn parse(&mut self) -> Vec<Statement> {
        let mut statements = Vec::new();

        while *self.lexer.peek() != Token::Eof {
            let stmt = self.parse_statement();
            statements.push(stmt);
        }

        statements
    }

    fn parse_statement(&mut self) -> Statement {
        if *self.lexer.peek() == Token::Let {
            self.lexer.eat(); // eat 'let'
            let name = match self.lexer.eat() {
                Token::Ident(name) => name,
                Token::Args => "args".into(),
                _ => panic!("Expected identifier after 'let'"),
            };

            // Skip type annotation: : Type
            if *self.lexer.peek() == Token::Colon {
                self.lexer.eat(); // eat ':'
                // Skip type tokens until '='
                while *self.lexer.peek() != Token::Equals && *self.lexer.peek() != Token::Eof {
                    self.lexer.eat();
                }
            }

            if *self.lexer.peek() == Token::Equals {
                self.lexer.eat(); // eat '='
            }

            let value = self.parse_expression();

            // Eat semicolon if present
            if *self.lexer.peek() == Token::Semicolon {
                self.lexer.eat();
            }

            Statement::Let {
                name,
                value: Box::new(value),
            }
        } else {
            let expr = self.parse_expression();
            if *self.lexer.peek() == Token::Semicolon {
                self.lexer.eat();
            }
            Statement::Return(expr)
        }
    }

    fn parse_expression(&mut self) -> Expression {
        let mut expr = self.parse_primary();

        while *self.lexer.peek() == Token::Dot {
            self.lexer.eat(); // eat '.'
            let property = match self.lexer.eat() {
                Token::Ident(name) => name,
                Token::Args => "args".into(),
                _ => panic!("Expected property name after '.'"),
            };
            expr = Expression::PropertyAccess {
                object: Box::new(expr),
                property,
            };
        }

        expr
    }

    fn parse_primary(&mut self) -> Expression {
        match self.lexer.eat() {
            Token::Number(n) => Expression::Number(n),
            Token::Ident(name) => Expression::Ident(name),
            Token::Args => Expression::Ident("args".into()),
            Token::Eof => panic!("Unexpected end of input"),
            other => panic!("Unexpected token: {:?}", other),
        }
    }
}

// --- Code Generator ---

struct CodeGen {
    declarations: Vec<String>,
    arg_vars: Vec<String>, // variables that reference args
}

impl CodeGen {
    fn new() -> Self {
        CodeGen {
            declarations: Vec::new(),
            arg_vars: Vec::new(),
        }
    }

    fn generate(&mut self, statements: &[Statement]) -> String {
        // Process all statements except the last (which is the return)
        let (body_stmts, last_stmt) = statements.split_at(statements.len() - 1);

        for stmt in body_stmts {
            match stmt {
                Statement::Let { name, value } => {
                    let c_value = self.expr_to_c(value);
                    if c_value == "argv" {
                        self.declarations
                            .push(format!("    char** {} = argv;", name));
                        self.arg_vars.push(name.clone());
                    }
                }
                Statement::Return(_) => unreachable!(),
            }
        }

        let return_value = match last_stmt[0] {
            Statement::Return(ref expr) => self.expr_to_c(expr),
            _ => unreachable!(),
        };

        let decls = self.declarations.join("\n");
        format!(
            "#include <stdio.h>\nint main(int argc, char* argv[]) {{\n{}\n    return {};\n}}\n",
            decls, return_value
        )
    }

    fn expr_to_c(&self, expr: &Expression) -> String {
        match expr {
            Expression::Number(n) => n.to_string(),
            Expression::Ident(name) => {
                if name == "args" {
                    "argv".into()
                } else {
                    name.clone()
                }
            }
            Expression::PropertyAccess { object, property } => {
                if property == "length" {
                    // Check if object is 'args' or a variable that references args
                    match object.as_ref() {
                        Expression::Ident(name) if name == "args" => "argc".into(),
                        Expression::Ident(name) if self.arg_vars.contains(name) => "argc".into(),
                        _ => format!("{}.{}", self.expr_to_c(object), property),
                    }
                } else {
                    format!("{}.{}", self.expr_to_c(object), property)
                }
            }
        }
    }
}

fn compile_tuff_to_c(tuff_source: &str) -> String {
    let expr = tuff_source.trim();
    if expr.is_empty() {
        return "#include <stdio.h>\nint main(int argc, char* argv[]) { return 0; }\n".into();
    }

    let mut parser = Parser::new(expr);
    let statements = parser.parse();
    let mut codegen = CodeGen::new();
    codegen.generate(&statements)
}

fn execute_tuff(tuff_source: &str, args: Vec<String>) -> Result<i32, ExecuteError> {
    let c_source = compile_tuff_to_c(tuff_source);

    // 1) Save the c_source to a temp .c file
    let temp_dir = env::temp_dir();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let c_file = temp_dir.join(format!("tuff_temp_{}.c", timestamp));
    let exe_file = temp_dir.join(format!("tuff_temp_{}.exe", timestamp));
    fs::write(&c_file, &c_source).map_err(|e| ExecuteError::Compile(e.to_string()))?;

    // 2) Compile the generated .c file using clang
    let compile = Command::new("clang")
        .args([&c_file.to_string_lossy(), "-o", &exe_file.to_string_lossy()])
        .status()
        .map_err(|e| ExecuteError::Compile(e.to_string()))?;
    if !compile.success() {
        return Err(ExecuteError::Compile(
            "clang returned non-zero exit code".into(),
        ));
    }

    // 3) Execute the generated binary using args
    let output = Command::new(&exe_file)
        .args(&args)
        .output()
        .map_err(|e| ExecuteError::Execute(e.to_string()))?;

    // 4) Return the exit code
    let exit_code = output.status.code().unwrap_or(-1);

    // Clean up temp files
    let _ = fs::remove_file(&c_file);
    let _ = fs::remove_file(&exe_file);

    Ok(exit_code)
}

fn expect_valid(tuff_source: &str, args: Vec<String>, expected_exit_code: i32) {
    let c_source = compile_tuff_to_c(tuff_source);
    let actual_exit_code = execute_tuff(tuff_source, args).expect("execute_tuff failed");

    if expected_exit_code != actual_exit_code {
        panic!(
            "Expected {} but was actually {}. Generated: '{}'",
            expected_exit_code, actual_exit_code, c_source
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execute_tuff_empty_source_no_args() {
        expect_valid("", vec![], 0);
    }

    #[test]
    fn test_execute_tuff_returns_expression_value() {
        expect_valid("1", vec![], 1);
    }

    #[test]
    fn test_execute_tuff_args_length_empty() {
        expect_valid("args.length", vec![], 1);
    }

    #[test]
    fn test_execute_tuff_let_args_length() {
        expect_valid("let args0 : &[&Str] = args; args0.length", vec![], 1);
    }

    #[test]
    fn test_execute_tuff_let_args_length_no_type() {
        expect_valid("let args0 = args; args0.length", vec![], 1);
    }
}

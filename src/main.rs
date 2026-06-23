use std::{
    fmt::Write as FmtWrite,
    fs::{read_to_string, write},
};

/// AST nodes for the Tuff language.
enum AstExpr {
    Read,
    Var(String),
    Add(Box<AstExpr>, Box<AstExpr>),
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    pos: usize,
}

#[derive(Debug, Clone)]
enum Token<'a> {
    Let,
    Ident(&'a str),
    Read,
    LParen,
    RParen,
    Plus,
    Equals,
    Semicolon,
    Eof,
}

fn tokenize(source: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut chars = source.chars().peekable();

    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }

        match c {
            ';' => {
                chars.next();
                tokens.push(Token::Semicolon);
            }
            '=' => {
                chars.next();
                tokens.push(Token::Equals);
            }
            '+' => {
                chars.next();
                tokens.push(Token::Plus);
            }
            '(' => {
                chars.next();
                tokens.push(Token::LParen);
            }
            ')' => {
                chars.next();
                tokens.push(Token::RParen);
            }
            _ if c.is_alphabetic() || c == '_' => {
                let mut ident = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch.is_alphanumeric() || ch == '_' {
                        ident.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }

                match ident.as_str() {
                    "let" => tokens.push(Token::Let),
                    "read" => tokens.push(Token::Read),
                    _ => tokens.push(Token::Ident(ident.leak())),
                }
            }
            _ => return vec![], // invalid character → parse error
        }
    }

    tokens.push(Token::Eof);
    tokens
}

impl<'a> Parser<'a> {
    fn new(tokens: Vec<Token<'a>>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token<'a> {
        self.tokens.get(self.pos).unwrap_or(&Token::Eof)
    }

    fn eat(&mut self) -> Token<'a> {
        let tok = self.tokens[self.pos].clone();
        if self.pos + 1 < self.tokens.len() {
            self.pos += 1;
        }
        tok
    }

    /// program → ( "let" IDENT "=" expr ";" )* expr?
    fn parse_program(
        &mut self,
    ) -> Result<(Vec<(&'a str, AstExpr)>, Option<AstExpr>), std::fmt::Error> {
        let mut lets: Vec<(&'a str, AstExpr)> = Vec::new();
        let mut final_expr: Option<AstExpr> = None;

        loop {
            match self.peek() {
                Token::Eof => break,
                Token::Let => {
                    let (name, expr) = self.parse_let()?;
                    lets.push((name, expr));
                }
                _ => {
                    if final_expr.is_some() {
                        return Err(std::fmt::Error); // multiple top-level expressions
                    }
                    final_expr = Some(self.parse_expr()?);
                }
            }
        }

        Ok((lets, final_expr))
    }

    /// let_statement → "let" IDENT "=" expr ";"
    fn parse_let(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        self.eat(); // consume 'let'

        if !matches!(self.peek(), Token::Ident(_)) {
            return Err(std::fmt::Error);
        }
        let name = match &self.tokens[self.pos] {
            Token::Ident(n) => *n,
            _ => unreachable!(),
        };
        self.eat(); // consume ident

        if !matches!(self.peek(), Token::Equals) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '='

        let expr = self.parse_expr()?;

        if !matches!(self.peek(), Token::Semicolon) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume ';'

        Ok((name, expr))
    }

    /// expr → term ("+" term)*
    fn parse_expr(&mut self) -> Result<AstExpr, std::fmt::Error> {
        let mut left = self.parse_term()?;

        while matches!(self.peek(), Token::Plus) {
            self.eat(); // consume '+'
            let right = self.parse_term()?;
            left = AstExpr::Add(Box::new(left), Box::new(right));
        }

        Ok(left)
    }

    /// term → "read" ["(" ")"] | IDENT
    fn parse_term(&mut self) -> Result<AstExpr, std::fmt::Error> {
        match &self.tokens[self.pos] {
            Token::Read => {
                self.eat(); // consume 'read'
                // Optionally skip parentheses: read()
                if matches!(self.peek(), Token::LParen) {
                    self.eat(); // '('
                    if !matches!(self.peek(), Token::RParen) {
                        return Err(std::fmt::Error);
                    }
                    self.eat(); // ')'
                }
                Ok(AstExpr::Read)
            }
            Token::Ident(name) => {
                let name = *name;
                self.eat();
                Ok(AstExpr::Var(name.to_string()))
            }
            _ => Err(std::fmt::Error),
        }
    }
}

/// Emit C code for an AST expression.
fn emit_expr(expr: &AstExpr, buf: &mut String) -> std::fmt::Result {
    match expr {
        AstExpr::Read => {
            write!(buf, "read_val()")?;
        }
        AstExpr::Var(name) => {
            write!(buf, "{}", name)?;
        }
        AstExpr::Add(left, right) => {
            write!(buf, "(")?;
            emit_expr(left, buf)?;
            write!(buf, " + ")?;
            emit_expr(right, buf)?;
            write!(buf, ")")?;
        }
    }
    Ok(())
}

fn compile(source: &str) -> Result<String, std::fmt::Error> {
    let trimmed = source.trim();

    if trimmed.is_empty() {
        return Ok("int main() { return 0; }\n".to_string());
    }

    let tokens = tokenize(trimmed);
    if tokens.is_empty() {
        return Err(std::fmt::Error);
    }

    let mut parser = Parser::new(tokens);
    let (lets, final_expr) = match parser.parse_program() {
        Ok(ast) => ast,
        Err(_) => return Err(std::fmt::Error),
    };

    // Build C source
    let mut c = String::from("#include <stdio.h>\n\n");
    c.push_str("int read_val(void) {\n  int n;\n  scanf(\"%d\", &n);\n  return n;\n}\n\n");
    c.push_str("int main() {\n");

    // Emit variable declarations and assignments for let statements
    for (name, expr) in &lets {
        write!(c, " int {} = ", name).map_err(|_| std::fmt::Error)?;
        emit_expr(expr, &mut c).map_err(|_| std::fmt::Error)?;
        writeln!(c, ";").map_err(|_| std::fmt::Error)?;
    }

    // Emit final expression as return value (or 0 if none)
    match final_expr {
        Some(ref expr) => {
            write!(c, " return ").map_err(|_| std::fmt::Error)?;
            emit_expr(expr, &mut c).map_err(|_| std::fmt::Error)?;
            writeln!(c, ";").map_err(|_| std::fmt::Error)?;
        }
        None => {
            writeln!(c, " return 0;").map_err(|_| std::fmt::Error)?;
        }
    }

    c.push('}');
    Ok(c)
}

fn main() {
    match read_to_string("./src/main.tuff") {
        Ok(source) => match compile(&source) {
            Ok(generated) => match write("./src/main/tuff.c", &generated) {
                Ok(_) => println!("{}", "Compilation successful!"),
                Err(e) => eprintln!("{}", e),
            },
            Err(e) => eprintln!("{}", e),
        },
        Err(e) => eprintln!("{}", e),
    }
}

#[cfg(test)]
fn assert_valid(source: &str, stdin: &str, expected_exit_code: i32) {
    let result = compile(source);
    if result.is_err() {
        panic!("{}", result.unwrap_err());
    }

    let generated_c = result.unwrap();

    // Write to a temporary .c file
    let c_path = std::env::temp_dir().join(format!("tuff_test_{}.c", uuid()));
    write(&c_path, &generated_c).expect("Failed to write .c file");

    // Compile the .c file using clang (in PATH already)
    let exe_path = c_path.with_extension(if cfg!(windows) { "exe" } else { "" });
    let compile_output = std::process::Command::new("clang")
        .arg(&c_path)
        .arg("-o")
        .arg(&exe_path)
        .output()
        .expect("Failed to run clang");

    if !compile_output.status.success() {
        panic!(
            "clang failed: {} generated code {}",
            String::from_utf8_lossy(&compile_output.stderr),
            generated_c
        );
    }

    // Execute the generated executable with stdin piped in
    let mut child = std::process::Command::new(&exe_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("Failed to spawn compiled binary");

    if !stdin.is_empty() {
        use std::io::Write;
        child.stdin.take().unwrap().write_all(stdin.as_bytes()).ok();
    }

    let run_output = child
        .wait_with_output()
        .expect("Failed to wait for compiled binary");

    let actual_exit_code = run_output.status.code().unwrap_or(-1);

    if (expected_exit_code != actual_exit_code) {
        panic!(
            "expected exit code: {} but was actually: {}, generated code {}",
            expected_exit_code, actual_exit_code, generated_c
        )
    }

    // Clean up temp files
    std::fs::remove_file(&c_path).ok();
    std::fs::remove_file(&exe_path).ok();
}

#[cfg(test)]
fn uuid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{:x}{:x}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

#[allow(dead_code)]
#[cfg(test)]
fn assert_invalid(source: &str) {
    assert_eq!(compile(source).is_err(), true);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_program_exits_zero() {
        assert_valid("", "", 0);
    }

    #[test]
    fn read_returns_stdin_value() {
        assert_valid("read()", "1", 1);
    }

    #[test]
    fn read_ignores_extra_input() {
        assert_valid("read()", "1 2", 1);
    }

    #[test]
    fn read_addition() {
        assert_valid("read() + read()", "1 2", 3);
    }

    #[test]
    fn triple_read_addition() {
        assert_valid("read() + read() + read()", "1 2 3", 6);
    }

    #[test]
    fn let_variable_from_read() {
        assert_valid("let x = read(); x", "1", 1);
    }
}

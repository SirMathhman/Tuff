use std::{
    fmt::Write as FmtWrite,
    fs::{read_to_string, write},
};

/// AST nodes for the Tuff language.
enum AstExpr {
    Read,
    ReadBool,
    Var(String),
    Add(Box<AstExpr>, Box<AstExpr>),
    Num(i64),
    Bool(bool),
    If(Box<AstExpr>, Box<AstExpr>, Box<AstExpr>), // condition, then_expr, else_expr
    Block(Vec<(String, AstExpr)>, Option<Box<AstExpr>>), // block: { let ...; expr }
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    pos: usize,
}

#[derive(Debug, Clone)]
enum Token<'a> {
    Let,
    Mut,
    If,
    Else,
    Ident(&'a str),
    Read,
    ReadBool,
    Num(i64),
    Bool(bool),
    LParen,
    RParen,
    LBrace,
    RBrace,
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
            '{' => {
                chars.next();
                tokens.push(Token::LBrace);
            }
            '}' => {
                chars.next();
                tokens.push(Token::RBrace);
            }
            _ if c.is_ascii_digit() => {
                let mut num = String::new();
                while let Some(&ch) = chars.peek() {
                    if ch.is_ascii_digit() {
                        num.push(ch);
                        chars.next();
                    } else {
                        break;
                    }
                }
                tokens.push(Token::Num(num.parse().unwrap()));
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
                    "mut" => tokens.push(Token::Mut),
                    "if" => tokens.push(Token::If),
                    "else" => tokens.push(Token::Else),
                    "read" => tokens.push(Token::Read),
                    "readBool" => tokens.push(Token::ReadBool),
                    "true" => tokens.push(Token::Bool(true)),
                    "false" => tokens.push(Token::Bool(false)),
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

    /// program → ( "let" ["mut"] IDENT "=" expr ";" | IDENT "=" expr ";" )* expr?
    fn parse_program(
        &mut self,
    ) -> Result<
        (
            Vec<(&'a str, AstExpr)>,
            Vec<(&'a str, AstExpr)>,
            Option<AstExpr>,
        ),
        std::fmt::Error,
    > {
        let mut lets: Vec<(&'a str, AstExpr)> = Vec::new();
        let mut assigns: Vec<(&'a str, AstExpr)> = Vec::new();
        let mut final_expr: Option<AstExpr> = None;

        loop {
            match self.peek() {
                Token::Eof => break,
                Token::Let => {
                    let (name, expr) = self.parse_let()?;
                    lets.push((name, expr));
                }
                Token::Ident(_) => {
                    // Could be an assignment: IDENT "=" expr ";"
                    if matches!(self.tokens.get(self.pos + 1), Some(Token::Equals)) {
                        let (name, expr) = self.parse_assign()?;
                        assigns.push((name, expr));
                    } else {
                        // Final expression
                        if final_expr.is_some() {
                            return Err(std::fmt::Error);
                        }
                        final_expr = Some(self.parse_expr()?);
                    }
                }
                _ => {
                    if final_expr.is_some() {
                        return Err(std::fmt::Error); // multiple top-level expressions
                    }
                    final_expr = Some(self.parse_expr()?);
                }
            }
        }

        Ok((lets, assigns, final_expr))
    }

    /// let_statement → "let" ["mut"] IDENT "=" expr ";"
    fn parse_let(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        self.eat(); // consume 'let'

        // Optionally skip 'mut'
        if matches!(self.peek(), Token::Mut) {
            self.eat();
        }

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

    /// assign_statement → IDENT "=" expr ";"
    fn parse_assign(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
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

    /// if_expr → "if" ( expr ) expr "else" expr
    fn parse_if(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // consume 'if'

        if !matches!(self.peek(), Token::LParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '('

        let condition = self.parse_expr()?;

        if !matches!(self.peek(), Token::RParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume ')'

        let then_expr = self.parse_expr()?;

        if !matches!(self.peek(), Token::Else) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume 'else'

        let else_expr = self.parse_expr()?;

        Ok(AstExpr::If(
            Box::new(condition),
            Box::new(then_expr),
            Box::new(else_expr),
        ))
    }

    /// block → "{" ("let" ["mut"] IDENT "=" expr ";")* expr? "}"
    fn parse_block(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // consume '{'

        let mut lets: Vec<(String, AstExpr)> = Vec::new();

        loop {
            match self.peek() {
                Token::RBrace => {
                    self.eat(); // consume '}'
                    return Ok(AstExpr::Block(lets, None));
                }
                Token::Let => {
                    self.eat(); // consume 'let'

                    // Optionally skip 'mut'
                    if matches!(self.peek(), Token::Mut) {
                        self.eat();
                    }

                    let name = match &self.tokens[self.pos] {
                        Token::Ident(n) => (*n).to_string(),
                        _ => return Err(std::fmt::Error),
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

                    lets.push((name, expr));
                }
                _ => break,
            }
        }

        // Final expression in the block
        let final_expr = Some(Box::new(self.parse_expr()?));

        if !matches!(self.peek(), Token::RBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '}'

        Ok(AstExpr::Block(lets, final_expr))
    }

    /// term → "if" expr ")" expr "else" expr | "{" ... } | "read" ["(" ")"] | "readBool" ["(" ")"] | IDENT | NUM | BOOL
    fn parse_term(&mut self) -> Result<AstExpr, std::fmt::Error> {
        if matches!(self.peek(), Token::If) {
            return self.parse_if();
        }
        if matches!(self.peek(), Token::LBrace) {
            return self.parse_block();
        }

        match &self.tokens[self.pos] {
            Token::Read => {
                self.eat(); // consume 'read'
                if matches!(self.peek(), Token::LParen) {
                    self.eat(); // '('
                    if !matches!(self.peek(), Token::RParen) {
                        return Err(std::fmt::Error);
                    }
                    self.eat(); // ')'
                }
                Ok(AstExpr::Read)
            }
            Token::ReadBool => {
                self.eat(); // consume 'readBool'
                if matches!(self.peek(), Token::LParen) {
                    self.eat(); // '('
                    if !matches!(self.peek(), Token::RParen) {
                        return Err(std::fmt::Error);
                    }
                    self.eat(); // ')'
                }
                Ok(AstExpr::ReadBool)
            }
            Token::Num(val) => {
                let val = *val;
                self.eat();
                Ok(AstExpr::Num(val))
            }
            Token::Ident(name) => {
                let name = *name;
                self.eat();
                Ok(AstExpr::Var(name.to_string()))
            }
            Token::Bool(val) => {
                let val = *val;
                self.eat();
                Ok(AstExpr::Bool(val))
            }
            _ => Err(std::fmt::Error),
        }
    }
}

/**
 * Flatten a block into (declarations_code, value_expression).
 * Declarations are emitted before the expression context.
 */
fn flatten_block(
    lets: &[(String, AstExpr)],
    final_expr: &Option<Box<AstExpr>>,
) -> Result<(String, String), std::fmt::Error> {
    let mut decls = String::new();

    for (name, expr) in lets {
        match expr {
            AstExpr::Block(nested_lets, nested_final) => {
                let (nested_decl, nested_val) = flatten_block(nested_lets, nested_final)?;
                write!(decls, "int {} = {};\n", name, nested_val).map_err(|_| std::fmt::Error)?;
                decls.push_str(&nested_decl);
            }
            _ => {
                let mut val_buf = String::new();
                emit_expr(expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
                write!(decls, "int {} = {};\n", name, val_buf).map_err(|_| std::fmt::Error)?;
            }
        }
    }

    let value = match final_expr {
        Some(expr) => match expr.as_ref() {
            AstExpr::Block(nested_lets, nested_final) => {
                let (nested_decl, nested_val) = flatten_block(nested_lets, nested_final)?;
                decls.push_str(&nested_decl);
                nested_val
            }
            _ => {
                let mut val_buf = String::new();
                emit_expr(expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
                val_buf
            }
        },
        None => "0".to_string(),
    };

    Ok((decls, value))
}

/// Emit C code for an AST expression (non-block expressions only).
fn emit_expr(expr: &AstExpr, buf: &mut String) -> std::fmt::Result {
    match expr {
        AstExpr::Read => {
            write!(buf, "read_val()")?;
        }
        AstExpr::ReadBool => {
            write!(buf, "read_bool()")?;
        }
        AstExpr::Num(val) => {
            write!(buf, "{}", val)?;
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
        AstExpr::Bool(val) => {
            if *val {
                write!(buf, "1")?;
            } else {
                write!(buf, "0")?;
            }
        }
        AstExpr::If(condition, then_expr, else_expr) => {
            write!(buf, "(")?;
            emit_expr(condition, buf)?;
            write!(buf, " ? ")?;
            emit_expr(then_expr, buf)?;
            write!(buf, " : ")?;
            emit_expr(else_expr, buf)?;
            write!(buf, ")")?;
        }
        AstExpr::Block(_, _) => {
            // Blocks are handled during compile() by flattening into outer scope.
            // This variant should not reach emit_expr directly.
            return Err(std::fmt::Error);
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
    let (lets, assigns, final_expr) = match parser.parse_program() {
        Ok(ast) => ast,
        Err(_) => return Err(std::fmt::Error),
    };

    // Build C source
    let mut c = String::from("#include <stdio.h>\n#include <string.h>\n\n");
    c.push_str("int read_val(void) {\n  int n;\n  scanf(\"%d\", &n);\n  return n;\n}\n\n");
    c.push_str("int read_bool(void) {\n  char s[10];\n  scanf(\"%s\", s);");
    c.push_str("\n  if (strcmp(s, \"true\") == 0) return 1;\n  return 0;\n}\n");
    c.push_str("int main() {\n");

    // Helper: emit an expression that may contain blocks.
    // Returns (declarations_to_emit_before_context, value_expression).
    let flatten = |expr: &AstExpr| -> Result<(String, String), std::fmt::Error> {
        match expr {
            AstExpr::Block(lets_inner, final_inner) => flatten_block(lets_inner, final_inner),
            _ => {
                let mut val_buf = String::new();
                emit_expr(expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
                Ok((String::new(), val_buf))
            }
        }
    };

    // Emit variable declarations for let statements
    for (name, expr) in &lets {
        let (decls, value) = flatten(expr)?;
        write!(c, "{}", decls).map_err(|_| std::fmt::Error)?;
        write!(c, " int {} = {};", name, value).map_err(|_| std::fmt::Error)?;
    }

    // Emit assignment statements (for mutable variables)
    for (name, expr) in &assigns {
        let (decls, value) = flatten(expr)?;
        write!(c, "{}", decls).map_err(|_| std::fmt::Error)?;
        writeln!(c, " {} = {};", name, value).map_err(|_| std::fmt::Error)?;
    }

    // Emit final expression as return value (or 0 if none)
    match final_expr {
        Some(ref expr) => {
            let (decls, value) = flatten(expr)?;
            write!(c, "{}", decls).map_err(|_| std::fmt::Error)?;
            writeln!(c, " return {};", value).map_err(|_| std::fmt::Error)?;
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
            "clang failed: {} generated code '{}'",
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
            "expected exit code: {} but was actually: {}, generated code '{}'",
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

    #[test]
    fn let_variable_used_twice() {
        assert_valid("let x = read(); x + x", "1", 2);
    }

    #[test]
    fn mutable_variable_reassignment() {
        assert_valid("let mut x = read(); x = read(); x", "1 2", 2);
    }

    #[test]
    fn boolean_literal_true() {
        assert_valid("let x = true; x", "", 1);
    }

    #[test]
    fn read_bool_from_stdin() {
        assert_valid("let x = readBool(); x", "true", 1);
    }

    #[test]
    fn read_plus_literal() {
        assert_valid("read() + 1", "1", 2);
    }

    #[test]
    fn if_else_expression() {
        assert_valid("if (readBool()) 3 else 5", "true", 3);
    }

    #[test]
    fn let_with_if_else() {
        assert_valid("let x = if (readBool()) 3 else 5; x", "true", 3);
    }

    #[test]
    fn block_expression_nested_let() {
        assert_valid("let x = { let y = read(); y }; x", "3", 3);
    }
}

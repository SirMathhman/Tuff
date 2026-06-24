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
    Less(Box<AstExpr>, Box<AstExpr>), // left < right
    Num(i64),
    Bool(bool),
    If(Box<AstExpr>, Box<AstExpr>, Box<AstExpr>), // condition, then_expr, else_expr
    Assign(String, Box<AstExpr>),                 // x = expr (assignment statement)
    Block(Vec<(String, AstExpr)>, Vec<AstExpr>, Option<Box<AstExpr>>), // block: { lets; stmts; expr }
    Loop(Box<AstExpr>), // loop { break expr; } — evaluates to the break expression
    ForLoop(
        String,
        Box<AstExpr>,
        Box<AstExpr>,
        String,
        Box<AstExpr>,
        bool,
    ), // for (var in start..end) body_var +=? body_expr;
    Match(Box<AstExpr>, Vec<(AstExpr, AstExpr)>), // scrutinee, vec of (pattern, result)
    FnDef(String, Box<AstExpr>), // fn name() => expr
    Call(String, Vec<AstExpr>), // funcName(args)
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    pos: usize,
}

#[derive(Debug, Clone)]
enum Token<'a> {
    Let,
    Mut,
    Fn,
    If,
    Else,
    Loop,
    Break,
    For,
    In,
    Match,
    Case,
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
    Less,
    DotDot,   // .. for range
    FatArrow, // => for match cases
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
                // Check for '=>' (fat arrow) — consume '=', then peek for '>'
                chars.next();
                if matches!(chars.peek(), Some('>')) {
                    chars.next();
                    tokens.push(Token::FatArrow);
                } else {
                    tokens.push(Token::Equals);
                }
            }
            '+' => {
                chars.next();
                tokens.push(Token::Plus);
            }
            '<' => {
                chars.next();
                tokens.push(Token::Less);
            }
            '.' => {
                chars.next();
                if matches!(chars.peek(), Some('.')) {
                    chars.next();
                    tokens.push(Token::DotDot);
                } else {
                    return vec![]; // invalid lone dot
                }
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
                    "fn" => tokens.push(Token::Fn),
                    "if" => tokens.push(Token::If),
                    "else" => tokens.push(Token::Else),
                    "loop" => tokens.push(Token::Loop),
                    "break" => tokens.push(Token::Break),
                    "for" => tokens.push(Token::For),
                    "in" => tokens.push(Token::In),
                    "match" => tokens.push(Token::Match),
                    "case" => tokens.push(Token::Case),
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

    /// Consume an IDENT token and return its name.
    fn expect_ident(&mut self) -> Result<&'a str, std::fmt::Error> {
        match &self.tokens[self.pos] {
            Token::Ident(n) => {
                let name = *n;
                self.eat();
                Ok(name)
            }
            _ => Err(std::fmt::Error),
        }
    }

    /// Consume '=' then parse expr then consume ';'.
    fn eat_equals_expr_semicolon(&mut self) -> Result<AstExpr, std::fmt::Error> {
        if !matches!(self.peek(), Token::Equals) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '='
        self.parse_expr_semicolon()
    }

    /// Parse expr then consume ';'.
    fn parse_expr_semicolon(&mut self) -> Result<AstExpr, std::fmt::Error> {
        let expr = self.parse_expr()?;
        if !matches!(self.peek(), Token::Semicolon) {
            return Err(std::fmt::Error);
        }
        self.eat(); // ';'
        Ok(expr)
    }

    /// Consume optional '()' after a function name.
    fn eat_optional_parens(&mut self) -> Result<(), std::fmt::Error> {
        if matches!(self.peek(), Token::LParen) {
            self.expect_open_paren()?;
            if !matches!(self.peek(), Token::RParen) {
                return Err(std::fmt::Error);
            }
            self.eat(); // ')'
        }
        Ok(())
    }

    /// Consume '(' or error.
    fn expect_open_paren(&mut self) -> Result<(), std::fmt::Error> {
        if !matches!(self.peek(), Token::LParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '('
        Ok(())
    }

    /// Consume empty parens: '(' ')'
    fn expect_parens(&mut self) -> Result<(), std::fmt::Error> {
        self.expect_open_paren()?;
        if !matches!(self.peek(), Token::RParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // ')'
        Ok(())
    }

    /// program → ( "let" ["mut"] IDENT "=" expr ";" | IDENT "=" expr ";" | IDENT "+=" expr ";" | for_stmt )* expr?
    fn parse_program(
        &mut self,
    ) -> Result<
        (
            Vec<(&'a str, AstExpr)>,
            Vec<(&'a str, AstExpr, bool)>, // name, expr, is_compound
            Option<AstExpr>,
        ),
        std::fmt::Error,
    > {
        let mut lets: Vec<(&'a str, AstExpr)> = Vec::new();
        let mut assigns: Vec<(&'a str, AstExpr, bool)> = Vec::new();
        let mut final_expr: Option<AstExpr> = None;

        loop {
            match self.peek() {
                Token::Eof => break,
                Token::Let => {
                    let (name, expr) = self.parse_let()?;
                    lets.push((name, expr));
                }
                Token::Fn => {
                    // Function definition: fn name() => expr;
                    let (name, body) = self.parse_fn()?;
                    lets.push((name, body));
                }
                Token::For => {
                    // For-loop statement — store as side-effect expression.
                    let for_expr = self.parse_for()?;
                    assigns.push(("_", for_expr, false));
                }
                Token::Ident(_) => {
                    // Could be assignment: IDENT "=" expr ";"
                    if matches!(self.tokens.get(self.pos + 1), Some(Token::Equals)) {
                        let (name, expr) = self.parse_assign()?;
                        assigns.push((name, expr, false));
                    }
                    // Could be compound assignment: IDENT "+=" expr ";"
                    else if matches!(self.tokens.get(self.pos + 1), Some(Token::Plus))
                        && matches!(self.tokens.get(self.pos + 2), Some(Token::Equals))
                    {
                        let (name, expr) = self.parse_compound_assign()?;
                        assigns.push((name, expr, true));
                    } else {
                        // Final expression — allow multiple; last one wins.
                        if let Some(prev) = final_expr.take() {
                            assigns.push(("_", prev, false));
                        }
                        final_expr = Some(self.parse_expr()?);
                    }
                }
                Token::LBrace => {
                    // Block as a statement — parse it and populate lets/assigns accordingly.
                    self.parse_block_stmts(&mut lets, &mut assigns)?;
                }
                _ => {
                    let parsed_expr = self.parse_expr()?;
                    if let Some(prev) = final_expr.take() {
                        // Previous expression becomes a statement (side effect).
                        assigns.push(("_", prev, false));
                    }
                    final_expr = Some(parsed_expr);
                }
            }
        }

        Ok((lets, assigns, final_expr))
    }

    /// fn_statement → "fn" IDENT () "=>" expr ";"
    fn parse_fn(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        self.eat(); // 'fn'
        let name = self.expect_ident()?;
        self.expect_parens()?;

        if !matches!(self.peek(), Token::FatArrow) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '=>'

        let body = self.parse_expr_semicolon()?;
        Ok((name, AstExpr::FnDef(name.to_string(), Box::new(body))))
    }

    /// let_statement → "let" ["mut"] IDENT "=" expr ";"
    fn parse_let(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        self.eat(); // 'let'
        if matches!(self.peek(), Token::Mut) {
            self.eat();
        }
        let name = self.expect_ident()?;
        let expr = self.eat_equals_expr_semicolon()?;
        Ok((name, expr))
    }

    /// assign_statement → IDENT "=" expr ";"
    fn parse_assign(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        let name = self.expect_ident()?;
        let expr = self.eat_equals_expr_semicolon()?;
        Ok((name, expr))
    }

    /// compound_assign_statement → IDENT "+=" expr ";"
    fn parse_compound_assign(&mut self) -> Result<(&'a str, AstExpr), std::fmt::Error> {
        let name = self.expect_ident()?;
        if !matches!(self.peek(), Token::Plus) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '+'
        if !matches!(self.peek(), Token::Equals) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '='
        let expr = self.parse_expr_semicolon()?;
        Ok((name, expr))
    }

    /// for_statement → "for" ( IDENT "in" expr ".." expr ")" body_var "+="? expr ";"
    fn parse_for(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // 'for'

        self.expect_open_paren()?;

        let var_name = self.expect_ident()?.to_string();

        if !matches!(self.peek(), Token::In) {
            return Err(std::fmt::Error);
        }
        self.eat(); // 'in'

        let start_expr = self.parse_expr()?;

        if !matches!(self.peek(), Token::DotDot) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '..'

        let end_expr = self.parse_expr()?;

        if !matches!(self.peek(), Token::RParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // ')'

        // Parse body: IDENT "+="? expr ";"
        let body_var = self.expect_ident()?.to_string();

        let is_compound = matches!(self.peek(), Token::Plus)
            && matches!(self.tokens.get(self.pos + 1), Some(Token::Equals));

        if is_compound {
            self.eat(); // '+'
            self.eat(); // '='
        } else if !matches!(self.peek(), Token::Equals) {
            return Err(std::fmt::Error);
        } else {
            self.eat(); // '='
        }

        let body_expr = self.parse_expr_semicolon()?;

        Ok(AstExpr::ForLoop(
            var_name,
            Box::new(start_expr),
            Box::new(end_expr),
            body_var,
            Box::new(body_expr),
            is_compound,
        ))
    }

    /// expr → term (("+" | "<") term)*
    fn parse_expr(&mut self) -> Result<AstExpr, std::fmt::Error> {
        let mut left = self.parse_term()?;

        loop {
            match self.peek() {
                Token::Plus => {
                    self.eat(); // consume '+'
                    let right = self.parse_term()?;
                    left = AstExpr::Add(Box::new(left), Box::new(right));
                }
                Token::Less => {
                    self.eat(); // consume '<'
                    let right = self.parse_term()?;
                    left = AstExpr::Less(Box::new(left), Box::new(right));
                }
                _ => break,
            }
        }

        Ok(left)
    }

    /// if_expr → "if" ( expr ) expr "else" expr
    fn parse_if(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // consume 'if'

        self.expect_open_paren()?;

        let condition = self.parse_expr()?;

        if !matches!(self.peek(), Token::RParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume ')'

        let then_expr = self.parse_expr()?;

        // else is optional — if absent, treat as if-then with 0 for the else branch.
        if matches!(self.peek(), Token::Else) {
            self.eat(); // consume 'else'
            let else_expr = self.parse_expr()?;
            Ok(AstExpr::If(
                Box::new(condition),
                Box::new(then_expr),
                Box::new(else_expr),
            ))
        } else {
            Ok(AstExpr::If(
                Box::new(condition),
                Box::new(then_expr),
                Box::new(AstExpr::Num(0)),
            ))
        }
    }

    /// block → "{" ("let" ["mut"] IDENT "=" expr ";")* expr? "}"
    /// Shared helper: parse block contents into lets, assignments, and optional final expression.
    fn parse_block_inner(
        &mut self,
    ) -> Result<
        (
            Vec<(String, AstExpr)>,
            Vec<(&'a str, AstExpr)>,
            Option<AstExpr>,
        ),
        std::fmt::Error,
    > {
        let mut lets: Vec<(String, AstExpr)> = Vec::new();
        let mut assign_pairs: Vec<(&'a str, AstExpr)> = Vec::new();

        loop {
            match self.peek() {
                Token::RBrace => return Ok((lets, assign_pairs, None)),
                Token::Let => {
                    self.eat();
                    if matches!(self.peek(), Token::Mut) {
                        self.eat();
                    }
                    let name = (*self.expect_ident()?).to_string();
                    let expr = self.eat_equals_expr_semicolon()?;
                    lets.push((name, expr));
                }
                _ => break,
            }
        }

        loop {
            match self.peek() {
                Token::RBrace => return Ok((lets, assign_pairs, None)),
                Token::Ident(_) if matches!(self.tokens.get(self.pos + 1), Some(Token::Equals)) => {
                    let (name, expr) = self.parse_assign()?;
                    assign_pairs.push((name, expr));
                }
                _ => break,
            }
        }

        // Final expression — if present.
        let final_expr = if !matches!(self.peek(), Token::RBrace) {
            Some(self.parse_expr()?)
        } else {
            None
        };

        Ok((lets, assign_pairs, final_expr))
    }

    /// Parse block contents as statements (for top-level blocks).
    fn parse_block_stmts(
        &mut self,
        lets: &mut Vec<(&'a str, AstExpr)>,
        assigns: &mut Vec<(&'a str, AstExpr, bool)>,
    ) -> Result<(), std::fmt::Error> {
        self.eat(); // consume '{'

        let (block_lets, assign_pairs, _) = self.parse_block_inner()?;
        for (name, expr) in block_lets {
            lets.push((name.leak(), expr));
        }
        for (name, expr) in assign_pairs {
            assigns.push((name, expr, false));
        }

        if !matches!(self.peek(), Token::RBrace) {
            return Err(std::fmt::Error);
        }
        self.eat();
        Ok(())
    }

    fn parse_block(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // consume '{'

        let (block_lets, assign_pairs, final_expr) = self.parse_block_inner()?;
        let stmts: Vec<AstExpr> = assign_pairs
            .into_iter()
            .map(|(name, expr)| AstExpr::Assign(name.to_string(), Box::new(expr)))
            .collect();

        if !matches!(self.peek(), Token::RBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '}'

        Ok(AstExpr::Block(block_lets, stmts, final_expr.map(Box::new)))
    }

    /// match_expr → "match" ( expr ) { "case" pattern ">=" value ";" ... }
    fn parse_match(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // 'match'

        self.expect_open_paren()?;
        let scrutinee = self.parse_expr()?;

        if !matches!(self.peek(), Token::RParen) {
            return Err(std::fmt::Error);
        }
        self.eat(); // ')'

        if !matches!(self.peek(), Token::LBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '{'

        let mut cases: Vec<(AstExpr, AstExpr)> = Vec::new();
        loop {
            match self.peek() {
                Token::RBrace => break,
                Token::Case => {
                    self.eat(); // 'case'
                    let pattern = self.parse_expr()?;

                    if !matches!(self.peek(), Token::FatArrow) {
                        return Err(std::fmt::Error);
                    }
                    self.eat(); // '=>'

                    let value = self.parse_expr_semicolon()?;
                    cases.push((pattern, value));
                }
                _ => return Err(std::fmt::Error),
            }
        }

        if !matches!(self.peek(), Token::RBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // '}'

        Ok(AstExpr::Match(Box::new(scrutinee), cases))
    }

    /// loop_expr → "loop" { "break" expr ";" }
    fn parse_loop(&mut self) -> Result<AstExpr, std::fmt::Error> {
        self.eat(); // consume 'loop'

        if !matches!(self.peek(), Token::LBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '{'

        if !matches!(self.peek(), Token::Break) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume 'break'

        let break_expr = self.parse_expr()?;

        if !matches!(self.peek(), Token::Semicolon) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume ';'

        if !matches!(self.peek(), Token::RBrace) {
            return Err(std::fmt::Error);
        }
        self.eat(); // consume '}'

        Ok(AstExpr::Loop(Box::new(break_expr)))
    }

    /// term → "if" expr ")" expr "else" expr | "loop" { break expr; } | "match" (expr) { case pat => val; ... } | "{" ... } | "read" ["(" ")"] | "readBool" ["(" ")"] | IDENT | NUM | BOOL
    fn parse_term(&mut self) -> Result<AstExpr, std::fmt::Error> {
        if matches!(self.peek(), Token::If) {
            return self.parse_if();
        }
        if matches!(self.peek(), Token::Loop) {
            return self.parse_loop();
        }
        if matches!(self.peek(), Token::Match) {
            return self.parse_match();
        }
        if matches!(self.peek(), Token::LBrace) {
            return self.parse_block();
        }

        match &self.tokens[self.pos] {
            Token::Read => {
                self.eat();
                self.eat_optional_parens()?;
                Ok(AstExpr::Read)
            }
            Token::ReadBool => {
                self.eat();
                self.eat_optional_parens()?;
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
                // Check if this is a function call: IDENT ( )
                if matches!(self.peek(), Token::LParen) {
                    self.expect_parens()?;
                    Ok(AstExpr::Call(name.to_string(), Vec::new()))
                } else {
                    Ok(AstExpr::Var(name.to_string()))
                }
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
 * Global counter for unique loop temp variable names.
 */
static LOOP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn next_loop_id() -> u64 {
    use std::sync::atomic::Ordering;
    LOOP_COUNTER.fetch_add(1, Ordering::Relaxed)
}

static IF_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn next_if_id() -> u64 {
    use std::sync::atomic::Ordering;
    IF_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Emit C code for a loop expression: while(1) { __loop_N = <break_expr>; break; }
/// Returns the temp variable name to reference.
fn emit_loop_expr(break_expr: &AstExpr, decls: &mut String) -> Result<String, std::fmt::Error> {
    let id = next_loop_id();
    write!(decls, "int __loop_{};\n", id).map_err(|_| std::fmt::Error)?;

    match break_expr {
        AstExpr::Block(nested_lets, _nested_stmts, nested_final) => {
            let (nested_decl, nested_val) = flatten_block(nested_lets, &Vec::new(), nested_final)?;
            decls.push_str(&nested_decl);
            writeln!(
                decls,
                "while(1) {{ __loop_{} = {}; break; }}",
                id, nested_val
            )
            .map_err(|_| std::fmt::Error)?;
        }
        _ => {
            let mut val_buf = String::new();
            emit_expr(break_expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
            writeln!(decls, "while(1) {{ __loop_{} = {}; break; }}", id, val_buf)
                .map_err(|_| std::fmt::Error)?;
        }
    }

    Ok(format!("__loop_{}", id))
}

/**
 * Recursively flatten an expression into (declarations_code, value_expression).
 * Handles blocks, loops, if-statements, and for-loops with proper C code generation.
 */
fn emit_flatten(expr: &AstExpr) -> Result<(String, String), std::fmt::Error> {
    match expr {
        AstExpr::Block(lets_inner, stmts_inner, final_inner) => {
            flatten_block(lets_inner, stmts_inner, final_inner)
        }
        AstExpr::Loop(break_expr) => {
            let mut decls = String::new();
            let val_name = emit_loop_expr(break_expr, &mut decls)?;
            Ok((decls, val_name))
        }
        AstExpr::ForLoop(var_name, start_expr, end_expr, body_var, body_expr, is_compound) => {
            // Emit: for (int var = <start>; var < <end>; var++) { body_var +=? <body_expr>; }
            let mut decls = String::new();

            let (_, start_val) = emit_flatten(start_expr)?;
            let (_, end_val) = emit_flatten(end_expr)?;
            let mut body_buf = String::new();
            emit_expr(body_expr, &mut body_buf).map_err(|_| std::fmt::Error)?;

            if *is_compound {
                writeln!(
                    decls,
                    "for (int {} = {}; {} < {}; {}++) {{ {} += {}; }}",
                    var_name, start_val, var_name, end_val, var_name, body_var, body_buf
                )
                .map_err(|_| std::fmt::Error)?;
            } else {
                writeln!(
                    decls,
                    "for (int {} = {}; {} < {}; {}++) {{ {} = {}; }}",
                    var_name, start_val, var_name, end_val, var_name, body_var, body_buf
                )
                .map_err(|_| std::fmt::Error)?;
            }

            Ok((decls, "0".to_string()))
        }
        AstExpr::Match(scrutinee, cases) => {
            // Emit as a chain of if/else-if with temp variable.
            let id = next_if_id();
            let mut decls = String::new();

            write!(decls, "int __match_{};\n", id).map_err(|_| std::fmt::Error)?;

            // Flatten scrutinee once into a temp.
            let (scrut_decl, scrut_val) = emit_flatten(scrutinee)?;
            decls.push_str(&scrut_decl);

            if cases.is_empty() {
                return Ok((decls, format!("__match_{}", id)));
            }

            for (i, (pattern, value_expr)) in cases.iter().enumerate() {
                let is_wildcard = matches!(pattern, AstExpr::Var(name) if name == "_");

                let (_, pattern_val) = emit_flatten(pattern)?;
                let (val_decl, val_result) = emit_flatten(value_expr)?;

                if i == 0 && !is_wildcard {
                    let cond = format!("({} == {})", scrut_val, pattern_val);
                    writeln!(
                        decls,
                        "if ({}) {{ {} __match_{} = {}; }}",
                        cond, val_decl, id, val_result
                    )
                    .map_err(|_| std::fmt::Error)?;
                } else if is_wildcard {
                    writeln!(
                        decls,
                        "else {{ {} __match_{} = {}; }}",
                        val_decl, id, val_result
                    )
                    .map_err(|_| std::fmt::Error)?;
                } else {
                    let cond = format!("({} == {})", scrut_val, pattern_val);
                    writeln!(
                        decls,
                        "else if ({}) {{ {} __match_{} = {}; }}",
                        cond, val_decl, id, val_result
                    )
                    .map_err(|_| std::fmt::Error)?;
                }
            }

            Ok((decls, format!("__match_{}", id)))
        }
        AstExpr::If(cond, then_br, else_br) => {
            // Emit as a proper C if-statement with temp variable.
            let id = next_if_id();
            let mut decls = String::new();

            write!(decls, "int __if_{};\n", id).map_err(|_| std::fmt::Error)?;

            // Flatten condition.
            let (_, cond_val) = emit_flatten(cond)?;

            // Flatten then and else branches.
            let (then_decl, then_val) = emit_flatten(then_br)?;
            let (else_decl, else_val) = emit_flatten(else_br)?;

            writeln!(
                decls,
                "if ({}) {{ {} __if_{} = {}; }}",
                cond_val, then_decl, id, then_val
            )
            .map_err(|_| std::fmt::Error)?;

            // Only emit else if it's not the default 0.
            if !matches!(else_br.as_ref(), AstExpr::Num(0)) {
                writeln!(
                    decls,
                    "else {{ {} __if_{} = {}; }}",
                    else_decl, id, else_val
                )
                .map_err(|_| std::fmt::Error)?;
            }

            Ok((decls, format!("__if_{}", id)))
        }
        AstExpr::FnDef(_, _) => {
            // Function definitions are handled at the top level of compile().
            return Err(std::fmt::Error);
        }
        _ => flatten_to_expr(expr),
    }
}

/// Helper: emit a simple expression (no declarations needed).
fn flatten_to_expr(expr: &AstExpr) -> Result<(String, String), std::fmt::Error> {
    let mut val_buf = String::new();
    emit_expr(expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
    Ok((String::new(), val_buf))
}

/**
 * Flatten a block into (declarations_code, value_expression).
 * Declarations are emitted before the expression context.
 */
fn flatten_block(
    lets: &[(String, AstExpr)],
    stmts: &[AstExpr],
    final_expr: &Option<Box<AstExpr>>,
) -> Result<(String, String), std::fmt::Error> {
    let mut decls = String::new();

    for (name, expr) in lets {
        match expr {
            AstExpr::Block(nested_lets, nested_stmts, nested_final) => {
                let (nested_decl, nested_val) =
                    flatten_block(nested_lets, nested_stmts, nested_final)?;
                decls.push_str(&nested_decl);
                write!(decls, "int {} = {};\n", name, nested_val).map_err(|_| std::fmt::Error)?;
            }
            AstExpr::Loop(break_expr) => {
                let val_name = emit_loop_expr(break_expr, &mut decls)?;
                write!(decls, "int {} = {};\n", name, val_name).map_err(|_| std::fmt::Error)?;
            }
            AstExpr::FnDef(_, _) => {
                // Function definitions shouldn't appear inside blocks.
                return Err(std::fmt::Error);
            }
            _ => {
                let (_, val_buf) = flatten_to_expr(expr)?;
                write!(decls, "int {} = {};\n", name, val_buf).map_err(|_| std::fmt::Error)?;
            }
        }
    }

    // Emit assignment statements within the block
    for stmt in stmts {
        match stmt {
            AstExpr::Assign(var_name, value_expr) => {
                let mut val_buf = String::new();
                emit_expr(value_expr, &mut val_buf).map_err(|_| std::fmt::Error)?;
                write!(decls, " {} = {};\n", var_name, val_buf).map_err(|_| std::fmt::Error)?;
            }
            _ => {}
        }
    }

    let value = match final_expr {
        Some(expr) => match expr.as_ref() {
            AstExpr::Block(nested_lets, nested_stmts, nested_final) => {
                let (nested_decl, nested_val) =
                    flatten_block(nested_lets, nested_stmts, nested_final)?;
                decls.push_str(&nested_decl);
                nested_val
            }
            AstExpr::Loop(break_expr) => emit_loop_expr(break_expr, &mut decls)?,
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
        AstExpr::Less(left, right) => {
            write!(buf, "(")?;
            emit_expr(left, buf)?;
            write!(buf, " < ")?;
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
        AstExpr::Assign(var_name, value_expr) => {
            write!(buf, "{} = ", var_name)?;
            emit_expr(value_expr, buf)?;
        }
        AstExpr::Block(_, _, _) => {
            // Blocks are handled during compile() by flattening into outer scope.
            // This variant should not reach emit_expr directly.
            return Err(std::fmt::Error);
        }
        AstExpr::Loop(_) => {
            // Loops are handled during compile() by flatten_block.
            // This variant should not reach emit_expr directly.
            return Err(std::fmt::Error);
        }
        AstExpr::ForLoop(_, _, _, _, _, _) => {
            // For-loops are handled during compile() by emit_flatten.
            // This variant should not reach emit_expr directly.
            return Err(std::fmt::Error);
        }
        AstExpr::Match(_, _) => {
            // Match expressions are handled during compile() by emit_flatten.
            // This variant should not reach emit_expr directly.
            return Err(std::fmt::Error);
        }
        AstExpr::FnDef(_, _) => {
            // Function definitions are handled at the top level of compile().
            return Err(std::fmt::Error);
        }
        AstExpr::Call(func_name, _args) => {
            write!(buf, "{}()", func_name)?;
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

    // Emit function definitions before main()
    for (_, expr) in &lets {
        if let AstExpr::FnDef(ref name, ref body_expr) = *expr {
            let mut body_buf = String::new();
            emit_expr(body_expr.as_ref(), &mut body_buf).map_err(|_| std::fmt::Error)?;
            c.push_str(&format!(
                "int {}(void) {{\n  return {};\n}}\n",
                name, body_buf
            ));
        }
    }

    c.push_str("int main() {\n");

    // Emit variable declarations for let statements (skip function definitions)
    for (name, expr) in &lets {
        if matches!(*expr, AstExpr::FnDef(_, _)) {
            continue; // Already emitted as C function above
        }
        let (decls, value) = emit_flatten(expr)?;
        write!(c, "{}", decls).map_err(|_| std::fmt::Error)?;
        write!(c, " int {} = {};", name, value).map_err(|_| std::fmt::Error)?;
    }

    // Emit assignment statements (for mutable variables)
    for (name, expr, is_compound) in &assigns {
        let (decls, value) = emit_flatten(expr)?;
        write!(c, "{}", decls).map_err(|_| std::fmt::Error)?;
        if *is_compound {
            writeln!(c, " {} += {};", name, value).map_err(|_| std::fmt::Error)?;
        } else if *name == "_" {
            // Side-effect expression — only emit declarations, no assignment.
            let _ = value;
        } else {
            writeln!(c, " {} = {};", name, value).map_err(|_| std::fmt::Error)?;
        }
    }

    // Emit final expression as return value (or 0 if none)
    match final_expr {
        Some(ref expr) => {
            let (decls, value) = emit_flatten(expr)?;
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
        panic!("Compilation failed for source: {}", source);
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

    // Execute the generated executable with stdin piped in (with 10s timeout)
    const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

    let mut child = std::process::Command::new(&exe_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("Failed to spawn compiled binary");

    if !stdin.is_empty() {
        use std::io::Write;
        child.stdin.take().unwrap().write_all(stdin.as_bytes()).ok();
    }

    let start = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if start.elapsed() >= TIMEOUT {
                    let _ = child.kill();
                    panic!("Test timed out after 10s for source: {}", source);
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(e) => panic!("Failed to wait for compiled binary: {}", e),
        }
    };

    let actual_exit_code = status.code().unwrap_or(-1);

    if expected_exit_code != actual_exit_code {
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
    fn compound_assignment_plus_equals() {
        assert_valid("let mut x = read(); x += read(); x", "3 4", 7);
    }

    #[test]
    fn block_expression_nested_let() {
        assert_valid("let x = { let y = read(); y }; x", "3", 3);
    }

    #[test]
    fn loop_break_with_read() {
        assert_valid("let x = loop { break read(); }; x", "3", 3);
    }

    #[test]
    fn less_than_comparison() {
        assert_valid("read() < read()", "3 4", 1);
    }

    #[test]
    fn block_assignment_statement() {
        assert_valid("let mut x = read(); { x = read(); } x", "2 3", 3);
    }

    #[test]
    fn if_without_else_block_then() {
        assert_valid("let mut x = read(); if (true) { x = read(); } x", "2 3", 3);
    }

    #[test]
    fn for_loop_range_sum() {
        assert_valid(
            "let mut sum = 0; for (i in 0..read()) sum += i; sum",
            "4",
            6,
        )
    }

    #[test]
    fn match_expression_bool_cases() {
        assert_valid(
            "let x = match (readBool()) { case true => 4; case false => 5; }; x",
            "true",
            4,
        )
    }

    #[test]
    fn match_with_wildcard() {
        assert_valid(
            "let x = match (read()) { case 1 => 4; case _ => 5; }; x",
            "2",
            5,
        )
    }

    #[test]
    fn function_definition_and_call() {
        assert_valid("fn get() => read(); get()", "2", 2)
    }
}

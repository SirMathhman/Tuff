/// Borrow checker for Tuff compiler.
/// Validates ownership and borrowing rules to prevent use-after-free and data races.
///
/// Rules:
/// 1. Each value has exactly one owner
/// 2. References are either:
///    - One or more immutable references (&T) OR
///    - Exactly one mutable reference (&mut T)
/// 3. References cannot outlive their referent
/// 4. Moving a borrowed value is not allowed
use crate::compiler::ast::*;
use crate::compiler::error::{CompileError, ErrorKind, Span};
use std::collections::{HashMap, HashSet};

/// Borrowing state of a variable
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BorrowState {
    /// Not borrowed
    Available,
    /// Has one or more immutable borrows
    ImmutablyBorrowed,
    /// Has one mutable borrow
    MutablyBorrowed,
    /// Has been moved (no longer available)
    Moved,
}

/// Information about a variable's ownership and borrow state
#[derive(Debug, Clone)]
struct VarInfo {
    state: BorrowState,
    is_mutable: bool,
    ty: Option<Type>,
}

/// Borrow checker state
pub struct BorrowChecker {
    /// Stack of scopes, each containing variable info
    scopes: Vec<HashMap<String, VarInfo>>,
    /// Errors collected during checking
    errors: Vec<CompileError>,
}

impl BorrowChecker {
    pub fn new() -> Self {
        BorrowChecker {
            scopes: vec![HashMap::new()],
            errors: Vec::new(),
        }
    }

    /// Push a new scope
    fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    /// Pop the current scope
    fn pop_scope(&mut self) {
        if self.scopes.len() > 1 {
            self.scopes.pop();
        }
    }

    /// Declare a variable in the current scope
    fn declare(&mut self, name: String, is_mutable: bool, ty: Option<Type>) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(
                name,
                VarInfo {
                    state: BorrowState::Available,
                    is_mutable,
                    ty,
                },
            );
        }
    }

    /// Look up a variable's info across scopes
    fn lookup(&self, name: &str) -> Option<VarInfo> {
        for scope in self.scopes.iter().rev() {
            if let Some(info) = scope.get(name) {
                return Some(info.clone());
            }
        }
        None
    }

    /// Look up mutable variable info
    fn lookup_mut(&mut self, name: &str) -> Option<&mut VarInfo> {
        for scope in self.scopes.iter_mut().rev() {
            if scope.contains_key(name) {
                return scope.get_mut(name);
            }
        }
        None
    }

    /// Borrow a variable immutably
    fn borrow_immut(&mut self, name: &str, span: &Span) -> Result<(), CompileError> {
        match self.lookup_mut(name) {
            Some(info) => match info.state {
                BorrowState::Available | BorrowState::ImmutablyBorrowed => {
                    info.state = BorrowState::ImmutablyBorrowed;
                    Ok(())
                }
                BorrowState::MutablyBorrowed => Err(CompileError::new(
                    ErrorKind::CannotBorrowWhileBorrowed(name.to_string()),
                    span.clone(),
                    format!(
                        "Cannot borrow {} immutably while it is mutably borrowed",
                        name
                    ),
                )),
                BorrowState::Moved => Err(CompileError::new(
                    ErrorKind::CannotMoveWhileBorrowed(name.to_string()),
                    span.clone(),
                    format!("Cannot use {} after it has been moved", name),
                )),
            },
            None => Err(CompileError::new(
                ErrorKind::UndefinedVariable(name.to_string()),
                span.clone(),
                format!("Variable {} not defined", name),
            )),
        }
    }

    /// Borrow a variable mutably
    fn borrow_mut(&mut self, name: &str, span: &Span) -> Result<(), CompileError> {
        match self.lookup_mut(name) {
            Some(info) => {
                if !info.is_mutable {
                    return Err(CompileError::new(
                        ErrorKind::CannotBorrowMutableTwice(name.to_string()),
                        span.clone(),
                        format!("Cannot mutably borrow immutable variable {}", name),
                    ));
                }
                match info.state {
                    BorrowState::Available => {
                        info.state = BorrowState::MutablyBorrowed;
                        Ok(())
                    }
                    BorrowState::ImmutablyBorrowed => Err(CompileError::new(
                        ErrorKind::CannotBorrowMutableTwice(name.to_string()),
                        span.clone(),
                        format!(
                            "Cannot mutably borrow {} while it is immutably borrowed",
                            name
                        ),
                    )),
                    BorrowState::MutablyBorrowed => Err(CompileError::new(
                        ErrorKind::CannotBorrowMutableTwice(name.to_string()),
                        span.clone(),
                        format!("Cannot mutably borrow {} twice", name),
                    )),
                    BorrowState::Moved => Err(CompileError::new(
                        ErrorKind::CannotMoveWhileBorrowed(name.to_string()),
                        span.clone(),
                        format!("Cannot use {} after it has been moved", name),
                    )),
                }
            }
            None => Err(CompileError::new(
                ErrorKind::UndefinedVariable(name.to_string()),
                span.clone(),
                format!("Variable {} not defined", name),
            )),
        }
    }

    /// Move a variable
    fn move_var(&mut self, name: &str, span: &Span) -> Result<(), CompileError> {
        match self.lookup_mut(name) {
            Some(info) => match info.state {
                BorrowState::Available => {
                    info.state = BorrowState::Moved;
                    Ok(())
                }
                BorrowState::ImmutablyBorrowed | BorrowState::MutablyBorrowed => {
                    Err(CompileError::new(
                        ErrorKind::CannotMoveWhileBorrowed(name.to_string()),
                        span.clone(),
                        format!("Cannot move {} while it is borrowed", name),
                    ))
                }
                BorrowState::Moved => Err(CompileError::new(
                    ErrorKind::CannotMoveWhileBorrowed(name.to_string()),
                    span.clone(),
                    format!("Cannot use {} after it has been moved", name),
                )),
            },
            None => Err(CompileError::new(
                ErrorKind::UndefinedVariable(name.to_string()),
                span.clone(),
                format!("Variable {} not defined", name),
            )),
        }
    }

    /// Unborrow a variable after use
    fn unborrow(&mut self, name: &str) {
        if let Some(info) = self.lookup_mut(name) {
            if info.state == BorrowState::ImmutablyBorrowed {
                info.state = BorrowState::Available;
            } else if info.state == BorrowState::MutablyBorrowed {
                info.state = BorrowState::Available;
            }
        }
    }

    /// Check a program for borrow violations
    pub fn check_program(&mut self, program: &Program) -> Result<(), Vec<CompileError>> {
        for item in &program.items {
            match item {
                Item::FunctionDef(func) => self.check_function(func),
                Item::TypeDef(_) => {}
                Item::ExternBlock(_) => {}
            }
        }

        if !self.errors.is_empty() {
            return Err(self.errors.clone());
        }
        Ok(())
    }

    fn check_function(&mut self, func: &FunctionDef) {
        self.push_scope();

        // Declare parameters
        for param in &func.parameters {
            self.declare(
                param.name.clone(),
                matches!(param.ty, Type::Reference(_, true)),
                Some(param.ty.clone()),
            );
        }

        // Check body
        self.check_block(&func.body);

        self.pop_scope();
    }

    fn check_block(&mut self, block: &Block) {
        for stmt in &block.statements {
            self.check_statement(stmt);
        }
    }

    fn check_statement(&mut self, stmt: &Statement) {
        match stmt {
            Statement::Let(let_stmt) => {
                if let Some(expr) = &let_stmt.value {
                    self.check_expr(expr);
                }
                self.declare(
                    let_stmt.name.clone(),
                    false, // TODO: Check if mut keyword present
                    let_stmt.ty.clone(),
                );
            }
            Statement::Expr(expr_stmt) => {
                self.check_expr(&expr_stmt.expr);
            }
            Statement::Assign(assign_stmt) => {
                self.check_expr(&assign_stmt.target);
                self.check_expr(&assign_stmt.value);
            }
            Statement::Return(ret_stmt) => {
                if let Some(expr) = &ret_stmt.value {
                    self.check_expr(expr);
                }
            }
            Statement::If(if_stmt) => {
                self.check_expr(&if_stmt.condition);
                self.push_scope();
                self.check_block(&if_stmt.then_block);
                self.pop_scope();
                if let Some(else_block) = &if_stmt.else_block {
                    self.push_scope();
                    self.check_block(else_block);
                    self.pop_scope();
                }
            }
            Statement::Match(match_stmt) => {
                self.check_expr(&match_stmt.expr);
                for arm in &match_stmt.arms {
                    self.push_scope();
                    self.check_block(&arm.body);
                    self.pop_scope();
                }
            }
            Statement::Loop(loop_stmt) => {
                self.push_scope();
                self.check_block(&loop_stmt.body);
                self.pop_scope();
            }
        }
    }

    fn check_expr(&mut self, expr: &Expr) {
        match expr {
            Expr::Variable(var) => {
                if let Err(e) = self.move_var(&var.name, &var.span) {
                    self.errors.push(e);
                }
                self.unborrow(&var.name);
            }
            Expr::UnaryOp(unop) => {
                if unop.op == "&" {
                    if let Expr::Variable(var) = &*unop.expr {
                        if let Err(e) = self.borrow_immut(&var.name, &unop.span) {
                            self.errors.push(e);
                        }
                    }
                } else if unop.op == "&mut" {
                    if let Expr::Variable(var) = &*unop.expr {
                        if let Err(e) = self.borrow_mut(&var.name, &unop.span) {
                            self.errors.push(e);
                        }
                    }
                } else {
                    self.check_expr(&unop.expr);
                }
            }
            Expr::BinaryOp(binop) => {
                self.check_expr(&binop.left);
                self.check_expr(&binop.right);
            }
            Expr::FunctionCall(call) => {
                for arg in &call.args {
                    self.check_expr(arg);
                }
            }
            Expr::FieldAccess(fa) => {
                self.check_expr(&fa.expr);
            }
            Expr::Index(idx) => {
                self.check_expr(&idx.expr);
                self.check_expr(&idx.index);
            }
            _ => {}
        }
    }
}

impl Default for BorrowChecker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_span() -> Span {
        Span::new("test", 1, 1, 1)
    }

    #[test]
    fn test_borrow_checker_creation() {
        let checker = BorrowChecker::new();
        assert_eq!(checker.errors.len(), 0);
    }

    #[test]
    fn test_declare_and_lookup() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            false,
            Some(Type::Primitive("i32".to_string())),
        );
        let info = checker.lookup("x");
        assert!(info.is_some());
        assert_eq!(info.unwrap().state, BorrowState::Available);
    }

    #[test]
    fn test_immutable_borrow() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            false,
            Some(Type::Primitive("i32".to_string())),
        );
        let result = checker.borrow_immut("x", &make_span());
        assert!(result.is_ok());
        let info = checker.lookup("x").unwrap();
        assert_eq!(info.state, BorrowState::ImmutablyBorrowed);
    }

    #[test]
    fn test_mutable_borrow() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            true,
            Some(Type::Primitive("i32".to_string())),
        );
        let result = checker.borrow_mut("x", &make_span());
        assert!(result.is_ok());
        let info = checker.lookup("x").unwrap();
        assert_eq!(info.state, BorrowState::MutablyBorrowed);
    }

    #[test]
    fn test_cannot_mutably_borrow_immutable() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            false,
            Some(Type::Primitive("i32".to_string())),
        );
        let result = checker.borrow_mut("x", &make_span());
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_borrow_while_mutably_borrowed() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            true,
            Some(Type::Primitive("i32".to_string())),
        );
        assert!(checker.borrow_mut("x", &make_span()).is_ok());
        let result = checker.borrow_immut("x", &make_span());
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_mutably_borrow_twice() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            true,
            Some(Type::Primitive("i32".to_string())),
        );
        assert!(checker.borrow_mut("x", &make_span()).is_ok());
        let result = checker.borrow_mut("x", &make_span());
        assert!(result.is_err());
    }

    #[test]
    fn test_move_available_var() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            false,
            Some(Type::Primitive("i32".to_string())),
        );
        let result = checker.move_var("x", &make_span());
        assert!(result.is_ok());
        let info = checker.lookup("x").unwrap();
        assert_eq!(info.state, BorrowState::Moved);
    }

    #[test]
    fn test_cannot_move_borrowed_var() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            true,
            Some(Type::Primitive("i32".to_string())),
        );
        assert!(checker.borrow_mut("x", &make_span()).is_ok());
        let result = checker.move_var("x", &make_span());
        assert!(result.is_err());
    }

    #[test]
    fn test_scopes() {
        let mut checker = BorrowChecker::new();
        checker.declare(
            "x".to_string(),
            false,
            Some(Type::Primitive("i32".to_string())),
        );
        assert!(checker.lookup("x").is_some());

        checker.push_scope();
        assert!(checker.lookup("x").is_some()); // Can see from outer scope
        checker.declare(
            "y".to_string(),
            false,
            Some(Type::Primitive("bool".to_string())),
        );
        assert!(checker.lookup("y").is_some());

        checker.pop_scope();
        assert!(checker.lookup("x").is_some());
        assert!(checker.lookup("y").is_none()); // y is out of scope
    }

    #[test]
    fn test_empty_program() {
        let mut checker = BorrowChecker::new();
        let program = Program { items: vec![] };
        let result = checker.check_program(&program);
        assert!(result.is_ok());
    }
}

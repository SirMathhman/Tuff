/// Type checker for Tuff compiler.
/// Performs type inference and checking on AST nodes.
use crate::compiler::ast::*;
use crate::compiler::error::{CompileError, ErrorKind, Span};
use std::collections::HashMap;

/// Type checker state
pub struct TypeChecker {
    /// Symbol table mapping names to types
    scopes: Vec<HashMap<String, Type>>,
    /// Errors collected during checking
    errors: Vec<CompileError>,
}

impl TypeChecker {
    pub fn new() -> Self {
        TypeChecker {
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

    /// Bind a name to a type in the current scope
    fn bind(&mut self, name: String, ty: Type) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, ty);
        }
    }

    /// Look up a name in the scopes
    fn lookup(&self, name: &str) -> Option<Type> {
        for scope in self.scopes.iter().rev() {
            if let Some(ty) = scope.get(name) {
                return Some(ty.clone());
            }
        }
        None
    }

    /// Type check an expression
    pub fn infer_expr(&mut self, expr: &Expr) -> Result<Type, CompileError> {
        match expr {
            Expr::Literal(lit) => self.infer_literal(lit),
            Expr::Variable(var) => self.infer_variable(var),
            Expr::BinaryOp(binop) => self.infer_binary_op(binop),
            Expr::UnaryOp(unop) => self.infer_unary_op(unop),
            Expr::FunctionCall(call) => self.infer_function_call(call),
            Expr::FieldAccess(fa) => self.infer_field_access(fa),
            Expr::Index(idx) => self.infer_index(idx),
            Expr::Constructor(ctor) => self.infer_constructor(ctor),
        }
    }

    fn infer_literal(&mut self, lit: &Literal) -> Result<Type, CompileError> {
        match lit {
            Literal::Number(n) => {
                // Simple heuristic: if it contains '.', assume f64, else i32
                if n.contains('.') {
                    Ok(Type::Primitive("f64".to_string()))
                } else {
                    Ok(Type::Primitive("i32".to_string()))
                }
            }
            Literal::String(_) => Ok(Type::Named("String".to_string())),
            Literal::Bool(_) => Ok(Type::Primitive("bool".to_string())),
        }
    }

    fn infer_variable(&mut self, var: &Variable) -> Result<Type, CompileError> {
        match self.lookup(&var.name) {
            Some(ty) => Ok(ty),
            None => Err(CompileError::new(
                ErrorKind::UndefinedVariable(var.name.clone()),
                var.span.clone(),
                format!("Variable '{}' not defined", var.name),
            )),
        }
    }

    fn infer_binary_op(&mut self, binop: &BinaryOp) -> Result<Type, CompileError> {
        let left_ty = self.infer_expr(&binop.left)?;
        let right_ty = self.infer_expr(&binop.right)?;

        match binop.op.as_str() {
            // Arithmetic operators
            "+" | "-" | "*" | "/" | "%" => {
                if self.is_numeric(&left_ty) && self.is_numeric(&right_ty) {
                    Ok(left_ty)
                } else {
                    Err(CompileError::new(
                        ErrorKind::TypeMismatch {
                            expected: "numeric".to_string(),
                            found: format!("{:?}", left_ty),
                        },
                        binop.span.clone(),
                        format!("Cannot apply {} to non-numeric types", binop.op),
                    ))
                }
            }
            // Comparison operators
            "==" | "!=" | "<" | "<=" | ">" | ">=" => Ok(Type::Primitive("bool".to_string())),
            // Logical operators
            "&&" | "||" => {
                if self.is_bool(&left_ty) && self.is_bool(&right_ty) {
                    Ok(Type::Primitive("bool".to_string()))
                } else {
                    Err(CompileError::new(
                        ErrorKind::TypeMismatch {
                            expected: "bool".to_string(),
                            found: format!("{:?}", left_ty),
                        },
                        binop.span.clone(),
                        format!("Cannot apply {} to non-bool types", binop.op),
                    ))
                }
            }
            _ => Err(CompileError::new(
                ErrorKind::InvalidOperator(binop.op.clone()),
                binop.span.clone(),
                format!("Unknown operator: {}", binop.op),
            )),
        }
    }

    fn infer_unary_op(&mut self, unop: &UnaryOp) -> Result<Type, CompileError> {
        let expr_ty = self.infer_expr(&unop.expr)?;

        match unop.op.as_str() {
            "-" => {
                if self.is_numeric(&expr_ty) {
                    Ok(expr_ty)
                } else {
                    Err(CompileError::new(
                        ErrorKind::TypeMismatch {
                            expected: "numeric".to_string(),
                            found: format!("{:?}", expr_ty),
                        },
                        unop.span.clone(),
                        "Negation only works with numeric types".to_string(),
                    ))
                }
            }
            "!" => {
                if self.is_bool(&expr_ty) {
                    Ok(Type::Primitive("bool".to_string()))
                } else {
                    Err(CompileError::new(
                        ErrorKind::TypeMismatch {
                            expected: "bool".to_string(),
                            found: format!("{:?}", expr_ty),
                        },
                        unop.span.clone(),
                        "Logical NOT only works with bool".to_string(),
                    ))
                }
            }
            "&" => Ok(Type::Reference(Box::new(expr_ty), false)),
            "&mut" => Ok(Type::Reference(Box::new(expr_ty), true)),
            _ => Err(CompileError::new(
                ErrorKind::InvalidOperator(unop.op.clone()),
                unop.span.clone(),
                format!("Unknown unary operator: {}", unop.op),
            )),
        }
    }

    fn infer_function_call(&mut self, call: &FunctionCall) -> Result<Type, CompileError> {
        // Infer argument types
        for arg in &call.args {
            self.infer_expr(arg)?;
        }

        // For now, return a generic type - proper implementation requires function signatures
        Ok(Type::Primitive("i32".to_string()))
    }

    fn infer_field_access(&mut self, fa: &FieldAccess) -> Result<Type, CompileError> {
        let _expr_ty = self.infer_expr(&fa.expr)?;
        // For now, return a generic type
        Ok(Type::Primitive("i32".to_string()))
    }

    fn infer_index(&mut self, idx: &Index) -> Result<Type, CompileError> {
        let _expr_ty = self.infer_expr(&idx.expr)?;
        let _index_ty = self.infer_expr(&idx.index)?;
        // For now, return a generic type
        Ok(Type::Primitive("i32".to_string()))
    }

    fn infer_constructor(&mut self, ctor: &Constructor) -> Result<Type, CompileError> {
        // Infer argument types
        for arg in &ctor.args {
            self.infer_expr(arg)?;
        }
        Ok(Type::Named(ctor.name.clone()))
    }

    fn is_numeric(&self, ty: &Type) -> bool {
        matches!(
            ty,
            Type::Primitive(s) if s == "i32" || s == "i64" || s == "f32" || s == "f64"
        )
    }

    fn is_bool(&self, ty: &Type) -> bool {
        matches!(ty, Type::Primitive(s) if s == "bool")
    }

    /// Type check a program
    pub fn check_program(&mut self, program: &Program) -> Result<(), Vec<CompileError>> {
        for item in &program.items {
            match item {
                Item::FunctionDef(func) => self.check_function(func),
                Item::TypeDef(_ty_def) => { /* Type definitions don't need checking yet */ }
                Item::ExternBlock(_extern_block) => { /* Extern blocks are assumed correct */ }
            }
        }

        if !self.errors.is_empty() {
            return Err(self.errors.clone());
        }
        Ok(())
    }

    fn check_function(&mut self, func: &FunctionDef) {
        self.push_scope();

        // Bind parameters
        for param in &func.parameters {
            self.bind(param.name.clone(), param.ty.clone());
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
                if let Some(value) = &let_stmt.value {
                    if let Ok(ty) = self.infer_expr(value) {
                        self.bind(let_stmt.name.clone(), ty);
                    }
                } else if let Some(ty) = &let_stmt.ty {
                    self.bind(let_stmt.name.clone(), ty.clone());
                }
            }
            Statement::Expr(expr_stmt) => {
                let _ = self.infer_expr(&expr_stmt.expr);
            }
            Statement::Return(ret_stmt) => {
                if let Some(val) = &ret_stmt.value {
                    let _ = self.infer_expr(val);
                }
            }
            Statement::If(if_stmt) => {
                let _ = self.infer_expr(&if_stmt.condition);
                self.check_block(&if_stmt.then_block);
                if let Some(else_block) = &if_stmt.else_block {
                    self.check_block(else_block);
                }
            }
            Statement::Match(match_stmt) => {
                let _ = self.infer_expr(&match_stmt.expr);
                for arm in &match_stmt.arms {
                    self.check_block(&arm.body);
                }
            }
            Statement::Loop(loop_stmt) => {
                self.check_block(&loop_stmt.body);
            }
            Statement::Assign(assign_stmt) => {
                let _ = self.infer_expr(&assign_stmt.target);
                let _ = self.infer_expr(&assign_stmt.value);
            }
        }
    }
}

impl Default for TypeChecker {
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
    fn test_type_checker_creation() {
        let checker = TypeChecker::new();
        assert_eq!(checker.errors.len(), 0);
    }

    #[test]
    fn test_literal_int() {
        let mut checker = TypeChecker::new();
        let lit = Expr::Literal(Literal::Number("42".to_string()));
        let ty = checker.infer_expr(&lit).unwrap();
        assert_eq!(ty, Type::Primitive("i32".to_string()));
    }

    #[test]
    fn test_literal_float() {
        let mut checker = TypeChecker::new();
        let lit = Expr::Literal(Literal::Number("3.14".to_string()));
        let ty = checker.infer_expr(&lit).unwrap();
        assert_eq!(ty, Type::Primitive("f64".to_string()));
    }

    #[test]
    fn test_literal_bool() {
        let mut checker = TypeChecker::new();
        let lit = Expr::Literal(Literal::Bool(true));
        let ty = checker.infer_expr(&lit).unwrap();
        assert_eq!(ty, Type::Primitive("bool".to_string()));
    }

    #[test]
    fn test_literal_string() {
        let mut checker = TypeChecker::new();
        let lit = Expr::Literal(Literal::String("hello".to_string()));
        let ty = checker.infer_expr(&lit).unwrap();
        assert_eq!(ty, Type::Named("String".to_string()));
    }

    #[test]
    fn test_variable_lookup() {
        let mut checker = TypeChecker::new();
        checker.bind("x".to_string(), Type::Primitive("i32".to_string()));
        let var = Expr::Variable(Variable {
            name: "x".to_string(),
            span: make_span(),
        });
        let ty = checker.infer_expr(&var).unwrap();
        assert_eq!(ty, Type::Primitive("i32".to_string()));
    }

    #[test]
    fn test_undefined_variable() {
        let mut checker = TypeChecker::new();
        let var = Expr::Variable(Variable {
            name: "undefined".to_string(),
            span: make_span(),
        });
        let result = checker.infer_expr(&var);
        assert!(result.is_err());
    }

    #[test]
    fn test_binary_add() {
        let mut checker = TypeChecker::new();
        let binop = Expr::BinaryOp(BinaryOp {
            left: Box::new(Expr::Literal(Literal::Number("1".to_string()))),
            op: "+".to_string(),
            right: Box::new(Expr::Literal(Literal::Number("2".to_string()))),
            span: make_span(),
        });
        let ty = checker.infer_expr(&binop).unwrap();
        assert_eq!(ty, Type::Primitive("i32".to_string()));
    }

    #[test]
    fn test_scopes() {
        let mut checker = TypeChecker::new();
        checker.bind("x".to_string(), Type::Primitive("i32".to_string()));
        assert_eq!(
            checker.lookup("x"),
            Some(Type::Primitive("i32".to_string()))
        );

        checker.push_scope();
        checker.bind("y".to_string(), Type::Primitive("bool".to_string()));
        assert_eq!(
            checker.lookup("x"),
            Some(Type::Primitive("i32".to_string()))
        );
        assert_eq!(
            checker.lookup("y"),
            Some(Type::Primitive("bool".to_string()))
        );

        checker.pop_scope();
        assert_eq!(
            checker.lookup("x"),
            Some(Type::Primitive("i32".to_string()))
        );
        assert_eq!(checker.lookup("y"), None);
    }
}

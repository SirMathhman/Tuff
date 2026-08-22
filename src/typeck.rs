use std::collections::HashMap;

use crate::Span;
use crate::ast::{BinOp, Expr, Stmt};

/// A static type, as determined by the analysis pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Type {
    /// An integer.
    Int,
    /// A boolean.
    Bool,
    /// A shared reference.
    Ref,
    /// A mutable reference.
    MutRef,
    /// An array.
    Array,
}

impl Type {
    /// Whether `other` may be assigned to a binding of this type.
    pub fn compatible(self, other: Type) -> bool {
        self == other
    }

    /// The name of this type, for error messages.
    pub fn name(self) -> &'static str {
        match self {
            Type::Int => "integer",
            Type::Bool => "boolean",
            Type::Ref => "shared reference",
            Type::MutRef => "mutable reference",
            Type::Array => "array",
        }
    }
}

/// The type environment: a stack of scopes mapping names to (type, mutable).
/// Used by the analysis pass to check types without executing.
#[derive(Debug, Default)]
pub struct TypeEnv {
    /// The scope stack, innermost scope last.
    scopes: Vec<HashMap<String, (Type, bool)>>,
    /// Reference variable names mapped to the variable they point at.
    targets: HashMap<String, String>,
}

impl TypeEnv {
    /// Push a new empty scope.
    fn push_scope(&mut self) {
        self.scopes.push(HashMap::new());
    }

    /// Pop the innermost scope.
    fn pop_scope(&mut self) {
        self.scopes.pop();
    }

    /// Look up a binding by name, walking the scope chain from innermost out.
    fn get(&self, name: &str) -> Option<(Type, bool)> {
        self.scopes
            .iter()
            .rev()
            .find_map(|scope| scope.get(name).copied())
    }

    /// Bind a name in the innermost scope.
    fn insert(&mut self, name: String, ty: Type, mutable: bool) {
        self.scopes
            .last_mut()
            .expect("a scope is always present")
            .insert(name, (ty, mutable));
    }

    /// Assign a type to an existing mutable binding, walking the scope chain.
    fn set(&mut self, name: &str, ty: Type, span: Span) -> Result<(), crate::TuffError> {
        for scope in self.scopes.iter_mut().rev() {
            if let Some((current, mutable)) = scope.get_mut(name) {
                if !*mutable {
                    return Err(crate::TuffError::ImmutableAssignment {
                        span,
                        name: name.to_string(),
                    });
                }
                if !current.compatible(ty) {
                    return Err(crate::TuffError::TypeMismatch {
                        span,
                        found: ty.name(),
                        expected: current.name(),
                        name: name.to_string(),
                    });
                }
                *current = ty;
                return Ok(());
            }
        }
        Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.to_string(),
        })
    }
}

/// A type-annotated expression. Produced by the analysis pass and consumed by
/// the evaluator, which no longer needs to re-check static properties.
#[derive(Debug)]
pub enum TypedExpr {
    /// An integer literal.
    Num(i64, Span),
    /// A boolean literal.
    Bool(bool, Span),
    /// A binary operation with a known result type.
    Bin(BinOp, Box<TypedExpr>, Box<TypedExpr>, Type, Span),
    /// A parenthesized expression.
    Group(Box<TypedExpr>, Span),
    /// An array literal.
    Array(Vec<TypedExpr>, Span),
    /// An array index; the base is known to be an array and the index an int.
    Index(Box<TypedExpr>, Box<TypedExpr>, Span),
    /// A variable reference with a known type.
    Ident(String, Type, Span),
    /// A reference to a variable.
    Ref(String, bool, Span),
    /// A dereference of a reference variable, with the resolved target type.
    Deref(String, Type, Span),
    /// A conditional; both branches share a known type.
    If(Box<TypedExpr>, Box<TypedExpr>, Box<TypedExpr>, Type, Span),
    /// A block of statements with a known value type.
    Block(Vec<TypedStmt>, Type, Span),
}

/// A type-annotated statement.
#[derive(Debug)]
pub enum TypedStmt {
    /// A `let` binding with a known type.
    Let(String, bool, Box<TypedExpr>, Type, Span),
    /// An assignment to a known-valid target.
    Assign(Box<TypedExpr>, Box<TypedExpr>, Span),
    /// An expression statement.
    Expr(Box<TypedExpr>),
}

/// Analyze an expression AST, checking types without executing. Returns a
/// type-annotated tree that the evaluator consumes. Both branches of an `if`
/// are analyzed; only the taken branch is later evaluated.
pub fn analyze(expr: &Expr, env: &mut TypeEnv) -> Result<TypedExpr, crate::TuffError> {
    match expr {
        Expr::Num(value, span) => Ok(TypedExpr::Num(*value, *span)),
        Expr::Bool(value, span) => Ok(TypedExpr::Bool(*value, *span)),
        Expr::Bin(op, left, right, span) => analyze_bin(*op, left, right, env, *span),
        Expr::Group(inner, span, _) => {
            let inner = analyze(inner, env)?;
            Ok(TypedExpr::Group(Box::new(inner), *span))
        }
        Expr::Array(elements, span) => {
            let mut items = Vec::with_capacity(elements.len());
            for element in elements {
                items.push(analyze(element, env)?);
            }
            Ok(TypedExpr::Array(items, *span))
        }
        Expr::Index(base, index, span) => analyze_index(base, index, env, *span),
        Expr::Ident(name, span) => match env.get(name) {
            Some((ty, _)) => Ok(TypedExpr::Ident(name.clone(), ty, *span)),
            None => Err(crate::TuffError::UndefinedVariable {
                span: *span,
                name: name.clone(),
            }),
        },
        Expr::Ref(inner, mutable, span) => analyze_ref(inner, *mutable, env, *span),
        Expr::Deref(inner, span) => analyze_deref(inner, env, *span),
        Expr::If(cond, then, otherwise, span) => analyze_if(cond, then, otherwise, env, *span),
        Expr::Block(stmts, span, _) => analyze_block(stmts, env, *span),
    }
}

/// Analyze a binary operation, checking operand types against the operator.
fn analyze_bin(
    op: BinOp,
    left: &Expr,
    right: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let l = analyze(left, env)?;
    let r = analyze(right, env)?;
    let ty = match op {
        BinOp::Eq | BinOp::Ne => Type::Bool,
        _ => {
            if l.ty() != Type::Int || r.ty() != Type::Int {
                return Err(crate::TuffError::ExpectedInteger { span });
            }
            match op {
                BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => Type::Bool,
                _ => Type::Int,
            }
        }
    };
    Ok(TypedExpr::Bin(op, Box::new(l), Box::new(r), ty, span))
}

/// Analyze an index expression, checking the base is an array and the index
/// an integer.
fn analyze_index(
    base: &Expr,
    index: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let b = analyze(base, env)?;
    let i = analyze(index, env)?;
    if i.ty() != Type::Int {
        return Err(crate::TuffError::ExpectedIntegerIndex { span });
    }
    if b.ty() != Type::Array {
        return Err(crate::TuffError::NotAnArray { span });
    }
    Ok(TypedExpr::Index(Box::new(b), Box::new(i), span))
}

/// Analyze a reference expression, checking the inner is a defined variable.
fn analyze_ref(
    inner: &Expr,
    mutable: bool,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let Expr::Ident(name, _) = inner else {
        return Err(crate::TuffError::ExpectedVariableName {
            span,
            after: "&",
        });
    };
    match env.get(name) {
        Some((_, _)) => Ok(TypedExpr::Ref(name.clone(), mutable, span)),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Analyze a dereference expression, resolving the referenced variable's type.
fn analyze_deref(inner: &Expr, env: &mut TypeEnv, span: Span) -> Result<TypedExpr, crate::TuffError> {
    let Expr::Ident(name, _) = inner else {
        return Err(crate::TuffError::ExpectedVariableName {
            span,
            after: "*",
        });
    };
    match env.get(name) {
        Some((Type::Ref, _)) | Some((Type::MutRef, _)) => {
            let target = env.targets.get(name).cloned().unwrap_or_default();
            match env.get(&target) {
                Some((ty, _)) => Ok(TypedExpr::Deref(target, ty, span)),
                None => Err(crate::TuffError::UndefinedVariable {
                    span,
                    name: target,
                }),
            }
        }
        Some((_, _)) => Err(crate::TuffError::NotAReference {
            span,
            name: name.clone(),
        }),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Analyze a conditional, checking the condition is boolean and both branches
/// share a type. Both branches are analyzed; the taken branch is evaluated later.
fn analyze_if(
    cond: &Expr,
    then: &Expr,
    otherwise: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    let c = analyze(cond, env)?;
    if c.ty() != Type::Bool {
        return Err(crate::TuffError::ExpectedBooleanCondition { span });
    }
    let then_t = analyze(then, env)?;
    let otherwise_t = analyze(otherwise, env)?;
    let then_ty = then_t.ty();
    let otherwise_ty = otherwise_t.ty();
    if then_ty != otherwise_ty {
        return Err(crate::TuffError::TypeMismatch {
            span,
            found: otherwise_ty.name(),
            expected: then_ty.name(),
            name: "if".into(),
        });
    }
    Ok(TypedExpr::If(
        Box::new(c),
        Box::new(then_t),
        Box::new(otherwise_t),
        then_ty,
        span,
    ))
}

/// Analyze a block in a fresh scope, returning its value type.
fn analyze_block(
    stmts: &[Stmt],
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedExpr, crate::TuffError> {
    env.push_scope();
    let mut typed = Vec::with_capacity(stmts.len());
    for stmt in stmts {
        typed.push(analyze_stmt(stmt, env)?);
    }
    env.pop_scope();
    let ty = typed
        .last()
        .and_then(|s| s.ty())
        .ok_or(crate::TuffError::BlockHasNoValue { span })?;
    Ok(TypedExpr::Block(typed, ty, span))
}

/// The static type of a typed expression.
impl TypedExpr {
    /// The static type of this expression.
    fn ty(&self) -> Type {
        match self {
            TypedExpr::Num(_, _) => Type::Int,
            TypedExpr::Bool(_, _) => Type::Bool,
            TypedExpr::Bin(_, _, _, ty, _) => *ty,
            TypedExpr::Group(inner, _) => inner.ty(),
            TypedExpr::Array(_, _) => Type::Array,
            TypedExpr::Index(_, _, _) => Type::Int,
            TypedExpr::Ident(_, ty, _) => *ty,
            TypedExpr::Ref(_, mutable, _) => {
                if *mutable {
                    Type::MutRef
                } else {
                    Type::Ref
                }
            }
            TypedExpr::Deref(_, ty, _) => *ty,
            TypedExpr::If(_, _, _, ty, _) => *ty,
            TypedExpr::Block(_, ty, _) => *ty,
        }
    }
}

/// The static type of a typed statement, if it produces a value.
impl TypedStmt {
    /// The static type of this statement, if it produces a value.
    fn ty(&self) -> Option<Type> {
        match self {
            TypedStmt::Let(_, _, _, ty, _) => Some(*ty),
            // An assignment statement evaluates to the unit integer `0`.
            TypedStmt::Assign(_, _, _) => Some(Type::Int),
            TypedStmt::Expr(e) => Some(e.ty()),
        }
    }
}

/// Analyze a statement, producing a type-annotated statement.
fn analyze_stmt(stmt: &Stmt, env: &mut TypeEnv) -> Result<TypedStmt, crate::TuffError> {
    match stmt {
        Stmt::Let(name, mutable, value, span) => analyze_let(name, *mutable, value, env, *span),
        Stmt::Assign(target, value, span) => analyze_assign(target, value, env, *span),
        Stmt::Expr(e) => Ok(TypedStmt::Expr(Box::new(analyze(e, env)?))),
    }
}

/// Analyze a `let` binding, recording reference targets and inserting the
/// binding into the environment.
fn analyze_let(
    name: &str,
    mutable: bool,
    value: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedStmt, crate::TuffError> {
    let value_t = analyze(value, env)?;
    let ty = value_t.ty();
    if let Expr::Ref(inner, _, _) = value
        && let Expr::Ident(target, _) = inner.as_ref()
    {
        env.targets.insert(name.to_string(), target.clone());
    }
    env.insert(name.to_string(), ty, mutable);
    Ok(TypedStmt::Let(
        name.to_string(),
        mutable,
        Box::new(value_t),
        ty,
        span,
    ))
}

/// Analyze an assignment, checking the target is a valid, mutable, type-
/// compatible assignment target.
fn analyze_assign(
    target: &Expr,
    value: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedStmt, crate::TuffError> {
    let ty = analyze(value, env)?.ty();
    match target {
        Expr::Ident(name, _) => env.set(name, ty, span)?,
        Expr::Deref(inner, _) => check_deref_target(inner, ty, env, span)?,
        Expr::Index(base, index, _) => check_index_target(base, index, env, span)?,
        _ => {
            return Err(crate::TuffError::InvalidAssignmentTarget { span });
        }
    }
    Ok(TypedStmt::Assign(
        Box::new(analyze(target, env)?),
        Box::new(analyze(value, env)?),
        span,
    ))
}

/// Check that a dereference assignment target is a mutable reference to a
/// variable of a compatible type.
fn check_deref_target(
    inner: &Expr,
    ty: Type,
    env: &mut TypeEnv,
    span: Span,
) -> Result<(), crate::TuffError> {
    let Expr::Ident(name, _) = inner else {
        return Err(crate::TuffError::ExpectedVariableName {
            span,
            after: "*",
        });
    };
    match env.get(name) {
        Some((Type::Ref, _)) => Err(crate::TuffError::CannotAssignThroughSharedReference {
            span,
        }),
        Some((Type::MutRef, _)) => {
            let target = env.targets.get(name).cloned().unwrap_or_default();
            match env.get(&target) {
                Some((t, _)) => {
                    if !t.compatible(ty) {
                        return Err(crate::TuffError::TypeMismatch {
                            span,
                            found: ty.name(),
                            expected: t.name(),
                            name: target,
                        });
                    }
                    Ok(())
                }
                None => Err(crate::TuffError::UndefinedVariable {
                    span,
                    name: target,
                }),
            }
        }
        Some((_, _)) => Err(crate::TuffError::NotAReference {
            span,
            name: name.clone(),
        }),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Check that an index assignment target is a mutable array with an integer
/// index.
fn check_index_target(
    base: &Expr,
    index: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<(), crate::TuffError> {
    let Expr::Ident(name, _) = base else {
        return Err(crate::TuffError::InvalidAssignmentTarget { span });
    };
    let i = analyze(index, env)?;
    if i.ty() != Type::Int {
        return Err(crate::TuffError::ExpectedIntegerIndex { span });
    }
    match env.get(name) {
        Some((Type::Array, true)) => Ok(()),
        Some((Type::Array, false)) => Err(crate::TuffError::ImmutableAssignment {
            span,
            name: name.clone(),
        }),
        Some((_, _)) => Err(crate::TuffError::NotAnArray { span }),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

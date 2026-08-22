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
        Expr::Bin(op, left, right, span) => {
            let l = analyze(left, env)?;
            let r = analyze(right, env)?;
            let ty = match op {
                BinOp::Eq | BinOp::Ne => Type::Bool,
                _ => {
                    if l.ty() != Type::Int || r.ty() != Type::Int {
                        return Err(crate::TuffError::ExpectedInteger { span: *span });
                    }
                    match op {
                        BinOp::Lt | BinOp::LtEq | BinOp::Gt | BinOp::GtEq => Type::Bool,
                        _ => Type::Int,
                    }
                }
            };
            Ok(TypedExpr::Bin(*op, Box::new(l), Box::new(r), ty, *span))
        }
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
        Expr::Index(base, index, span) => {
            let b = analyze(base, env)?;
            let i = analyze(index, env)?;
            if i.ty() != Type::Int {
                return Err(crate::TuffError::ExpectedIntegerIndex { span: *span });
            }
            if b.ty() != Type::Array {
                return Err(crate::TuffError::NotAnArray { span: *span });
            }
            Ok(TypedExpr::Index(Box::new(b), Box::new(i), *span))
        }
        Expr::Ident(name, span) => match env.get(name) {
            Some((ty, _)) => Ok(TypedExpr::Ident(name.clone(), ty, *span)),
            None => Err(crate::TuffError::UndefinedVariable {
                span: *span,
                name: name.clone(),
            }),
        },
        Expr::Ref(inner, mutable, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "&",
                });
            };
            match env.get(name) {
                Some((_, _)) => Ok(TypedExpr::Ref(name.clone(), *mutable, *span)),
                None => Err(crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
                }),
            }
        }
        Expr::Deref(inner, span) => {
            let Expr::Ident(name, _) = inner.as_ref() else {
                return Err(crate::TuffError::ExpectedVariableName {
                    span: *span,
                    after: "*",
                });
            };
            match env.get(name) {
                Some((Type::Ref, _)) | Some((Type::MutRef, _)) => {
                    let target = env.targets.get(name).cloned().unwrap_or_default();
                    match env.get(&target) {
                        Some((ty, _)) => Ok(TypedExpr::Deref(target, ty, *span)),
                        None => Err(crate::TuffError::UndefinedVariable {
                            span: *span,
                            name: target,
                        }),
                    }
                }
                Some((_, _)) => Err(crate::TuffError::NotAReference {
                    span: *span,
                    name: name.clone(),
                }),
                None => Err(crate::TuffError::UndefinedVariable {
                    span: *span,
                    name: name.clone(),
                }),
            }
        }
        Expr::If(cond, then, otherwise, span) => {
            let c = analyze(cond, env)?;
            if c.ty() != Type::Bool {
                return Err(crate::TuffError::ExpectedBooleanCondition { span: *span });
            }
            // Both branches are analyzed; the taken branch is evaluated later.
            let then_t = analyze(then, env)?;
            let otherwise_t = analyze(otherwise, env)?;
            let then_ty = then_t.ty();
            let otherwise_ty = otherwise_t.ty();
            if then_ty != otherwise_ty {
                return Err(crate::TuffError::TypeMismatch {
                    span: *span,
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
                *span,
            ))
        }
        Expr::Block(stmts, span, _) => {
            env.push_scope();
            let mut typed = Vec::with_capacity(stmts.len());
            for stmt in stmts {
                typed.push(analyze_stmt(stmt, env)?);
            }
            env.pop_scope();
            let ty = typed
                .last()
                .and_then(|s| s.ty())
                .ok_or(crate::TuffError::BlockHasNoValue { span: *span })?;
            Ok(TypedExpr::Block(typed, ty, *span))
        }
    }
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
        Stmt::Let(name, mutable, value, span) => {
            let value_t = analyze(value, env)?;
            let ty = value_t.ty();
            if let Expr::Ref(inner, _, _) = value.as_ref()
                && let Expr::Ident(target, _) = inner.as_ref()
            {
                env.targets.insert(name.clone(), target.clone());
            }
            env.insert(name.clone(), ty, *mutable);
            Ok(TypedStmt::Let(
                name.clone(),
                *mutable,
                Box::new(value_t),
                ty,
                *span,
            ))
        }
        Stmt::Assign(target, value, span) => {
            let ty = analyze(value, env)?.ty();
            match target.as_ref() {
                Expr::Ident(name, _) => {
                    env.set(name, ty, *span)?;
                }
                Expr::Deref(inner, _) => {
                    let Expr::Ident(name, _) = inner.as_ref() else {
                        return Err(crate::TuffError::ExpectedVariableName {
                            span: *span,
                            after: "*",
                        });
                    };
                    match env.get(name) {
                        Some((Type::Ref, _)) => {
                            return Err(crate::TuffError::CannotAssignThroughSharedReference {
                                span: *span,
                            });
                        }
                        Some((Type::MutRef, _)) => {
                            let target = env.targets.get(name).cloned().unwrap_or_default();
                            match env.get(&target) {
                                Some((t, _)) => {
                                    if !t.compatible(ty) {
                                        return Err(crate::TuffError::TypeMismatch {
                                            span: *span,
                                            found: ty.name(),
                                            expected: t.name(),
                                            name: target,
                                        });
                                    }
                                }
                                None => {
                                    return Err(crate::TuffError::UndefinedVariable {
                                        span: *span,
                                        name: target,
                                    });
                                }
                            }
                        }
                        Some((_, _)) => {
                            return Err(crate::TuffError::NotAReference {
                                span: *span,
                                name: name.clone(),
                            });
                        }
                        None => {
                            return Err(crate::TuffError::UndefinedVariable {
                                span: *span,
                                name: name.clone(),
                            });
                        }
                    }
                }
                Expr::Index(base, index, _) => {
                    let Expr::Ident(name, _) = base.as_ref() else {
                        return Err(crate::TuffError::InvalidAssignmentTarget { span: *span });
                    };
                    let i = analyze(index, env)?;
                    if i.ty() != Type::Int {
                        return Err(crate::TuffError::ExpectedIntegerIndex { span: *span });
                    }
                    match env.get(name) {
                        Some((Type::Array, true)) => {}
                        Some((Type::Array, false)) => {
                            return Err(crate::TuffError::ImmutableAssignment {
                                span: *span,
                                name: name.clone(),
                            });
                        }
                        Some((_, _)) => {
                            return Err(crate::TuffError::NotAnArray { span: *span });
                        }
                        None => {
                            return Err(crate::TuffError::UndefinedVariable {
                                span: *span,
                                name: name.clone(),
                            });
                        }
                    }
                }
                _ => {
                    return Err(crate::TuffError::InvalidAssignmentTarget { span: *span });
                }
            }
            Ok(TypedStmt::Assign(
                Box::new(analyze(target, env)?),
                Box::new(analyze(value, env)?),
                *span,
            ))
        }
        Stmt::Expr(e) => Ok(TypedStmt::Expr(Box::new(analyze(e, env)?))),
    }
}

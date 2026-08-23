//! Statement analysis for the type-checking pass: `let`, assignment,
//! `break`, and their target checks.

use super::*;
use crate::Span;
use crate::ast::{Expr, Stmt};

/// Analyze a statement, producing a type-annotated statement.
pub(super) fn analyze_stmt(stmt: &Stmt, env: &mut TypeEnv) -> Result<TypedStmt, crate::TuffError> {
    match stmt {
        Stmt::Let(name, mutable, value, span) => analyze_let(name, *mutable, value, env, *span),
        Stmt::Assign(target, value, span) => analyze_assign(target, value, env, *span),
        Stmt::Break(value, span) => analyze_break(value, env, *span),
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
    let id = env.insert(name.to_string(), ty.clone(), mutable);
    if let Expr::Ref(inner, _, _) = value
        && let Expr::Ident(target, _) = inner.as_ref()
        && let Some((target_id, _, _)) = env.resolve(target, span)
    {
        env.targets.insert(id, target_id);
    }
    Ok(TypedStmt::Let(id, mutable, Box::new(value_t), ty, span))
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
        Expr::Ident(name, _) => {
            let (id, _, _) =
                env.resolve(name, span)
                    .ok_or_else(|| crate::TuffError::UndefinedVariable {
                        span,
                        name: name.clone(),
                    })?;
            env.set(id, ty, span)?;
        }
        Expr::Deref(inner, _) => check_deref_target(inner, ty, env, span)?,
        Expr::Index(base, index, _) => check_index_target(base, index, ty, env, span)?,
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
        return Err(crate::TuffError::ExpectedVariableName { span, after: "*" });
    };
    match env.resolve(name, span) {
        Some((_, Type::Ref, _)) => {
            Err(crate::TuffError::CannotAssignThroughSharedReference { span })
        }
        Some((id, Type::MutRef, _)) => {
            let target = env.targets.get(&id).copied().ok_or_else(|| {
                crate::TuffError::UndefinedVariable {
                    span,
                    name: env.name(id),
                }
            })?;
            match env.get(target) {
                Some((target_name, t, _)) => {
                    if !t.compatible(&ty) {
                        return Err(crate::TuffError::TypeMismatch {
                            span,
                            found: ty.name(),
                            expected: t.name(),
                            name: target_name,
                        });
                    }
                    Ok(())
                }
                None => Err(crate::TuffError::UndefinedVariable {
                    span,
                    name: env.name(target),
                }),
            }
        }
        Some((_, _, _)) => Err(crate::TuffError::NotAReference {
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
/// index and a value compatible with the element type.
fn check_index_target(
    base: &Expr,
    index: &Expr,
    ty: Type,
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
    match env.resolve(name, span) {
        Some((_, Type::Array(element), true)) => {
            if !element.compatible(&ty) {
                return Err(crate::TuffError::ElementTypeMismatch {
                    span,
                    found: ty.name(),
                    expected: element.name(),
                });
            }
            Ok(())
        }
        Some((_, Type::Array(_), false)) => Err(crate::TuffError::ImmutableAssignment {
            span,
            name: name.clone(),
        }),
        Some((_, _, _)) => Err(crate::TuffError::NotAnArray { span }),
        None => Err(crate::TuffError::UndefinedVariable {
            span,
            name: name.clone(),
        }),
    }
}

/// Analyze a `break` statement, checking it is inside a loop and recording
/// its value's type for the enclosing loop.
fn analyze_break(
    value: &Expr,
    env: &mut TypeEnv,
    span: Span,
) -> Result<TypedStmt, crate::TuffError> {
    if env.break_collectors.is_empty() {
        return Err(crate::TuffError::BreakOutsideLoop { span });
    }
    let value_t = analyze(value, env)?;
    let ty = value_t.ty();
    env.break_collectors
        .last_mut()
        .expect("a break collector is present")
        .push((ty, span));
    Ok(TypedStmt::Break(Box::new(value_t), span))
}

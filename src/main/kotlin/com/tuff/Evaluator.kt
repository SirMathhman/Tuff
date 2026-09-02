package com.tuff

fun evaluate(input: String): Result<Int> {
    val tokens = tokenize(input)
    if (tokens.isFailure) return Result.failure(tokens.exceptionOrNull()!!)
    val ast = parse(tokens.getOrThrow())
    if (ast.isFailure) return Result.failure(ast.exceptionOrNull()!!)
    return evaluate(ast.getOrThrow(), Scope())
}

fun evaluate(ast: Ast, scope: Scope = Scope()): Result<Int> {
    return when (ast) {
        is Ast.Number -> Result.success(ast.value)

        is Ast.VarRef -> {
            val binding = scope.lookup(ast.name)
                ?: return Result.failure(EvalError.UnknownVariable(ast.name, 0))
            Result.success(binding.value)
        }

        is Ast.BinaryOp -> {
            val left = evaluate(ast.left, scope)
            if (left.isFailure) return left
            val right = evaluate(ast.right, scope)
            if (right.isFailure) return right
            Result.success(
                when (ast.op) {
                    OpKind.PLUS -> left.getOrThrow() + right.getOrThrow()
                    OpKind.MINUS -> left.getOrThrow() - right.getOrThrow()
                    OpKind.MULTIPLY -> left.getOrThrow() * right.getOrThrow()
                }
            )
        }

        is Ast.Ref -> {
            // Forming a reference requires the target to exist.
            val target = scope.lookup(ast.name)
                ?: return Result.failure(EvalError.UnknownVariable(ast.name, 0))
            Result.success(target.value)
        }

        is Ast.Deref -> {
            // Dereference reads the *current* value of the pointee (a live reference).
            val pointee = resolvePointee(ast.inner, scope)
                ?: return Result.failure(EvalError.UnknownVariable(refName(ast.inner), 0))
            val target = scope.lookup(pointee)
                ?: return Result.failure(EvalError.UnknownVariable(pointee, 0))
            Result.success(target.value)
        }

        is Ast.Let -> {
            val value = evaluate(ast.value, scope)
            if (value.isFailure) return value
            val binding = if (ast.value is Ast.Ref) {
                val ref = ast.value
                val target = scope.lookup(ref.name)
                    ?: return Result.failure(EvalError.UnknownVariable(ref.name, 0))
                Binding(ast.name, target.value, mutable = false, refTarget = ref.name, refMutable = ref.mutable)
            } else {
                Binding(ast.name, value.getOrThrow(), mutable = ast.mutable)
            }
            scope.bind(binding)
            value
        }

        is Ast.Assign -> {
            val binding = scope.lookup(ast.name)
                ?: return Result.failure(EvalError.UnknownVariable(ast.name, 0))
            if (!binding.mutable) {
                return Result.failure(EvalError.AssignmentToImmutable(ast.name, 0))
            }
            val value = evaluate(ast.value, scope)
            if (value.isFailure) return value
            scope.assign(ast.name, value.getOrThrow())
            value
        }

        is Ast.DerefAssign -> {
            // Write-through: only permitted for references formed with `&mut`.
            val refVar = refName(ast.ref)
            val refBinding = scope.lookup(refVar)
                ?: return Result.failure(EvalError.UnknownVariable(refVar, 0))
            val pointee = refBinding.refTarget
                ?: return Result.failure(EvalError.UnknownVariable(refVar, 0))
            if (!refBinding.refMutable) {
                return Result.failure(EvalError.WriteThroughImmutableReference(refVar, 0))
            }
            val value = evaluate(ast.value, scope)
            if (value.isFailure) return value
            scope.assign(pointee, value.getOrThrow())
            value
        }

        is Ast.Block -> {
            scope.enter()
            var last: Result<Int> = Result.success(0)
            for (stmt in ast.stmts) {
                last = evaluate(stmt, scope)
                if (last.isFailure) {
                    scope.exit()
                    return last
                }
            }
            val result = ast.result?.let { evaluate(it, scope) } ?: last
            scope.exit()
            result
        }
    }
}

/** Extracts a human-readable variable name from a reference AST node for error messages. */
private fun refName(ref: Ast): String = when (ref) {
    is Ast.VarRef -> ref.name
    is Ast.Deref -> refName(ref.inner)
    is Ast.Number, is Ast.BinaryOp, is Ast.Let, is Ast.Assign, is Ast.Ref, is Ast.DerefAssign, is Ast.Block -> ref.toString()
}

/**
 * Resolves the variable that [ref] points to, or `null` if [ref] is not a reference.
 * A reference is a [Ast.VarRef] whose binding carries a [Binding.refTarget], or a
 * [Ast.Deref] wrapping such a reference.
 */
private fun resolvePointee(ref: Ast, scope: Scope): String? {
    return when (ref) {
        is Ast.VarRef -> scope.lookup(ref.name)?.refTarget
        is Ast.Deref -> resolvePointee(ref.inner, scope)
        is Ast.Number, is Ast.BinaryOp, is Ast.Let, is Ast.Assign, is Ast.Ref, is Ast.DerefAssign, is Ast.Block -> null
    }
}

package com.tuff

fun evaluate(input: String): Result<Int> {
    val tokens = tokenize(input)
    if (tokens.isFailure) return Result.failure(tokens.exceptionOrNull()!!)
    val ast = parse(tokens.getOrThrow())
    if (ast.isFailure) return Result.failure(ast.exceptionOrNull()!!)
    return evaluate(ast.getOrThrow(), mutableMapOf())
}

fun evaluate(ast: Ast, env: MutableMap<String, Int>, refs: MutableMap<String, String> = mutableMapOf()): Result<Int> {
    return when (ast) {
        is Ast.Number -> Result.success(ast.value)
        is Ast.VarRef -> env[ast.name]?.let { Result.success(it) }
            ?: Result.failure(EvalError.UnknownVariable(ast.name, 0))

        is Ast.BinaryOp -> {
            val left = evaluate(ast.left, env, refs)
            if (left.isFailure) return left
            val right = evaluate(ast.right, env, refs)
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
            val value = env[ast.name]
                ?: return Result.failure(EvalError.UnknownVariable(ast.name, 0))
            Result.success(value)
        }

        is Ast.Deref -> {
            val inner = evaluate(ast.inner, env, refs)
            if (inner.isFailure) return inner
            // Dereference resolves to the value pointed to; in this simplified model,
            // references are just names that resolve to their bound value.
            inner
        }

        is Ast.Let -> {
            val value = evaluate(ast.value, env, refs)
            if (value.isFailure) return value
            env[ast.name] = value.getOrThrow()
            if (ast.value is Ast.Ref) {
                refs[ast.name] = ast.value.name
            }
            evaluate(ast.body, env, refs)
        }

        is Ast.Assign -> {
            if (ast.name !in env) {
                return Result.failure(EvalError.UnknownVariable(ast.name, 0))
            }
            val value = evaluate(ast.value, env, refs)
            if (value.isFailure) return value
            env[ast.name] = value.getOrThrow()
            evaluate(ast.body, env, refs)
        }

        is Ast.DerefAssign -> {
            val pointee = resolvePointee(ast.ref, refs)
                ?: return Result.failure(EvalError.UnknownVariable(ast.ref.toString(), 0))
            val value = evaluate(ast.value, env, refs)
            if (value.isFailure) return value
            env[pointee] = value.getOrThrow()
            evaluate(ast.body, env, refs)
        }
    }
}

private fun resolvePointee(ref: Ast, refs: MutableMap<String, String>): String? {
    return when (ref) {
        is Ast.VarRef -> refs[ref.name]
        is Ast.Deref -> resolvePointee(ref.inner, refs)
        is Ast.Number, is Ast.BinaryOp, is Ast.Let, is Ast.Assign, is Ast.Ref, is Ast.DerefAssign -> null
    }
}

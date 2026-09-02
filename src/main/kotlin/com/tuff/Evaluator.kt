package com.tuff

fun evaluate(input: String): Result<Int> {
    val tokens = tokenize(input)
    if (tokens.isFailure) return Result.failure(tokens.exceptionOrNull()!!)
    val ast = parse(tokens.getOrThrow())
    if (ast.isFailure) return Result.failure(ast.exceptionOrNull()!!)
    return evaluate(ast.getOrThrow(), emptyMap())
}

fun evaluate(ast: Ast, env: Map<String, Int>): Result<Int> {
    return when (ast) {
        is Ast.Number -> Result.success(ast.value)
        is Ast.VarRef -> env[ast.name]?.let { Result.success(it) }
            ?: Result.failure(EvalError.UnknownVariable(ast.name, 0))
        is Ast.BinaryOp -> {
            val left = evaluate(ast.left, env)
            if (left.isFailure) return left
            val right = evaluate(ast.right, env)
            if (right.isFailure) return right
            Result.success(when (ast.op) {
                OpKind.PLUS -> left.getOrThrow() + right.getOrThrow()
                OpKind.MINUS -> left.getOrThrow() - right.getOrThrow()
                OpKind.MULTIPLY -> left.getOrThrow() * right.getOrThrow()
            })
        }
        is Ast.Let -> {
            val value = evaluate(ast.value, env)
            if (value.isFailure) return value
            evaluate(ast.body, env + (ast.name to value.getOrThrow()))
        }
    }
}

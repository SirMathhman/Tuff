package com.tuff

fun evaluate(input: String): Result<Int> {
    return runCatching {
        val tokens = tokenize(input).getOrThrow()
        val ast = parse(tokens).getOrThrow()
        evaluate(ast, emptyMap())
    }
}

fun evaluate(ast: Ast, env: Map<String, Int>): Int = when (ast) {
    is Ast.Number -> ast.value
    is Ast.VarRef -> env[ast.name] ?: throw EvalError.UnexpectedToken(0, ast.name)
    is Ast.BinaryOp -> when (ast.op) {
        OpKind.PLUS -> evaluate(ast.left, env) + evaluate(ast.right, env)
        OpKind.MINUS -> evaluate(ast.left, env) - evaluate(ast.right, env)
        OpKind.MULTIPLY -> evaluate(ast.left, env) * evaluate(ast.right, env)
    }
    is Ast.Let -> {
        val value = evaluate(ast.value, env)
        evaluate(ast.body, env + (ast.name to value))
    }
}

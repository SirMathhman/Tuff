package com.tuff

fun evaluate(input: String): Result<Int> {
    return runCatching {
        val tokens = tokenize(input).getOrThrow()
        val ast = parse(tokens).getOrThrow()
        evaluate(ast)
    }
}

fun evaluate(ast: Ast): Int = when (ast) {
    is Ast.Number -> ast.value
    is Ast.BinaryOp -> when (ast.op) {
        OpKind.PLUS -> evaluate(ast.left) + evaluate(ast.right)
        OpKind.MINUS -> evaluate(ast.left) - evaluate(ast.right)
        OpKind.MULTIPLY -> evaluate(ast.left) * evaluate(ast.right)
    }
}

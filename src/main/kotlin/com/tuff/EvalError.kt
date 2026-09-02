package com.tuff

sealed class EvalError(override val message: String) : Exception(message) {
    abstract val position: Int

    data class NonNumericToken(override val position: Int, val token: String) : EvalError(
        "Non-numeric token '$token' at position $position"
    )

    data class UnexpectedToken(override val position: Int, val token: String) : EvalError(
        "Unexpected token '$token' at position $position"
    )

    data class EmptyExpression(override val position: Int) : EvalError(
        "Empty expression"
    )

    data class UnknownVariable(val name: String, override val position: Int) : EvalError(
        "Unknown variable '$name' at position $position"
    )
}

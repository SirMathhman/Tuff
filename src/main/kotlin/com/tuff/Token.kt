package com.tuff

enum class OpKind { PLUS, MINUS, MULTIPLY }

sealed class Token {
    data class Number(val value: Int) : Token()
    data class Op(val kind: OpKind) : Token()
}

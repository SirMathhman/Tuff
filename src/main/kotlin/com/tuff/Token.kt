package com.tuff

enum class OpKind { PLUS, MINUS, MULTIPLY }

sealed class Token {
    data class Number(val value: Int) : Token()
    data class Identifier(val name: String) : Token()
    data class Op(val kind: OpKind) : Token()
    object Let : Token()
    object Mut : Token()
    object Equals : Token()
    object Semicolon : Token()
    object LParen : Token()
    object RParen : Token()
    object LBrace : Token()
    object RBrace : Token()
    object Ref : Token()   // &
    object Deref : Token() // *
}

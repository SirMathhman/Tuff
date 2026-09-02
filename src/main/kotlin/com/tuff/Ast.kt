package com.tuff

sealed class Ast {
    data class Number(val value: Int) : Ast()
    data class BinaryOp(val op: OpKind, val left: Ast, val right: Ast) : Ast()
}

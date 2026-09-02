package com.tuff

sealed class Ast {
    data class Number(val value: Int) : Ast()
    data class VarRef(val name: String) : Ast()
    data class BinaryOp(val op: OpKind, val left: Ast, val right: Ast) : Ast()
    data class Let(val name: String, val value: Ast, val body: Ast?, val mutable: Boolean = false) : Ast()
    data class Assign(val name: String, val value: Ast, val body: Ast?) : Ast()
    data class Ref(val name: String, val mutable: Boolean = false) : Ast()
    data class Deref(val inner: Ast) : Ast()
    data class DerefAssign(val ref: Ast, val value: Ast, val body: Ast?) : Ast()
    data class Sequence(val first: Ast, val second: Ast) : Ast()
}

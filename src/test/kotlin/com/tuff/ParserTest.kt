package com.tuff

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ParserTest {
    @Test
    fun `parse single number`() {
        val tokens = listOf(Token.Number(5))
        assertEquals(Ast.Number(5), parse(tokens).getOrThrow())
    }

    @Test
    fun `parse addition`() {
        val tokens = listOf(Token.Number(1), Token.Op(OpKind.PLUS), Token.Number(2))
        assertEquals(
            Ast.BinaryOp(OpKind.PLUS, Ast.Number(1), Ast.Number(2)),
            parse(tokens).getOrThrow()
        )
    }

    @Test
    fun `parse multiplication precedence`() {
        val tokens =
            listOf(Token.Number(2), Token.Op(OpKind.PLUS), Token.Number(3), Token.Op(OpKind.MULTIPLY), Token.Number(4))
        assertEquals(
            Ast.BinaryOp(OpKind.PLUS, Ast.Number(2), Ast.BinaryOp(OpKind.MULTIPLY, Ast.Number(3), Ast.Number(4))),
            parse(tokens).getOrThrow()
        )
    }

    @Test
    fun `parse parenthesized expression`() {
        val tokens = listOf(
            Token.LParen, Token.Number(2), Token.Op(OpKind.PLUS), Token.Number(3), Token.RParen,
            Token.Op(OpKind.MULTIPLY), Token.Number(4)
        )
        assertEquals(
            Ast.BinaryOp(OpKind.MULTIPLY, Ast.BinaryOp(OpKind.PLUS, Ast.Number(2), Ast.Number(3)), Ast.Number(4)),
            parse(tokens).getOrThrow()
        )
    }

    @Test
    fun `parse empty tokens returns failure`() {
        assertIs<EvalError.UnexpectedToken>(parse(emptyList()).exceptionOrNull())
    }

    @Test
    fun `parse trailing token returns failure`() {
        val tokens = listOf(Token.Number(1), Token.Number(2))
        assertIs<EvalError.UnexpectedToken>(parse(tokens).exceptionOrNull())
    }
}

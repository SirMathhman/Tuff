package com.tuff

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class TokenizerTest {
    @Test
    fun `tokenize single number`() {
        val tokens = tokenize("5").getOrThrow()
        assertEquals(listOf(Token.Number(5)), tokens)
    }

    @Test
    fun `tokenize expression with operators`() {
        val tokens = tokenize("1 + 2 * 3").getOrThrow()
        assertEquals(
            listOf(
                Token.Number(1),
                Token.Op(OpKind.PLUS),
                Token.Number(2),
                Token.Op(OpKind.MULTIPLY),
                Token.Number(3)
            ),
            tokens
        )
    }

    @Test
    fun `tokenize empty string returns failure`() {
        assertIs<EvalError.EmptyExpression>(tokenize("").exceptionOrNull())
    }

    @Test
    fun `tokenize whitespace only returns failure`() {
        assertIs<EvalError.EmptyExpression>(tokenize("  ").exceptionOrNull())
    }

    @Test
    fun `tokenize invalid symbol returns failure`() {
        assertIs<EvalError.UnexpectedToken>(tokenize("@ + 1").exceptionOrNull())
    }

    @Test
    fun `tokenize trailing operator returns failure`() {
        assertIs<EvalError.UnexpectedToken>(tokenize("1 +").exceptionOrNull())
    }

    @Test
    fun `tokenize unknown operator returns failure`() {
        assertIs<EvalError.UnexpectedToken>(tokenize("1 / 2").exceptionOrNull())
    }
}

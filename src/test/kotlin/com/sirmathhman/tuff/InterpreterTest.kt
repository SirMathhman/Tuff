package com.sirmathhman.tuff

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class InterpreterTest {
    @Test
    fun `interpret should parse integer string`() {
        assertEquals(Result.Ok(100), interpret("100"))
    }

    @Test
    fun `interpret should evaluate addition`() {
        assertEquals(Result.Ok(3), interpret("1 + 2"))
    }
    @Test
    fun `interpret should evaluate chained addition`() {
        assertEquals(Result.Ok(6), interpret("1 + 2 + 3"))
        assertEquals(Result.Ok(6), interpret("1+2+3"))
    }

    @Test
    fun `interpret should handle subtraction and mixed operators`() {
        assertEquals(Result.Ok(8), interpret("10 - 5 + 3"))
        assertEquals(Result.Ok(2), interpret("10-5-3"))
    }

    @Test
    fun `interpret should support multiplication with precedence`() {
        assertEquals(Result.Ok(53), interpret("10 * 5 + 3"))
        assertEquals(Result.Ok(14), interpret("2 + 3 * 4"))
        assertEquals(Result.Ok(24), interpret("2 * 3 * 4"))
    }

    @Test
    fun `interpret should support parentheses`() {
        assertEquals(Result.Ok(80), interpret("10 * (5 + 3)"))
        assertEquals(Result.Ok(70), interpret("10 * (5 + 2) + 0"))
    }
}



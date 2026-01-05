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
}


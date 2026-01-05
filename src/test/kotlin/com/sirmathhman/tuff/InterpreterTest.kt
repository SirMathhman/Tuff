package com.sirmathhman.tuff

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals

class InterpreterTest {
    @Test
    fun `interpret should parse integer string`() {
        assertEquals(100, interpret("100"))
    }

    @Test
    fun `interpret should evaluate addition`() {
        assertEquals(3, interpret("1 + 2"))
    }
}

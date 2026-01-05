package com.sirmathhman.tuff

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals

class InterpreterTest {
    @Test
    fun `interpret should parse integer string`() {
        assertEquals(100, interpret("100"))
    }
}

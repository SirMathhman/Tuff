package com.sirmathhman.tuff

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class InterpreterTest {
    @Test
    fun `interpret should throw unsupported operation`() {
        assertThrows<UnsupportedOperationException> {
            interpret("any input")
        }
    }
}

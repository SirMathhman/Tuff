package com.example;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.IOException;

/**
 * Test cases for the NodeJSEvaluator.
 */
public class NodeJSEvaluatorTest {

    @Test
    public void testInterpretReturnsExitCode() throws IOException, InterruptedException {
        // Test: interpret("100") should result in exit code 100
        String result = NodeJSEvaluator.interpret("100");
        
        // The result should be "100" as a string (the exit code)
        assertEquals("100", result);
    }

    @Test
    public void testInterpretSimpleArithmetic() throws IOException, InterruptedException {
        String result = NodeJSEvaluator.interpret("2 + 2");
        // 2 + 2 = 4, so exit code is 4
        assertEquals("4", result);
    }

    @Test
    public void testInterpretStringLength() throws IOException, InterruptedException {
        // String length returns a number which becomes the exit code
        String result = NodeJSEvaluator.interpret("'Hello'.length");
        assertEquals("5", result);
    }

    @Test
    public void testCompileValidSource() throws IOException, InterruptedException {
        String source = "2 + 2";
        String compiled = NodeJSEvaluator.compile(source);
        
        // Compiled should return the same source (after validation)
        assertEquals(source, compiled);
    }
}

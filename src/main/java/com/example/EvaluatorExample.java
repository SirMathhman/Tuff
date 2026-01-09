package com.example;

import java.io.IOException;

/**
 * Example usage of the NodeJSEvaluator.interpret() function.
 */
public class EvaluatorExample {

	public static void main(String[] args) {
		try {
			// Example 1: Compile and interpret a simple expression
			String source1 = "2 + 2";
			String compiled1 = NodeJSEvaluator.compile(source1);
			System.out.println("Compiled: " + compiled1);
			String result1 = NodeJSEvaluator.interpret(source1);
			System.out.println("Result: " + result1);

			// Example 2: Direct interpret call
			String result2 = NodeJSEvaluator.interpret("Math.sqrt(16)");
			System.out.println("Math.sqrt(16) = " + result2);

			// Example 3: String concatenation
			String result3 = NodeJSEvaluator.interpret("'Hello' + ' ' + 'World'");
			System.out.println("'Hello' + ' ' + 'World' = " + result3);

		} catch (IOException e) {
			System.err.println("IO Error: " + e.getMessage());
			e.printStackTrace();
		} catch (InterruptedException e) {
			System.err.println("Process interrupted: " + e.getMessage());
			e.printStackTrace();
		}
	}
}

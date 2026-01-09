package com.example;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;

/**
 * A utility class for evaluating JavaScript code using NodeJS.
 */
public class NodeJSEvaluator {

	/**
	 * Compiles JavaScript source code into executable form.
	 * In this context, compiling is a pass-through operation that validates
	 * the source code can be parsed by NodeJS.
	 * 
	 * @param source the JavaScript source code to compile
	 * @return the compiled code (same as input for JavaScript)
	 * @throws IOException          if an I/O error occurs
	 * @throws InterruptedException if the process is interrupted
	 */
	public static String compile(String source) throws IOException, InterruptedException {
		// For JavaScript, compilation is essentially validation/parsing
		// We execute a simple syntax check in NodeJS
		String expr = String.format(
				"new Function('%s'); console.log('compiled');",
				escapeForShell(source));

		executeNodeJS(expr);
		return source; // Return the validated source code
	}

	/**
	 * Interprets JavaScript source code by compiling and evaluating it using
	 * NodeJS. The process will exit with the evaluated result as the exit code.
	 * 
	 * @param source the JavaScript source code to interpret
	 * @return the result of evaluating the compiled code as a string
	 * @throws IOException          if an I/O error occurs while executing NodeJS
	 * @throws InterruptedException if the NodeJS process is interrupted
	 */
	public static String interpret(String source) throws IOException, InterruptedException {
		return interpret(source, null);
	}

	/**
	 * Interprets JavaScript source code by compiling and evaluating it using
	 * NodeJS, with optional stdin input. The process will exit with the evaluated
	 * result as the exit code.
	 * 
	 * @param source the JavaScript source code to interpret
	 * @param stdin  the input to provide to stdin, or null for no input
	 * @return the result of evaluating the compiled code as a string
	 * @throws IOException          if an I/O error occurs while executing NodeJS
	 * @throws InterruptedException if the NodeJS process is interrupted
	 */
	public static String interpret(String source, String stdin) throws IOException, InterruptedException {
		// Compile the source code first
		String compiled = compile(source);

		// Create the NodeJS command to evaluate the compiled code and exit with that
		// code
		String expr = String.format(
				"process.exit(eval('%s'))",
				escapeForShell(compiled));

		return executeNodeJSWithExit(expr, stdin);
	}

	/**
	 * Executes a NodeJS command and returns its output.
	 * 
	 * @param expr the JavaScript expression to execute
	 * @return the output from NodeJS
	 * @throws IOException          if an I/O error occurs
	 * @throws InterruptedException if the process is interrupted
	 */
	private static String executeNodeJS(String expr) throws IOException, InterruptedException {
		ProcessBuilder processBuilder = new ProcessBuilder("node", "-e", expr);
		processBuilder.redirectErrorStream(true);

		Process process = processBuilder.start();

		StringBuilder output = new StringBuilder();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
			String line;
			while ((line = reader.readLine()) != null) {
				output.append(line).append("\n");
			}
		}

		int exitCode = process.waitFor();
		if (exitCode != 0) {
			throw new RuntimeException("NodeJS process exited with code: " + exitCode);
		}

		return output.toString().trim();
	}

	/**
	 * Executes a NodeJS command that may exit with a specific exit code.
	 * Returns the exit code as a string.
	 * 
	 * @param expr the JavaScript expression to execute
	 * @return the exit code as a string
	 * @throws IOException          if an I/O error occurs
	 * @throws InterruptedException if the process is interrupted
	 */
	private static String executeNodeJSWithExit(String expr) throws IOException, InterruptedException {
		return executeNodeJSWithExit(expr, null);
	}

	/**
	 * Executes a NodeJS command that may exit with a specific exit code,
	 * optionally providing stdin input. Returns the exit code as a string.
	 * 
	 * @param expr  the JavaScript expression to execute
	 * @param stdin the input to provide to stdin, or null for no input
	 * @return the exit code as a string
	 * @throws IOException          if an I/O error occurs
	 * @throws InterruptedException if the process is interrupted
	 */
	private static String executeNodeJSWithExit(String expr, String stdin) throws IOException, InterruptedException {
		ProcessBuilder processBuilder = new ProcessBuilder("node", "-e", expr);
		processBuilder.redirectErrorStream(true);

		Process process = processBuilder.start();

		// Write stdin if provided
		if (stdin != null) {
			try (var os = process.getOutputStream()) {
				os.write(stdin.getBytes());
				os.flush();
			}
		}

		StringBuilder output = new StringBuilder();
		try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
			String line;
			while ((line = reader.readLine()) != null) {
				output.append(line).append("\n");
			}
		}

		int exitCode = process.waitFor();
		// Return the exit code as a string, even if non-zero
		return String.valueOf(exitCode);
	}

	/**
	 * Escapes a string for safe use in shell commands.
	 * 
	 * @param str the string to escape
	 * @return the escaped string
	 */
	private static String escapeForShell(String str) {
		return str.replace("\\", "\\\\")
				.replace("'", "\\'")
				.replace("\"", "\\\"")
				.replace("\n", "\\n")
				.replace("\r", "\\r");
	}
}

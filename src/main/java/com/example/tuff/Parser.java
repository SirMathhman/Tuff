package com.example.tuff;

import java.math.BigInteger;

/**
 * Parser utilities that produce ASTNode objects.
 */
public class Parser {

	/**
	 * Stubbed parse method that turns the provided source into an ASTNode.
	 * Current implementation returns a LiteralNode holding the source text.
	 *
	 * @param source the source to parse
	 * @return an ASTNode representing the parsed structure
	 * @throws IllegalArgumentException if source is null
	 */
	public static ASTNode parse(String source) {
		if (source == null) {
			throw new IllegalArgumentException("source cannot be null");
		}

		// Support binary operations (+ and -) by finding first operator
		// (left-associative)
		// An operator must have a space before it to distinguish from type suffixes
		// Process left-to-right for left-associativity: 10 - 5 + 3 = ((10 - 5) + 3) = 8
		ASTNode result = null;
		String remaining = source;
		String currentOp = "+"; // default operator for the first operand

		while (remaining.length() > 0) {
			// Find the next operator
			int operatorPos = -1;
			for (int i = 1; i < remaining.length(); i++) {
				char c = remaining.charAt(i);
				if ((c == '+' || c == '-')) {
					char prev = remaining.charAt(i - 1);
					// It's an operator if previous char is a space
					if (prev == ' ') {
						operatorPos = i;
						break;
					}
				}
			}

			String operand;
			String nextOp = "+";
			if (operatorPos == -1) {
				// No more operators, this is the last operand
				operand = remaining.trim();
				remaining = "";
			} else {
				// Extract operand and next operator
				operand = remaining.substring(0, operatorPos).trim();
				nextOp = String.valueOf(remaining.charAt(operatorPos));
				remaining = remaining.substring(operatorPos + 1).trim();
			}

			// Parse the operand
			ASTNode operandNode = parseOperand(operand);

			// Apply the previous operator to get the running result
			if (result == null) {
				result = operandNode;
			} else {
				result = new BinaryOpNode(result, currentOp, operandNode);
			}

			currentOp = nextOp;
		}

		if (result != null) {
			return result;
		}
		// Support integer suffixes such as U8, U16, U32, U64 and I8, I16, I32, I64
		String lower = source.toLowerCase();
		String[] supported = new String[] { "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64" };
		for (String s : supported) {
			if (lower.endsWith(s)) {
				String prefix = source.substring(0, source.length() - s.length());
				if (prefix.matches("-?\\d+")) {
					// Normalize suffix to upper-case (e.g., "U8")
					return new LiteralNode(prefix, s.toUpperCase());
				}
			}
		}
		return new LiteralNode(source);
	}

	/**
	 * Parse a single operand (no operators). Used internally by parse().
	 *
	 * @param operand the operand to parse
	 * @return an ASTNode for the operand
	 */
	private static ASTNode parseOperand(String operand) {
		// Support integer suffixes such as U8, U16, U32, U64 and I8, I16, I32, I64
		String lower = operand.toLowerCase();
		String[] supported = new String[] { "u8", "u16", "u32", "u64", "i8", "i16", "i32", "i64" };
		for (String s : supported) {
			if (lower.endsWith(s)) {
				String prefix = operand.substring(0, operand.length() - s.length());
				if (prefix.matches("-?\\d+")) {
					// Normalize suffix to upper-case (e.g., "U8")
					return new LiteralNode(prefix, s.toUpperCase());
				}
			}
		}
		return new LiteralNode(operand);
	}

	/**
	 * Helper class for representing numeric ranges by suffix type.
	 */
	private static class Range {
		final BigInteger min;
		final BigInteger max;
		final boolean signed;

		Range(BigInteger min, BigInteger max, boolean signed) {
			this.min = min;
			this.max = max;
			this.signed = signed;
		}
	}

	/**
	 * Returns the valid numeric range for a given integer type suffix.
	 *
	 * @param suffix the type suffix (e.g., "U8", "I32")
	 * @return a Range object with min/max/signed info, or null if suffix is not
	 *         recognized
	 */
	private static Range rangeForSuffix(String suffix) {
		if (suffix == null)
			return null;
		switch (suffix.toUpperCase()) {
			case "U8":
				return new Range(BigInteger.ZERO, BigInteger.valueOf(255L), false);
			case "U16":
				return new Range(BigInteger.ZERO, BigInteger.valueOf(65535L), false);
			case "U32":
				return new Range(BigInteger.ZERO, new BigInteger("4294967295"), false);
			case "U64":
				return new Range(BigInteger.ZERO, new BigInteger("18446744073709551615"), false);
			case "I8":
				return new Range(BigInteger.valueOf(-128L), BigInteger.valueOf(127L), true);
			case "I16":
				return new Range(BigInteger.valueOf(-32768L), BigInteger.valueOf(32767L), true);
			case "I32":
				return new Range(BigInteger.valueOf(-2147483648L), BigInteger.valueOf(2147483647L), true);
			case "I64":
				return new Range(BigInteger.valueOf(Long.MIN_VALUE), BigInteger.valueOf(Long.MAX_VALUE), true);
			default:
				return null;
		}
	}

	/**
	 * Execute the given ASTNode and return a string result.
	 * Current implementation supports LiteralNode by returning its value.
	 *
	 * @param node the ASTNode to execute
	 * @return a string result of executing the node
	 */
	public static String execute(ASTNode node) {
		if (node == null) {
			throw new IllegalArgumentException("node cannot be null");
		}
		if (node instanceof BinaryOpNode) {
			return executeBinaryOp((BinaryOpNode) node);
		}
		if (node instanceof LiteralNode) {
			return executeLiteralNode((LiteralNode) node);
		}
		// Fallback: return toString() for unknown node types
		return node.toString();
	}

	/**
	 * Execute a binary operation node.
	 *
	 * @param bin the binary operation node
	 * @return the result as a string
	 */
	private static String executeBinaryOp(BinaryOpNode bin) {
		if ("+".equals(bin.getOp())) {
			BigInteger left = numericValue(bin.getLeft());
			BigInteger right = numericValue(bin.getRight());
			BigInteger sum = left.add(right);
			String leftSuffix = (bin.getLeft() instanceof LiteralNode) ? ((LiteralNode) bin.getLeft()).getSuffix() : null;
			String rightSuffix = (bin.getRight() instanceof LiteralNode) ? ((LiteralNode) bin.getRight()).getSuffix()
					: null;
			if (leftSuffix != null && leftSuffix.equals(rightSuffix)) {
				validateAdditionResult(sum, leftSuffix);
			}
			return sum.toString();
		} else if ("-".equals(bin.getOp())) {
			BigInteger left = numericValue(bin.getLeft());
			BigInteger right = numericValue(bin.getRight());
			BigInteger diff = left.subtract(right);
			String leftSuffix = (bin.getLeft() instanceof LiteralNode) ? ((LiteralNode) bin.getLeft()).getSuffix() : null;
			String rightSuffix = (bin.getRight() instanceof LiteralNode) ? ((LiteralNode) bin.getRight()).getSuffix()
					: null;
			if (leftSuffix != null && leftSuffix.equals(rightSuffix)) {
				validateAdditionResult(diff, leftSuffix);
			}
			return diff.toString();
		}
		return "";
	}

	/**
	 * Validate that an addition result is within the valid range for its type.
	 *
	 * @param sum    the result of addition
	 * @param suffix the type suffix
	 * @throws ExecuteException if the sum is out of range
	 */
	private static void validateAdditionResult(BigInteger sum, String suffix) {
		Range r = rangeForSuffix(suffix);
		if (r != null) {
			if (sum.compareTo(r.min) < 0 || sum.compareTo(r.max) > 0) {
				throw new ExecuteException(suffix + " overflow: " + sum.toString());
			}
		}
	}

	/**
	 * Execute a literal node.
	 *
	 * @param ln the literal node
	 * @return the value as a string
	 */
	private static String executeLiteralNode(LiteralNode ln) {
		String val = ln.getValue();
		String suffix = ln.getSuffix();
		if (suffix != null) {
			// Check the numeric range for all supported types
			BigInteger bigint = new BigInteger(val);
			Range range = rangeForSuffix(suffix);
			// Unsigned types should reject negative values
			if (!range.signed && bigint.signum() < 0) {
				throw new ExecuteException(suffix + " value cannot be negative: " + val + suffix);
			}
			if (bigint.compareTo(range.min) < 0 || bigint.compareTo(range.max) > 0) {
				throw new ExecuteException(suffix + " value out of range: " + val + suffix);
			}
			return bigint.toString();
		}
		return val;
	}

	private static BigInteger numericValue(ASTNode node) {
		if (node instanceof LiteralNode) {
			LiteralNode ln = (LiteralNode) node;
			String val = ln.getValue();
			if (val.matches("-?\\d+")) {
				return new BigInteger(val);
			}
			throw new ExecuteException("Not a numeric literal: " + val);
		}
		if (node instanceof BinaryOpNode) {
			String out = execute(node);
			if (out.matches("-?\\d+")) {
				return new BigInteger(out);
			}
			throw new ExecuteException("Not a numeric expression: " + out);
		}
		String out = execute(node);
		if (out.matches("-?\\d+")) {
			return new BigInteger(out);
		}
		throw new ExecuteException("Not a numeric result: " + out);
	}

	/**
	 * Interpret the given source: parse it into an ASTNode and execute it.
	 *
	 * @param source source text to interpret
	 * @return the result of executing the parsed ASTNode
	 */
	public static String interpret(String source) {
		// YOU CANNOT MODIFY THIS IMPLEMENTATION

		ASTNode node = parse(source);
		return execute(node);
	}
}

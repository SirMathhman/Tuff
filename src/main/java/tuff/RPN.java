package tuff;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import tuff.ValueType.Value;

/**
 * Evaluates expressions using the Shunting-yard algorithm and Reverse Polish
 * Notation.
 * Handles operator precedence (* before +/-) and grouping with
 * parentheses/braces.
 */
public final class RPN {

	/**
	 * Convert infix tokens to RPN (Reverse Polish Notation) using Shunting-yard
	 * algorithm.
	 * Returns null if the token sequence is invalid (e.g., mismatched parentheses).
	 */
	public static List<String> shuntingYard(List<String> tokens) {
		List<String> output = new ArrayList<>();
		Deque<String> ops = new ArrayDeque<>();
		Map<String, Integer> prec = new HashMap<>();
		prec.put("+", 1);
		prec.put("-", 1);
		prec.put("*", 2);

		for (String tk : tokens) {
			if (isOpenParen(tk)) {
				ops.push(tk);
				continue;
			}
			if (isCloseParen(tk)) {
				if (!processCloseParen(tk, output, ops))
					return null;
				continue;
			}
			if (prec.containsKey(tk)) {
				while (!ops.isEmpty() && prec.containsKey(ops.peek()) && prec.get(ops.peek()) >= prec.get(tk)) {
					output.add(ops.pop());
				}
				ops.push(tk);
				continue;
			}
			// operand
			output.add(tk);
		}
		while (!ops.isEmpty()) {
			String o = ops.pop();
			if (isOpenParen(o) || isCloseParen(o))
				return null;
			output.add(o);
		}
		return output;
	}

	/**
	 * Evaluate RPN tokens and return the numeric result as a string.
	 * Used when only the numeric value is needed (not type information).
	 */
	public static String evaluateRPN(List<String> output, Map<String, Value> ctx) {
		Map<String, Integer> prec = new HashMap<>();
		prec.put("+", 1);
		prec.put("-", 1);
		prec.put("*", 2);
		Deque<Value> stack = new ArrayDeque<>();
		for (String tk : output) {
			if (!prec.containsKey(tk)) { // operand
				stack.push(ValueType.parseOperandAndValidate(tk, ctx));
				continue;
			}
			if (stack.size() < 2)
				return null;
			Value b = stack.pop();
			Value a = stack.pop();
			if (!a.token.equals(b.token))
				throw new IllegalArgumentException("mismatched operand types: " + a.token + " vs " + b.token);
			java.math.BigInteger res;
			switch (tk) {
				case "+":
					res = a.value.add(b.value);
					break;
				case "-":
					res = a.value.subtract(b.value);
					break;
				case "*":
					res = a.value.multiply(b.value);
					break;
				default:
					return null;
			}

			// check range for token
			TokenRange.checkValueInRange(a.token, res);
			stack.push(new Value(res, a.token));
		}

		if (stack.size() != 1)
			return null;
		Value result = stack.pop();
		return result.value.toString();
	}

	/**
	 * Evaluate RPN tokens and return a typed Value object.
	 * Preserves type information through the evaluation chain.
	 */
	public static Value evaluateRPNValue(List<String> output, Map<String, Value> ctx) {
		Map<String, Integer> prec = new HashMap<>();
		prec.put("+", 1);
		prec.put("-", 1);
		prec.put("*", 2);
		Deque<Value> stack = new ArrayDeque<>();
		for (String tk : output) {
			if (!prec.containsKey(tk)) { // operand
				stack.push(ValueType.parseOperandAndValidate(tk, ctx));
				continue;
			}
			if (stack.size() < 2)
				return null;
			Value b = stack.pop();
			Value a = stack.pop();
			if (!a.token.equals(b.token))
				throw new IllegalArgumentException("mismatched operand types: " + a.token + " vs " + b.token);
			java.math.BigInteger res;
			switch (tk) {
				case "+":
					res = a.value.add(b.value);
					break;
				case "-":
					res = a.value.subtract(b.value);
					break;
				case "*":
					res = a.value.multiply(b.value);
					break;
				default:
					return null;
			}

			// check range for token
			TokenRange.checkValueInRange(a.token, res);
			stack.push(new Value(res, a.token));
		}

		if (stack.size() != 1)
			return null;
		return stack.pop();
	}

	private static boolean isOpenParen(String tk) {
		return tk.equals("(") || tk.equals("{");
	}

	private static boolean isCloseParen(String tk) {
		return tk.equals(")") || tk.equals("}");
	}

	private static boolean processCloseParen(String tk, List<String> output, Deque<String> ops) {
		String openParen = tk.equals(")") ? "(" : "{";
		while (!ops.isEmpty() && !ops.peek().equals(openParen))
			output.add(ops.pop());
		if (ops.isEmpty() || !ops.peek().equals(openParen))
			return false; // mismatched paren/brace
		ops.pop();
		return true;
	}
}

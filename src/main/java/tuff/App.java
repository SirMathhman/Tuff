package tuff;

public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	private static java.util.List<String> splitTopLevelStatements(String inside) {
		java.util.List<String> parts = new java.util.ArrayList<>();
		int depth = 0;
		StringBuilder cur = new StringBuilder();
		for (int i = 0; i < inside.length(); i++) {
			char c = inside.charAt(i);
			if (c == '{' || c == '(') {
				depth++;
			} else if (c == '}' || c == ')') {
				depth--;
			}
			if (c == ';' && depth == 0) {
				parts.add(cur.toString().trim());
				cur.setLength(0);
			} else {
				cur.append(c);
			}
		}
		if (cur.length() > 0) {
			parts.add(cur.toString().trim());
		}
		return parts;
	}

	private static String[] parseLetDeclaration(String stmt) {
		if (!stmt.startsWith("let "))
			return null;
		java.util.regex.Pattern lp = java.util.regex.Pattern
				.compile("let\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*([UI]\\d+)\\s*=\\s*(.+)");
		java.util.regex.Matcher lm = lp.matcher(stmt);
		if (!lm.find())
			return null;
		return new String[] { lm.group(1), lm.group(2), lm.group(3).trim() };
	}

	private static Value evaluateFinalExpression(String last, java.util.Map<String, Value> ctx) {
		if (last.matches("^[A-Za-z_][A-Za-z0-9_]*$")) {
			if (!ctx.containsKey(last))
				throw new IllegalArgumentException("unknown identifier: " + last);
			return ctx.get(last);
		}

		String r = evaluateWithParentheses(last, ctx);
		if (r == null)
			throw new IllegalArgumentException("invalid expression in block: " + last);

		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
		java.util.regex.Matcher m = p.matcher(last.trim());
		if (m.find()) {
			String rest = m.group(2).trim();
			String tk = extractToken(rest);
			if (tk.isEmpty())
				throw new IllegalArgumentException("final expression in block missing type: " + last);
			checkValueInRange(tk, new java.math.BigInteger(r));
			return new Value(new java.math.BigInteger(r), tk);
		}

		throw new IllegalArgumentException("unable to determine type of final expression in block: " + last);
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty())
			return "";
		input = input.trim();
		// If expression contains operators or parentheses/braces, try full expression
		// evaluation first
		// If this looks like a top-level statement sequence (let ...; ...), evaluate
		// statements first
		if (input.startsWith("let ") || input.indexOf(';') >= 0) {
			String stm = evaluateStatements(input);
			if (stm != null)
				return stm;
		}
		if (hasExpressionOperators(input)) {
			String full = evaluateBinaryExpression(input);
			if (full != null)
				return full;
		}

		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
		java.util.regex.Matcher m = p.matcher(input);
		if (!m.find())
			return "";
		String digits = m.group(1);
		String rest = m.group(2);

		// evaluate binary expressions like "1U8 + 2U8"
		String binary = evaluateBinaryExpression(input);
		if (binary != null) {
			return binary;
		}
		// support typed integer suffixes e.g. U8, I16, U32, I64. Validate ranges using
		// BigInteger.
		String suffix = rest.trim();
		if (suffix.isEmpty() || suffix.length() < 2)
			return digits.startsWith("+") ? digits.substring(1) : digits;

		String token = extractToken(suffix);
		if (token.isEmpty())
			return normalizeDigits(digits);

		// validate token-specific ranges (may throw)
		validateTokenRange(token, digits);

		return normalizeDigits(digits);
	}

	private static String evaluateStatements(String input) {
		java.util.List<String> parts = splitTopLevelStatements(input);
		if (parts == null || parts.isEmpty())
			return null;
		boolean endsWithSemicolon = input.trim().endsWith(";");
		if (parts.size() == 1)
			return handleSingleStatement(parts.get(0), endsWithSemicolon);
		java.util.Map<String, Value> ctx = new java.util.HashMap<>();
		for (int i = 0; i < parts.size() - 1; i++) {
			String stmt = parts.get(i);
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				return null;
			String name = decl[0];
			String token = decl[1];
			String expr = decl[2];
			String res = evaluateWithParentheses(expr, ctx);
			if (res == null)
				return null;
			checkValueInRange(token, new java.math.BigInteger(res));
			if (ctx.containsKey(name))
				throw new IllegalArgumentException("duplicate declaration: " + name);
			if (ctx.containsKey(name))
				throw new IllegalArgumentException("duplicate declaration: " + name);
			ctx.put(name, new Value(new java.math.BigInteger(res), token));
		}
		// when input ends with a semicolon, treat all parts as declarations
		if (endsWithSemicolon)
			return handleDeclarationsOnly(parts, ctx);

		// final expression
		String last = parts.get(parts.size() - 1).trim();
		Value v;
		if (last.matches("^[A-Za-z_][A-Za-z0-9_]*$")) {
			if (!ctx.containsKey(last))
				throw new IllegalArgumentException("unknown identifier: " + last);
			v = ctx.get(last);
		} else {
			String r = evaluateWithParentheses(last, ctx);
			if (r == null)
				return null;
			java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
			java.util.regex.Matcher m = p.matcher(last.trim());
			if (m.find()) {
				String rest = m.group(2).trim();
				String tk = extractToken(rest);
				if (tk.isEmpty())
					throw new IllegalArgumentException("final expression missing type: " + last);
				checkValueInRange(tk, new java.math.BigInteger(r));
				v = new Value(new java.math.BigInteger(r), tk);
			} else {
				throw new IllegalArgumentException("unable to determine type of final expression: " + last);
			}
		}
		return v.value.toString();
	}

	private static String handleSingleStatement(String stmt, boolean endsWithSemicolon) {
		if (endsWithSemicolon) {
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				return null;
			String res = evaluateWithParentheses(decl[2], java.util.Collections.emptyMap());
			if (res == null)
				return null;
			checkValueInRange(decl[1], new java.math.BigInteger(res));
			return "";
		}
		return evaluateWithParentheses(stmt);
	}

	private static String handleDeclarationsOnly(java.util.List<String> parts, java.util.Map<String, Value> ctx) {
		for (int i = 0; i < parts.size(); i++) {
			String stmt = parts.get(i);
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				return null;
			String res = evaluateWithParentheses(decl[2], ctx);
			if (res == null)
				return null;
			checkValueInRange(decl[1], new java.math.BigInteger(res));
			if (ctx.containsKey(decl[0]))
				throw new IllegalArgumentException("duplicate declaration: " + decl[0]);
			ctx.put(decl[0], new Value(new java.math.BigInteger(res), decl[1]));
		}
		return "";
	}

	private static String extractToken(String suffix) {
		int tokenEnd = 0;
		while (tokenEnd < suffix.length() && Character.isLetterOrDigit(suffix.charAt(tokenEnd))) {
			tokenEnd++;
		}
		return tokenEnd == 0 ? "" : suffix.substring(0, tokenEnd);
	}

	private static String normalizeDigits(String digits) {
		return digits.startsWith("+") ? digits.substring(1) : digits;
	}

	private static void validateTokenRange(String token, String digits) {
		boolean isUnsigned = token.startsWith("U");
		boolean isSigned = token.startsWith("I");

		if (!isUnsigned && !isSigned)
			return; // unknown token type

		String numberForParse = normalizeDigits(digits);
		if (isUnsigned && numberForParse.startsWith("-")) {
			throw new IllegalArgumentException("negative value not allowed for " + token + ": " + digits);
		}

		java.math.BigInteger value;
		try {
			value = new java.math.BigInteger(numberForParse);
		} catch (NumberFormatException ex) {
			throw new IllegalArgumentException("invalid number for " + token + ": " + digits, ex);
		}

		if (token.length() < 2)
			return; // no bits info

		int bits;
		try {
			bits = Integer.parseInt(token.substring(1));
		} catch (NumberFormatException ex) {
			return; // unknown token content
		}

		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}

		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + token + ": " + digits);
		}
	}

	/**
	 * Evaluate simple binary expressions with + operator where both operands have
	 * the same type suffix (e.g. U8)
	 * Returns the normalized numeric result as a string or null if input is not a
	 * binary expression we support.
	 */
	private static boolean hasExpressionOperators(String input) {
		if (input.indexOf('(') >= 0 || input.indexOf(')') >= 0 || input.indexOf('{') >= 0 || input.indexOf('}') >= 0
				|| input.indexOf('+') >= 0 || input.indexOf('*') >= 0)
			return true;
		return java.util.regex.Pattern.compile("\\d\\s*[-]\\s*\\d").matcher(input).find();
	}

	private static String evaluateBinaryExpression(String input) {
		try {
			return evaluateWithParentheses(input);
		} catch (IllegalArgumentException ex) {
			throw ex;
		} catch (Exception ex) {
			return null;
		}
	}

	private static java.util.List<String> tokenize(String input) {
		java.util.List<String> tokens = new java.util.ArrayList<>();
		int i = 0;
		while (i < input.length()) {
			char c = input.charAt(i);
			if (Character.isWhitespace(c)) {
				i++;
				continue;
			}
			if (c == '(' || c == ')') {
				tokens.add(String.valueOf(c));
				i++;
				continue;
			}
			if (c == '{') {
				// extract full block including nested braces as a single token
				int depth = 1;
				int j = i + 1;
				for (; j < input.length(); j++) {
					char cc = input.charAt(j);
					if (cc == '{')
						depth++;
					else if (cc == '}') {
						depth--;
						if (depth == 0)
							break;
					}
				}
				if (j >= input.length())
					return null; // mismatched brace
				String block = input.substring(i, j + 1);
				tokens.add(block);
				i = j + 1;
				continue;
			}
			if (c == '}') {
				return null; // stray closing brace
			}
			if (isStandaloneOperator(input, i)) {
				tokens.add(String.valueOf(c));
				i++;
				continue;
			}
			// operand: either signed/unsigned digits with optional suffix, or an identifier
			java.util.regex.Matcher m = java.util.regex.Pattern.compile("[+-]?\\d+[A-Za-z0-9]*|[A-Za-z_][A-Za-z0-9_]*")
					.matcher(input.substring(i));
			if (!m.lookingAt())
				return null;
			String tok = m.group();
			tokens.add(tok);
			i += tok.length();
		}
		return tokens;
	}

	private static boolean isStandaloneOperator(String input, int i) {
		char c = input.charAt(i);
		if (c == '*')
			return true;
		if ((c == '+' || c == '-') && i + 1 < input.length() && Character.isDigit(input.charAt(i + 1))) {
			return false; // Leading sign, not operator
		}
		return c == '+' || c == '-';
	}

	private static String evaluateWithParentheses(String input) {
		// Tokenize
		java.util.List<String> tokens = tokenize(input);
		if (tokens == null)
			return null;

		// shunting-yard to RPN
		java.util.List<String> output = shuntingYard(tokens);
		if (output == null)
			return null;

		// evaluate RPN
		return evaluateRPN(output, java.util.Collections.emptyMap());
	}

	private static String evaluateWithParentheses(String input, java.util.Map<String, Value> ctx) {
		java.util.List<String> tokens = tokenize(input);
		if (tokens == null)
			return null;
		java.util.List<String> output = shuntingYard(tokens);
		if (output == null)
			return null;
		return evaluateRPN(output, ctx == null ? java.util.Collections.emptyMap() : ctx);
	}

	private static java.util.List<String> shuntingYard(java.util.List<String> tokens) {
		java.util.List<String> output = new java.util.ArrayList<>();
		java.util.Deque<String> ops = new java.util.ArrayDeque<>();
		java.util.Map<String, Integer> prec = new java.util.HashMap<>();
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

	private static boolean isOpenParen(String tk) {
		return tk.equals("(") || tk.equals("{");
	}

	private static boolean isCloseParen(String tk) {
		return tk.equals(")") || tk.equals("}");
	}

	private static boolean processCloseParen(String tk, java.util.List<String> output, java.util.Deque<String> ops) {
		String openParen = tk.equals(")") ? "(" : "{";
		while (!ops.isEmpty() && !ops.peek().equals(openParen))
			output.add(ops.pop());
		if (ops.isEmpty() || !ops.peek().equals(openParen))
			return false; // mismatched paren/brace
		ops.pop();
		return true;
	}

	private static String evaluateRPN(java.util.List<String> output, java.util.Map<String, Value> ctx) {
		java.util.Map<String, Integer> prec = new java.util.HashMap<>();
		prec.put("+", 1);
		prec.put("-", 1);
		prec.put("*", 2);
		java.util.Deque<Value> stack = new java.util.ArrayDeque<>();
		for (String tk : output) {
			if (!prec.containsKey(tk)) { // operand
				stack.push(parseOperandAndValidate(tk, ctx));
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
			checkValueInRange(a.token, res);
			stack.push(new Value(res, a.token));
		}

		if (stack.size() != 1)
			return null;
		Value result = stack.pop();
		return result.value.toString();
	}

	private static final class Value {
		final java.math.BigInteger value;
		final String token;

		Value(java.math.BigInteger value, String token) {
			this.value = value;
			this.token = token;
		}
	}

	private static Value parseOperandAndValidate(String operand, java.util.Map<String, Value> ctx) {
		// block operand
		if (operand != null && operand.startsWith("{")) {
			return evaluateBlock(operand, ctx);
		}

		// identifier (variable reference)
		java.util.regex.Pattern ident = java.util.regex.Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
		if (ident.matcher(operand).matches()) {
			if (ctx != null && ctx.containsKey(operand)) {
				return ctx.get(operand);
			}
			throw new IllegalArgumentException("unknown identifier: " + operand);
		}

		// numeric operand with token
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
		java.util.regex.Matcher m = p.matcher(operand);
		if (!m.find())
			throw new IllegalArgumentException("invalid operand: " + operand);
		String digits = m.group(1);
		String rest = m.group(2).trim();
		String token = extractToken(rest);
		if (token.isEmpty())
			throw new IllegalArgumentException("missing type for operand: " + operand);
		validateTokenRange(token, digits);
		java.math.BigInteger val = new java.math.BigInteger(normalizeDigits(digits));
		return new Value(val, token);
	}

	private static Value evaluateBlock(String block, java.util.Map<String, Value> outerCtx) {
		// strip outer braces
		String inside = block.substring(1, block.length() - 1).trim();
		// split statements on top-level semicolons
		java.util.List<String> parts = splitTopLevelStatements(inside);

		java.util.Map<String, Value> ctx = new java.util.HashMap<>();
		if (outerCtx != null)
			ctx.putAll(outerCtx);

		// declarations are all parts except last, last is final expression
		if (parts.isEmpty())
			throw new IllegalArgumentException("empty block");

		for (int i = 0; i < parts.size() - 1; i++) {
			String stmt = parts.get(i);
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				throw new IllegalArgumentException("invalid let declaration: " + stmt);
			String name = decl[0];
			String token = decl[1];
			String exprStr = decl[2];
			// evaluate exprStr with current ctx
			String res = evaluateWithParentheses(exprStr, ctx);
			if (res == null)
				throw new IllegalArgumentException("invalid expression in let: " + stmt);
			// validate range for declared token
			checkValueInRange(token, new java.math.BigInteger(res));
			if (ctx.containsKey(name))
				throw new IllegalArgumentException("duplicate declaration: " + name);
			ctx.put(name, new Value(new java.math.BigInteger(res), token));
		}

		// final expression
		String last = parts.get(parts.size() - 1);
		if (last.isEmpty())
			throw new IllegalArgumentException("missing final expression in block");

		return evaluateFinalExpression(last, ctx);
	}

	private static void checkValueInRange(String token, java.math.BigInteger value) {
		boolean isUnsigned = token.startsWith("U");
		boolean isSigned = token.startsWith("I");
		if (!isUnsigned && !isSigned)
			return;
		if (token.length() < 2)
			return;
		int bits;
		try {
			bits = Integer.parseInt(token.substring(1));
		} catch (NumberFormatException ex) {
			return;
		}
		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}
		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + token + ": " + value.toString());
		}
	}

	private static class Expression {
		java.util.List<String> operands;
		java.util.List<String> ops;

		Expression(java.util.List<String> operands, java.util.List<String> ops) {
			this.operands = operands;
			this.ops = ops;
		}
	}

	private static Expression parseExpression(String input) {
		java.util.regex.Pattern operandPattern = java.util.regex.Pattern.compile("([+-]?\\d+[A-Za-z0-9]*)");
		java.util.regex.Matcher om = operandPattern.matcher(input);
		java.util.List<String> operands = new java.util.ArrayList<>();
		java.util.List<String> ops = new java.util.ArrayList<>();

		int lastEnd = 0;
		while (om.find()) {
			int start = om.start();
			int end = om.end();
			if (lastEnd != 0) {
				String opText = input.substring(lastEnd, start).trim();
				if (opText.isEmpty() || !(opText.equals("+") || opText.equals("-") || opText.equals("*")))
					return null;
				ops.add(opText);
			} else {
				String leading = input.substring(0, start).trim();
				if (!leading.isEmpty())
					return null; // unexpected text before first operand
			}

			operands.add(om.group(1));
			lastEnd = end;
		}

		if (operands.size() < 2)
			return null;

		return new Expression(operands, ops);
	}

	private static String evaluateExpressionWithTokenValidation(Expression expr) {
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");

		java.util.regex.Matcher m0 = p.matcher(expr.operands.get(0));
		if (!m0.find())
			return null;
		String od0 = m0.group(1);
		String or0 = m0.group(2).trim();

		String commonToken = extractToken(or0);
		if (commonToken.isEmpty())
			return null;

		validateTokenRange(commonToken, od0);
		java.math.BigInteger firstValue = new java.math.BigInteger(normalizeDigits(od0));

		// compute operand values and ensure tokens match
		java.util.List<java.math.BigInteger> values = new java.util.ArrayList<>();
		values.add(firstValue);
		for (int i = 0; i < expr.ops.size(); i++) {
			String operand = expr.operands.get(i + 1);
			java.util.regex.Matcher mm = p.matcher(operand);
			if (!mm.find())
				return null;
			String nd = mm.group(1);
			String nr = mm.group(2).trim();

			String ntoken = extractToken(nr);
			if (ntoken.isEmpty())
				return null;
			if (!commonToken.equals(ntoken)) {
				throw new IllegalArgumentException("mismatched operand types: " + commonToken + " vs " + ntoken);
			}

			validateTokenRange(ntoken, nd);
			java.math.BigInteger nv = new java.math.BigInteger(normalizeDigits(nd));
			values.add(nv);
		}

		// first pass: handle '*' precedence by collapsing multiplications
		java.util.List<java.math.BigInteger> stageValues = new java.util.ArrayList<>();
		java.util.List<String> stageOps = new java.util.ArrayList<>();

		java.math.BigInteger temp = values.get(0);
		for (int i = 0; i < expr.ops.size(); i++) {
			String op = expr.ops.get(i);
			java.math.BigInteger nextVal = values.get(i + 1);
			if (op.equals("*")) {
				temp = temp.multiply(nextVal);
			} else {
				stageValues.add(temp);
				stageOps.add(op);
				temp = nextVal;
			}
		}
		stageValues.add(temp);

		// second pass: apply + and - left-to-right
		java.math.BigInteger acc2 = stageValues.get(0);
		for (int i = 0; i < stageOps.size(); i++) {
			String op = stageOps.get(i);
			java.math.BigInteger v = stageValues.get(i + 1);
			if (op.equals("+"))
				acc2 = acc2.add(v);
			else
				acc2 = acc2.subtract(v);
		}

		java.math.BigInteger acc = acc2;

		// validate final result in range
		boolean isUnsigned = commonToken.startsWith("U");
		int bits;
		try {
			bits = Integer.parseInt(commonToken.substring(1));
		} catch (NumberFormatException ex) {
			return acc.toString();
		}

		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}

		if (acc.compareTo(min) < 0 || acc.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + commonToken + ": " + acc.toString());
		}

		return acc.toString();

	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}

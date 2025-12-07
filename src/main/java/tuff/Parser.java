package tuff;

import java.util.HashMap;
import java.util.Map;

public final class Parser {
	private final String s;
	private final int n;
	private int i = 0;

	private Map<String, Operand> locals = new HashMap<>();
	// track mutability for variables in scope
	private Map<String, Boolean> mutables = new HashMap<>();
	// track declared (typed but not-yet-initialized) variables
	private Map<String, DeclaredType> declaredTypes = new HashMap<>();
	private Map<String, FunctionDef> functions = new HashMap<>();

	// tracks how many loops we're currently inside (supports nested loops)
	private int loopDepth = 0;

	Map<String, Operand> getLocals() {
		return locals;
	}

	Map<String, Boolean> getMutables() {
		return mutables;
	}

	Map<String, DeclaredType> getDeclaredTypes() {
		return declaredTypes;
	}

	Map<String, FunctionDef> getFunctions() {
		return functions;
	}

	void setFunctions(Map<String, FunctionDef> f) {
		this.functions = f;
	}

	private boolean allowReturn = false;

	void setAllowReturn(boolean allowReturn) {
		this.allowReturn = allowReturn;
	}

	public Parser(String s) {
		this.s = s;
		this.n = s.length();
	}

	public boolean startsWithLet() {
		skipWhitespace();
		return i < n && s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)));
	}

	public boolean hasNext() {
		skipWhitespace();
		return i < n;
	}

	public void skipWhitespace() {
		while (i < n && Character.isWhitespace(s.charAt(i)))
			i++;
	}

	public Operand parseExpression() {
		Operand left = parseTerm();
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			char c = s.charAt(i);
			if (c == '+' || c == '-') {
				i++;
				Operand right = parseTerm();
				if (left.isBoolean != null || right.isBoolean != null) {
					throw new IllegalArgumentException("arithmetic operators require numeric operands");
				}
				java.math.BigInteger value = (c == '+') ? left.value.add(right.value) : left.value.subtract(right.value);
				String[] kind = App.combineKinds(left, right);
				left = new Operand(value, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	// equality level (==, !=) - binds looser than additive but tighter than
	// logical-and
	Operand parseEquality() {
		Operand left = parseExpression();
		while (true) {
			skipWhitespace();
			String op = readEqualityOperator();
			if (op == null)
				break;
			Operand right = parseExpression();
			left = computeEqualityOp(left, right, op);
		}
		return left;
	}

	private String readEqualityOperator() {
		skipWhitespace();
		if (i + 1 < n) {
			String two = s.substring(i, i + 2);
			if ("==".equals(two) || "!=".equals(two) || "<=".equals(two) || ">=".equals(two)) {
				i += 2;
				return two;
			}
		}
		if (i < n) {
			char c = s.charAt(i);
			if (c == '<' || c == '>') {
				i++;
				return String.valueOf(c);
			}
		}
		return null;
	}

	private Operand computeEqualityOp(Operand left, Operand right, String op) {
		if ("==".equals(op) || "!=".equals(op)) {
			return computeEqualityEqOp(left, right, op);
		}
		return computeRelationalOp(left, right, op);
	}

	private Operand computeEqualityEqOp(Operand left, Operand right, String op) {
		if ((left.isBoolean != null && right.isBoolean == null) || (left.isBoolean == null && right.isBoolean != null)) {
			throw new IllegalArgumentException("equality requires operands of same kind");
		}
		boolean eq = left.value.equals(right.value);
		boolean result = "==".equals(op) ? eq : !eq;
		return new Operand(result ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}

	private Operand computeRelationalOp(Operand left, Operand right, String op) {
		if (left.isBoolean != null || right.isBoolean != null) {
			throw new IllegalArgumentException("relational operators require numeric operands");
		}
		int cmp = left.value.compareTo(right.value);
		boolean res;
		switch (op) {
			case "<":
				res = cmp < 0;
				break;
			case "<=":
				res = cmp <= 0;
				break;
			case ">":
				res = cmp > 0;
				break;
			case ">=":
				res = cmp >= 0;
				break;
			default:
				throw new IllegalArgumentException("unknown operator " + op);
		}
		return new Operand(res ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}

	// logical-and level (&&) - binds looser than equality
	public Operand parseLogicalAnd() {
		Operand left = parseEquality();
		while (true) {
			skipWhitespace();
			if (i + 1 < n && s.charAt(i) == '&' && s.charAt(i + 1) == '&') {
				i += 2;
				Operand right = parseEquality();
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv && rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	// logical-or level (||)
	public Operand parseLogicalOr() {
		Operand left = parseLogicalAnd();
		while (true) {
			skipWhitespace();
			if (i + 1 < n && s.charAt(i) == '|' && s.charAt(i + 1) == '|') {
				i += 2;
				Operand right = parseLogicalAnd();
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv || rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	public Operand parseTerm() {
		Operand left = parseFactor();
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			char c = s.charAt(i);
			if (c == '*' || c == '/' || c == '%') {
				i++;
				Operand right = parseFactor();
				if (left.isBoolean != null || right.isBoolean != null) {
					throw new IllegalArgumentException("arithmetic operators require numeric operands");
				}
				java.math.BigInteger computed = App.computeBinaryOp(left.value, right.value, String.valueOf(c));
				String[] kind = App.combineKinds(left, right);
				left = new Operand(computed, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	public Operand parseFactor() {
		skipWhitespace();
		// support if-expression: if (cond) expr else expr
		if (i + 1 < n && s.startsWith("if", i) && (i + 2 == n || !Character.isJavaIdentifierPart(s.charAt(i + 2)))) {
			return parseIfExpression();
		}

		// support match-expression: match <expr> { case <pat> => <expr>; ... }
		if (i + 4 < n && s.startsWith("match", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			return parseMatchExpression();
		}

		Operand paren = parseParenthesized();
		if (paren != null)
			return paren;

		Operand block = parseBlockStart();
		if (block != null)
			return block;

		Operand boolLit = parseBooleanLiteral();
		if (boolLit != null)
			return boolLit;

		Operand num = parseNumberToken();
		if (num != null)
			return num;

		Operand fncall = parseFunctionCallIfPresent();
		if (fncall != null)
			return fncall;
		Operand id = parseIdentifierLookup();
		if (id != null)
			return id;

		throw new IllegalArgumentException("invalid token at position " + i);
	}

	Operand parseBooleanLiteral() {
		skipWhitespace();
		if (s.startsWith("true", i) && (i + 4 == n || !Character.isJavaIdentifierPart(s.charAt(i + 4)))) {
			i += 4;
			return new Operand(java.math.BigInteger.ONE, true);
		}
		if (s.startsWith("false", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			i += 5;
			return new Operand(java.math.BigInteger.ZERO, true);
		}
		return null;
	}

	Operand parseNumberToken() {
		skipWhitespace();
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?")
				.matcher(s.substring(i));
		if (!m.find())
			return null;
		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);
		int len = m.group(0).length();
		i += len;
		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}
		if (width != null) {
			App.validateRange(number, unsignedOrSigned, width);
			return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
		}
		return new Operand(new java.math.BigInteger(number), null, null);
	}

	private Operand parseIdentifierLookup() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		i += name.length();
		if (!locals.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		return locals.get(name);
	}

	private Operand parseAssignmentIfPresent() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = i;
		i += name.length();
		skipWhitespace();
		if (i < n) {
			// simple assignment '='
			if (s.charAt(i) == '=') {
				i++; // consume '='
				Operand val = parseLogicalOr();
				new AssignmentUtils(locals, mutables, declaredTypes).assign(name, val);
				return locals.get(name);
			}
			// compound assignment like '+=', '-=', '*=', '/=', '%='
			if (i + 1 < n) {
				char op = s.charAt(i);
				char next = s.charAt(i + 1);
				if ((op == '+' || op == '-' || op == '*' || op == '/' || op == '%') && next == '=') {
					i += 2; // consume operator and '='
					Operand val = parseLogicalOr();
					new AssignmentUtils(locals, mutables, declaredTypes).assignCompound(name, op, val);
					return locals.get(name);
				}
			}
		}
		i = start;
		return null;
	}

	private Operand parseFunctionCallIfPresent() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = i;
		i += name.length();
		skipWhitespace();
		if (i >= n || s.charAt(i) != '(') {
			i = start;
			return null;
		}
		i++; // consume '('
		java.util.List<Operand> args = new java.util.ArrayList<>();
		skipWhitespace();
		if (i < n && s.charAt(i) != ')') {
			while (true) {
				Operand arg = parseLogicalOr();
				args.add(arg);
				skipWhitespace();
				if (i < n && s.charAt(i) == ',') {
					i++; // consume comma
					skipWhitespace();
					continue;
				}
				break;
			}
		}
		skipWhitespace();
		if (i >= n || s.charAt(i) != ')')
			throw new IllegalArgumentException("missing ')' in function call");
		i++; // consume ')'

		// resolve function
		FunctionDef fd = functions.get(name);
		if (fd == null) {
			// not a function, restore and treat as identifier
			i = start;
			return null;
		}

		return callFunction(fd, args);
	}

	private Operand callFunction(FunctionDef fd, java.util.List<Operand> args) {
		if (args.size() != fd.paramNames.size())
			throw new IllegalArgumentException("argument count mismatch in function call");

		// prepare params locals
		java.util.Map<String, Operand> fLocals = new java.util.HashMap<>();
		for (int idx = 0; idx < args.size(); idx++) {
			Operand a = args.get(idx);
			DeclaredType pdt = fd.paramTypes.get(idx);
			if (pdt != null && pdt.isBool) {
				if (a.isBoolean == null)
					throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
				fLocals.put(fd.paramNames.get(idx), new Operand(a.value, true));
			} else if (pdt != null && pdt.unsignedOrSigned != null && pdt.width != null) {
				if (a.isBoolean != null)
					throw new IllegalArgumentException("typed numeric assignment requires numeric operand");
				App.validateRange(a.value.toString(), pdt.unsignedOrSigned, pdt.width);
				fLocals.put(fd.paramNames.get(idx), new Operand(a.value, pdt.unsignedOrSigned, pdt.width));
			} else {
				fLocals.put(fd.paramNames.get(idx), a);
			}
		}

		Parser p2 = new Parser(fd.bodySource);
		// provide access to functions for recursion
		p2.setFunctions(new java.util.HashMap<>(this.functions));
		p2.setLocals(new java.util.HashMap<>(fLocals));
		p2.setMutables(new java.util.HashMap<>());
		p2.setDeclaredTypes(new java.util.HashMap<>());
		p2.setAllowReturn(true);

		try {
			Operand res = p2.parseTopLevelBlock();
			if (res == null) {
				res = new Operand(java.math.BigInteger.ZERO, null, null);
			}
			// validate return type if present (no explicit 'return' used)
			if (fd.returnType != null) {
				if (fd.returnType.isBool) {
					if (res.isBoolean == null)
						throw new IllegalArgumentException("typed Bool return requires boolean operand");
				} else if (fd.returnType.unsignedOrSigned != null && fd.returnType.width != null) {
					if (res.isBoolean != null)
						throw new IllegalArgumentException("typed numeric return requires numeric operand");
					App.validateRange(res.value.toString(), fd.returnType.unsignedOrSigned, fd.returnType.width);
					return new Operand(res.value, fd.returnType.unsignedOrSigned, fd.returnType.width);
				}
			}
			return res;
		} catch (ReturnException re) {
			Operand r = re.value;
			// validate return type if present
			if (fd.returnType != null) {
				if (fd.returnType.isBool) {
					if (r.isBoolean == null)
						throw new IllegalArgumentException("typed Bool return requires boolean operand");
				} else if (fd.returnType.unsignedOrSigned != null && fd.returnType.width != null) {
					if (r.isBoolean != null)
						throw new IllegalArgumentException("typed numeric return requires numeric operand");
					App.validateRange(r.value.toString(), fd.returnType.unsignedOrSigned, fd.returnType.width);
					return new Operand(r.value, fd.returnType.unsignedOrSigned, fd.returnType.width);
				}
			}
			return r;
		}
	}

	private Operand parseParenthesized() {
		if (i < n && s.charAt(i) == '(') {
			i++; // consume '('
			Operand inner = parseExpression();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ')')
				throw new IllegalArgumentException("mismatched parentheses");
			i++; // consume ')'
			return inner;
		}
		return null;
	}

	Operand parseStatement() {
		skipWhitespace();
		if (s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)))) {
			return parseLetStatement();
		}
		if (s.startsWith("fn", i) && (i + 2 == n || !Character.isJavaIdentifierPart(s.charAt(i + 2)))) {
			new FunctionDefinitionParser(this).parseFunctionDefinition();
			return null;
		}
		if (s.startsWith("while", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			new WhileStatementParser(this).parseWhileStatement();
			return null;
		}
		if (s.startsWith("return", i) && (i + 6 == n || !Character.isJavaIdentifierPart(s.charAt(i + 6)))) {
			if (!allowReturn)
				throw new IllegalArgumentException("return outside function");
			consumeKeyword("return");
			skipWhitespace();
			Operand ret = parseLogicalOr();
			throw new ReturnException(ret);
		}
		if (s.startsWith("break", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			if (loopDepth == 0)
				throw new IllegalArgumentException("break outside of loop");
			consumeKeyword("break");
			// signal a loop break to the loop executor
			throw new BreakException();
		}
		int save = i;
		Operand assign = parseAssignmentIfPresent();
		if (assign != null)
			return assign;
		i = save;
		return parseLogicalOr();
	}

	private Operand parseBlockStart() {
		if (i < n && s.charAt(i) == '{') {
			return new BlockParser(this).parseBlock();
		}
		return null;
	}

	private Operand parseIfExpression() {
		IfExpressionParser iep = new IfExpressionParser(this);
		return iep.parseIfExpression();
	}

	private Operand parseMatchExpression() {
		MatchExpressionParser mep = new MatchExpressionParser(this);
		return mep.parseMatchExpression();
	}

	// while / block iteration and related helpers extracted to helper classes

	// package-private accessors used by helper parsers
	int getIndex() {
		return i;
	}

	void setIndex(int idx) {
		i = idx;
	}

	void setLocals(Map<String, Operand> m) {
		locals = m;
	}

	void setMutables(Map<String, Boolean> m) {
		mutables = m;
	}

	void setDeclaredTypes(Map<String, DeclaredType> m) {
		declaredTypes = m;
	}

	void incLoopDepth() {
		loopDepth++;
	}

	void decLoopDepth() {
		loopDepth--;
	}

	int getLoopDepth() {
		return loopDepth;
	}

	char charAt(int pos) {
		if (pos >= n)
			return '\u0000';
		return s.charAt(pos);
	}

	private Operand parseLetStatement() {
		LetStatementParser lsp = new LetStatementParser(this);
		return lsp.parseLetStatement();
	}

	// parse a top-level sequence of statements (let and expressions) ending at EOF
	public Operand parseTopLevelBlock() {
		Map<String, Operand> prev = locals;
		Map<String, Boolean> prevMut = mutables;
		Map<String, DeclaredType> prevDeclared = declaredTypes;
		Map<String, FunctionDef> prevFuncs = functions;
		locals = new HashMap<>(prev);
		mutables = new HashMap<>(prevMut);
		declaredTypes = new HashMap<>(prevDeclared);
		functions = new HashMap<>(prevFuncs);
		Operand last = null;
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			last = parseStatement();
			skipWhitespace();
			if (i < n && s.charAt(i) == ';') {
				i++; // consume ';' and continue
				continue;
			}
			// if not semicolon, loop will either consume more or end
		}
		locals = prev;
		mutables = prevMut;
		functions = prevFuncs;
		return last == null ? null : last;
	}

	// Helper methods for IfExpressionParser and MatchExpressionParser
	void consumeIf() {
		i += 2; // consume 'if'
	}

	void consumeMatch() {
		i += 5; // consume 'match'
	}

	void consumeChar() {
		i++;
	}

	void consumeKeyword(String keyword) {
		i += keyword.length();
	}

	void consumeArrow() {
		i += 2; // consume '=>'
	}

	char peekChar() {
		if (i >= n)
			return '\u0000'; // null character
		return s.charAt(i);
	}

	boolean startsWithKeyword(String keyword) {
		return s.startsWith(keyword, i)
				&& (i + keyword.length() == n || !Character.isJavaIdentifierPart(s.charAt(i + keyword.length())));
	}

	boolean startsWithArrow() {
		return i + 1 < n && s.charAt(i) == '=' && s.charAt(i + 1) == '>';
	}

	String remainingInput() {
		return s.substring(i);
	}

}

package tuff;

import java.util.HashMap;
import java.util.Map;

public final class Parser {
	private final String s;
	// support struct construction: Name { ... }
	private int i = 0;
	private final int n;

	private Map<String, Operand> locals = new HashMap<>();
	// track mutability for variables in scope
	private Map<String, Boolean> mutables = new HashMap<>();
	// track declared (typed but not-yet-initialized) variables
	private Map<String, DeclaredType> declaredTypes = new HashMap<>();
	private Map<String, FunctionDef> functions = new HashMap<>();
	// type aliases (e.g., type MyInt = I32)
	private Map<String, DeclaredType> typeAliases = new HashMap<>();

	// tracks how many loops we're currently inside (supports nested loops)
	private int loopDepth = 0;

	Map<String, Operand> getLocals() {
		return locals;
	}

	private Operand parseLeadingKeywords() {
		return ParsingHelpers.parseLeadingKeywords(this);
	}

	private void parseReturnStatement() {
		ParsingHelpers.parseReturnStatement(this);
	}

	private void parseBreakStatement() {
		ParsingHelpers.parseBreakStatement(this);
	}

	private java.util.Map<String, Operand> bindFunctionParameters(FunctionDef fd, java.util.List<Operand> args,
			java.util.Map<String, DeclaredType> typeBindings) {
		return ParsingHelpers.bindFunctionParameters(fd, args, typeBindings);
	}

	private Operand enforceDeclaredReturn(FunctionDef fd, Operand op, java.util.Map<String, DeclaredType> typeBindings) {
		return ParsingHelpers.enforceDeclaredReturn(fd, op, typeBindings);
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

	Map<String, DeclaredType> getTypeAliases() {
		return typeAliases;
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
		return ExpressionParser.parseExpression(this);
	}

	// equality level (==, !=) - binds looser than additive but tighter than
	// logical-and
	Operand parseEquality() {
		return ExpressionParser.parseEquality(this);
	}

	// logical-and level (&&) - binds looser than equality
	public Operand parseLogicalAnd() {
		return ExpressionParser.parseLogicalAnd(this);
	}

	// logical-or level (||)
	public Operand parseLogicalOr() {
		return ExpressionParser.parseLogicalOr(this);
	}

	public Operand parseTerm() {
		return ExpressionParser.parseTerm(this);
	}

	public Operand parseFactor() {
		return FactorParser.parse(this);
	}

	Operand parseBooleanLiteral() {
		return LiteralParser.parseBooleanLiteral(this);
	}

	Operand parseNumberToken() {
		return LiteralParser.parseNumberToken(this);
	}

	Operand parseArrayLiteral() {
		return LiteralParser.parseArrayLiteral(this);
	}

	Operand parseIdentifierLookup() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		i += name.length();
		// support struct construction: Name { ... }
		skipWhitespace();
		if (i < n && s.charAt(i) == '{') {
			// construct struct literal using positional values matching type definition
			i++; // consume '{'
			java.util.List<Operand> vals = new java.util.ArrayList<>();
			skipWhitespace();
			if (i < n && s.charAt(i) != '}') {
				while (true) {
					Operand v = parseLogicalOr();
					vals.add(v);
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
			if (i >= n || s.charAt(i) != '}')
				throw new IllegalArgumentException("missing '}' in struct literal");
			i++; // consume '}'
			// resolve the struct type to map values to field names
			java.util.Map<String, DeclaredType> aliases = getTypeAliases();
			if (!aliases.containsKey(name))
				throw new IllegalArgumentException("unknown struct type: " + name);
			DeclaredType td = aliases.get(name);
			if (!td.isStruct)
				throw new IllegalArgumentException(name + " is not a struct type");
			if (vals.size() != td.structFields.size())
				throw new IllegalArgumentException("struct literal field count mismatch for " + name);
			java.util.Map<String, Operand> fmap = new java.util.LinkedHashMap<>();
			int j = 0;
			for (String fname : td.structFields.keySet()) {
				fmap.put(fname, vals.get(j++));
			}
			return new Operand(fmap);
		}

		// support member access: name.field
		skipWhitespace();
		if (i < n && s.charAt(i) == '.') {
			i++; // consume '.'
			skipWhitespace();
			java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
			if (!fm.find())
				throw new IllegalArgumentException("invalid field name in member access");
			String fname = fm.group();
			i += fname.length();
			if (!locals.containsKey(name))
				throw new IllegalArgumentException("undefined variable: " + name);
			Operand so = locals.get(name);
			if (so.structFields == null)
				throw new IllegalArgumentException("attempted member access on non-struct: " + name);
			if (!so.structFields.containsKey(fname))
				throw new IllegalArgumentException("unknown field: " + fname);
			return so.structFields.get(fname);
		}

		// support indexing: name[index]
		skipWhitespace();
		if (i < n && s.charAt(i) == '[') {
			// consume '['
			i++;
			Operand idxOp = parseLogicalOr();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ']')
				throw new IllegalArgumentException("missing ']' in index expression");
			i++; // consume ']'
			if (!locals.containsKey(name))
				throw new IllegalArgumentException("undefined variable: " + name);
			Operand arrOp = locals.get(name);
			if (arrOp.elements == null)
				throw new IllegalArgumentException("attempted indexing on non-array: " + name);
			if (idxOp.isBoolean != null)
				throw new IllegalArgumentException("index must be numeric");
			int idx = idxOp.value.intValue();
			if (idx < 0 || idx >= arrOp.elements.size())
				throw new IllegalArgumentException("index out of bounds");
			return arrOp.elements.get(idx);
		}
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
			// support member assignment like name.field = value
			Operand memberAssign = parseMemberAssignmentIfPresent(name, start);
			if (memberAssign != null) {
				return memberAssign;
			}
			// support indexed assignment like name[index] = value
			Operand indexed = parseIndexedAssignmentIfPresent(name, start);
			if (indexed != null) {
				return indexed;
			}
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

	private Operand parseIndexedAssignmentIfPresent(String name, int start) {
		skipWhitespace();
		if (i < n && s.charAt(i) == '[') {
			i++; // consume '['
			Operand idxOp = parseLogicalOr();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ']')
				throw new IllegalArgumentException("missing ']' in index assignment");
			i++; // consume ']'
			skipWhitespace();
			if (i < n && s.charAt(i) == '=') {
				i++; // consume '='
				Operand val = parseLogicalOr();
				if (idxOp.isBoolean != null)
					throw new IllegalArgumentException("index must be numeric");
				int idx = idxOp.value.intValue();
				new AssignmentUtils(locals, mutables, declaredTypes).assignIndexed(name, idx, val);
				Operand arr = locals.get(name);
				return arr.elements.get(idx);
			}
			// not an assignment
			// reset parser position to start so outer caller can continue
			i = start;
			return null;
		}

		return null;
	}

	private Operand parseMemberAssignmentIfPresent(String name, int start) {
		skipWhitespace();
		if (i < n && s.charAt(i) == '.') {
			i++; // consume '.'
			skipWhitespace();
			java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
			if (!fm.find()) {
				i = start;
				return null;
			}
			String fname = fm.group();
			i += fname.length();
			skipWhitespace();
			if (i < n && s.charAt(i) == '=') {
				i++; // consume '='
				Operand val = parseLogicalOr();
				new AssignmentUtils(locals, mutables, declaredTypes).assignField(name, fname, val);
				Operand obj = locals.get(name);
				return obj.structFields.get(fname);
			}
			i = start;
			return null;
		}
		return null;
	}

	Operand parseFunctionCallIfPresent() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = i;
		i += name.length();
		// optional explicit type arguments like fnName<T1, T2>(...)
		java.util.List<DeclaredType> typeArgs = new java.util.ArrayList<>();
		// only treat '<' as type-arg start when it's immediately after the name
		if (i < n && s.charAt(i) == '<') {
			i++; // consume '<'
			skipWhitespace();
			if (i < n && s.charAt(i) != '>') {
				for (;;) {
					// parse a single declared type (simple forms only: I32, U8, Bool, or an
					// identifier)
					String rem = s.substring(i);
					java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
					java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
					java.util.regex.Matcher idm2 = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
					DeclaredType dt = new DeclaredType();
					if (tm.find()) {
						String t = tm.group();
						dt.unsignedOrSigned = t.substring(0, 1);
						dt.width = t.substring(1);
						i += t.length();
					} else if (bm.find()) {
						dt.isBool = true;
						i += 4; // 'Bool'
					} else if (idm2.find()) {
						String t = idm2.group();
						dt.typeVarName = t;
						i += t.length();
					} else {
						throw new IllegalArgumentException("invalid type argument in call");
					}
					typeArgs.add(dt);
					skipWhitespace();
					if (i < n && s.charAt(i) == ',') {
						i++; // consume comma
						skipWhitespace();
						continue;
					}
					break;
				}
			}
			if (i >= n || s.charAt(i) != '>')
				throw new IllegalArgumentException("missing '>' in type arguments");
			i++; // consume '>'
			// after type args allow whitespace before '('
			skipWhitespace();
		}

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

		return callFunction(name, fd, args, typeArgs);
	}

	private Operand callFunction(String fname, FunctionDef fd, java.util.List<Operand> args,
			java.util.List<DeclaredType> typeArgs) {
		if (args.size() != fd.signature.paramNames.size())
			throw new IllegalArgumentException("argument count mismatch in function call");

		// build type variable bindings if explicit type args were provided
		java.util.Map<String, DeclaredType> typeBindings = null;
		if (fd.typeParams != null && !fd.typeParams.isEmpty()) {
			if (typeArgs != null && !typeArgs.isEmpty()) {
				if (typeArgs.size() != fd.typeParams.size())
					throw new IllegalArgumentException("generic type argument count mismatch in call");
				typeBindings = new java.util.HashMap<>();
				for (int j = 0; j < fd.typeParams.size(); j++) {
					typeBindings.put(fd.typeParams.get(j), typeArgs.get(j));
				}
			}
		}

		java.util.Map<String, Operand> fLocals = bindFunctionParameters(fd, args, typeBindings);

		// handle extern functions (no body) — provide builtins
		if (fd.body == null || fd.body.bodySource == null || fd.body.bodySource.isEmpty()) {
			// built-in: createArray<T>(length : USize) -> array with capacity 'length' and
			// element type from typeBindings
			if ("createArray".equals(fname)) {
				if (args.size() != 1)
					throw new IllegalArgumentException("argument count mismatch in extern call");
				Operand lenOp = args.get(0);
				if (lenOp.isBoolean != null)
					throw new IllegalArgumentException("length must be numeric");
				int cap = lenOp.value.intValue();
				if (cap < 0)
					throw new IllegalArgumentException("invalid array capacity");
				if (fd.typeParams == null || fd.typeParams.isEmpty())
					throw new IllegalArgumentException("missing type parameter for createArray");
				String tp = fd.typeParams.get(0);
				if (typeBindings == null || !typeBindings.containsKey(tp))
					throw new IllegalArgumentException("missing concrete type argument for createArray");
				DeclaredType et = typeBindings.get(tp);
				java.util.List<Operand> elems = new java.util.ArrayList<>();
				DeclaredType runtimeDt = new DeclaredType();
				runtimeDt.isArray = true;
				runtimeDt.arrayCapacity = cap;
				if (et != null) {
					runtimeDt.elemIsBool = et.isBool;
					runtimeDt.elemUnsignedOrSigned = et.unsignedOrSigned;
					runtimeDt.elemWidth = et.width;
				}
				return new Operand(elems, runtimeDt);
			}
			throw new IllegalArgumentException("unknown extern function: " + fname);
		}

		Parser p2 = new Parser(fd.body.bodySource);
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
			return enforceDeclaredReturn(fd, res, typeBindings);
		} catch (ReturnException re) {
			Operand r = re.value;
			return enforceDeclaredReturn(fd, r, typeBindings);
		}
	}

	Operand parseParenthesized() {
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
		int beforeKeyword = i;
		Operand leading = parseLeadingKeywords();
		if (i != beforeKeyword)
			return leading;
		if (s.startsWith("return", i) && (i + 6 == n || !Character.isJavaIdentifierPart(s.charAt(i + 6)))) {
			parseReturnStatement();
		}

		if (s.startsWith("break", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			parseBreakStatement();
		}
		int save = i;
		Operand assign = parseAssignmentIfPresent();
		if (assign != null)
			return assign;
		i = save;
		return parseLogicalOr();
	}

	Operand parseBlockStart() {
		if (i < n && s.charAt(i) == '{') {
			return new BlockParser(this).parseBlock();
		}
		return null;
	}

	Operand parseIfExpression() {
		IfExpressionParser iep = new IfExpressionParser(this);
		return iep.parseIfExpression();
	}

	Operand parseMatchExpression() {
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

	int getLength() {
		return n;
	}

	String getSubstring(int start, int end) {
		return s.substring(start, end);
	}

	boolean isAllowReturn() {
		return allowReturn;
	}

	Operand parseLetStatementDirect() {
		LetStatementParser lsp = new LetStatementParser(this);
		return lsp.parseLetStatement();
	}

}

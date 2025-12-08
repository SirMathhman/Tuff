package tuff;

final class FunctionCallParser {
	private FunctionCallParser() {
	}

	static Operand parseFunctionCallIfPresent(Parser parser) {
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
				.matcher(parser.remainingInput());
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = parser.getIndex();
		parser.setIndex(start + name.length());

		java.util.List<DeclaredType> typeArgs;
		try {
			typeArgs = parseTypeArgs(parser);
		} catch (IllegalArgumentException e) {
			// If parsing type args fails but it looked like a call, we should probably
			// propagate
			// But here we are just checking if it IS a call.
			// If it started with '<' but failed later, it's an error.
			throw e;
		}

		java.util.List<Operand> args = parseCallArgs(parser);
		if (args == null) {
			parser.setIndex(start);
			return null;
		}

		FunctionDef fd = parser.getFunctions().get(name);
		if (fd == null) {
			parser.setIndex(start);
			return null;
		}

		FunctionCallContext ctx = new FunctionCallContext(name, fd);
		ctx.args = args;
		ctx.typeArgs = typeArgs;
		return callFunction(parser, ctx);
	}

	private static java.util.List<DeclaredType> parseTypeArgs(Parser parser) {
		int n = parser.getLength();
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == '<') {
			parser.consumeChar();
			parser.skipWhitespace();
			java.util.List<DeclaredType> typeArgs = new java.util.ArrayList<>();
			if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != '>') {
				while (true) {
					typeArgs.add(parseSingleTypeArg(parser));
					parser.skipWhitespace();
					if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == ',') {
						parser.consumeChar();
						parser.skipWhitespace();
						continue;
					}
					break;
				}
			}
			if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != '>')
				throw new IllegalArgumentException("missing '>' in type arguments");
			parser.consumeChar();
			parser.skipWhitespace();
			return typeArgs;
		}
		return new java.util.ArrayList<>();
	}

	private static DeclaredType parseSingleTypeArg(Parser parser) {
		String rem = parser.remainingInput();
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)")
				.matcher(rem);
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
		java.util.regex.Matcher idm2 = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
		DeclaredType dt = new DeclaredType();
		if (tm.find()) {
			String t = tm.group();
			dt.unsignedOrSigned = t.substring(0, 1);
			dt.width = t.substring(1);
			parser.setIndex(parser.getIndex() + t.length());
		} else if (bm.find()) {
			dt.isBool = true;
			parser.setIndex(parser.getIndex() + 4);
		} else if (idm2.find()) {
			String t = idm2.group();
			dt.typeVarName = t;
			parser.setIndex(parser.getIndex() + t.length());
		} else {
			throw new IllegalArgumentException("invalid type argument in call");
		}
		return dt;
	}

	private static java.util.List<Operand> parseCallArgs(Parser parser) {
		int n = parser.getLength();
		if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != '(') {
			return null;
		}
		parser.consumeChar();
		java.util.List<Operand> args = new java.util.ArrayList<>();
		parser.skipWhitespace();
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != ')') {
			while (true) {
				args.add(parser.parseLogicalOr());
				parser.skipWhitespace();
				if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == ',') {
					parser.consumeChar();
					parser.skipWhitespace();
					continue;
				}
				break;
			}
		}
		parser.skipWhitespace();
		if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != ')')
			throw new IllegalArgumentException("missing ')' in function call");
		parser.consumeChar();
		return args;
	}

	static class FunctionCallContext {
		String fname;
		FunctionDef fd;
		java.util.List<Operand> args;
		java.util.List<DeclaredType> typeArgs;

		FunctionCallContext(String fname, FunctionDef fd) {
			this.fname = fname;
			this.fd = fd;
		}
	}

	static class FunctionExecutionContext {
		FunctionCallContext callCtx;
		java.util.Map<String, Operand> fLocals;
		java.util.Map<String, DeclaredType> typeBindings;

		FunctionExecutionContext(FunctionCallContext callCtx, java.util.Map<String, Operand> fLocals,
				java.util.Map<String, DeclaredType> typeBindings) {
			this.callCtx = callCtx;
			this.fLocals = fLocals;
			this.typeBindings = typeBindings;
		}
	}

	static Operand callFunction(Parser parser, FunctionCallContext ctx) {
		if (ctx.args.size() != ctx.fd.signature.paramNames.size())
			throw new IllegalArgumentException("argument count mismatch in function call");

		java.util.Map<String, DeclaredType> typeBindings = resolveTypeBindings(ctx);
		java.util.Map<String, Operand> fLocals = parser.bindFunctionParameters(ctx.fd, ctx.args, typeBindings);

		if (ctx.fd.body == null || ctx.fd.body.bodySource == null || ctx.fd.body.bodySource.isEmpty()) {
			return handleExternCall(ctx, typeBindings);
		}

		FunctionExecutionContext execCtx = new FunctionExecutionContext(ctx, fLocals, typeBindings);
		return executeUserFunction(parser, execCtx);
	}

	private static java.util.Map<String, DeclaredType> resolveTypeBindings(FunctionCallContext ctx) {
		java.util.Map<String, DeclaredType> typeBindings = null;
		if (ctx.fd.typeParams != null && !ctx.fd.typeParams.isEmpty()) {
			if (ctx.typeArgs != null && !ctx.typeArgs.isEmpty()) {
				if (ctx.typeArgs.size() != ctx.fd.typeParams.size())
					throw new IllegalArgumentException("generic type argument count mismatch in call");
				typeBindings = new java.util.HashMap<>();
				for (int j = 0; j < ctx.fd.typeParams.size(); j++) {
					typeBindings.put(ctx.fd.typeParams.get(j), ctx.typeArgs.get(j));
				}
			}
		}
		return typeBindings;
	}

	private static Operand handleExternCall(FunctionCallContext ctx, java.util.Map<String, DeclaredType> typeBindings) {
		if ("createArray".equals(ctx.fname)) {
			return handleCreateArray(ctx, typeBindings);
		}
		if ("print".equals(ctx.fname)) {
			return handlePrint(ctx);
		}
		throw new IllegalArgumentException("unknown extern function: " + ctx.fname);
	}

	private static Operand handleCreateArray(FunctionCallContext ctx, java.util.Map<String, DeclaredType> typeBindings) {
		if (ctx.args.size() != 1)
			throw new IllegalArgumentException("argument count mismatch in extern call");
		Operand lenOp = ctx.args.get(0);
		if (lenOp.isBoolean != null)
			throw new IllegalArgumentException("length must be numeric");
		int cap = lenOp.value.intValue();
		if (cap < 0)
			throw new IllegalArgumentException("invalid array capacity");
		if (ctx.fd.typeParams == null || ctx.fd.typeParams.isEmpty())
			throw new IllegalArgumentException("missing type parameter for createArray");
		String tp = ctx.fd.typeParams.get(0);
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

	private static Operand handlePrint(FunctionCallContext ctx) {
		if (ctx.args.size() != 1)
			throw new IllegalArgumentException("argument count mismatch in extern call");
		Operand a = ctx.args.get(0);
		String out;
		if (a.stringValue != null) {
			out = a.stringValue;
		} else if (a.isBoolean != null) {
			out = a.isBoolean ? "true" : "false";
		} else if (a.value != null) {
			out = a.value.toString();
		} else {
			out = "";
		}
		OutputUtils.appendCapturedOutput(out);
		return new Operand(java.math.BigInteger.ZERO, null, null);
	}

	private static Operand executeUserFunction(Parser parser, FunctionExecutionContext execCtx) {
		FunctionCallContext ctx = execCtx.callCtx;
		Parser p2 = new Parser(ctx.fd.body.bodySource);
		p2.setFunctions(new java.util.HashMap<>(parser.getFunctions()));
		java.util.Map<String, Operand> captured = new java.util.HashMap<>(parser.getLocals());
		captured.putAll(execCtx.fLocals);
		p2.setLocals(captured);
		p2.setMutables(new java.util.HashMap<>(parser.getMutables()));
		p2.setDeclaredTypes(new java.util.HashMap<>(parser.getDeclaredTypes()));
		p2.setAllowReturn(true);

		try {
			Operand res = p2.parseTopLevelBlock();
			if (res == null) {
				res = new Operand(java.math.BigInteger.ZERO, null, null);
			}
			return parser.enforceDeclaredReturn(ctx.fd, res, execCtx.typeBindings);
		} catch (ReturnException re) {
			Operand r = re.value;
			return parser.enforceDeclaredReturn(ctx.fd, r, execCtx.typeBindings);
		}
	}
}

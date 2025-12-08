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
		java.util.List<DeclaredType> typeArgs = new java.util.ArrayList<>();
		int n = parser.getLength();
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == '<') {
			parser.consumeChar();
			parser.skipWhitespace();
			if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != '>') {
				while (true) {
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
					typeArgs.add(dt);
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
		}

		if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != '(') {
			parser.setIndex(start);
			return null;
		}
		parser.consumeChar();
		java.util.List<Operand> args = new java.util.ArrayList<>();
		parser.skipWhitespace();
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != ')') {
			while (true) {
				Operand arg = parser.parseLogicalOr();
				args.add(arg);
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

		FunctionDef fd = parser.getFunctions().get(name);
		if (fd == null) {
			parser.setIndex(start);
			return null;
		}

		return callFunction(parser, name, fd, args, typeArgs);
	}

	private static Operand callFunction(Parser parser, String fname, FunctionDef fd, java.util.List<Operand> args,
			java.util.List<DeclaredType> typeArgs) {
		if (args.size() != fd.signature.paramNames.size())
			throw new IllegalArgumentException("argument count mismatch in function call");

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

		java.util.Map<String, Operand> fLocals = parser.bindFunctionParameters(fd, args, typeBindings);

		if (fd.body == null || fd.body.bodySource == null || fd.body.bodySource.isEmpty()) {
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
		p2.setFunctions(new java.util.HashMap<>(parser.getFunctions()));
		p2.setLocals(new java.util.HashMap<>(fLocals));
		p2.setMutables(new java.util.HashMap<>());
		p2.setDeclaredTypes(new java.util.HashMap<>());
		p2.setAllowReturn(true);

		try {
			Operand res = p2.parseTopLevelBlock();
			if (res == null) {
				res = new Operand(java.math.BigInteger.ZERO, null, null);
			}
			return parser.enforceDeclaredReturn(fd, res, typeBindings);
		} catch (ReturnException re) {
			Operand r = re.value;
			return parser.enforceDeclaredReturn(fd, r, typeBindings);
		}
	}
}

package tuff;

final class IdentifierResolver {
	private IdentifierResolver() {
	}

	static Operand parseIdentifierLookup(Parser parser) {
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
				.matcher(parser.remainingInput());
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = parser.getIndex();
		parser.setIndex(start + name.length());
		parser.skipWhitespace();
		int n = parser.getLength();

		// support struct construction: Name { ... }
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == '{') {
			parser.consumeChar();
			java.util.List<Operand> vals = new java.util.ArrayList<>();
			parser.skipWhitespace();
			if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != '}') {
				while (true) {
					Operand v = parser.parseLogicalOr();
					vals.add(v);
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
			if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != '}')
				throw new IllegalArgumentException("missing '}' in struct literal");
			parser.consumeChar();
			java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
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

		// support module namespace access: name::field
		parser.skipWhitespace();
		if (parser.getIndex() + 1 < n && parser.charAt(parser.getIndex()) == ':'
				&& parser.charAt(parser.getIndex() + 1) == ':') {
			parser.setIndex(parser.getIndex() + 2);
			parser.skipWhitespace();
			java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
					.matcher(parser.remainingInput());
			if (!fm.find())
				throw new IllegalArgumentException("invalid member name in namespace access");
			String fname = fm.group();
			parser.setIndex(parser.getIndex() + fname.length());
			if (!parser.getModules().containsKey(name))
				throw new IllegalArgumentException("unknown module: " + name);
			java.util.Map<String, Operand> ns = parser.getModules().get(name);
			if (ns.containsKey(fname))
				return ns.get(fname);
			throw new IllegalArgumentException("unknown field: " + fname);
		}

		// support member access: name.field
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == '.') {
			parser.consumeChar();
			parser.skipWhitespace();
			java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
					.matcher(parser.remainingInput());
			if (!fm.find())
				throw new IllegalArgumentException("invalid field name in member access");
			String fname = fm.group();
			parser.setIndex(parser.getIndex() + fname.length());
			if (!parser.getLocals().containsKey(name))
				throw new IllegalArgumentException("undefined variable: " + name);
			Operand so = parser.getLocals().get(name);
			if (so.stringValue != null) {
				if ("length".equals(fname)) {
					return new Operand(java.math.BigInteger.valueOf(so.stringValue.length()), null, null);
				}
				throw new IllegalArgumentException("unknown field: " + fname);
			}
			if (so.structFields == null)
				throw new IllegalArgumentException("attempted member access on non-struct: " + name);
			if (!so.structFields.containsKey(fname))
				throw new IllegalArgumentException("unknown field: " + fname);
			return so.structFields.get(fname);
		}

		// support indexing: name[index]
		parser.skipWhitespace();
		if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == '[') {
			parser.consumeChar();
			Operand idxOp = parser.parseLogicalOr();
			parser.skipWhitespace();
			if (parser.getIndex() >= n || parser.charAt(parser.getIndex()) != ']')
				throw new IllegalArgumentException("missing ']' in index expression");
			parser.consumeChar();
			if (!parser.getLocals().containsKey(name))
				throw new IllegalArgumentException("undefined variable: " + name);
			Operand arrOp = parser.getLocals().get(name);
			if (arrOp.stringValue != null) {
				if (idxOp.isBoolean != null)
					throw new IllegalArgumentException("index must be numeric");
				int idx = idxOp.value.intValue();
				if (idx < 0 || idx >= arrOp.stringValue.length())
					throw new IllegalArgumentException("index out of bounds");
				char ch = arrOp.stringValue.charAt(idx);
				return new Operand(String.valueOf(ch), true);
			}
			if (arrOp.elements == null)
				throw new IllegalArgumentException("attempted indexing on non-array: " + name);
			if (idxOp.isBoolean != null)
				throw new IllegalArgumentException("index must be numeric");
			int idx = idxOp.value.intValue();
			if (idx < 0 || idx >= arrOp.elements.size())
				throw new IllegalArgumentException("index out of bounds");
			return arrOp.elements.get(idx);
		}
		if (!parser.getLocals().containsKey(name)) {
			// allow referencing a top-level function as a first-class value
			if (parser.getFunctions().containsKey(name)) {
				FunctionDef fd = parser.getFunctions().get(name);
				return new Operand(fd, name);
			}
			throw new IllegalArgumentException("undefined variable: " + name);
		}
		return parser.getLocals().get(name);
	}

	static Operand parseAssignmentIfPresent(Parser parser) {
		parser.skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
				.matcher(parser.remainingInput());
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = parser.getIndex();
		parser.setIndex(start + name.length());
		parser.skipWhitespace();
		int n = parser.getLength();
		if (parser.getIndex() < n) {
			Operand memberAssign = parseMemberAssignmentIfPresent(parser, name, start);
			if (memberAssign != null)
				return memberAssign;
			Operand indexed = parseIndexedAssignmentIfPresent(parser, name, start);
			if (indexed != null)
				return indexed;
			if (parser.charAt(parser.getIndex()) == '=') {
				parser.consumeChar();
				Operand val = parser.parseLogicalOr();
				new AssignmentUtils(parser.getLocals(), parser.getMutables(), parser.getDeclaredTypes()).assign(name, val);
				return parser.getLocals().get(name);
			}
			if (parser.getIndex() + 1 < n) {
				char op = parser.charAt(parser.getIndex());
				char next = parser.charAt(parser.getIndex() + 1);
				if ((op == '+' || op == '-' || op == '*' || op == '/' || op == '%') && next == '=') {
					parser.setIndex(parser.getIndex() + 2);
					Operand val = parser.parseLogicalOr();
					new AssignmentUtils(parser.getLocals(), parser.getMutables(), parser.getDeclaredTypes()).assignCompound(name,
							op, val);
					return parser.getLocals().get(name);
				}
			}
		}
		parser.setIndex(start);
		return null;
	}

	private static Operand parseIndexedAssignmentIfPresent(Parser parser, String name, int start) {
		parser.skipWhitespace();
		if (parser.getIndex() < parser.getLength() && parser.charAt(parser.getIndex()) == '[') {
			parser.consumeChar();
			Operand idxOp = parser.parseLogicalOr();
			parser.skipWhitespace();
			if (parser.getIndex() >= parser.getLength() || parser.charAt(parser.getIndex()) != ']')
				throw new IllegalArgumentException("missing ']' in index assignment");
			parser.consumeChar();
			parser.skipWhitespace();
			if (parser.getIndex() < parser.getLength() && parser.charAt(parser.getIndex()) == '=') {
				parser.consumeChar();
				Operand val = parser.parseLogicalOr();
				if (idxOp.isBoolean != null)
					throw new IllegalArgumentException("index must be numeric");
				int idx = idxOp.value.intValue();
				new AssignmentUtils(parser.getLocals(), parser.getMutables(), parser.getDeclaredTypes()).assignIndexed(name,
						idx, val);
				Operand arr = parser.getLocals().get(name);
				return arr.elements.get(idx);
			}
			parser.setIndex(start);
			return null;
		}

		return null;
	}

	private static Operand parseMemberAssignmentIfPresent(Parser parser, String name, int start) {
		parser.skipWhitespace();
		if (parser.getIndex() < parser.getLength() && parser.charAt(parser.getIndex()) == '.') {
			parser.consumeChar();
			parser.skipWhitespace();
			java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
					.matcher(parser.remainingInput());
			if (!fm.find()) {
				parser.setIndex(start);
				return null;
			}
			String fname = fm.group();
			parser.setIndex(parser.getIndex() + fname.length());
			parser.skipWhitespace();
			if (parser.getIndex() < parser.getLength() && parser.charAt(parser.getIndex()) == '=') {
				parser.consumeChar();
				Operand val = parser.parseLogicalOr();
				new AssignmentUtils(parser.getLocals(), parser.getMutables(), parser.getDeclaredTypes()).assignField(name,
						fname, val);
				Operand obj = parser.getLocals().get(name);
				return obj.structFields.get(fname);
			}
			parser.setIndex(start);
			return null;
		}
		return null;
	}
}

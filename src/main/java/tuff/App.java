package tuff;

import java.math.BigInteger;
import java.util.HashMap;
import java.util.Map;

public class App {
	public static String compile(String tuffSource) throws CompileException {
		final var tuffAST = parse(tuffSource);
		final var cAST = transform(tuffAST);
		return generate(cAST);
	}

	private static String generate(CNode ast) throws GenerateException {
		if (ast instanceof CProgram p) {
			final var value = p.value();
			final var type = p.type();
			final boolean unsigned = type != null && type.toUpperCase().startsWith("U");
			final var fmt = unsigned ? "%llu" : "%lld";
			final var literalSuffix = unsigned ? "ULL" : "LL";
			// Use BigInteger string for literal; keep sign if present
			final var digitsText = value.toString();
			final var literal = digitsText + literalSuffix;
			final var cast = unsigned ? "(unsigned long long)" : "(long long)";
			return "#include <stdio.h>\n" +
					"int main(void) {\n" +
					"    printf(\"" + fmt + "\", " + cast + literal + ");\n" +
					"    return 0;\n" +
					"}\n";
		}
		throw new GenerateException("Cannot generate", ast);
	}

	private static final Map<String, BigInteger[]> RANGES;

	static {
		final var m = new HashMap<String, BigInteger[]>();
		m.put("U8", new BigInteger[] { BigInteger.ZERO, BigInteger.valueOf(255) });
		m.put("U16", new BigInteger[] { BigInteger.ZERO, BigInteger.valueOf(65535) });
		m.put("U32", new BigInteger[] { BigInteger.ZERO, BigInteger.ONE.shiftLeft(32).subtract(BigInteger.ONE) });
		m.put("U64", new BigInteger[] { BigInteger.ZERO, BigInteger.ONE.shiftLeft(64).subtract(BigInteger.ONE) });
		m.put("I8", new BigInteger[] { BigInteger.valueOf(Byte.MIN_VALUE), BigInteger.valueOf(Byte.MAX_VALUE) });
		m.put("I16", new BigInteger[] { BigInteger.valueOf(Short.MIN_VALUE), BigInteger.valueOf(Short.MAX_VALUE) });
		m.put("I32", new BigInteger[] { BigInteger.valueOf(Integer.MIN_VALUE), BigInteger.valueOf(Integer.MAX_VALUE) });
		m.put("I64", new BigInteger[] { BigInteger.valueOf(Long.MIN_VALUE), BigInteger.valueOf(Long.MAX_VALUE) });
		RANGES = Map.copyOf(m);
	}

	private static CNode transform(TuffNode ast) throws TransformException {
		if (ast instanceof TuffInteger i) {
			final var type = i.type() == null ? "" : i.type().toUpperCase();
			final var v = i.value();
			// Range checks for signed and unsigned sizes
			if (!type.isEmpty()) {
				checkRangeForType(v, type, ast);
			}
			return new CProgram(v, i.type());
		} else if (ast instanceof TuffBinary b) {
			final var leftNode = transform(b.left());
			final var rightNode = transform(b.right());
			if (!(leftNode instanceof CProgram) || !(rightNode instanceof CProgram)) {
				throw new TransformException("Cannot transform: operands did not produce integer programs", ast);
			}
			final var leftProg = (CProgram) leftNode;
			final var rightProg = (CProgram) rightNode;
			return addPrograms(leftProg, rightProg, ast);
		}
		throw new TransformException("Cannot transform", ast);
	}

	private static void checkRangeForType(java.math.BigInteger value, String type, TuffNode ast)
			throws TransformException {
		final var range = RANGES.get(type);
		if (range == null) {
			throw new TransformException("Cannot transform: unknown suffix " + type, ast);
		}
		final var min = range[0];
		final var max = range[1];
		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new TransformException("Cannot transform: value out of range for type " + type, ast);
		}
	}

	private static CProgram addPrograms(CProgram leftProg, CProgram rightProg, TuffNode ast) throws TransformException {
		final var leftType = leftProg.type() == null ? "" : leftProg.type().toUpperCase();
		final var rightType = rightProg.type() == null ? "" : rightProg.type().toUpperCase();

		String resultType;
		if (leftType.isEmpty() && rightType.isEmpty()) {
			resultType = null;
		} else if (leftType.isEmpty()) {
			resultType = rightProg.type();
		} else if (rightType.isEmpty()) {
			resultType = leftProg.type();
		} else if (leftType.equals(rightType)) {
			resultType = leftProg.type();
		} else {
			throw new TransformException("Cannot transform: mismatched operand types " + leftType + " and " + rightType, ast);
		}

		final var resultValue = leftProg.value().add(rightProg.value());
		if (resultType != null && !resultType.isEmpty()) {
			checkRangeForType(resultValue, resultType, ast);
		}
		return new CProgram(resultValue, resultType);
	}

	private static TuffNode parse(String tuffSource) throws ParseException {
		if (tuffSource == null) {
			throw new ParseException("Cannot parse", "null");
		}
		final var s = tuffSource.strip();
		// if it's a binary addition expression (single +), split and parse both sides
		if (s.contains("+")) {
			final var plusIndex = s.indexOf('+');
			final var left = s.substring(0, plusIndex).strip();
			final var right = s.substring(plusIndex + 1).strip();
			if (left.isEmpty() || right.isEmpty()) {
				throw new ParseException("Cannot parse", tuffSource);
			}
			final var leftNode = parse(left);
			final var rightNode = parse(right);
			return new TuffBinary(leftNode, "+", rightNode);
		}
		// allow optional leading sign and suffixes U/I 8/16/32/64 for single integer
		// literals
		if (!s.matches("(?i)-?\\d+(?:u8|u16|u32|u64|i8|i16|i32|i64)?")) {
			throw new ParseException("Cannot parse", tuffSource);
		}
		try {
			final var upper = s.toUpperCase();
			final var possibleSuffixes = new String[] { "U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64" };
			var suffix = "";
			for (String suffixCandidate : possibleSuffixes) {
				if (upper.endsWith(suffixCandidate)) {
					suffix = suffixCandidate;
					break;
				}
			}
			final var digits = suffix.isEmpty() ? s : s.substring(0, s.length() - suffix.length());
			final var value = new BigInteger(digits);
			final var type = suffix;
			return new TuffInteger(value, type);
		} catch (NumberFormatException e) {
			throw new ParseException("Cannot parse", tuffSource);
		}
	}
}

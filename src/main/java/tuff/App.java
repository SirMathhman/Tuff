package tuff;

public class App {
	public static String compile(String tuffSource) throws CompileException {
		final var tuffAST = parse(tuffSource);
		final var cAST = transform(tuffAST);
		return generate(cAST);
	}

	private static String generate(CNode ast) throws GenerateException {
		if (ast instanceof CProgram p) {
			final var value = p.value();
			return "#include <stdio.h>\n" +
					"int main(void) {\n" +
					"    printf(\"%d\", " + value + ");\n" +
					"    return 0;\n" +
					"}\n";
		}
		throw new GenerateException("Cannot generate", ast);
	}

	private static CNode transform(TuffNode ast) throws TransformException {
		if (ast instanceof TuffInteger i) {
			return new CProgram(i.value());
		}
		throw new TransformException("Cannot transform", ast);
	}

	private static TuffNode parse(String tuffSource) throws ParseException {
		if (tuffSource == null) {
			throw new ParseException("Cannot parse", "null");
		}
		final var s = tuffSource.strip();
		// allow unsigned 8-bit suffix U8
		if (!s.matches("(?i)\\d+(?:u8)?")) {
			throw new ParseException("Cannot parse", tuffSource);
		}
		try {
			final var hasU8 = s.toUpperCase().endsWith("U8");
			final var digits = hasU8 ? s.substring(0, s.length() - 2) : s;
			final var value = Integer.parseInt(digits);
			final var type = hasU8 ? "U8" : "";
			return new TuffInteger(value, type);
		} catch (NumberFormatException e) {
			throw new ParseException("Cannot parse", tuffSource);
		}
	}
}

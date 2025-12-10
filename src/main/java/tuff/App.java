package tuff;

public class App {
	public static String compile(String tuffSource) throws CompileException {
		final var tuffAST = parse(tuffSource);
		final var cAST = transform(tuffAST);
		return generate(cAST);
	}

	private static String generate(CNode ast) throws GenerateException {
		throw new GenerateException("Cannot generate", ast);
	}

	private static CNode transform(TuffNode ast) throws TransformException {
		throw new TransformException("Cannot transform", ast);
	}

	private static TuffNode parse(String tuffSource) throws ParseException {
		throw new ParseException("Cannot parse", tuffSource);
	}
}

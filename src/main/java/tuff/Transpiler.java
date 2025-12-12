package tuff;

/**
 * Public entrypoint for Java -> Tuff transpilation.
 *
 * For now this delegates to the legacy implementation in {@link Main}.
 * We will replace the internals with a Java AST -> Tuff AST pipeline
 * incrementally.
 */
public final class Transpiler {
	public String transpile(String javaSource) {
		return new Main().compile(javaSource);
	}
}

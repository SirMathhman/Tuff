package tuff;

public class GenerateException extends CompileException {
	public GenerateException(String message, CNode ast) {
		super(message, ast.display());
	}
}

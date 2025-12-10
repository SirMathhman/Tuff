package tuff;

public class CompileException extends Exception {
	public CompileException(String message, String context) {
		super(message + ": " + context);
	}
}

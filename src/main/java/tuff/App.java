package tuff;

public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	public static String interpret(String input) {
		throw new UnsupportedOperationException("interpret is not implemented");
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}

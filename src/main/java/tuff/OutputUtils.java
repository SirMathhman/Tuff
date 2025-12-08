package tuff;

public final class OutputUtils {
	private static final ThreadLocal<StringBuilder> CAPTURED_OUTPUT = ThreadLocal.withInitial(StringBuilder::new);

	private OutputUtils() {
		// Utility class
	}

	public static void appendCapturedOutput(String s) {
		CAPTURED_OUTPUT.get().append(s);
	}

	public static String getCapturedOutput() {
		return CAPTURED_OUTPUT.get().toString();
	}

	public static void resetCapturedOutput() {
		CAPTURED_OUTPUT.set(new StringBuilder());
	}
}

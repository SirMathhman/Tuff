package tuff;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class ReproduceTest {
	@Test
	void testNestedLambdasFull() {
		String code = "let mut pass = true; " +
				"fn describe(ctx: String, action : () => Void) => { action(); } " +
				"fn it(name: String, perform : () => Void) => { perform(); } " +
				"fn assertTrue(val: Bool) => { if (!val) { pass = false; } }; " +
				"describe(\"desc\", () => { " +
				"  it(\"test\", () => { " +
				"    assertTrue(true); " +
				"  }); " +
				"});";
		App.interpret(code);
	}
}

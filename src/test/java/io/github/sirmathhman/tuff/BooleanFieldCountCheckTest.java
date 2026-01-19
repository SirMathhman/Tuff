package io.github.sirmathhman.tuff;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.puppycrawl.tools.checkstyle.Checker;
import com.puppycrawl.tools.checkstyle.DefaultConfiguration;
import com.puppycrawl.tools.checkstyle.api.AuditEvent;
import com.puppycrawl.tools.checkstyle.api.AuditListener;

import io.github.sirmathhman.tuff.checkstyle.BooleanFieldCountCheck;

public final class BooleanFieldCountCheckTest {
	@Test
	void shouldRejectMoreThanThreeBooleanFields() throws Exception {
		Path file = Path.of("src/test/resources/checkstyle/TooManyBooleanFields.java");
		List<String> messages = new ArrayList<>();
		int errors = runCheck(file, messages);
		assertTrue(errors > 0, "Expected at least one violation");
		assertTrue(messages.stream().anyMatch(m -> m.contains("maximum allowed is 3")),
				"Expected message to mention the max");
	}

	@Test
	void shouldAllowUpToThreeBooleanFields() throws Exception {
		Path file = Path.of("src/test/resources/checkstyle/OkBooleanFields.java");
		List<String> messages = new ArrayList<>();
		int errors = runCheck(file, messages);
		assertEquals(0, errors, "Expected no violations but got: " + messages);
	}

	private static int runCheck(Path file, List<String> messages) throws Exception {
		DefaultConfiguration checkerConfig = new DefaultConfiguration("Checker");
		checkerConfig.addProperty("charset", "UTF-8");

		DefaultConfiguration treeWalker = new DefaultConfiguration("TreeWalker");

		DefaultConfiguration check = new DefaultConfiguration(BooleanFieldCountCheck.class.getName());
		check.addProperty("max", "3");
		treeWalker.addChild(check);
		checkerConfig.addChild(treeWalker);

		Checker checker = new Checker();
		checker.setModuleClassLoader(Thread.currentThread().getContextClassLoader());
		checker.addListener(new CollectingAuditListener(messages));
		checker.configure(checkerConfig);

		try {
			return checker.process(List.of(file.toFile()));
		} finally {
			checker.destroy();
		}
	}

	private static final class CollectingAuditListener implements AuditListener {
		private final List<String> messages;

		private CollectingAuditListener(List<String> messages) {
			this.messages = messages;
		}

		@Override
		public void auditStarted(AuditEvent evt) {
		}

		@Override
		public void auditFinished(AuditEvent evt) {
		}

		@Override
		public void fileStarted(AuditEvent evt) {
		}

		@Override
		public void fileFinished(AuditEvent evt) {
		}

		@Override
		public void addError(AuditEvent evt) {
			messages.add(evt.getMessage());
		}

		@Override
		public void addException(AuditEvent evt, Throwable throwable) {
			messages.add(String.valueOf(throwable));
		}
	}
}

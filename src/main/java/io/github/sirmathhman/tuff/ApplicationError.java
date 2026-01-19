package io.github.sirmathhman.tuff;

public record ApplicationError(Error cause) {
	public String display() {
		return cause.display();
	}
}

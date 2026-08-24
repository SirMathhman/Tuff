package tuff.tuffc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AppTest {

    @Test
    void greetingShouldReturnExpectedValue() {
        assertEquals("Hello, Maven!", App.greeting());
    }
}

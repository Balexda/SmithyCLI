package dev.smithy.fixture;

public final class GreetingServiceTest {
    public static void main(String[] args) {
        GreetingService service = new GreetingService();

        assertEquals("Hello, Smithy!", service.greet("Smithy"));
        assertEquals("yhtimS", service.reverse("Smithy"));
    }

    private static void assertEquals(String expected, String actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError(
                "expected <" + expected + "> but was <" + actual + ">"
            );
        }
    }
}

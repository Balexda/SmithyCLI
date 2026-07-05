package dev.smithy.fixture;

public final class GreetingService {
    public String greet(String name) {
        return "Hello, " + name + "!";
    }

    public String reverse(String value) {
        return value;
    }
}

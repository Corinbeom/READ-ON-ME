package bookapp.bookappback.book.util;

import java.util.Locale;

public final class IsbnNormalizer {

    private IsbnNormalizer() {}

    public static String toIsbn13(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("ISBN 정보가 없습니다.");
        }
        for (String part : raw.split("\\s+")) {
            String token = part.replace("-", "").toUpperCase(Locale.ROOT);
            if (isValid13(token)) {
                return token;
            }
        }
        String isbn10 = validIsbn10(raw);
        if (isbn10 != null) {
            String stem = "978" + isbn10.substring(0, 9);
            int sum = 0;
            for (int i = 0; i < stem.length(); i++) {
                sum += Character.digit(stem.charAt(i), 10) * (i % 2 == 0 ? 1 : 3);
            }
            return stem + (10 - sum % 10) % 10;
        }
        throw new IllegalArgumentException("유효한 ISBN-10 또는 ISBN-13이 없습니다.");
    }

    public static String validIsbn10(String raw) {
        if (raw == null) {
            return null;
        }
        for (String part : raw.split("\\s+")) {
            String token = part.replace("-", "").toUpperCase(Locale.ROOT);
            if (!token.matches("[0-9]{9}[0-9X]")) {
                continue;
            }
            int sum = 0;
            for (int i = 0; i < token.length(); i++) {
                int digit = token.charAt(i) == 'X' ? 10 : Character.digit(token.charAt(i), 10);
                sum += (10 - i) * digit;
            }
            if (sum % 11 == 0) {
                return token;
            }
        }
        return null;
    }

    public static String toIsbn10(String isbn13) {
        if (isbn13 == null || !isbn13.startsWith("978") || !isValid13(isbn13)) {
            return null;
        }
        String stem = isbn13.substring(3, 12);
        int sum = 0;
        for (int i = 0; i < stem.length(); i++) {
            sum += Character.digit(stem.charAt(i), 10) * (10 - i);
        }
        int check = (11 - sum % 11) % 11;
        return stem + (check == 10 ? "X" : check);
    }

    private static boolean isValid13(String token) {
        if (!token.matches("(978|979)[0-9]{10}")) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < token.length(); i++) {
            sum += Character.digit(token.charAt(i), 10) * (i % 2 == 0 ? 1 : 3);
        }
        return sum % 10 == 0;
    }
}

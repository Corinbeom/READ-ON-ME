package bookapp.bookappback.ai.dto;

public record DailyBookChoice(String isbn, String title, String authors, String contents, String topic, String prompt) {}

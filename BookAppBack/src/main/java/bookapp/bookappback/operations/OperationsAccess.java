package bookapp.bookappback.operations;

import bookapp.bookappback.security.UserDetailsImpl;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Set;

@ConfigurationProperties("app.operations")
public record OperationsAccess(Set<Long> adminUserIds) {
    public OperationsAccess {
        adminUserIds = adminUserIds == null ? Set.of() : Set.copyOf(adminUserIds);
    }

    public boolean allows(Object principal) {
        return principal instanceof UserDetailsImpl user && user.getUser().getId() != null
                && adminUserIds.contains(user.getUser().getId());
    }
}

package bookapp.bookappback.security.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ChangePasswordRequest {
    
    @NotBlank(message = "현재 비밀번호는 필수입니다")
    @JsonProperty("current_password")
    private String currentPassword;
    
    @NotBlank(message = "새 비밀번호는 필수입니다")
    @Size(min = 6, max = 20, message = "새 비밀번호는 6-20자 사이여야 합니다")
    @JsonProperty("new_password")
    private String newPassword;

    // Default constructor
    public ChangePasswordRequest() {}

    // Constructor with all fields
    public ChangePasswordRequest(String currentPassword, String newPassword) {
        this.currentPassword = currentPassword;
        this.newPassword = newPassword;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ChangePasswordRequest that = (ChangePasswordRequest) o;
        return java.util.Objects.equals(currentPassword, that.currentPassword) &&
               java.util.Objects.equals(newPassword, that.newPassword);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(currentPassword, newPassword);
    }

    @Override
    public String toString() {
        return "ChangePasswordRequest{" +
                "currentPassword='[PROTECTED]'" +
                ", newPassword='[PROTECTED]'" +
                '}';
    }
}
package bookapp.bookappback.security.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SignInRequest {
    
    @Email(message = "올바른 이메일 형식이 아닙니다")
    @NotBlank(message = "이메일은 필수입니다")
    private String email;
    
    @NotBlank(message = "비밀번호는 필수입니다")
    private String password;

    // Default constructor
    public SignInRequest() {}

    // Constructor with all fields
    public SignInRequest(String email, String password) {
        this.email = email;
        this.password = password;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SignInRequest that = (SignInRequest) o;
        return java.util.Objects.equals(email, that.email) &&
               java.util.Objects.equals(password, that.password);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(email, password);
    }

    @Override
    public String toString() {
        return "SignInRequest{" +
                "email='" + email + '\'' +
                ", password='[PROTECTED]'" +
                '}';
    }
}
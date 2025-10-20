package bookapp.bookappback.security.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SignUpRequest {
    
    @Email(message = "올바른 이메일 형식이 아닙니다")
    @NotBlank(message = "이메일은 필수입니다")
    private String email;
    
    @NotBlank(message = "비밀번호는 필수입니다")
    @Size(min = 6, max = 20, message = "비밀번호는 6-20자 사이여야 합니다")
    private String password;
    
    @NotBlank(message = "닉네임은 필수입니다")
    @Size(min = 2, max = 10, message = "닉네임은 2-10자 사이여야 합니다")
    private String nickname;
    
    @JsonProperty("profile_image")
    private String profileImage;

    // Default constructor
    public SignUpRequest() {}

    // Constructor with all fields
    public SignUpRequest(String email, String password, String nickname, String profileImage) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.profileImage = profileImage;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        SignUpRequest that = (SignUpRequest) o;
        return java.util.Objects.equals(email, that.email) &&
               java.util.Objects.equals(password, that.password) &&
               java.util.Objects.equals(nickname, that.nickname) &&
               java.util.Objects.equals(profileImage, that.profileImage);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(email, password, nickname, profileImage);
    }

    @Override
    public String toString() {
        return "SignUpRequest{" +
                "email='" + email + '\'' +
                ", password='[PROTECTED]'" +
                ", nickname='" + nickname + '\'' +
                ", profileImage='" + profileImage + '\'' +
                '}';
    }
}
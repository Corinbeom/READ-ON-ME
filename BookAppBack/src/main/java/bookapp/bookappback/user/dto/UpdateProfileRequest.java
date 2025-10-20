package bookapp.bookappback.user.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateProfileRequest {
    
    @Size(min = 2, max = 10, message = "닉네임은 2-10자 사이여야 합니다")
    private String nickname;
    
    @JsonProperty("profile_image")
    private String profileImage;

    // Default constructor
    public UpdateProfileRequest() {}

    // Constructor with all fields
    public UpdateProfileRequest(String nickname, String profileImage) {
        this.nickname = nickname;
        this.profileImage = profileImage;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UpdateProfileRequest that = (UpdateProfileRequest) o;
        return java.util.Objects.equals(nickname, that.nickname) &&
               java.util.Objects.equals(profileImage, that.profileImage);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(nickname, profileImage);
    }

    @Override
    public String toString() {
        return "UpdateProfileRequest{" +
                "nickname='" + nickname + '\'' +
                ", profileImage='" + profileImage + '\'' +
                '}';
    }
}
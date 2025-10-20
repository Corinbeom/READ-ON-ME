package bookapp.bookappback.user.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserResponse {
    
    private Long id;
    private String email;
    private String nickname;
    
    @JsonProperty("profile_image")
    private String profileImage;
    
    @JsonProperty("created_at")
    private String createdAt;

    // Default constructor
    public UserResponse() {}

    // Constructor with all fields
    public UserResponse(Long id, String email, String nickname, String profileImage, String createdAt) {
        this.id = id;
        this.email = email;
        this.nickname = nickname;
        this.profileImage = profileImage;
        this.createdAt = createdAt;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UserResponse that = (UserResponse) o;
        return java.util.Objects.equals(id, that.id) &&
               java.util.Objects.equals(email, that.email) &&
               java.util.Objects.equals(nickname, that.nickname) &&
               java.util.Objects.equals(profileImage, that.profileImage) &&
               java.util.Objects.equals(createdAt, that.createdAt);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(id, email, nickname, profileImage, createdAt);
    }

    @Override
    public String toString() {
        return "UserResponse{" +
                "id=" + id +
                ", email='" + email + '\'' +
                ", nickname='" + nickname + '\'' +
                ", profileImage='" + profileImage + '\'' +
                ", createdAt='" + createdAt + '\'' +
                '}';
    }
}
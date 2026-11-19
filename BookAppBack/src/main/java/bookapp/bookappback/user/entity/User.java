
package bookapp.bookappback.user.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(name = User.NICKNAME_CONSTRAINT, columnNames = "nickname"),
        @UniqueConstraint(name = User.KAKAO_ID_CONSTRAINT, columnNames = "kakao_id")
})
@Getter
@Setter
@NoArgsConstructor
public class User {
    public static final String NICKNAME_CONSTRAINT = "users_nickname_key";
    public static final String KAKAO_ID_CONSTRAINT = "users_kakao_id_key";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String email;

    @Column
    private String password;

    @JsonIgnore
    @Column(name = "kakao_id")
    private Long kakaoId;

    @Column(nullable = false)
    private String nickname;

    @Column(name = "profile_image")
    private String profileImage;

    @Column(name = "birth_year")
    private Integer birthYear;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public User(String email, String password, String nickname, String profileImage, Integer birthYear) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.profileImage = profileImage;
        this.birthYear = birthYear;
        this.createdAt = LocalDateTime.now();
    }

    public static User forKakao(long kakaoId, String nickname) {
        User user = new User(null, null, nickname, null, null);
        user.kakaoId = kakaoId;
        return user;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        User user = (User) o;
        return id != null && id.equals(user.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}

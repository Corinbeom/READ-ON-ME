package bookapp.bookappback.security.dto;

import bookapp.bookappback.user.dto.UserResponse;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TokenResponse {
    
    @JsonProperty("access_token")
    private String accessToken;
    
    @JsonProperty("token_type")
    private String tokenType = "Bearer";
    
    @JsonProperty("expires_in")
    private Long expiresIn;
    
    private UserResponse user;

    // Default constructor
    public TokenResponse() {}

    // Constructor with all fields
    public TokenResponse(String accessToken, String tokenType, Long expiresIn, UserResponse user) {
        this.accessToken = accessToken;
        this.tokenType = tokenType;
        this.expiresIn = expiresIn;
        this.user = user;
    }

    // Constructor without tokenType (uses default "Bearer")
    public TokenResponse(String accessToken, Long expiresIn, UserResponse user) {
        this.accessToken = accessToken;
        this.expiresIn = expiresIn;
        this.user = user;
    }


    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TokenResponse that = (TokenResponse) o;
        return java.util.Objects.equals(accessToken, that.accessToken) &&
               java.util.Objects.equals(tokenType, that.tokenType) &&
               java.util.Objects.equals(expiresIn, that.expiresIn) &&
               java.util.Objects.equals(user, that.user);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(accessToken, tokenType, expiresIn, user);
    }

    @Override
    public String toString() {
        return "TokenResponse{" +
                "accessToken='[PROTECTED]'" +
                ", tokenType='" + tokenType + '\'' +
                ", expiresIn=" + expiresIn +
                ", user=" + user +
                '}';
    }
}
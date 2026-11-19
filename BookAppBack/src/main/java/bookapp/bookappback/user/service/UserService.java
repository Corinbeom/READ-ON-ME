package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.security.dto.ChangePasswordRequest;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.security.dto.TokenResponse;
import bookapp.bookappback.user.dto.UpdateProfileRequest;
import bookapp.bookappback.user.dto.UserResponse;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class UserService implements UserDetailsService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        if (!username.startsWith(UserDetailsImpl.KAKAO_SUBJECT_PREFIX)) {
            return userRepository.findByEmail(username).map(UserDetailsImpl::new)
                    .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다"));
        }
        try {
            long id = Long.parseLong(username.substring(UserDetailsImpl.KAKAO_SUBJECT_PREFIX.length()));
            return userRepository.findById(id)
                    .filter(user -> user.getKakaoId() != null && user.getEmail() == null)
                    .map(UserDetailsImpl::new)
                    .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다"));
        } catch (NumberFormatException e) {
            throw new UsernameNotFoundException("사용자를 찾을 수 없습니다");
        }
    }

    public UserResponse signUp(SignUpRequest request) {

        // 이메일 중복 확인
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserExceptions.EmailDuplicateException(request.getEmail());
        }

        // 닉네임 중복 확인
        userRepository.findByNickname(request.getNickname()).ifPresent(u -> {
            throw new UserExceptions.NickNameDuplicateException(request.getNickname());
        });

        User user = new User(
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getNickname(),
                request.getProfileImage(),
                request.getBirthYear()
        );
        userRepository.save(user);

        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImage(),
                user.getBirthYear(),
                user.getCreatedAt().toString()
        );
    }

    @Transactional(readOnly = true)
    public TokenResponse signIn(SignInRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(UserExceptions.InvalidLoginException::new);

        if (user.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new UserExceptions.InvalidLoginException();
        }

        return issueToken(user);
    }

    public TokenResponse signInWithKakao(long kakaoId, String nickname) {
        User user = userRepository.findByKakaoId(kakaoId)
                .orElseGet(() -> userRepository.saveAndFlush(User.forKakao(kakaoId, availableNickname(nickname))));
        return issueToken(user);
    }

    private String availableNickname(String requested) {
        String nickname = requested == null ? "" : requested.replaceAll("[\\p{Cc}\\p{Cf}]", "").strip();
        nickname = limitNickname(nickname, 10);
        if (nickname.codePointCount(0, nickname.length()) < 2) nickname = "갈피독자";
        if (userRepository.findByNickname(nickname).isEmpty()) return nickname;
        return limitNickname(nickname, 3) + "-" + UUID.randomUUID().toString().substring(0, 6);
    }

    private String limitNickname(String nickname, int limit) {
        return nickname.substring(0, nickname.offsetByCodePoints(0, Math.min(limit, nickname.codePointCount(0, nickname.length()))));
    }

    private TokenResponse issueToken(User user) {
        String token = jwtUtil.generateToken(user.getId(), new UserDetailsImpl(user).getUsername());
        return new TokenResponse(token, jwtUtil.getExpirationTimeInSeconds(), toResponse(user));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImage(),
                user.getBirthYear(),
                user.getCreatedAt().toString()
        );
    }

    public UserResponse getUserProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        return toResponse(user);
    }

    public void updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        if (request.getNickname() != null) {
            userRepository.findByNickname(request.getNickname()).ifPresent(existingUser -> {
                if (!existingUser.getId().equals(userId)) {
                    throw new UserExceptions.NickNameDuplicateException(request.getNickname());
                }
            });
            user.setNickname(request.getNickname());
        }

        if (request.getProfileImage() != null) {
            user.setProfileImage(request.getProfileImage());
        }

        userRepository.save(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        if (user.getPassword() == null || !passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new UserExceptions.PasswordMismatchException();
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }
}
